use std::collections::HashSet;

use crate::asset::AssetRef;

#[turbo_tasks::value(shared)]
#[derive(PartialEq, Eq)]
pub enum AggregatedGraph {
    Leaf(AssetRef),
    Node {
        depth: usize,
        #[cfg(debug_assertions)]
        root: AssetRef,
        inner: HashSet<AggregatedGraphRef>,
        boundary: HashSet<AggregatedGraphRef>,
    },
}

#[turbo_tasks::value_impl]
impl AggregatedGraph {
    #[turbo_tasks::constructor(intern)]
    fn leaf(asset: AssetRef) -> Self {
        Self::Leaf(asset)
    }

    fn depth(&self) -> usize {
        match self {
            AggregatedGraph::Leaf(_) => 0,
            AggregatedGraph::Node { depth, .. } => *depth,
        }
    }

    #[cfg(debug_assertions)]
    fn root(&self) -> &AssetRef {
        match self {
            AggregatedGraph::Leaf(asset) => asset,
            AggregatedGraph::Node { root, .. } => root,
        }
    }
}

#[turbo_tasks::value_impl]
impl AggregatedGraphRef {
    async fn references(self) -> AggregatedGraphsSetRef {
        match &*self.await {
            AggregatedGraph::Leaf(asset) => {
                let mut refs = HashSet::new();
                for reference in asset.references().await.assets.iter() {
                    let reference = reference.clone().resolve_to_slot().await;
                    refs.insert(AggregatedGraphRef::leaf(reference));
                }
                AggregatedGraphsSet { set: refs }.into()
            }
            AggregatedGraph::Node {
                depth: _,
                #[cfg(debug_assertions)]
                    root: _,
                inner,
                boundary,
            } => {
                let mut refs = Vec::new();
                for set in boundary
                    .iter()
                    .map(|b| b.clone().references())
                    .collect::<Vec<_>>()
                    .into_iter()
                {
                    for reference in set.await.set.iter() {
                        let reference = reference.clone().resolve_to_slot().await;
                        if inner.contains(&reference) || boundary.contains(&reference) {
                            continue;
                        }
                        refs.push(aggregate_more(reference));
                    }
                }
                let mut set = HashSet::new();
                for aggregated in refs.into_iter() {
                    set.insert(aggregated.resolve_to_slot().await);
                }
                AggregatedGraphsSet { set }.into()
            }
        }
    }
}

#[turbo_tasks::function]
pub async fn aggregate(asset: AssetRef) -> AggregatedGraphRef {
    let mut current = AggregatedGraphRef::leaf(asset);
    loop {
        if current.clone().references().await.set.len() == 0 {
            return current;
        }
        current = aggregate_more(current);
    }
}

#[turbo_tasks::value(value)]
#[derive(Clone, Hash, Debug, PartialEq, Eq)]
struct AggregationDepth(usize);

#[turbo_tasks::function]
async fn aggregate_more(node: AggregatedGraphRef) -> AggregatedGraphRef {
    let node_data = node.get().await;
    let depth = node_data.depth();
    #[cfg(debug_assertions)]
    let root = node_data.root().clone();
    let mut inner = HashSet::new();
    let mut boundary = HashSet::new();
    boundary.insert(node);

    // // only one kind of aggregation can't eliminate cycles with that
    // // number of nodes. Alternating the aggregation will get rid of all
    // // cycles
    // let aggregation = if depth > 0 && depth % 2 == 0 { 3 } else { 2 };
    let aggregation = depth + 2;
    for _ in 1..aggregation {
        for node in boundary.iter() {
            inner.insert(node.clone());
        }
        let mut new_boundary = HashSet::new();
        for node in boundary.into_iter() {
            for reference in node.clone().references().await.set.iter() {
                let reference = reference.clone().resolve_to_slot().await;
                if inner.contains(&reference) {
                    continue;
                }
                new_boundary.insert(reference);
            }
        }
        boundary = new_boundary;
    }
    #[cfg(debug_assertions)]
    println!(
        "aggregate_more({}, depth: {}, inner: {}, boundary: {})",
        root.path().await.path,
        depth + 1,
        inner.len(),
        boundary.len()
    );
    AggregatedGraph::Node {
        depth: depth + 1,
        #[cfg(debug_assertions)]
        root,
        inner,
        boundary,
    }
    .into()
}

#[turbo_tasks::value(shared)]
#[derive(PartialEq, Eq)]
struct AggregatedGraphsSet {
    pub set: HashSet<AggregatedGraphRef>,
}
