use std::collections::BTreeMap;

use anyhow::{Context, Result, bail, ensure};
use async_trait::async_trait;
use bincode::{Decode, Encode};
use next_core::{
    app_structure::{
        AppPageLoaderTree, CollectedRootParams, Entrypoint as AppEntrypoint,
        Entrypoints as AppEntrypoints, FileSystemPathVec, MetadataItem, collect_root_params,
        get_entrypoints,
    },
    get_edge_resolve_options_context, get_next_package,
    next_app::{
        AppEntry, AppPage, AppPath, get_app_client_references_chunks,
        get_app_client_shared_chunk_group, get_app_page_entry, get_app_route_entry,
        get_client_references_chunks_for_hmr, metadata::route::get_app_metadata_route_entry,
    },
    next_client::{
        ClientContextType, get_client_module_options_context, get_client_resolve_options_context,
        get_client_runtime_entries,
    },
    next_client_reference::{
        ClientReferenceGraphResult, ClientReferenceType, NextCssClientReferenceTransition,
        NextEcmascriptClientReferenceTransition, ServerEntries, find_server_entries,
    },
    next_config::NextConfig,
    next_dynamic::NextDynamicTransition,
    next_edge::route_regex::get_named_middleware_regex,
    next_manifests::{
        AppPathsManifest, BuildManifest, EdgeFunctionDefinition, MiddlewaresManifestV2,
        PagesManifest, ProxyMatcher, Regions, client_reference_manifest::ClientReferenceManifest,
    },
    next_server::{
        ServerContextType, get_server_module_options_context, get_server_resolve_options_context,
    },
    next_server_component::NextServerComponentTransition,
    next_server_utility::{NEXT_SERVER_UTILITY_MERGE_TAG, NextServerUtilityTransition},
    pages_structure::PagesDirectoryStructure,
    util::{NextRuntime, app_function_name, module_styles_rule_condition, styles_rule_condition},
};
use smallvec::smallvec;
use tracing::{Instrument, field::Empty};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    Completion, NonLocalValue, OrderedAutoMap, ResolvedVc, TryJoinIterExt, ValueToString, Vc,
    fxindexset,
};
use turbo_tasks_fs::{File, FileContent, FileSystemEntryType, FileSystemPath, to_sys_path};
use turbo_tasks_hash::HashAlgorithm;
use turbopack::{
    ModuleAssetContext,
    module_options::{ModuleOptionsContext, RuleCondition, transition_rule::TransitionRule},
    transition::{FullContextTransition, Transition, TransitionOptions},
};
use turbopack_core::{
    asset::{AssetContent, no_hash_salt},
    chunk::{
        ChunkGroupResult, ChunkingContext, ChunkingContextExt, EvaluatableAsset, EvaluatableAssets,
        HmrChunkListSource, availability_info::AvailabilityInfo,
    },
    file_source::FileSource,
    ident::{AssetIdent, Layer},
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, StyledString},
    module::Module,
    module_graph::{
        GraphEntries, ModuleGraph, SingleModuleGraph, VisitedModules,
        binding_usage_info::compute_binding_usage_info,
        chunk_group_info::{ChunkGroupEntry, ChunkGroupKey, EntryHeuristics},
    },
    output::{OutputAsset, OutputAssets, OutputAssetsWithReferenced},
    reference::all_assets_from_entries,
    reference_type::{CommonJsReferenceSubType, CssReferenceSubType, ReferenceTypeCondition},
    resolve::{ResolveErrorMode, origin::PlainResolveOrigin, parse::Request, pattern::Pattern},
    virtual_output::VirtualOutputAsset,
};
use turbopack_ecmascript::single_file_ecmascript_output::SingleFileEcmascriptOutput;
use turbopack_go::{
    GoBuildOutcome, GoBuildSession, GoSessionPool, GoSourceSelection, GoSourceSet,
    GoToolchainOptions, go_declarations, go_package_bundle_from_sources,
    go_packages_bundle_from_sources, go_packages_root, go_source_failure, go_source_set,
};
use turbopack_resolve::{ecmascript::cjs_resolve, resolve_options_context::ResolveOptionsContext};

use crate::{
    dynamic_imports::{NextDynamicChunkAvailability, collect_next_dynamic_chunks},
    font::FontManifest,
    loadable_manifest::create_react_loadable_manifest,
    module_graph::{ClientReferencesGraphs, NextDynamicGraphs, ServerActionsGraphs},
    nft::{EndpointTraceResult, trace_endpoint},
    nft_json::NftJsonAsset,
    paths::{
        all_asset_paths, all_paths_in_root, get_asset_paths_from_root, get_js_paths_from_root,
        get_wasm_paths_from_root, paths_to_bindings, wasm_paths_to_bindings,
    },
    project::{BaseAndFullModuleGraph, Project},
    route::{
        AnalyzeChunkGroup, AnalyzeChunkGroups, AnalyzeClientEntries, AnalyzeClientReference,
        AppPageRoute, Endpoint, EndpointOutput, EndpointOutputPaths, FirstLoadChunks, ModuleGraphs,
        Route, Routes,
    },
    server_actions::{build_server_actions_loader, create_server_actions_manifest},
    service_worker::service_worker_output_assets,
    sri_manifest::get_sri_manifest_asset,
};

#[turbo_tasks::value]
pub struct AppProject {
    project: ResolvedVc<Project>,
    app_dir: FileSystemPath,
}

#[turbo_tasks::value(transparent)]
pub struct OptionAppProject(Option<ResolvedVc<AppProject>>);

pub static CLIENT_TRANSITION_NAME: RcStr = rcstr!("next-ecmascript-client-reference");

#[turbo_tasks::value_impl]
impl AppProject {
    #[turbo_tasks::function]
    pub fn new(project: ResolvedVc<Project>, app_dir: FileSystemPath) -> Vc<Self> {
        AppProject { project, app_dir }.cell()
    }

    #[turbo_tasks::function]
    fn project(&self) -> Vc<Project> {
        *self.project
    }

    #[turbo_tasks::function]
    fn app_dir(&self) -> Vc<FileSystemPath> {
        self.app_dir.clone().cell()
    }

    #[turbo_tasks::function]
    fn client_ty(&self) -> Vc<ClientContextType> {
        ClientContextType::App {
            app_dir: self.app_dir.clone(),
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn rsc_ty(self: Vc<Self>) -> Result<Vc<ServerContextType>> {
        let this = self.await?;
        Ok(ServerContextType::AppRSC {
            app_dir: this.app_dir.clone(),
            client_transition: Some(ResolvedVc::upcast(
                self.client_transition().to_resolved().await?,
            )),
            ecmascript_client_reference_transition_name: Some(CLIENT_TRANSITION_NAME.clone()),
        }
        .cell())
    }

    #[turbo_tasks::function]
    async fn route_ty(self: Vc<Self>) -> Result<Vc<ServerContextType>> {
        let this = self.await?;
        Ok(ServerContextType::AppRoute {
            app_dir: this.app_dir.clone(),
            ecmascript_client_reference_transition_name: Some(CLIENT_TRANSITION_NAME.clone()),
        }
        .cell())
    }

    #[turbo_tasks::function]
    fn ssr_ty(&self) -> Vc<ServerContextType> {
        ServerContextType::AppSSR {
            app_dir: self.app_dir.clone(),
        }
        .cell()
    }

    #[turbo_tasks::function]
    fn app_entrypoints(&self) -> Vc<AppEntrypoints> {
        let conf = self.project.next_config();
        get_entrypoints(
            self.app_dir.clone(),
            conf.page_extensions(),
            conf.is_global_not_found_enabled(),
            conf.explicit_parallel_route_children(),
            conf.strict_route_matching(),
            self.project.next_mode(),
        )
    }

    #[turbo_tasks::function]
    async fn collected_root_params(self: Vc<Self>) -> Result<Vc<CollectedRootParams>> {
        Ok(collect_root_params(self.app_entrypoints()))
    }

    #[turbo_tasks::function]
    async fn client_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        let project = self.project();
        Ok(get_client_module_options_context(
            project.project_path().owned().await?,
            project.execution_context(),
            project.client_compile_time_info().environment(),
            self.client_ty().owned().await?,
            project.next_mode(),
            project.next_config(),
            project.encryption_key(),
            project.client_source_map_generation_options(),
        ))
    }

    #[turbo_tasks::function]
    async fn client_resolve_options_context(self: Vc<Self>) -> Result<Vc<ResolveOptionsContext>> {
        Ok(get_client_resolve_options_context(
            self.project().project_path().owned().await?,
            self.client_ty().owned().await?,
            self.project().next_mode(),
            self.project().next_config(),
            self.project().execution_context(),
        ))
    }

    #[turbo_tasks::function]
    fn client_transition(self: Vc<Self>) -> Vc<FullContextTransition> {
        let module_context = self.client_module_context();
        FullContextTransition::new(module_context)
    }

    #[turbo_tasks::function]
    async fn rsc_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        let project = self.project();
        Ok(get_server_module_options_context(
            project.project_path().owned().await?,
            project.execution_context(),
            self.rsc_ty().owned().await?,
            project.next_mode(),
            project.next_config(),
            NextRuntime::NodeJs,
            project.encryption_key(),
            project.server_compile_time_info().environment(),
            project.client_compile_time_info().environment(),
            *project.should_trace().await?,
            project.server_source_map_generation_options(),
        ))
    }

