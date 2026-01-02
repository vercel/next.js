use anyhow::Result;
use rustc_hash::FxHashSet;
use turbo_tasks::{ResolvedVc, TryFlatJoinIterExt, Vc};

use crate::{
    module::{Module, Modules},
    module_graph::{GraphTraversalAction, ModuleGraph, SingleModuleGraphWithBindingUsage},
};

#[turbo_tasks::value(transparent)]
pub struct ModulesSet(FxHashSet<ResolvedVc<Box<dyn Module>>>);

/// This lists all the modules that are async (self or transitively because they reference another
/// module in this list).
#[turbo_tasks::value(transparent)]
pub struct AsyncModulesInfo(FxHashSet<ResolvedVc<Box<dyn Module>>>);

#[turbo_tasks::value_impl]
impl AsyncModulesInfo {
    #[turbo_tasks::function]
    pub fn is_async(&self, module: ResolvedVc<Box<dyn Module>>) -> Vc<bool> {
        Vc::cell(self.0.contains(&module))
    }

    #[turbo_tasks::function]
    pub async fn is_async_multiple(&self, modules: ResolvedVc<Modules>) -> Result<Vc<ModulesSet>> {
        Ok(Vc::cell(
            modules
                .await?
                .iter()
                .copied()
                .filter(|m| self.0.contains(m))
                .collect(),
        ))
    }
}

#[turbo_tasks::function(operation)]
pub async fn compute_async_module_info(
    graphs: ResolvedVc<ModuleGraph>,
) -> Result<Vc<AsyncModulesInfo>> {
    // Layout segment optimization, we can individually compute the async modules for each graph.
    let mut result: Vc<AsyncModulesInfo> = Vc::cell(Default::default());
    let graphs = graphs.await?;
    for graph in graphs.iter_graphs() {
        result = compute_async_module_info_single(graph, result);
    }
    Ok(result)
}

#[turbo_tasks::function]
async fn compute_async_module_info_single(
    graph: SingleModuleGraphWithBindingUsage,
    parent_async_modules: Vc<AsyncModulesInfo>,
) -> Result<Vc<AsyncModulesInfo>> {
    let parent_async_modules = parent_async_modules.await?;
    let graph = graph.read().await?;

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
                    parent_async_modules.contains(module).then_some(*module)
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
    async_modules.extend(parent_async_modules);

    Ok(Vc::cell(async_modules))
}
