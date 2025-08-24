use anyhow::Result;
use rustc_hash::FxHashSet;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::output::OutputAsset;

#[turbo_tasks::value(shared)]
pub enum AggregatedGraph {
    Leaf(ResolvedVc<Box<dyn OutputAsset>>),
    Node {
        depth: usize,
        content: FxHashSet<ResolvedVc<AggregatedGraph>>,
        references: FxHashSet<ResolvedVc<AggregatedGraph>>,
    },
}

#[turbo_tasks::value_impl]
impl AggregatedGraph {
    #[turbo_tasks::function]
    fn leaf(asset: ResolvedVc<Box<dyn OutputAsset>>) -> Vc<Self> {
        Self::cell(AggregatedGraph::Leaf(asset))
    }
}

impl AggregatedGraph {
    fn depth(&self) -> usize {
        match self {
            AggregatedGraph::Leaf(_) => 0,
            AggregatedGraph::Node { depth, .. } => *depth,
        }
    }
}

#[turbo_tasks::value_impl]
impl AggregatedGraph {
    #[turbo_tasks::function]
    pub async fn content(self: Vc<Self>) -> Result<Vc<AggregatedGraphNodeContent>> {
        Ok(match *self.await? {
            AggregatedGraph::Leaf(asset) => AggregatedGraphNodeContent::Asset(asset).into(),
            AggregatedGraph::Node { ref content, .. } => {
                AggregatedGraphNodeContent::Children(content.clone()).into()
            }
        })
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<AggregatedGraphsSet>> {
        Ok(match &*self.await? {
            AggregatedGraph::Leaf(asset) => {
                let mut refs = FxHashSet::default();
                for reference in asset.references().await? {
                    if asset != reference {
                        refs.insert(AggregatedGraph::leaf(**reference).to_resolved().await?);
                    }
                }
                AggregatedGraphsSet { set: refs }.into()
            }
            AggregatedGraph::Node { references, .. } => {
                let mut set = FxHashSet::default();
                for item in references
                    .iter()
                    .map(|&reference| aggregate_more(*reference))
                    .collect::<Vec<_>>()
                    .into_iter()
                {
                    set.insert(item.to_resolved().await?);
                }
                AggregatedGraphsSet { set }.into()
            }
        })
    }

    #[turbo_tasks::function]
    async fn cost(self: Vc<Self>) -> Result<Vc<AggregationCost>> {
        Ok(match *self.await? {
            AggregatedGraph::Leaf(asset) => AggregationCost(asset.references().await?.len()).into(),
            AggregatedGraph::Node { ref references, .. } => {
                AggregationCost(references.len()).into()
            }
        })
    }

    #[turbo_tasks::function]
    async fn valued_references(self: Vc<Self>) -> Result<Vc<AggregatedGraphsValuedReferences>> {
        let self_cost = self.cost().await?.0;
        let mut inner = FxHashSet::default();
        let mut outer = FxHashSet::default();
        let mut references = FxHashSet::default();
        for (reference, cost) in self
            .references()
            .await?
            .set
            .iter()
            .map(|&reference| (reference, reference.cost()))
            .collect::<Vec<_>>()
        {
            let cost = cost.await?.0;
            if cost == 0 {
                inner.insert(reference);
            } else if cost > self_cost {
                references.insert(reference);
            } else {
                outer.insert(reference);
            }
        }
        Ok(AggregatedGraphsValuedReferences {
            inner,
            outer,
            references,
        }
        .into())
    }
}

#[turbo_tasks::function]
pub async fn aggregate(asset: Vc<Box<dyn OutputAsset>>) -> Result<Vc<AggregatedGraph>> {
    let mut current = AggregatedGraph::leaf(asset);
    loop {
        if current.references().await?.set.is_empty() {
            return Ok(current);
        }
        current = aggregate_more(current);
    }
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Hash, Debug)]
struct AggregationCost(usize);

#[turbo_tasks::function]
async fn aggregate_more(node: ResolvedVc<AggregatedGraph>) -> Result<Vc<AggregatedGraph>> {
    let node_data = node.await?;
    let depth = node_data.depth();
    let mut in_progress = FxHashSet::default();
    let mut content = FxHashSet::default();
    let mut references = FxHashSet::default();
    in_progress.insert(node);

    // only one kind of aggregation can't eliminate cycles with that
    // number of nodes. Alternating the aggregation will get rid of all
    // cycles
    let aggregation = if depth > 0 && depth.is_multiple_of(2) {
        3
    } else {
        2
    };
    for _ in 0..aggregation {
        for &node in in_progress.iter() {
            content.insert(node);
        }
        let valued_refs = in_progress
            .drain()
            .map(|node| node.valued_references())
            .collect::<Vec<_>>();
        for valued_refs in valued_refs {
            let valued_refs = valued_refs.await?;
            for &reference in valued_refs.inner.iter() {
                content.insert(reference);
            }
            for &reference in valued_refs.references.iter() {
                if content.contains(&reference) {
                    continue;
                }
                references.insert(reference);
            }
            for &reference in valued_refs.outer.iter() {
                if content.contains(&reference) {
                    continue;
                }
                references.remove(&reference);
                in_progress.insert(reference);
            }
        }
    }
    for node in in_progress.into_iter() {
        references.insert(node);
    }
    Ok(AggregatedGraph::Node {
        depth: depth + 1,
        content,
        references,
    }
    .into())
}

#[turbo_tasks::value(shared)]
struct AggregatedGraphsSet {
    pub set: FxHashSet<ResolvedVc<AggregatedGraph>>,
}

#[turbo_tasks::value(shared)]
pub enum AggregatedGraphNodeContent {
    Asset(ResolvedVc<Box<dyn OutputAsset>>),
    Children(FxHashSet<ResolvedVc<AggregatedGraph>>),
}

#[turbo_tasks::value(shared)]
struct AggregatedGraphsValuedReferences {
    pub inner: FxHashSet<ResolvedVc<AggregatedGraph>>,
    pub outer: FxHashSet<ResolvedVc<AggregatedGraph>>,
    pub references: FxHashSet<ResolvedVc<AggregatedGraph>>,
}