    #[turbo_tasks::function]
    async fn edge_rsc_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        let project = self.project();
        Ok(get_server_module_options_context(
            project.project_path().owned().await?,
            project.execution_context(),
            self.rsc_ty().owned().await?,
            project.next_mode(),
            project.next_config(),
            NextRuntime::Edge,
            project.encryption_key(),
            project.edge_compile_time_info().environment(),
            project.client_compile_time_info().environment(),
            // There is no NFT on edge
            false,
            project.server_source_map_generation_options(),
        ))
    }

    #[turbo_tasks::function]
    async fn route_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        let project = self.project();
        Ok(get_server_module_options_context(
            project.project_path().owned().await?,
            project.execution_context(),
            self.route_ty().owned().await?,
            project.next_mode(),
            project.next_config(),
            NextRuntime::NodeJs,
            project.encryption_key(),
            project.server_compile_time_info().environment(),
            project.client_compile_time_info().environment(),
            *project.should_trace().await?,
            project.server_source_map_generation_options(),
        ))
    }

    #[turbo_tasks::function]
    async fn edge_route_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        let project = self.project();
        Ok(get_server_module_options_context(
            project.project_path().owned().await?,
            project.execution_context(),
            self.route_ty().owned().await?,
            project.next_mode(),
            project.next_config(),
            NextRuntime::Edge,
            project.encryption_key(),
            project.edge_compile_time_info().environment(),
            project.client_compile_time_info().environment(),
            // There is no NFT on edge
            false,
            project.server_source_map_generation_options(),
        ))
    }

    #[turbo_tasks::function]
    async fn rsc_resolve_options_context(self: Vc<Self>) -> Result<Vc<ResolveOptionsContext>> {
        Ok(get_server_resolve_options_context(
            self.project().project_path().owned().await?,
            self.rsc_ty().owned().await?,
            self.project().next_mode(),
            self.project().next_config(),
            self.project().execution_context(),
            Some(self.collected_root_params()),
        ))
    }

    #[turbo_tasks::function]
    async fn edge_rsc_resolve_options_context(self: Vc<Self>) -> Result<Vc<ResolveOptionsContext>> {
        Ok(get_edge_resolve_options_context(
            self.project().project_path().owned().await?,
            self.rsc_ty().owned().await?,
            self.project().next_mode(),
            self.project().next_config(),
            self.project().execution_context(),
            Some(self.collected_root_params()),
        ))
    }

    #[turbo_tasks::function]
    async fn route_resolve_options_context(self: Vc<Self>) -> Result<Vc<ResolveOptionsContext>> {
        Ok(get_server_resolve_options_context(
            self.project().project_path().owned().await?,
            self.route_ty().owned().await?,
            self.project().next_mode(),
            self.project().next_config(),
            self.project().execution_context(),
            Some(self.collected_root_params()),
        ))
    }

    #[turbo_tasks::function]
    async fn edge_route_resolve_options_context(
        self: Vc<Self>,
    ) -> Result<Vc<ResolveOptionsContext>> {
        Ok(get_edge_resolve_options_context(
            self.project().project_path().owned().await?,
            self.route_ty().owned().await?,
            self.project().next_mode(),
            self.project().next_config(),
            self.project().execution_context(),
            Some(self.collected_root_params()),
        ))
    }

    #[turbo_tasks::function]
    pub fn ecmascript_client_reference_transition(self: Vc<Self>) -> Vc<Box<dyn Transition>> {
        Vc::upcast(NextEcmascriptClientReferenceTransition::new(
            Vc::upcast(self.client_transition()),
            Vc::upcast(self.ssr_transition()),
        ))
    }

    #[turbo_tasks::function]
    pub fn edge_ecmascript_client_reference_transition(self: Vc<Self>) -> Vc<Box<dyn Transition>> {
        Vc::upcast(NextEcmascriptClientReferenceTransition::new(
            Vc::upcast(self.client_transition()),
            Vc::upcast(self.edge_ssr_transition()),
        ))
    }

    #[turbo_tasks::function]
    pub fn css_client_reference_transition(self: Vc<Self>) -> Vc<Box<dyn Transition>> {
        Vc::upcast(NextCssClientReferenceTransition::new(Vc::upcast(
            self.client_transition(),
        )))
    }

    #[turbo_tasks::function]
    async fn get_rsc_transitions(
        self: Vc<Self>,
        ecmascript_client_reference_transition: Vc<Box<dyn Transition>>,
        ssr_transition: Vc<Box<dyn Transition>>,
        shared_transition: Vc<Box<dyn Transition>>,
    ) -> Result<Vc<TransitionOptions>> {
        Ok(TransitionOptions {
            named_transitions: [
                (
                    CLIENT_TRANSITION_NAME.clone(),
                    ecmascript_client_reference_transition.to_resolved().await?,
                ),
                (
                    rcstr!("next-dynamic"),
                    ResolvedVc::upcast(NextDynamicTransition::new_marker().to_resolved().await?),
                ),
                (
                    rcstr!("next-dynamic-client"),
                    ResolvedVc::upcast(
                        NextDynamicTransition::new_client(Vc::upcast(self.client_transition()))
                            .to_resolved()
                            .await?,
                    ),
                ),
                (rcstr!("next-ssr"), ssr_transition.to_resolved().await?),
                (
                    rcstr!("next-shared"),
                    shared_transition.to_resolved().await?,
                ),
                (
                    rcstr!("next-server-utility"),
                    ResolvedVc::upcast(NextServerUtilityTransition::new().to_resolved().await?),
                ),
                (
                    rcstr!("next-server-component"),
                    ResolvedVc::upcast(NextServerComponentTransition::new().to_resolved().await?),
                ),
            ]
            .into_iter()
            .collect(),
            transition_rules: vec![
                // Mark as client reference (and exclude from RSC chunking) the edge from the
                // CSS Module to the actual CSS
                TransitionRule::new(
                    RuleCondition::all(vec![
                        RuleCondition::ReferenceType(ReferenceTypeCondition::Css(Some(
                            CssReferenceSubType::Inner,
                        ))),
                        module_styles_rule_condition(),
                    ]),
                    self.css_client_reference_transition().to_resolved().await?,
                ),
                // Don't wrap in marker module but change context, this is used to determine
                // the list of CSS module classes.
                TransitionRule::new(
                    RuleCondition::all(vec![
                        RuleCondition::ReferenceType(ReferenceTypeCondition::Css(Some(
                            CssReferenceSubType::Analyze,
                        ))),
                        module_styles_rule_condition(),
                    ]),
                    ResolvedVc::upcast(self.client_transition().to_resolved().await?),
                ),
                // Mark as client reference all regular CSS imports
                TransitionRule::new(
                    styles_rule_condition(),
                    self.css_client_reference_transition().to_resolved().await?,
                ),
            ],
            ..Default::default()
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub(crate) fn rsc_module_context(self: Vc<Self>) -> Result<Vc<ModuleAssetContext>> {
        Ok(ModuleAssetContext::new(
            self.get_rsc_transitions(
                self.ecmascript_client_reference_transition(),
                Vc::upcast(self.ssr_transition()),
                self.shared_transition(),
            ),
            self.project().server_compile_time_info(),
            self.rsc_module_options_context(),
            self.rsc_resolve_options_context(),
            Layer::new_with_user_friendly_name(rcstr!("app-rsc"), rcstr!("Server Component")),
        ))
    }

    #[turbo_tasks::function]
    fn edge_rsc_module_context(self: Vc<Self>) -> Result<Vc<ModuleAssetContext>> {
        Ok(ModuleAssetContext::new(
            self.get_rsc_transitions(
                self.edge_ecmascript_client_reference_transition(),
                Vc::upcast(self.edge_ssr_transition()),
                self.edge_shared_transition(),
            ),
            self.project().edge_compile_time_info(),
            self.edge_rsc_module_options_context(),
            self.edge_rsc_resolve_options_context(),
            Layer::new_with_user_friendly_name(
                rcstr!("app-edge-rsc"),
                rcstr!("Edge Server Component"),
            ),
        ))
    }

    #[turbo_tasks::function]
    pub(crate) async fn route_module_context(self: Vc<Self>) -> Result<Vc<ModuleAssetContext>> {
        let transitions = [
            (
                CLIENT_TRANSITION_NAME.clone(),
                self.ecmascript_client_reference_transition()
                    .to_resolved()
                    .await?,
            ),
            (
                rcstr!("next-dynamic"),
                ResolvedVc::upcast(NextDynamicTransition::new_marker().to_resolved().await?),
            ),
            (
                rcstr!("next-dynamic-client"),
                ResolvedVc::upcast(
                    NextDynamicTransition::new_client(Vc::upcast(self.client_transition()))
                        .to_resolved()
                        .await?,
                ),
            ),
            (
                rcstr!("next-ssr"),
                ResolvedVc::upcast(self.ssr_transition().to_resolved().await?),
            ),
            (
                rcstr!("next-shared"),
                self.shared_transition().to_resolved().await?,
            ),
            (
                rcstr!("next-server-utility"),
                ResolvedVc::upcast(NextServerUtilityTransition::new().to_resolved().await?),
            ),
        ]
        .into_iter()
        .collect();

        Ok(ModuleAssetContext::new(
            TransitionOptions {
                // TODO use get_rsc_transitions as well?
                named_transitions: transitions,
                ..Default::default()
            }
            .cell(),
            self.project().server_compile_time_info(),
            self.route_module_options_context(),
            self.route_resolve_options_context(),
            Layer::new_with_user_friendly_name(rcstr!("app-route"), rcstr!("App Route")),
        ))
    }

    #[turbo_tasks::function]
    async fn edge_route_module_context(self: Vc<Self>) -> Result<Vc<ModuleAssetContext>> {
        let transitions = [
            (
                CLIENT_TRANSITION_NAME.clone(),
                self.edge_ecmascript_client_reference_transition()
                    .to_resolved()
                    .await?,
            ),
            (
                rcstr!("next-dynamic"),
                ResolvedVc::upcast(NextDynamicTransition::new_marker().to_resolved().await?),
            ),
            (
                rcstr!("next-dynamic-client"),
                ResolvedVc::upcast(
                    NextDynamicTransition::new_client(Vc::upcast(self.client_transition()))
                        .to_resolved()
                        .await?,
                ),
            ),
            (
                rcstr!("next-ssr"),
                ResolvedVc::upcast(self.edge_ssr_transition().to_resolved().await?),
            ),
            (
                rcstr!("next-shared"),
                self.edge_shared_transition().to_resolved().await?,
            ),
            (
                rcstr!("next-server-utility"),
                ResolvedVc::upcast(NextServerUtilityTransition::new().to_resolved().await?),
            ),
        ]
        .into_iter()
        .collect();
        Ok(ModuleAssetContext::new(
            TransitionOptions {
                // TODO use get_rsc_transitions as well?
                named_transitions: transitions,
                ..Default::default()
            }
            .cell(),
            self.project().edge_compile_time_info(),
            self.edge_route_module_options_context(),
            self.edge_route_resolve_options_context(),
            Layer::new_with_user_friendly_name(rcstr!("app-edge-route"), rcstr!("Edge App Route")),
        ))
    }

    #[turbo_tasks::function]
    async fn client_module_context(self: Vc<Self>) -> Result<Vc<ModuleAssetContext>> {
        let transitions = [
            (
                rcstr!("next-dynamic"),
                ResolvedVc::upcast(NextDynamicTransition::new_marker().to_resolved().await?),
            ),
            (
                rcstr!("next-dynamic-client"),
                ResolvedVc::upcast(NextDynamicTransition::new_marker().to_resolved().await?),
            ),
        ]
        .into_iter()
        .collect();
        Ok(ModuleAssetContext::new(
            TransitionOptions {
                named_transitions: transitions,
                ..Default::default()
            }
            .cell(),
            self.project().client_compile_time_info(),
            self.client_module_options_context(),
            self.client_resolve_options_context(),
            Layer::new_with_user_friendly_name(
                rcstr!("app-client"),
                rcstr!("Client Component Browser"),
            ),
        ))
    }

    #[turbo_tasks::function]
    async fn ssr_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        Ok(get_server_module_options_context(
            self.project().project_path().owned().await?,
            self.project().execution_context(),
            self.ssr_ty().owned().await?,
            self.project().next_mode(),
            self.project().next_config(),
            NextRuntime::NodeJs,
            self.project().encryption_key(),
            self.project().server_compile_time_info().environment(),
            self.project().client_compile_time_info().environment(),
            *self.project().should_trace().await?,
            self.project().server_source_map_generation_options(),
        ))
    }

    #[turbo_tasks::function]
    async fn edge_ssr_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        Ok(get_server_module_options_context(
            self.project().project_path().owned().await?,
            self.project().execution_context(),
            self.ssr_ty().owned().await?,
            self.project().next_mode(),
            self.project().next_config(),
            NextRuntime::Edge,
            self.project().encryption_key(),
            self.project().edge_compile_time_info().environment(),
            self.project().client_compile_time_info().environment(),
            // There is no NFT on edge
            false,
            self.project().server_source_map_generation_options(),
        ))
    }

    #[turbo_tasks::function]
    async fn ssr_resolve_options_context(self: Vc<Self>) -> Result<Vc<ResolveOptionsContext>> {
        Ok(get_server_resolve_options_context(
            self.project().project_path().owned().await?,
            self.ssr_ty().owned().await?,
            self.project().next_mode(),
            self.project().next_config(),
            self.project().execution_context(),
            None, // root params are not available in client modules
        ))
    }

    #[turbo_tasks::function]
    async fn edge_ssr_resolve_options_context(self: Vc<Self>) -> Result<Vc<ResolveOptionsContext>> {
        Ok(get_edge_resolve_options_context(
            self.project().project_path().owned().await?,
            self.ssr_ty().owned().await?,
            self.project().next_mode(),
            self.project().next_config(),
            self.project().execution_context(),
            None, // root params are not available in client modules
        ))
    }

    #[turbo_tasks::function]
    async fn ssr_module_context(self: Vc<Self>) -> Result<Vc<ModuleAssetContext>> {
        let transitions = [
            (
                rcstr!("next-dynamic"),
                ResolvedVc::upcast(NextDynamicTransition::new_marker().to_resolved().await?),
            ),
            (
                rcstr!("next-dynamic-client"),
                ResolvedVc::upcast(
                    NextDynamicTransition::new_client(Vc::upcast(self.client_transition()))
                        .to_resolved()
                        .await?,
                ),
            ),
            (
                rcstr!("next-shared"),
                self.shared_transition().to_resolved().await?,
            ),
        ]
        .into_iter()
        .collect();
        Ok(ModuleAssetContext::new(
            TransitionOptions {
                named_transitions: transitions,
                transition_rules: vec![
                    // Change context, this is used to determine the list of CSS module classes.
                    TransitionRule::new(
                        RuleCondition::all(vec![
                            RuleCondition::ReferenceType(ReferenceTypeCondition::Css(Some(
                                CssReferenceSubType::Analyze,
                            ))),
                            module_styles_rule_condition(),
                        ]),
                        ResolvedVc::upcast(self.client_transition().to_resolved().await?),
                    ),
                ],
                ..Default::default()
            }
            .cell(),
            self.project().server_compile_time_info(),
            self.ssr_module_options_context(),
            self.ssr_resolve_options_context(),
            Layer::new_with_user_friendly_name(rcstr!("app-ssr"), rcstr!("Client Component SSR")),
        ))
    }

    #[turbo_tasks::function]
    fn ssr_transition(self: Vc<Self>) -> Vc<FullContextTransition> {
        let module_context = self.ssr_module_context();
        FullContextTransition::new(module_context)
    }

    #[turbo_tasks::function]
    fn shared_module_context(self: Vc<Self>) -> Result<Vc<ModuleAssetContext>> {
        Ok(ModuleAssetContext::new(
            TransitionOptions {
                ..Default::default()
            }
            .cell(),
            self.project().server_compile_time_info(),
            self.ssr_module_options_context(),
            self.ssr_resolve_options_context(),
            Layer::new(rcstr!("app-shared")),
        ))
    }

    #[turbo_tasks::function]
    fn shared_transition(self: Vc<Self>) -> Vc<Box<dyn Transition>> {
        Vc::upcast(FullContextTransition::new(self.shared_module_context()))
    }

    #[turbo_tasks::function]
    async fn edge_ssr_module_context(self: Vc<Self>) -> Result<Vc<ModuleAssetContext>> {
        let transitions = [
            (
                rcstr!("next-dynamic"),
                ResolvedVc::upcast(NextDynamicTransition::new_marker().to_resolved().await?),
            ),
            (
                rcstr!("next-dynamic-client"),
                ResolvedVc::upcast(
                    NextDynamicTransition::new_client(Vc::upcast(self.client_transition()))
                        .to_resolved()
                        .await?,
                ),
            ),
            (
                rcstr!("next-shared"),
                self.edge_shared_transition().to_resolved().await?,
            ),
        ]
        .into_iter()
        .collect();
        Ok(ModuleAssetContext::new(
            TransitionOptions {
                named_transitions: transitions,
                transition_rules: vec![
                    // Change context, this is used to determine the list of CSS module classes.
                    TransitionRule::new(
                        RuleCondition::all(vec![
                            RuleCondition::ReferenceType(ReferenceTypeCondition::Css(Some(
                                CssReferenceSubType::Analyze,
                            ))),
                            module_styles_rule_condition(),
                        ]),
                        ResolvedVc::upcast(self.client_transition().to_resolved().await?),
                    ),
                ],
                ..Default::default()
            }
            .cell(),
            self.project().edge_compile_time_info(),
            self.edge_ssr_module_options_context(),
            self.edge_ssr_resolve_options_context(),
            Layer::new_with_user_friendly_name(
                rcstr!("app-edge-ssr"),
                rcstr!("Client Component SSR - Edge"),
            ),
        ))
    }

    #[turbo_tasks::function]
    fn edge_ssr_transition(self: Vc<Self>) -> Vc<FullContextTransition> {
        let module_context = self.edge_ssr_module_context();
        FullContextTransition::new(module_context)
    }

    #[turbo_tasks::function]
    fn edge_shared_module_context(self: Vc<Self>) -> Result<Vc<ModuleAssetContext>> {
        Ok(ModuleAssetContext::new(
            TransitionOptions {
                ..Default::default()
            }
            .cell(),
            self.project().edge_compile_time_info(),
            self.edge_ssr_module_options_context(),
            self.edge_ssr_resolve_options_context(),
            Layer::new(rcstr!("app-edge-shared")),
        ))
    }

    #[turbo_tasks::function]
    fn edge_shared_transition(self: Vc<Self>) -> Vc<Box<dyn Transition>> {
        Vc::upcast(FullContextTransition::new(
            self.edge_shared_module_context(),
        ))
    }

    #[turbo_tasks::function]
    async fn client_runtime_entries(self: Vc<Self>) -> Result<Vc<EvaluatableAssets>> {
        Ok(get_client_runtime_entries(
            self.project().project_path().owned().await?,
            self.client_ty().owned().await?,
            self.project().next_mode(),
            self.project().next_config(),
            self.project().execution_context(),
        )
        .resolve_entries(Vc::upcast(self.client_module_context())))
    }

    #[turbo_tasks::function]
    pub async fn routes(self: Vc<Self>) -> Result<Vc<Routes>> {
        Ok(self.routes_with_filter(None))
    }

    #[turbo_tasks::function]
    pub async fn routes_with_filter(
        self: Vc<Self>,
        app_route_filter: Option<Vec<RcStr>>,
    ) -> Result<Vc<Routes>> {
        let app_entrypoints = self.app_entrypoints();
        Ok(Vc::cell(
            app_entrypoints
                .await?
                .iter()
                .filter(|(pathname, _)| {
                    app_route_filter.as_ref().is_none_or(|app_routes| {
                        app_routes
                            .iter()
                            .any(|route| route.as_str() == pathname.to_string())
                    })
                })
                .map(async |(pathname, app_entrypoint)| {
                    Ok((
                        pathname.to_string().into(),
                        app_entry_point_to_route(self, app_entrypoint.clone())
                            .owned()
                            .await?,
                    ))
                })
                .try_join()
                .await?
                .into_iter()
                .collect(),
        ))
    }

    #[turbo_tasks::function]
    pub async fn has_go_routes(self: Vc<Self>) -> Result<Vc<bool>> {
        Ok(Vc::cell(self.app_entrypoints().await?.values().any(
            |entry| matches!(entry, AppEntrypoint::AppGoRoute { .. }),
        )))
    }

    #[turbo_tasks::function]
    pub async fn route_keys(self: Vc<Self>) -> Result<Vc<Vec<RcStr>>> {
        let app_entrypoints = self.app_entrypoints();
        Ok(Vc::cell(
            app_entrypoints
                .await?
                .iter()
                .map(|(pathname, _)| pathname.to_string().into())
                .collect(),
        ))
    }

    #[turbo_tasks::function]
    pub async fn client_main_module(self: Vc<Self>) -> Result<Vc<Box<dyn Module>>> {
        let client_module_context = Vc::upcast(self.client_module_context());

        let client_main_module = cjs_resolve(
            Vc::upcast(PlainResolveOrigin::new(
                client_module_context,
                self.project().project_path().await?.join("_")?,
            )),
            Request::parse(Pattern::Constant(rcstr!(
                "next/dist/client/app-next-turbopack.js"
            ))),
            CommonJsReferenceSubType::Undefined,
            None,
            ResolveErrorMode::Error,
        )
        .await?
        .first_module()
        .await?
        .context("expected Next.js client runtime to resolve to a module")?;

        Ok(*client_main_module)
    }

    #[turbo_tasks::function]
    pub async fn app_module_graphs(
        &self,
        endpoint: Vc<AppEndpoint>,
        rsc_entry: ResolvedVc<Box<dyn Module>>,
        client_shared_entries_when_has_layout_segments: Option<Vc<EvaluatableAssets>>,
    ) -> Result<Vc<BaseAndFullModuleGraph>> {
        if *self.project.per_page_module_graph().await? {
            let next_mode = self.project.next_mode();
            let next_mode_ref = next_mode.await?;
            let should_trace = *self.project.should_trace().await?;
            let should_read_binding_usage = next_mode_ref.is_production();
            let remove_unused_imports = *self
                .project
                .next_config()
                .turbopack_remove_unused_imports(next_mode)
                .await?;
            let graph_options = self.project.module_graph_options().await?;

            // Implements layout segment optimization to compute a graph "chain" for each layout
            // segment
            let span = tracing::info_span!("module graph for endpoint", modules = Empty);
            let span_clone = span.clone();
            async move {
                let rsc_entry_chunk_group = ChunkGroupEntry::Entry {
                    modules: vec![rsc_entry],
                    heuristics: EntryHeuristics::default(),
                };

                let mut graphs = vec![];
                let mut visited_modules = VisitedModules::empty();

                if let Some(client_shared_entries) = client_shared_entries_when_has_layout_segments
                {
                    let ServerEntries {
                        server_component_entries,
                        server_utils,
                    } = &*find_server_entries(*rsc_entry, should_trace, should_read_binding_usage)
                        .await?;

                    let client_shared_entries = client_shared_entries
                        .await?
                        .into_iter()
                        .map(ResolvedVc::upcast)
                        .collect();

                    // SEGMENT: client_shared_entries and server utils shared by the layout segments
                    // and the page
                    let graph = SingleModuleGraph::new_with_entries_visited_intern(
                        GraphEntries::from_chunk_groups(vec![
                            ChunkGroupEntry::Entry {
                                modules: client_shared_entries,
                                heuristics: EntryHeuristics::default(),
                            },
                            ChunkGroupEntry::SharedMultiple(
                                server_utils
                                    .iter()
                                    .map(async |m| Ok(ResolvedVc::upcast(m.await?.module)))
                                    .try_join()
                                    .await?,
                            ),
                        ]),
                        visited_modules,
                        graph_options,
                    );
                    graphs.push(graph);
                    visited_modules = VisitedModules::concatenate(visited_modules, graph);

                    // Skip the last server component, which is the page itself, because that one
                    // won't have it's visited modules added, and will be visited in the next step
                    // as part of rsc_entry
                    for module in server_component_entries
                        .iter()
                        .take(server_component_entries.len().saturating_sub(1))
                    {
                        // SEGMENT: layout segment
                        let graph = SingleModuleGraph::new_with_entries_visited_intern(
                            GraphEntries::from_chunk_groups(vec![ChunkGroupEntry::Shared(
                                ResolvedVc::upcast(*module),
                            )]),
                            visited_modules,
                            graph_options,
                        );
                        graphs.push(graph);
                        let is_layout = module.server_path().await?.file_stem() == Some("layout");
                        visited_modules = if is_layout {
                            // Only propagate the visited_modules of the parent layout(s), not
                            // across siblings such as loading.js and
                            // page.js.
                            VisitedModules::concatenate(visited_modules, graph)
                        } else {
                            // Prevents graph index from getting out of sync.
                            // TODO We should remove VisitedModule entirely in favor of lookups
                            // in SingleModuleGraph
                            VisitedModules::with_incremented_index(visited_modules)
                        };
                    }
                }

                // SEGMENT: rsc entry chunk group
                let graph = SingleModuleGraph::new_with_entries_visited_intern(
                    GraphEntries::from_chunk_groups(vec![rsc_entry_chunk_group]),
                    visited_modules,
                    graph_options,
                );
                graphs.push(graph);
                visited_modules = VisitedModules::concatenate(visited_modules, graph);

                let base = ModuleGraph::from_graphs(graphs.clone(), None);
                let additional_entries = endpoint.additional_entries(base.connect());
                let additional_module_graph = SingleModuleGraph::new_with_entries_visited_intern(
                    additional_entries.owned().await?,
                    visited_modules,
                    graph_options,
                );
                graphs.push(additional_module_graph);

                if !span.is_disabled() {
                    let mut module_count = 0u64;
                    for g in &graphs {
                        module_count += g.connect().module_count().untracked().owned().await?;
                    }
                    span.record("modules", module_count);
                }

                let (full, binding_usage_info) = if remove_unused_imports {
                    let full_with_unused_references =
                        ModuleGraph::from_graphs(graphs.clone(), None);
                    // This is a per-route graph: a module that is unused here might still be code
                    // generated via another graph, so dropping its data would only cause re-parses.
                    let binding_usage_info = compute_binding_usage_info(
                        full_with_unused_references,
                        should_read_binding_usage,
                        /* drop_unused_module_data */ false,
                    );
                    (
                        ModuleGraph::from_graphs(graphs, Some(binding_usage_info)),
                        Some(binding_usage_info),
                    )
                } else {
                    (ModuleGraph::from_graphs(graphs, None), None)
                };

                Ok(BaseAndFullModuleGraph {
                    base: base.connect().to_resolved().await?,
                    full: full.connect().to_resolved().await?,
                    binding_usage_info,
                }
                .cell())
            }
            .instrument(span_clone)
            .await
        } else {
            Ok(self.project.whole_app_module_graphs())
        }
    }
}

