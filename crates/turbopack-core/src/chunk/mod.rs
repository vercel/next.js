pub mod availability_info;
pub mod available_assets;
pub(crate) mod chunking_context;
pub(crate) mod containment_tree;
pub(crate) mod data;
pub(crate) mod evaluate;
pub mod optimize;
pub(crate) mod passthrough_asset;

use std::{
    collections::HashSet,
    fmt::{Debug, Display},
    future::Future,
    hash::Hash,
    marker::PhantomData,
};

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use tracing::{info_span, Span};
use turbo_tasks::{
    debug::ValueDebugFormat,
    graph::{AdjacencyMap, GraphTraversal, GraphTraversalResult, Visit, VisitControlFlow},
    primitives::{StringReadRef, StringVc},
    trace::TraceRawVcs,
    TryJoinIterExt, Value, ValueToString, ValueToStringVc,
};
use turbo_tasks_fs::FileSystemPathVc;
use turbo_tasks_hash::DeterministicHash;

use self::availability_info::AvailabilityInfo;
pub use self::{
    chunking_context::{ChunkingContext, ChunkingContextVc},
    data::{ChunkData, ChunkDataOption, ChunkDataOptionVc, ChunkDataVc, ChunksData, ChunksDataVc},
    evaluate::{EvaluatableAsset, EvaluatableAssetVc, EvaluatableAssets, EvaluatableAssetsVc},
    passthrough_asset::{PassthroughAsset, PassthroughAssetVc},
};
use crate::{
    asset::{Asset, AssetVc, AssetsVc},
    ident::AssetIdentVc,
    module::{Module, ModuleVc},
    output::OutputAssetsVc,
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

/// An [Asset] that can be converted into a [Chunk].
#[turbo_tasks::value_trait]
pub trait ChunkableModule: Module + Asset {
    fn as_chunk(
        &self,
        context: ChunkingContextVc,
        availability_info: Value<AvailabilityInfo>,
    ) -> ChunkVc;

    fn as_root_chunk(self_vc: ChunkableModuleVc, context: ChunkingContextVc) -> ChunkVc {
        self_vc.as_chunk(
            context,
            Value::new(AvailabilityInfo::Root {
                current_availability_root: self_vc.into(),
            }),
        )
    }
}

#[turbo_tasks::value(transparent)]
pub struct Chunks(Vec<ChunkVc>);

#[turbo_tasks::value_impl]
impl ChunksVc {
    /// Creates a new empty [ChunksVc].
    #[turbo_tasks::function]
    pub fn empty() -> ChunksVc {
        Self::cell(vec![])
    }
}

/// A chunk is one type of asset.
/// It usually contains multiple chunk items.
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
    /// Returns a list of chunks that should be loaded in parallel to this
    /// chunk.
    fn parallel_chunks(&self) -> ChunksVc {
        ChunksVc::empty()
    }
}

/// Aggregated information about a chunk content that can be used by the runtime
/// code to optimize chunk loading.
#[turbo_tasks::value(shared)]
#[derive(Default)]
pub struct OutputChunkRuntimeInfo {
    pub included_ids: Option<ModuleIdsVc>,
    pub excluded_ids: Option<ModuleIdsVc>,
    /// List of paths of chunks containing individual modules that are part of
    /// this chunk. This is useful for selectively loading modules from a chunk
    /// without loading the whole chunk.
    pub module_chunks: Option<AssetsVc>,
    pub placeholder_for_future_extensions: (),
}

#[turbo_tasks::value_trait]
pub trait OutputChunk: Asset {
    fn runtime_info(&self) -> OutputChunkRuntimeInfoVc;
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
    /// An async loader is placed into the referencing chunk and loads the
    /// separate chunk group in which the asset is placed.
    Async,
}

#[turbo_tasks::value(transparent)]
pub struct ChunkingTypeOption(Option<ChunkingType>);

/// An [AssetReference] implementing this trait and returning true for
/// [ChunkableModuleReference::is_chunkable] are considered as potentially
/// chunkable references. When all [Asset]s of such a reference implement
/// [ChunkableModule] they are placed in [Chunk]s during chunking.
/// They are even potentially placed in the same [Chunk] when a chunk type
/// specific interface is implemented.
#[turbo_tasks::value_trait]
pub trait ChunkableModuleReference: AssetReference + ValueToString {
    fn chunking_type(&self) -> ChunkingTypeOptionVc {
        ChunkingTypeOptionVc::cell(Some(ChunkingType::default()))
    }
}

/// A reference to multiple chunks from a [ChunkGroup]
#[turbo_tasks::value]
pub struct ChunkGroupReference {
    chunking_context: ChunkingContextVc,
    entry: ChunkVc,
}

#[turbo_tasks::value_impl]
impl ChunkGroupReferenceVc {
    #[turbo_tasks::function]
    pub fn new(chunking_context: ChunkingContextVc, entry: ChunkVc) -> Self {
        Self::cell(ChunkGroupReference {
            chunking_context,
            entry,
        })
    }

    #[turbo_tasks::function]
    async fn chunks(self) -> Result<OutputAssetsVc> {
        let this = self.await?;
        Ok(this.chunking_context.chunk_group(this.entry))
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for ChunkGroupReference {
    #[turbo_tasks::function]
    async fn resolve_reference(self_vc: ChunkGroupReferenceVc) -> Result<ResolveResultVc> {
        let set = self_vc.chunks().await?.iter().map(|&c| c.into()).collect();
        Ok(ResolveResult::assets(set).into())
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for ChunkGroupReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "chunk group ({})",
            self.entry.ident().to_string().await?
        )))
    }
}

