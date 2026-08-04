use std::borrow::Cow;

use anyhow::{Ok, Result};
use async_trait::async_trait;
use either::Either;
use futures::join;
use next_core::{
    next_client_reference::{
        ClientReference, ClientReferenceGraphResult, ClientReferenceType, ServerEntries,
        find_server_entries,
    },
    next_dynamic::NextDynamicEntryModule,
    next_manifests::ActionLayer,
    next_server_utility::server_utility_module::NextServerUtilityModule,
};
use rustc_hash::FxHashMap;
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    CollectiblesSource, FxIndexMap, FxIndexSet, OperationVc, ResolvedVc, TryFlatJoinIterExt,
    TryJoinIterExt, Vc,
};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    context::AssetContext,
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, StyledString},
    module::Module,
    module_graph::{GraphTraversalAction, ModuleGraph, ModuleGraphLayer},
};
use turbopack_css::{CssModule, EcmascriptCssModule};

use crate::{
    client_references::{ClientManifestEntryType, ClientReferenceData, map_client_references},
    dynamic_imports::{DynamicImportEntries, DynamicImportEntriesMapType, map_next_dynamic},
    server_actions::{
        ActionMeta, AllActions, AllModuleActions, map_server_actions, to_rsc_context,
    },
};

#[turbo_tasks::value]
pub struct NextDynamicGraph {
    graph: ResolvedVc<ModuleGraphLayer>,
    is_single_page: bool,

    /// list of NextDynamicEntryModules
    data: ResolvedVc<DynamicImportEntries>,
}

#[turbo_tasks::value]
pub struct NextDynamicGraphs(Vec<ResolvedVc<NextDynamicGraph>>);

#[turbo_tasks::value_impl]
impl NextDynamicGraphs {
    #[turbo_tasks::function(operation, root)]
    async fn new_operation(
        graphs: ResolvedVc<ModuleGraph>,
        is_single_page: bool,
    ) -> Result<Vc<Self>> {
        let graphs_ref = &turbo_tasks::read!(graphs.iter_graphs())?;
        #[cfg(not(feature = "sync"))]
        let next_dynamic = turbo_tasks::read!(
            async {
                turbo_tasks::read!(
                    graphs_ref
                        .iter()
                        .map(|graph| {
                            NextDynamicGraph::new_with_entries(graph.connect(), is_single_page)
                                .to_resolved()
                        })
                        .try_join()
                )
            }
            .instrument(tracing::info_span!("generating next/dynamic graphs"))
        )?;
        #[cfg(feature = "sync")]
        let next_dynamic = {
            let _span_guard = tracing::info_span!("generating next/dynamic graphs").entered();
            let mut next_dynamic = Vec::new();
            for graph in graphs_ref.iter() {
                next_dynamic.push(turbo_tasks::read!(
                    NextDynamicGraph::new_with_entries(graph.connect(), is_single_page)
                        .to_resolved()
                )?);
            }
            next_dynamic
        };
        Ok(Self(next_dynamic).cell())
    }

    #[turbo_tasks::function(root)]
    pub async fn new(graphs: ResolvedVc<ModuleGraph>, is_single_page: bool) -> Result<Vc<Self>> {
        // TODO get rid of this function once everything inside of
        // `get_global_information_for_endpoint_inner` calls `take_collectibles()` when needed
        let result_op = Self::new_operation(graphs, is_single_page);
        let result_vc = if !is_single_page {
            let result_vc = turbo_tasks::read!(result_op.resolve().strongly_consistent())?;
            result_op.drop_collectibles::<Box<dyn Issue>>();
            *result_vc
        } else {
            result_op.connect()
        };
        Ok(result_vc)
    }

