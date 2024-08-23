pub mod availability_info;
pub mod available_chunk_items;
pub mod chunk_group;
pub mod chunking;
pub(crate) mod chunking_context;
pub(crate) mod containment_tree;
pub(crate) mod data;
pub(crate) mod evaluate;
pub mod optimize;

use std::{
    collections::{HashMap, HashSet},
    fmt::{Debug, Display},
    future::Future,
    hash::Hash,
};

use anyhow::Result;
use auto_hash_map::AutoSet;
use indexmap::{IndexMap, IndexSet};
use serde::{Deserialize, Serialize};
use tracing::{info_span, Span};
use turbo_tasks::{
    debug::ValueDebugFormat,
    graph::{AdjacencyMap, GraphTraversal, GraphTraversalResult, Visit, VisitControlFlow},
    trace::TraceRawVcs,
    RcStr, ReadRef, TaskInput, TryFlatJoinIterExt, TryJoinIterExt, Upcast, ValueToString, Vc,
};
use turbo_tasks_fs::FileSystemPath;
use turbo_tasks_hash::DeterministicHash;

use self::{availability_info::AvailabilityInfo, available_chunk_items::AvailableChunkItems};
pub use self::{
    chunking_context::{
        ChunkGroupResult, ChunkingContext, ChunkingContextExt, EntryChunkGroupResult, MinifyType,
    },
    data::{ChunkData, ChunkDataOption, ChunksData},
    evaluate::{EvaluatableAsset, EvaluatableAssetExt, EvaluatableAssets},
};
use crate::{
    asset::Asset,
    environment::ChunkLoading,
    ident::AssetIdent,
    module::Module,
    output::OutputAssets,
    reference::{ModuleReference, ModuleReferences},
};

/// A module id, which can be a number or string
#[turbo_tasks::value(shared)]
#[derive(Debug, Clone, Hash, Ord, PartialOrd, DeterministicHash)]
#[serde(untagged)]
pub enum ModuleId {
    Number(u32),
    String(RcStr),
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
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(self.to_string().into())
    }
}

impl ModuleId {
    pub fn parse(id: &str) -> Result<ModuleId> {
        Ok(match id.parse::<u32>() {
            Ok(i) => ModuleId::Number(i),
            Err(_) => ModuleId::String(id.into()),
        })
    }
}

/// A list of module ids.
#[turbo_tasks::value(transparent, shared)]
pub struct ModuleIds(Vec<Vc<ModuleId>>);

/// A [Module] that can be converted into a [Chunk].
#[turbo_tasks::value_trait]
pub trait ChunkableModule: Module + Asset {
    fn as_chunk_item(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn ChunkItem>>;
}

#[turbo_tasks::value(transparent)]
pub struct Chunks(Vec<Vc<Box<dyn Chunk>>>);

#[turbo_tasks::value_impl]
impl Chunks {
    /// Creates a new empty [Vc<Chunks>].
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Vc::cell(vec![])
    }
}

/// A chunk is one type of asset.
/// It usually contains multiple chunk items.
#[turbo_tasks::value_trait]
pub trait Chunk: Asset {
    fn ident(self: Vc<Self>) -> Vc<AssetIdent>;
    fn chunking_context(self: Vc<Self>) -> Vc<Box<dyn ChunkingContext>>;
    // TODO Once output assets have their own trait, this path() method will move
    // into that trait and ident() will be removed from that. Assets on the
    // output-level only have a path and no complex ident.
    /// The path of the chunk.
    fn path(self: Vc<Self>) -> Vc<FileSystemPath> {
        self.ident().path()
    }

    /// Other [OutputAsset]s referenced from this [Chunk].
    fn references(self: Vc<Self>) -> Vc<OutputAssets> {
        OutputAssets::empty()
    }
}

/// Aggregated information about a chunk content that can be used by the runtime
/// code to optimize chunk loading.
#[turbo_tasks::value(shared)]
#[derive(Default)]
pub struct OutputChunkRuntimeInfo {
    pub included_ids: Option<Vc<ModuleIds>>,
    pub excluded_ids: Option<Vc<ModuleIds>>,
    /// List of paths of chunks containing individual modules that are part of
    /// this chunk. This is useful for selectively loading modules from a chunk
    /// without loading the whole chunk.
    pub module_chunks: Option<Vc<OutputAssets>>,
    pub placeholder_for_future_extensions: (),
}

