use std::{borrow::Cow, mem::take, sync::LazyLock};

use anyhow::{Result, bail};
use either::Either;
use regex::Regex;
use tracing::Level;
use turbo_tasks::{FxIndexMap, ResolvedVc, ValueToString};

use crate::chunk::{
    ChunkItem, ChunkItemWithAsyncModuleInfo, ChunkType, ChunkingContext,
    chunking::{ChunkItemOrBatchWithInfo, SplitContext, make_chunk},
    parallel_reads,
};

/// Handle chunk items based on their total size. If the total size is too
/// small, they will be pushed into `remaining`, if possible. If the total size
/// is too large, it will return `false` and the caller should hand of the chunk
/// items to be further split. Otherwise it creates a chunk.
///
/// This is a hand-written dual pair (see `dual_fn!` docs) because the `'l` lifetime
/// parameter is not supported by the macro; the bodies must stay identical.
#[cfg(not(feature = "sync"))]
async fn handle_split_group<'l>(
    chunk_items: &mut Vec<&'l ChunkItemOrBatchWithInfo>,
    key: &mut String,
    split_context: &mut SplitContext<'_>,
    remaining: Option<&mut Vec<&'l ChunkItemOrBatchWithInfo>>,
) -> Result<bool> {
    Ok(match (chunk_size(chunk_items), remaining) {
        (ChunkSize::Large, _) => false,
        (ChunkSize::Perfect, _) | (ChunkSize::Small, None) => {
            turbo_tasks::read!(make_chunk(
                take(chunk_items),
                Vec::new(),
                key,
                split_context
            ))?;
            true
        }
        (ChunkSize::Small, Some(remaining)) => {
            remaining.extend(take(chunk_items));
            true
        }
    })
}

/// Sync twin of the async `handle_split_group` above; body identical.
#[cfg(feature = "sync")]
fn handle_split_group<'l>(
    chunk_items: &mut Vec<&'l ChunkItemOrBatchWithInfo>,
    key: &mut String,
    split_context: &mut SplitContext<'_>,
    remaining: Option<&mut Vec<&'l ChunkItemOrBatchWithInfo>>,
) -> Result<bool> {
    Ok(match (chunk_size(chunk_items), remaining) {
        (ChunkSize::Large, _) => false,
        (ChunkSize::Perfect, _) | (ChunkSize::Small, None) => {
            turbo_tasks::read!(make_chunk(
                take(chunk_items),
                Vec::new(),
                key,
                split_context
            ))?;
            true
        }
        (ChunkSize::Small, Some(remaining)) => {
            remaining.extend(take(chunk_items));
            true
        }
    })
}

turbo_tasks::dual_fn! {
/// Expands all batches and ensures that there are only terminal ChunkItems left.
pub fn expand_batches(
    chunk_items: Vec<&ChunkItemOrBatchWithInfo>,
    ty: ResolvedVc<Box<dyn ChunkType>>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
) -> Result<Vec<ChunkItemOrBatchWithInfo>> {
    let mut expanded = Vec::new();
    for item in chunk_items {
        match item {
            ChunkItemOrBatchWithInfo::ChunkItem { .. } => {
                expanded.push(item.clone());
            }
            ChunkItemOrBatchWithInfo::Batch { batch, .. } => {
                expanded.extend(turbo_tasks::read!(parallel_reads(turbo_tasks::read!(batch)?
                    .chunk_items
                    .iter()
                    .map(|item| expand_batch_item(item, ty, chunking_context))))?);
            }
        }
    }
    Ok(expanded)
}
}

turbo_tasks::dual_fn! {
/// Per-item body of [`expand_batches`]: sizes a single batched chunk item and turns it
/// into a terminal [`ChunkItemOrBatchWithInfo::ChunkItem`].
fn expand_batch_item(
    item: &ChunkItemWithAsyncModuleInfo,
    ty: ResolvedVc<Box<dyn ChunkType>>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
) -> Result<ChunkItemOrBatchWithInfo> {
    let size = ty.chunk_item_size(
        *chunking_context,
        *item.chunk_item,
        item.async_info.map(|i| *i),
    );
    let asset_ident = item.chunk_item.asset_ident().to_string();
    Ok(ChunkItemOrBatchWithInfo::ChunkItem {
        chunk_item: *item,
        size: *turbo_tasks::read!(size)?,
        asset_ident: turbo_tasks::read!(asset_ident.owned())?,
    })
}
}

