use std::future::Future;

use anyhow::Result;
use rustc_hash::FxHashSet;
use serde::{Deserialize, Serialize};
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    debug::ValueDebugFormat,
    graph::{AdjacencyMap, GraphTraversal, Visit, VisitControlFlow},
    trace::TraceRawVcs,
    FxIndexMap, FxIndexSet, NonLocalValue, ReadRef, ResolvedVc, TryJoinIterExt, ValueToString, Vc,
};
use turbo_tasks_fs::FileSystemPath;
use turbopack::css::chunk::CssChunkPlaceable;
use turbopack_core::{
    chunk::ChunkingType, module::Module, reference::primary_chunkable_referenced_modules,
};

use crate::{
    next_client_reference::{
        ecmascript_client_reference::ecmascript_client_reference_module::EcmascriptClientReferenceModule,
        CssClientReferenceModule,
    },
    next_server_component::server_component_module::NextServerComponentModule,
    next_server_utility::server_utility_module::NextServerUtilityModule,
};

#[derive(
    Copy,
    Clone,
    Eq,
    PartialEq,
    Hash,
    Serialize,
    Deserialize,
    Debug,
    ValueDebugFormat,
    TraceRawVcs,
    NonLocalValue,
)]
pub struct ClientReference {
    pub server_component: Option<ResolvedVc<NextServerComponentModule>>,
    pub ty: ClientReferenceType,
}

impl ClientReference {
    pub fn server_component(&self) -> Option<ResolvedVc<NextServerComponentModule>> {
        self.server_component
    }

    pub fn ty(&self) -> ClientReferenceType {
        self.ty
    }
}

#[derive(
    Copy,
    Clone,
    Eq,
    PartialEq,
    Hash,
    Serialize,
    Deserialize,
    Debug,
    ValueDebugFormat,
    TraceRawVcs,
    NonLocalValue,
)]
pub enum ClientReferenceType {
    EcmascriptClientReference(ResolvedVc<EcmascriptClientReferenceModule>),
    CssClientReference(ResolvedVc<Box<dyn CssChunkPlaceable>>),
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub struct ClientReferenceGraphResult {
    pub client_references: Vec<ClientReference>,
    /// Only the [`ClientReferenceType::EcmascriptClientReference`]s are listed in this map.
    #[allow(clippy::type_complexity)]
    pub client_references_by_server_component:
        FxIndexMap<Option<ResolvedVc<NextServerComponentModule>>, Vec<ResolvedVc<Box<dyn Module>>>>,
    pub server_component_entries: Vec<ResolvedVc<NextServerComponentModule>>,
    pub server_utils: Vec<ResolvedVc<Box<dyn Module>>>,
    pub visited_nodes: ResolvedVc<VisitedClientReferenceGraphNodes>,
}

impl Default for ClientReferenceGraphResult {
    fn default() -> Self {
        ClientReferenceGraphResult {
            client_references: Default::default(),
            client_references_by_server_component: Default::default(),
            server_component_entries: Default::default(),
            server_utils: Default::default(),
            visited_nodes: VisitedClientReferenceGraphNodes(Default::default()).resolved_cell(),
        }
    }
}

#[turbo_tasks::value(shared)]
pub struct VisitedClientReferenceGraphNodes(FxHashSet<VisitClientReferenceNode>);

#[turbo_tasks::value_impl]
impl VisitedClientReferenceGraphNodes {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        VisitedClientReferenceGraphNodes(Default::default()).cell()
    }
}

#[turbo_tasks::value(transparent)]
pub struct ClientReferenceTypes(FxIndexSet<ClientReferenceType>);

#[turbo_tasks::value_impl]
impl ClientReferenceGraphResult {
    #[turbo_tasks::function]
    pub fn types(&self) -> Vc<ClientReferenceTypes> {
        Vc::cell(
            self.client_references
                .iter()
                .map(|r| r.ty())
                .collect::<FxIndexSet<_>>(),
        )
    }
}