#[turbo_tasks::function]
pub async fn app_entry_point_to_route(
    app_project: ResolvedVc<AppProject>,
    entrypoint: AppEntrypoint,
) -> Result<Vc<Route>> {
    Ok(match entrypoint {
        AppEntrypoint::AppPage {
            pages, loader_tree, ..
        } => Route::AppPage(
            pages
                .into_iter()
                .map(|page| AppPageRoute {
                    original_name: RcStr::from(page.to_string()),
                    html_endpoint: ResolvedVc::upcast(
                        AppEndpoint {
                            ty: AppEndpointType::Page {
                                ty: AppPageEndpointType::Html,
                                loader_tree,
                            },
                            app_project,
                            page: page.clone(),
                        }
                        .resolved_cell(),
                    ),
                    rsc_hmr_endpoint: ResolvedVc::upcast(
                        AppEndpoint {
                            ty: AppEndpointType::Page {
                                ty: AppPageEndpointType::RscHmr,
                                loader_tree,
                            },
                            app_project,
                            page,
                        }
                        .resolved_cell(),
                    ),
                })
                .collect(),
        ),
        AppEntrypoint::AppGoRoute { page, path, .. } => {
            if !*app_project.project().next_config().go_routes().await? {
                GoRouteIssue {
                    path: path.clone(),
                    message: rcstr!("route.go requires experimental.goRoutes: true"),
                }
                .resolved_cell()
                .emit();
            }
            Route::AppGoRoute {
                original_name: page.to_string().into(),
                endpoint: ResolvedVc::upcast(
                    GoEndpoint {
                        project: app_project.project().to_resolved().await?,
                        path,
                        kind: GoEndpointKind::Route { page },
                    }
                    .resolved_cell(),
                ),
            }
        }
        AppEntrypoint::AppRoute { page, path, .. } => Route::AppRoute {
            original_name: page.to_string().into(),
            endpoint: ResolvedVc::upcast(
                AppEndpoint {
                    ty: AppEndpointType::Route { path },
                    app_project,
                    page,
                }
                .resolved_cell(),
            ),
            has_action_manifest: true,
        },
        AppEntrypoint::AppMetadata { page, metadata, .. } => {
            let has_action_manifest = matches!(metadata, MetadataItem::Dynamic { .. });
            Route::AppRoute {
                original_name: page.to_string().into(),
                endpoint: ResolvedVc::upcast(
                    AppEndpoint {
                        ty: AppEndpointType::Metadata { metadata },
                        app_project,
                        page,
                    }
                    .resolved_cell(),
                ),
                has_action_manifest,
            }
        }
    }
    .cell())
}

#[derive(Clone, PartialEq, Eq, Debug, NonLocalValue, Encode, Decode)]
enum GoEndpointKind {
    Route { page: AppPage },
    Proxy,
}

#[turbo_tasks::value(shared)]
struct GoEndpoint {
    project: ResolvedVc<Project>,
    path: FileSystemPath,
    kind: GoEndpointKind,
}

pub(crate) fn go_proxy_endpoint(
    project: ResolvedVc<Project>,
    path: FileSystemPath,
) -> Vc<Box<dyn Endpoint>> {
    Vc::upcast(
        GoEndpoint {
            project,
            path,
            kind: GoEndpointKind::Proxy,
        }
        .cell(),
    )
}

/// Renders the Go proxy handler with the configuration that proxy.ts URL
/// normalization depends on.
fn go_proxy_handler_source(skip_proxy_url_normalize: bool, base_path: &str) -> Result<String> {
    let source = include_str!("templates/go_proxy_handler.go");
    let placeholder = "const nextGoSkipProxyURLNormalize = false";
    ensure!(
        source.contains(placeholder),
        "Go proxy template is missing the skipProxyUrlNormalize placeholder"
    );
    let source = source.replacen(
        placeholder,
        &format!("const nextGoSkipProxyURLNormalize = {skip_proxy_url_normalize}"),
        1,
    );
    let placeholder = "const nextGoProxyBasePath = \"\"";
    ensure!(
        source.contains(placeholder),
        "Go proxy template is missing the basePath placeholder"
    );
    Ok(source.replacen(
        placeholder,
        &format!(
            "const nextGoProxyBasePath = {}",
            serde_json::to_string(base_path)?
        ),
        1,
    ))
}

/// proxy.go only supports App Router applications. Pages Router routing (data
/// requests and locales) would need its own URL normalization in Go to match
/// proxy.ts.
async fn go_proxy_unsupported_reason(project: Vc<Project>) -> Result<Option<RcStr>> {
    let pages = project.pages_project().pages_structure().await?;
    let mut has_pages_routes = false;
    for directory in pages.pages.iter().chain(pages.api.iter()) {
        if pages_directory_has_routes(**directory).await? {
            has_pages_routes = true;
            break;
        }
    }
    if has_pages_routes {
        return Ok(Some(rcstr!(
            "proxy.go is only supported in App Router applications. Move the routes in the pages \
             directory to the app directory, or use proxy.ts."
        )));
    }
    if project.next_config().i18n().await?.is_some() {
        return Ok(Some(rcstr!(
            "proxy.go does not support the i18n configuration, which only applies to the Pages \
             Router. Remove i18n from your Next.js config, or use proxy.ts."
        )));
    }
    Ok(None)
}

/// Whether a pages directory contains a route. `_app`, `_document` and `_error`
/// are not routes.
async fn pages_directory_has_routes(directory: Vc<PagesDirectoryStructure>) -> Result<bool> {
    let directory = directory.await?;
    if !directory.items.is_empty() {
        return Ok(true);
    }
    for child in &directory.children {
        if Box::pin(pages_directory_has_routes(**child)).await? {
            return Ok(true);
        }
    }
    Ok(false)
}

async fn is_adapter_build(project: ResolvedVc<Project>) -> Result<bool> {
    Ok(project.next_mode().await?.is_production()
        && *project.next_config().is_using_adapter().await?)
}

// The owner probes lazily and retains restored cancellation handles. Framework inputs
// are translated here; compiler lifecycle and target invariants belong to turbopack-go.
#[turbo_tasks::function(session_dependent)]
async fn managed_session(
    scope: RcStr,
    owner: ResolvedVc<GoSessionPool>,
    options: GoToolchainOptions,
    watch: bool,
) -> Result<Vc<GoBuildSession>> {
    Ok(*owner.await?.session(scope, options, None, watch).await?)
}

/// Module path for route directories that have no go.mod.
const GO_STANDALONE_MODULE: &str = "next-go-route";

/// Language version for the generated go.mod of route directories without one, taken from the
/// toolchain's `GOVERSION` (such as `go1.26.1`, `go1.26rc1`, or `devel go1.27-abcdef ...` for a
/// development toolchain), so they can use every language feature the installed toolchain
/// supports. Falls back to the minimum supported version.
fn go_language_version(toolchain_version: &str) -> String {
    toolchain_version
        .split_whitespace()
        .find_map(|word| word.strip_prefix("go1."))
        .map(|rest| {
            rest.chars()
                .take_while(|ch| ch.is_ascii_digit())
                .collect::<String>()
        })
        .filter(|minor| !minor.is_empty())
        .map_or_else(|| "1.24".to_owned(), |minor| format!("1.{minor}"))
}

/// Virtual, module-relative directories for a route or proxy package and its generated `main`
/// package.
struct GoPackageAlias {
    package: String,
    entrypoint: String,
}

/// Whether Go accepts `element` in an import path, following
/// `golang.org/x/mod/module.CheckImportPath`.
fn is_go_import_path_element(element: &str) -> bool {
    let short = element.split('.').next().unwrap_or_default();
    let reserved = short.to_ascii_uppercase();
    !element.is_empty()
        && !element.ends_with('.')
        && element
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '.' | '_' | '~' | '+'))
        && !matches!(reserved.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        && !(reserved.len() == 4
            && (reserved.starts_with("COM") || reserved.starts_with("LPT"))
            && reserved.ends_with(|ch: char| matches!(ch, '1'..='9')))
        && !short.rsplit_once('~').is_some_and(|(_, suffix)| {
            !suffix.is_empty() && suffix.bytes().all(|ch| ch.is_ascii_digit())
        })
}

/// Choose virtual package directories with valid import paths for a source directory.
///
/// The package lives in the deepest ancestor-or-self of the source directory whose path is a
/// valid, importable import path. Go only lets a package import `x/internal/...` when the
/// importer's path starts with `x`, and any such `x` the source directory could reach is a
/// valid prefix of it, so this keeps `internal` imports working. The prefix stops before a
/// `vendor` element: in module mode Go refuses to import any path containing one, and nothing
/// below it is importable, so this does not change `internal` visibility. The entrypoint is
/// placed beside the package so it can import it even when that prefix contains an `internal`
/// element. The final name is readable in stack traces and unique per source directory.
fn go_package_alias(source_directory: &str, is_proxy: bool) -> GoPackageAlias {
    let elements: Vec<_> = source_directory
        .split('/')
        .filter(|element| !element.is_empty())
        .collect();
    let valid = elements
        .iter()
        .take_while(|element| **element != "vendor" && is_go_import_path_element(element))
        .count();
    let parent = elements[..valid].join("/");
    let mut name = String::new();
    for ch in elements[valid..].join("/").chars() {
        if ch.is_ascii_alphanumeric() {
            name.push(ch);
        } else if !name.is_empty() && !name.ends_with('_') {
            name.push('_');
        }
    }
    let name = name.trim_end_matches('_');
    let kind = if is_proxy { "proxy" } else { "route" };
    let hash = turbo_tasks_hash::hash_xxh3_hash64(source_directory) as u32;
    let package = if name.is_empty() {
        format!("_next_go_{kind}_{hash:08x}")
    } else {
        format!("_next_go_{kind}_{name}_{hash:08x}")
    };
    let entrypoint = format!("_next_go_main_{hash:08x}");
    let join = |name: String| {
        if parent.is_empty() {
            name
        } else {
            format!("{parent}/{name}")
        }
    };
    GoPackageAlias {
        package: join(package),
        entrypoint: join(entrypoint),
    }
}

#[cfg(test)]
mod go_package_alias_tests {
    use super::*;

    #[test]
    fn aliases_keep_the_longest_valid_import_path_prefix() {
        let hash = |path: &str| turbo_tasks_hash::hash_xxh3_hash64(path) as u32;
        let alias = go_package_alias("app/(group)/native/[id]", false);
        let h = hash("app/(group)/native/[id]");
        assert_eq!(
            alias.package,
            format!("app/_next_go_route_group_native_id_{h:08x}")
        );
        assert_eq!(alias.entrypoint, format!("app/_next_go_main_{h:08x}"));
        let alias = go_package_alias("app/api/hello", false);
        let h = hash("app/api/hello");
        assert_eq!(
            alias.package,
            format!("app/api/hello/_next_go_route_{h:08x}")
        );
        let alias = go_package_alias("", true);
        let h = hash("");
        assert_eq!(alias.package, format!("_next_go_proxy_{h:08x}"));
        assert_eq!(alias.entrypoint, format!("_next_go_main_{h:08x}"));
        let alias = go_package_alias("app/café a 100%/x", false);
        assert!(alias.package.starts_with("app/_next_go_route_caf_a_100_x_"));
        for element in [
            "@slot", "[id]", "(group)", ".", "..", "a.", "CON", "com1.txt", "a~1", "a~12.txt", "",
        ] {
            assert!(!is_go_import_path_element(element), "{element}");
        }
        for element in [
            "api",
            "rss.xml",
            "v1-beta",
            "_private",
            "console",
            "c++",
            "a~b",
            ".hidden",
            ".well-known",
            "a~",
            "com0",
            "lpt0",
        ] {
            assert!(is_go_import_path_element(element), "{element}");
            let directory = format!("app/{element}/[id]");
            let alias = go_package_alias(&directory, false);
            let h = hash(&directory);
            assert_eq!(
                alias.package,
                format!("app/{element}/_next_go_route_id_{h:08x}")
            );
            assert_eq!(
                alias.entrypoint,
                format!("app/{element}/_next_go_main_{h:08x}")
            );
        }
    }

    #[test]
    fn aliases_stop_before_vendor_elements() {
        let hash = |path: &str| turbo_tasks_hash::hash_xxh3_hash64(path) as u32;
        let h = hash("app/vendor/[id]");
        let alias = go_package_alias("app/vendor/[id]", false);
        assert_eq!(
            alias.package,
            format!("app/_next_go_route_vendor_id_{h:08x}")
        );
        assert_eq!(alias.entrypoint, format!("app/_next_go_main_{h:08x}"));
        let h = hash("app/vendor/list");
        let alias = go_package_alias("app/vendor/list", false);
        assert_eq!(
            alias.package,
            format!("app/_next_go_route_vendor_list_{h:08x}")
        );
        let h = hash("vendor");
        assert_eq!(
            go_package_alias("vendor", true).package,
            format!("_next_go_proxy_vendor_{h:08x}")
        );
        // Only the exact element is special to Go.
        let h = hash("app/vendors/list");
        assert_eq!(
            go_package_alias("app/vendors/list", false).package,
            format!("app/vendors/list/_next_go_route_{h:08x}")
        );
    }

    #[test]
    fn standalone_module_uses_the_toolchain_language_version() {
        assert_eq!(go_language_version("go1.26.11"), "1.26");
        assert_eq!(go_language_version("go1.25rc2"), "1.25");
        assert_eq!(go_language_version("go1.24"), "1.24");
        assert_eq!(go_language_version("devel go1.27-abcdef"), "1.27");
        assert_eq!(
            go_language_version("devel go1.27-abcdef Tue Nov 3 12:00:00 2026 +0000"),
            "1.27"
        );
        assert_eq!(go_language_version("devel +abcdef"), "1.24");
    }
}

#[turbo_tasks::value]
struct GoRouteIssue {
    path: FileSystemPath,
    message: RcStr,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for GoRouteIssue {
    fn stage(&self) -> IssueStage {
        IssueStage::CodeGen
    }
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }
    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.path.clone())
    }
    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(
            format!("Unable to compile {}", self.path.file_name()).into(),
        ))
    }
    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Text(self.message.clone())))
    }
}

/// Decodes `%XX` escapes exactly once, as Go's `url.PathUnescape` does when a production Go
/// executable reads the route header. Returns `None` where Go fails: an invalid escape, or a
/// result that is not UTF-8 and so cannot be a route ID.
fn go_path_unescape(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let hex = bytes.get(index + 1..index + 3)?;
            if !hex.iter().all(u8::is_ascii_hexdigit) {
                return None;
            }
            decoded.push(u8::from_str_radix(std::str::from_utf8(hex).ok()?, 16).ok()?);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded).ok()
}

