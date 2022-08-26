pub mod dev;

use std::{
    collections::{HashSet, VecDeque},
    fmt::Debug,
};

use anyhow::Result;
use turbo_tasks::{
    primitives::{BoolVc, StringVc},
    ValueToString, ValueToStringVc,
};
use turbo_tasks_fs::FileSystemPathVc;

use crate::{
    asset::{Asset, AssetVc, AssetsVc},
    reference::{AssetReference, AssetReferenceVc, AssetReferencesVc},
    resolve::{ResolveResult, ResolveResultVc},
};

/// A module id, which can be a number or string
#[turbo_tasks::value(shared)]
#[derive(Debug, Clone, Hash)]
#[serde(untagged)]
pub enum ModuleId {
    Number(u32),
    String(String),
}

/// A list of module ids.
#[turbo_tasks::value(transparent, shared)]
pub struct ModuleIds(Vec<ModuleIdVc>);

/// A chunk id, which can be a number or string
#[turbo_tasks::value(shared)]
#[derive(Debug, Clone, Hash)]
pub enum ChunkId {
    Number(u32),
    String(String),
}

/// A context for the chunking that influences the way chunks are created
#[turbo_tasks::value_trait]
pub trait ChunkingContext {
    fn chunk_path(&self, path: FileSystemPathVc, extension: &str) -> FileSystemPathVc;

    fn can_be_in_same_chunk(&self, asset_a: AssetVc, asset_b: AssetVc) -> BoolVc;

    fn asset_path(&self, path: &str) -> FileSystemPathVc;
}

/// An [Asset] that can be converted into a [Chunk].
#[turbo_tasks::value_trait]
pub trait ChunkableAsset: Asset {
    fn as_chunk(&self, context: ChunkingContextVc) -> ChunkVc;
}

#[turbo_tasks::value]
pub struct ChunkGroup {
    entry: ChunkVc,
}

#[turbo_tasks::value(transparent)]
pub struct Chunks(Vec<ChunkVc>);

#[turbo_tasks::value_impl]
impl ChunkGroupVc {
    /// Creates a chunk group from an asset as entrypoint
    #[turbo_tasks::function]
    pub fn from_asset(asset: ChunkableAssetVc, context: ChunkingContextVc) -> Self {
        Self::from_chunk(asset.as_chunk(context))
    }

    /// Creates a chunk group from an chunk as entrypoint
    #[turbo_tasks::function]
    pub fn from_chunk(chunk: ChunkVc) -> Self {
        Self::cell(ChunkGroup { entry: chunk })
    }

    /// Lists all chunks that are in this chunk group.
    /// These chunks need to be loaded to fulfill that chunk group.
    /// All chunks should be loaded in parallel.
    #[turbo_tasks::function]
    pub async fn chunks(self) -> Result<ChunksVc> {
        let mut chunks = HashSet::new();

        let mut queue = vec![self.await?.entry];
        while let Some(chunk) = queue.pop() {
            let chunk = chunk.resolve().await?;
            if chunks.insert(chunk) {
                for r in chunk.references().await?.iter() {
                    if let Some(pc) = ParallelChunkReferenceVc::resolve_from(r).await? {
                        if *pc.is_loaded_in_parallel().await? {
                            let result = r.resolve_reference();
                            for a in result.primary_assets().await?.iter() {
                                if let Some(chunk) = ChunkVc::resolve_from(a).await? {
                                    queue.push(chunk);
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(ChunksVc::cell(chunks.into_iter().collect()))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for ChunkGroup {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "group for {}",
            self.entry.to_string().await?
        )))
    }
}

/// A chunk is one type of asset.
/// It usually contains multiple chunk items.
/// There is an optional trait [ParallelChunkReference] that
/// [AssetReference]s from a [Chunk] can implement.
/// If they implement that and [ParallelChunkReference::is_loaded_in_parallel]
/// returns true, all referenced assets (if they are [Chunk]s) are placed in the
/// same chunk group.
#[turbo_tasks::value_trait]
pub trait Chunk: Asset + ValueToString {}

/// see [Chunk] for explanation
#[turbo_tasks::value_trait]
pub trait ParallelChunkReference: AssetReference {
    fn is_loaded_in_parallel(&self) -> BoolVc;
}

/// An [AssetReference] implementing this trait and returning true for
/// [ChunkableAssetReference::is_chunkable] are considered as potentially
/// chunkable references. When all [Asset]s of such a reference implement
/// [ChunkableAsset] they are placed in [Chunk]s during chunking.
/// They are even potentially placed in the same [Chunk] when a chunk type
/// specific interface is implemented.
#[turbo_tasks::value_trait]
pub trait ChunkableAssetReference: AssetReference {
    fn is_chunkable(&self) -> BoolVc;
}

/// When this trait is implemented by an [AssetReference] the chunks needed are
/// potentially loaded async, as a separate chunk group. If it's not implemented
/// chunks are loaded within the current chunk group
#[turbo_tasks::value_trait]
pub trait AsyncLoadableReference: AssetReference {
    fn is_loaded_async(&self) -> BoolVc;
}

/// A reference to a [Chunk]. Can be loaded in parallel, see [Chunk].
#[turbo_tasks::value]
pub struct ChunkReference {
    chunk: ChunkVc,
    parallel: bool,
}

#[turbo_tasks::value_impl]
impl ChunkReferenceVc {
    #[turbo_tasks::function]
    pub fn new(chunk: ChunkVc) -> Self {
        Self::cell(ChunkReference {
            chunk,
            parallel: false,
        })
    }

    #[turbo_tasks::function]
    pub fn new_parallel(chunk: ChunkVc) -> Self {
        Self::cell(ChunkReference {
            chunk,
            parallel: true,
        })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for ChunkReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        ResolveResult::Single(self.chunk.into(), Vec::new()).into()
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "chunk {}",
            self.chunk.to_string().await?
        )))
    }
}

#[turbo_tasks::value_impl]
impl ParallelChunkReference for ChunkReference {
    #[turbo_tasks::function]
    fn is_loaded_in_parallel(&self) -> BoolVc {
        BoolVc::cell(self.parallel)
    }
}

/// A reference to multiple chunks from a [ChunkGroup]
#[turbo_tasks::value]
pub struct ChunkGroupReference {
    chunk_group: ChunkGroupVc,
}

#[turbo_tasks::value_impl]
impl ChunkGroupReferenceVc {
    #[turbo_tasks::function]
    pub fn new(chunk_group: ChunkGroupVc) -> Self {
        Self::cell(ChunkGroupReference { chunk_group })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for ChunkGroupReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<ResolveResultVc> {
        let set = self
            .chunk_group
            .chunks()
            .await?
            .iter()
            .map(|c| c.as_asset())
            .collect();
        Ok(ResolveResult::Alternatives(set, Vec::new()).into())
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "chunk group {}",
            self.chunk_group.to_string().await?
        )))
    }
}

