use anyhow::Result;
use rustc_hash::{FxHashMap, FxHashSet};
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};

use crate::{
    module::{Module, ModuleSideEffects},
    module_graph::{GraphTraversalAction, ModuleGraph, ModuleGraphLayer, SingleModuleGraphNode},
};

/// This lists all the modules that are side effect free
/// This means they are either declared side effect free by some configuration or they have been
/// determined to be side effect free via static analysis of the module evaluation and dependencies.
#[turbo_tasks::value(transparent)]
pub struct SideEffectFreeModules(FxHashSet<ResolvedVc<Box<dyn Module>>>);

/// Computes the set of side effect free modules in the module graph.
///
/// This leverages the module graph to compute if modules with `ModuleEvaluationIsSideEffectFree`
/// status are actually side effectful or not.
///
/// A current limitation is that the module graph doesn't contain information on how 'late' imports
/// are used.  e.g. if there is a dynamic import with side effects in an event handler, we will mark
/// the module as side effectful even though it isn't.  To fix this the module graph would need to
/// record more information about the nature of the edges.
#[turbo_tasks::function]
pub async fn compute_side_effect_free_module_info(
    graphs: ResolvedVc<ModuleGraph>,
) -> Result<Vc<SideEffectFreeModules>> {
    // Layout segment optimization, we can individually compute the side effect free modules for
    // each graph.
    let mut result: Vc<SideEffectFreeModules> = Vc::cell(Default::default());
    for graph in graphs.iter_graphs().await? {
        result = compute_side_effect_free_module_info_single(graph.connect(), result);
    }
    Ok(result)
}

#[turbo_tasks::function]
async fn compute_side_effect_free_module_info_single(
    graph: ResolvedVc<ModuleGraphLayer>,
    parent_side_effect_free_modules: Vc<SideEffectFreeModules>,
) -> Result<Vc<SideEffectFreeModules>> {
    let parent_side_effect_free_modules = parent_side_effect_free_modules.await?;
    let graph = graph.await?;
    let module_side_effects = graph
        .iter_reachable_nodes()?
        .map(async |node| {
            Ok(match node {
                SingleModuleGraphNode::Module(module) => {
                    // This turbo task always has a cache hit since it is called when building the
                    // module graph. we could consider moving this information
                    // into to the module graph, but then changes would invalidate the whole graph.
                    (*module, *module.side_effects().await?)
                }
                SingleModuleGraphNode::VisitedModule { idx: _, module } => (
                    *module,
                    if parent_side_effect_free_modules.contains(module) {
                        ModuleSideEffects::SideEffectFree
                    } else {
                        ModuleSideEffects::SideEffectful
                    },
                ),
            })
        })
        .try_join()
        .await?
        .into_iter()
        .collect::<FxHashMap<_, _>>();

    // Modules are categorized as side-effectful, locally side effect free and side effect free.
    // So we are really just interested in determining what modules that are locally side effect
    // free. logically we want to start at all such modules are determine if their transitive
    // dependencies are side effect free.

    let mut locally_side_effect_free_modules_that_have_side_effects = FxHashSet::default();
    graph.traverse_edges_reverse_dfs(
        // Start from all the side effectful nodes
        module_side_effects
            .iter()
            .filter_map(|(m, e)| (*e == ModuleSideEffects::SideEffectful).then_some(*m)),
        &mut (),
        // child is a previously visited module that we know is side effectful
        // parent is a module that depends on it.
        |child, parent, _s| {
            Ok(if child.is_some() {
                match module_side_effects
                    .get(&parent)
                    .expect("the map is populated for all modules in this graph")
                {
                    ModuleSideEffects::SideEffectful | ModuleSideEffects::SideEffectFree => {
                        // We have either already seen this or don't want to follow it
                        GraphTraversalAction::Exclude
                    }
                    ModuleSideEffects::ModuleEvaluationIsSideEffectFree => {
                        // this module is side effect free locally but depends on `child` which is
                        // effectful so it too is effectful
                        locally_side_effect_free_modules_that_have_side_effects.insert(parent);
                        GraphTraversalAction::Continue
                    }
                }
            } else {
                // entry point, we already determined it was effectful, keep going
                GraphTraversalAction::Continue
            })
        },
        |_, _, _| Ok(()),
    )?;
    #[cfg(debug_assertions)]
    {
        use std::sync::LazyLock;

        static PRINT_SIDE_EFFECT_INFO: LazyLock<bool> = LazyLock::new(|| {
            std::env::var_os("TURBOPACK_PRINT_SIDE_EFFECT_INFO")
                .is_some_and(|v| v == "1" || v == "true")
        });
        if *PRINT_SIDE_EFFECT_INFO {
            use turbo_tasks::TryJoinIterExt;
            println!(
                "side effect free modules: {:#?}",
                module_side_effects
                    .iter()
                    .filter_map(|(m, e)| match e {
                        ModuleSideEffects::SideEffectful => None,
                        ModuleSideEffects::SideEffectFree => Some((m, false)),
                        ModuleSideEffects::ModuleEvaluationIsSideEffectFree => {
                            if locally_side_effect_free_modules_that_have_side_effects.contains(m) {
                                None
                            } else {
                                Some((m, true))
                            }
                        }
                    })
                    .map(async |(m, locally)| Ok((
                        m.ident_string().await?,
                        if locally {
                            "inferred locally"
                        } else {
                            "declared"
                        }
                    )))
                    .try_join()
                    .await?
            );
        }
    }

    let side_effect_free_modules = module_side_effects
        .into_iter()
        .filter_map(|(m, e)| match e {
            ModuleSideEffects::SideEffectful => None,
            ModuleSideEffects::SideEffectFree => Some(m),
            ModuleSideEffects::ModuleEvaluationIsSideEffectFree => {
                if locally_side_effect_free_modules_that_have_side_effects.contains(&m) {
                    None
                } else {
                    Some(m)
                }
            }
        })
        .chain(parent_side_effect_free_modules.iter().copied())
        .collect::<FxHashSet<_>>();

    Ok(Vc::cell(side_effect_free_modules))
}