turbo_tasks::dual_fn! {
/// Split chunk items into app code and vendor code. Continues splitting with
/// [package_name_split] if necessary.
#[tracing::instrument(level = Level::TRACE, skip_all, fields(name = display(&name)))]
pub fn app_vendors_split(
    chunk_items: Vec<&'_ ChunkItemOrBatchWithInfo>,
    mut name: String,
    split_context: &mut SplitContext<'_>,
) -> Result<()> {
    let mut chunk_group_specific_chunk_items = Vec::new();
    let mut app_chunk_items = Vec::new();
    let mut vendors_chunk_items = Vec::new();
    for item in chunk_items {
        let ChunkItemOrBatchWithInfo::ChunkItem {
            chunk_item: ChunkItemWithAsyncModuleInfo { module, .. },
            asset_ident,
            ..
        } = &item
        else {
            bail!("Batch items are not supported");
        };
        if module.is_none() {
            // This happens for async module loaders.
            // We want them to be in a separate chunk.
            chunk_group_specific_chunk_items.push(item);
        } else if is_app_code(asset_ident) {
            app_chunk_items.push(item);
        } else {
            vendors_chunk_items.push(item);
        }
    }
    if !chunk_group_specific_chunk_items.is_empty() {
        let mut name = format!("{name}-specific");
        turbo_tasks::read!(make_chunk(
            chunk_group_specific_chunk_items,
            Vec::new(),
            &mut name,
            split_context,
        ))?;
    }
    let mut remaining = Vec::new();
    let mut key = format!("{name}-app");
    if !turbo_tasks::read!(handle_split_group(
        &mut app_chunk_items,
        &mut key,
        split_context,
        Some(&mut remaining),
    ))?
    {
        turbo_tasks::read!(folder_split(app_chunk_items, 0, key.into(), split_context))?;
    }
    let mut key = format!("{name}-vendors");
    if !turbo_tasks::read!(handle_split_group(
        &mut vendors_chunk_items,
        &mut key,
        split_context,
        Some(&mut remaining),
    ))?
    {
        turbo_tasks::read!(package_name_split(vendors_chunk_items, key, split_context))?;
    }
    if !remaining.is_empty()
        && !turbo_tasks::read!(handle_split_group(&mut remaining, &mut name, split_context, None))?
    {
        turbo_tasks::read!(package_name_split(remaining, name, split_context))?;
    }
    Ok(())
}
}

turbo_tasks::dual_fn! {
/// Split chunk items by node_modules package name. Continues splitting with
/// [folder_split] if necessary.
#[tracing::instrument(level = Level::TRACE, skip_all, fields(name = display(&name)))]
fn package_name_split(
    chunk_items: Vec<&'_ ChunkItemOrBatchWithInfo>,
    mut name: String,
    split_context: &mut SplitContext<'_>,
) -> Result<()> {
    let mut map = FxIndexMap::<_, Vec<_>>::default();
    for item in chunk_items {
        let ChunkItemOrBatchWithInfo::ChunkItem { asset_ident, .. } = &item else {
            bail!("Batch items are not supported");
        };
        let package_name = package_name(asset_ident);
        if let Some(list) = map.get_mut(package_name) {
            list.push(item);
        } else {
            map.insert(package_name.to_string(), vec![item]);
        }
    }
    let mut remaining = Vec::new();
    for (package_name, mut list) in map {
        let mut key = format!("{name}-{package_name}");
        if !turbo_tasks::read!(handle_split_group(&mut list, &mut key, split_context, Some(&mut remaining)))? {
            turbo_tasks::read!(folder_split(list, 0, key.into(), split_context))?;
        }
    }
    if !remaining.is_empty()
        && !turbo_tasks::read!(handle_split_group(&mut remaining, &mut name, split_context, None))?
    {
        turbo_tasks::read!(folder_split(remaining, 0, name.into(), split_context))?;
    }
    Ok(())
}
}

