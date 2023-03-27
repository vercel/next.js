pub mod availability_info;
pub mod available_assets;
pub mod chunk_in_group;
pub(crate) mod list;
pub mod optimize;

use std::{
    collections::HashSet,
    fmt::{Debug, Display},
    future::Future,
    marker::PhantomData,
};

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    debug::ValueDebugFormat,
    graph::{
        GraphTraversal, GraphTraversalResult, ReverseTopological, SkipDuplicates, Visit,
        VisitControlFlow,
    },
    primitives::{BoolVc, StringVc},
    trace::TraceRawVcs,
    TryJoinIterExt, Value, ValueToString, ValueToStringVc,
};
use turbo_tasks_fs::FileSystemPathVc;
use turbo_tasks_hash::DeterministicHash;

pub use self::list::reference::{ChunkListReference, ChunkListReferenceVc};
use self::{
    availability_info::AvailabilityInfo, chunk_in_group::ChunkInGroupVc, optimize::optimize,
};
use crate::{
    asset::{Asset, AssetVc, AssetsVc},
    environment::EnvironmentVc,
    ident::AssetIdentVc,
    reference::{AssetReference, AssetReferenceVc, AssetReferencesVc},
    resolve::{PrimaryResolveResult, ResolveResult, ResolveResultVc},
};

/// A module id, which can be a number or string
#[turbo_tasks::value(shared)]
#[derive(Debug, Clone, Hash, Ord, PartialOrd, DeterministicHash)]
#[serde(untagged)]
pub enum ModuleId {
    Number(u32),
    String(String),
}

impl Display for ModuleId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ModuleId::Number(i) => write!(f, "{}", i),
            ModuleId::String(s) => write!(f, "{}", s),
        }
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for ModuleId {
    #[turbo_tasks::function]
    fn to_string(&self) -> StringVc {
        StringVc::cell(self.to_string())
    }
}

impl ModuleId {
    pub fn parse(id: &str) -> Result<ModuleId> {
        Ok(match id.parse::<u32>() {
            Ok(i) => ModuleId::Number(i),
            Err(_) => ModuleId::String(id.to_string()),
        })
    }
}

/// A list of module ids.
#[turbo_tasks::value(transparent, shared)]
pub struct ModuleIds(Vec<ModuleIdVc>);

/// A context for the chunking that influences the way chunks are created
#[turbo_tasks::value_trait]
pub trait ChunkingContext {
    fn context_path(&self) -> FileSystemPathVc;
    fn output_root(&self) -> FileSystemPathVc;

    // TODO remove this, a chunking context should not be bound to a specific
    // environment since this can change due to transitions in the module graph
    fn environment(&self) -> EnvironmentVc;

    fn chunk_path(&self, ident: AssetIdentVc, extension: &str) -> FileSystemPathVc;

    /// Returns the path to the chunk list file for the given unoptimized entry
    /// chunk path.
    fn chunk_list_path(&self, entry_chunk_path: FileSystemPathVc) -> FileSystemPathVc;

    /// Reference Source Map Assets for chunks
    fn reference_chunk_source_maps(&self, chunk: ChunkVc) -> BoolVc;

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
    fn as_chunk(
        &self,
        context: ChunkingContextVc,
        availability_info: Value<AvailabilityInfo>,
    ) -> ChunkVc;
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
    pub fn from_asset(
        asset: ChunkableAssetVc,
        context: ChunkingContextVc,
        availability_info: Value<AvailabilityInfo>,
    ) -> Self {
        Self::from_chunk(asset.as_chunk(context, availability_info))
    }

    /// Creates a chunk group from an chunk as entrypoint
    #[turbo_tasks::function]
    pub fn from_chunk(chunk: ChunkVc) -> Self {
        Self::cell(ChunkGroup { entry: chunk })
    }

    /// Returns the entry chunk of this chunk group.
    #[turbo_tasks::function]
    pub async fn entry(self) -> Result<ChunkVc> {
        Ok(self.await?.entry)
    }

    /// Returns the chunk list path for this chunk group.
    #[turbo_tasks::function]
    pub async fn chunk_list_path(self) -> Result<FileSystemPathVc> {
        let this = self.await?;
        Ok(this
            .entry
            .chunking_context()
            .chunk_list_path(this.entry.ident().path()))
    }

