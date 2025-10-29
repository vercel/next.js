use std::{borrow::Cow, mem::take};

use anyhow::{Result, bail};
use either::Either;
use once_cell::sync::Lazy;
use regex::Regex;
use tracing::Level;
use turbo_tasks::{FxIndexMap, ResolvedVc, TryJoinIterExt, ValueToString};

use crate::chunk::{
    ChunkItem, ChunkItemWithAsyncModuleInfo, ChunkType, ChunkingContext,
    chunking::{ChunkItemOrBatchWithInfo, SplitContext, make_chunk},
};

/// Handle chunk items based on their total size. If the total size is too
/// small, they will be pushed into `remaining`, if possible. If the total size
/// is too large, it will return `false` and the caller should hand of the chunk
/// items to be further split. Otherwise it creates a chunk.
async fn handle_split_group<'l>(
    chunk_items: &mut Vec<&'l ChunkItemOrBatchWithInfo>,
    key: &mut String,
    split_context: &mut SplitContext<'_>,
    remaining: Option<&mut Vec<&'l ChunkItemOrBatchWithInfo>>,
) -> Result<bool> {
    Ok(match (chunk_size(chunk_items), remaining) {
        (ChunkSize::Large, _) => false,
        (ChunkSize::Perfect, _) | (ChunkSize::Small, None) => {
            make_chunk(take(chunk_items), Vec::new(), key, split_context).await?;
            true
        }
        (ChunkSize::Small, Some(remaining)) => {
            remaining.extend(take(chunk_items));
            true
        }
    })
}

/// Expands all batches and ensures that there are only terminal ChunkItems left.
pub async fn expand_batches(
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
                expanded.extend(
                    batch
                        .await?
                        .chunk_items
                        .iter()
                        .map(async |item| {
                            let size = ty.chunk_item_size(
                                *chunking_context,
                                *item.chunk_item,
                                item.async_info.map(|i| *i),
                            );
                            let asset_ident = item.chunk_item.asset_ident().to_string();
                            Ok(ChunkItemOrBatchWithInfo::ChunkItem {
                                chunk_item: item.clone(),
                                size: *size.await?,
                                asset_ident: asset_ident.owned().await?,
                            })
                        })
                        .try_join()
                        .await?,
                );
            }
        }
    }
    Ok(expanded)
}

/// Split chunk items into app code and vendor code. Continues splitting with
/// [package_name_split] if necessary.
#[tracing::instrument(level = Level::TRACE, skip_all, fields(name = display(&name)))]
pub async fn app_vendors_split(
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
        make_chunk(
            chunk_group_specific_chunk_items,
            Vec::new(),
            &mut name,
            split_context,
        )
        .await?;
    }
    let mut remaining = Vec::new();
    let mut key = format!("{name}-app");
    if !handle_split_group(
        &mut app_chunk_items,
        &mut key,
        split_context,
        Some(&mut remaining),
    )
    .await?
    {
        folder_split(app_chunk_items, 0, key.into(), split_context).await?;
    }
    let mut key = format!("{name}-vendors");
    if !handle_split_group(
        &mut vendors_chunk_items,
        &mut key,
        split_context,
        Some(&mut remaining),
    )
    .await?
    {
        package_name_split(vendors_chunk_items, key, split_context).await?;
    }
    if !remaining.is_empty()
        && !handle_split_group(&mut remaining, &mut name, split_context, None).await?
    {
        package_name_split(remaining, name, split_context).await?;
    }
    Ok(())
}

/// Split chunk items by node_modules package name. Continues splitting with
/// [folder_split] if necessary.
#[tracing::instrument(level = Level::TRACE, skip_all, fields(name = display(&name)))]
async fn package_name_split(
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
        if !handle_split_group(&mut list, &mut key, split_context, Some(&mut remaining)).await? {
            folder_split(list, 0, key.into(), split_context).await?;
        }
    }
    if !remaining.is_empty()
        && !handle_split_group(&mut remaining, &mut name, split_context, None).await?
    {
        folder_split(remaining, 0, name.into(), split_context).await?;
    }
    Ok(())
}

/// Split chunk items by folder structure.
#[tracing::instrument(level = Level::TRACE, skip_all, fields(name = display(&name), location))]
async fn folder_split<'l>(
    chunk_items: Vec<&'l ChunkItemOrBatchWithInfo>,
    mut location: usize,
    name: Cow<'_, str>,
    split_context: &mut SplitContext<'_>,
) -> Result<()> {
    let mut map = FxIndexMap::<_, (_, Vec<_>)>::default();
    let mut chunk_items: Either<_, Vec<&'l ChunkItemOrBatchWithInfo>> = Either::Left(chunk_items);
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
                make_chunk(list, Vec::new(), &mut key, split_context).await?;
                return Ok(());
            }
        } else {
            break;
        }
    }
    let mut remaining = Vec::new();
    for (folder_name, (new_location, mut list)) in map {
        let mut key = format!("{name}-{folder_name}");
        if !handle_split_group(&mut list, &mut key, split_context, Some(&mut remaining)).await? {
            if let Some(new_location) = new_location {
                Box::pin(folder_split(
                    list,
                    new_location,
                    Cow::Borrowed(&name),
                    split_context,
                ))
                .await?;
            } else {
                make_chunk(list, Vec::new(), &mut key, split_context).await?;
            }
        }
    }
    if !remaining.is_empty() {
        let ChunkItemOrBatchWithInfo::ChunkItem { asset_ident, .. } = &remaining[0] else {
            bail!("Batch items are not supported");
        };
        let mut key = format!("{}-{}", name, &asset_ident[..location]);
        if !handle_split_group(&mut remaining, &mut key, split_context, None).await? {
            make_chunk(remaining, Vec::new(), &mut key, split_context).await?;
        }
    }
    Ok(())
}

/// Returns `true` if the given `ident` is app code.
fn is_app_code(ident: &str) -> bool {
    !ident.contains("/node_modules/")
}

/// Returns the package name of the given `ident`.
fn package_name(ident: &str) -> &str {
    static PACKAGE_NAME_REGEX: Lazy<Regex> =
        Lazy::new(|| Regex::new(r"/node_modules/((?:@[^/]+/)?[^/]+)").unwrap());
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