/// Pairs `(spelled, decoded)` of distinct Go route IDs where decoding `spelled` once yields
/// `decoded`, such as a literal `/x/%5Bid%5D` folder beside a dynamic `/x/[id]` route.
///
/// A production executable selects a route by its percent-encoded ID and decodes the header
/// exactly once, so Next.js and conforming adapters always select the right route. An adapter
/// that sent `spelled` without encoding it would select `decoded` instead, a different handler
/// than the one it authorized, so such IDs are rejected at build time.
fn go_route_id_collisions<'a>(ids: &[&'a str]) -> Vec<(&'a str, &'a str)> {
    let known: std::collections::BTreeSet<&str> = ids.iter().copied().collect();
    let mut collisions = vec![];
    for &id in ids {
        if let Some(decoded) = go_path_unescape(id)
            && decoded != id
            && let Some(&other) = known.get(decoded.as_str())
        {
            collisions.push((id, other));
        }
    }
    collisions
}

/// Virtual directory of the adapter entrypoint that serves every route, relative to the Go
/// module root. It lies outside every `internal` tree.
const GO_ROUTES_ENTRYPOINT_DIRECTORY: &str = "_next_go_main_routes";

/// Make the route package at module-relative `alias` importable from
/// [`GO_ROUTES_ENTRYPOINT_DIRECTORY`].
///
/// Go lets only packages below `x` import a path containing `x/internal`, and every `internal`
/// element of a path applies. For each `internal` element of `alias`, from the deepest to the
/// shallowest, a generated package beside that element re-exports the package below it. Returns
/// the module-relative package to import, which is `alias` when it has no `internal` element,
/// and the generated files.
fn go_internal_shims(module_path: &str, alias: &str) -> Result<(String, Vec<(String, String)>)> {
    let elements: Vec<&str> = alias.split('/').collect();
    let mut import = alias.to_owned();
    let mut shims = vec![];
    for (index, _) in elements
        .iter()
        .enumerate()
        .rev()
        .filter(|(_, element)| **element == "internal")
    {
        let hash = turbo_tasks_hash::hash_xxh3_hash64(&import) as u32;
        let name = format!("_next_go_shim_{hash:08x}");
        let shim = if index == 0 {
            name
        } else {
            format!("{}/{name}", elements[..index].join("/"))
        };
        shims.push((
            format!("{shim}/zz_next_route_shim.go"),
            include_str!("templates/go_route_shim.go").replace(
                "\"__NEXT_GO_ROUTE_IMPORT__\"",
                &serde_json::to_string(&format!("{module_path}/{import}"))?,
            ),
        ));
        import = shim;
    }
    Ok((import, shims))
}

/// Session for Go compilation in this project. Framework inputs are translated here.
async fn go_session(project: ResolvedVc<Project>) -> Result<Vc<GoBuildSession>> {
    let owner = project
        .await?
        .go_sessions
        .context("native Go compilation is not enabled")?;
    let scope = to_sys_path(project.project_root_path().owned().await?)
        .await?
        .context("native Go compilation requires a disk filesystem")?;
    let scope: RcStr = scope.to_str().context("non-UTF8 Go project")?.into();
    let options = GoToolchainOptions {
        go: std::env::var("TURBOPACK_GO")
            .unwrap_or_else(|_| "go".into())
            .into(),
        tags: rcstr!(""),
        poll_interval_ms: *project.watch_poll_interval_ms().await?,
    };
    let watch = *project.is_watch_enabled().await?;
    Ok(managed_session(scope, *owner, options, watch))
}

/// A route or proxy directory analyzed as an importable package, with the generated files that
/// join it.
struct GoPackage {
    sources: ResolvedVc<GoSourceSet>,
    directory: FileSystemPath,
    /// The route ID, without `basePath`: the adapter output ID and the key that selects the
    /// route in a production executable. Written to the route's `.native.json` descriptor.
    /// Empty for proxies.
    route_id: String,
    handler: String,
    dispatch: String,
}

enum GoPackageAnalysis {
    Ready(GoPackage),
    Failed(Option<turbopack_go::GoBundleResult>),
}

/// Analyze the directory of `path`, retaining input validation for reported failures.
async fn analyze_go_package(
    project: ResolvedVc<Project>,
    session: Vc<GoBuildSession>,
    path: &FileSystemPath,
    kind: &GoEndpointKind,
) -> Result<GoPackageAnalysis> {
    let is_proxy = matches!(kind, GoEndpointKind::Proxy);
    let directory = path.parent();
    let sources = go_source_set(
        project.project_root_path().owned().await?,
        directory.clone(),
        GoSourceSelection::Directory,
        session,
    )
    .to_resolved()
    .await?;
    let source_set = sources.await?;
    // A removed or replaced handler must publish nothing, including when helper files still
    // form a valid package. Otherwise it can overwrite the replacement endpoint's manifests.
    // The source set tracks directory membership, so recreating the handler invalidates this.
    let handler_name = source_set
        .root
        .get_path_to(path)
        .context("Go handler outside module")?;
    if !source_set.files.contains_key(handler_name) {
        if matches!(*path.get_type().await?, FileSystemEntryType::Error) {
            bail!("Unable to read the Go handler {path}");
        }
        return Ok(GoPackageAnalysis::Failed(None));
    }
    let analysis = go_declarations(*sources, session).await?;
    // Next.js owns the program entrypoint. It imports the route directory as an ordinary
    // package, so that directory cannot be a program itself. Only files Go selects count:
    // `//go:build ignore` generators commonly use `package main`.
    if analysis.selected_packages.iter().any(|name| name == "main") {
        let (file, suggestion) = if is_proxy {
            ("proxy.go", "proxy")
        } else {
            ("route.go", "route")
        };
        let message: RcStr = format!(
            "{file} must not use `package main`. Next.js generates the program entrypoint and \
             imports this directory as a package. Rename the package in every .go file in this \
             directory, for example to `package {suggestion}`."
        )
        .into();
        GoRouteIssue {
            path: path.clone(),
            message: message.clone(),
        }
        .resolved_cell()
        .emit();
        let build = (*go_source_failure(*sources, session, message).await?).clone();
        return Ok(GoPackageAnalysis::Failed(Some(build)));
    }
    // Files that disagree are reported by the compiler.
    let package = analysis
        .selected_packages
        .first()
        .map_or("route", |name| name.as_str());
    if is_proxy {
        ensure!(
            analysis
                .selected_functions
                .iter()
                .any(|name| name == "Proxy"),
            "proxy.go must export func Proxy(http.ResponseWriter, *http.Request)"
        );
    }
    let methods = analysis.selected_functions.iter().filter(|name| {
        matches!(
            name.as_str(),
            "GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS"
        )
    });
    let declarations = methods
        .map(|method| format!("\t\"{method}\": {method},"))
        .collect::<Vec<_>>()
        .join("\n");
    let dispatch = include_str!("templates/go_route_dispatch.go")
        .replace("__NEXT_GO_PACKAGE__", package)
        .replace("\t// __NEXT_GO_ROUTE_METHODS__", &declarations);
    let base_path = project.next_config().base_path().await?;
    let (route_id, route_pattern) = match kind {
        GoEndpointKind::Route { page } => {
            let id = AppPath::from(page.clone()).to_string();
            let pattern = format!("{}{id}", base_path.as_deref().unwrap_or(""));
            (id, pattern)
        }
        GoEndpointKind::Proxy => (String::new(), String::new()),
    };
    let handler = if is_proxy {
        go_proxy_handler_source(
            *project.next_config().skip_proxy_url_normalize().await?,
            base_path.as_deref().unwrap_or(""),
        )?
    } else {
        include_str!("templates/go_route_handler.go").replace(
            "\"__NEXT_GO_ROUTE_PATTERN__\"",
            &serde_json::to_string(&route_pattern)?,
        )
    }
    .replace("__NEXT_GO_PACKAGE__", package);
    Ok(GoPackageAnalysis::Ready(GoPackage {
        sources,
        directory,
        route_id,
        handler,
        dispatch,
    }))
}

/// Whether a Go diagnostic names a file directly inside `directory`, given as an absolute path
/// or relative to the directory Go ran in.
fn go_diagnostic_mentions_directory(message: &str, directories: &[String]) -> bool {
    message.lines().any(|line| {
        directories.iter().any(|directory| {
            ['/', std::path::MAIN_SEPARATOR]
                .into_iter()
                .any(|separator| {
                    let prefix = format!("{directory}{separator}");
                    line.match_indices(&prefix).any(|(index, _)| {
                        // A relative directory must not match the tail of a longer path.
                        let boundary = line[..index]
                            .chars()
                            .next_back()
                            .is_none_or(|ch| ch.is_whitespace() || matches!(ch, '"' | '(' | ':'));
                        let rest = &line[index + prefix.len()..];
                        boundary
                            && rest.find(".go:").is_some_and(|end| {
                                rest.find(['/', std::path::MAIN_SEPARATOR])
                                    .is_none_or(|slash| slash > end)
                            })
                    })
                })
        })
    })
}

/// The executable that serves every App Router `route.go` in a production build.
#[turbo_tasks::value(shared)]
struct GoRoutesBundle {
    /// Source handlers included in the executable.
    routes: Vec<FileSystemPath>,
    /// File name below `server/`, when compilation succeeded.
    executable_name: Option<RcStr>,
    executable: Option<ResolvedVc<Box<dyn OutputAsset>>>,
    build: Option<turbopack_go::GoBundleResult>,
}

/// Compile every App Router `route.go` of a production build into one executable. Each route
/// endpoint reads this task, so Go compiles once, and every route output references the same
/// executable. Issues are attributed to the route files.
///
/// The executable never selects a route by path. With an adapter, the adapter selects the output
/// per process or per request (`go_routes_adapter_main.go`). With `next start`, Next.js routes
/// the request and names the selected route in an authenticated header (`go_routes_main.go`).
#[turbo_tasks::function]
async fn go_routes_bundle(project: ResolvedVc<Project>) -> Result<Vc<GoRoutesBundle>> {
    let failed = |build: Option<turbopack_go::GoBundleResult>| {
        GoRoutesBundle {
            routes: vec![],
            executable_name: None,
            executable: None,
            build,
        }
        .cell()
    };
    let app_project =
        (*project.app_project().await?).context("route.go requires an app directory")?;
    let mut routes = vec![];
    for entrypoint in app_project.app_entrypoints().await?.values() {
        if let AppEntrypoint::AppGoRoute { page, path, .. } = entrypoint {
            routes.push((page.clone(), path.clone()));
        }
    }
    ensure!(!routes.is_empty(), "no route.go handlers to compile");
    let session = go_session(project).await?;
    let go_session = session.await?;
    let mut packages = vec![];
    let mut blocked = false;
    let mut failed_build = None;
    for (page, path) in &routes {
        match analyze_go_package(
            project,
            session,
            path,
            &GoEndpointKind::Route { page: page.clone() },
        )
        .await?
        {
            GoPackageAnalysis::Ready(package) => packages.push((path.clone(), package)),
            GoPackageAnalysis::Failed(build) => {
                blocked = true;
                if failed_build.is_none() {
                    failed_build = build;
                }
            }
        }
    }
    if blocked {
        return Ok(failed(failed_build));
    }
    let ids = packages
        .iter()
        .map(|(_, package)| package.route_id.as_str())
        .collect::<Vec<_>>();
    let collisions = go_route_id_collisions(&ids);
    if !collisions.is_empty() {
        for (spelled, decoded) in collisions {
            for (path, package) in &packages {
                if package.route_id != spelled && package.route_id != decoded {
                    continue;
                }
                GoRouteIssue {
                    path: path.clone(),
                    message: format!(
                        "The Go route {spelled} is the percent-encoded spelling of the Go route \
                         {decoded}. Production builds compile every route.go into one executable \
                         that selects a route by its percent-encoded route ID, so these two \
                         routes cannot be told apart reliably. Rename the folder so that its name \
                         contains no percent-encoded characters."
                    )
                    .into(),
                }
                .resolved_cell()
                .emit();
            }
        }
        return Ok(failed(None));
    }
    let source_root = project.project_root_path().owned().await?;
    let display = |path: &FileSystemPath| -> String {
        if *path == source_root {
            ".".to_owned()
        } else {
            source_root
                .get_path_to(path)
                .map_or_else(|| path.path.to_string(), str::to_owned)
        }
    };
    // Go builds one main module. Routes in different modules would need a workspace, which
    // turbopack-go does not support, so require that every route shares one module.
    let mut sets = vec![];
    for (_, package) in &packages {
        sets.push(package.sources.await?);
    }
    let module = |sources: &GoSourceSet| {
        if sources.has_go_mod {
            format!("the Go module at {}/go.mod", display(&sources.root))
        } else {
            "no Go module (no go.mod)".to_owned()
        }
    };
    let modules: BTreeMap<String, Vec<String>> =
        packages
            .iter()
            .zip(&sets)
            .fold(BTreeMap::new(), |mut modules, ((_, package), sources)| {
                modules
                    .entry(module(sources))
                    .or_default()
                    .push(display(&package.directory));
                modules
            });
    if modules.len() > 1 {
        for ((path, package), sources) in packages.iter().zip(&sets) {
            let own = module(sources);
            let others = modules
                .iter()
                .filter(|(module, _)| **module != own)
                .map(|(module, directories)| format!("{} ({module})", directories.join(", ")))
                .collect::<Vec<_>>()
                .join("; ");
            GoRouteIssue {
                path: path.clone(),
                message: format!(
                    "Production builds compile every route.go into one executable, so all \
                     route.go directories must belong to one Go module. {} uses {own}, but other \
                     routes use a different module: {others}. Move these routes into one module, \
                     for example by using a single go.mod at the project root.",
                    display(&package.directory)
                )
                .into(),
            }
            .resolved_cell()
            .emit();
        }
        return Ok(failed(None));
    }
    let mut generated = BTreeMap::new();
    let module_path = match (&sets[0].module_path, sets[0].has_go_mod) {
        (Some(module_path), _) => module_path.clone(),
        // A go.mod without a module directive is reported by Go.
        (None, true) => RcStr::from(GO_STANDALONE_MODULE),
        (None, false) => {
            // Directories without go.mod share a generated module at their common ancestor.
            generated.insert(
                rcstr!("go.mod"),
                RcStr::from(format!(
                    "module {GO_STANDALONE_MODULE}\n\ngo {}\n",
                    go_language_version(&go_session.go_context.version)
                )),
            );
            RcStr::from(GO_STANDALONE_MODULE)
        }
    };
    // Go runs from the module root, or from the common ancestor of directories without a
    // go.mod. Aliases and generated paths are relative to it.
    let root = go_packages_root(&sets.iter().map(|sources| &**sources).collect::<Vec<_>>())?;
    let mut aliased = vec![];
    let mut aliases = BTreeMap::new();
    for (_, package) in &packages {
        let directory = if package.directory == root {
            ""
        } else {
            root.get_path_to(&package.directory)
                .context("Go route outside module")?
        };
        // The same package path as a single-route build, so `internal` imports behave the same.
        let alias = go_package_alias(directory, false).package;
        generated.insert(
            RcStr::from(format!("{alias}/zz_next_route_handler.go")),
            RcStr::from(package.handler.as_str()),
        );
        generated.insert(
            RcStr::from(format!("{alias}/zz_next_route_dispatch.go")),
            RcStr::from(package.dispatch.as_str()),
        );
        // The entrypoint lives outside every `internal` tree. Route packages inside one are
        // imported through generated re-exporting packages.
        let (import, shims) = go_internal_shims(&module_path, &alias)?;
        generated.extend(
            shims
                .into_iter()
                .map(|(path, source)| (RcStr::from(path), RcStr::from(source))),
        );
        aliases.insert(RcStr::from(alias.as_str()), package.sources);
        aliased.push((import, package));
    }
    aliased.sort_by(|(_, a), (_, b)| a.route_id.cmp(&b.route_id));
    // Next.js authenticates requests to a `next start` worker and replaces client-supplied
    // x-next-internal-* headers. Adapter servers receive requests from the platform instead.
    let adapter = is_adapter_build(project).await?;
    let trust_internal_headers = !adapter;
    let mut imports = vec![];
    let mut table = vec![];
    for (index, (import, package)) in aliased.iter().enumerate() {
        imports.push(format!(
            "\tnextroute{index} {}",
            serde_json::to_string(&format!("{module_path}/{import}"))?
        ));
        table.push(format!(
            "\t\t{}: nextroute{index}.NextInternalGoHandler({trust_internal_headers}),",
            serde_json::to_string(&package.route_id)?
        ));
    }
    generated.insert(
        RcStr::from(format!("{GO_ROUTES_ENTRYPOINT_DIRECTORY}/main.go")),
        RcStr::from(
            if adapter {
                include_str!("templates/go_routes_adapter_main.go")
            } else {
                include_str!("templates/go_routes_main.go")
            }
            .replace("\t// __NEXT_GO_ROUTE_IMPORTS__", &imports.join("\n"))
            .replace("\t\t// __NEXT_GO_ROUTES__", &table.join("\n")),
        ),
    );
    let result = go_packages_bundle_from_sources(
        aliases,
        session,
        RcStr::from(GO_ROUTES_ENTRYPOINT_DIRECTORY),
        generated,
    )
    .await?;
    ensure!(
        result.is_current().await?,
        "Go route inputs changed during compilation; retry the request"
    );
    let content = match &result.outcome {
        GoBuildOutcome::Success(content) => *content,
        GoBuildOutcome::Failed(message) => {
            // Attribute the diagnostic to the routes whose files it names. A failure elsewhere,
            // such as in a shared package, affects every route.
            // Relative diagnostic paths are relative to the directory Go ran in.
            let mut directories = vec![];
            for (_, package) in &packages {
                directories.push(to_sys_path(package.directory.clone()).await?);
            }
            let module_root = to_sys_path(root.clone()).await?;
            let mut attributed = vec![];
            for ((path, _), directory) in packages.iter().zip(&directories) {
                let mut names = vec![];
                if let Some(directory) = directory {
                    names.push(directory.to_string_lossy().into_owned());
                    if let Some(relative) = module_root
                        .as_ref()
                        .and_then(|root| directory.strip_prefix(root).ok())
                        .filter(|relative| !relative.as_os_str().is_empty())
                    {
                        names.push(relative.to_string_lossy().into_owned());
                    }
                }
                if go_diagnostic_mentions_directory(message, &names) {
                    attributed.push(path.clone());
                }
            }
            if attributed.is_empty() {
                attributed = packages.iter().map(|(path, _)| path.clone()).collect();
            }
            for path in attributed {
                GoRouteIssue {
                    path,
                    message: message.clone(),
                }
                .resolved_cell()
                .emit();
            }
            return Ok(failed(Some((*result).clone())));
        }
        GoBuildOutcome::Retry => {
            bail!("Go inputs changed during compilation; retry the request")
        }
        GoBuildOutcome::Cancelled => bail!("Go compilation cancelled"),
    };
    let hash = AssetContent::file(*content)
        .hash(no_hash_salt(), HashAlgorithm::Xxh3Hash128Hex)
        .await?;
    let executable_name: RcStr =
        format!("go-routes-{hash}{}", go_session.go_context.exe_suffix).into();
    let node_root = project.node_root().owned().await?;
    let output_root = to_sys_path(node_root.clone())
        .await?
        .context("native Go output requires a disk filesystem")?;
    ensure!(
        !result.is_input(&output_root.join(format!("server/{executable_name}")))?,
        "native output would overwrite a Go input"
    );
    let executable: ResolvedVc<Box<dyn OutputAsset>> = ResolvedVc::upcast(
        VirtualOutputAsset::new(
            node_root.join(&format!("server/{executable_name}"))?,
            AssetContent::file(*content),
        )
        .to_resolved()
        .await?,
    );
    Ok(GoRoutesBundle {
        routes: routes.into_iter().map(|(_, path)| path).collect(),
        executable_name: Some(executable_name),
        executable: Some(executable),
        build: Some((*result).clone()),
    }
    .cell())
}

