pub mod availability_info;
pub mod available_modules;
pub mod chunk_group;
pub mod chunking;
pub(crate) mod chunking_context;
pub(crate) mod containment_tree;
pub(crate) mod data;
pub(crate) mod evaluate;
pub mod module_id_strategies;
pub mod optimize;

use std::{
    collections::{HashMap, HashSet},
    fmt::{Debug, Display},
    future::Future,
    hash::Hash,
};

use anyhow::{bail, Result};
use auto_hash_map::AutoSet;
use serde::{Deserialize, Serialize};
use tracing::{info_span, Span};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    debug::ValueDebugFormat,
    graph::{AdjacencyMap, GraphTraversal, GraphTraversalResult, Visit, VisitControlFlow},
    trace::TraceRawVcs,
    FxIndexMap, FxIndexSet, NonLocalValue, ReadRef, ResolvedVc, TaskInput, TryFlatJoinIterExt,
    TryJoinIterExt, Upcast, ValueToString, Vc,
};
use turbo_tasks_fs::FileSystemPath;
use turbo_tasks_hash::DeterministicHash;

use self::{availability_info::AvailabilityInfo, available_modules::AvailableModules};
pub use self::{
    chunking_context::{
        ChunkGroupResult, ChunkGroupType, ChunkingContext, ChunkingContextExt,
        EntryChunkGroupResult, MinifyType,
    },
    data::{ChunkData, ChunkDataOption, ChunksData},
    evaluate::{EvaluatableAsset, EvaluatableAssetExt, EvaluatableAssets},
};
use crate::{
    asset::Asset, ident::AssetIdent, module::Module, output::OutputAssets,
    reference::ModuleReference,
};

/// A module id, which can be a number or string
#[turbo_tasks::value(shared, operation)]
#[derive(Debug, Clone, Hash, Ord, PartialOrd, DeterministicHash)]
#[serde(untagged)]
pub enum ModuleId {
    Number(u64),
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
        Ok(match id.parse::<u64>() {
            Ok(i) => ModuleId::Number(i),
            Err(_) => ModuleId::String(id.into()),
        })
    }
}

/// A list of module ids.
#[turbo_tasks::value(transparent, shared)]
pub struct ModuleIds(Vec<ResolvedVc<ModuleId>>);

/// A [Module] that can be converted into a [Chunk].
#[turbo_tasks::value_trait(local)]
pub trait ChunkableModule: Module + Asset {
    fn as_chunk_item(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn ChunkItem>>;
}

#[turbo_tasks::value(transparent)]
pub struct Chunks(Vec<ResolvedVc<Box<dyn Chunk>>>);

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

    fn chunk_items(self: Vc<Self>) -> Vc<ChunkItems> {
        ChunkItems(vec![]).cell()
    }
}

/// Aggregated information about a chunk content that can be used by the runtime
/// code to optimize chunk loading.
#[turbo_tasks::value(shared)]
#[derive(Default)]
pub struct OutputChunkRuntimeInfo {
    pub included_ids: Option<ResolvedVc<ModuleIds>>,
    pub excluded_ids: Option<ResolvedVc<ModuleIds>>,
    /// List of paths of chunks containing individual modules that are part of
    /// this chunk. This is useful for selectively loading modules from a chunk
    /// without loading the whole chunk.
    pub module_chunks: Option<ResolvedVc<OutputAssets>>,
    pub placeholder_for_future_extensions: (),
}

#[turbo_tasks::value_trait]
pub trait OutputChunk: Asset {
    fn runtime_info(self: Vc<Self>) -> Vc<OutputChunkRuntimeInfo>;
}

/// Specifies how a chunk interacts with other chunks when building a chunk
/// group
#[derive(
    Debug,
    Default,
    Clone,
    Hash,
    TraceRawVcs,
    Serialize,
    Deserialize,
    Eq,
    PartialEq,
    ValueDebugFormat,
    NonLocalValue,
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
    /// Create a new chunk group in a separate context, merging references with the same tag into a
    /// single chunk group. It does not inherit the available modules from the parent.
    // TODO implement
    Isolated {
        _ty: ChunkGroupType,
        _merge_tag: Option<RcStr>,
        _chunking_context: Option<ResolvedVc<Box<dyn ChunkingContext>>>,
    },
    /// Module not placed in chunk group, but its references are still followed and placed into the
    /// chunk group.
    Passthrough,
    // Module not placed in chunk group, but its references are still followed.
    Traced,
}

