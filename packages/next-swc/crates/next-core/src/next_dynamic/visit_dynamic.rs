use std::future::Future;

use anyhow::Result;
use turbo_tasks::{
    graph::{AdjacencyMap, GraphTraversal, Visit, VisitControlFlow},
    TryJoinIterExt, Vc,
};
use turbopack_binding::turbopack::core::{
    module::{Module, Modules},
    reference::ModuleReference,
};

use super::NextDynamicEntryModule;

#[turbo_tasks::value(transparent)]
pub struct NextDynamicEntries(Vec<Vc<NextDynamicEntryModule>>);

#[turbo_tasks::value_impl]
impl NextDynamicEntries {
    #[turbo_tasks::function]
    pub async fn from_entries(entries: Vc<Modules>) -> Result<Vc<NextDynamicEntries>> {
        let nodes: Vec<_> = AdjacencyMap::new()
            .skip_duplicates()
            .visit(
                entries
                    .await?
                    .iter()
                    .copied()
                    .map(VisitDynamicNode::Internal)
                    .collect::<Vec<_>>(),
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
                VisitDynamicNode::Internal(_asset) => {
                    // No-op. These nodes are only useful during graph
                    // traversal.
                }
                VisitDynamicNode::Dynamic(dynamic_asset) => {
                    next_dynamics.push(dynamic_asset);
                }
            }
        }

        Ok(Vc::cell(next_dynamics))
    }
}

struct VisitDynamic;

#[derive(Clone, Eq, PartialEq, Hash)]
enum VisitDynamicNode {
    Dynamic(Vc<NextDynamicEntryModule>),
    Internal(Vc<Box<dyn Module>>),
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
                VisitDynamicNode::Dynamic(dynamic_module) => Vc::upcast(dynamic_module),
                VisitDynamicNode::Internal(module) => module,
            };

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
                if let Some(next_dynamic_module) =
                    Vc::try_resolve_downcast_type::<NextDynamicEntryModule>(module).await?
                {
                    return Ok(VisitDynamicNode::Dynamic(next_dynamic_module));
                }

                Ok(VisitDynamicNode::Internal(module))
            });

            let nodes = referenced_modules.try_join().await?;

            Ok(nodes)
        }
    }
}
