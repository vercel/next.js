pub mod dev;
pub mod optimize;

use std::{collections::VecDeque, fmt::Debug};

use anyhow::{anyhow, Result};
use indexmap::IndexSet;
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    debug::ValueDebugFormat,
    primitives::{BoolVc, StringVc},
    trace::TraceRawVcs,
    ValueToString, ValueToStringVc,
};
use turbo_tasks_fs::FileSystemPathVc;
use turbo_tasks_hash::DeterministicHash;

use self::optimize::optimize;
use crate::{
    asset::{Asset, AssetVc, AssetsVc},
    reference::{AssetReference, AssetReferenceVc, AssetReferencesVc},
    resolve::{ResolveResult, ResolveResultVc},
};

/// A module id, which can be a number or string
#[turbo_tasks::value(shared)]
#[derive(Debug, Clone, Hash, DeterministicHash)]
#[serde(untagged)]
pub enum ModuleId {
    Number(u32),
    String(String),
}

/// A list of module ids.
#[turbo_tasks::value(transparent, shared)]
pub struct ModuleIds(Vec<ModuleIdVc>);

/// A context for the chunking that influences the way chunks are created
#[turbo_tasks::value_trait]
pub trait ChunkingContext {
    fn output_root(&self) -> FileSystemPathVc;

    fn chunk_path(&self, path: FileSystemPathVc, extension: &str) -> FileSystemPathVc;

    fn can_be_in_same_chunk(&self, asset_a: AssetVc, asset_b: AssetVc) -> BoolVc;

    fn asset_path(&self, content_hash: &str, extension: &str) -> FileSystemPathVc;

    fn is_hot_module_replacement_enabled(&self) -> BoolVc {
        BoolVc::cell(false)
    }

    fn layer(&self) -> StringVc {
        StringVc::cell("".to_string())
    }

    fn with_layer(&self, layer: &str) -> ChunkingContextVc;
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
        let mut chunks = IndexSet::new();

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

        let chunks = ChunksVc::cell(chunks.into_iter().collect());
        let chunks = optimize(chunks, self);

        Ok(chunks)
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
pub trait ParallelChunkReference: AssetReference + ValueToString {
    fn is_loaded_in_parallel(&self) -> BoolVc;
}

/// Specifies how a chunk interacts with other chunks when building a chunk
/// group
#[derive(Copy, Clone, TraceRawVcs, Serialize, Deserialize, Eq, PartialEq, ValueDebugFormat)]
pub enum ChunkingType {
    /// Asset is always placed into the referencing chunk and loaded with it.
    Placed,
    /// A heuristic determines if the asset is placed into the referencing chunk
    /// or in a separate chunk that is loaded in parallel.
    PlacedOrParallel,
    /// Asset is always placed in a separate chunk that is loaded in parallel.
    Parallel,
    /// Asset is placed in a separate chunk group that is referenced from the
    /// referencing chunk group, but not loaded.
    /// Note: Separate chunks need to be loaded by something external to current
    /// reference.
    Separate,
    /// A async loader is placed into the referencing chunk and loads the
    /// separate chunk group in which the asset is placed.
    SeparateAsync,
}

impl Default for ChunkingType {
    fn default() -> Self {
        ChunkingType::PlacedOrParallel
    }
}

#[turbo_tasks::value(transparent)]
pub struct ChunkingTypeOption(Option<ChunkingType>);

/// An [AssetReference] implementing this trait and returning true for
/// [ChunkableAssetReference::is_chunkable] are considered as potentially
/// chunkable references. When all [Asset]s of such a reference implement
/// [ChunkableAsset] they are placed in [Chunk]s during chunking.
/// They are even potentially placed in the same [Chunk] when a chunk type
/// specific interface is implemented.
#[turbo_tasks::value_trait]
pub trait ChunkableAssetReference: AssetReference + ValueToString {
    fn chunking_type(&self, _context: ChunkingContextVc) -> ChunkingTypeOptionVc {
        ChunkingTypeOptionVc::cell(Some(ChunkingType::default()))
    }
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
}

#[turbo_tasks::value_impl]
impl ValueToString for ChunkReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
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
}

#[turbo_tasks::value_impl]
impl ValueToString for ChunkGroupReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
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
    chunk_content_internal(context, entry, additional_entries, true)
        .await
        .map(|o| o.unwrap())
}