#[turbo_tasks::value_impl]
impl Endpoint for GoEndpoint {
    #[turbo_tasks::function]
    async fn output(self: Vc<Self>) -> Result<Vc<EndpointOutput>> {
        let this = self.await?;
        let project = this.project;
        let is_proxy = matches!(this.kind, GoEndpointKind::Proxy);
        let native_failed = |build: Option<turbopack_go::GoBundleResult>| async move {
            Ok::<_, anyhow::Error>(
                EndpointOutput {
                    project,
                    output_assets: OutputAssets::empty().to_resolved().await?,
                    output_paths: EndpointOutputPaths::NativeFailed { build }.resolved_cell(),
                    first_load_chunks: None,
                }
                .cell(),
            )
        };
        if !*project.next_config().go_routes().await? {
            GoRouteIssue {
                path: this.path.clone(),
                message: if is_proxy {
                    rcstr!("proxy.go requires experimental.goRoutes: true")
                } else {
                    rcstr!("route.go requires experimental.goRoutes: true")
                },
            }
            .resolved_cell()
            .emit();
            return native_failed(None).await;
        }
        if is_proxy && let Some(message) = go_proxy_unsupported_reason(*project).await? {
            GoRouteIssue {
                path: this.path.clone(),
                message,
            }
            .resolved_cell()
            .emit();
            return native_failed(None).await;
        }
        let session = go_session(project).await?;
        let go_session = session.await?;
        let package = match analyze_go_package(project, session, &this.path, &this.kind).await? {
            GoPackageAnalysis::Ready(package) => package,
            GoPackageAnalysis::Failed(build) => return native_failed(build).await,
        };
        // The route ID that selects this route's handler in a production executable. It is
        // written to the descriptor, so the server and adapters never derive it again.
        let route_id = package.route_id.clone();
        let node_root = project.node_root().owned().await?;
        let (executable, executable_asset, result) = if !is_proxy
            && project.next_mode().await?.is_production()
        {
            // Production builds serve every route.go from one executable. The adapter or the
            // `next start` server selects the route; the executable never selects it by path.
            // Development compiles each route on its own, so an edit rebuilds only that route.
            let bundle = go_routes_bundle(*project).await?;
            // The endpoint can outlive its entry in the shared build's route list.
            if bundle.executable.is_some() && !bundle.routes.contains(&this.path) {
                return native_failed(None).await;
            }
            match (&bundle.executable_name, bundle.executable, &bundle.build) {
                (Some(name), Some(asset), Some(build)) => (name.clone(), asset, build.clone()),
                _ => return native_failed(bundle.build.clone()).await,
            }
        } else {
            let source_set = package.sources.await?;
            let module_root = source_set.root.clone();
            let directory = package.directory.clone();
            // The route directory is overlaid at a virtual directory with a valid import path,
            // since segments such as `[id]` or `(group)` are not. Nothing is written to the
            // project.
            let source_directory = if module_root == directory {
                ""
            } else {
                module_root
                    .get_path_to(&directory)
                    .context("Go route outside module")?
            };
            // See `go_package_alias` for how `internal` imports keep working.
            let GoPackageAlias {
                package: alias,
                entrypoint,
            } = go_package_alias(source_directory, is_proxy);
            let mut generated = BTreeMap::new();
            let import_path = match &source_set.module_path {
                Some(module_path) => format!("{module_path}/{alias}"),
                None => {
                    // A directory without go.mod gets a module so the entrypoint can import it.
                    generated.insert(
                        rcstr!("go.mod"),
                        RcStr::from(format!(
                            "module {GO_STANDALONE_MODULE}\n\ngo {}\n",
                            go_language_version(&go_session.go_context.version)
                        )),
                    );
                    format!("{GO_STANDALONE_MODULE}/{alias}")
                }
            };
            // All executables extract parameters from the selected destination URL.
            // Only the entrypoint's listener, authentication and process lifetime differ.
            let wrapper = if is_adapter_build(project).await? {
                include_str!("templates/go_route_adapter_main.go")
            } else {
                include_str!("templates/go_route_main.go")
            }
            .replace(
                "\"__NEXT_GO_ROUTE_IMPORT__\"",
                &serde_json::to_string(&import_path)?,
            );
            generated.extend([
                (
                    RcStr::from(format!("{alias}/zz_next_route_handler.go")),
                    RcStr::from(package.handler),
                ),
                (
                    RcStr::from(format!("{alias}/zz_next_route_dispatch.go")),
                    RcStr::from(package.dispatch),
                ),
                (
                    RcStr::from(format!("{entrypoint}/main.go")),
                    RcStr::from(wrapper),
                ),
            ]);
            let result =
                go_package_bundle_from_sources(*package.sources, session, alias.into(), generated)
                    .await?;
            // A stale compile invalidates this task. Leave the retry to request-side
            // validation instead of failing the development change subscription.
            if matches!(result.outcome, GoBuildOutcome::Retry) || !result.is_current().await? {
                ensure!(
                    *project.is_watch_enabled().await?,
                    "Go route inputs changed during compilation; run the build again"
                );
                return native_failed(Some((*result).clone())).await;
            }
            let content = match &result.outcome {
                GoBuildOutcome::Success(content) => *content,
                GoBuildOutcome::Failed(message) => {
                    GoRouteIssue {
                        path: this.path.clone(),
                        message: message.clone(),
                    }
                    .resolved_cell()
                    .emit();
                    return native_failed(Some((*result).clone())).await;
                }
                GoBuildOutcome::Retry => {
                    bail!("Go inputs changed during compilation; retry the request")
                }
                GoBuildOutcome::Cancelled => bail!("Go compilation cancelled"),
            };
            let hash = AssetContent::file(*content)
                .hash(no_hash_salt(), HashAlgorithm::Xxh3Hash128Hex)
                .await?;
            let output_name = match &this.kind {
                GoEndpointKind::Route { page } => format!("app{page}"),
                GoEndpointKind::Proxy => "middleware".to_owned(),
            };
            let executable: RcStr =
                format!("{output_name}-{hash}{}", go_session.go_context.exe_suffix).into();
            let asset: ResolvedVc<Box<dyn OutputAsset>> = ResolvedVc::upcast(
                VirtualOutputAsset::new(
                    node_root.join(&format!("server/{executable}"))?,
                    AssetContent::file(*content),
                )
                .to_resolved()
                .await?,
            );
            (executable, asset, (*result).clone())
        };
        let original_name = match &this.kind {
            GoEndpointKind::Route { page } => page.to_string(),
            GoEndpointKind::Proxy => String::new(),
        };
        let output_name = if is_proxy {
            "middleware".to_owned()
        } else {
            format!("app{original_name}")
        };
        let entry = format!("{output_name}.native.json");
        let mut descriptor = serde_json::json!({ "executable": executable, "goos": go_session.go_context.goos, "goarch": go_session.go_context.goarch });
        if is_proxy {
            descriptor["source"] =
                serde_json::to_value(project.project_path().await?.get_path_to(&this.path))?;
        } else {
            descriptor["route"] = serde_json::Value::String(route_id);
        }
        let output_root = to_sys_path(node_root.clone())
            .await?
            .context("native Go output requires a disk filesystem")?;
        for path in [
            format!("server/{executable}"),
            format!("server/{entry}"),
            format!("server/{entry}.nft.json"),
            format!("server/app{original_name}/app-paths-manifest.json"),
        ] {
            ensure!(
                !result.is_input(&output_root.join(path))?,
                "native output would overwrite a Go input"
            );
        }
        let descriptor_path = node_root.join(&format!("server/{entry}"))?;
        let executable_path = node_root.join(&format!("server/{executable}"))?;
        let trace = serde_json::json!({ "version": 1, "files": [descriptor_path.parent().get_relative_path_to(&executable_path).context("native executable outside descriptor filesystem")?] });
        let mut assets = vec![
            ResolvedVc::upcast(
                VirtualOutputAsset::new(
                    node_root.join(&format!("server/{entry}.nft.json"))?,
                    AssetContent::file(
                        FileContent::Content(File::from(serde_json::to_string(&trace)?)).cell(),
                    ),
                )
                .to_resolved()
                .await?,
            ),
            executable_asset,
            ResolvedVc::upcast(
                VirtualOutputAsset::new(
                    descriptor_path,
                    AssetContent::file(
                        FileContent::Content(File::from(serde_json::to_string(&descriptor)?))
                            .cell(),
                    ),
                )
                .to_resolved()
                .await?,
            ),
        ];
        if is_proxy {
            // This partial manifest lists Edge functions only. Like Node.js proxies,
            // Go proxies emit an empty manifest so the manifest loader clears any
            // previous Edge entry when the proxy changes runtime in development.
            let middleware_manifest = MiddlewaresManifestV2::default();
            assets.push(ResolvedVc::upcast(
                VirtualOutputAsset::new(
                    node_root.join("server/middleware/middleware-manifest.json")?,
                    AssetContent::file(
                        FileContent::Content(File::from(serde_json::to_string_pretty(
                            &middleware_manifest,
                        )?))
                        .cell(),
                    ),
                )
                .to_resolved()
                .await?,
            ));
        } else {
            assets.push(create_app_paths_manifest(node_root, &original_name, entry.into()).await?);
        }
        // Validate again before these assets are offered to the output writer.
        ensure!(
            result.is_current().await?,
            "Go route inputs changed before publication"
        );
        Ok(EndpointOutput {
            project,
            output_assets: Vc::<OutputAssets>::cell(assets).to_resolved().await?,
            output_paths: EndpointOutputPaths::Native {
                executable_path: executable,
                build: result,
            }
            .resolved_cell(),
            first_load_chunks: None,
        }
        .cell())
    }
    #[turbo_tasks::function]
    async fn server_changed(self: Vc<Self>) -> Result<Vc<Completion>> {
        Ok(self
            .project()
            .server_changed(*self.output().await?.output_assets))
    }
    #[turbo_tasks::function]
    fn client_changed(self: Vc<Self>) -> Vc<Completion> {
        Completion::immutable()
    }
    #[turbo_tasks::function]
    fn entries(self: Vc<Self>) -> Vc<GraphEntries> {
        GraphEntries::empty()
    }
    #[turbo_tasks::function]
    fn module_graphs(self: Vc<Self>) -> Vc<ModuleGraphs> {
        Vc::cell(vec![])
    }
    #[turbo_tasks::function]
    fn project(&self) -> Vc<Project> {
        *self.project
    }
    #[turbo_tasks::function]
    fn traced_files(self: Vc<Self>) -> Vc<FileSystemPathVec> {
        Vc::cell(vec![])
    }
}

#[derive(Copy, Clone, PartialEq, Eq, Debug, NonLocalValue, Encode, Decode)]
enum AppPageEndpointType {
    Html,
    RscHmr,
}

#[derive(Clone, PartialEq, Eq, Debug, NonLocalValue, Encode, Decode)]
enum AppEndpointType {
    Page {
        ty: AppPageEndpointType,
        loader_tree: ResolvedVc<AppPageLoaderTree>,
    },
    Route {
        path: FileSystemPath,
    },
    Metadata {
        metadata: MetadataItem,
    },
}

#[turbo_tasks::value]
struct AppEndpoint {
    ty: AppEndpointType,
    app_project: ResolvedVc<AppProject>,
    page: AppPage,
}

#[turbo_tasks::value_impl]
impl AppEndpoint {
    #[turbo_tasks::function]
    async fn app_page_entry(&self, loader_tree: Vc<AppPageLoaderTree>) -> Result<Vc<AppEntry>> {
        Ok(get_app_page_entry(
            self.app_project.rsc_module_context(),
            self.app_project.edge_rsc_module_context(),
            loader_tree,
            self.page.clone(),
            self.app_project.project().project_path().owned().await?,
            self.app_project.project().next_config(),
        ))
    }

    #[turbo_tasks::function]
    async fn app_route_entry(
        &self,
        path: FileSystemPath,
        next_config: Vc<NextConfig>,
    ) -> Result<Vc<AppEntry>> {
        Ok(get_app_route_entry(
            self.app_project.route_module_context(),
            self.app_project.edge_route_module_context(),
            Vc::upcast(FileSource::new(path)),
            self.page.clone(),
            self.app_project.project().project_path().owned().await?,
            // Route Handlers only use their own exports, not ancestor layout configuration.
            None,
            next_config,
        ))
    }

    #[turbo_tasks::function]
    async fn app_metadata_entry(
        &self,
        metadata: MetadataItem,
        next_config: Vc<NextConfig>,
    ) -> Result<Vc<AppEntry>> {
        Ok(get_app_metadata_route_entry(
            self.app_project.route_module_context(),
            self.app_project.edge_route_module_context(),
            self.app_project.project().project_path().owned().await?,
            self.page.clone(),
            *self.app_project.project().next_mode().await?,
            metadata,
            next_config,
        ))
    }

    #[turbo_tasks::function]
    async fn app_endpoint_entry(self: Vc<Self>) -> Result<Vc<AppEntry>> {
        let this = self.await?;

        let next_config = self.await?.app_project.project().next_config();
        let app_entry = match &this.ty {
            AppEndpointType::Page { loader_tree, .. } => self.app_page_entry(**loader_tree),
            AppEndpointType::Route { path } => self.app_route_entry(path.clone(), next_config),
            AppEndpointType::Metadata { metadata } => {
                self.app_metadata_entry(metadata.clone(), next_config)
            }
        };

        Ok(app_entry)
    }

