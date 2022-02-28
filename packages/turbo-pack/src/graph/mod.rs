use std::collections::{hash_map::Entry, HashMap, HashSet};

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
                let asset = asset.clone().resolve_to_slot().await;
                let mut refs = HashSet::new();
                for reference in asset.references().await.assets.iter() {
                    let reference = reference.clone().resolve_to_slot().await;
                    if asset != reference {
                        refs.insert(AggregatedGraphRef::leaf(reference));
                    }
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
    let tree = aggregate_internal(asset);
    // print_tree(tree.clone());
    tree
}

#[turbo_tasks::function]
async fn aggregate_internal(asset: AssetRef) -> AggregatedGraphRef {
    let mut current = AggregatedGraphRef::leaf(asset);
    let mut i = 0;
    loop {
        if current.clone().references().await.set.len() == 0 {
            return current;
        }
        println!("aggregate {}", i);
        current = aggregate_more(current);
        i += 1;
    }
}

#[turbo_tasks::function]
pub async fn print_tree(aggregated: AggregatedGraphRef) {
    let mut layer = HashSet::new();
    layer.insert(aggregated);
    let mut i = 0;
    loop {
        let nodes = layer.len();
        let mut next_layer = Vec::new();
        let mut leafs = 0;
        for node in layer.into_iter() {
            let node = &*node.await;
            match node {
                AggregatedGraph::Leaf(_) => {
                    leafs += 1;
                }
                AggregatedGraph::Node {
                    inner, boundary, ..
                } => {
                    for node in inner {
                        next_layer.push(node.clone());
                    }
                    for node in boundary {
                        next_layer.push(node.clone());
                    }
                }
            }
        }
        println!(
            "layer {} with {} nodes and {} children",
            i,
            nodes,
            next_layer.len() + leafs
        );
        layer = next_layer.into_iter().collect();
        if layer.is_empty() {
            break;
        }
        i += 1;
    }
}

#[turbo_tasks::value(value)]
#[derive(Clone, Hash, Debug, PartialEq, Eq)]
struct AggregationDepth(usize);

#[turbo_tasks::value(value)]
#[derive(Clone, Hash, Debug, PartialEq, Eq)]
struct AggregationCost(usize);

// #[turbo_tasks::function]
// async fn cost(node: AggregatedGraphRef) -> AggregationCostRef {
//     let references = node.references();
//     let mut cost = 0;
//     for reference in references.await.set.iter() {
//         let refs = reference.clone().references().await.set.len();
//         if refs > 0 {
//             cost += 2 * refs - 1;
//         }
//     }
//     AggregationCost(cost).into()
// }

#[turbo_tasks::function]
async fn cost(node: AggregatedGraphRef) -> AggregationCostRef {
    let references = node.references();
    AggregationCost(references.await.set.len()).into()
}

#[turbo_tasks::function]
async fn aggregate_more(node: AggregatedGraphRef) -> AggregatedGraphRef {
    let node_data = node.get().await;
    let depth = node_data.depth();
    #[cfg(debug_assertions)]
    let root = node_data.root().clone();
    let mut inner = HashSet::new();
    let mut in_progress = HashMap::new();
    let mut boundary = HashSet::new();
    in_progress.insert(node.clone(), cost(node).await.0);

    // only one kind of aggregation can't eliminate cycles with that
    // number of nodes. Alternating the aggregation will get rid of all
    // cycles
    // let aggregation = if depth > 0 && depth % 2 == 0 { 3 } else { 2 };
    // let aggregation = depth + 2;
    let aggregation = 3;
    for _ in 1..aggregation {
        for node in in_progress.keys() {
            inner.insert(node.clone());
        }
        let mut next = HashMap::new();
        for (node, root_cost) in in_progress.into_iter() {
            let refs = &node.clone().references().await.set;
            // leaf node can stay in inner
            let mut some_references_kept = false;
            if !refs.is_empty() {
                for reference in refs.iter() {
                    let reference = reference.clone().resolve_to_slot().await;
                    if inner.contains(&reference) || boundary.contains(&reference) {
                        continue;
                    }
                    let node_cost = cost(reference.clone()).await.0;
                    // #[cfg(debug_assertions)]
                    // println!(
                    //     "aggregate_more_step({}: {} -> {}, root_cost: {}, node_cost: {})",
                    //     root.clone().path().await.path,
                    //     node.get().await.root().path().await.path,
                    //     reference.get().await.root().path().await.path,
                    //     root_cost,
                    //     node_cost
                    // );
                    if node_cost == 0 {
                        // Merge the node, it's a leaf and won't be expanded
                        inner.insert(reference);
                    } else if node_cost > root_cost {
                        // It's cheaper to aggregate the node on it's own
                        some_references_kept = true;
                    } else {
                        // Merge the node, may expand it later
                        match next.entry(reference) {
                            Entry::Occupied(mut e) => {
                                let v = e.get_mut();
                                if *v > node_cost {
                                    *v = node_cost;
                                }
                            }
                            Entry::Vacant(e) => {
                                e.insert(node_cost);
                            }
                        }
                    }
                }
                if some_references_kept {
                    inner.remove(&node);
                    boundary.insert(node);
                }
            }
        }
        in_progress = next;
    }
    for node in in_progress.into_keys() {
        boundary.insert(node);
    }
    // #[cfg(debug_assertions)]
    // println!(
    //     "aggregate_more({}, depth: {}, inner: {}, boundary: {}, root_cost: {})",
    //     root.path().await.path,
    //     depth + 1,
    //     inner.len(),
    //     boundary.len(),
    //     root_cost
    // );
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
