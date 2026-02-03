use anyhow::{Context, Result};
use rustc_hash::FxHashSet;
use turbo_tasks::{OperationVc, ResolvedVc, TryFlatJoinIterExt, Vc};

use crate::{
    module::Module,
    module_graph::{GraphTraversalAction, ModuleGraph, ModuleGraphLayer},
};

#[turbo_tasks::value(transparent)]
pub struct ModulesSet(FxHashSet<ResolvedVc<Box<dyn Module>>>);

/// This lists all the modules that are async (self or transitively because they reference another
/// module in this list).
#[turbo_tasks::value(transparent, cell = "keyed")]
pub struct AsyncModulesInfo(FxHashSet<ResolvedVc<Box<dyn Module>>>);

impl AsyncModulesInfo {
    pub async fn is_async(self: Vc<Self>, module: ResolvedVc<Box<dyn Module>>) -> Result<bool> {
        self.contains_key(&module).await
    }
}

#[turbo_tasks::function(operation)]
pub async fn compute_async_module_info(
    graphs: ResolvedVc<ModuleGraph>,
) -> Result<Vc<AsyncModulesInfo>> {
    // Layout segment optimization, we can individually compute the async modules for each graph.
    let mut result = None;
    for graph in graphs.iter_graphs().await? {
        result = Some(compute_async_module_info_single(*graph, result));
    }
    Ok(result
        .context("There must be at least one single graph in the module graph")?
        .connect())
}

#[turbo_tasks::function(operation)]
async fn compute_async_module_info_single(
    graph: OperationVc<ModuleGraphLayer>,
    parent_async_modules: Option<OperationVc<AsyncModulesInfo>>,
) -> Result<Vc<AsyncModulesInfo>> {
    let parent_async_modules = if let Some(parent_async_modules) = parent_async_modules {
        Some(parent_async_modules.read_strongly_consistent().await?)
    } else {
        None
    };
    let graph = graph.read_strongly_consistent().await?;
    let self_async_modules = graph
        .enumerate_nodes()
        .map(async |(_, node)| {
            Ok(match node {
                super::SingleModuleGraphNode::Module(node) => {
                    node.is_self_async().await?.then_some(*node)
                }
                super::SingleModuleGraphNode::VisitedModule { idx: _, module } => {
                    // If a module is async in the parent then we need to mark reverse dependencies
                    // async in this graph as well.
                    parent_async_modules
                        .as_ref()
                        .is_some_and(|set| set.contains(module))
                        .then_some(*module)
                }
            })
        })
        .try_flat_join()
        .await?;

    // To determine which modules are async, we need to propagate the self-async flag to all
    // importers, which is done using a reverse traversal over the graph
    // Because we walk edges in the reverse direction we can trivially handle things like cycles
    // without actually computing them.
    let mut async_modules = FxHashSet::default();
    async_modules.extend(self_async_modules.iter());

    graph.traverse_edges_reverse_dfs(
        self_async_modules,
        &mut (),
        // child is the previously visited module which must be async
        // parent is a new module that depends on it
        |child, parent, _state| {
            Ok(if let Some((_, edge)) = child {
                if edge.chunking_type.is_inherit_async() {
                    async_modules.insert(parent);
                    GraphTraversalAction::Continue
                } else {
                    // Wrong edge type to follow
                    GraphTraversalAction::Exclude
                }
            } else {
                // These are our entry points, just continue
                GraphTraversalAction::Continue
            })
        },
        |_, _, _| Ok(()),
    )?;

    // Accumulate the parent modules at the end. Not all parent async modules were in this graph
    async_modules.extend(parent_async_modules.into_iter().flatten());

    Ok(Vc::cell(async_modules))
}