#[turbo_tasks::value_trait]
pub trait OutputChunk: Asset {
    fn runtime_info(self: Vc<Self>) -> Vc<OutputChunkRuntimeInfo>;
}

/// Specifies how a chunk interacts with other chunks when building a chunk
/// group
#[derive(
    Copy, Default, Clone, Hash, TraceRawVcs, Serialize, Deserialize, Eq, PartialEq, ValueDebugFormat,
)]
pub enum ChunkingType {
    /// Module is placed in the same chunk group and is loaded in parallel. It
    /// doesn't become an async module when the referenced module is async.
    #[default]
    Parallel,
    /// Module is placed in the same chunk group and is loaded in parallel. It
    /// becomes an async module when the referenced module is async.
    ParallelInheritAsync,
    /// An async loader is placed into the referencing chunk and loads the
    /// separate chunk group in which the module is placed.
    Async,
    /// Module not placed in chunk group, but its references are still followed.
    Passthrough,
}

#[turbo_tasks::value(transparent)]
pub struct ChunkingTypeOption(Option<ChunkingType>);

/// A [ModuleReference] implementing this trait and returning true for
/// [ChunkableModuleReference::is_chunkable] are considered as potentially
/// chunkable references. When all [Module]s of such a reference implement
/// [ChunkableModule] they are placed in [Chunk]s during chunking.
/// They are even potentially placed in the same [Chunk] when a chunk type
/// specific interface is implemented.
#[turbo_tasks::value_trait]
pub trait ChunkableModuleReference: ModuleReference + ValueToString {
    fn chunking_type(self: Vc<Self>) -> Vc<ChunkingTypeOption> {
        Vc::cell(Some(ChunkingType::default()))
    }
}

type AsyncInfo = IndexMap<Vc<Box<dyn ChunkItem>>, Vec<Vc<Box<dyn ChunkItem>>>>;

pub struct ChunkContentResult {
    pub chunk_items: IndexSet<Vc<Box<dyn ChunkItem>>>,
    pub async_modules: IndexSet<Vc<Box<dyn ChunkableModule>>>,
    pub external_module_references: IndexSet<Vc<Box<dyn ModuleReference>>>,
    /// A map from local module to all children from which the async module
    /// status is inherited
    pub forward_edges_inherit_async: AsyncInfo,
    /// A map from local module to all parents that inherit the async module
    /// status
    pub local_back_edges_inherit_async: AsyncInfo,
    /// A map from already available async modules to all local parents that
    /// inherit the async module status
    pub available_async_modules_back_edges_inherit_async: AsyncInfo,
}

pub async fn chunk_content(
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    entries: impl IntoIterator<Item = Vc<Box<dyn Module>>>,
    availability_info: AvailabilityInfo,
) -> Result<ChunkContentResult> {
    chunk_content_internal_parallel(chunking_context, entries, availability_info).await
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TraceRawVcs, Debug)]
enum InheritAsyncEdge {
    /// The chunk item is in the current chunk group and async module info need
    /// to be computed for it
    LocalModule,
    /// The chunk item is already available in the parent chunk group and is an
    /// async module. Chunk items that are available but not async modules are
    /// not included in back edges at all since they don't influence the parent
    /// module in terms of being an async module.
    AvailableAsyncModule,
}

#[derive(Eq, PartialEq, Clone, Hash, Serialize, Deserialize, TraceRawVcs, Debug)]
enum ChunkContentGraphNode {
    // A chunk item not placed in the current chunk, but whose references we will
    // follow to find more graph nodes.
    PassthroughChunkItem {
        item: Vc<Box<dyn ChunkItem>>,
    },
    // Chunk items that are placed into the current chunk group
    ChunkItem {
        item: Vc<Box<dyn ChunkItem>>,
        ident: ReadRef<RcStr>,
    },
    // Async module that is referenced from the chunk group
    AsyncModule {
        module: Vc<Box<dyn ChunkableModule>>,
    },
    // ModuleReferences that are not placed in the current chunk group
    ExternalModuleReference(Vc<Box<dyn ModuleReference>>),
    /// A list of directly referenced chunk items from which `is_async_module`
    /// will be inherited.
    InheritAsyncInfo {
        item: Vc<Box<dyn ChunkItem>>,
        references: Vec<(Vc<Box<dyn ChunkItem>>, InheritAsyncEdge)>,
    },
}

