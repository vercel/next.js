use anyhow::Result;
use rustc_hash::FxHashSet;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};

use crate::{
    module::{Module, Modules},
    module_graph::{GraphTraversalAction, ModuleGraph, SingleModuleGraph},
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
    graph: ResolvedVc<ModuleGraph>,
) -> Result<Vc<AsyncModulesInfo>> {
    // Layout segment optimization, we can individually compute the async modules for each graph.
    let mut result: Vc<AsyncModulesInfo> = Vc::cell(Default::default());
    for g in &graph.await?.graphs {
        result = compute_async_module_info_single(**g, result);
    }
    Ok(result)
}

#[turbo_tasks::function]
async fn compute_async_module_info_single(
    graph: Vc<SingleModuleGraph>,
    parent_async_modules: Vc<AsyncModulesInfo>,
) -> Result<Vc<AsyncModulesInfo>> {
    let parent_async_modules = parent_async_modules.await?;
    let graph = graph.await?;

    let self_async_modules = graph
        .iter_nodes()
        .map(async |node| Ok((node.module, *node.module.is_self_async().await?)))
        .try_join()
        .await?
        .into_iter()
        .flat_map(|(k, v)| v.then_some(k))
        .chain(parent_async_modules.iter().copied())
        .collect::<FxHashSet<_>>();

    // To determine which modules are async, we need to propagate the self-async flag to all
    // importers, which is done using a postorder traversal of the graph.
    //
    // This however doesn't cover cycles of async modules, which are handled by determining all
    // strongly-connected components, and then marking all the whole SCC as async if one of the
    // modules in the SCC is async.

    let mut async_modules = self_async_modules;
    graph.traverse_edges_from_entries_dfs(
        graph.entry_modules(),
        &mut (),
        |_, _, _| Ok(GraphTraversalAction::Continue),
        |parent_info, module, _| {
            let Some((parent_module, ref_data)) = parent_info else {
                // An entry module
                return Ok(());
            };
            let module = module.module();
            let parent_module = parent_module.module;

            if ref_data.chunking_type.is_inherit_async() && async_modules.contains(&module) {
                async_modules.insert(parent_module);
            }
            Ok(())
        },
    )?;

    graph.traverse_cycles(
        |ref_data| ref_data.chunking_type.is_inherit_async(),
        |cycle| {
            if cycle
                .iter()
                .any(|node| async_modules.contains(&node.module))
            {
                for &node in cycle {
                    async_modules.insert(node.module);
                }
            }
        },
    );

    Ok(Vc::cell(async_modules))
}