pub async fn chunk_content<I: FromChunkableAsset>(
    context: ChunkingContextVc,
    entry: AssetVc,
    additional_entries: Option<AssetsVc>,
) -> Result<Option<ChunkContentResult<I>>> {
    chunk_content_internal(context, entry, additional_entries, false).await
}

enum ChunkContentWorkItem {
    AssetReferences(AssetReferencesVc),
    Assets {
        assets: AssetsVc,
        reference: AssetReferenceVc,
        chunking_type: ChunkingType,
    },
}

async fn chunk_content_internal<I: FromChunkableAsset>(
    context: ChunkingContextVc,
    entry: AssetVc,
    additional_entries: Option<AssetsVc>,
    split: bool,
) -> Result<Option<ChunkContentResult<I>>> {
    let mut chunk_items = Vec::new();
    let mut processed_assets = IndexSet::new();
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
                        if let Some(chunking_type) = *pc.chunking_type(context).await? {
                            queue.push_back(ChunkContentWorkItem::Assets {
                                assets: r.resolve_reference().primary_assets(),
                                reference: *r,
                                chunking_type,
                            });
                            continue;
                        }
                    }
                    external_asset_references.push(*r);
                }
            }
            ChunkContentWorkItem::Assets {
                assets,
                reference,
                chunking_type,
            } => {
                // It's important to temporary store these results in these variables
                // so that we can cancel to complete list of assets by that references together
                // and fallback to an external reference completely
                // The cancellation is at these "continue 'outer;" lines

                // Chunk items that are placed into the current chunk
                let mut inner_chunk_items = Vec::new();

                // Chunks that are loaded in parallel to the current chunk
                let mut inner_chunks = Vec::new();

                // Chunk groups that are referenced from the current chunk, but
                // not loaded in parallel
                let mut inner_chunk_groups = Vec::new();

                for asset in assets
                    .await?
                    .iter()
                    .filter(|asset| processed_assets.insert(**asset))
                {
                    let asset: &AssetVc = asset;

                    let chunkable_asset = match ChunkableAssetVc::resolve_from(asset).await? {
                        Some(chunkable_asset) => chunkable_asset,
                        _ => {
                            external_asset_references.push(reference);
                            continue 'outer;
                        }
                    };

                    match chunking_type {
                        ChunkingType::Placed => {
                            if let Some(chunk_item) = I::from_asset(context, *asset).await? {
                                inner_chunk_items.push(chunk_item);
                            } else {
                                return Err(anyhow!(
                                    "Asset {} was requested to be placed into the same chunk, but \
                                     this wasn't possible",
                                    asset.path().to_string().await?
                                ));
                            }
                        }
                        ChunkingType::Parallel => {
                            let chunk = chunkable_asset.as_chunk(context);
                            inner_chunks.push(chunk);
                        }
                        ChunkingType::PlacedOrParallel => {
                            // heuristic for being in the same chunk
                            if !split && *context.can_be_in_same_chunk(entry, *asset).await? {
                                // chunk item, chunk or other asset?
                                if let Some(chunk_item) = I::from_asset(context, *asset).await? {
                                    inner_chunk_items.push(chunk_item);
                                    continue;
                                }
                            }

                            let chunk = chunkable_asset.as_chunk(context);
                            inner_chunks.push(chunk);
                        }
                        ChunkingType::Separate => {
                            inner_chunk_groups
                                .push(ChunkGroupVc::from_asset(chunkable_asset, context));
                        }
                        ChunkingType::SeparateAsync => {
                            if let Some((manifest_loader_item, manifest_chunk)) =
                                I::from_async_asset(context, chunkable_asset).await?
                            {
                                inner_chunk_items.push(manifest_loader_item);
                                inner_chunk_groups
                                    .push(ChunkGroupVc::from_asset(manifest_chunk, context));
                                inner_chunk_groups
                                    .push(ChunkGroupVc::from_asset(chunkable_asset, context));
                            } else {
                                external_asset_references.push(reference);
                                continue 'outer;
                            }
                        }
                    }
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

                // Make sure the chunk doesn't become too large.
                // This will hurt performance in many aspects.
                let chunk_items_count = chunk_items.len();
                if !split
                    && prev_chunk_items != chunk_items_count
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