pub struct ChunkContentResult<I> {
    pub chunk_items: Vec<I>,
    pub chunks: Vec<ChunkVc>,
    pub async_chunk_groups: Vec<ChunkGroupVc>,
    pub external_asset_references: Vec<AssetReferenceVc>,
}

#[async_trait::async_trait]
pub trait FromChunkableAsset: ChunkItem + Sized + Debug {
    async fn from_asset(context: ChunkingContextVc, asset: AssetVc) -> Result<Option<Self>>;
    async fn from_async_asset(
        context: ChunkingContextVc,
        asset: ChunkableAssetVc,
    ) -> Result<Option<(Self, ChunkableAssetVc)>>;
}

pub async fn chunk_content_split<I: FromChunkableAsset>(
    context: ChunkingContextVc,
    entry: AssetVc,
    additional_entries: Option<AssetsVc>,
) -> Result<ChunkContentResult<I>> {
    let mut chunk_items = vec![];
    let mut processed_assets = HashSet::new();
    let mut external_asset_references = Vec::new();
    let mut chunks = Vec::new();
    let mut pieces = Vec::new();

    let mut entries = match additional_entries {
        Some(additional_entries) => additional_entries.await?.clone(),
        None => vec![],
    };
    entries.push(entry);

    for entry in entries {
        chunk_items.push(I::from_asset(context, entry).await?.unwrap());
        for r in entry.references().await?.iter() {
            if let Some(pc) = ChunkableAssetReferenceVc::resolve_from(r).await? {
                if *pc.is_chunkable().await? {
                    pieces.push((r.resolve_reference().primary_assets(), *r));
                    continue;
                }
            }
            external_asset_references.push(*r);
        }
        processed_assets.insert(entry);
    }

    'outer: for (assets, r) in pieces {
        let mut inner_chunks = Vec::new();
        for asset in assets
            .await?
            .iter()
            .filter(|asset| processed_assets.insert(**asset))
        {
            // always make a separate chunk
            if let Some(chunkable_asset) = ChunkableAssetVc::resolve_from(asset).await? {
                let chunk = chunkable_asset.as_chunk(context);
                inner_chunks.push(chunk);
            } else {
                external_asset_references.push(r);
                continue 'outer;
            }
        }
        for chunk in inner_chunks {
            chunks.push(chunk);
        }
    }
    Ok(ChunkContentResult {
        chunk_items,
        chunks,
        async_chunk_groups: Vec::new(),
        external_asset_references,
    })
}
enum ChunkContentWorkItem {
    AssetReferences(AssetReferencesVc),
    Assets(AssetsVc, AssetReferenceVc),
}