#[derive(Debug, Clone, Copy, TaskInput, PartialEq, Eq, Hash, Serialize, Deserialize)]
enum ChunkGraphNodeToReferences {
    PassthroughChunkItem(Vc<Box<dyn ChunkItem>>),
    ChunkItem(Vc<Box<dyn ChunkItem>>),
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq, TraceRawVcs)]
struct ChunkGraphEdge {
    key: Option<Vc<Box<dyn Module>>>,
    node: ChunkContentGraphNode,
}

#[derive(Debug, Clone)]
#[turbo_tasks::value(transparent)]
struct ChunkGraphEdges(Vec<ChunkGraphEdge>);

#[turbo_tasks::function]
async fn graph_node_to_referenced_nodes_with_available_chunk_items(
    node: ChunkGraphNodeToReferences,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    available_chunk_items: Vc<AvailableChunkItems>,
) -> Result<Vc<ChunkGraphEdges>> {
    let edges = graph_node_to_referenced_nodes(node, chunking_context);
    let edges_ref = edges.await?;
    for (unchanged, edge) in edges_ref.iter().enumerate() {
        if let ChunkContentGraphNode::ChunkItem { item, .. } = edge.node {
            if let Some(info) = *available_chunk_items.get(item).await? {
                let mut new_edges = Vec::with_capacity(edges_ref.len());
                new_edges.extend(edges_ref[0..unchanged].iter().cloned());
                let mut available_chunk_item_info = HashMap::new();
                available_chunk_item_info.insert(item, info);
                for edge in edges_ref[unchanged + 1..].iter() {
                    match edge.node {
                        ChunkContentGraphNode::ChunkItem { item, .. } => {
                            if let Some(info) = *available_chunk_items.get(item).await? {
                                available_chunk_item_info.insert(item, info);
                                continue;
                            }
                        }
                        ChunkContentGraphNode::InheritAsyncInfo {
                            item,
                            ref references,
                        } => {
                            let new_references = references
                                .iter()
                                .filter_map(|&(r, _)| {
                                    if let Some(info) = available_chunk_item_info.get(&r) {
                                        if info.is_async {
                                            Some((r, InheritAsyncEdge::AvailableAsyncModule))
                                        } else {
                                            None
                                        }
                                    } else {
                                        Some((r, InheritAsyncEdge::LocalModule))
                                    }
                                })
                                .collect();
                            new_edges.push(ChunkGraphEdge {
                                key: edge.key,
                                node: ChunkContentGraphNode::InheritAsyncInfo {
                                    item,
                                    references: new_references,
                                },
                            });
                            continue;
                        }
                        _ => {}
                    }
                    new_edges.push(edge.clone())
                }
                return Ok(Vc::cell(new_edges));
            }
        }
    }
    Ok(edges)
}