    /// Lists all chunks that are in this chunk group.
    /// These chunks need to be loaded to fulfill that chunk group.
    /// All chunks should be loaded in parallel.
    #[turbo_tasks::function]
    pub async fn chunks(self) -> Result<ChunksVc> {
        let chunks: Vec<_> = GraphTraversal::<SkipDuplicates<ReverseTopological<_>, _>>::visit(
            [self.await?.entry],
            get_chunk_children,
        )
        .await
        .completed()?
        .into_inner()
        .into_iter()
        .collect();

        let chunks = ChunksVc::cell(chunks);
        let chunks = optimize(chunks, self);
        let chunks = ChunksVc::cell(
            chunks
                .await?
                .iter()
                .map(|&chunk| chunk.in_group(self))
                .collect(),
        );

        Ok(chunks)
    }
}

/// Computes the list of all chunk children of a given chunk.
async fn get_chunk_children(parent: ChunkVc) -> Result<impl Iterator<Item = ChunkVc> + Send> {
    Ok(parent
        .references()
        .await?
        .iter()
        .copied()
        .map(reference_to_chunks)
        .try_join()
        .await?
        .into_iter()
        .flatten())
}

/// Get all parallel chunks from a parallel chunk reference.
async fn reference_to_chunks(r: AssetReferenceVc) -> Result<impl Iterator<Item = ChunkVc> + Send> {
    let mut result = Vec::new();
    if let Some(pc) = ParallelChunkReferenceVc::resolve_from(r).await? {
        if *pc.is_loaded_in_parallel().await? {
            result = r
                .resolve_reference()
                .await?
                .primary
                .iter()
                .map(|r| async move {
                    Ok(if let PrimaryResolveResult::Asset(a) = r {
                        ChunkVc::resolve_from(a).await?
                    } else {
                        None
                    })
                })
                .try_join()
                .await?;
        }
    }
    Ok(result.into_iter().flatten())
}