    /// Returns the next/dynamic-ally imported (client) modules (from RSC and SSR modules) for the
    /// given endpoint.
    #[turbo_tasks::function]
    pub async fn get_next_dynamic_imports_for_endpoint(
        &self,
        entry: Vc<Box<dyn Module>>,
    ) -> Result<Vc<DynamicImportEntriesWithImporter>> {
        let span = tracing::info_span!("collect all next/dynamic imports for endpoint");
        #[cfg(not(feature = "sync"))]
        {
            turbo_tasks::read!(
                async move {
                    if let [graph] = &self.0[..] {
                        // Just a single graph, no need to merge results
                        Ok(graph.get_next_dynamic_imports_for_endpoint(entry))
                    } else {
                        let result = turbo_tasks::read!(
                            self.0
                                .iter()
                                .map(|graph| async move {
                                    Ok(turbo_tasks::read!(
                                        graph.get_next_dynamic_imports_for_endpoint(entry)
                                    )?
                                    .into_iter()
                                    // TODO remove this collect and return an iterator instead
                                    .collect::<Vec<_>>())
                                })
                                .try_flat_join()
                        )?;

                        Ok(Vc::cell(result.into_iter().collect()))
                    }
                }
                .instrument(span)
            )
        }
        #[cfg(feature = "sync")]
        {
            let _span_guard = span.entered();
            if let [graph] = &self.0[..] {
                // Just a single graph, no need to merge results
                Ok(graph.get_next_dynamic_imports_for_endpoint(entry))
            } else {
                let mut result = Vec::new();
                for graph in self.0.iter() {
                    result.extend({
                        Ok(
                            turbo_tasks::read!(graph.get_next_dynamic_imports_for_endpoint(entry))?
                                .into_iter()
                                .collect::<Vec<_>>(),
                        )
                    }?);
                }

                Ok(Vc::cell(result.into_iter().collect()))
            }
        }
    }
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
        graph: ResolvedVc<ModuleGraphLayer>,
        is_single_page: bool,
    ) -> Result<Vc<Self>> {
        let mapped = map_next_dynamic(*graph);

        Ok(NextDynamicGraph {
            is_single_page,
            graph,
            data: turbo_tasks::read!(mapped.to_resolved())?,
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub async fn get_next_dynamic_imports_for_endpoint(
        &self,
        entry: ResolvedVc<Box<dyn Module>>,
    ) -> Result<Vc<DynamicImportEntriesWithImporter>> {
        let span = tracing::info_span!("collect next/dynamic imports for endpoint");
        #[cfg(not(feature = "sync"))]
        {
            turbo_tasks::read!(
                async move {
                    let data = &*turbo_tasks::read!(self.data)?;
                    let graph = turbo_tasks::read!(self.graph)?;

                    #[derive(Clone, PartialEq, Eq)]
                    enum VisitState {
                        Entry,
                        InClientReference(ClientReferenceType),
                    }

                    let entries = if !self.is_single_page {
                        if !graph.graphs.first().unwrap().has_entry_module(entry) {
                            // the graph doesn't contain the entry, e.g. for the additional module
                            // graph
                            return Ok(Vc::cell(vec![]));
                        }
                        Either::Left(std::iter::once(entry))
                    } else {
                        Either::Right(graph.graphs.first().unwrap().chunk_group_modules())
                    };

                    let mut result = vec![];

                    // module -> the client reference entry (if any)
                    let mut state_map = FxHashMap::default();
                    graph.traverse_edges_dfs(
                        entries,
                        &mut (),
                        |parent_info, node, _| {
                            let module = node;
                            let Some((parent_node, _)) = parent_info else {
                                state_map.insert(module, VisitState::Entry);
                                return Ok(GraphTraversalAction::Continue);
                            };
                            let parent_module = parent_node;

                            let module_type = data.get(&module);
                            let parent_state = state_map.get(&parent_module).unwrap().clone();
                            let parent_client_reference =
                                if let Some(DynamicImportEntriesMapType::ClientReference(module)) =
                                    module_type
                                {
                                    Some(ClientReferenceType::EcmascriptClientReference(*module))
                                } else if let VisitState::InClientReference(ty) = parent_state {
                                    Some(ty)
                                } else {
                                    None
                                };

                            Ok(match module_type {
                                Some(DynamicImportEntriesMapType::DynamicEntry(dynamic_entry)) => {
                                    result.push((*dynamic_entry, parent_client_reference));

                                    state_map.insert(module, parent_state);
                                    GraphTraversalAction::Skip
                                }
                                Some(DynamicImportEntriesMapType::ClientReference(
                                    client_reference,
                                )) => {
                                    state_map.insert(
                                        module,
                                        VisitState::InClientReference(
                                            ClientReferenceType::EcmascriptClientReference(
                                                *client_reference,
                                            ),
                                        ),
                                    );
                                    GraphTraversalAction::Continue
                                }
                                None => {
                                    state_map.insert(module, parent_state);
                                    GraphTraversalAction::Continue
                                }
                            })
                        },
                        |_, _, _| Ok(()),
                        false,
                    )?;
                    Ok(Vc::cell(result))
                }
                .instrument(span)
            )
        }
        #[cfg(feature = "sync")]
        {
            let _span_guard = span.entered();
            let data = &*turbo_tasks::read!(self.data)?;
            let graph = turbo_tasks::read!(self.graph)?;

            #[derive(Clone, PartialEq, Eq)]
            enum VisitState {
                Entry,
                InClientReference(ClientReferenceType),
            }

            let entries = if !self.is_single_page {
                if !graph.graphs.first().unwrap().has_entry_module(entry) {
                    // the graph doesn't contain the entry, e.g. for the additional module graph
                    return Ok(Vc::cell(vec![]));
                }
                Either::Left(std::iter::once(entry))
            } else {
                Either::Right(graph.graphs.first().unwrap().chunk_group_modules())
            };

            let mut result = vec![];

            // module -> the client reference entry (if any)
            let mut state_map = FxHashMap::default();
            graph.traverse_edges_dfs(
                entries,
                &mut (),
                |parent_info, node, _| {
                    let module = node;
                    let Some((parent_node, _)) = parent_info else {
                        state_map.insert(module, VisitState::Entry);
                        return Ok(GraphTraversalAction::Continue);
                    };
                    let parent_module = parent_node;

                    let module_type = data.get(&module);
                    let parent_state = state_map.get(&parent_module).unwrap().clone();
                    let parent_client_reference =
                        if let Some(DynamicImportEntriesMapType::ClientReference(module)) =
                            module_type
                        {
                            Some(ClientReferenceType::EcmascriptClientReference(*module))
                        } else if let VisitState::InClientReference(ty) = parent_state {
                            Some(ty)
                        } else {
                            None
                        };

                    Ok(match module_type {
                        Some(DynamicImportEntriesMapType::DynamicEntry(dynamic_entry)) => {
                            result.push((*dynamic_entry, parent_client_reference));

                            state_map.insert(module, parent_state);
                            GraphTraversalAction::Skip
                        }
                        Some(DynamicImportEntriesMapType::ClientReference(client_reference)) => {
                            state_map.insert(
                                module,
                                VisitState::InClientReference(
                                    ClientReferenceType::EcmascriptClientReference(
                                        *client_reference,
                                    ),
                                ),
                            );
                            GraphTraversalAction::Continue
                        }
                        None => {
                            state_map.insert(module, parent_state);
                            GraphTraversalAction::Continue
                        }
                    })
                },
                |_, _, _| Ok(()),
                false,
            )?;
            Ok(Vc::cell(result))
        }
    }
}

#[turbo_tasks::value]
pub struct ServerActionsGraph {
    graph: ResolvedVc<ModuleGraphLayer>,
    is_single_page: bool,

    /// (Layer, RSC or Browser module) -> list of actions
    data: ResolvedVc<AllModuleActions>,
}

#[turbo_tasks::value]
pub struct ServerActionsGraphs(Vec<ResolvedVc<ServerActionsGraph>>);

#[turbo_tasks::value_impl]
impl ServerActionsGraphs {
    #[turbo_tasks::function(operation, root)]
    async fn new_operation(
        graphs: ResolvedVc<ModuleGraph>,
        is_single_page: bool,
    ) -> Result<Vc<Self>> {
        let graphs_ref = &turbo_tasks::read!(graphs.iter_graphs())?;
        #[cfg(not(feature = "sync"))]
        let server_actions = turbo_tasks::read!(
            async {
                turbo_tasks::read!(
                    graphs_ref
                        .iter()
                        .map(|&graph| {
                            ServerActionsGraph::new_with_entries(graph, is_single_page)
                                .to_resolved()
                        })
                        .try_join()
                )
            }
            .instrument(tracing::info_span!("generating server actions graphs"))
        )?;
        #[cfg(feature = "sync")]
        let server_actions = {
            let _span_guard = tracing::info_span!("generating server actions graphs").entered();
            let mut server_actions = Vec::new();
            for &graph in graphs_ref.iter() {
                server_actions.push(turbo_tasks::read!(
                    ServerActionsGraph::new_with_entries(graph, is_single_page).to_resolved()
                )?);
            }
            server_actions
        };
        Ok(Self(server_actions).cell())
    }

    #[turbo_tasks::function(root)]
    pub async fn new(graphs: ResolvedVc<ModuleGraph>, is_single_page: bool) -> Result<Vc<Self>> {
        // TODO get rid of this function once everything inside of
        // `get_global_information_for_endpoint_inner` calls `take_collectibles()` when needed
        let result_op = Self::new_operation(graphs, is_single_page);
        let result_vc = if !is_single_page {
            let result_vc = turbo_tasks::read!(result_op.resolve().strongly_consistent())?;
            result_op.drop_collectibles::<Box<dyn Issue>>();
            *result_vc
        } else {
            result_op.connect()
        };
        Ok(result_vc)
    }

    /// Returns the server actions for the given page.
    #[turbo_tasks::function]
    pub async fn get_server_actions_for_endpoint(
        &self,
        entry: Vc<Box<dyn Module>>,
        rsc_asset_context: Vc<Box<dyn AssetContext>>,
    ) -> Result<Vc<AllActions>> {
        let span = tracing::info_span!("collect all server actions for endpoint");
        #[cfg(not(feature = "sync"))]
        {
            turbo_tasks::read!(
                async move {
                    if let [graph] = &self.0[..] {
                        // Just a single graph, no need to merge results
                        Ok(graph.get_server_actions_for_endpoint(entry, rsc_asset_context))
                    } else {
                        let result = turbo_tasks::read!(
                            self.0
                                .iter()
                                .map(|graph| async move {
                                    turbo_tasks::read!(
                                        graph
                                            .get_server_actions_for_endpoint(
                                                entry,
                                                rsc_asset_context
                                            )
                                            .owned()
                                    )
                                })
                                .try_flat_join()
                        )?;

                        Ok(Vc::cell(result))
                    }
                }
                .instrument(span)
            )
        }
        #[cfg(feature = "sync")]
        {
            let _span_guard = span.entered();
            if let [graph] = &self.0[..] {
                // Just a single graph, no need to merge results
                Ok(graph.get_server_actions_for_endpoint(entry, rsc_asset_context))
            } else {
                let mut result = Vec::new();
                for graph in self.0.iter() {
                    result.extend(turbo_tasks::read!(
                        graph
                            .get_server_actions_for_endpoint(entry, rsc_asset_context)
                            .owned()
                    )?);
                }

                Ok(Vc::cell(result))
            }
        }
    }
}

#[turbo_tasks::value_impl]
impl ServerActionsGraph {
    #[turbo_tasks::function]
    pub async fn new_with_entries(
        graph: OperationVc<ModuleGraphLayer>,
        is_single_page: bool,
    ) -> Result<Vc<Self>> {
        let mapped = map_server_actions(graph);

        Ok(ServerActionsGraph {
            is_single_page,
            graph: turbo_tasks::read!(graph.connect().to_resolved())?,
            data: turbo_tasks::read!(mapped.to_resolved())?,
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
        #[cfg(not(feature = "sync"))]
        {
            turbo_tasks::read!(
                async move {
                    let data = &*turbo_tasks::read!(self.data)?;
                    let data = if self.is_single_page {
                        // The graph contains the page (= `entry`) only, no need to filter.
                        Cow::Borrowed(data)
                    } else {
                        // The graph contains the whole app, traverse and collect all reachable
                        // imports.
                        let graph = turbo_tasks::read!(self.graph)?;

                        if !graph.graphs.first().unwrap().has_entry_module(entry) {
                            // the graph doesn't contain the entry, e.g. for the additional module
                            // graph
                            return Ok(Vc::cell(Default::default()));
                        }

                        let mut result = FxIndexMap::default();
                        graph.traverse_nodes_dfs(
                            vec![entry],
                            &mut result,
                            |node, result| {
                                if let Some(node_data) = data.get(&node) {
                                    result.insert(node, *node_data);
                                }
                                Ok(GraphTraversalAction::Continue)
                            },
                            |_, _| Ok(()),
                        )?;
                        Cow::Owned(result)
                    };

                    let actions = turbo_tasks::read!(
                        data.iter()
                            .map(|(module, (layer, actions))| async move {
                                let actions = turbo_tasks::read!(actions)?;
                                turbo_tasks::read!(
                                    actions
                                        .actions
                                        .iter()
                                        .map(async |(hash, entry)| {
                                            Ok((
                                                hash.to_string(),
                                                (
                                                    *layer,
                                                    ActionMeta {
                                                        name: entry.name.clone(),
                                                        source_path: actions.entry_path.clone(),
                                                    },
                                                    if *layer == ActionLayer::Rsc {
                                                        *module
                                                    } else {
                                                        turbo_tasks::read!(to_rsc_context(
                                                            **module,
                                                            &actions.entry_path,
                                                            &actions.entry_query,
                                                            rsc_asset_context,
                                                        ))?
                                                    },
                                                ),
                                            ))
                                        })
                                        .try_join()
                                )
                            })
                            .try_flat_join()
                    )?;
                    Ok(Vc::cell(actions))
                }
                .instrument(span)
            )
        }
        #[cfg(feature = "sync")]
        {
            let _span_guard = span.entered();
            let data = &*turbo_tasks::read!(self.data)?;
            let data = if self.is_single_page {
                // The graph contains the page (= `entry`) only, no need to filter.
                Cow::Borrowed(data)
            } else {
                // The graph contains the whole app, traverse and collect all reachable imports.
                let graph = turbo_tasks::read!(self.graph)?;

                if !graph.graphs.first().unwrap().has_entry_module(entry) {
                    // the graph doesn't contain the entry, e.g. for the additional module graph
                    return Ok(Vc::cell(Default::default()));
                }

                let mut result = FxIndexMap::default();
                graph.traverse_nodes_dfs(
                    vec![entry],
                    &mut result,
                    |node, result| {
                        if let Some(node_data) = data.get(&node) {
                            result.insert(node, *node_data);
                        }
                        Ok(GraphTraversalAction::Continue)
                    },
                    |_, _| Ok(()),
                )?;
                Cow::Owned(result)
            };

            let mut result_actions = Vec::new();
            for (module, (layer, actions)) in data.iter() {
                let actions = turbo_tasks::read!(actions)?;
                for (hash, entry) in actions.actions.iter() {
                    result_actions.push({
                        Ok((
                            hash.to_string(),
                            (
                                *layer,
                                ActionMeta {
                                    name: entry.name.clone(),
                                    source_path: actions.entry_path.clone(),
                                },
                                if *layer == ActionLayer::Rsc {
                                    *module
                                } else {
                                    turbo_tasks::read!(to_rsc_context(
                                        **module,
                                        &actions.entry_path,
                                        &actions.entry_query,
                                        rsc_asset_context,
                                    ))?
                                },
                            ),
                        ))
                    }?);
                }
            }
            Ok(Vc::cell(result_actions))
        }
    }
}

#[turbo_tasks::value]
pub struct ClientReferencesGraph {
    is_single_page: bool,
    graph: ResolvedVc<ModuleGraphLayer>,

    /// List of client references (modules that entries into the client graph)
    data: ResolvedVc<ClientReferenceData>,
}

#[turbo_tasks::value]
pub struct ClientReferencesGraphs(Vec<ResolvedVc<ClientReferencesGraph>>);

#[turbo_tasks::value_impl]
impl ClientReferencesGraphs {
    #[turbo_tasks::function(operation, root)]
    async fn new_operation(
        graphs: ResolvedVc<ModuleGraph>,
        is_single_page: bool,
    ) -> Result<Vc<Self>> {
        let graphs_ref = turbo_tasks::read!(graphs.iter_graphs())?;
        #[cfg(not(feature = "sync"))]
        let client_references = turbo_tasks::read!(
            async {
                turbo_tasks::read!(
                    graphs_ref
                        .iter()
                        .map(|graph| {
                            ClientReferencesGraph::new_with_entries(graph.connect(), is_single_page)
                                .to_resolved()
                        })
                        .try_join()
                )
            }
            .instrument(tracing::info_span!("generating client references graphs"))
        )?;
        #[cfg(feature = "sync")]
        let client_references = {
            let _span_guard = tracing::info_span!("generating client references graphs").entered();
            let mut client_references = Vec::new();
            for graph in graphs_ref.iter() {
                client_references.push(turbo_tasks::read!(
                    ClientReferencesGraph::new_with_entries(graph.connect(), is_single_page)
                        .to_resolved()
                )?);
            }
            client_references
        };
        Ok(Self(client_references).cell())
    }

    #[turbo_tasks::function(root)]
    pub async fn new(graphs: ResolvedVc<ModuleGraph>, is_single_page: bool) -> Result<Vc<Self>> {
        // TODO get rid of this function once everything inside of
        // `get_global_information_for_endpoint_inner` calls `take_collectibles()` when needed
        let result_op = Self::new_operation(graphs, is_single_page);
        let result_vc = if !is_single_page {
            let result_vc = turbo_tasks::read!(result_op.resolve().strongly_consistent())?;
            result_op.drop_collectibles::<Box<dyn Issue>>();
            *result_vc
        } else {
            result_op.connect()
        };
        Ok(result_vc)
    }

    /// Returns the client references for the given page.
    #[turbo_tasks::function]
    pub async fn get_client_references_for_endpoint(
        &self,
        entry: Vc<Box<dyn Module>>,
        has_layout_segments: bool,
        include_traced: bool,
        include_binding_usage: bool,
    ) -> Result<Vc<ClientReferenceGraphResult>> {
        let span = tracing::info_span!("collect all client references for endpoint");
        #[cfg(not(feature = "sync"))]
        {
            turbo_tasks::read!(
                async move {
                    let result = if let [graph] = &self.0[..] {
                        // Just a single graph, no need to merge results  This also naturally
                        // aggregates server components and server utilities
                        // in the correct order
                        graph.get_client_references_for_endpoint(entry)
                    } else {
                        let results = self
                            .0
                            .iter()
                            .map(|graph| graph.get_client_references_for_endpoint(entry))
                            .try_join();
                        // Do this separately for now, because the aggregation of multiple graph
                        // traversals messes up the order of the
                        // server_component_entries.
                        let server_entries = async {
                            if has_layout_segments {
                                let server_entries = turbo_tasks::read!(find_server_entries(
                                    entry,
                                    include_traced,
                                    include_binding_usage
                                ))?;
                                Ok(Some(server_entries))
                            } else {
                                Ok(None)
                            }
                        };
                        // Wait for both in parallel since `find_server_entries` tends to be slower
                        // than the graph traversals
                        let (results, server_entries) = join!(results, server_entries);

                        let mut result = ClientReferenceGraphResult {
                            client_references: results?
                                .iter()
                                .flat_map(|r| r.client_references.iter().copied())
                                .collect(),
                            ..Default::default()
                        };
                        if let Some(ServerEntries {
                            server_utils,
                            server_component_entries,
                        }) = server_entries?.as_deref()
                        {
                            result.server_utils = server_utils.clone();
                            result.server_component_entries = server_component_entries.clone();
                        }
                        result.cell()
                    };
                    Ok(result)
                }
                .instrument(span)
            )
        }
        #[cfg(feature = "sync")]
        {
            let _span_guard = span.entered();
            let result = if let [graph] = &self.0[..] {
                // Just a single graph, no need to merge results  This also naturally aggregates
                // server components and server utilities in the correct order
                graph.get_client_references_for_endpoint(entry)
            } else {
                let mut results = Vec::new();
                for graph in self.0.iter() {
                    results.push(turbo_tasks::read!(
                        graph.get_client_references_for_endpoint(entry)
                    )?);
                }
                // Do this separately for now, because the aggregation of multiple graph traversals
                // messes up the order of the server_component_entries.
                let server_entries = if has_layout_segments {
                    Some(turbo_tasks::read!(find_server_entries(
                        entry,
                        include_traced,
                        include_binding_usage
                    ))?)
                } else {
                    None
                };

                let mut result = ClientReferenceGraphResult {
                    client_references: results
                        .iter()
                        .flat_map(|r| r.client_references.iter().copied())
                        .collect(),
                    ..Default::default()
                };
                if let Some(ServerEntries {
                    server_utils,
                    server_component_entries,
                }) = server_entries.as_deref()
                {
                    result.server_utils = server_utils.clone();
                    result.server_component_entries = server_component_entries.clone();
                }
                result.cell()
            };
            Ok(result)
        }
    }
}

#[turbo_tasks::value_impl]
impl ClientReferencesGraph {
    #[turbo_tasks::function]
    pub async fn new_with_entries(
        graph: ResolvedVc<ModuleGraphLayer>,
        is_single_page: bool,
    ) -> Result<Vc<Self>> {
        let mapped = map_client_references(*graph);

        Ok(Self {
            is_single_page,
            graph,
            data: turbo_tasks::read!(mapped.to_resolved())?,
        }
        .cell())
    }

    #[turbo_tasks::function]
    async fn get_client_references_for_endpoint(
        &self,
        entry: ResolvedVc<Box<dyn Module>>,
    ) -> Result<Vc<ClientReferenceGraphResult>> {
        let span = tracing::info_span!("collect client references for endpoint");
        #[cfg(not(feature = "sync"))]
        {
            turbo_tasks::read!(
                async move {
                    let data = &*turbo_tasks::read!(self.data)?;
                    let graph = turbo_tasks::read!(self.graph)?;

                    let entries = if !self.is_single_page {
                        if !graph.graphs.first().unwrap().has_entry_module(entry) {
                            // the graph doesn't contain the entry, e.g. for the additional module
                            // graph
                            return Ok(ClientReferenceGraphResult::default().cell());
                        }
                        Either::Left(std::iter::once(entry))
                    } else {
                        Either::Right(graph.graphs.first().unwrap().chunk_group_modules())
                    };

                    // Because we care about 'evaluation order' we need to collect client references
                    // in the post_order callbacks which is the same as
                    // evaluation order
                    let mut client_references = Vec::new();
                    let mut server_utils = FxIndexSet::default();

                    let mut server_components = FxIndexSet::default();

                    // Perform a DFS traversal to find all server components included by this page.
                    graph.traverse_nodes_dfs(
                        entries,
                        &mut (),
                        |node, _| {
                            let module_type = data.get(&node);
                            Ok(match module_type {
                                Some(
                                    ClientManifestEntryType::EcmascriptClientReference { .. }
                                    | ClientManifestEntryType::CssClientReference { .. }
                                    | ClientManifestEntryType::ServerComponent { .. },
                                ) => GraphTraversalAction::Skip,
                                None => GraphTraversalAction::Continue,
                            })
                        },
                        |node, _| {
                            if let Some(server_util_module) =
                                ResolvedVc::try_downcast_type::<NextServerUtilityModule>(node)
                            {
                                // Server utility used by the template, not a server component
                                server_utils.insert(server_util_module);
                                return Ok(());
                            }

                            let module_type = data.get(&node);

                            let ty = match module_type {
                                Some(ClientManifestEntryType::EcmascriptClientReference {
                                    module,
                                    ssr_module: _,
                                }) => ClientReferenceType::EcmascriptClientReference(*module),
                                Some(ClientManifestEntryType::CssClientReference(module)) => {
                                    ClientReferenceType::CssClientReference(*module)
                                }
                                Some(ClientManifestEntryType::ServerComponent(sc)) => {
                                    server_components.insert(*sc);
                                    return Ok(());
                                }
                                None => {
                                    return Ok(());
                                }
                            };

                            // Client reference used by the template, not a server component
                            client_references.push(ClientReference {
                                server_component: None,
                                ty,
                            });

                            Ok(())
                        },
                    )?;

                    // Traverse each server component separately. Because not all server components
                    // are necessarily rendered at the same time (not-found, or
                    // parallel routes), we need to determine the order of
                    // client references individually for each server component.
                    for sc in server_components.iter().copied() {
                        graph.traverse_nodes_dfs(
                            std::iter::once(ResolvedVc::upcast(sc)),
                            &mut (),
                            |node, _| {
                                let module = node;
                                let module_type = data.get(&module);

                                Ok(match module_type {
                                    Some(
                                        ClientManifestEntryType::EcmascriptClientReference {
                                            ..
                                        }
                                        | ClientManifestEntryType::CssClientReference { .. },
                                    ) => GraphTraversalAction::Skip,
                                    _ => GraphTraversalAction::Continue,
                                })
                            },
                            |node, _| {
                                let module = node;
                                if let Some(server_util_module) =
                                    ResolvedVc::try_downcast_type::<NextServerUtilityModule>(module)
                                {
                                    server_utils.insert(server_util_module);
                                }

                                let Some(module_type) = data.get(&module) else {
                                    return Ok(());
                                };

                                let ty = match module_type {
                                    ClientManifestEntryType::EcmascriptClientReference {
                                        module,
                                        ssr_module: _,
                                    } => ClientReferenceType::EcmascriptClientReference(*module),
                                    ClientManifestEntryType::CssClientReference(module) => {
                                        ClientReferenceType::CssClientReference(*module)
                                    }
                                    ClientManifestEntryType::ServerComponent(_) => {
                                        return Ok(());
                                    }
                                };

                                client_references.push(ClientReference {
                                    server_component: Some(sc),
                                    ty,
                                });

                                Ok(())
                            },
                        )?;
                    }

                    Ok(ClientReferenceGraphResult {
                        client_references: client_references.into_iter().collect(),
                        // The order of server_utils does not matter
                        server_utils: server_utils.into_iter().collect(),
                        server_component_entries: server_components.into_iter().collect(),
                    }
                    .cell())
                }
                .instrument(span)
            )
        }
        #[cfg(feature = "sync")]
        {
            let _span_guard = span.entered();
            let data = &*turbo_tasks::read!(self.data)?;
            let graph = turbo_tasks::read!(self.graph)?;

            let entries = if !self.is_single_page {
                if !graph.graphs.first().unwrap().has_entry_module(entry) {
                    // the graph doesn't contain the entry, e.g. for the additional module graph
                    return Ok(ClientReferenceGraphResult::default().cell());
                }
                Either::Left(std::iter::once(entry))
            } else {
                Either::Right(graph.graphs.first().unwrap().chunk_group_modules())
            };

            // Because we care about 'evaluation order' we need to collect client references in the
            // post_order callbacks which is the same as evaluation order
            let mut client_references = Vec::new();
            let mut server_utils = FxIndexSet::default();

            let mut server_components = FxIndexSet::default();

            // Perform a DFS traversal to find all server components included by this page.
            graph.traverse_nodes_dfs(
                entries,
                &mut (),
                |node, _| {
                    let module_type = data.get(&node);
                    Ok(match module_type {
                        Some(
                            ClientManifestEntryType::EcmascriptClientReference { .. }
                            | ClientManifestEntryType::CssClientReference { .. }
                            | ClientManifestEntryType::ServerComponent { .. },
                        ) => GraphTraversalAction::Skip,
                        None => GraphTraversalAction::Continue,
                    })
                },
                |node, _| {
                    if let Some(server_util_module) =
                        ResolvedVc::try_downcast_type::<NextServerUtilityModule>(node)
                    {
                        // Server utility used by the template, not a server component
                        server_utils.insert(server_util_module);
                        return Ok(());
                    }

                    let module_type = data.get(&node);

                    let ty = match module_type {
                        Some(ClientManifestEntryType::EcmascriptClientReference {
                            module,
                            ssr_module: _,
                        }) => ClientReferenceType::EcmascriptClientReference(*module),
                        Some(ClientManifestEntryType::CssClientReference(module)) => {
                            ClientReferenceType::CssClientReference(*module)
                        }
                        Some(ClientManifestEntryType::ServerComponent(sc)) => {
                            server_components.insert(*sc);
                            return Ok(());
                        }
                        None => {
                            return Ok(());
                        }
                    };

                    // Client reference used by the template, not a server component
                    client_references.push(ClientReference {
                        server_component: None,
                        ty,
                    });

                    Ok(())
                },
            )?;

            // Traverse each server component separately. Because not all server components are
            // necessarily rendered at the same time (not-found, or parallel routes), we need to
            // determine the order of client references individually for each server component.
            for sc in server_components.iter().copied() {
                graph.traverse_nodes_dfs(
                    std::iter::once(ResolvedVc::upcast(sc)),
                    &mut (),
                    |node, _| {
                        let module = node;
                        let module_type = data.get(&module);

                        Ok(match module_type {
                            Some(
                                ClientManifestEntryType::EcmascriptClientReference { .. }
                                | ClientManifestEntryType::CssClientReference { .. },
                            ) => GraphTraversalAction::Skip,
                            _ => GraphTraversalAction::Continue,
                        })
                    },
                    |node, _| {
                        let module = node;
                        if let Some(server_util_module) =
                            ResolvedVc::try_downcast_type::<NextServerUtilityModule>(module)
                        {
                            server_utils.insert(server_util_module);
                        }

                        let Some(module_type) = data.get(&module) else {
                            return Ok(());
                        };

                        let ty = match module_type {
                            ClientManifestEntryType::EcmascriptClientReference {
                                module,
                                ssr_module: _,
                            } => ClientReferenceType::EcmascriptClientReference(*module),
                            ClientManifestEntryType::CssClientReference(module) => {
                                ClientReferenceType::CssClientReference(*module)
                            }
                            ClientManifestEntryType::ServerComponent(_) => {
                                return Ok(());
                            }
                        };

                        client_references.push(ClientReference {
                            server_component: Some(sc),
                            ty,
                        });

                        Ok(())
                    },
                )?;
            }

            Ok(ClientReferenceGraphResult {
                client_references: client_references.into_iter().collect(),
                // The order of server_utils does not matter
                server_utils: server_utils.into_iter().collect(),
                server_component_entries: server_components.into_iter().collect(),
            }
            .cell())
        }
    }
}

#[turbo_tasks::value(shared)]
struct CssGlobalImportIssue {
    pub parent_module: ResolvedVc<Box<dyn Module>>,
    pub module: ResolvedVc<Box<dyn Module>>,
}

impl CssGlobalImportIssue {
    fn new(
        parent_module: ResolvedVc<Box<dyn Module>>,
        module: ResolvedVc<Box<dyn Module>>,
    ) -> Self {
        Self {
            parent_module,
            module,
        }
    }
}

#[cfg(not(feature = "sync"))]
#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for CssGlobalImportIssue {
    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(rcstr!(
            "Global CSS cannot be imported from files other than your Custom <App>."
        )))
    }

    fn documentation_link(&self) -> RcStr {
        rcstr!("https://nextjs.org/docs/messages/css-global")
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        let parent_ident = turbo_tasks::read!(self.parent_module.ident())?;
        let module_ident = turbo_tasks::read!(self.module.ident())?;
        let relative_import_location = parent_ident.path.parent();

        let import_path = match relative_import_location.get_relative_path_to(&module_ident.path) {
            Some(path) => path,
            None => module_ident.path.path.clone(),
        };
        let cleaned_import_path =
            if import_path.ends_with(".scss.css") || import_path.ends_with(".sass.css") {
                RcStr::from(import_path.trim_end_matches(".css"))
            } else {
                import_path
            };

        Ok(Some(StyledString::Stack(vec![
            StyledString::Text(rcstr!(
                "Due to the Global nature of stylesheets, and to avoid conflicts, Please move all \
                 first-party global CSS imports to pages/_app.js. Or convert the import to \
                 Component-Level CSS (CSS Modules)."
            )),
            StyledString::Line(vec![
                StyledString::Text(rcstr!("Location: ")),
                StyledString::Code(parent_ident.path.path.clone()),
            ]),
            StyledString::Line(vec![
                StyledString::Text(rcstr!("Import path: ")),
                StyledString::Code(cleaned_import_path),
            ]),
        ])))
    }

    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(turbo_tasks::read!(self.parent_module.ident())?.path.clone())
    }

    fn stage(&self) -> IssueStage {
        IssueStage::ProcessModule
    }

    // TODO(PACK-4879): compute the source information by following the module references
}