    #[turbo_tasks::function]
    async fn output(self: Vc<Self>) -> Result<Vc<AppEndpointOutput>> {
        let this = self.await?;
        let project = this.app_project.project();

        let app_entry = self.app_endpoint_entry().await?;

        #[derive(Debug, PartialEq, Eq)]
        enum EmitManifests {
            /// Don't emit any manifests (needed for the RSC endpoints)
            None,
            /// Emit the manifest for basic Next.js functionality
            Minimal,
            /// All manifests: `Minimal` plus next-font, next-dynamic, ...
            Full,
        }
        let (process_client_assets, process_ssr, emit_manifests, emit_rsc_manifests) =
            match &this.ty {
                AppEndpointType::Page { ty, .. } => (
                    true,
                    matches!(ty, AppPageEndpointType::Html),
                    if matches!(ty, AppPageEndpointType::Html) {
                        EmitManifests::Full
                    } else {
                        EmitManifests::None
                    },
                    matches!(ty, AppPageEndpointType::Html),
                ),
                AppEndpointType::Route { .. } => (false, false, EmitManifests::Minimal, true),
                AppEndpointType::Metadata { metadata } => (
                    false,
                    false,
                    EmitManifests::Minimal,
                    matches!(metadata, MetadataItem::Dynamic { .. }),
                ),
            };

        let node_root = project.node_root().owned().await?;
        let client_relative_path = project.client_relative_path().owned().await?;
        let server_path = node_root.join("server")?;

        let mut server_assets = fxindexset![];
        let mut client_assets = fxindexset![];
        // assets to add to the middleware manifest (to be loaded in the edge runtime).
        let mut middleware_assets = fxindexset![];

        let runtime = app_entry.config.await?.runtime.unwrap_or_default();

        let rsc_entry = app_entry.rsc_entry;

        let is_app_page = matches!(this.ty, AppEndpointType::Page { .. });

        let module_graphs = this
            .app_project
            .app_module_graphs(
                self,
                *rsc_entry,
                // We only need the client runtime entries for pages not for Route Handlers
                is_app_page.then(|| this.app_project.client_runtime_entries()),
            )
            .await?;

        let client_chunking_context = project.client_chunking_context().to_resolved().await?;

        let ssr_chunking_context = if process_ssr {
            Some(
                match runtime {
                    NextRuntime::NodeJs => Vc::upcast(project.server_chunking_context(
                        true, // client_assets
                        true, // supports_lazy_dynamic_imports
                    )),
                    NextRuntime::Edge => this
                        .app_project
                        .project()
                        .edge_chunking_context(process_client_assets),
                }
                .to_resolved()
                .await?,
            )
        } else {
            None
        };

        let per_page_module_graph = *project.per_page_module_graph().await?;

        let next_dynamic_imports =
            NextDynamicGraphs::new(*module_graphs.base, per_page_module_graph)
                .get_next_dynamic_imports_for_endpoint(*rsc_entry)
                .await?;

        let client_references =
            ClientReferencesGraphs::new(*module_graphs.base, per_page_module_graph)
                .get_client_references_for_endpoint(
                    *rsc_entry,
                    matches!(this.ty, AppEndpointType::Page { .. }),
                    /* include_traced */ *project.should_trace().await?,
                    /* include_binding_usage */ project.next_mode().await?.is_production(),
                )
                .to_resolved()
                .await?;

        // We only need the client runtime entries for pages not for Route Handlers
        let (
            availability_info,
            client_shared_chunks,
            client_shared_chunks_vc,
            client_chunk_group_bootstrap_params,
        ) = if is_app_page {
            let client_shared_chunk_group = get_app_client_shared_chunk_group(
                AssetIdent::from_path(project.project_path().owned().await?)
                    .with_modifier(rcstr!("client-shared-chunks"))
                    .into_vc(),
                this.app_project.client_runtime_entries(),
                *module_graphs.full,
                *client_chunking_context,
            );

            client_assets.extend(client_shared_chunk_group.all_assets().await?);

            let client_shared_chunk_group = client_shared_chunk_group.await?;
            (
                client_shared_chunk_group.availability_info,
                client_shared_chunk_group.assets.owned().await?,
                Some(client_shared_chunk_group.assets),
                client_shared_chunk_group
                    .chunk_group_bootstrap_params
                    .clone(),
            )
        } else {
            (AvailabilityInfo::root(), vec![], None, None)
        };

        let client_references_chunks = get_app_client_references_chunks(
            *client_references,
            *module_graphs.full,
            *client_chunking_context,
            availability_info,
            ssr_chunking_context.map(|ctx| *ctx),
        )
        .to_resolved()
        .await?;
        let client_references_chunks_ref = client_references_chunks.await?;

        for &assets in client_references_chunks_ref
            .layout_segment_client_chunks
            .values()
        {
            client_assets.extend(assets.all_assets().await?.iter().copied());
        }
        for &assets in client_references_chunks_ref
            .client_component_client_chunks
            .values()
        {
            client_assets.extend(assets.all_assets().await?.iter().copied());
        }
        let mut ssr_client_reference_chunks: Vec<ResolvedVc<Box<dyn OutputAsset>>> = vec![];
        for &assets in client_references_chunks_ref
            .client_component_ssr_chunks
            .values()
        {
            // TODO(alexkirsz) In which manifest does this go?
            let all = assets.all_assets().await?;
            server_assets.extend(all.iter().copied());
            ssr_client_reference_chunks.extend(all.iter().copied());
        }

        // In development, register a server-side HMR chunk list that owns all
        // client-component SSR chunks. This is a bit of a hack to provide a single subscription
        // point for these chunks, which aren't normally reachable from the rest of the server-side
        // chunk lists.
        //
        // TODO: This anchor can go away once edges to chunk references are represented explicitly
        // in the chunk graph (rsc chunk -> ssr chunk), which would make the SSR chunks reachable
        // from the RSC chunk lists directly.
        if is_app_page
            && runtime == NextRuntime::NodeJs
            && project
                .client_compile_time_info()
                .await?
                .hot_module_replacement_enabled
        {
            let ssr_hmr_chunk_list_path = server_path.join(&format!(
                "app{original_name}/client-components-ssr.js",
                original_name = app_entry.original_name
            ))?;
            let ssr_hmr_chunks = project
                .server_chunking_context(
                    process_client_assets,
                    true, // supports_lazy_dynamic_imports
                )
                .server_hmr_chunk_list(
                    ssr_hmr_chunk_list_path,
                    Vc::cell(ssr_client_reference_chunks),
                )
                .to_resolved()
                .await?;
            server_assets.insert(ssr_hmr_chunks);
        }

        // In development, register a page-specific HMR chunk list that owns all client
        // reference chunks for this page. These chunks are computed via separate
        // chunk_group(IsolatedMerged) calls and aren't reachable from the shared client
        // chunk group's module graph, so they need their own HMR subscription.
        //
        // The register chunk is page-specific and must NOT go into client_shared_chunks
        // (root_main_files), which is shared across all pages. Instead it goes into
        // root_main_files_per_page so it is serialized under rootMainFilesTree[page] in
        // the build manifest. The server renderer reads rootMainFilesTree[pagePath] first
        // (required-scripts.tsx), so only the correct page's register chunk is loaded.
        //
        // rootMainFilesTree is only used for the bootstrap scripts of a full page load. A
        // client-side navigation loads the page's client reference chunks from the RSC
        // payload instead, so the register chunk is also passed to the client reference
        // manifest, which appends it to the chunks of each of the page's client components.
        let is_hot_module_replacement_enabled = project
            .client_compile_time_info()
            .await?
            .hot_module_replacement_enabled;
        let page_hmr_chunk_list = if is_app_page && is_hot_module_replacement_enabled {
            let client_components_chunks_ident =
                AssetIdent::from_path(project.project_path().owned().await?)
                    .with_modifier(rcstr!("client-components"))
                    .with_modifier(app_entry.original_name.clone())
                    .into_vc();
            let client_reference_chunks =
                get_client_references_chunks_for_hmr(*client_references_chunks);
            Some(
                client_chunking_context
                    .hmr_chunk_list(
                        client_components_chunks_ident,
                        client_reference_chunks,
                        HmrChunkListSource::Entry,
                    )
                    .to_resolved()
                    .await?,
            )
        } else {
            None
        };
        let page_hmr_chunks = if let Some(page_hmr_chunk_list) = page_hmr_chunk_list {
            page_hmr_chunk_list
                .await?
                .iter()
                .copied()
                .collect::<Vec<_>>()
        } else {
            vec![]
        };
        client_assets.extend(page_hmr_chunks.iter().copied());

        let manifest_path_prefix = &app_entry.original_name;

        // Only Pages need a polyfill chunk, Routes handlers don't have any inherent code that runs
        // in the browser.
        let polyfill_output_asset = if matches!(this.ty, AppEndpointType::Page { .. }) {
            // polyfill-nomodule.js is a pre-compiled asset distributed as part of next
            let next_package = get_next_package(project.project_path().owned().await?).await?;
            let polyfill_source =
                FileSource::new(next_package.join("dist/build/polyfills/polyfill-nomodule.js")?);

            let polyfill_output_asset = ResolvedVc::upcast(
                SingleFileEcmascriptOutput::new(
                    *client_chunking_context,
                    Vc::upcast(polyfill_source),
                )
                .to_resolved()
                .await?,
            );

            client_assets.insert(polyfill_output_asset);

            Some(polyfill_output_asset)
        } else {
            None
        };

        // Like the polyfill, this is a pre-compiled asset distributed as part of next and served
        // as-is rather than bundled with the framework. Keeping it small and independent lets it
        // reveal streamed Suspense boundaries before the framework loads or hydration begins.
        // React only publishes it on the experimental channel, which
        // `experimental.externalBrowserRuntime` opts into.
        let external_browser_runtime_output_asset =
            if matches!(this.ty, AppEndpointType::Page { .. })
                && *project
                    .next_config()
                    .enable_external_browser_runtime()
                    .await?
            {
                let next_package = get_next_package(project.project_path().owned().await?).await?;
                let external_browser_runtime_source = FileSource::new(next_package.join(
                    "dist/compiled/react-dom-experimental/unstable_server-external-runtime.js",
                )?);

                let external_browser_runtime_output_asset = ResolvedVc::upcast(
                    SingleFileEcmascriptOutput::new(
                        *client_chunking_context,
                        Vc::upcast(external_browser_runtime_source),
                    )
                    .to_resolved()
                    .await?,
                );

                client_assets.insert(external_browser_runtime_output_asset);

                Some(external_browser_runtime_output_asset)
            } else {
                None
            };

        // Compile any service workers registered via `navigator.serviceWorker.register(new
        // URL(...), { scope })` reachable from this endpoint.
        client_assets.extend(
            service_worker_output_assets(project, *module_graphs.base)
                .await?
                .iter()
                .copied(),
        );

        let client_assets: ResolvedVc<OutputAssets> =
            ResolvedVc::cell(client_assets.into_iter().collect::<Vec<_>>());

        if emit_manifests != EmitManifests::None {
            let root_main_files_per_page = if page_hmr_chunks.is_empty() {
                OrderedAutoMap::default()
            } else {
                let mut m = OrderedAutoMap::default();
                m.insert(app_entry.original_name.clone(), page_hmr_chunks);
                m
            };
            let chunk_loading_global = (*project
                .next_config()
                .turbopack_chunk_loading_global()
                .await?)
                .clone()
                .unwrap_or_else(|| rcstr!("TURBOPACK"));
            let build_manifest = BuildManifest {
                output_path: node_root.join(&format!(
                    "server/app{manifest_path_prefix}/build-manifest.json",
                ))?,
                client_relative_path: client_relative_path.clone(),
                pages: Default::default(),
                root_main_files: client_shared_chunks,
                polyfill_files: polyfill_output_asset.into_iter().collect(),
                external_browser_runtime_file: external_browser_runtime_output_asset,
                root_main_files_per_page,
                pages_chunk_group_bootstrap_params: client_chunk_group_bootstrap_params
                    .map(|params| {
                        let mut m = OrderedAutoMap::default();
                        m.insert(app_entry.original_name.clone(), params);
                        m
                    })
                    .unwrap_or_default(),
                chunk_loading_global,
            };
            server_assets.insert(ResolvedVc::upcast(build_manifest.resolved_cell()));
        }

        if runtime == NextRuntime::Edge {
            // as the edge runtime doesn't support chunk loading we need to add all client
            // references to the middleware manifest so they get loaded during runtime
            // initialization
            let client_references_chunks = &*client_references_chunks.await?;

            for &assets in client_references_chunks
                .client_component_ssr_chunks
                .values()
            {
                middleware_assets.extend(assets.all_assets().await?);
            }
        }

        let actions = ServerActionsGraphs::new(*module_graphs.base, per_page_module_graph)
            .get_server_actions_for_endpoint(
                *rsc_entry,
                match runtime {
                    NextRuntime::Edge => Vc::upcast(this.app_project.edge_rsc_module_context()),
                    NextRuntime::NodeJs => Vc::upcast(this.app_project.rsc_module_context()),
                },
            );

        let server_action_manifest = create_server_actions_manifest(
            actions,
            project,
            node_root.clone(),
            app_entry.original_name.clone(),
            runtime,
            match runtime {
                NextRuntime::Edge => Vc::upcast(this.app_project.edge_rsc_module_context()),
                NextRuntime::NodeJs => Vc::upcast(this.app_project.rsc_module_context()),
            },
            *module_graphs.full,
            project.runtime_chunking_context(process_client_assets, runtime),
        )
        .await?;
        if emit_rsc_manifests {
            server_assets.insert(server_action_manifest.manifest);
        }

        let server_action_manifest_loader = server_action_manifest.loader;

        let app_entry_chunks = self
            .app_entry_chunks(
                *client_references,
                *server_action_manifest_loader,
                server_path.clone(),
                process_client_assets,
                *module_graphs.full,
            )
            .to_resolved()
            .await?;
        let expanded_app_entry_chunks = app_entry_chunks.expand_all_assets();
        let all_app_entry_chunks = app_entry_chunks.all_assets().await?;
        server_assets.extend(all_app_entry_chunks.iter().copied());
        let app_entry_chunk_group_ref = app_entry_chunks.await?;
        let app_entry_chunks = app_entry_chunk_group_ref.assets;
        let app_entry_chunks_ref = app_entry_chunks.await?;

        if runtime == NextRuntime::NodeJs
            && *project
                .next_config()
                .turbopack_lazy_dynamic_imports_ssr(*project.next_mode().await?)
                .await?
        {
            let dynamic_import_chunks = expanded_app_entry_chunks
                .await?
                .iter()
                .copied()
                .map(async |asset| {
                    let path = asset.path().owned().await?;
                    Ok(node_root
                        .get_path_to(&path)
                        .is_some_and(|path| {
                            path.starts_with("server/chunks/") && path.ends_with(".js")
                        })
                        .then_some(asset))
                })
                .try_join()
                .await?
                .into_iter()
                .flatten()
                .collect::<Vec<_>>();
            let dynamic_import_hmr_chunks = project
                .server_chunking_context(
                    process_client_assets,
                    true, // supports_lazy_dynamic_imports
                )
                .server_hmr_chunk_list(
                    server_path.join(&format!(
                        "app{}/dynamic-imports.js",
                        app_entry.original_name
                    ))?,
                    Vc::cell(dynamic_import_chunks),
                )
                .to_resolved()
                .await?;
            server_assets.insert(dynamic_import_hmr_chunks);
        }

        // these references are important for turbotrace
        let mut client_reference_manifest = None;

        // Only needed for the route bundle stats of production builds.
        let first_load_chunks = if let Some(client_shared_chunks) = client_shared_chunks_vc
            && emit_rsc_manifests
            && project.next_mode().await?.is_production()
        {
            Some(FirstLoadChunks::AppPage {
                client_references,
                client_references_chunks,
                client_shared_chunks,
            })
        } else {
            None
        };

        if emit_rsc_manifests {
            let entry_manifest = ResolvedVc::upcast(
                ClientReferenceManifest {
                    node_root: node_root.clone(),
                    client_relative_path: client_relative_path.clone(),
                    entry_name: app_entry.original_name.clone(),
                    client_references,
                    client_references_chunks,
                    hmr_chunk_list: page_hmr_chunk_list,
                    client_chunking_context,
                    ssr_chunking_context,
                    async_module_info: module_graphs.full.async_module_info().to_resolved().await?,
                    next_config: project.next_config().to_resolved().await?,
                    runtime,
                    mode: *project.next_mode().await?,
                }
                .resolved_cell(),
            );
            server_assets.insert(entry_manifest);
            if runtime == NextRuntime::Edge {
                middleware_assets.insert(entry_manifest);
            }
            client_reference_manifest = Some(entry_manifest);
        }
        if emit_manifests == EmitManifests::Full {
            let next_font_manifest_output = ResolvedVc::upcast(
                FontManifest {
                    client_root: project.client_root().owned().await?,
                    node_root: node_root.clone(),
                    dir: this.app_project.app_dir().owned().await?,
                    original_name: app_entry.original_name.clone(),
                    manifest_path_prefix: app_entry.original_name.clone(),
                    pathname: app_entry.original_name.clone(),
                    client_assets,
                    app_dir: true,
                }
                .resolved_cell(),
            );
            server_assets.insert(next_font_manifest_output);
        }

        let endpoint_output = match runtime {
            NextRuntime::Edge => {
                // the next-edge-ssr-loader templates expect the manifests to be stored in
                // global variables defined in these files
                //
                // they are created in `setup-dev-bundler.ts`
                let mut file_paths_from_root = fxindexset![
                    rcstr!("server/middleware-build-manifest.js"),
                    rcstr!("server/interception-route-rewrite-manifest.js"),
                ];
                if project.next_mode().await?.is_production() {
                    file_paths_from_root.insert(rcstr!("required-server-files.js"));
                }
                if emit_manifests == EmitManifests::Full {
                    file_paths_from_root.insert(rcstr!("server/next-font-manifest.js"));
                };
                if emit_rsc_manifests {
                    file_paths_from_root.insert(rcstr!("server/server-reference-manifest.js"));
                }

                if project
                    .next_config()
                    .experimental_sri()
                    .await?
                    .as_ref()
                    .is_some_and(|v| v.algorithm.is_some())
                {
                    file_paths_from_root.insert(rcstr!("server/subresource-integrity-manifest.js"));
                }

                let mut wasm_paths_from_root = fxindexset![];

                let node_root_value = node_root.clone();

                file_paths_from_root.extend(
                    get_js_paths_from_root(&node_root_value, middleware_assets.iter().copied())
                        .await?,
                );
                file_paths_from_root.extend(
                    get_js_paths_from_root(&node_root_value, app_entry_chunks_ref.iter().copied())
                        .await?,
                );

                let all_output_assets = all_assets_from_entries(*app_entry_chunks).await?;

                wasm_paths_from_root
                    .extend(get_wasm_paths_from_root(&node_root_value, middleware_assets).await?);
                wasm_paths_from_root.extend(
                    get_wasm_paths_from_root(&node_root_value, all_output_assets.iter().copied())
                        .await?,
                );

                let all_assets =
                    get_asset_paths_from_root(&node_root_value, all_output_assets).await?;

                let entry_file = rcstr!("app-edge-has-no-entrypoint");

                if emit_manifests == EmitManifests::Full {
                    let dynamic_import_entries = collect_next_dynamic_chunks(
                        *module_graphs.full,
                        *client_chunking_context,
                        next_dynamic_imports,
                        NextDynamicChunkAvailability::AppRouterClientReferences(
                            &*(client_references_chunks.await?),
                        ),
                    )
                    .await?;

                    let loadable_manifest_output = create_react_loadable_manifest(
                        *dynamic_import_entries,
                        *client_chunking_context,
                        client_relative_path.clone(),
                        node_root.join(&format!(
                            "server/app{}/react-loadable-manifest",
                            app_entry.original_name
                        ))?,
                        NextRuntime::Edge,
                    )
                    .await?;

                    server_assets.extend(loadable_manifest_output.iter().copied());
                    file_paths_from_root.extend(
                        get_js_paths_from_root(&node_root_value, loadable_manifest_output).await?,
                    );
                }
                if emit_manifests != EmitManifests::None {
                    // create middleware manifest
                    let named_regex = get_named_middleware_regex(&app_entry.pathname);
                    let matchers = ProxyMatcher {
                        regexp: Some(named_regex.into()),
                        original_source: app_entry.pathname.clone(),
                        ..Default::default()
                    };
                    let entrypoint_chunk = *app_entry_chunks_ref
                        .last()
                        .context("expected app entry chunks for edge app endpoint")?;
                    let entrypoint = node_root_value
                        .get_path_to(&*entrypoint_chunk.path().await?)
                        .context("expected app entry chunk to be within node root")?
                        .into();
                    let edge_function_definition = EdgeFunctionDefinition {
                        files: file_paths_from_root.into_iter().collect(),
                        wasm: wasm_paths_to_bindings(wasm_paths_from_root).await?,
                        assets: paths_to_bindings(all_assets),
                        name: app_function_name(&app_entry.original_name).into(),
                        page: app_entry.original_name.clone(),
                        entrypoint,
                        regions: app_entry
                            .config
                            .await?
                            .preferred_region
                            .as_ref()
                            .map(|region| Regions::Multiple(region.to_vec())),
                        matchers: vec![matchers],
                        env: project.edge_env().owned().await?.into_iter().collect(),
                    };
                    let middleware_manifest_v2 = MiddlewaresManifestV2 {
                        sorted_middleware: vec![app_entry.original_name.clone()],
                        functions: [(app_entry.original_name.clone(), edge_function_definition)]
                            .into_iter()
                            .collect(),
                        ..Default::default()
                    };
                    let manifest_path_prefix = &app_entry.original_name;
                    let middleware_manifest_v2 = ResolvedVc::upcast(
                        VirtualOutputAsset::new(
                            node_root.join(&format!(
                                "server/app{manifest_path_prefix}/middleware-manifest.json",
                            ))?,
                            AssetContent::file(
                                FileContent::Content(File::from(serde_json::to_string_pretty(
                                    &middleware_manifest_v2,
                                )?))
                                .cell(),
                            ),
                        )
                        .to_resolved()
                        .await?,
                    );
                    server_assets.insert(middleware_manifest_v2);
                }
                if emit_manifests != EmitManifests::None {
                    // create app paths manifest
                    let app_paths_manifest_output = create_app_paths_manifest(
                        node_root.clone(),
                        &app_entry.original_name,
                        entry_file,
                    )
                    .await?;
                    server_assets.insert(app_paths_manifest_output);
                }

                let server_assets = ResolvedVc::cell(server_assets.into_iter().collect::<Vec<_>>());

                AppEndpointOutput::Edge {
                    files: app_entry_chunks,
                    server_assets,
                    client_assets,
                    first_load_chunks,
                }
            }
            NextRuntime::NodeJs => {
                // For node, there will be exactly one asset in this
                let rsc_chunk = *app_entry_chunks_ref.first().unwrap();

                if emit_manifests != EmitManifests::None {
                    // create app paths manifest
                    let app_paths_manifest_output = create_app_paths_manifest(
                        node_root.clone(),
                        &app_entry.original_name,
                        server_path
                            .get_path_to(&*rsc_chunk.path().await?)
                            .context(
                                "RSC chunk path should be within app paths manifest directory",
                            )?
                            .into(),
                    )
                    .await?;
                    server_assets.insert(app_paths_manifest_output);
                }

                let loadable_manifest_output = if emit_manifests == EmitManifests::Full {
                    // create react-loadable-manifest for next/dynamic
                    let dynamic_import_entries = collect_next_dynamic_chunks(
                        *module_graphs.full,
                        *client_chunking_context,
                        next_dynamic_imports,
                        NextDynamicChunkAvailability::AppRouterClientReferences(
                            &*(client_references_chunks.await?),
                        ),
                    )
                    .await?;

                    let loadable_manifest_output = create_react_loadable_manifest(
                        *dynamic_import_entries,
                        *client_chunking_context,
                        client_relative_path.clone(),
                        node_root.join(&format!(
                            "server/app{}/react-loadable-manifest",
                            app_entry.original_name
                        ))?,
                        NextRuntime::NodeJs,
                    )
                    .await?;

                    server_assets.extend(loadable_manifest_output.iter().copied());
                    Some(loadable_manifest_output)
                } else {
                    None
                };

                if *this
                    .app_project
                    .project()
                    .should_write_nft_manifests()
                    .await?
                {
                    let mut additional_assets = Vec::with_capacity(
                        client_reference_manifest.iter().len()
                            + loadable_manifest_output
                                .iter()
                                .map(|m| m.len())
                                .sum::<usize>(),
                    );
                    additional_assets.extend(
                        client_reference_manifest
                            .iter()
                            .chain(loadable_manifest_output.iter().flat_map(|m| &**m))
                            .map(|m| **m),
                    );
                    server_assets.insert(ResolvedVc::upcast(
                        NftJsonAsset::new(
                            project,
                            Some(app_function_name(&app_entry.original_name).into()),
                            *rsc_chunk,
                            additional_assets,
                            self.trace_result(),
                        )
                        .to_resolved()
                        .await?,
                    ));
                }

                let server_assets = ResolvedVc::cell(server_assets.into_iter().collect::<Vec<_>>());

                AppEndpointOutput::NodeJs {
                    rsc_chunk,
                    server_assets,
                    client_assets,
                    first_load_chunks,
                }
            }
        }
        .cell();

        Ok(endpoint_output)
    }