#[turbo_tasks::value(transparent)]
pub struct ChunkingTypeOption(Option<ChunkingType>);

/// A [ModuleReference] implementing this trait and returning Some(_) for
/// [ChunkableModuleReference::chunking_type] are considered as potentially
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

type AsyncInfo =
    FxIndexMap<ResolvedVc<Box<dyn ChunkableModule>>, Vec<ResolvedVc<Box<dyn ChunkableModule>>>>;

pub struct ChunkContentResult {
    pub chunkable_modules: FxIndexSet<ResolvedVc<Box<dyn ChunkableModule>>>,
    pub async_modules: FxIndexSet<ResolvedVc<Box<dyn ChunkableModule>>>,
    pub traced_modules: FxIndexSet<ResolvedVc<Box<dyn Module>>>,
    pub passthrough_modules: FxIndexSet<ResolvedVc<Box<dyn ChunkableModule>>>,
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
    chunk_entries: impl IntoIterator<Item = ResolvedVc<Box<dyn Module>>>,
    availability_info: AvailabilityInfo,
    can_split_async: bool,
    should_trace: bool,
) -> Result<ChunkContentResult> {
    chunk_content_internal_parallel(
        chunk_entries,
        availability_info,
        can_split_async,
        should_trace,
    )
    .await
}

#[derive(
    Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TraceRawVcs, Debug, NonLocalValue,
)]
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

#[derive(Eq, PartialEq, Clone, Hash, Serialize, Deserialize, TraceRawVcs, Debug, NonLocalValue)]
enum ChunkContentGraphNode {
    // A module not placed in the current chunk, but whose references we will
    // follow to find more graph nodes.
    PassthroughModule {
        module: ResolvedVc<Box<dyn ChunkableModule>>,
    },
    // Modules that are placed into the current chunk group
    Module {
        module: ResolvedVc<Box<dyn ChunkableModule>>,
        ident: ReadRef<RcStr>,
    },
    // Async module that is referenced from the chunk group
    AsyncModule {
        module: ResolvedVc<Box<dyn ChunkableModule>>,
    },
    // Module that is referenced as traced and will be turned into a separate RebasedAsset
    TracedModule {
        module: ResolvedVc<Box<dyn Module>>,
    },
    /// A list of directly referenced modules from which `is_async_module`
    /// will be inherited.
    InheritAsyncInfo {
        module: ResolvedVc<Box<dyn ChunkableModule>>,
        references: Vec<(ResolvedVc<Box<dyn ChunkableModule>>, InheritAsyncEdge)>,
    },
}

#[derive(Debug, Clone, Copy, TaskInput, PartialEq, Eq, Hash, Serialize, Deserialize)]
enum ChunkGraphNodeToReferences {
    PassthroughModule(ResolvedVc<Box<dyn ChunkableModule>>),
    Module(ResolvedVc<Box<dyn ChunkableModule>>),
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq, TraceRawVcs, NonLocalValue)]
struct ChunkGraphEdge {
    key: Option<ResolvedVc<Box<dyn Module>>>,
    node: ChunkContentGraphNode,
}

#[derive(Debug, Clone)]
#[turbo_tasks::value(transparent)]
struct ChunkGraphEdges(Vec<ChunkGraphEdge>);