#[cfg(feature = "sync")]
#[turbo_tasks::value_impl]
impl Issue for CssGlobalImportIssue {
    fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(rcstr!(
            "Global CSS cannot be imported from files other than your Custom <App>."
        )))
    }

    fn documentation_link(&self) -> RcStr {
        rcstr!("https://nextjs.org/docs/messages/css-global")
    }

    fn description(&self) -> Result<Option<StyledString>> {
        let parent_ident = turbo_tasks::read!(self.parent_module.ident())?;
        let module_ident = turbo_tasks::read!(self.module.ident())?;
        let relative_import_location = parent_ident.path.parent();

        let import_path = match relative_import_location.get_relative_path_to(&module_ident.path) {
            Some(path) => path,
            None => module_ident.path.path.clone(),
        };
        let cleaned_import_path =
            if import_path.ends_with(".scss.css") || import_path.ends_with(".sass.css") {
                RcStr::from(import_path.trim_end_matches(".css"))
            } else {
                import_path
            };

        Ok(Some(StyledString::Stack(vec![
            StyledString::Text(rcstr!(
                "Due to the Global nature of stylesheets, and to avoid conflicts, Please move all \
                 first-party global CSS imports to pages/_app.js. Or convert the import to \
                 Component-Level CSS (CSS Modules)."
            )),
            StyledString::Line(vec![
                StyledString::Text(rcstr!("Location: ")),
                StyledString::Code(parent_ident.path.path.clone()),
            ]),
            StyledString::Line(vec![
                StyledString::Text(rcstr!("Import path: ")),
                StyledString::Code(cleaned_import_path),
            ]),
        ])))
    }

    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    fn file_path(&self) -> Result<FileSystemPath> {
        Ok(turbo_tasks::read!(self.parent_module.ident())?.path.clone())
    }

    fn stage(&self) -> IssueStage {
        IssueStage::ProcessModule
    }

    // TODO(PACK-4879): compute the source information by following the module references
}

