use std::future::Future;

use anyhow::Result;
use turbo_tasks::{
    graph::{AdjacencyMap, GraphTraversal, Visit, VisitControlFlow},
    TryJoinIterExt, Vc,
};
use turbopack_binding::turbopack::core::{
    asset::{Asset, Assets},
    reference::AssetReference,
};

use super::NextDynamicEntryModule;

#[turbo_tasks::value(transparent)]
pub struct NextDynamicEntries(Vec<Vc<NextDynamicEntryModule>>);

#[turbo_tasks::value_impl]
impl NextDynamicEntries {
    #[turbo_tasks::function]
    pub async fn from_entries(entries: Vc<Assets>) -> Result<Vc<NextDynamicEntries>> {
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
    Internal(Vc<Box<dyn Asset>>),
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
            let asset = match node {
                VisitDynamicNode::Dynamic(dynamic_asset) => dynamic_asset.into(),
                VisitDynamicNode::Internal(asset) => asset,
            };

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
                if let Some(next_dynamic_asset) =
                    Vc::try_resolve_downcast_type::<NextDynamicEntryModule>(asset).await?
                {
                    return Ok(VisitDynamicNode::Dynamic(next_dynamic_asset));
                }

                Ok(VisitDynamicNode::Internal(asset))
            });

            let assets = referenced_assets.try_join().await?;

            Ok(assets)
        }
    }
}