#[turbo_tasks::function]
async fn graph_node_to_referenced_nodes_with_available_modules(
    node: ChunkGraphNodeToReferences,
    available_modules: Vc<AvailableModules>,
    can_split_async: bool,
    should_trace: bool,
) -> Result<Vc<ChunkGraphEdges>> {
    let edges = graph_node_to_referenced_nodes(node, can_split_async, should_trace);
    let edges_ref = edges.await?;
    for (unchanged, edge) in edges_ref.iter().enumerate() {
        if let ChunkContentGraphNode::Module { module, .. } = edge.node {
            if let Some(info) = *available_modules.get(*module).await? {
                let mut new_edges = Vec::with_capacity(edges_ref.len());
                new_edges.extend(edges_ref[0..unchanged].iter().cloned());
                let mut available_module_info = HashMap::new();
                available_module_info.insert(module, info);
                for edge in edges_ref[unchanged + 1..].iter() {
                    match edge.node {
                        ChunkContentGraphNode::Module { module, .. } => {
                            if let Some(info) = *available_modules.get(*module).await? {
                                available_module_info.insert(module, info);
                                continue;
                            }
                        }
                        ChunkContentGraphNode::InheritAsyncInfo {
                            module,
                            ref references,
                        } => {
                            let new_references = references
                                .iter()
                                .filter_map(|&(r, _)| {
                                    if let Some(info) = available_module_info.get(&r) {
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
                                    module,
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
    can_split_async: bool,
    should_trace: bool,
) -> Result<Vc<ChunkGraphEdges>> {
    let (parent, module_references) = match &node {
        ChunkGraphNodeToReferences::PassthroughModule(item) => (None, item.references()),
        ChunkGraphNodeToReferences::Module(item) => (Some(*item), item.references()),
    };

    let module_references = module_references.await?;
    let graph_nodes = module_references
        .iter()
        .map(|reference| async {
            let reference = *reference;
            let Some(chunkable_module_reference) =
                ResolvedVc::try_downcast::<Box<dyn ChunkableModuleReference>>(reference).await?
            else {
                return Ok(vec![]);
            };

            let Some(chunking_type) = &*chunkable_module_reference.chunking_type().await? else {
                return Ok(vec![]);
            };

            let module_data = reference
                .resolve_reference()
                .resolve()
                .await?
                .primary_modules()
                .await?
                .into_iter()
                .map(|&module| async move {
                    if matches!(chunking_type, ChunkingType::Traced) {
                        if should_trace {
                            return Ok((
                                Some(ChunkGraphEdge {
                                    key: None,
                                    node: ChunkContentGraphNode::TracedModule { module },
                                }),
                                None,
                            ));
                        } else {
                            return Ok((None, None));
                        }
                    }

                    let Some(chunkable_module) =
                        ResolvedVc::try_sidecast::<Box<dyn ChunkableModule>>(module).await?
                    else {
                        return Ok((None, None));
                    };

                    match chunking_type {
                        ChunkingType::Parallel => Ok((
                            Some(ChunkGraphEdge {
                                key: Some(module),
                                node: ChunkContentGraphNode::Module {
                                    module: chunkable_module,
                                    ident: module.ident().to_string().await?,
                                },
                            }),
                            None,
                        )),
                        ChunkingType::ParallelInheritAsync => Ok((
                            Some(ChunkGraphEdge {
                                key: Some(module),
                                node: ChunkContentGraphNode::Module {
                                    module: chunkable_module,
                                    ident: module.ident().to_string().await?,
                                },
                            }),
                            Some((chunkable_module, InheritAsyncEdge::LocalModule)),
                        )),
                        ChunkingType::Passthrough => Ok((
                            Some(ChunkGraphEdge {
                                key: None,
                                node: ChunkContentGraphNode::PassthroughModule {
                                    module: chunkable_module,
                                },
                            }),
                            None,
                        )),
                        ChunkingType::Async => {
                            if can_split_async {
                                Ok((
                                    Some(ChunkGraphEdge {
                                        key: None,
                                        node: ChunkContentGraphNode::AsyncModule {
                                            module: chunkable_module,
                                        },
                                    }),
                                    None,
                                ))
                            } else {
                                Ok((
                                    Some(ChunkGraphEdge {
                                        key: Some(module),
                                        node: ChunkContentGraphNode::Module {
                                            module: chunkable_module,
                                            ident: module.ident().to_string().await?,
                                        },
                                    }),
                                    None,
                                ))
                            }
                        }
                        ChunkingType::Isolated { .. } => {
                            // TODO implement
                            Ok((None, None))
                        }
                        ChunkingType::Traced => {
                            bail!("unreachable ChunkingType::Traced");
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
                            module: parent,
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
    available_chunk_items: Option<ResolvedVc<AvailableModules>>,
    processed_modules: HashSet<ResolvedVc<Box<dyn Module>>>,
    should_trace: bool,
    can_split_async: bool,
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
            if matches!(node, ChunkContentGraphNode::PassthroughModule { .. }) {
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

        let available_chunk_items = self.available_chunk_items;
        let can_split_async = self.can_split_async;
        let should_trace = self.should_trace;

        async move {
            let node = match node {
                ChunkContentGraphNode::PassthroughModule { module: item } => {
                    ChunkGraphNodeToReferences::PassthroughModule(item)
                }
                ChunkContentGraphNode::Module { module: item, .. } => {
                    ChunkGraphNodeToReferences::Module(item)
                }
                _ => {
                    return Ok(None.into_iter().flatten());
                }
            };

            let nodes = if let Some(available_chunk_items) = available_chunk_items {
                graph_node_to_referenced_nodes_with_available_modules(
                    node,
                    *available_chunk_items,
                    can_split_async,
                    should_trace,
                )
            } else {
                graph_node_to_referenced_nodes(node, can_split_async, should_trace)
            }
            .await?;
            Ok(Some(nodes.into_iter().cloned()).into_iter().flatten())
        }
    }

    fn span(&mut self, node: &ChunkContentGraphNode) -> Span {
        if let ChunkContentGraphNode::Module { ident, .. } = node {
            info_span!("chunking module", name = display(ident))
        } else {
            Span::current()
        }
    }
}

async fn chunk_content_internal_parallel(
    chunk_entries: impl IntoIterator<Item = ResolvedVc<Box<dyn Module>>>,
    availability_info: AvailabilityInfo,
    can_split_async: bool,
    should_trace: bool,
) -> Result<ChunkContentResult> {
    let root_edges = chunk_entries
        .into_iter()
        .map(|entry| async move {
            let Some(chunkable_module) =
                ResolvedVc::try_downcast::<Box<dyn ChunkableModule>>(entry).await?
            else {
                return Ok(None);
            };
            Ok(Some(ChunkGraphEdge {
                key: Some(entry),
                node: ChunkContentGraphNode::Module {
                    module: chunkable_module,
                    ident: chunkable_module.ident().to_string().await?,
                },
            }))
        })
        .try_flat_join()
        .await?;

    let visit = ChunkContentVisit {
        available_chunk_items: availability_info.available_modules(),
        processed_modules: Default::default(),
        can_split_async,
        should_trace,
    };

    let GraphTraversalResult::Completed(traversal_result) =
        AdjacencyMap::new().visit(root_edges, visit).await
    else {
        unreachable!();
    };

    let graph_nodes: Vec<_> = traversal_result?.into_reverse_topological().collect();

    let mut chunkable_modules = FxIndexSet::default();
    let mut async_modules = FxIndexSet::default();
    let mut passthrough_modules = FxIndexSet::default();
    let mut forward_edges_inherit_async = FxIndexMap::default();
    let mut local_back_edges_inherit_async = FxIndexMap::default();
    let mut available_async_modules_back_edges_inherit_async = FxIndexMap::default();
    let mut traced_modules = FxIndexSet::default();

    for graph_node in graph_nodes {
        match graph_node {
            ChunkContentGraphNode::PassthroughModule { module } => {
                passthrough_modules.insert(module);
            }
            ChunkContentGraphNode::TracedModule { module } => {
                traced_modules.insert(module);
            }
            ChunkContentGraphNode::Module { module: item, .. } => {
                chunkable_modules.insert(item);
            }
            ChunkContentGraphNode::AsyncModule { module } => {
                async_modules.insert(module);
            }
            ChunkContentGraphNode::InheritAsyncInfo {
                module: item,
                references,
            } => {
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
        chunkable_modules,
        async_modules,
        traced_modules,
        passthrough_modules,
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
    /// A [ChunkItem] can reference OutputAssets, unlike [Module]s referencing other [Module]s.
    fn references(self: Vc<Self>) -> Vc<OutputAssets> {
        OutputAssets::empty()
    }

    /// The type of chunk this item should be assembled into.
    fn ty(self: Vc<Self>) -> Vc<Box<dyn ChunkType>>;

    /// A temporary method to retrieve the module associated with this
    /// ChunkItem. TODO: Remove this as part of the chunk refactoring.
    fn module(self: Vc<Self>) -> Vc<Box<dyn Module>>;

    fn chunking_context(self: Vc<Self>) -> Vc<Box<dyn ChunkingContext>>;
}

#[turbo_tasks::value_trait]
pub trait ChunkType: ValueToString {
    /// Whether the source (reference) order of items needs to be retained during chunking.
    fn must_keep_item_order(self: Vc<Self>) -> Vc<bool>;

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

pub fn round_chunk_item_size(size: usize) -> usize {
    let a = size.next_power_of_two();
    size & (a | (a >> 1) | (a >> 2))
}

#[turbo_tasks::value(transparent)]
pub struct ChunkItems(pub Vec<ResolvedVc<Box<dyn ChunkItem>>>);

#[turbo_tasks::value]
pub struct AsyncModuleInfo {
    pub referenced_async_modules: AutoSet<ResolvedVc<Box<dyn ChunkableModule>>>,
}

#[turbo_tasks::value_impl]
impl AsyncModuleInfo {
    #[turbo_tasks::function]
    pub async fn new(
        referenced_async_modules: Vec<ResolvedVc<Box<dyn ChunkableModule>>>,
    ) -> Result<Vc<Self>> {
        Ok(Self {
            referenced_async_modules: referenced_async_modules.into_iter().collect(),
        }
        .cell())
    }
}

#[derive(
    Copy,
    Debug,
    Clone,
    Serialize,
    Deserialize,
    PartialEq,
    Eq,
    Hash,
    TraceRawVcs,
    TaskInput,
    NonLocalValue,
)]
pub enum ChunkItemTy {
    /// The ChunkItem should be included as content in the chunk.
    Included,
    /// The ChunkItem should be used to trace references but should not included in the chunk.
    Passthrough,
}

#[derive(
    Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Hash, TraceRawVcs, TaskInput, NonLocalValue,
)]
// #[turbo_tasks::value]
pub struct ChunkItemWithAsyncModuleInfo {
    pub ty: ChunkItemTy,
    pub chunk_item: ResolvedVc<Box<dyn ChunkItem>>,
    pub async_info: Option<ResolvedVc<AsyncModuleInfo>>,
}

#[turbo_tasks::value(transparent)]
pub struct ChunkItemsWithAsyncModuleInfo(Vec<ChunkItemWithAsyncModuleInfo>);

pub trait ChunkItemExt {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_round_chunk_item_size() {
        assert_eq!(round_chunk_item_size(0), 0);
        assert_eq!(round_chunk_item_size(1), 1);
        assert_eq!(round_chunk_item_size(2), 2);
        assert_eq!(round_chunk_item_size(3), 3);
        assert_eq!(round_chunk_item_size(4), 4);
        assert_eq!(round_chunk_item_size(5), 4);
        assert_eq!(round_chunk_item_size(6), 6);
        assert_eq!(round_chunk_item_size(7), 6);
        assert_eq!(round_chunk_item_size(8), 8);

        assert_eq!(changes_in_range(0..1000), 19);
        assert_eq!(changes_in_range(1000..2000), 2);
        assert_eq!(changes_in_range(2000..3000), 1);

        assert_eq!(changes_in_range(3000..10000), 4);

        fn changes_in_range(range: std::ops::Range<usize>) -> usize {
            let len = range.len();
            let mut count = 0;
            for i in range {
                let a = round_chunk_item_size(i);
                assert!(a >= i * 2 / 3);
                assert!(a <= i);
                let b = round_chunk_item_size(i + 1);

                if a == b {
                    count += 1;
                }
            }
            len - count
        }
    }
}
