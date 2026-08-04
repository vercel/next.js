use anyhow::{Context, Result};
use rustc_hash::FxHashSet;
use turbo_tasks::{OperationVc, ResolvedVc, Vc};

use crate::{
    module::Module,
    module_graph::{GraphTraversalAction, ModuleGraph, ModuleGraphLayer, SingleModuleGraphNode},
};

/// This lists all the modules that are async (self or transitively because they reference another
/// module in this list).
#[turbo_tasks::value(transparent, cell = "keyed")]
pub struct AsyncModulesInfo(FxHashSet<ResolvedVc<Box<dyn Module>>>);

impl AsyncModulesInfo {
    turbo_tasks::dual_fn! {
    pub fn is_async(self: Vc<Self>, module: ResolvedVc<Box<dyn Module>>) -> Result<bool> {
        turbo_tasks::read!(self.contains_key(&module))
    }
    }
}

#[turbo_tasks::function(operation, root)]
pub async fn compute_async_module_info(
    graphs: ResolvedVc<ModuleGraph>,
) -> Result<Vc<AsyncModulesInfo>> {
    // Layout segment optimization, we can individually compute the async modules for each graph.
    let mut result = None;
    for graph in turbo_tasks::read!(graphs.iter_graphs())? {
        result = Some(compute_async_module_info_single(graph, result));
    }
    Ok(result
        .context("There must be at least one single graph in the module graph")?
        .connect())
}

#[turbo_tasks::function(operation, root)]
async fn compute_async_module_info_single(
    graph: OperationVc<ModuleGraphLayer>,
    parent_async_modules: Option<OperationVc<AsyncModulesInfo>>,
) -> Result<Vc<AsyncModulesInfo>> {
    let parent_async_modules = if let Some(parent_async_modules) = parent_async_modules {
        Some(turbo_tasks::read!(
            parent_async_modules.read_strongly_consistent()
        )?)
    } else {
        None
    };
    let graph = turbo_tasks::read!(graph.read_strongly_consistent())?;
    let nodes = graph.iter_reachable_nodes()?.collect::<Vec<_>>();
    // Read the self-async flags for all module nodes concurrently, then zip them back with
    // the node list (which preserves the original iteration order).
    let self_async_flags = turbo_tasks::parallel!(nodes.iter().filter_map(|node| match node {
        SingleModuleGraphNode::Module(node) => Some(node.is_self_async()),
        SingleModuleGraphNode::VisitedModule { .. } => None,
    }))?;
    let mut self_async_flags = self_async_flags.into_iter();
    let self_async_modules = nodes
        .iter()
        .filter_map(|node| match node {
            SingleModuleGraphNode::Module(node) => {
                self_async_flags.next().unwrap().then_some(*node)
            }
            SingleModuleGraphNode::VisitedModule { idx: _, module } => {
                // If a module is async in the parent then we need to mark reverse dependencies
                // async in this graph as well.
                parent_async_modules
                    .as_ref()
                    .is_some_and(|set| set.contains(module))
                    .then_some(*module)
            }
        })
        .collect::<Vec<_>>();

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