#[turbo_tasks::function]
async fn graph_node_to_referenced_nodes(
    node: ChunkGraphNodeToReferences,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<Vc<ChunkGraphEdges>> {
    let (parent, references) = match &node {
        ChunkGraphNodeToReferences::PassthroughChunkItem(item) => (None, item.references()),
        ChunkGraphNodeToReferences::ChunkItem(item) => (Some(*item), item.references()),
    };

    let references = references.await?;
    let graph_nodes = references
        .iter()
        .map(|reference| async {
            let reference = *reference;
            let Some(chunkable_module_reference) =
                Vc::try_resolve_downcast::<Box<dyn ChunkableModuleReference>>(reference).await?
            else {
                return Ok(vec![ChunkGraphEdge {
                    key: None,
                    node: ChunkContentGraphNode::ExternalModuleReference(reference),
                }]);
            };

            let Some(chunking_type) = *chunkable_module_reference.chunking_type().await? else {
                return Ok(vec![ChunkGraphEdge {
                    key: None,
                    node: ChunkContentGraphNode::ExternalModuleReference(reference),
                }]);
            };

            let module_data = reference
                .resolve_reference()
                .resolve()
                .await?
                .primary_modules()
                .await?
                .into_iter()
                .map(|&module| async move {
                    let Some(chunkable_module) =
                        Vc::try_resolve_sidecast::<Box<dyn ChunkableModule>>(module).await?
                    else {
                        return Ok((
                            Some(ChunkGraphEdge {
                                key: None,
                                node: ChunkContentGraphNode::ExternalModuleReference(reference),
                            }),
                            None,
                        ));
                    };

                    match chunking_type {
                        ChunkingType::Parallel => {
                            let chunk_item = chunkable_module
                                .as_chunk_item(chunking_context)
                                .resolve()
                                .await?;
                            Ok((
                                Some(ChunkGraphEdge {
                                    key: Some(module),
                                    node: ChunkContentGraphNode::ChunkItem {
                                        item: chunk_item,
                                        ident: module.ident().to_string().await?,
                                    },
                                }),
                                None,
                            ))
                        }
                        ChunkingType::ParallelInheritAsync => {
                            let chunk_item = chunkable_module
                                .as_chunk_item(chunking_context)
                                .resolve()
                                .await?;
                            Ok((
                                Some(ChunkGraphEdge {
                                    key: Some(module),
                                    node: ChunkContentGraphNode::ChunkItem {
                                        item: chunk_item,
                                        ident: module.ident().to_string().await?,
                                    },
                                }),
                                Some((chunk_item, InheritAsyncEdge::LocalModule)),
                            ))
                        }
                        ChunkingType::Passthrough => {
                            let chunk_item = chunkable_module
                                .as_chunk_item(chunking_context)
                                .resolve()
                                .await?;

                            Ok((
                                Some(ChunkGraphEdge {
                                    key: None,
                                    node: ChunkContentGraphNode::PassthroughChunkItem {
                                        item: chunk_item,
                                    },
                                }),
                                None,
                            ))
                        }
                        ChunkingType::Async => {
                            let chunk_loading =
                                chunking_context.environment().chunk_loading().await?;
                            if matches!(*chunk_loading, ChunkLoading::Edge) {
                                let chunk_item = chunkable_module
                                    .as_chunk_item(chunking_context)
                                    .resolve()
                                    .await?;
                                Ok((
                                    Some(ChunkGraphEdge {
                                        key: Some(module),
                                        node: ChunkContentGraphNode::ChunkItem {
                                            item: chunk_item,
                                            ident: module.ident().to_string().await?,
                                        },
                                    }),
                                    None,
                                ))
                            } else {
                                Ok((
                                    Some(ChunkGraphEdge {
                                        key: None,
                                        node: ChunkContentGraphNode::AsyncModule {
                                            module: chunkable_module,
                                        },
                                    }),
                                    None,
                                ))
                            }
                        }
                    }
                })
                .try_join()
                .await?;

            let mut graph_nodes = vec![];
            let mut inherit_async_references = vec![];
            for (n, iar) in module_data {
                if let Some(n) = n {
                    graph_nodes.push(n);
                }
                if let Some(iar) = iar {
                    inherit_async_references.push(iar);
                }
            }

            if !inherit_async_references.is_empty() {
                if let Some(parent) = parent {
                    graph_nodes.push(ChunkGraphEdge {
                        key: None,
                        node: ChunkContentGraphNode::InheritAsyncInfo {
                            item: parent,
                            references: inherit_async_references,
                        },
                    })
                }
            }

            Ok(graph_nodes)
        })
        .try_flat_join()
        .await?;

    Ok(Vc::cell(graph_nodes))
}

struct ChunkContentVisit {
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    available_chunk_items: Option<Vc<AvailableChunkItems>>,
    processed_modules: HashSet<Vc<Box<dyn Module>>>,
}

type ChunkItemToGraphNodesEdges = impl Iterator<Item = ChunkGraphEdge>;

type ChunkItemToGraphNodesFuture = impl Future<Output = Result<ChunkItemToGraphNodesEdges>>;

impl Visit<ChunkContentGraphNode, ()> for ChunkContentVisit {
    type Edge = ChunkGraphEdge;
    type EdgesIntoIter = ChunkItemToGraphNodesEdges;
    type EdgesFuture = ChunkItemToGraphNodesFuture;

    fn visit(&mut self, edge: ChunkGraphEdge) -> VisitControlFlow<ChunkContentGraphNode, ()> {
        let ChunkGraphEdge { key, node } = edge;
        let Some(module) = key else {
            if matches!(node, ChunkContentGraphNode::PassthroughChunkItem { .. }) {
                return VisitControlFlow::Continue(node);
            } else {
                // All other types don't have edges
                return VisitControlFlow::Skip(node);
            }
        };

        if !self.processed_modules.insert(module) {
            return VisitControlFlow::Skip(node);
        }

        VisitControlFlow::Continue(node)
    }

    fn edges(&mut self, node: &ChunkContentGraphNode) -> Self::EdgesFuture {
        let node = node.clone();

        let chunking_context = self.chunking_context;
        let available_chunk_items = self.available_chunk_items;

        async move {
            let node = match node {
                ChunkContentGraphNode::PassthroughChunkItem { item } => {
                    ChunkGraphNodeToReferences::PassthroughChunkItem(item)
                }
                ChunkContentGraphNode::ChunkItem { item, .. } => {
                    ChunkGraphNodeToReferences::ChunkItem(item)
                }
                _ => {
                    return Ok(None.into_iter().flatten());
                }
            };

            let nodes = if let Some(available_chunk_items) = available_chunk_items {
                graph_node_to_referenced_nodes_with_available_chunk_items(
                    node,
                    chunking_context,
                    available_chunk_items,
                )
            } else {
                graph_node_to_referenced_nodes(node, chunking_context)
            }
            .await?;
            Ok(Some(nodes.into_iter().cloned()).into_iter().flatten())
        }
    }

    fn span(&mut self, node: &ChunkContentGraphNode) -> Span {
        if let ChunkContentGraphNode::ChunkItem { ident, .. } = node {
            info_span!("chunking module", name = display(ident))
        } else {
            Span::current()
        }
    }
}

async fn chunk_content_internal_parallel(
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    entries: impl IntoIterator<Item = Vc<Box<dyn Module>>>,
    availability_info: AvailabilityInfo,
) -> Result<ChunkContentResult> {
    let root_edges = entries
        .into_iter()
        .map(|entry| async move {
            let entry = entry.resolve().await?;
            let Some(chunkable_module) =
                Vc::try_resolve_downcast::<Box<dyn ChunkableModule>>(entry).await?
            else {
                return Ok(None);
            };
            Ok(Some(ChunkGraphEdge {
                key: Some(entry),
                node: ChunkContentGraphNode::ChunkItem {
                    item: chunkable_module
                        .as_chunk_item(chunking_context)
                        .resolve()
                        .await?,
                    ident: chunkable_module.ident().to_string().await?,
                },
            }))
        })
        .try_flat_join()
        .await?;

    let visit = ChunkContentVisit {
        chunking_context,
        available_chunk_items: availability_info.available_chunk_items(),
        processed_modules: Default::default(),
    };

    let GraphTraversalResult::Completed(traversal_result) =
        AdjacencyMap::new().visit(root_edges, visit).await
    else {
        unreachable!();
    };

    let graph_nodes: Vec<_> = traversal_result?.into_reverse_topological().collect();

    let mut chunk_items = IndexSet::new();
    let mut async_modules = IndexSet::new();
    let mut external_module_references = IndexSet::new();
    let mut forward_edges_inherit_async = IndexMap::new();
    let mut local_back_edges_inherit_async = IndexMap::new();
    let mut available_async_modules_back_edges_inherit_async = IndexMap::new();

    for graph_node in graph_nodes {
        match graph_node {
            ChunkContentGraphNode::PassthroughChunkItem { .. } => {}
            ChunkContentGraphNode::ChunkItem { item, .. } => {
                chunk_items.insert(item);
            }
            ChunkContentGraphNode::AsyncModule { module } => {
                let module = module.resolve().await?;
                async_modules.insert(module);
            }
            ChunkContentGraphNode::ExternalModuleReference(reference) => {
                let reference = reference.resolve().await?;
                external_module_references.insert(reference);
            }
            ChunkContentGraphNode::InheritAsyncInfo { item, references } => {
                for &(reference, ty) in &references {
                    match ty {
                        InheritAsyncEdge::LocalModule => local_back_edges_inherit_async
                            .entry(reference)
                            .or_insert_with(Vec::new)
                            .push(item),
                        InheritAsyncEdge::AvailableAsyncModule => {
                            available_async_modules_back_edges_inherit_async
                                .entry(reference)
                                .or_insert_with(Vec::new)
                                .push(item)
                        }
                    }
                }
                forward_edges_inherit_async
                    .entry(item)
                    .or_insert_with(Vec::new)
                    .extend(references.into_iter().map(|(r, _)| r));
            }
        }
    }

    Ok(ChunkContentResult {
        chunk_items,
        async_modules,
        external_module_references,
        forward_edges_inherit_async,
        local_back_edges_inherit_async,
        available_async_modules_back_edges_inherit_async,
    })
}

#[turbo_tasks::value_trait]
pub trait ChunkItem {
    /// The [AssetIdent] of the [Module] that this [ChunkItem] was created from.
    /// For most chunk types this must uniquely identify the chunk item at
    /// runtime as it's the source of the module id used at runtime.
    fn asset_ident(self: Vc<Self>) -> Vc<AssetIdent>;
    /// A [AssetIdent] that uniquely identifies the content of this [ChunkItem].
    /// It is unusally identical to [ChunkItem::asset_ident] but can be
    /// different when the chunk item content depends on available modules e. g.
    /// for chunk loaders.
    fn content_ident(self: Vc<Self>) -> Vc<AssetIdent> {
        self.asset_ident()
    }
    /// A [ChunkItem] can describe different `references` than its original
    /// [Module].
    /// TODO(alexkirsz) This should have a default impl that returns empty
    /// references.
    fn references(self: Vc<Self>) -> Vc<ModuleReferences>;

    /// The type of chunk this item should be assembled into.
    fn ty(self: Vc<Self>) -> Vc<Box<dyn ChunkType>>;

    /// A temporary method to retrieve the module associated with this
    /// ChunkItem. TODO: Remove this as part of the chunk refactoring.
    fn module(self: Vc<Self>) -> Vc<Box<dyn Module>>;

    fn chunking_context(self: Vc<Self>) -> Vc<Box<dyn ChunkingContext>>;

    fn is_self_async(self: Vc<Self>) -> Vc<bool> {
        Vc::cell(false)
    }
}

#[turbo_tasks::value_trait]
pub trait ChunkType: ValueToString {
    /// Create a new chunk for the given chunk items
    fn chunk(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        chunk_items: Vec<ChunkItemWithAsyncModuleInfo>,
        referenced_output_assets: Vc<OutputAssets>,
    ) -> Vc<Box<dyn Chunk>>;

    fn chunk_item_size(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        chunk_item: Vc<Box<dyn ChunkItem>>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Vc<usize>;
}

#[turbo_tasks::value(transparent)]
pub struct ChunkItems(Vec<Vc<Box<dyn ChunkItem>>>);

#[turbo_tasks::value]
pub struct AsyncModuleInfo {
    pub referenced_async_modules: AutoSet<Vc<Box<dyn ChunkItem>>>,
}

#[turbo_tasks::value_impl]
impl AsyncModuleInfo {
    #[turbo_tasks::function]
    pub fn new(referenced_async_modules: Vec<Vc<Box<dyn ChunkItem>>>) -> Vc<Self> {
        Self {
            referenced_async_modules: referenced_async_modules.into_iter().collect(),
        }
        .cell()
    }
}

pub type ChunkItemWithAsyncModuleInfo = (Vc<Box<dyn ChunkItem>>, Option<Vc<AsyncModuleInfo>>);

#[turbo_tasks::value(transparent)]
pub struct ChunkItemsWithAsyncModuleInfo(Vec<ChunkItemWithAsyncModuleInfo>);

pub trait ChunkItemExt: Send {
    /// Returns the module id of this chunk item.
    fn id(self: Vc<Self>) -> Vc<ModuleId>;
}

impl<T> ChunkItemExt for T
where
    T: Upcast<Box<dyn ChunkItem>>,
{
    /// Returns the module id of this chunk item.
    fn id(self: Vc<Self>) -> Vc<ModuleId> {
        let chunk_item = Vc::upcast(self);
        chunk_item.chunking_context().chunk_item_id(chunk_item)
    }
}
