use std::collections::{HashMap, HashSet};

use anyhow::{Context, Result};
use next_core::next_client_reference::{find_server_entries, ServerEntries};
use petgraph::graph::{DiGraph, NodeIndex};
use turbo_tasks::{ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc};
use turbopack_core::{
    context::AssetContext, module::Module, reference::primary_referenced_modules,
};

use crate::dynamic_imports::{map_next_dynamic, DynamicImportsHashMap};

#[turbo_tasks::value(cell = "new", eq = "manual", into = "new")]
#[derive(Clone, Debug, Default)]
pub struct SingleModuleGraph {
    #[turbo_tasks(trace_ignore)]
    pub graph: DiGraph<Vc<Box<dyn Module>>, ()>,
}

#[turbo_tasks::value(transparent)]
#[derive(Clone, Debug)]
pub struct SingleModuleGraphs(pub Vec<Vc<SingleModuleGraph>>);

#[turbo_tasks::value(transparent)]
#[derive(Clone, Debug)]
pub struct ModuleSet(pub HashSet<Vc<Box<dyn Module>>>);

#[turbo_tasks::value_impl]
impl SingleModuleGraph {
    #[turbo_tasks::function]
    pub async fn new_with_entries(entries: Vec<Vc<Box<dyn Module>>>) -> Result<Vc<Self>> {
        let mut graph = DiGraph::new();

        let mut modules: HashMap<Vc<Box<dyn Module>>, NodeIndex<u32>> = HashMap::new();
        let mut stack: Vec<_> = entries.into_iter().map(|e| (None, e)).collect();
        while let Some((parent_idx, module)) = stack.pop() {
            if let Some(idx) = modules.get(&module) {
                let parent_idx = parent_idx.context("Existing module without parent")?;
                graph.add_edge(parent_idx, *idx, ());
                continue;
            }

            let idx = graph.add_node(module);
            modules.insert(module, idx);
            if let Some(parent_idx) = parent_idx {
                graph.add_edge(parent_idx, idx, ());
            }

            // TODO this includes
            // [project]/packages/next/dist/shared/lib/lazy-dynamic/loadable.js.map
            for reference in primary_referenced_modules(module).await?.iter() {
                stack.push((Some(idx), **reference));
            }
        }

        Ok(SingleModuleGraph { graph }.cell())
    }

    #[turbo_tasks::function]
    pub async fn new_with_entries_visited(
        entries: Vec<Vc<Box<dyn Module>>>,
        visited_modules: Vc<ModuleSet>,
    ) -> Result<Vc<Self>> {
        let visited_modules = visited_modules.await?;

        let mut graph = DiGraph::new();

        let mut modules: HashMap<Vc<Box<dyn Module>>, NodeIndex<u32>> = HashMap::new();
        let mut stack: Vec<_> = entries.into_iter().map(|e| (None, e)).collect();
        while let Some((parent_idx, module)) = stack.pop() {
            if visited_modules.contains(&module) {
                continue;
            }
            if let Some(idx) = modules.get(&module) {
                if let Some(parent_idx) = parent_idx {
                    graph.add_edge(parent_idx, *idx, ());
                }
                continue;
            }

            let idx = graph.add_node(module);
            modules.insert(module, idx);
            if let Some(parent_idx) = parent_idx {
                graph.add_edge(parent_idx, idx, ());
            }

            // TODO this includes
            // [project]/packages/next/dist/shared/lib/lazy-dynamic/loadable.js.map
            for reference in primary_referenced_modules(module).await?.iter() {
                stack.push((Some(idx), **reference));
            }
        }

        Ok(SingleModuleGraph { graph }.cell())
    }
}

pub async fn get_module_graph_for_page(
    rsc_entry: Vc<Box<dyn Module>>,
) -> Result<SingleModuleGraphs> {
    // TODO
    // if is_production() {
    //    return the one graph for the whole app
    // }

    let ServerEntries {
        server_utils,
        server_component_entries,
    } = &*find_server_entries(rsc_entry).await?;

    let graph = SingleModuleGraph::new_with_entries_visited(
        server_utils.clone(),
        Vc::cell(Default::default()),
    );
    let mut visited_modules: HashSet<_> = graph.await?.graph.node_weights().copied().collect();

    let mut graphs = vec![graph];
    for module in server_component_entries
        .iter()
        .map(|m| Vc::upcast::<Box<dyn Module>>(*m))
        .chain(std::iter::once(rsc_entry))
    {
        let graph = SingleModuleGraph::new_with_entries_visited(
            vec![module],
            Vc::cell(visited_modules.clone()),
        );
        visited_modules.extend(graph.await?.graph.node_weights().copied());
        graphs.push(graph);
    }

    Ok(SingleModuleGraphs(graphs))
}

