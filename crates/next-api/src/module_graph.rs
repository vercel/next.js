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
    graph: DiGraph<ResolvedVc<Box<dyn Module>>, ()>,
    // NodeIndex isn't necessarily stable, but these are first nodes in the graph, so shouldn't
    // ever be involved in a swap_remove operation
    #[turbo_tasks(trace_ignore)]
    entries: HashMap<ResolvedVc<Box<dyn Module>>, NodeIndex>,
}

#[turbo_tasks::value(transparent)]
#[derive(Clone, Debug)]
struct ModuleSet(pub HashSet<ResolvedVc<Box<dyn Module>>>);

impl SingleModuleGraph {
    /// Walks the graph starting from the given entries and collects all reachable nodes, skipping
    /// nodes listed in `visited_modules`
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

    pub fn enumerate_nodes(
        &self,
    ) -> impl Iterator<Item = (NodeIndex, ResolvedVc<Box<dyn Module>>)> + '_ {
        self.graph
            .node_indices()
            .map(move |idx| (idx, *self.graph.node_weight(idx).unwrap()))
    }
}

#[turbo_tasks::value_impl]
impl SingleModuleGraph {
    #[turbo_tasks::function]
    async fn new_with_entries(entries: Vc<Modules>) -> Result<Vc<Self>> {
        SingleModuleGraph::new_inner(&*entries.await?, &Default::default()).await
    }

    #[turbo_tasks::function]
    async fn new_with_entries_visited(
        // This must not be a Vc<Vec<_>> to ensure layout segment optimization hits the cache
        entries: Vec<ResolvedVc<Box<dyn Module>>>,
        visited_modules: Vc<ModuleSet>,
    ) -> Result<Vc<Self>> {
        SingleModuleGraph::new_inner(&entries, &*visited_modules.await?).await
    }
}

/// Implements layout segment optimization to compute a graph "chain" for each layout segment
async fn get_module_graph_for_page(
    entry: ResolvedVc<Box<dyn Module>>,
) -> Result<Vec<ResolvedVc<SingleModuleGraph>>> {
    let ServerEntries {
        server_utils,
        server_component_entries,
    } = &*find_server_entries(*entry).await?;

    let graph = SingleModuleGraph::new_with_entries_visited(
        server_utils.iter().map(|m| **m).collect(),
        Vc::cell(Default::default()),
    )
    .to_resolved()
    .await?;
    let mut visited_modules: HashSet<_> = graph.await?.graph.node_weights().copied().collect();

    let mut graphs = vec![graph];
    for module in server_component_entries
        .iter()
        .map(|m| ResolvedVc::upcast::<Box<dyn Module>>(*m))
        .chain(std::iter::once(entry))
    {
        let graph = SingleModuleGraph::new_with_entries_visited(
            vec![*module],
            Vc::cell(visited_modules.clone()),
        )
        .to_resolved()
        .await?;
        visited_modules.extend(graph.await?.graph.node_weights().copied());
        graphs.push(graph);
    }

    Ok(graphs)
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
        entry: ResolvedVc<Box<dyn Module>>,
    ) -> Result<Vc<DynamicImportsHashMap>> {
        if self.is_single_page {
            // The graph contains the page (= `entry`) only, no need to filter.
            Ok(*self.data)
        } else {
            // The graph contains the whole app, traverse and collect all reachable imports.
            let SingleModuleGraph { graph, entries } = &*self.graph.await?;
            let data = &self.data.await?;

            let mut result = HashMap::new();

            let entry_node = *entries.get(&entry).unwrap();
            let mut dfs = Dfs::new(&graph, entry_node);
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

/// The consumers of this shoudln't need to care about the exact contents since it's abstracted away
/// by the accessor functions, but
/// - In dev, contains information about the modules of the current page only
/// - In prod, there is a single `ReducedGraphs` for the whole app, containing all pages
#[turbo_tasks::value]
pub struct ReducedGraphs {
    next_dynamic: Vec<ResolvedVc<NextDynamicGraph>>,
    // TODO add other graphs
}

#[turbo_tasks::value_impl]
impl ReducedGraphs {
    /// Returns the dynamic imports in RSC and SSR modules for the given page.
    #[turbo_tasks::function]
    pub async fn get_next_dynamic_imports_for_page(
        &self,
        entry: Vc<Box<dyn Module>>,
    ) -> Result<Vc<DynamicImportsHashMap>> {
        if let [graph] = &self.next_dynamic[..] {
            // Just a single graph, no need to merge results
            Ok(graph.get_next_dynamic_imports_for_page(entry))
        } else {
            let result = self
                .next_dynamic
                .iter()
                .map(|graph| async move {
                    Ok(graph
                        .get_next_dynamic_imports_for_page(entry)
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
}

/// Generates a [ReducedGraph] for the given project and page containing information that is either
/// global (module ids, chunking) or computed globally as a performance optimization (client
/// references, etc).
#[turbo_tasks::function]
pub async fn get_reduced_graphs_for_page(
    project: Vc<Project>,
    entry: ResolvedVc<Box<dyn Module>>,
    // TODO should this happen globally or per page? Do they all have the same context?
    client_asset_context: Vc<Box<dyn AssetContext>>,
) -> Result<Vc<ReducedGraphs>> {
    let (is_single_page, graphs) = match &*project.next_mode().await? {
        NextMode::Development => (true, get_module_graph_for_page(entry).await?),
        NextMode::Build => (
            false,
            vec![
                SingleModuleGraph::new_with_entries(project.get_all_entries())
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
