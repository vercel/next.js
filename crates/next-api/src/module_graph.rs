use std::collections::{HashMap, HashSet};

use anyhow::Result;
use next_core::{
    mode::NextMode,
    next_client_reference::{find_server_entries, ServerEntries},
};
use petgraph::{
    graph::{DiGraph, NodeIndex},
    visit::Dfs,
};
use turbo_tasks::{ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc};
use turbopack_core::{
    context::AssetContext,
    module::{Module, Modules},
    reference::primary_referenced_modules,
};

use crate::{
    dynamic_imports::{map_next_dynamic, DynamicImportsHashMap},
    project::Project,
};

#[turbo_tasks::value(cell = "new", eq = "manual", into = "new")]
#[derive(Clone, Debug, Default)]
pub struct SingleModuleGraph {
    #[turbo_tasks(trace_ignore)]
    pub graph: DiGraph<ResolvedVc<Box<dyn Module>>, ()>,
    // NodeIndex isn't necessarily stable, but these are first nodes in the graph, so shouldn't
    // ever be involved in a swap_remove operation
    #[turbo_tasks(trace_ignore)]
    pub entries: HashMap<ResolvedVc<Box<dyn Module>>, NodeIndex>,
}

#[turbo_tasks::value(transparent)]
#[derive(Clone, Debug)]
pub struct ModuleSet(pub HashSet<ResolvedVc<Box<dyn Module>>>);

impl SingleModuleGraph {
    async fn new_inner(
        entries: &Vec<ResolvedVc<Box<dyn Module>>>,
        visited_modules: &HashSet<ResolvedVc<Box<dyn Module>>>,
    ) -> Result<Vc<Self>> {
        let mut graph = DiGraph::new();

        let mut modules: HashMap<ResolvedVc<Box<dyn Module>>, NodeIndex<u32>> = HashMap::new();
        let mut stack: Vec<_> = entries.iter().map(|e| (None, *e)).collect();
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
            for reference in primary_referenced_modules(*module).await?.iter() {
                stack.push((Some(idx), *reference));
            }
        }
        Ok(SingleModuleGraph {
            graph,
            entries: entries
                .iter()
                .map(|e| (*e, *modules.get(e).unwrap()))
                .collect(),
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl SingleModuleGraph {
    #[turbo_tasks::function]
    pub async fn new_with_entries(entries: Vc<Modules>) -> Result<Vc<Self>> {
        SingleModuleGraph::new_inner(&*entries.await?, &Default::default()).await
    }

    #[turbo_tasks::function]
    pub async fn new_with_entries_visited(
        // This must not be a Vc<Vec<_>> to ensure layout segment optimization hits the cache
        entries: Vec<ResolvedVc<Box<dyn Module>>>,
        visited_modules: Vc<ModuleSet>,
    ) -> Result<Vc<Self>> {
        SingleModuleGraph::new_inner(&entries, &*visited_modules.await?).await
    }
}

async fn get_module_graph_for_page(
    rsc_entry: Vc<Box<dyn Module>>,
) -> Result<Vec<ResolvedVc<SingleModuleGraph>>> {
    let ServerEntries {
        server_utils,
        server_component_entries,
    } = &*find_server_entries(rsc_entry).await?;

    let graph = SingleModuleGraph::new_with_entries_visited(
        server_utils.clone(),
        Vc::cell(Default::default()),
    )
    .to_resolved()
    .await?;
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
        )
        .to_resolved()
        .await?;
        visited_modules.extend(graph.await?.graph.node_weights().copied());
        graphs.push(graph);
    }

    Ok(graphs)
}

#[turbo_tasks::function]
async fn get_module_graph_for_app(entries: Vc<Modules>) -> Vc<SingleModuleGraph> {
    SingleModuleGraph::new_with_entries(entries)
}

#[turbo_tasks::value]
pub struct NextDynamicGraph {
    is_single_page: bool,
    graph: ResolvedVc<SingleModuleGraph>,
    /// RSC/SSR importer -> dynamic imports (specifier and client module)
    data: ResolvedVc<DynamicImportsHashMap>,
}

#[turbo_tasks::value_impl]
impl NextDynamicGraph {
    #[turbo_tasks::function]
    pub async fn new_with_entries(
        graph: ResolvedVc<SingleModuleGraph>,
        is_single_page: bool,
        client_asset_context: Vc<Box<dyn AssetContext>>,
    ) -> Result<Vc<Self>> {
        let mapped = map_next_dynamic(*graph, client_asset_context);

        // TODO shrink graph here, using the information from
        //  - `mapped` (which lists the relevant nodes)
        //  - `graph.entries` (which lists the page/route/... entries we need to keep)

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
            is_single_page,
            graph,
            data: mapped.to_resolved().await?,
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub async fn get_next_dynamic_imports_for_page(
        &self,
        rsc_entry: ResolvedVc<Box<dyn Module>>,
    ) -> Result<Vc<DynamicImportsHashMap>> {
        if self.is_single_page {
            // No need to traverse and collect (filter) just the imports for that single page
            Ok(*self.data)
        } else {
            let SingleModuleGraph { graph, entries } = &*self.graph.await?;
            let data = &self.data.await?;

            let mut result = HashMap::new();

            let rsc_entry_node = *entries.get(&rsc_entry).unwrap();
            let mut dfs = Dfs::new(&graph, rsc_entry_node);
            while let Some(nx) = dfs.next(&graph) {
                let weight = *graph.node_weight(nx).unwrap();
                if let Some(node_data) = data.get(&weight) {
                    result.insert(weight, node_data.clone());
                }
            }

            Ok(Vc::cell(result))
        }
    }
}

// In dev, a graph containing the modules of the current page
// In prod, a graph contaning everything in the whole app
#[turbo_tasks::value]
pub struct ReducedGraphs {
    next_dynamic: Vec<ResolvedVc<NextDynamicGraph>>,
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
    project: Vc<Project>,
) -> Result<Vc<ReducedGraphs>> {
    let (is_single_page, graphs) = match &*project.next_mode().await? {
        NextMode::Development => (true, get_module_graph_for_page(rsc_entry).await?),
        NextMode::Build => (
            false,
            vec![
                get_module_graph_for_app(project.get_all_entries())
                    .to_resolved()
                    .await?,
            ],
        ),
    };

    let next_dynamic = graphs
        .iter()
        .map(|graph| {
            NextDynamicGraph::new_with_entries(**graph, is_single_page, client_asset_context)
                .to_resolved()
        })
        .try_join()
        .await?;

    Ok(ReducedGraphs { next_dynamic }.cell())
}
