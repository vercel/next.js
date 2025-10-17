use std::borrow::Cow;

use anyhow::{Ok, Result};
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
    CollectiblesSource, FxIndexMap, FxIndexSet, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc,
};
use turbo_tasks_fs::FileSystemPath;
use turbopack::css::{CssModuleAsset, ModuleCssAsset};
use turbopack_core::{
    context::AssetContext,
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, OptionStyledString, StyledString},
    module::Module,
    module_graph::{GraphTraversalAction, ModuleGraph, SingleModuleGraph},
};

use crate::{
    client_references::{ClientManifestEntryType, ClientReferenceData, map_client_references},
    dynamic_imports::{DynamicImportEntries, DynamicImportEntriesMapType, map_next_dynamic},
    server_actions::{AllActions, AllModuleActions, map_server_actions, to_rsc_context},
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

            let entries = if !self.is_single_page {
                if !graph.has_entry_module(entry) {
                    // the graph doesn't contain the entry, e.g. for the additional module graph
                    return Ok(Vc::cell(vec![]));
                }
                Either::Left(std::iter::once(entry))
            } else {
                Either::Right(graph.entry_modules())
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

                if !graph.has_entry_module(entry) {
                    // the graph doesn't contain the entry, e.g. for the additional module graph
                    return Ok(Vc::cell(Default::default()));
                }

                let mut result = FxIndexMap::default();
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
                    let actions = actions.await?;
                    actions
                        .actions
                        .iter()
                        .map(async |(hash, name)| {
                            Ok((
                                hash.to_string(),
                                (
                                    *layer,
                                    name.to_string(),
                                    if *layer == ActionLayer::Rsc {
                                        *module
                                    } else {
                                        to_rsc_context(
                                            **module,
                                            &actions.entry_path,
                                            &actions.entry_query,
                                            rsc_asset_context,
                                        )
                                        .await?
                                    },
                                ),
                            ))
                        })
                        .try_join()
                        .await
                })
                .try_flat_join()
                .await?;
            Ok(Vc::cell(actions))
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
    data: ResolvedVc<ClientReferenceData>,
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

        Ok(Self {
            is_single_page,
            graph,
            data: mapped.to_resolved().await?,
        }
        .cell())
    }

    #[turbo_tasks::function]
    async fn get_client_references_for_endpoint(
        &self,
        entry: ResolvedVc<Box<dyn Module>>,
    ) -> Result<Vc<ClientReferenceGraphResult>> {
        let span = tracing::info_span!("collect client references for endpoint");
        async move {
            let data = &*self.data.await?;
            let graph = &*self.graph.await?;

            let entries = if !self.is_single_page {
                if !graph.has_entry_module(entry) {
                    // the graph doesn't contain the entry, e.g. for the additional module graph
                    return Ok(ClientReferenceGraphResult::default().cell());
                }
                Either::Left(std::iter::once(entry))
            } else {
                Either::Right(graph.entry_modules())
            };

            // Because we care about 'evaluation order' we need to collect client references in the
            // post_order callbacks which is the same as evaluation order
            let mut client_references = Vec::new();
            let mut server_utils = FxIndexSet::default();

            let mut server_components = FxIndexSet::default();

            // Perform a DFS traversal to find all server components included by this page.
            graph.traverse_nodes_from_entries(
                entries,
                &mut (),
                |node, _| {
                    let module_type = data.get(&node.module);
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
                        ResolvedVc::try_downcast_type::<NextServerUtilityModule>(node.module)
                    {
                        // Server utility used by the template, not a server component
                        server_utils.insert(server_util_module);
                        return Ok(());
                    }

                    let module_type = data.get(&node.module);

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
                graph.traverse_nodes_from_entries(
                    std::iter::once(ResolvedVc::upcast(sc)),
                    &mut (),
                    |node, _| {
                        let module = node.module;
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
                        let module = node.module;
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
        .await
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

#[turbo_tasks::value_impl]
impl Issue for CssGlobalImportIssue {
    #[turbo_tasks::function]
    async fn title(&self) -> Vc<StyledString> {
        StyledString::Stack(vec![
            StyledString::Text(rcstr!("Failed to compile")),
            StyledString::Text(rcstr!(
                "Global CSS cannot be imported from files other than your Custom <App>. Due to \
                 the Global nature of stylesheets, and to avoid conflicts, Please move all \
                 first-party global CSS imports to pages/_app.js. Or convert the import to \
                 Component-Level CSS (CSS Modules)."
            )),
            StyledString::Text(rcstr!(
                "Read more: https://nextjs.org/docs/messages/css-global"
            )),
        ])
        .cell()
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<OptionStyledString>> {
        let parent_path = self.parent_module.ident().path().owned().await?;
        let module_path = self.module.ident().path().owned().await?;
        let relative_import_location = parent_path.parent();

        let import_path = match relative_import_location.get_relative_path_to(&module_path) {
            Some(path) => path,
            None => module_path.path.clone(),
        };
        let cleaned_import_path =
            if import_path.ends_with(".scss.css") || import_path.ends_with(".sass.css") {
                RcStr::from(import_path.trim_end_matches(".css"))
            } else {
                import_path
            };

        Ok(Vc::cell(Some(
            StyledString::Stack(vec![
                StyledString::Text(format!("Location: {}", parent_path.path).into()),
                StyledString::Text(format!("Import path: {cleaned_import_path}",).into()),
            ])
            .resolved_cell(),
        )))
    }

    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.parent_module.ident().path()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::ProcessModule.into()
    }

    // TODO(PACK-4879): compute the source information by following the module references
}

type FxModuleNameMap = FxIndexMap<ResolvedVc<Box<dyn Module>>, RcStr>;

#[turbo_tasks::value(transparent)]
struct ModuleNameMap(pub FxModuleNameMap);

#[tracing::instrument(level = "info", name = "validate pages css imports", skip_all)]
#[turbo_tasks::function]
async fn validate_pages_css_imports(
    graph: Vc<SingleModuleGraph>,
    is_single_page: bool,
    entry: Vc<Box<dyn Module>>,
    app_module: ResolvedVc<Box<dyn Module>>,
) -> Result<()> {
    let graph = &*graph.await?;
    let entry = entry.to_resolved().await?;

    let entries = if !is_single_page {
        if !graph.has_entry_module(entry) {
            // the graph doesn't contain the entry, e.g. for the additional module graph
            return Ok(());
        }
        Either::Left(std::iter::once(entry))
    } else {
        Either::Right(graph.entry_modules())
    };

    let mut candidates = vec![];

    graph.traverse_edges_from_entries(entries, |parent_info, node| {
        let module = node.module;

        // If we're at a root node, there is nothing importing this module and we can skip
        // any further validations.
        let Some((parent_node, _)) = parent_info else {
            return GraphTraversalAction::Continue;
        };
        let parent_module = parent_node.module;

        // Importing CSS from _app.js is always allowed.
        if parent_module == app_module {
            return GraphTraversalAction::Continue;
        }

        // If the module being imported isn't a global css module, there is nothing to validate.
        let module_is_global_css =
            ResolvedVc::try_downcast_type::<CssModuleAsset>(module).is_some();

        if !module_is_global_css {
            return GraphTraversalAction::Continue;
        }

        let parent_is_css_module = ResolvedVc::try_downcast_type::<ModuleCssAsset>(parent_module)
            .is_some()
            || ResolvedVc::try_downcast_type::<CssModuleAsset>(parent_module).is_some();

        // We also always allow .module css/scss/sass files to import global css files as well.
        if parent_is_css_module {
            return GraphTraversalAction::Continue;
        }

        // If all of the above invariants have been checked, we look to see if the parent module is
        // the same as the app module. If it isn't we know it isn't a valid place to import global
        // css.
        if parent_module != app_module {
            candidates.push(CssGlobalImportIssue::new(parent_module, module))
        }

        GraphTraversalAction::Continue
    })?;

    candidates
        .into_iter()
        .map(async |issue| {
            // We allow imports of global CSS files which are inside of `node_modules`.
            Ok(
                if !issue
                    .module
                    .ident()
                    .path()
                    .await?
                    .path
                    .contains("/node_modules/")
                {
                    Some(issue)
                } else {
                    None
                },
            )
        })
        .try_flat_join()
        .await?
        .into_iter()
        .for_each(|issue| {
            issue.resolved_cell().emit();
        });

    Ok(())
}

/// The consumers of this shouldn't need to care about the exact contents since it's abstracted away
/// by the accessor functions, but
/// - In dev, contains information about the modules of the current endpoint only
/// - In prod, there is a single `GlobalBuildInformation` for the whole app, containing all pages
#[turbo_tasks::value]
pub struct GlobalBuildInformation {
    next_dynamic: Vec<ResolvedVc<NextDynamicGraph>>,
    server_actions: Vec<ResolvedVc<ServerActionsGraph>>,
    client_references: Vec<ResolvedVc<ClientReferencesGraph>>,
    // Data for some more ad-hoc operations
    bare_graphs: ResolvedVc<ModuleGraph>,
    is_single_page: bool,
}

#[turbo_tasks::value_impl]
impl GlobalBuildInformation {
    #[turbo_tasks::function]
    pub async fn new(graphs: Vc<ModuleGraph>, is_single_page: bool) -> Result<Vc<Self>> {
        let graphs_ref = &graphs.await?.graphs;
        let next_dynamic = async {
            graphs_ref
                .iter()
                .map(|graph| {
                    NextDynamicGraph::new_with_entries(**graph, is_single_page).to_resolved()
                })
                .try_join()
                .await
        }
        .instrument(tracing::info_span!("generating next/dynamic graphs"));

        let server_actions = async {
            graphs_ref
                .iter()
                .map(|graph| {
                    ServerActionsGraph::new_with_entries(**graph, is_single_page).to_resolved()
                })
                .try_join()
                .await
        }
        .instrument(tracing::info_span!("generating server actions graphs"));

        let client_references = async {
            graphs_ref
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
            bare_graphs: graphs.to_resolved().await?,
            is_single_page,
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

                Ok(Vc::cell(result))
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
        include_traced: bool,
    ) -> Result<Vc<ClientReferenceGraphResult>> {
        let span = tracing::info_span!("collect all client references for endpoint");
        async move {
            let result = if let [graph] = &self.client_references[..] {
                // Just a single graph, no need to merge results  This also naturally aggregates
                // server components and server utilities in the correct order
                graph.get_client_references_for_endpoint(entry)
            } else {
                let results = self
                    .client_references
                    .iter()
                    .map(|graph| graph.get_client_references_for_endpoint(entry))
                    .try_join();
                // Do this separately for now, because the aggregation of multiple graph traversals
                // messes up the order of the server_component_entries.
                let server_entries = async {
                    if has_layout_segments {
                        let server_entries = find_server_entries(entry, include_traced).await?;
                        Ok(Some(server_entries))
                    } else {
                        Ok(None)
                    }
                };
                // Wait for both in parallel since `find_server_entries` tends to be slower than the
                // graph traversals
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
        .await
    }

    #[turbo_tasks::function]
    /// Validates that the global CSS/SCSS/SASS imports are only valid imports with the following
    /// rules:
    /// * The import is made from a `node_modules` package
    /// * The import is made from a `.module.css` file
    /// * The import is made from the `pages/_app.js`, or equivalent file.
    pub async fn validate_pages_css_imports(
        &self,
        entry: Vc<Box<dyn Module>>,
        app_module: Vc<Box<dyn Module>>,
    ) -> Result<()> {
        let graphs = &self.bare_graphs.await?.graphs;

        graphs
            .iter()
            .map(|graph| {
                validate_pages_css_imports(**graph, self.is_single_page, entry, app_module)
                    .as_side_effect()
            })
            .try_join()
            .await?;

        Ok(())
    }
}

#[turbo_tasks::function(operation)]
fn get_global_information_for_endpoint_inner_operation(
    module_graph: ResolvedVc<ModuleGraph>,
    is_single_page: bool,
) -> Vc<GlobalBuildInformation> {
    GlobalBuildInformation::new(*module_graph, is_single_page)
}

/// Generates a [GlobalBuildInformation] for the given project and endpoint containing information
/// that is either global (module ids, chunking) or computed globally as a performance optimization
/// (client references, etc).
#[turbo_tasks::function]
pub async fn get_global_information_for_endpoint(
    module_graph: ResolvedVc<ModuleGraph>,
    is_single_page: bool,
) -> Result<Vc<GlobalBuildInformation>> {
    // TODO get rid of this function once everything inside of
    // `get_global_information_for_endpoint_inner` calls `take_collectibles()` when needed
    let result_op =
        get_global_information_for_endpoint_inner_operation(module_graph, is_single_page);
    let result_vc = if !is_single_page {
        let result_vc = result_op.resolve_strongly_consistent().await?;
        result_op.drop_collectibles::<Box<dyn Issue>>();
        *result_vc
    } else {
        result_op.connect()
    };
    Ok(result_vc)
}