#[turbo_tasks::value_impl]
impl ValueToString for ChunkGroup {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "group for {}",
            self.entry.path().to_string().await?
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
pub trait Chunk: Asset {
    fn chunking_context(&self) -> ChunkingContextVc;
    // TODO Once output assets have their own trait, this path() method will move
    // into that trait and ident() will be removed from that. Assets on the
    // output-level only have a path and no complex ident.
    /// The path of the chunk.
    fn path(&self) -> FileSystemPathVc {
        self.ident().path()
    }
    /// Returns a variant of the chunk which is placed in a certain chunk group.
    /// Should return the same chunk type.
    fn in_group(&self, _chunk_group: ChunkGroupVc) -> ChunkVc {
        ChunkInGroupVc::new(*self).into()
    }
}

/// see [Chunk] for explanation
#[turbo_tasks::value_trait]
pub trait ParallelChunkReference: AssetReference + ValueToString {
    fn is_loaded_in_parallel(&self) -> BoolVc;
}

/// Specifies how a chunk interacts with other chunks when building a chunk
/// group
#[derive(
    Copy, Default, Clone, Hash, TraceRawVcs, Serialize, Deserialize, Eq, PartialEq, ValueDebugFormat,
)]
pub enum ChunkingType {
    /// Asset is always placed into the referencing chunk and loaded with it.
    Placed,
    /// A heuristic determines if the asset is placed into the referencing chunk
    /// or in a separate chunk that is loaded in parallel.
    #[default]
    PlacedOrParallel,
    /// Asset is always placed in a separate chunk that is loaded in parallel.
    Parallel,
    /// Asset is always placed in a separate chunk that is loaded in parallel.
    /// Referenced asset will not inherit the available modules, but form a
    /// new availability root.
    IsolatedParallel,
    /// Asset is placed in a separate chunk group that is referenced from the
    /// referencing chunk group, but not loaded.
    /// Note: Separate chunks need to be loaded by something external to current
    /// reference.
    Separate,
    /// An async loader is placed into the referencing chunk and loads the
    /// separate chunk group in which the asset is placed.
    SeparateAsync,
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
    fn chunking_type(&self) -> ChunkingTypeOptionVc {
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
        ResolveResult::asset(self.chunk.into()).into()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for ChunkReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "chunk {}",
            self.chunk.ident().to_string().await?
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
        Ok(ResolveResult::assets(set).into())
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
    pub availability_info: AvailabilityInfo,
}

#[async_trait::async_trait]
pub trait FromChunkableAsset: ChunkItem + Sized + Debug {
    async fn from_asset(context: ChunkingContextVc, asset: AssetVc) -> Result<Option<Self>>;
    async fn from_async_asset(
        context: ChunkingContextVc,
        asset: ChunkableAssetVc,
        availability_info: Value<AvailabilityInfo>,
    ) -> Result<Option<Self>>;
}

pub async fn chunk_content_split<I>(
    context: ChunkingContextVc,
    entry: AssetVc,
    additional_entries: Option<AssetsVc>,
    availability_info: Value<AvailabilityInfo>,
) -> Result<ChunkContentResult<I>>
where
    I: FromChunkableAsset + Eq + std::hash::Hash + Clone,
{
    chunk_content_internal_parallel(context, entry, additional_entries, availability_info, true)
        .await
        .map(|o| o.unwrap())
}

pub async fn chunk_content<I>(
    context: ChunkingContextVc,
    entry: AssetVc,
    additional_entries: Option<AssetsVc>,
    availability_info: Value<AvailabilityInfo>,
) -> Result<Option<ChunkContentResult<I>>>
where
    I: FromChunkableAsset + Eq + std::hash::Hash + Clone,
{
    chunk_content_internal_parallel(context, entry, additional_entries, availability_info, false)
        .await
}

#[derive(Eq, PartialEq, Clone, Hash)]
enum ChunkContentGraphNode<I> {
    // Chunk items that are placed into the current chunk
    ChunkItem(I),
    // Asset that is already available and doesn't need to be included
    AvailableAsset(AssetVc),
    // Chunks that are loaded in parallel to the current chunk
    Chunk(ChunkVc),
    // Chunk groups that are referenced from the current chunk, but
    // not loaded in parallel
    AsyncChunkGroup(ChunkGroupVc),
    ExternalAssetReference(AssetReferenceVc),
}

#[derive(Clone, Copy)]
struct ChunkContentContext {
    chunking_context: ChunkingContextVc,
    entry: AssetVc,
    availability_info: Value<AvailabilityInfo>,
    split: bool,
}

async fn reference_to_graph_nodes<I>(
    context: ChunkContentContext,
    reference: AssetReferenceVc,
) -> Result<Vec<(Option<(AssetVc, ChunkingType)>, ChunkContentGraphNode<I>)>>
where
    I: FromChunkableAsset + Eq + std::hash::Hash + Clone,
{
    let Some(chunkable_asset_reference) = ChunkableAssetReferenceVc::resolve_from(reference).await? else {
        return Ok(vec![(None, ChunkContentGraphNode::ExternalAssetReference(reference))]);
    };

    let Some(chunking_type) = *chunkable_asset_reference.chunking_type().await? else {
        return Ok(vec![(None, ChunkContentGraphNode::ExternalAssetReference(reference))]);
    };

    let result = reference.resolve_reference().await?;

    let assets = result.primary.iter().filter_map({
        |result| {
            if let PrimaryResolveResult::Asset(asset) = *result {
                return Some(asset);
            }
            None
        }
    });

    let mut graph_nodes = vec![];

    for asset in assets {
        if let Some(available_assets) = context.availability_info.available_assets() {
            if *available_assets.includes(asset).await? {
                graph_nodes.push((
                    Some((asset, chunking_type)),
                    ChunkContentGraphNode::AvailableAsset(asset),
                ));
                continue;
            }
        }

        let chunkable_asset = match ChunkableAssetVc::resolve_from(asset).await? {
            Some(chunkable_asset) => chunkable_asset,
            _ => {
                return Ok(vec![(
                    None,
                    ChunkContentGraphNode::ExternalAssetReference(reference),
                )]);
            }
        };

        match chunking_type {
            ChunkingType::Placed => {
                if let Some(chunk_item) = I::from_asset(context.chunking_context, asset).await? {
                    graph_nodes.push((
                        Some((asset, chunking_type)),
                        ChunkContentGraphNode::ChunkItem(chunk_item),
                    ));
                } else {
                    return Err(anyhow!(
                        "Asset {} was requested to be placed into the  same chunk, but this \
                         wasn't possible",
                        asset.ident().to_string().await?
                    ));
                }
            }
            ChunkingType::Parallel => {
                let chunk =
                    chunkable_asset.as_chunk(context.chunking_context, context.availability_info);
                graph_nodes.push((
                    Some((asset, chunking_type)),
                    ChunkContentGraphNode::Chunk(chunk),
                ));
            }
            ChunkingType::IsolatedParallel => {
                let chunk = chunkable_asset.as_chunk(
                    context.chunking_context,
                    Value::new(AvailabilityInfo::Root {
                        current_availability_root: chunkable_asset.into(),
                    }),
                );
                graph_nodes.push((
                    Some((asset, chunking_type)),
                    ChunkContentGraphNode::Chunk(chunk),
                ));
            }
            ChunkingType::PlacedOrParallel => {
                // heuristic for being in the same chunk
                if !context.split
                    && *context
                        .chunking_context
                        .can_be_in_same_chunk(context.entry, asset)
                        .await?
                {
                    // chunk item, chunk or other asset?
                    if let Some(chunk_item) = I::from_asset(context.chunking_context, asset).await?
                    {
                        graph_nodes.push((
                            Some((asset, chunking_type)),
                            ChunkContentGraphNode::ChunkItem(chunk_item),
                        ));
                        continue;
                    }
                }

                let chunk =
                    chunkable_asset.as_chunk(context.chunking_context, context.availability_info);
                graph_nodes.push((
                    Some((asset, chunking_type)),
                    ChunkContentGraphNode::Chunk(chunk),
                ));
            }
            ChunkingType::Separate => {
                graph_nodes.push((
                    Some((asset, chunking_type)),
                    ChunkContentGraphNode::AsyncChunkGroup(ChunkGroupVc::from_asset(
                        chunkable_asset,
                        context.chunking_context,
                        context.availability_info,
                    )),
                ));
            }
            ChunkingType::SeparateAsync => {
                if let Some(manifest_loader_item) = I::from_async_asset(
                    context.chunking_context,
                    chunkable_asset,
                    context.availability_info,
                )
                .await?
                {
                    graph_nodes.push((
                        Some((asset, chunking_type)),
                        ChunkContentGraphNode::ChunkItem(manifest_loader_item),
                    ));
                } else {
                    return Ok(vec![(
                        None,
                        ChunkContentGraphNode::ExternalAssetReference(reference),
                    )]);
                }
            }
        }
    }

    Ok(graph_nodes)
}

/// The maximum number of chunk items that can be in a chunk before we split it
/// into multiple chunks.
const MAX_CHUNK_ITEMS_COUNT: usize = 5000;

struct ChunkContentVisit<I> {
    context: ChunkContentContext,
    chunk_items_count: usize,
    processed_assets: HashSet<(ChunkingType, AssetVc)>,
    _phantom: PhantomData<I>,
}

type ChunkItemToGraphNodesEdges<I> =
    impl Iterator<Item = (Option<(AssetVc, ChunkingType)>, ChunkContentGraphNode<I>)>;

type ChunkItemToGraphNodesFuture<I: FromChunkableAsset + Eq + std::hash::Hash + Clone> =
    impl Future<Output = Result<ChunkItemToGraphNodesEdges<I>>>;

impl<I> Visit<ChunkContentGraphNode<I>, ()> for ChunkContentVisit<I>
where
    I: FromChunkableAsset + Eq + std::hash::Hash + Clone,
{
    type Edge = (Option<(AssetVc, ChunkingType)>, ChunkContentGraphNode<I>);
    type EdgesIntoIter = ChunkItemToGraphNodesEdges<I>;
    type EdgesFuture = ChunkItemToGraphNodesFuture<I>;

    fn visit(
        &mut self,
        (option_key, node): (Option<(AssetVc, ChunkingType)>, ChunkContentGraphNode<I>),
    ) -> VisitControlFlow<ChunkContentGraphNode<I>, ()> {
        let Some((asset, chunking_type)) = option_key else {
            return VisitControlFlow::Continue(node);
        };

        if !self.processed_assets.insert((chunking_type, asset)) {
            return VisitControlFlow::Skip(node);
        }

        if let ChunkContentGraphNode::ChunkItem(_) = &node {
            self.chunk_items_count += 1;

            // Make sure the chunk doesn't become too large.
            // This will hurt performance in many aspects.
            if !self.context.split && self.chunk_items_count >= MAX_CHUNK_ITEMS_COUNT {
                // Chunk is too large, cancel this algorithm and restart with splitting from the
                // start.
                return VisitControlFlow::Abort(());
            }
        }

        VisitControlFlow::Continue(node)
    }

    fn edges(&mut self, node: &ChunkContentGraphNode<I>) -> Self::EdgesFuture {
        let chunk_item = if let ChunkContentGraphNode::ChunkItem(chunk_item) = node {
            Some(chunk_item.clone())
        } else {
            None
        };

        let context = self.context;

        async move {
            let Some(chunk_item) = chunk_item else {
                return Ok(vec![].into_iter().flatten());
            };

            Ok(chunk_item
                .references()
                .await?
                .into_iter()
                .map(|reference| reference_to_graph_nodes::<I>(context, *reference))
                .try_join()
                .await?
                .into_iter()
                .flatten())
        }
    }
}

async fn chunk_content_internal_parallel<I>(
    chunking_context: ChunkingContextVc,
    entry: AssetVc,
    additional_entries: Option<AssetsVc>,
    availability_info: Value<AvailabilityInfo>,
    split: bool,
) -> Result<Option<ChunkContentResult<I>>>
where
    I: FromChunkableAsset + Eq + std::hash::Hash + Clone,
{
    let additional_entries = if let Some(additional_entries) = additional_entries {
        additional_entries.await?.clone_value().into_iter()
    } else {
        vec![].into_iter()
    };

    let root_edges = [entry]
        .into_iter()
        .chain(additional_entries)
        .map(|entry| async move {
            Ok((
                Some((entry, ChunkingType::Placed)),
                ChunkContentGraphNode::ChunkItem(
                    I::from_asset(chunking_context, entry).await?.unwrap(),
                ),
            ))
        })
        .try_join()
        .await?;

    let context = ChunkContentContext {
        chunking_context,
        entry,
        split,
        availability_info,
    };

    let visit = ChunkContentVisit {
        context,
        chunk_items_count: 0,
        processed_assets: Default::default(),
        _phantom: PhantomData,
    };

    let GraphTraversalResult::Completed(traversal_result) =
        GraphTraversal::<ReverseTopological<_>>::visit(root_edges, visit).await else {
            return Ok(None);
        };

    let graph_nodes: Vec<_> = traversal_result?.into_iter().collect();

    let mut chunk_items = Vec::new();
    let mut chunks = Vec::new();
    let mut async_chunk_groups = Vec::new();
    let mut external_asset_references = Vec::new();

    for graph_node in graph_nodes {
        match graph_node {
            ChunkContentGraphNode::AvailableAsset(_asset) => {}
            ChunkContentGraphNode::ChunkItem(chunk_item) => {
                chunk_items.push(chunk_item);
            }
            ChunkContentGraphNode::Chunk(chunk) => {
                chunks.push(chunk);
            }
            ChunkContentGraphNode::AsyncChunkGroup(async_chunk_group) => {
                async_chunk_groups.push(async_chunk_group);
            }
            ChunkContentGraphNode::ExternalAssetReference(reference) => {
                external_asset_references.push(reference);
            }
        }
    }

    Ok(Some(ChunkContentResult {
        chunk_items,
        chunks,
        async_chunk_groups,
        external_asset_references,
        availability_info: availability_info.into_value(),
    }))
}

#[turbo_tasks::value_trait]
pub trait ChunkItem {
    /// The [AssetIdent] of the [Asset] that this [ChunkItem] was created from.
    /// For most chunk types this must uniquely identify the asset as it's the
    /// source of the module id used at runtime.
    fn asset_ident(&self) -> AssetIdentVc;
    /// A [ChunkItem] can describe different `references` than its original
    /// [Asset].
    /// TODO(alexkirsz) This should have a default impl that returns empty
    /// references.
    fn references(&self) -> AssetReferencesVc;
}

#[turbo_tasks::value(transparent)]
pub struct ChunkItems(Vec<ChunkItemVc>);
