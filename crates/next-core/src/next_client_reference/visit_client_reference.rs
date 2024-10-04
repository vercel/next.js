use std::future::Future;

use anyhow::Result;
use indexmap::{IndexMap, IndexSet};
use serde::{Deserialize, Serialize};
use tracing::Instrument;
use turbo_tasks::{
    debug::ValueDebugFormat,
    graph::{AdjacencyMap, GraphTraversal, Visit, VisitControlFlow},
    trace::TraceRawVcs,
    RcStr, ReadRef, TryJoinIterExt, ValueToString, Vc,
};
use turbo_tasks_fs::FileSystemPath;
use turbopack::css::CssModuleAsset;
use turbopack_core::{
    module::{Module, Modules},
    reference::primary_referenced_modules,
};

use super::ecmascript_client_reference::ecmascript_client_reference_module::EcmascriptClientReferenceModule;
use crate::next_server_component::server_component_module::NextServerComponentModule;

#[derive(
    Copy, Clone, Eq, PartialEq, Hash, Serialize, Deserialize, Debug, ValueDebugFormat, TraceRawVcs,
)]
pub struct ClientReference {
    server_component: Option<Vc<NextServerComponentModule>>,
    ty: ClientReferenceType,
}

impl ClientReference {
    pub fn server_component(&self) -> Option<Vc<NextServerComponentModule>> {
        self.server_component
    }

    pub fn ty(&self) -> ClientReferenceType {
        self.ty
    }
}

#[derive(
    Copy, Clone, Eq, PartialEq, Hash, Serialize, Deserialize, Debug, ValueDebugFormat, TraceRawVcs,
)]
pub enum ClientReferenceType {
    EcmascriptClientReference(Vc<EcmascriptClientReferenceModule>),
    CssClientReference(Vc<CssModuleAsset>),
}

#[turbo_tasks::value]
#[derive(Debug)]
pub struct ClientReferenceGraphResult {
    pub client_references: Vec<ClientReference>,
    /// Only the [`ClientReferenceType::EcmascriptClientReference`]s are listed in this map.
    #[allow(clippy::type_complexity)]
    pub client_references_by_server_component:
        IndexMap<Option<Vc<NextServerComponentModule>>, Vec<Vc<Box<dyn Module>>>>,
    pub server_component_entries: Vec<Vc<NextServerComponentModule>>,
    pub server_utils: Vec<Vc<Box<dyn Module>>>,
}

#[turbo_tasks::value(transparent)]
pub struct ClientReferenceTypes(IndexSet<ClientReferenceType>);

#[turbo_tasks::value_impl]
impl ClientReferenceGraphResult {
    #[turbo_tasks::function]
    pub fn types(&self) -> Vc<ClientReferenceTypes> {
        Vc::cell(
            self.client_references
                .iter()
                .map(|r| r.ty())
                .collect::<IndexSet<_>>(),
        )
    }
}

#[turbo_tasks::function]
pub async fn client_reference_graph(
    entries: Vc<Modules>,
) -> Result<Vc<ClientReferenceGraphResult>> {
    async move {
        let entries = entries.await?;

        let mut client_references = vec![];
        let mut server_component_entries = vec![];
        let mut server_utils = vec![];

        let mut client_references_by_server_component = IndexMap::new();
        // Make sure None (for the various internal next/dist/esm/client/components/*) is listed
        // first
        client_references_by_server_component.insert(None, Vec::new());

        let graph = AdjacencyMap::new()
            .skip_duplicates()
            .visit(
                entries
                    .iter()
                    .copied()
                    .map(|module| async move {
                        Ok(VisitClientReferenceNode {
                            state: VisitClientReferenceNodeState::Entry {
                                entry_path: module.ident().path().resolve().await?,
                            },
                            ty: VisitClientReferenceNodeType::Internal(
                                module,
                                module.ident().to_string().await?,
                            ),
                        })
                    })
                    .try_join()
                    .await?,
                VisitClientReference,
            )
            .await
            .completed()?
            .into_inner()
            .into_reverse_topological();

        for node in graph {
            match &node.ty {
                VisitClientReferenceNodeType::Internal(_asset, _) => {
                    // No-op. These nodes are only useful during graph
                    // traversal.
                }
                VisitClientReferenceNodeType::ClientReference(client_reference, _) => {
                    client_references.push(*client_reference);

                    if let ClientReferenceType::EcmascriptClientReference(entry) =
                        client_reference.ty()
                    {
                        client_references_by_server_component
                            .entry(client_reference.server_component)
                            .or_insert_with(Vec::new)
                            .push(Vc::upcast::<Box<dyn Module>>(entry.await?.ssr_module));
                    }
                }
                VisitClientReferenceNodeType::ServerUtilEntry(server_util, _) => {
                    server_utils.push(*server_util);
                }
                VisitClientReferenceNodeType::ServerComponentEntry(server_component, _) => {
                    server_component_entries.push(*server_component);
                }
            }
        }

        Ok(ClientReferenceGraphResult {
            client_references,
            client_references_by_server_component,
            server_component_entries,
            server_utils,
        }
        .cell())
    }
    .instrument(tracing::info_span!("find client references"))
    .await
}

