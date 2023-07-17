use std::future::Future;

use anyhow::Result;
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    debug::ValueDebugFormat,
    graph::{AdjacencyMap, GraphTraversal, Visit, VisitControlFlow},
    trace::TraceRawVcs,
    TryJoinIterExt, Vc,
};
use turbopack_binding::turbopack::core::{
    asset::{Asset, Assets},
    reference::AssetReference,
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
pub struct ClientReferencesByEntry(IndexMap<Vc<Box<dyn Asset>>, Vec<ClientReference>>);

#[turbo_tasks::value_impl]
impl ClientReferencesByEntry {
    #[turbo_tasks::function]
    pub async fn new(entries: Vc<Assets>) -> Result<Vc<ClientReferencesByEntry>> {
        let entries = entries.await?;

        let graph = AdjacencyMap::new()
            .skip_duplicates()
            .visit(
                entries
                    .iter()
                    .copied()
                    .map(|asset| VisitClientReferenceNode {
                        server_component: None,
                        ty: VisitClientReferenceNodeType::Internal(asset),
                    })
                    .collect::<Vec<_>>(),
                VisitClientReference,
            )
            .await
            .completed()?
            .into_inner();

        let client_references = entries
            .iter()
            .copied()
            .map(|entry| {
                let mut entry_client_references = vec![];
                for node in graph.reverse_topological_from_node(&VisitClientReferenceNode {
                    server_component: None,
                    ty: VisitClientReferenceNodeType::Internal(entry),
                }) {
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
                (entry, entry_client_references)
            })
            .collect();

        Ok(Vc::cell(client_references))
    }
}

struct VisitClientReference;

#[derive(Clone, Eq, PartialEq, Hash)]
struct VisitClientReferenceNode {
    server_component: Option<Vc<NextServerComponentModule>>,
    ty: VisitClientReferenceNodeType,
}

#[derive(Clone, Eq, PartialEq, Hash)]
enum VisitClientReferenceNodeType {
    ClientReference(ClientReference),
    Internal(Vc<Box<dyn Asset>>),
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
                VisitClientReferenceNodeType::Internal(asset) => {
                    let references = asset.references().await?;

                    let referenced_assets = references
                        .iter()
                        .copied()
                        .map(|reference| async move {
                            let resolve_result = reference.resolve_reference();
                            let assets = resolve_result.primary_assets().await?;
                            Ok(assets.iter().copied().collect::<Vec<_>>())
                        })
                        .try_join()
                        .await?;
                    let referenced_assets = referenced_assets.into_iter().flatten();

                    let referenced_assets = referenced_assets.map(|asset| async move {
                        if let Some(client_reference_asset) =
                            Vc::try_resolve_downcast_type::<EcmascriptClientReferenceModule>(asset)
                                .await?
                        {
                            return Ok(VisitClientReferenceNode {
                                server_component: node.server_component,
                                ty: VisitClientReferenceNodeType::ClientReference(
                                    ClientReference {
                                        server_component: node.server_component,
                                        ty: ClientReferenceType::EcmascriptClientReference(
                                            client_reference_asset,
                                        ),
                                    },
                                ),
                            });
                        }

                        if let Some(css_client_reference_asset) =
                            Vc::try_resolve_downcast_type::<CssClientReferenceModule>(asset).await?
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
                            Vc::try_resolve_downcast_type::<NextServerComponentModule>(asset)
                                .await?
                        {
                            return Ok(VisitClientReferenceNode {
                                server_component: Some(server_component_asset),
                                ty: VisitClientReferenceNodeType::Internal(asset),
                            });
                        }

                        Ok(VisitClientReferenceNode {
                            server_component: node.server_component,
                            ty: VisitClientReferenceNodeType::Internal(asset),
                        })
                    });

                    let assets = referenced_assets.try_join().await?;

                    Ok(assets)
                }
            }
        }
    }
}
