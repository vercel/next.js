use std::future::Future;

use anyhow::Result;
use indexmap::IndexSet;
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    debug::ValueDebugFormat,
    graph::{AdjacencyMap, GraphTraversal, Visit, VisitControlFlow},
    trace::TraceRawVcs,
    TryJoinIterExt, Vc,
};
use turbopack_binding::turbopack::core::{
    module::{Module, Modules},
    reference::ModuleReference,
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
    pub fn server_component(&self) -> Option<&Vc<NextServerComponentModule>> {
        self.server_component.as_ref()
    }

    pub fn ty(&self) -> &ClientReferenceType {
        &self.ty
    }
}

#[derive(
    Copy, Clone, Eq, PartialEq, Hash, Serialize, Deserialize, Debug, ValueDebugFormat, TraceRawVcs,
)]
pub enum ClientReferenceType {
    EcmascriptClientReference(Vc<EcmascriptClientReferenceModule>),
    CssClientReference(Vc<CssClientReferenceModule>),
}

#[turbo_tasks::value(transparent)]
pub struct ClientReferences(Vec<ClientReference>);

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
        let entries = entries.await?;

        let graph = AdjacencyMap::new()
            .skip_duplicates()
            .visit(
                entries
                    .iter()
                    .copied()
                    .map(|module| VisitClientReferenceNode {
                        server_component: None,
                        ty: VisitClientReferenceNodeType::Internal(module),
                    })
                    .collect::<Vec<_>>(),
                VisitClientReference,
            )
            .await
            .completed()?
            .into_inner();

        Ok(ClientReferenceGraph { graph }.cell())
    }

    #[turbo_tasks::function]
    pub async fn types(self: Vc<Self>) -> Result<Vc<ClientReferenceTypes>> {
        let this = self.await?;
        let mut client_reference_types = IndexSet::new();

        for node in this.graph.reverse_topological() {
            match &node.ty {
                VisitClientReferenceNodeType::Internal(_asset) => {
                    // No-op. These nodes are only useful during graph
                    // traversal.
                }
                VisitClientReferenceNodeType::ClientReference(client_reference) => {
                    client_reference_types.insert(*client_reference.ty());
                }
            }
        }

        Ok(Vc::cell(client_reference_types))
    }

    #[turbo_tasks::function]
    pub async fn entry(self: Vc<Self>, entry: Vc<Box<dyn Module>>) -> Result<Vc<ClientReferences>> {
        let this = self.await?;
        let mut entry_client_references = vec![];

        for node in this
            .graph
            .reverse_topological_from_node(&VisitClientReferenceNode {
                server_component: None,
                ty: VisitClientReferenceNodeType::Internal(entry),
            })
        {
            match &node.ty {
                VisitClientReferenceNodeType::Internal(_asset) => {
                    // No-op. These nodes are only useful during graph
                    // traversal.
                }
                VisitClientReferenceNodeType::ClientReference(client_reference) => {
                    entry_client_references.push(*client_reference);
                }
            }
        }

        Ok(Vc::cell(entry_client_references))
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
    ClientReference(ClientReference),
    Internal(Vc<Box<dyn Module>>),
}

impl Visit<VisitClientReferenceNode> for VisitClientReference {
    type Edge = VisitClientReferenceNode;
    type EdgesIntoIter = Vec<Self::Edge>;
    type EdgesFuture = impl Future<Output = Result<Self::EdgesIntoIter>>;

    fn visit(&mut self, edge: Self::Edge) -> VisitControlFlow<VisitClientReferenceNode> {
        match edge.ty {
            VisitClientReferenceNodeType::ClientReference(_) => VisitControlFlow::Skip(edge),
            VisitClientReferenceNodeType::Internal(_) => VisitControlFlow::Continue(edge),
        }
    }

    fn edges(&mut self, node: &VisitClientReferenceNode) -> Self::EdgesFuture {
        let node = node.clone();
        async move {
            match node.ty {
                // This should never occur since we always skip visiting these
                // nodes' edges.
                VisitClientReferenceNodeType::ClientReference(_) => Ok(vec![]),
                VisitClientReferenceNodeType::Internal(module) => {
                    let references = module.references().await?;

                    let referenced_modules = references
                        .iter()
                        .copied()
                        .map(|reference| async move {
                            let resolve_result = reference.resolve_reference();
                            let assets = resolve_result.primary_modules().await?;
                            Ok(assets.clone_value())
                        })
                        .try_join()
                        .await?;
                    let referenced_modules = referenced_modules.into_iter().flatten();

                    let referenced_modules = referenced_modules.map(|module| async move {
                        let module = module.resolve().await?;
                        if let Some(client_reference_module) =
                            Vc::try_resolve_downcast_type::<EcmascriptClientReferenceModule>(module)
                                .await?
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
                                ),
                            });
                        }

                        if let Some(css_client_reference_asset) =
                            Vc::try_resolve_downcast_type::<CssClientReferenceModule>(module)
                                .await?
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
                                ),
                            });
                        }

                        if let Some(server_component_asset) =
                            Vc::try_resolve_downcast_type::<NextServerComponentModule>(module)
                                .await?
                        {
                            return Ok(VisitClientReferenceNode {
                                server_component: Some(server_component_asset),
                                ty: VisitClientReferenceNodeType::Internal(module),
                            });
                        }

                        Ok(VisitClientReferenceNode {
                            server_component: node.server_component,
                            ty: VisitClientReferenceNodeType::Internal(module),
                        })
                    });

                    let assets = referenced_modules.try_join().await?;

                    Ok(assets)
                }
            }
        }
    }
}