#[cfg_attr(
    not(feature = "sync"),
    tracing::instrument(level = "info", name = "validate pages css imports", skip_all)
)]
#[turbo_tasks::function]
async fn validate_pages_css_imports_individual(
    graph: ResolvedVc<ModuleGraphLayer>,
    is_single_page: bool,
    entry: Vc<Box<dyn Module>>,
    app_module: ResolvedVc<Box<dyn Module>>,
) -> Result<()> {
    let graph = turbo_tasks::read!(graph)?;
    let entry = turbo_tasks::read!(entry.to_resolved())?;

    let entries = if !is_single_page {
        if !graph.graphs.first().unwrap().has_entry_module(entry) {
            // the graph doesn't contain the entry, e.g. for the additional module graph
            return Ok(());
        }
        Either::Left(std::iter::once(entry))
    } else {
        Either::Right(graph.graphs.first().unwrap().chunk_group_modules())
    };

    let mut candidates = vec![];

    graph.traverse_edges_dfs(
        entries,
        &mut (),
        |parent_info, node, _| {
            let module = node;

            // If we're at a root node, there is nothing importing this module and we can skip
            // any further validations.
            let Some((parent_node, _)) = parent_info else {
                return Ok(GraphTraversalAction::Continue);
            };
            let parent_module = parent_node;

            // Importing CSS from _app.js is always allowed.
            if parent_module == app_module {
                return Ok(GraphTraversalAction::Continue);
            }

            // If the module being imported isn't a global css module, there is nothing to
            // validate.
            let module_is_global_css = ResolvedVc::try_downcast_type::<CssModule>(module).is_some();

            if !module_is_global_css {
                return Ok(GraphTraversalAction::Continue);
            }

            let parent_is_css_module =
                ResolvedVc::try_downcast_type::<EcmascriptCssModule>(parent_module).is_some()
                    || ResolvedVc::try_downcast_type::<CssModule>(parent_module).is_some();

            // We also always allow .module css/scss/sass files to import global css files as
            // well.
            if parent_is_css_module {
                return Ok(GraphTraversalAction::Continue);
            }

            // If all of the above invariants have been checked, we look to see if the parent
            // module is the same as the app module. If it isn't we know it
            // isn't a valid place to import global css.
            if parent_module != app_module {
                candidates.push(CssGlobalImportIssue::new(parent_module, module))
            }

            Ok(GraphTraversalAction::Continue)
        },
        |_, _, _| Ok(()),
        false,
    )?;

    #[cfg(not(feature = "sync"))]
    turbo_tasks::read!(
        candidates
            .into_iter()
            .map(async |issue| {
                let ident = turbo_tasks::read!(issue.module.ident())?;
                let path = &ident.path;
                // We allow imports of global CSS files which are inside of `node_modules`.
                // We also allow data URL CSS imports (e.g. `data:text/css,...`) since they
                // are mostly tooling-generated and co-located with the importing components
                Ok(
                    if !path.is_in_node_modules() && !path.file_name().starts_with("data:") {
                        Some(issue)
                    } else {
                        None
                    },
                )
            })
            .try_flat_join()
    )?
    .into_iter()
    .for_each(|issue| {
        issue.resolved_cell().emit();
    });
    #[cfg(feature = "sync")]
    {
        let mut filtered = Vec::new();
        for issue in candidates.into_iter() {
            filtered.extend({
                let ident = turbo_tasks::read!(issue.module.ident())?;
                let path = &ident.path;
                // We allow imports of global CSS files which are inside of `node_modules`.
                // We also allow data URL CSS imports (e.g. `data:text/css,...`) since they
                // are mostly tooling-generated and co-located with the importing components
                Ok(
                    if !path.is_in_node_modules() && !path.file_name().starts_with("data:") {
                        Some(issue)
                    } else {
                        None
                    },
                )
            }?);
        }
        filtered.into_iter().for_each(|issue| {
            issue.resolved_cell().emit();
        });
    }

    Ok(())
}

/// Validates that the global CSS/SCSS/SASS imports are only valid imports with the following
/// rules:
/// * The import is made from a `node_modules` package
/// * The imported CSS is a `data:` URL module
/// * The import is made from a `.module.css` file
/// * The import is made from the `pages/_app.js`, or equivalent file
#[turbo_tasks::function]
pub async fn validate_pages_css_imports(
    graph: Vc<ModuleGraph>,
    is_single_page: bool,
    entry: Vc<Box<dyn Module>>,
    app_module: Vc<Box<dyn Module>>,
) -> Result<()> {
    let graphs = turbo_tasks::read!(graph.iter_graphs())?;
    #[cfg(not(feature = "sync"))]
    turbo_tasks::read!(
        graphs
            .iter()
            .map(|graph| {
                validate_pages_css_imports_individual(
                    graph.connect(),
                    is_single_page,
                    entry,
                    app_module,
                )
                .as_side_effect()
            })
            .try_join()
    )?;
    #[cfg(feature = "sync")]
    for graph in graphs.iter() {
        turbo_tasks::read!(
            validate_pages_css_imports_individual(
                graph.connect(),
                is_single_page,
                entry,
                app_module,
            )
            .as_side_effect()
        )?;
    }

    Ok(())
}