    #[turbo_tasks::function]
    async fn app_entry_chunks(
        self: Vc<Self>,
        client_references: Vc<ClientReferenceGraphResult>,
        server_action_manifest_loader: ResolvedVc<Box<dyn EvaluatableAsset>>,
        server_path: FileSystemPath,
        process_client_assets: bool,
        module_graph: Vc<ModuleGraph>,
    ) -> Result<Vc<OutputAssetsWithReferenced>> {
        let this = self.await?;
        let project = this.app_project.project();
        let app_entry = self.app_endpoint_entry().await?;
        let runtime = app_entry.config.await?.runtime.unwrap_or_default();

        let chunking_context = project.runtime_chunking_context(process_client_assets, runtime);

        Ok(match runtime {
            NextRuntime::Edge => {
                let chunk_group1 = chunking_context.chunk_group(
                    server_action_manifest_loader.ident(),
                    smallvec![ChunkGroupKey::Shared(ResolvedVc::upcast(
                        server_action_manifest_loader,
                    ))],
                    module_graph,
                    AvailabilityInfo::root(),
                );

                let chunk_group2_assets = chunking_context.evaluated_chunk_group_assets(
                    app_entry.rsc_entry.ident(),
                    ChunkGroupKey::Entry(vec![app_entry.rsc_entry]),
                    module_graph,
                    OutputAssets::empty(),
                    chunk_group1.await?.availability_info,
                );

                chunk_group1
                    .output_assets_with_referenced()
                    .concatenate(chunk_group2_assets)
            }
            NextRuntime::NodeJs => {
                async {
                    let mut current_chunk_group = ChunkGroupResult::empty_resolved();

                    let entry_chunk_group = ChunkGroupKey::Entry(vec![app_entry.rsc_entry]);

                    let client_references = client_references.await?;

                    // A manual shared chunk for the server utilities, created for development
                    // only.
                    //
                    // In development every endpoint gets its own module graph (see
                    // `per_page_module_graph`), so without this the layout segments would share
                    // very little across pages.
                    //
                    // It must not be created in production. The group is the merged child of
                    // *this* endpoint's entry chunk group, and that parent is part of a merged
                    // group's identity, so the group -- and hence the availability info it seeds
                    // into the layout segment chain below -- would differ for every endpoint.
                    // That makes each shared layout segment re-chunk once per descendant
                    // endpoint. In production a single whole-app module graph already shares
                    // these modules, so they are chunked as part of the entry instead.
                    if *project.per_page_module_graph().await? {
                        let chunk_group_info = module_graph.chunk_group_info();
                        let span = tracing::trace_span!("server utils");
                        async {
                            let has_server_utils = !client_references.server_utils.is_empty();

                            // The server utilities of this entry are merged into a single group:
                            // the one merged child of the entry chunk group carrying the server
                            // utility merge tag.
                            let derived_group = if !has_server_utils {
                                None
                            } else {
                                let entry_index = chunk_group_info
                                    .get_index_of(entry_chunk_group.clone())
                                    .await?;
                                let merged = chunk_group_info
                                    .get_shared_merged_chunk_group(
                                        entry_index,
                                        NEXT_SERVER_UTILITY_MERGE_TAG.clone(),
                                    )
                                    .await?;
                                merged.as_ref().and_then(|group| group.kind.key())
                            };

                            ensure!(
                                !has_server_utils || derived_group.is_some(),
                                "could not find a graph-derived shared merged group for server \
                                 utilities"
                            );

                            let mut combined_chunk_group = ChunkGroupResult::empty_resolved();
                            if let Some(group) = derived_group {
                                combined_chunk_group = chunking_context
                                    .chunk_group(
                                        AssetIdent::from_path(
                                            this.app_project
                                                .project()
                                                .project_path()
                                                .owned()
                                                .await?,
                                        )
                                        .with_modifier(rcstr!("server-utils"))
                                        .into_vc(),
                                        smallvec![group],
                                        module_graph,
                                        AvailabilityInfo::root(),
                                    )
                                    .to_resolved()
                                    .await?;
                            }

                            current_chunk_group = combined_chunk_group;

                            anyhow::Ok(())
                        }
                        .instrument(span)
                        .await?;
                    }
                    for server_component in client_references
                        .server_component_entries
                        .iter()
                        .copied()
                        .take(
                            client_references
                                .server_component_entries
                                .len()
                                .saturating_sub(1),
                        )
                    {
                        let span = tracing::trace_span!(
                            "layout segment",
                            name = display(server_component.ident().to_string().await?)
                        );
                        async {
                            let chunk_group = chunking_context.chunk_group(
                                server_component.ident(),
                                smallvec![ChunkGroupKey::Shared(ResolvedVc::upcast(
                                    server_component
                                ))],
                                module_graph,
                                current_chunk_group.await?.availability_info,
                            );

                            current_chunk_group = current_chunk_group
                                .concatenate(chunk_group)
                                .to_resolved()
                                .await?;

                            anyhow::Ok(())
                        }
                        .instrument(span)
                        .await?;
                    }

                    {
                        let chunk_group = chunking_context.chunk_group(
                            server_action_manifest_loader.ident(),
                            smallvec![ChunkGroupKey::Shared(ResolvedVc::upcast(
                                server_action_manifest_loader,
                            ))],
                            module_graph,
                            current_chunk_group.await?.availability_info,
                        );

                        current_chunk_group = current_chunk_group
                            .concatenate(chunk_group)
                            .to_resolved()
                            .await?;
                    }

                    let current_referenced_assets = current_chunk_group.referenced_assets();
                    let chunk_group = current_chunk_group.await?;
                    let current_availability_info = chunk_group.availability_info;
                    let current_chunks = chunk_group.assets;

                    anyhow::Ok(
                        OutputAssetsWithReferenced {
                            assets: ResolvedVc::cell(vec![
                                chunking_context
                                    .entry_chunk_group_asset(
                                        server_path.join(&format!(
                                            "app{original_name}.js",
                                            original_name = app_entry.original_name
                                        ))?,
                                        entry_chunk_group,
                                        module_graph,
                                        *current_chunks,
                                        current_referenced_assets,
                                        current_availability_info,
                                    )
                                    .to_resolved()
                                    .await?,
                            ]),
                            referenced_assets: ResolvedVc::cell(vec![]),
                            references: ResolvedVc::cell(vec![]),
                        }
                        .cell(),
                    )
                }
                .instrument(tracing::trace_span!("server node entrypoint"))
                .await?
            }
        })
    }

    #[turbo_tasks::function]
    async fn trace_result(self: Vc<Self>) -> Result<Vc<EndpointTraceResult>> {
        let this = self.await?;
        let app_entry = self.app_endpoint_entry().await?;

        let rsc_entry = app_entry.rsc_entry;

        let is_app_page = matches!(this.ty, AppEndpointType::Page { .. });

        let module_graphs = this
            .app_project
            .app_module_graphs(
                self,
                *rsc_entry,
                // We only need the client runtime entries for pages not for Route Handlers
                is_app_page.then(|| this.app_project.client_runtime_entries()),
            )
            .await?;

        // The server actions loader is a separate graph entry that is not reachable from
        // rsc_entry, but it is chunked into the endpoint output, so its modules (e.g. externals
        // imported by actions) must be traced as well.
        let mut entry_modules = vec![rsc_entry];
        entry_modules.extend(
            self.additional_entries(*module_graphs.base)
                .await?
                .all_modules(),
        );

        Ok(trace_endpoint(
            this.app_project.project(),
            Some(app_function_name(&app_entry.original_name).into()),
            *module_graphs.full,
            Vc::cell(entry_modules),
            this.app_project.project().additional_traced_modules(),
        ))
    }
}

async fn create_app_paths_manifest(
    node_root: FileSystemPath,
    original_name: &str,
    filename: RcStr,
) -> Result<ResolvedVc<Box<dyn OutputAsset>>> {
    let manifest_path_prefix = original_name;
    let path = node_root.join(&format!(
        "server/app{manifest_path_prefix}/app-paths-manifest.json",
    ))?;
    let app_paths_manifest = AppPathsManifest {
        node_server_app_paths: PagesManifest {
            pages: [(original_name.into(), filename)].into_iter().collect(),
        },
        ..Default::default()
    };
    Ok(ResolvedVc::upcast(
        VirtualOutputAsset::new(
            path,
            AssetContent::file(
                FileContent::Content(File::from(serde_json::to_string_pretty(
                    &app_paths_manifest,
                )?))
                .cell(),
            ),
        )
        .to_resolved()
        .await?,
    ))
}

