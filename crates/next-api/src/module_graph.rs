use std::{
    borrow::Cow,
    collections::{HashMap, HashSet},
};

use anyhow::Result;
use next_core::{
    mode::NextMode,
    next_client_reference::{
        find_server_entries, ClientReference, ClientReferenceGraphResult, ClientReferenceType,
        ServerEntries, VisitedClientReferenceGraphNodes,
    },
    next_dynamic::NextDynamicEntryModule,
    next_manifests::ActionLayer,
};
use tracing::Instrument;
use turbo_tasks::{
    CollectiblesSource, FxIndexMap, FxIndexSet, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc,
};
use turbopack_core::{
    context::AssetContext,
    issue::Issue,
    module::Module,
    module_graph::{GraphTraversalAction, SingleModuleGraph},
};

use crate::{
    client_references::{map_client_references, ClientReferenceMapType, ClientReferencesSet},
    dynamic_imports::{map_next_dynamic, DynamicImportEntries, DynamicImportEntriesMapType},
    project::Project,
    server_actions::{map_server_actions, to_rsc_context, AllActions, AllModuleActions},
};

#[turbo_tasks::value(transparent)]
#[derive(Clone, Debug)]
struct SingleModuleGraphs(pub Vec<ResolvedVc<SingleModuleGraph>>);

/// Implements layout segment optimization to compute a graph "chain" for each layout segment
#[turbo_tasks::function]
async fn get_module_graph_for_endpoint(
    entry: ResolvedVc<Box<dyn Module>>,
) -> Result<Vc<SingleModuleGraphs>> {
    let ServerEntries {
        server_utils,
        server_component_entries,
    } = &*find_server_entries(*entry).await?;

    let mut graphs = vec![];

    let mut visited_modules = if !server_utils.is_empty() {
        let graph = SingleModuleGraph::new_with_entries_visited(
            *entry,
            server_utils.iter().map(|m| **m).collect(),
            Vc::cell(Default::default()),
        )
        .to_resolved()
        .await?;
        graphs.push(graph);
        graph
            .await?
            .iter_nodes()
            .map(|n| n.module)
            .collect::<HashSet<_>>()
    } else {
        HashSet::new()
    };

    // ast-grep-ignore: to-resolved-in-loop
    for module in server_component_entries.iter() {
        let graph = SingleModuleGraph::new_with_entries_visited(
            *entry,
            vec![Vc::upcast(**module)],
            Vc::cell(visited_modules.clone()),
        )
        .to_resolved()
        .await?;
        graphs.push(graph);
        let is_layout = module.server_path().file_stem().await?.as_deref() == Some("layout");
        if is_layout {
            // Only propagate the visited_modules of the parent layout(s), not across siblings such
            // as loading.js and page.js.
            visited_modules.extend(graph.await?.iter_nodes().map(|n| n.module));
        }
    }

    // Any previous iteration above would have added the entry node, but not actually visited it.
    visited_modules.remove(&entry);
    let graph = SingleModuleGraph::new_with_entries_visited(
        *entry,
        vec![*entry],
        Vc::cell(visited_modules.clone()),
    )
    .to_resolved()
    .await?;
    graphs.push(graph);

    Ok(Vc::cell(graphs))
}

#[turbo_tasks::value]
pub struct NextDynamicGraph {
    is_single_page: bool,
    graph: ResolvedVc<SingleModuleGraph>,
    /// list of NextDynamicEntryModules
    data: ResolvedVc<DynamicImportEntries>,
}

#[turbo_tasks::value(transparent)]
pub struct DynamicImportEntriesWithImporter(
    pub  Vec<(
        ResolvedVc<NextDynamicEntryModule>,
        Option<ClientReferenceType>,
    )>,
);