struct VisitClientReference;

#[derive(
    Clone, Eq, PartialEq, Hash, Serialize, Deserialize, Debug, ValueDebugFormat, TraceRawVcs,
)]
struct VisitClientReferenceNode {
    state: VisitClientReferenceNodeState,
    ty: VisitClientReferenceNodeType,
}

#[derive(
    Clone, Copy, Eq, PartialEq, Hash, Serialize, Deserialize, Debug, ValueDebugFormat, TraceRawVcs,
)]
enum VisitClientReferenceNodeState {
    Entry {
        entry_path: Vc<FileSystemPath>,
    },
    InServerComponent {
        server_component: Vc<NextServerComponentModule>,
    },
    InServerUtil,
}
impl VisitClientReferenceNodeState {
    fn server_component(&self) -> Option<Vc<NextServerComponentModule>> {
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
    Clone, Eq, PartialEq, Hash, Serialize, Deserialize, Debug, ValueDebugFormat, TraceRawVcs,
)]
enum VisitClientReferenceNodeType {
    ClientReference(ClientReference, ReadRef<RcStr>),
    ServerComponentEntry(Vc<NextServerComponentModule>, ReadRef<RcStr>),
    ServerUtilEntry(Vc<Box<dyn Module>>, ReadRef<RcStr>),
    Internal(Vc<Box<dyn Module>>, ReadRef<RcStr>),
}

impl Visit<VisitClientReferenceNode> for VisitClientReference {
    type Edge = VisitClientReferenceNode;
    type EdgesIntoIter = Vec<Self::Edge>;
    type EdgesFuture = impl Future<Output = Result<Self::EdgesIntoIter>>;

    fn visit(&mut self, edge: Self::Edge) -> VisitControlFlow<VisitClientReferenceNode> {
        match edge.ty {
            VisitClientReferenceNodeType::ClientReference(..) => VisitControlFlow::Skip(edge),
            VisitClientReferenceNodeType::Internal(..) => VisitControlFlow::Continue(edge),
            VisitClientReferenceNodeType::ServerUtilEntry(..) => VisitControlFlow::Continue(edge),
            VisitClientReferenceNodeType::ServerComponentEntry(..) => {
                VisitControlFlow::Continue(edge)
            }
        }
    }

    fn edges(&mut self, node: &VisitClientReferenceNode) -> Self::EdgesFuture {
        let node = node.clone();
        async move {
            let module = match node.ty {
                // This should never occur since we always skip visiting these
                // nodes' edges.
                VisitClientReferenceNodeType::ClientReference(..) => return Ok(vec![]),
                VisitClientReferenceNodeType::Internal(module, _) => module,
                VisitClientReferenceNodeType::ServerUtilEntry(module, _) => module,
                VisitClientReferenceNodeType::ServerComponentEntry(module, _) => Vc::upcast(module),
            };

            let referenced_modules = primary_referenced_modules(module).await?;

            let referenced_modules = referenced_modules.iter().map(|module| async move {
                let module = module.resolve().await?;
                if let Some(client_reference_module) =
                    Vc::try_resolve_downcast_type::<EcmascriptClientReferenceModule>(module).await?
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

                if let Some(css_client_reference_asset) =
                    Vc::try_resolve_downcast_type::<CssModuleAsset>(module).await?
                {
                    return Ok(VisitClientReferenceNode {
                        state: node.state,
                        ty: VisitClientReferenceNodeType::ClientReference(
                            ClientReference {
                                server_component: node.state.server_component(),
                                ty: ClientReferenceType::CssClientReference(
                                    css_client_reference_asset,
                                ),
                            },
                            css_client_reference_asset.ident().to_string().await?,
                        ),
                    });
                }

                if let Some(server_component_asset) =
                    Vc::try_resolve_downcast_type::<NextServerComponentModule>(module).await?
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

                if let VisitClientReferenceNodeState::Entry { entry_path } = &node.state {
                    if module.ident().path().resolve().await? != *entry_path {
                        return Ok(VisitClientReferenceNode {
                            state: VisitClientReferenceNodeState::InServerUtil,
                            ty: VisitClientReferenceNodeType::ServerUtilEntry(
                                module,
                                module.ident().to_string().await?,
                            ),
                        });
                    }
                }

                Ok(VisitClientReferenceNode {
                    state: node.state,
                    ty: VisitClientReferenceNodeType::Internal(
                        module,
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