#[turbo_tasks::value]
pub struct NextDynamicGraph {
    graph: ResolvedVc<SingleModuleGraph>,
    /// RSC/SSR importer -> dynamic imports (specifier and client module)
    data: ResolvedVc<DynamicImportsHashMap>,
}
#[turbo_tasks::value_impl]
impl NextDynamicGraph {
    #[turbo_tasks::function]
    pub async fn new_with_entries(
        graph: ResolvedVc<SingleModuleGraph>,
        client_asset_context: Vc<Box<dyn AssetContext>>,
    ) -> Result<Vc<Self>> {
        let mapped = map_next_dynamic(*graph, client_asset_context);

        // TODO shrink graph here, using the information from `mapped` (which lists the relevant
        // nodes)

        // This would clone the graph and allow changing the node weights. We can probably get away
        // with keeping the sidecar information separate from the graph itself, though.
        //
        // let mut reduced_modules: HashMap<Vc<Box<dyn Module>>, NodeIndex<u32>> =
        // HashMap::new(); let mut reduced_graph = DiGraph::new();
        // for idx in graph.node_indices() {
        //     let weight = *graph.node_weight(idx).unwrap();
        //     let new_idx = reduced_graph.add_node(weight);
        //     reduced_modules.insert(weight, new_idx);
        //     for e in graph.edges_directed(idx, petgraph::Direction::Outgoing) {
        //         let target_weight = *graph.node_weight(e.target()).context("Missing
        // target")?;         if let Some(new_target_idx) =
        // reduced_modules.get(&target_weight) {
        // reduced_graph.add_edge(new_idx, *new_target_idx, ());         } else {
        //             let new_idx = reduced_graph.add_node(target_weight);
        //             reduced_modules.insert(target_weight, new_idx);
        //         }
        //     }
        // }

        Ok(NextDynamicGraph {
            graph,
            data: mapped.to_resolved().await?,
        }
        .cell())
    }
    #[turbo_tasks::function]
    pub async fn get_next_dynamic_imports_for_page(
        &self,
        _rsc_entry: Vc<Box<dyn Module>>,
    ) -> Result<Vc<DynamicImportsHashMap>> {
        // TODO
        // if production {
        //    return walk graph and return relevant nodes to this page
        // }
        Ok(*self.data)
    }
}

// In dev, a graph containing the modules of the current page
// In prod, a graph contaning everything in the whole app
#[turbo_tasks::value]
pub struct ReducedGraphs {
    pub next_dynamic: Vec<ResolvedVc<NextDynamicGraph>>,
    // TODO add other graphs
}

#[turbo_tasks::value_impl]
impl ReducedGraphs {
    #[turbo_tasks::function]
    pub async fn get_next_dynamic_imports_for_page(
        &self,
        rsc_entry: Vc<Box<dyn Module>>,
    ) -> Result<Vc<DynamicImportsHashMap>> {
        let result = self
            .next_dynamic
            .iter()
            .map(|graph| async move {
                Ok(graph
                    .get_next_dynamic_imports_for_page(rsc_entry)
                    .await?
                    .iter()
                    .map(|(k, v)| (*k, v.clone()))
                    // TODO remove this collect and return an iterator instead
                    .collect::<Vec<_>>())
            })
            .try_flat_join()
            .await?;

        Ok(DynamicImportsHashMap(result.into_iter().collect()).cell())
    }
}

#[turbo_tasks::function]
pub async fn get_reduced_graphs_for_page(
    rsc_entry: Vc<Box<dyn Module>>,
    // TODO instead do that later on per-page traversal
    client_asset_context: Vc<Box<dyn AssetContext>>,
) -> Result<Vc<ReducedGraphs>> {
    // if production
    //   // ignore rsc_entry
    //   let graphs = create_module_graph_for_entries(project.get_all_entries())
    // else
    //
    let graphs = get_module_graph_for_page(rsc_entry).await?.0;

    let next_dynamic = graphs
        .iter()
        .map(|graph| NextDynamicGraph::new_with_entries(*graph, client_asset_context).to_resolved())
        .try_join()
        .await?;

    Ok(ReducedGraphs { next_dynamic }.cell())
}
