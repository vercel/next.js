use std::future::Future;

use anyhow::Result;
use indexmap::IndexSet;
use serde::{Deserialize, Serialize};
use tracing::Instrument;
use turbo_tasks::{
    debug::ValueDebugFormat,
    graph::{AdjacencyMap, GraphTraversal, Visit, VisitControlFlow},
    trace::TraceRawVcs,
    ReadRef, TryJoinIterExt, ValueToString, Vc,
};
use turbopack_binding::turbopack::core::{
    module::{Module, Modules},
    reference::primary_referenced_modules,
};

use super::{
    css_client_reference::css_client_reference_module::CssClientReferenceModule,
    ecmascript_client_reference::ecmascript_client_reference_module::EcmascriptClientReferenceModule,
};
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
    CssClientReference(Vc<CssClientReferenceModule>),
}

#[turbo_tasks::value]
pub struct ClientReferenceGraphResult {
    pub client_references: Vec<ClientReference>,
    pub server_component_entries: Vec<Vc<NextServerComponentModule>>,
}

#[turbo_tasks::value(transparent)]
pub struct ClientReferenceTypes(IndexSet<ClientReferenceType>);

#[turbo_tasks::value(transparent)]
pub struct ClientReferenceGraph {
    graph: AdjacencyMap<VisitClientReferenceNode>,
}

#[turbo_tasks::value_impl]
impl ClientReferenceGraph {
    #[turbo_tasks::function]
    pub async fn new(entries: Vc<Modules>) -> Result<Vc<Self>> {
        async move {
            let entries = entries.await?;

            let graph = AdjacencyMap::new()
                .skip_duplicates()
                .visit(
                    entries
                        .iter()
                        .copied()
                        .map(|module| async move {
                            Ok(VisitClientReferenceNode {
                                server_component: None,
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
                .into_inner();

            Ok(ClientReferenceGraph { graph }.cell())
        }
        .instrument(tracing::info_span!("find client references"))
        .await
    }

    #[turbo_tasks::function]
    pub async fn types(self: Vc<Self>) -> Result<Vc<ClientReferenceTypes>> {
        let this = self.await?;
        let mut client_reference_types = IndexSet::new();

        for node in this.graph.reverse_topological() {
            match &node.ty {
                VisitClientReferenceNodeType::Internal(..)
                | VisitClientReferenceNodeType::ServerComponentEntry(..) => {
                    // No-op. These nodes are only useful during graph
                    // traversal.
                }
                VisitClientReferenceNodeType::ClientReference(client_reference, _) => {
                    client_reference_types.insert(client_reference.ty());
                }
            }
        }

        Ok(Vc::cell(client_reference_types))
    }

    #[turbo_tasks::function]
    pub async fn entry(
        self: Vc<Self>,
        entry: Vc<Box<dyn Module>>,
    ) -> Result<Vc<ClientReferenceGraphResult>> {
        let this = self.await?;
        let mut client_references = vec![];
        let mut server_component_entries = vec![];

        for node in this
            .graph
            .reverse_topological_from_node(&VisitClientReferenceNode {
                server_component: None,
                ty: VisitClientReferenceNodeType::Internal(entry, entry.ident().to_string().await?),
            })
        {
            match &node.ty {
                VisitClientReferenceNodeType::Internal(_asset, _) => {
                    // No-op. These nodes are only useful during graph
                    // traversal.
                }
                VisitClientReferenceNodeType::ClientReference(client_reference, _) => {
                    client_references.push(*client_reference);
                }
                VisitClientReferenceNodeType::ServerComponentEntry(server_component, _) => {
                    server_component_entries.push(*server_component);
                }
            }
        }

        Ok(ClientReferenceGraphResult {
            client_references,
            server_component_entries,
        }
        .cell())
    }
}

struct VisitClientReference;

#[derive(
    Clone, Eq, PartialEq, Hash, Serialize, Deserialize, Debug, ValueDebugFormat, TraceRawVcs,
)]
struct VisitClientReferenceNode {
    server_component: Option<Vc<NextServerComponentModule>>,
    ty: VisitClientReferenceNodeType,
}

#[derive(
    Clone, Eq, PartialEq, Hash, Serialize, Deserialize, Debug, ValueDebugFormat, TraceRawVcs,
)]
enum VisitClientReferenceNodeType {
    ClientReference(ClientReference, ReadRef<String>),
    ServerComponentEntry(Vc<NextServerComponentModule>, ReadRef<String>),
    Internal(Vc<Box<dyn Module>>, ReadRef<String>),
}

impl Visit<VisitClientReferenceNode> for VisitClientReference {
    type Edge = VisitClientReferenceNode;
    type EdgesIntoIter = Vec<Self::Edge>;
    type EdgesFuture = impl Future<Output = Result<Self::EdgesIntoIter>>;

    fn visit(&mut self, edge: Self::Edge) -> VisitControlFlow<VisitClientReferenceNode> {
        match edge.ty {
            VisitClientReferenceNodeType::ClientReference(..) => VisitControlFlow::Skip(edge),
            VisitClientReferenceNodeType::Internal(..) => VisitControlFlow::Continue(edge),
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
                VisitClientReferenceNodeType::ServerComponentEntry(module, _) => Vc::upcast(module),
            };

            let referenced_modules = primary_referenced_modules(module).await?;

            let referenced_modules = referenced_modules.iter().map(|module| async move {
                let module = module.resolve().await?;
                if let Some(client_reference_module) =
                    Vc::try_resolve_downcast_type::<EcmascriptClientReferenceModule>(module).await?
                {
                    return Ok(VisitClientReferenceNode {
                        server_component: node.server_component,
                        ty: VisitClientReferenceNodeType::ClientReference(
                            ClientReference {
                                server_component: node.server_component,
                                ty: ClientReferenceType::EcmascriptClientReference(
                                    client_reference_module,
                                ),
                            },
                            client_reference_module.ident().to_string().await?,
                        ),
                    });
                }

                if let Some(css_client_reference_asset) =
                    Vc::try_resolve_downcast_type::<CssClientReferenceModule>(module).await?
                {
                    return Ok(VisitClientReferenceNode {
                        server_component: node.server_component,
                        ty: VisitClientReferenceNodeType::ClientReference(
                            ClientReference {
                                server_component: node.server_component,
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
                        server_component: Some(server_component_asset),
                        ty: VisitClientReferenceNodeType::ServerComponentEntry(
                            server_component_asset,
                            server_component_asset.ident().to_string().await?,
                        ),
                    });
                }

                Ok(VisitClientReferenceNode {
                    server_component: node.server_component,
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
                tracing::info_span!("client reference", name = **name)
            }
            VisitClientReferenceNodeType::Internal(_, name) => {
                tracing::info_span!("module", name = **name)
            }
            VisitClientReferenceNodeType::ServerComponentEntry(_, name) => {
                tracing::info_span!("layout segment", name = **name)
            }
        }
    }
}