pub async fn chunk_content<I: FromChunkableAsset>(
    context: ChunkingContextVc,
    entry: AssetVc,
    additional_entries: Option<AssetsVc>,
) -> Result<Option<ChunkContentResult<I>>> {
    let mut chunk_items = Vec::new();
    let mut processed_assets = HashSet::new();
    let mut chunks = Vec::new();
    let mut async_chunk_groups = Vec::new();
    let mut external_asset_references = Vec::new();
    let mut queue = VecDeque::new();

    let chunk_item = I::from_asset(context, entry).await?.unwrap();
    queue.push_back(ChunkContentWorkItem::AssetReferences(
        chunk_item.references(),
    ));
    chunk_items.push(chunk_item);
    processed_assets.insert(entry);

    if let Some(additional_entries) = additional_entries {
        for entry in &*additional_entries.await? {
            let chunk_item = I::from_asset(context, *entry).await?.unwrap();
            queue.push_back(ChunkContentWorkItem::AssetReferences(
                chunk_item.references(),
            ));
            chunk_items.push(chunk_item);
            processed_assets.insert(*entry);
        }
    }

    'outer: while let Some(item) = queue.pop_front() {
        match item {
            ChunkContentWorkItem::AssetReferences(item) => {
                for r in item.await?.iter() {
                    if let Some(pc) = ChunkableAssetReferenceVc::resolve_from(r).await? {
                        if *pc.is_chunkable().await? {
                            queue.push_back(ChunkContentWorkItem::Assets(
                                r.resolve_reference().primary_assets(),
                                *r,
                            ));
                            continue;
                        }
                    }
                    external_asset_references.push(*r);
                }
            }
            ChunkContentWorkItem::Assets(item, r) => {
                // It's important to temporary store these results in these variables
                // so that we can cancel to complete list of assets by that references together
                // and fallback to an external reference completely
                // The cancellation is at these "continue 'outer;" lines
                let mut inner_chunk_items = Vec::new();
                let mut inner_chunks = Vec::new();
                let mut inner_chunk_groups = Vec::new();
                for asset in item
                    .await?
                    .iter()
                    .filter(|asset| processed_assets.insert(**asset))
                {
                    let asset: &AssetVc = asset;

                    let chunkable_asset = match ChunkableAssetVc::resolve_from(asset).await? {
                        Some(chunkable_asset) => chunkable_asset,
                        _ => {
                            external_asset_references.push(r);
                            continue 'outer;
                        }
                    };

                    let is_async =
                        if let Some(al) = AsyncLoadableReferenceVc::resolve_from(r).await? {
                            *al.is_loaded_async().await?
                        } else {
                            false
                        };
                    if is_async {
                        if let Some((direct_chunk_item, fat_chunk_asset)) =
                            I::from_async_asset(context, chunkable_asset).await?
                        {
                            inner_chunk_items.push(direct_chunk_item);
                            inner_chunk_groups
                                .push(ChunkGroupVc::from_asset(fat_chunk_asset, context));
                            inner_chunk_groups
                                .push(ChunkGroupVc::from_asset(chunkable_asset, context));
                            continue;
                        } else {
                            external_asset_references.push(r);
                            continue 'outer;
                        }
                    }

                    // heuristic for being in the same chunk
                    if *context.can_be_in_same_chunk(entry, *asset).await? {
                        // chunk item, chunk or other asset?
                        if let Some(chunk_item) = I::from_asset(context, *asset).await? {
                            inner_chunk_items.push(chunk_item);
                            continue;
                        }
                    }

                    let chunk = chunkable_asset.as_chunk(context);
                    inner_chunks.push(chunk);
                }

                let prev_chunk_items = chunk_items.len();

                for chunk_item in inner_chunk_items {
                    queue.push_back(ChunkContentWorkItem::AssetReferences(
                        chunk_item.references(),
                    ));
                    chunk_items.push(chunk_item);
                }
                chunks.extend(inner_chunks);
                async_chunk_groups.extend(inner_chunk_groups);

                let chunk_items_count = chunk_items.len();
                if prev_chunk_items != chunk_items_count
                    && chunk_items_count > 5000
                    && prev_chunk_items > 1
                {
                    // Chunk is too large, cancel this algorithm and
                    // restart with splitting from the start
                    return Ok(None);
                }
            }
        }
    }

    Ok(Some(ChunkContentResult {
        chunk_items,
        chunks,
        async_chunk_groups,
        external_asset_references,
    }))
}

#[turbo_tasks::value_trait]
pub trait ChunkItem {
    /// A [ChunkItem] can describe different `references` than its original
    /// [Asset].
    /// TODO(alexkirsz) This should have a default impl that returns empty
    /// references.
    fn references(&self) -> AssetReferencesVc;
}

#[turbo_tasks::value(transparent)]
pub struct ChunkItems(Vec<ChunkItemVc>);