#[turbo_tasks::value_impl]
impl NextDynamicGraph {
    #[turbo_tasks::function]
    pub async fn new_with_entries(
        graph: ResolvedVc<SingleModuleGraph>,
        is_single_page: bool,
    ) -> Result<Vc<Self>> {
        let mapped = map_next_dynamic(*graph);

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
    pub async fn get_next_dynamic_imports_for_endpoint(
        &self,
        entry: ResolvedVc<Box<dyn Module>>,
    ) -> Result<Vc<DynamicImportEntriesWithImporter>> {
        let span = tracing::info_span!("collect next/dynamic imports for endpoint");
        async move {
            let data = &*self.data.await?;
            let graph = &*self.graph.await?;

            #[derive(Clone, PartialEq, Eq)]
            enum VisitState {
                Entry,
                InClientReference(ClientReferenceType),
            }

            let mut result = vec![];

            // module -> the client reference entry (if any)
            let mut state_map = HashMap::new();
            graph.traverse_edges_from_entry(entry, |parent_info, node| {
                let module = node.module;
                let Some((parent_node, _)) = parent_info else {
                    state_map.insert(module, VisitState::Entry);
                    return GraphTraversalAction::Continue;
                };
                let parent_module = parent_node.module;

                let module_type = data.get(&module);
                let parent_state = state_map.get(&parent_module).unwrap().clone();
                let parent_client_reference =
                    if let Some(DynamicImportEntriesMapType::ClientReference(module)) = module_type
                    {
                        Some(ClientReferenceType::EcmascriptClientReference {
                            parent_module,
                            module: *module,
                        })
                    } else if let VisitState::InClientReference(ty) = parent_state {
                        Some(ty)
                    } else {
                        None
                    };

                match module_type {
                    Some(DynamicImportEntriesMapType::DynamicEntry(dynamic_entry)) => {
                        result.push((*dynamic_entry, parent_client_reference));

                        state_map.insert(module, parent_state);
                        GraphTraversalAction::Skip
                    }
                    Some(DynamicImportEntriesMapType::ClientReference(client_reference)) => {
                        state_map.insert(
                            module,
                            VisitState::InClientReference(
                                ClientReferenceType::EcmascriptClientReference {
                                    parent_module,
                                    module: *client_reference,
                                },
                            ),
                        );
                        GraphTraversalAction::Continue
                    }
                    None => {
                        state_map.insert(module, parent_state);
                        GraphTraversalAction::Continue
                    }
                }
            })?;
            Ok(Vc::cell(result))
        }
        .instrument(span)
        .await
    }
}

#[turbo_tasks::value]
pub struct ServerActionsGraph {
    is_single_page: bool,
    graph: ResolvedVc<SingleModuleGraph>,
    /// (Layer, RSC or Browser module) -> list of actions
    data: ResolvedVc<AllModuleActions>,
}

#[turbo_tasks::value_impl]
impl ServerActionsGraph {
    #[turbo_tasks::function]
    pub async fn new_with_entries(
        graph: ResolvedVc<SingleModuleGraph>,
        is_single_page: bool,
    ) -> Result<Vc<Self>> {
        let mapped = map_server_actions(*graph);

        // TODO shrink graph here

        Ok(ServerActionsGraph {
            is_single_page,
            graph,
            data: mapped.to_resolved().await?,
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub async fn get_server_actions_for_endpoint(
        &self,
        entry: ResolvedVc<Box<dyn Module>>,
        rsc_asset_context: Vc<Box<dyn AssetContext>>,
    ) -> Result<Vc<AllActions>> {
        let span = tracing::info_span!("collect server actions for endpoint");
        async move {
            let data = &*self.data.await?;
            let data = if self.is_single_page {
                // The graph contains the page (= `entry`) only, no need to filter.
                Cow::Borrowed(data)
            } else {
                // The graph contains the whole app, traverse and collect all reachable imports.
                let graph = &*self.graph.await?;

                let mut result = HashMap::new();
                graph.traverse_from_entry(entry, |node| {
                    if let Some(node_data) = data.get(&node.module) {
                        result.insert(node.module, *node_data);
                    }
                })?;
                Cow::Owned(result)
            };

            let actions = data
                .iter()
                .map(|(module, (layer, actions))| async move {
                    actions
                        .await?
                        .iter()
                        .map(|(hash, name)| async move {
                            Ok((
                                hash.to_string(),
                                (
                                    *layer,
                                    name.to_string(),
                                    if *layer == ActionLayer::Rsc {
                                        *module
                                    } else {
                                        to_rsc_context(**module, rsc_asset_context).await?
                                    },
                                ),
                            ))
                        })
                        .try_join()
                        .await
                })
                .try_flat_join()
                .await?;
            Ok(Vc::cell(actions.into_iter().collect()))
        }
        .instrument(span)
        .await
    }
}

#[turbo_tasks::value]
pub struct ClientReferencesGraph {
    is_single_page: bool,
    graph: ResolvedVc<SingleModuleGraph>,
    /// List of client references (modules that entries into the client graph)
    data: ResolvedVc<ClientReferencesSet>,
}

#[turbo_tasks::value_impl]
impl ClientReferencesGraph {
    #[turbo_tasks::function]
    pub async fn new_with_entries(
        graph: ResolvedVc<SingleModuleGraph>,
        is_single_page: bool,
    ) -> Result<Vc<Self>> {
        // TODO if is_single_page, then perform the graph traversal below in map_client_references
        // already, which saves us a traversal.
        let mapped = map_client_references(*graph);

        // TODO shrink graph here

        Ok(Self {
            is_single_page,
            graph,
            data: mapped.to_resolved().await?,
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub async fn get_client_references_for_endpoint(
        &self,
        entry: ResolvedVc<Box<dyn Module>>,
    ) -> Result<Vc<ClientReferenceGraphResult>> {
        let span = tracing::info_span!("collect client references for endpoint");
        async move {
            let data = &*self.data.await?;
            let graph = &*self.graph.await?;

            let mut client_references = FxIndexSet::default();
            // Make sure None (for the various internal next/dist/esm/client/components/*) is
            // listed first
            let mut client_references_by_server_component =
                FxIndexMap::from_iter([(None, Vec::new())]);

            graph.traverse_edges_from_entry_topological(
                entry,
                // state_map is `module -> Option< the current so parent server component >`
                &mut HashMap::new(),
                |parent_info, node, state_map| {
                    let module = node.module;
                    let Some((parent_node, _)) = parent_info else {
                        state_map.insert(module, None);
                        return GraphTraversalAction::Continue;
                    };
                    let module = node.module;
                    let module_type = data.get(&module);

                    let current_server_component = if let Some(
                        ClientReferenceMapType::ServerComponent(module),
                    ) = module_type
                    {
                        Some(*module)
                    } else {
                        *state_map.get(&parent_node.module).unwrap()
                    };

                    state_map.insert(module, current_server_component);

                    match module_type {
                        Some(
                            ClientReferenceMapType::EcmascriptClientReference { .. }
                            | ClientReferenceMapType::CssClientReference { .. },
                        ) => GraphTraversalAction::Skip,
                        _ => GraphTraversalAction::Continue,
                    }
                },
                |parent_info, node, state_map| {
                    let Some((parent_node, _)) = parent_info else {
                        return;
                    };
                    let parent_module = parent_node.module;

                    let parent_server_component = *state_map.get(&parent_module).unwrap();

                    match data.get(&node.module) {
                        Some(ClientReferenceMapType::EcmascriptClientReference {
                            module: module_ref,
                            ssr_module,
                        }) => {
                            let client_reference: ClientReference = ClientReference {
                                server_component: parent_server_component,
                                ty: ClientReferenceType::EcmascriptClientReference {
                                    parent_module,
                                    module: *module_ref,
                                },
                            };
                            client_references.insert(client_reference);
                            client_references_by_server_component
                                .entry(parent_server_component)
                                .or_insert_with(Vec::new)
                                .push(*ssr_module);
                        }
                        Some(ClientReferenceMapType::CssClientReference(module_ref)) => {
                            let client_reference = ClientReference {
                                server_component: parent_server_component,
                                ty: ClientReferenceType::CssClientReference(*module_ref),
                            };
                            client_references.insert(client_reference);
                        }
                        _ => {}
                    };
                },
            )?;

            Ok(ClientReferenceGraphResult {
                client_references: client_references.into_iter().collect(),
                client_references_by_server_component,
                server_utils: vec![],
                server_component_entries: vec![],
                // TODO remove
                visited_nodes: VisitedClientReferenceGraphNodes::empty()
                    .to_resolved()
                    .await?,
            }
            .cell())
        }
        .instrument(span)
        .await
    }
}

/// The consumers of this shouldn't need to care about the exact contents since it's abstracted away
/// by the accessor functions, but
/// - In dev, contains information about the modules of the current endpoint only
/// - In prod, there is a single `ReducedGraphs` for the whole app, containing all pages
#[turbo_tasks::value]
pub struct ReducedGraphs {
    next_dynamic: Vec<ResolvedVc<NextDynamicGraph>>,
    server_actions: Vec<ResolvedVc<ServerActionsGraph>>,
    client_references: Vec<ResolvedVc<ClientReferencesGraph>>,
    // TODO add other graphs
}

#[turbo_tasks::value_impl]
impl ReducedGraphs {
    /// Returns the next/dynamic-ally imported (client) modules (from RSC and SSR modules) for the
    /// given endpoint.
    #[turbo_tasks::function]
    pub async fn get_next_dynamic_imports_for_endpoint(
        &self,
        entry: Vc<Box<dyn Module>>,
    ) -> Result<Vc<DynamicImportEntriesWithImporter>> {
        let span = tracing::info_span!("collect all next/dynamic imports for endpoint");
        async move {
            if let [graph] = &self.next_dynamic[..] {
                // Just a single graph, no need to merge results
                Ok(graph.get_next_dynamic_imports_for_endpoint(entry))
            } else {
                let result = self
                    .next_dynamic
                    .iter()
                    .map(|graph| async move {
                        Ok(graph
                            .get_next_dynamic_imports_for_endpoint(entry)
                            .await?
                            .into_iter()
                            .map(|(k, v)| (*k, *v))
                            // TODO remove this collect and return an iterator instead
                            .collect::<Vec<_>>())
                    })
                    .try_flat_join()
                    .await?;

                Ok(Vc::cell(result.into_iter().collect()))
            }
        }
        .instrument(span)
        .await
    }

    /// Returns the server actions for the given page.
    #[turbo_tasks::function]
    pub async fn get_server_actions_for_endpoint(
        &self,
        entry: Vc<Box<dyn Module>>,
        rsc_asset_context: Vc<Box<dyn AssetContext>>,
    ) -> Result<Vc<AllActions>> {
        let span = tracing::info_span!("collect all server actions for endpoint");
        async move {
            if let [graph] = &self.server_actions[..] {
                // Just a single graph, no need to merge results
                Ok(graph.get_server_actions_for_endpoint(entry, rsc_asset_context))
            } else {
                let result = self
                    .server_actions
                    .iter()
                    .map(|graph| async move {
                        Ok(graph
                            .get_server_actions_for_endpoint(entry, rsc_asset_context)
                            .await?
                            .clone_value())
                    })
                    .try_flat_join()
                    .await?;

                Ok(Vc::cell(result.into_iter().collect()))
            }
        }
        .instrument(span)
        .await
    }

    /// Returns the client references for the given page.
    #[turbo_tasks::function]
    pub async fn get_client_references_for_endpoint(
        &self,
        entry: Vc<Box<dyn Module>>,
    ) -> Result<Vc<ClientReferenceGraphResult>> {
        let span = tracing::info_span!("collect all client references for endpoint");
        async move {
            let mut result = if let [graph] = &self.client_references[..] {
                // Just a single graph, no need to merge results
                graph
                    .get_client_references_for_endpoint(entry)
                    .await?
                    .clone_value()
            } else {
                let results = self
                    .client_references
                    .iter()
                    .map(|graph| async move {
                        let get_client_references_for_endpoint =
                            graph.get_client_references_for_endpoint(entry).await?;
                        Ok(get_client_references_for_endpoint)
                    })
                    .try_join()
                    .await?;

                let mut result = results[0].clone_value();
                for r in results.into_iter().skip(1) {
                    result.extend(&r);
                }
                result
            };

            // Do this separately for now, because the graph traversal order messes up the order of
            // the server_component_entries.
            let ServerEntries {
                server_utils,
                server_component_entries,
            } = &*find_server_entries(entry).await?;
            result.server_utils = server_utils.clone();
            result.server_component_entries = server_component_entries.clone();

            Ok(result.cell())
        }
        .instrument(span)
        .await
    }
}

// This is a performance optimization. This function is a root aggregation function that aggregates
// over the whole subgraph.
#[turbo_tasks::function]
async fn get_global_module_graph(project: ResolvedVc<Project>) -> Vc<SingleModuleGraph> {
    SingleModuleGraph::new_with_entries(project.get_all_entries())
}

#[turbo_tasks::function(operation)]
async fn get_reduced_graphs_for_endpoint_inner_operation(
    project: ResolvedVc<Project>,
    entry: ResolvedVc<Box<dyn Module>>,
) -> Result<Vc<ReducedGraphs>> {
    let (is_single_page, graphs) = match &*project.next_mode().await? {
        NextMode::Development => (
            true,
            async move { get_module_graph_for_endpoint(*entry).await }
                .instrument(tracing::info_span!("module graph for endpoint"))
                .await?
                .clone_value(),
        ),
        NextMode::Build => (
            false,
            vec![
                async move {
                    get_global_module_graph(*project)
                        .resolve_strongly_consistent()
                        .await?
                        .to_resolved()
                        .await
                }
                .instrument(tracing::info_span!("module graph for app"))
                .await?,
            ],
        ),
    };

    let next_dynamic = async {
        graphs
            .iter()
            .map(|graph| NextDynamicGraph::new_with_entries(**graph, is_single_page).to_resolved())
            .try_join()
            .await
    }
    .instrument(tracing::info_span!("generating next/dynamic graphs"))
    .await?;

    let server_actions = async {
        graphs
            .iter()
            .map(|graph| {
                ServerActionsGraph::new_with_entries(**graph, is_single_page).to_resolved()
            })
            .try_join()
            .await
    }
    .instrument(tracing::info_span!("generating server actions graphs"))
    .await?;

    let client_references = async {
        graphs
            .iter()
            .map(|graph| {
                ClientReferencesGraph::new_with_entries(**graph, is_single_page).to_resolved()
            })
            .try_join()
            .await
    }
    .instrument(tracing::info_span!("generating client references graphs"))
    .await?;

    Ok(ReducedGraphs {
        next_dynamic,
        server_actions,
        client_references,
    }
    .cell())
}

/// Generates a [ReducedGraph] for the given project and endpoint containing information that is
/// either global (module ids, chunking) or computed globally as a performance optimization (client
/// references, etc).
#[turbo_tasks::function]
pub async fn get_reduced_graphs_for_endpoint(
    project: ResolvedVc<Project>,
    entry: ResolvedVc<Box<dyn Module>>,
) -> Result<Vc<ReducedGraphs>> {
    // TODO get rid of this function once everything inside of
    // `get_reduced_graphs_for_endpoint_inner` calls `take_collectibles()` when needed
    let result_op = get_reduced_graphs_for_endpoint_inner_operation(project, entry);
    let result_vc = result_op.connect();
    if project.next_mode().await?.is_production() {
        result_vc.strongly_consistent().await?;
        let _issues = result_op.take_collectibles::<Box<dyn Issue>>();
    }
    Ok(result_vc)
}