#[turbo_tasks::value_impl]
impl Endpoint for AppEndpoint {
    #[turbo_tasks::function]
    async fn output(self: ResolvedVc<Self>) -> Result<Vc<EndpointOutput>> {
        let this = self.await?;
        let page_name = this.page.to_string();
        let span = match this.ty {
            AppEndpointType::Page {
                ty: AppPageEndpointType::Html,
                ..
            } => {
                tracing::info_span!("app endpoint HTML", name = page_name)
            }
            AppEndpointType::Page {
                ty: AppPageEndpointType::RscHmr,
                ..
            } => {
                tracing::info_span!("app endpoint RSC HMR", name = page_name)
            }
            AppEndpointType::Route { .. } => {
                tracing::info_span!("app endpoint route", name = page_name)
            }
            AppEndpointType::Metadata { .. } => {
                tracing::info_span!("app endpoint metadata", name = page_name)
            }
        };

        async move {
            let output = self.output();
            let project = this.app_project.project();
            let node_root = project.node_root().owned().await?;
            let client_relative_root = project.client_relative_path().owned().await?;

            let output_assets = output.output_assets();
            let output_assets = if let Some(sri) =
                &*project.next_config().experimental_sri().await?
                && let Some(algorithm) = sri.algorithm.clone()
            {
                let sri_manifest = get_sri_manifest_asset(
                    node_root.join(&format!(
                        "server/app{}/subresource-integrity-manifest.json",
                        &self.app_endpoint_entry().await?.original_name
                    ))?,
                    output_assets,
                    client_relative_root.clone(),
                    algorithm,
                );
                output_assets.concat_asset(sri_manifest)
            } else {
                output_assets
            };

            let (server_paths, client_paths) = if project.next_mode().await?.is_development() {
                let server_paths = all_asset_paths(output_assets, node_root.clone(), None)
                    .owned()
                    .await?;
                let client_paths = all_paths_in_root(output_assets, client_relative_root)
                    .owned()
                    .await?;
                (server_paths, client_paths)
            } else {
                (vec![], vec![])
            };

            let written_endpoint = match *output.await? {
                AppEndpointOutput::NodeJs { rsc_chunk, .. } => {
                    let server_entry_path: RcStr = node_root
                        .get_path_to(&*rsc_chunk.path().await?)
                        .context("Node.js chunk entry path must be inside the node root")?
                        .into();
                    let hmr_entry_path = server_entry_path
                        .strip_prefix("server/app/")
                        .unwrap_or(&server_entry_path)
                        .strip_suffix(".js")
                        .unwrap_or(&server_entry_path);
                    let mut server_hmr_entry_paths = vec![
                        format!("{hmr_entry_path}.js").into(),
                        format!("{hmr_entry_path}/client-components-ssr.js").into(),
                    ];
                    if *project
                        .next_config()
                        .turbopack_lazy_dynamic_imports_ssr(*project.next_mode().await?)
                        .await?
                    {
                        server_hmr_entry_paths
                            .push(format!("{hmr_entry_path}/dynamic-imports.js").into());
                    }
                    EndpointOutputPaths::NodeJs {
                        server_hmr_entry_paths,
                        server_entry_path,
                        server_paths,
                        client_paths,
                    }
                }
                AppEndpointOutput::Edge { .. } => EndpointOutputPaths::Edge {
                    server_paths,
                    client_paths,
                },
            };

            let first_load_chunks = match &*output.await? {
                AppEndpointOutput::NodeJs {
                    first_load_chunks, ..
                }
                | AppEndpointOutput::Edge {
                    first_load_chunks, ..
                } => first_load_chunks.clone(),
            };

            anyhow::Ok(
                EndpointOutput {
                    output_assets: output_assets.to_resolved().await?,
                    output_paths: written_endpoint.resolved_cell(),
                    project: project.to_resolved().await?,
                    first_load_chunks,
                }
                .cell(),
            )
        }
        .instrument(span)
        .await
        .with_context(|| format!("Failed to write app endpoint {page_name}"))
    }

    #[turbo_tasks::function]
    async fn server_changed(self: Vc<Self>) -> Result<Vc<Completion>> {
        Ok(self
            .await?
            .app_project
            .project()
            .server_changed(self.output().server_assets()))
    }

    #[turbo_tasks::function]
    async fn client_changed(self: Vc<Self>) -> Result<Vc<Completion>> {
        Ok(self
            .await?
            .app_project
            .project()
            .client_changed(self.output().client_assets()))
    }

    #[turbo_tasks::function]
    async fn analyze_client_entries(self: Vc<Self>) -> Result<Vc<AnalyzeClientEntries>> {
        let this = self.await?;
        let app_entry = self.app_endpoint_entry().await?;
        if !matches!(this.ty, AppEndpointType::Page { .. }) {
            return Ok(AnalyzeClientEntries {
                server_modules: vec![app_entry.rsc_entry],
                ..Default::default()
            }
            .cell());
        }
        let project = this.app_project.project();
        let module_graphs = project.whole_app_module_graphs().await?;
        let references = ClientReferencesGraphs::new(*module_graphs.base, false)
            .get_client_references_for_endpoint(
                *app_entry.rsc_entry,
                true,
                *project.should_trace().await?,
                project.next_mode().await?.is_production(),
            )
            .await?;
        let references = references
            .client_references
            .iter()
            .map(async |reference| {
                let (module, kind) = match reference.ty {
                    ClientReferenceType::EcmascriptClientReference(reference) => (
                        ResolvedVc::upcast(reference.await?.client_module),
                        rcstr!("ecmascript"),
                    ),
                    ClientReferenceType::CssClientReference(reference) => {
                        (ResolvedVc::upcast(reference), rcstr!("css"))
                    }
                };
                Ok(AnalyzeClientReference { module, kind })
            })
            .try_join()
            .await?;

        Ok(AnalyzeClientEntries {
            server_modules: vec![app_entry.rsc_entry],
            bootstrap_modules: this
                .app_project
                .client_runtime_entries()
                .await?
                .iter()
                .map(|module| ResolvedVc::upcast(*module))
                .collect(),
            references,
        }
        .cell())
    }

    #[turbo_tasks::function]
    async fn analyze_chunk_groups(self: Vc<Self>) -> Result<Vc<AnalyzeChunkGroups>> {
        let this = self.await?;
        if !matches!(this.ty, AppEndpointType::Page { .. }) {
            return Ok(Vc::cell(vec![]));
        }
        let project = this.app_project.project();
        let app_entry = self.app_endpoint_entry().await?;
        let graphs = project.whole_app_module_graphs().await?;
        let client_chunking_context = project.client_chunking_context();
        let shared = get_app_client_shared_chunk_group(
            AssetIdent::from_path(project.project_path().owned().await?)
                .with_modifier(rcstr!("client-shared-chunks"))
                .into_vc(),
            this.app_project.client_runtime_entries(),
            *graphs.full,
            client_chunking_context,
        )
        .await?;
        let mut groups = vec![AnalyzeChunkGroup {
            kind: rcstr!("bootstrap"),
            trigger: this
                .app_project
                .client_runtime_entries()
                .await?
                .first()
                .map(|module| ResolvedVc::upcast(*module)),
            assets: shared.assets,
            pages_html: false,
        }];
        let references = ClientReferencesGraphs::new(*graphs.base, false)
            .get_client_references_for_endpoint(
                *app_entry.rsc_entry,
                true,
                *project.should_trace().await?,
                project.next_mode().await?.is_production(),
            )
            .to_resolved()
            .await?;
        let chunks = get_app_client_references_chunks(
            *references,
            *graphs.full,
            client_chunking_context,
            shared.availability_info,
            // Only client output groups are needed; SSR chunks are not browser assets.
            None,
        )
        .await?;
        for (&reference, &group) in &chunks.client_component_client_chunks {
            let module = match reference {
                ClientReferenceType::EcmascriptClientReference(reference) => {
                    ResolvedVc::upcast(reference.await?.client_module)
                }
                ClientReferenceType::CssClientReference(reference) => ResolvedVc::upcast(reference),
            };
            groups.push(AnalyzeChunkGroup {
                kind: rcstr!("render_dependent"),
                trigger: Some(module),
                assets: group.await?.assets,
                pages_html: false,
            });
        }
        for (&segment, &group) in &chunks.layout_segment_client_chunks {
            groups.push(AnalyzeChunkGroup {
                kind: rcstr!("render_dependent"),
                trigger: Some(ResolvedVc::upcast(segment)),
                assets: group.await?.assets,
                pages_html: false,
            });
        }
        let workers = service_worker_output_assets(project, *graphs.base)
            .to_resolved()
            .await?;
        if !workers.await?.is_empty() {
            groups.push(AnalyzeChunkGroup {
                kind: rcstr!("worker"),
                trigger: None,
                assets: workers,
                pages_html: false,
            });
        }
        Ok(Vc::cell(groups))
    }

    #[turbo_tasks::function]
    async fn entries(self: Vc<Self>) -> Result<Vc<GraphEntries>> {
        let this = self.await?;
        let app_entry = self.app_endpoint_entry().await?;
        // The route's chunking heuristics from `experimental.turbopackChunking`. They are
        // attached to the route's entry chunk group.
        let heuristics = this
            .app_project
            .project()
            .next_config()
            .turbopack_chunking()
            .await?
            .entry_heuristics_for(&app_entry.pathname);
        Ok(GraphEntries::from_chunk_groups(vec![
            ChunkGroupEntry::Entry {
                modules: vec![app_entry.rsc_entry],
                heuristics,
            },
            ChunkGroupEntry::Entry {
                modules: this
                    .app_project
                    .client_runtime_entries()
                    .await?
                    .iter()
                    .copied()
                    .map(ResolvedVc::upcast)
                    .collect(),
                heuristics: EntryHeuristics::high_priority(),
            },
        ])
        .cell())
    }

    #[turbo_tasks::function]
    async fn additional_entries(
        self: Vc<Self>,
        graph: Vc<ModuleGraph>,
    ) -> Result<Vc<GraphEntries>> {
        let this = self.await?;
        let app_entry = self.app_endpoint_entry().await?;
        let rsc_entry = app_entry.rsc_entry;
        let runtime = app_entry.config.await?.runtime.unwrap_or_default();

        let actions = ServerActionsGraphs::new(
            graph,
            *this.app_project.project().per_page_module_graph().await?,
        )
        .get_server_actions_for_endpoint(
            *rsc_entry,
            match runtime {
                NextRuntime::Edge => Vc::upcast(this.app_project.edge_rsc_module_context()),
                NextRuntime::NodeJs => Vc::upcast(this.app_project.rsc_module_context()),
            },
        );

        let server_actions_loader = ResolvedVc::upcast(
            build_server_actions_loader(
                this.app_project.project().project_path().owned().await?,
                app_entry.original_name.clone(),
                actions,
                match runtime {
                    NextRuntime::Edge => Vc::upcast(this.app_project.edge_rsc_module_context()),
                    NextRuntime::NodeJs => Vc::upcast(this.app_project.rsc_module_context()),
                },
            )
            .to_resolved()
            .await?,
        );

        Ok(
            GraphEntries::from_chunk_groups(vec![ChunkGroupEntry::Shared(server_actions_loader)])
                .cell(),
        )
    }

    #[turbo_tasks::function]
    async fn module_graphs(self: Vc<Self>) -> Result<Vc<ModuleGraphs>> {
        let this = self.await?;
        let app_entry = self.app_endpoint_entry().await?;
        let is_app_page = matches!(this.ty, AppEndpointType::Page { .. });
        let module_graphs = this
            .app_project
            .app_module_graphs(
                self,
                *app_entry.rsc_entry,
                // We only need the client runtime entries for pages not for Route Handlers
                is_app_page.then(|| this.app_project.client_runtime_entries()),
            )
            .await?;
        Ok(Vc::cell(vec![module_graphs.full]))
    }

    #[turbo_tasks::function]
    async fn project(self: Vc<Self>) -> Result<Vc<Project>> {
        Ok(self.await?.app_project.project())
    }

    #[turbo_tasks::function]
    fn traced_files(self: Vc<Self>) -> Vc<FileSystemPathVec> {
        self.trace_result().all_files()
    }
}

#[turbo_tasks::value]
enum AppEndpointOutput {
    NodeJs {
        rsc_chunk: ResolvedVc<Box<dyn OutputAsset>>,
        server_assets: ResolvedVc<OutputAssets>,
        client_assets: ResolvedVc<OutputAssets>,
        /// Only set for pages in production builds.
        first_load_chunks: Option<FirstLoadChunks>,
    },
    Edge {
        files: ResolvedVc<OutputAssets>,
        server_assets: ResolvedVc<OutputAssets>,
        client_assets: ResolvedVc<OutputAssets>,
        /// Only set for pages in production builds.
        first_load_chunks: Option<FirstLoadChunks>,
    },
}

#[turbo_tasks::value_impl]
impl AppEndpointOutput {
    #[turbo_tasks::function]
    pub async fn output_assets(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let server_assets = self.server_assets().await?;
        let client_assets = self.client_assets().await?;
        Ok(Vc::cell(
            server_assets
                .iter()
                .cloned()
                .chain(client_assets.iter().cloned())
                .collect(),
        ))
    }

    #[turbo_tasks::function]
    pub fn server_assets(&self) -> Vc<OutputAssets> {
        match *self {
            AppEndpointOutput::NodeJs { server_assets, .. }
            | AppEndpointOutput::Edge { server_assets, .. } => *server_assets,
        }
    }

    #[turbo_tasks::function]
    pub fn client_assets(&self) -> Vc<OutputAssets> {
        match *self {
            AppEndpointOutput::NodeJs { client_assets, .. }
            | AppEndpointOutput::Edge { client_assets, .. } => *client_assets,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_go_proxy_handler_configuration() {
        let source = go_proxy_handler_source(false, "").unwrap();
        assert!(source.contains("const nextGoSkipProxyURLNormalize = false\n"));
        assert!(source.contains("const nextGoProxyBasePath = \"\"\n"));
        let source = go_proxy_handler_source(true, "/docs").unwrap();
        assert!(source.contains("const nextGoSkipProxyURLNormalize = true\n"));
        assert!(source.contains("const nextGoProxyBasePath = \"/docs\"\n"));
    }

    #[test]
    fn go_internal_route_packages_are_imported_through_shims() {
        let hash = |path: &str| turbo_tasks_hash::hash_xxh3_hash64(path) as u32;
        let alias = "app/_next_go_route_group_native_id_00000000";
        assert_eq!(
            go_internal_shims("example.com/m", alias).unwrap(),
            (alias.to_owned(), vec![])
        );
        // Every `internal` element applies, from the deepest to the shallowest.
        let alias = "app/internal/deep/internal/leaf/_next_go_route_00000000";
        let inner = format!("app/internal/deep/_next_go_shim_{:08x}", hash(alias));
        let outer = format!("app/_next_go_shim_{:08x}", hash(&inner));
        let (import, shims) = go_internal_shims("example.com/m", alias).unwrap();
        assert_eq!(import, outer);
        assert_eq!(
            shims
                .iter()
                .map(|(path, _)| path.as_str())
                .collect::<Vec<_>>(),
            [
                format!("{inner}/zz_next_route_shim.go"),
                format!("{outer}/zz_next_route_shim.go"),
            ]
        );
        assert!(
            shims[0]
                .1
                .contains(&format!("next \"example.com/m/{alias}\""))
        );
        assert!(
            shims[1]
                .1
                .contains(&format!("next \"example.com/m/{inner}\""))
        );
        // A top-level `internal` element puts the shim at the module root.
        let alias = "internal/health/_next_go_route_00000000";
        let (import, shims) = go_internal_shims("example.com/m", alias).unwrap();
        assert_eq!(import, format!("_next_go_shim_{:08x}", hash(alias)));
        assert_eq!(shims.len(), 1);
    }

    #[test]
    fn go_route_ids_decode_exactly_once_like_go() {
        assert_eq!(go_path_unescape("/x/[id]").as_deref(), Some("/x/[id]"));
        assert_eq!(go_path_unescape("/x/%5Bid%5D").as_deref(), Some("/x/[id]"));
        assert_eq!(
            go_path_unescape("%2Fx%2F%255Bid%255D").as_deref(),
            Some("/x/%5Bid%5D")
        );
        assert_eq!(
            go_path_unescape("%2F%E6%97%A5%E6%9C%AC%E8%AA%9E").as_deref(),
            Some("/日本語")
        );
        assert_eq!(go_path_unescape("/a+b").as_deref(), Some("/a+b"));
        // Go rejects these, so they select no route.
        for invalid in ["/x/%zz", "/x/%5", "/x/%", "/x/%+5", "/x/%FF", "/x/%e6%97"] {
            assert_eq!(go_path_unescape(invalid), None, "{invalid}");
        }
    }

    #[test]
    fn go_route_ids_reject_a_literal_percent_spelling_of_another_route() {
        // A public dynamic route and a literal folder spelled as its encoded ID.
        assert_eq!(
            go_route_id_collisions(&["/x/[id]", "/x/%5Bid%5D", "/health"]),
            [("/x/%5Bid%5D", "/x/[id]")]
        );
        assert_eq!(
            go_route_id_collisions(&["/x/%255Bid%255D", "/x/%5Bid%5D"]),
            [("/x/%255Bid%255D", "/x/%5Bid%5D")]
        );
        assert_eq!(
            go_route_id_collisions(&["/caf%C3%A9", "/café", "/%5Fprivate"]),
            [("/caf%C3%A9", "/café")]
        );
        // Escapes that decode to no other route, or not at all, are allowed.
        assert!(
            go_route_id_collisions(&["/x/[id]", "/y/%5Bid%5D", "/x/%zz", "/日本語"]).is_empty()
        );
    }

    #[test]
    fn go_diagnostics_attribute_files_directly_inside_a_route_directory() {
        let directories = ["/p/app/api".to_owned(), "app/api".to_owned()];
        for (message, expected) in [
            ("/p/app/api/route.go:3:2: undefined: x", true),
            ("app/api/route.go:3:2: undefined: x", true),
            ("/p/app/api/users/route.go:3:2: undefined: x", false),
            ("/p/other/app/api/route.go:3:2: undefined: x", false),
            ("# example.com/m/app/api", false),
        ] {
            assert_eq!(
                go_diagnostic_mentions_directory(message, &directories),
                expected,
                "{message}"
            );
        }
    }
}
