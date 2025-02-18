use anyhow::Result;
use rustc_hash::FxHashSet;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};

use crate::{
    chunk::ChunkingType,
    module::Module,
    module_graph::{GraphTraversalAction, ModuleGraph},
};

/// This lists all the modules that are async (self or transitively because they reference another
/// module in this list).
#[turbo_tasks::value(transparent)]
pub struct AsyncModulesInfo(FxHashSet<ResolvedVc<Box<dyn Module>>>);

pub async fn compute_async_module_info(graph: &ModuleGraph) -> Result<Vc<AsyncModulesInfo>> {
    let entries = &graph.graphs.last().unwrap().await?.entries;

    let graphs = graph.get_graphs().await?;
    let all_graph_nodes = graphs.iter().flat_map(|g| g.iter_nodes());
    let self_async_modules = all_graph_nodes
        .map(async |node| Ok((node.module, *node.module.is_self_async().await?)))
        .try_join()
        .await?
        .into_iter()
        .flat_map(|(k, v)| v.then_some(k))
        .collect::<FxHashSet<_>>();

    // To determine which modules are async, we need to propagate the self-async flag to all
    // importers, which is done using a postorder traversal of the graph.
    //
    // This however doesn't cover cycles of async modules, which are handled by determining all
    // strongly-connected components using Tarjan's algorithm in the same traversal, and then
    // marking all the whole SCC as async if one of the modules in the SCC is async.

    // let mut edges = vec![];

    let mut async_modules = self_async_modules;
    graph
        .traverse_edges_from_entries_topological(
            entries.iter().copied(),
            &mut (),
            |_, _, _| Ok(GraphTraversalAction::Continue),
            |parent_info, module, _| {
                let Some((parent_module, chunking_type)) = parent_info else {
                    // An entry module
                    return;
                };
                let module = module.module;
                let parent_module = parent_module.module;

                match chunking_type {
                    ChunkingType::ParallelInheritAsync => {
                        if async_modules.contains(&module) {
                            async_modules.insert(parent_module);
                        }
                    }
                    ChunkingType::Parallel
                    | ChunkingType::Async
                    | ChunkingType::Isolated { .. }
                    | ChunkingType::Passthrough
                    | ChunkingType::Traced => {
                        // Nothing to propagate
                    }
                }
            },
        )
        .await?;

    Ok(Vc::cell(async_modules))
}