pub struct ChunkContentResult<I> {
    pub chunk_items: Vec<I>,
    pub chunks: Vec<ChunkVc>,
    pub external_asset_references: Vec<AssetReferenceVc>,
    pub availability_info: AvailabilityInfo,
}

#[async_trait::async_trait]
pub trait FromChunkableModule: ChunkItem + Sized + Debug {
    async fn from_asset(context: ChunkingContextVc, asset: AssetVc) -> Result<Option<Self>>;
    async fn from_async_asset(
        context: ChunkingContextVc,
        asset: ChunkableModuleVc,
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
    I: FromChunkableModule + Eq + std::hash::Hash + Clone,
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
    I: FromChunkableModule + Eq + std::hash::Hash + Clone,
{
    chunk_content_internal_parallel(context, entry, additional_entries, availability_info, false)
        .await
}

#[derive(Eq, PartialEq, Clone, Hash)]
enum ChunkContentGraphNode<I> {
    // An asset not placed in the current chunk, but whose references we will
    // follow to find more graph nodes.
    PassthroughAsset { asset: AssetVc },
    // Chunk items that are placed into the current chunk
    ChunkItem { item: I, ident: StringReadRef },
    // Asset that is already available and doesn't need to be included
    AvailableAsset(AssetVc),
    // Chunks that are loaded in parallel to the current chunk
    Chunk(ChunkVc),
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
    I: FromChunkableModule + Eq + std::hash::Hash + Clone,
{
    let Some(chunkable_asset_reference) =
        ChunkableModuleReferenceVc::resolve_from(reference).await?
    else {
        return Ok(vec![(
            None,
            ChunkContentGraphNode::ExternalAssetReference(reference),
        )]);
    };

    let Some(chunking_type) = *chunkable_asset_reference.chunking_type().await? else {
        return Ok(vec![(
            None,
            ChunkContentGraphNode::ExternalAssetReference(reference),
        )]);
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

        if PassthroughAssetVc::resolve_from(asset).await?.is_some() {
            graph_nodes.push((None, ChunkContentGraphNode::PassthroughAsset { asset }));
            continue;
        }

        let chunkable_asset = match ChunkableModuleVc::resolve_from(asset).await? {
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
                        ChunkContentGraphNode::ChunkItem {
                            item: chunk_item,
                            ident: asset.ident().to_string().await?,
                        },
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
                let chunk = chunkable_asset.as_root_chunk(context.chunking_context);
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
                            ChunkContentGraphNode::ChunkItem {
                                item: chunk_item,
                                ident: asset.ident().to_string().await?,
                            },
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
            ChunkingType::Async => {
                if let Some(manifest_loader_item) = I::from_async_asset(
                    context.chunking_context,
                    chunkable_asset,
                    context.availability_info,
                )
                .await?
                {
                    graph_nodes.push((
                        Some((asset, chunking_type)),
                        ChunkContentGraphNode::ChunkItem {
                            item: manifest_loader_item,
                            ident: asset.ident().to_string().await?,
                        },
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

type ChunkItemToGraphNodesFuture<I: FromChunkableModule + Eq + std::hash::Hash + Clone> =
    impl Future<Output = Result<ChunkItemToGraphNodesEdges<I>>>;

impl<I> Visit<ChunkContentGraphNode<I>, ()> for ChunkContentVisit<I>
where
    I: FromChunkableModule + Eq + std::hash::Hash + Clone,
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

        if let ChunkContentGraphNode::ChunkItem { .. } = &node {
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
        let node = node.clone();

        let context = self.context;

        async move {
            let references = match node {
                ChunkContentGraphNode::PassthroughAsset { asset } => asset.references(),
                ChunkContentGraphNode::ChunkItem { item, .. } => item.references(),
                _ => {
                    return Ok(vec![].into_iter().flatten());
                }
            };

            Ok(references
                .await?
                .into_iter()
                .map(|reference| reference_to_graph_nodes::<I>(context, *reference))
                .try_join()
                .await?
                .into_iter()
                .flatten())
        }
    }

    fn span(&mut self, node: &ChunkContentGraphNode<I>) -> Span {
        if let ChunkContentGraphNode::ChunkItem { ident, .. } = node {
            info_span!("module", name = display(ident))
        } else {
            Span::current()
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
    I: FromChunkableModule + Eq + std::hash::Hash + Clone,
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
                ChunkContentGraphNode::ChunkItem {
                    item: I::from_asset(chunking_context, entry).await?.unwrap(),
                    ident: entry.ident().to_string().await?,
                },
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
        AdjacencyMap::new().visit(root_edges, visit).await
    else {
        return Ok(None);
    };

    let graph_nodes: Vec<_> = traversal_result?.into_reverse_topological().collect();

    let mut chunk_items = Vec::new();
    let mut chunks = Vec::new();
    let mut external_asset_references = Vec::new();

    for graph_node in graph_nodes {
        match graph_node {
            ChunkContentGraphNode::AvailableAsset(_)
            | ChunkContentGraphNode::PassthroughAsset { .. } => {}
            ChunkContentGraphNode::ChunkItem { item, .. } => {
                chunk_items.push(item);
            }
            ChunkContentGraphNode::Chunk(chunk) => {
                chunks.push(chunk);
            }
            ChunkContentGraphNode::ExternalAssetReference(reference) => {
                external_asset_references.push(reference);
            }
        }
    }

    Ok(Some(ChunkContentResult {
        chunk_items,
        chunks,
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