impl ClientReferenceGraphResult {
    /// Merges multiple return values of client_reference_graph together.
    pub fn extend(&mut self, other: &Self) {
        self.client_references
            .extend(other.client_references.iter().copied());
        for (k, v) in other.client_references_by_server_component.iter() {
            self.client_references_by_server_component
                .entry(*k)
                .or_insert_with(Vec::new)
                .extend(v);
        }
        self.server_component_entries
            .extend(other.server_component_entries.iter().copied());
        self.server_utils.extend(other.server_utils.iter().copied());
        // This is merged already by `client_reference_graph` itself
        self.visited_nodes = other.visited_nodes;
    }
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub struct ServerEntries {
    pub server_component_entries: Vec<ResolvedVc<NextServerComponentModule>>,
    pub server_utils: Vec<ResolvedVc<Box<dyn Module>>>,
}

#[turbo_tasks::function]
pub async fn find_server_entries(entry: ResolvedVc<Box<dyn Module>>) -> Result<Vc<ServerEntries>> {
    async move {
        let entry_path = entry.ident().path().to_resolved().await?;
        let graph = AdjacencyMap::new()
            .skip_duplicates()
            .visit(
                vec![VisitClientReferenceNode {
                    state: { VisitClientReferenceNodeState::Entry { entry_path } },
                    ty: VisitClientReferenceNodeType::Internal(
                        entry,
                        entry.ident().to_string().await?,
                    ),
                }],
                VisitClientReference {
                    stop_at_server_entries: true,
                },
            )
            .await
            .completed()?
            .into_inner();

        let mut server_component_entries = vec![];
        let mut server_utils = vec![];
        for node in graph.reverse_topological() {
            match &node.ty {
                VisitClientReferenceNodeType::ServerUtilEntry(server_util, _) => {
                    server_utils.push(*server_util);
                }
                VisitClientReferenceNodeType::ServerComponentEntry(server_component, _) => {
                    server_component_entries.push(*server_component);
                }
                VisitClientReferenceNodeType::Internal(_, _)
                | VisitClientReferenceNodeType::ClientReference(_, _) => {}
            }
        }

        Ok(ServerEntries {
            server_component_entries,
            server_utils,
        }
        .cell())
    }
    .instrument(tracing::info_span!("find server entries"))
    .await
}

struct VisitClientReference {
    /// Used to discover ServerComponents and ServerUtils
    stop_at_server_entries: bool,
}

#[derive(
    Clone,
    Eq,
    PartialEq,
    Hash,
    Serialize,
    Deserialize,
    Debug,
    ValueDebugFormat,
    TraceRawVcs,
    NonLocalValue,
)]
struct VisitClientReferenceNode {
    state: VisitClientReferenceNodeState,
    ty: VisitClientReferenceNodeType,
}

#[derive(
    Clone,
    Copy,
    Eq,
    PartialEq,
    Hash,
    Serialize,
    Deserialize,
    Debug,
    ValueDebugFormat,
    TraceRawVcs,
    NonLocalValue,
)]
enum VisitClientReferenceNodeState {
    Entry {
        entry_path: ResolvedVc<FileSystemPath>,
    },
    InServerComponent {
        server_component: ResolvedVc<NextServerComponentModule>,
    },
    InServerUtil,
}
impl VisitClientReferenceNodeState {
    fn server_component(&self) -> Option<ResolvedVc<NextServerComponentModule>> {
        match self {
            VisitClientReferenceNodeState::Entry { .. } => None,
            VisitClientReferenceNodeState::InServerComponent { server_component } => {
                Some(*server_component)
            }
            VisitClientReferenceNodeState::InServerUtil => None,
        }
    }
}

#[derive(
    Clone,
    Eq,
    PartialEq,
    Hash,
    Serialize,
    Deserialize,
    Debug,
    ValueDebugFormat,
    TraceRawVcs,
    NonLocalValue,
)]
enum VisitClientReferenceNodeType {
    ClientReference(ClientReference, ReadRef<RcStr>),
    ServerComponentEntry(ResolvedVc<NextServerComponentModule>, ReadRef<RcStr>),
    ServerUtilEntry(ResolvedVc<Box<dyn Module>>, ReadRef<RcStr>),
    Internal(ResolvedVc<Box<dyn Module>>, ReadRef<RcStr>),
}

impl Visit<VisitClientReferenceNode> for VisitClientReference {
    type Edge = VisitClientReferenceNode;
    type EdgesIntoIter = Vec<Self::Edge>;
    type EdgesFuture = impl Future<Output = Result<Self::EdgesIntoIter>>;

