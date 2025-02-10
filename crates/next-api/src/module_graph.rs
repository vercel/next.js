use std::borrow::Cow;

use anyhow::Result;
use next_core::{
    next_client_reference::{
        find_server_entries, ClientReference, ClientReferenceGraphResult, ClientReferenceType,
        ServerEntries, VisitedClientReferenceGraphNodes,
    },
    next_dynamic::NextDynamicEntryModule,
    next_manifests::ActionLayer,
};
use rustc_hash::FxHashMap;
use tracing::Instrument;
use turbo_tasks::{
    CollectiblesSource, FxIndexMap, FxIndexSet, ReadRef, ResolvedVc, TryFlatJoinIterExt,
    TryJoinIterExt, Vc,
};
use turbopack_core::{
    context::AssetContext,
    issue::Issue,
    module::Module,
    module_graph::{GraphTraversalAction, ModuleGraph, SingleModuleGraph},
};

use crate::{
    client_references::{map_client_references, ClientReferenceMapType, ClientReferencesSet},
    dynamic_imports::{map_next_dynamic, DynamicImportEntries, DynamicImportEntriesMapType},
    server_actions::{map_server_actions, to_rsc_context, AllActions, AllModuleActions},
};

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
        // let mut reduced_modules: FxHashMap<Vc<Box<dyn Module>>, NodeIndex<u32>> =
        // FxHashMap::default(); let mut reduced_graph = DiGraph::new();
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

            let entries: &[ResolvedVc<Box<dyn Module>>] = if !self.is_single_page {
                if !graph.entries.contains(&entry) {
                    // the graph doesn't contain the entry, e.g. for the additional module graph
                    return Ok(Vc::cell(vec![]));
                }
                &[entry]
            } else {
                &graph.entries
            };

            let mut result = vec![];

            // module -> the client reference entry (if any)
            let mut state_map = FxHashMap::default();
            graph.traverse_edges_from_entries(entries, |parent_info, node| {
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
                        Some(ClientReferenceType::EcmascriptClientReference(*module))
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
                                ClientReferenceType::EcmascriptClientReference(*client_reference),
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

                if !graph.entries.contains(&entry) {
                    // the graph doesn't contain the entry, e.g. for the additional module graph
                    return Ok(Vc::cell(Default::default()));
                }

                let mut result = FxHashMap::default();
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

            let entries: &[ResolvedVc<Box<dyn Module>>] = if !self.is_single_page {
                if !graph.entries.contains(&entry) {
                    // the graph doesn't contain the entry, e.g. for the additional module graph
                    return Ok(ClientReferenceGraphResult::default().cell());
                }
                &[entry]
            } else {
                &graph.entries
            };

            let mut client_references = FxIndexSet::default();
            // Make sure None (for the various internal next/dist/esm/client/components/*) is
            // listed first
            let mut client_references_by_server_component =
                FxIndexMap::from_iter([(None, Vec::new())]);

            graph.traverse_edges_from_entries_topological(
                entries,
                // state_map is `module -> Option< the current so parent server component >`
                &mut FxHashMap::default(),
                |parent_info, node, state_map| {
                    let module = node.module;
                    let module_type = data.get(&module);

                    let current_server_component = if let Some(
                        ClientReferenceMapType::ServerComponent(module),
                    ) = module_type
                    {
                        Some(*module)
                    } else if let Some((parent_node, _)) = parent_info {
                        *state_map.get(&parent_node.module).unwrap()
                    } else {
                        // a root node
                        None
                    };

                    state_map.insert(module, current_server_component);

                    Ok(match module_type {
                        Some(
                            ClientReferenceMapType::EcmascriptClientReference { .. }
                            | ClientReferenceMapType::CssClientReference { .. },
                        ) => GraphTraversalAction::Skip,
                        _ => GraphTraversalAction::Continue,
                    })
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
                                ty: ClientReferenceType::EcmascriptClientReference(*module_ref),
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
    #[turbo_tasks::function]
    pub async fn new(graphs: Vc<ModuleGraph>, is_single_page: bool) -> Result<Vc<Self>> {
        let graphs = &graphs.await?.graphs;
        let next_dynamic = async {
            graphs
                .iter()
                .map(|graph| {
                    NextDynamicGraph::new_with_entries(**graph, is_single_page).to_resolved()
                })
                .try_join()
                .await
        }
        .instrument(tracing::info_span!("generating next/dynamic graphs"));

        let server_actions = async {
            graphs
                .iter()
                .map(|graph| {
                    ServerActionsGraph::new_with_entries(**graph, is_single_page).to_resolved()
                })
                .try_join()
                .await
        }
        .instrument(tracing::info_span!("generating server actions graphs"));

        let client_references = async {
            graphs
                .iter()
                .map(|graph| {
                    ClientReferencesGraph::new_with_entries(**graph, is_single_page).to_resolved()
                })
                .try_join()
                .await
        }
        .instrument(tracing::info_span!("generating client references graphs"));

        let (next_dynamic, server_actions, client_references) =
            futures::join!(next_dynamic, server_actions, client_references);

        Ok(Self {
            next_dynamic: next_dynamic?,
            server_actions: server_actions?,
            client_references: client_references?,
        }
        .cell())
    }

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
                        graph
                            .get_server_actions_for_endpoint(entry, rsc_asset_context)
                            .owned()
                            .await
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
        has_layout_segments: bool,
    ) -> Result<Vc<ClientReferenceGraphResult>> {
        let span = tracing::info_span!("collect all client references for endpoint");
        async move {
            let mut result = if let [graph] = &self.client_references[..] {
                // Just a single graph, no need to merge results
                graph
                    .get_client_references_for_endpoint(entry)
                    .owned()
                    .await?
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

                let mut iter = results.into_iter();
                let mut result = ReadRef::into_owned(iter.next().unwrap());
                for r in iter {
                    result.extend(&r);
                }
                result
            };

            if has_layout_segments {
                // Do this separately for now, because the graph traversal order messes up the order
                // of the server_component_entries.
                let ServerEntries {
                    server_utils,
                    server_component_entries,
                } = &*find_server_entries(entry).await?;
                result.server_utils = server_utils.clone();
                result.server_component_entries = server_component_entries.clone();
            }

            Ok(result.cell())
        }
        .instrument(span)
        .await
    }
}

#[turbo_tasks::function(operation)]
async fn get_reduced_graphs_for_endpoint_inner_operation(
    module_graph: ResolvedVc<ModuleGraph>,
    is_single_page: bool,
) -> Vc<ReducedGraphs> {
    ReducedGraphs::new(*module_graph, is_single_page)
}

/// Generates a [ReducedGraph] for the given project and endpoint containing information that is
/// either global (module ids, chunking) or computed globally as a performance optimization (client
/// references, etc).
#[turbo_tasks::function]
pub async fn get_reduced_graphs_for_endpoint(
    module_graph: ResolvedVc<ModuleGraph>,
    is_single_page: bool,
) -> Result<Vc<ReducedGraphs>> {
    // TODO get rid of this function once everything inside of
    // `get_reduced_graphs_for_endpoint_inner` calls `take_collectibles()` when needed
    let result_op = get_reduced_graphs_for_endpoint_inner_operation(module_graph, is_single_page);
    let result_vc = if !is_single_page {
        let result_vc = result_op.resolve_strongly_consistent().await?;
        let _issues = result_op.take_collectibles::<Box<dyn Issue>>();
        *result_vc
    } else {
        result_op.connect()
    };
    Ok(result_vc)
}