turbo_tasks::dual_fn! {
/// Split chunk items by folder structure.
#[tracing::instrument(level = Level::TRACE, skip_all, fields(name = display(&name), location))]
fn folder_split(
    chunk_items: Vec<&ChunkItemOrBatchWithInfo>,
    mut location: usize,
    name: Cow<'_, str>,
    split_context: &mut SplitContext<'_>,
) -> Result<()> {
    let mut map = FxIndexMap::<_, (_, Vec<_>)>::default();
    let mut chunk_items: Either<_, Vec<&ChunkItemOrBatchWithInfo>> = Either::Left(chunk_items);
    loop {
        let iter = match chunk_items {
            Either::Left(iter) => Either::Left(iter.into_iter()),
            Either::Right(list) => Either::Right(list.into_iter()),
        };
        for item in iter {
            let ChunkItemOrBatchWithInfo::ChunkItem { asset_ident, .. } = &item else {
                bail!("Batch items are not supported");
            };
            let (folder_name, new_location) = folder_name(asset_ident, location);
            if let Some((_, list)) = map.get_mut(folder_name) {
                list.push(item);
            } else {
                map.insert(folder_name.to_string(), (new_location, vec![item]));
            }
        }
        if map.len() == 1 {
            // shortcut
            let (folder_name, (new_location, list)) = map.into_iter().next().unwrap();
            if let Some(new_location) = new_location {
                chunk_items = Either::Right(list);
                location = new_location;
                map = FxIndexMap::default();
                continue;
            } else {
                let mut key = format!("{name}-{folder_name}");
                turbo_tasks::read!(make_chunk(list, Vec::new(), &mut key, split_context))?;
                return Ok(());
            }
        } else {
            break;
        }
    }
    let mut remaining = Vec::new();
    for (folder_name, (new_location, mut list)) in map {
        let mut key = format!("{name}-{folder_name}");
        if !turbo_tasks::read!(handle_split_group(&mut list, &mut key, split_context, Some(&mut remaining)))? {
            if let Some(new_location) = new_location {
                // Recursion: the async build must box the recursive future; the sync
                // build recurses directly (plain call, no boxing).
                #[cfg(not(feature = "sync"))]
                turbo_tasks::read!(Box::pin(folder_split(
                    list,
                    new_location,
                    Cow::Borrowed(&name),
                    split_context,
                )))?;
                #[cfg(feature = "sync")]
                folder_split(list, new_location, Cow::Borrowed(&name), split_context)?;
            } else {
                turbo_tasks::read!(make_chunk(list, Vec::new(), &mut key, split_context))?;
            }
        }
    }
    if !remaining.is_empty() {
        let ChunkItemOrBatchWithInfo::ChunkItem { asset_ident, .. } = &remaining[0] else {
            bail!("Batch items are not supported");
        };
        let mut key = format!("{}-{}", name, &asset_ident[..location]);
        if !turbo_tasks::read!(handle_split_group(&mut remaining, &mut key, split_context, None))? {
            turbo_tasks::read!(make_chunk(remaining, Vec::new(), &mut key, split_context))?;
        }
    }
    Ok(())
}
}

/// Returns `true` if the given `ident` is app code.
fn is_app_code(ident: &str) -> bool {
    !ident.contains("/node_modules/")
}

/// Returns the package name of the given `ident`.
fn package_name(ident: &str) -> &str {
    static PACKAGE_NAME_REGEX: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"/node_modules/((?:@[^/]+/)?[^/]+)").unwrap());
    if let Some(result) = PACKAGE_NAME_REGEX.find_iter(ident).last() {
        &result.as_str()["/node_modules/".len()..]
    } else {
        ""
    }
}

/// Returns the folder name at the given `location` of the given `ident`. Also
/// returns the next folder name location if any.
fn folder_name(ident: &str, location: usize) -> (&str, Option<usize>) {
    if let Some(offset) = ident[location..].find('/') {
        let new_location = location + offset + 1;
        (&ident[..new_location], Some(new_location))
    } else {
        (ident, None)
    }
}

const LARGE_CHUNK: usize = 1_000_000;
const SMALL_CHUNK: usize = 100_000;

enum ChunkSize {
    Large,
    Perfect,
    Small,
}

/// Determines the total size of the passed chunk items. Returns too small, too
/// large or perfect fit.
fn chunk_size(chunk_items: &[&ChunkItemOrBatchWithInfo]) -> ChunkSize {
    let mut total_size = 0;
    for item in chunk_items {
        total_size += item.size();
    }
    if total_size >= LARGE_CHUNK {
        ChunkSize::Large
    } else if total_size > SMALL_CHUNK {
        ChunkSize::Perfect
    } else {
        ChunkSize::Small
    }
}