    fn visit(&mut self, edge: Self::Edge) -> VisitControlFlow<VisitClientReferenceNode> {
        if self.stop_at_server_entries
            && matches!(
                edge.ty,
                VisitClientReferenceNodeType::ServerUtilEntry(..)
                    | VisitClientReferenceNodeType::ServerComponentEntry(..)
            )
        {
            return VisitControlFlow::Skip(edge);
        }

        match edge.ty {
            VisitClientReferenceNodeType::ClientReference(..) => VisitControlFlow::Skip(edge),
            VisitClientReferenceNodeType::Internal(..)
            | VisitClientReferenceNodeType::ServerUtilEntry(..)
            | VisitClientReferenceNodeType::ServerComponentEntry(..) => {
                VisitControlFlow::Continue(edge)
            }
        }
    }

    fn edges(&mut self, node: &VisitClientReferenceNode) -> Self::EdgesFuture {
        let node = node.clone();
        async move {
            let parent_module = match node.ty {
                // This should never occur since we always skip visiting these
                // nodes' edges.
                VisitClientReferenceNodeType::ClientReference(..) => return Ok(vec![]),
                VisitClientReferenceNodeType::Internal(module, _) => module,
                VisitClientReferenceNodeType::ServerUtilEntry(module, _) => module,
                VisitClientReferenceNodeType::ServerComponentEntry(module, _) => {
                    ResolvedVc::upcast(module)
                }
            };

            let referenced_modules = primary_chunkable_referenced_modules(*parent_module).await?;

            let referenced_modules = referenced_modules
                .iter()
                .flat_map(|(chunking_type, modules)| match chunking_type {
                    ChunkingType::Traced => None,
                    _ => Some(modules.iter()),
                })
                .flatten()
                .map(|module| async move {
                    if let Some(client_reference_module) =
                        ResolvedVc::try_downcast_type::<EcmascriptClientReferenceModule>(*module)
                    {
                        return Ok(VisitClientReferenceNode {
                            state: node.state,
                            ty: VisitClientReferenceNodeType::ClientReference(
                                ClientReference {
                                    server_component: node.state.server_component(),
                                    ty: ClientReferenceType::EcmascriptClientReference(
                                        client_reference_module,
                                    ),
                                },
                                client_reference_module.ident().to_string().await?,
                            ),
                        });
                    }

                    if let Some(client_reference_module) =
                        ResolvedVc::try_downcast_type::<CssClientReferenceModule>(*module)
                    {
                        return Ok(VisitClientReferenceNode {
                            state: node.state,
                            ty: VisitClientReferenceNodeType::ClientReference(
                                ClientReference {
                                    server_component: node.state.server_component(),
                                    ty: ClientReferenceType::CssClientReference(
                                        client_reference_module.await?.client_module,
                                    ),
                                },
                                client_reference_module.ident().to_string().await?,
                            ),
                        });
                    }

                    if let Some(server_component_asset) =
                        ResolvedVc::try_downcast_type::<NextServerComponentModule>(*module)
                    {
                        return Ok(VisitClientReferenceNode {
                            state: VisitClientReferenceNodeState::InServerComponent {
                                server_component: server_component_asset,
                            },
                            ty: VisitClientReferenceNodeType::ServerComponentEntry(
                                server_component_asset,
                                server_component_asset.ident().to_string().await?,
                            ),
                        });
                    }

                    if ResolvedVc::try_downcast_type::<NextServerUtilityModule>(*module).is_some() {
                        return Ok(VisitClientReferenceNode {
                            state: VisitClientReferenceNodeState::InServerUtil,
                            ty: VisitClientReferenceNodeType::ServerUtilEntry(
                                *module,
                                module.ident().to_string().await?,
                            ),
                        });
                    }

                    Ok(VisitClientReferenceNode {
                        state: node.state,
                        ty: VisitClientReferenceNodeType::Internal(
                            *module,
                            module.ident().to_string().await?,
                        ),
                    })
                });

            let assets = referenced_modules.try_join().await?;

            Ok(assets)
        }
    }

    fn span(&mut self, node: &VisitClientReferenceNode) -> tracing::Span {
        match &node.ty {
            VisitClientReferenceNodeType::ClientReference(_, name) => {
                tracing::info_span!("client reference", name = name.to_string())
            }
            VisitClientReferenceNodeType::Internal(_, name) => {
                tracing::info_span!("module", name = name.to_string())
            }
            VisitClientReferenceNodeType::ServerUtilEntry(_, name) => {
                tracing::info_span!("server util", name = name.to_string())
            }
            VisitClientReferenceNodeType::ServerComponentEntry(_, name) => {
                tracing::info_span!("layout segment", name = name.to_string())
            }
        }
    }
}
