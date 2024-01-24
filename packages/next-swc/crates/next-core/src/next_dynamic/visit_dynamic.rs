use std::future::Future;

use anyhow::Result;
use tracing::Instrument;
use turbo_tasks::{
    graph::{AdjacencyMap, GraphTraversal, Visit, VisitControlFlow},
    ReadRef, TryJoinIterExt, ValueToString, Vc,
};
use turbopack_binding::turbopack::core::{
    module::{Module, Modules},
    reference::primary_referenced_modules,
};

use super::NextDynamicEntryModule;

#[turbo_tasks::value(transparent)]
pub struct NextDynamicEntries(Vec<Vc<NextDynamicEntryModule>>);

#[turbo_tasks::value_impl]
impl NextDynamicEntries {
    #[turbo_tasks::function]
    pub async fn from_entries(entries: Vc<Modules>) -> Result<Vc<NextDynamicEntries>> {
        async move {
            let nodes: Vec<_> = AdjacencyMap::new()
                .skip_duplicates()
                .visit(
                    entries
                        .await?
                        .iter()
                        .copied()
                        .map(|m| async move {
                            Ok(VisitDynamicNode::Internal(m, m.ident().to_string().await?))
                        })
                        .try_join()
                        .await?,
                    VisitDynamic,
                )
                .await
                .completed()?
                .into_inner()
                .into_reverse_topological()
                .collect();

            let mut next_dynamics = vec![];

            for node in nodes {
                match node {
                    VisitDynamicNode::Internal(_asset, _) => {
                        // No-op. These nodes are only useful during graph
                        // traversal.
                    }
                    VisitDynamicNode::Dynamic(dynamic_asset, _) => {
                        next_dynamics.push(dynamic_asset);
                    }
                }
            }

            Ok(Vc::cell(next_dynamics))
        }
        .instrument(tracing::info_span!("find next/dynamic references"))
        .await
    }
}

struct VisitDynamic;

#[derive(Clone, Eq, PartialEq, Hash)]
enum VisitDynamicNode {
    Dynamic(Vc<NextDynamicEntryModule>, ReadRef<String>),
    Internal(Vc<Box<dyn Module>>, ReadRef<String>),
}

impl Visit<VisitDynamicNode> for VisitDynamic {
    type Edge = VisitDynamicNode;
    type EdgesIntoIter = Vec<Self::Edge>;
    type EdgesFuture = impl Future<Output = Result<Self::EdgesIntoIter>>;

    fn visit(&mut self, edge: Self::Edge) -> VisitControlFlow<VisitDynamicNode> {
        // We always visit all nodes, as a dynamic asset can transitively reference
        // another.
        VisitControlFlow::Continue(edge)
    }

    fn edges(&mut self, node: &VisitDynamicNode) -> Self::EdgesFuture {
        let node = node.clone();
        async move {
            let module = match node {
                VisitDynamicNode::Dynamic(dynamic_module, _) => Vc::upcast(dynamic_module),
                VisitDynamicNode::Internal(module, _) => module,
            };

            let referenced_modules = primary_referenced_modules(module).await?;

            let referenced_modules = referenced_modules.iter().map(|module| async move {
                let module = module.resolve().await?;
                if let Some(next_dynamic_module) =
                    Vc::try_resolve_downcast_type::<NextDynamicEntryModule>(module).await?
                {
                    return Ok(VisitDynamicNode::Dynamic(
                        next_dynamic_module,
                        next_dynamic_module.ident().to_string().await?,
                    ));
                }

                Ok(VisitDynamicNode::Internal(
                    module,
                    module.ident().to_string().await?,
                ))
            });

            let nodes = referenced_modules.try_join().await?;

            Ok(nodes)
        }
    }

    fn span(&mut self, node: &VisitDynamicNode) -> tracing::Span {
        match node {
            VisitDynamicNode::Dynamic(_, name) => {
                tracing::info_span!("dynamic module", name = **name)
            }
            VisitDynamicNode::Internal(_, name) => {
                tracing::info_span!("module", name = **name)
            }
        }
    }
}
