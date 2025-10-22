use anyhow::{Context, Result, bail};
use next_core::{
    all_assets_from_entries,
    app_structure::{
        AppPageLoaderTree, CollectedRootParams, Entrypoint as AppEntrypoint,
        Entrypoints as AppEntrypoints, FileSystemPathVec, MetadataItem, collect_root_params,
        get_entrypoints,
    },
    get_edge_resolve_options_context, get_next_package,
    next_app::{
        AppEntry, AppPage, get_app_client_references_chunks, get_app_client_shared_chunk_group,
        get_app_page_entry, get_app_route_entry, metadata::route::get_app_metadata_route_entry,
    },
    next_client::{
        ClientContextType, get_client_module_options_context, get_client_resolve_options_context,
        get_client_runtime_entries,
    },
    next_client_reference::{
        ClientReferenceGraphResult, NextCssClientReferenceTransition,
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
    next_server_utility::{NEXT_SERVER_UTILITY_MERGE_TAG, NextServerUtilityTransition},
    parse_segment_config_from_source,
    segment_config::{NextSegmentConfig, ParseSegmentMode},
    util::{NextRuntime, app_function_name, module_styles_rule_condition, styles_rule_condition},
};
use serde::{Deserialize, Serialize};
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    Completion, NonLocalValue, ResolvedVc, TryJoinIterExt, ValueToString, Vc, fxindexset,
    trace::TraceRawVcs,
};
use turbo_tasks_env::{CustomProcessEnv, ProcessEnv};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbopack::{
    ModuleAssetContext,
    module_options::{ModuleOptionsContext, RuleCondition, transition_rule::TransitionRule},
    resolve_options_context::ResolveOptionsContext,
    transition::{FullContextTransition, Transition, TransitionOptions},
};
use turbopack_core::{
    asset::AssetContent,
    chunk::{
        ChunkGroupResult, ChunkingContext, ChunkingContextExt, EvaluatableAsset, EvaluatableAssets,
        availability_info::AvailabilityInfo,
    },
    file_source::FileSource,
    ident::{AssetIdent, Layer},
    module::Module,
    module_graph::{
        GraphEntries, ModuleGraph, SingleModuleGraph, VisitedModules,
        chunk_group_info::{ChunkGroup, ChunkGroupEntry},
    },
    output::{OutputAsset, OutputAssets, OutputAssetsWithReferenced},
    raw_output::RawOutput,
    reference_type::{CommonJsReferenceSubType, CssReferenceSubType, ReferenceType},
    resolve::{origin::PlainResolveOrigin, parse::Request, pattern::Pattern},
    source::Source,
    virtual_output::VirtualOutputAsset,
};
use turbopack_ecmascript::resolve::cjs_resolve;

use crate::{
    dynamic_imports::{NextDynamicChunkAvailability, collect_next_dynamic_chunks},
    font::FontManifest,
    loadable_manifest::create_react_loadable_manifest,
    module_graph::get_global_information_for_endpoint,
    nft_json::NftJsonAsset,
    paths::{
        all_paths_in_root, all_server_paths, get_asset_paths_from_root, get_js_paths_from_root,
        get_wasm_paths_from_root, paths_to_bindings, wasm_paths_to_bindings,
    },
    project::{ModuleGraphs, Project},
    route::{AppPageRoute, Endpoint, EndpointOutput, EndpointOutputPaths, Route, Routes},
    server_actions::{build_server_actions_loader, create_server_actions_manifest},
    webpack_stats::generate_webpack_stats,
};

#[turbo_tasks::value]
pub struct AppProject {
    project: ResolvedVc<Project>,
    app_dir: FileSystemPath,
}

#[turbo_tasks::value(transparent)]
pub struct OptionAppProject(Option<ResolvedVc<AppProject>>);

impl AppProject {}
impl AppProject {
    pub fn client_transition_name() -> RcStr {
        rcstr!("next-ecmascript-client-reference")
    }
}

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
            ecmascript_client_reference_transition_name: Some(Self::client_transition_name()),
        }
        .cell())
    }

    #[turbo_tasks::function]
    async fn route_ty(self: Vc<Self>) -> Result<Vc<ServerContextType>> {
        let this = self.await?;
        Ok(ServerContextType::AppRoute {
            app_dir: this.app_dir.clone(),
            ecmascript_client_reference_transition_name: Some(Self::client_transition_name()),
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
            self.project.next_mode(),
        )
    }

    #[turbo_tasks::function]
    async fn collected_root_params(self: Vc<Self>) -> Result<Vc<CollectedRootParams>> {
        Ok(collect_root_params(self.app_entrypoints()))
    }

    #[turbo_tasks::function]
    async fn client_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        Ok(get_client_module_options_context(
            self.project().project_path().owned().await?,
            self.project().execution_context(),
            self.project().client_compile_time_info().environment(),
            self.client_ty().owned().await?,
            self.project().next_mode(),
            self.project().next_config(),
            self.project().encryption_key(),
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
        Ok(get_server_module_options_context(
            self.project().project_path().owned().await?,
            self.project().execution_context(),
            self.rsc_ty().owned().await?,
            self.project().next_mode(),
            self.project().next_config(),
            NextRuntime::NodeJs,
            self.project().encryption_key(),
            self.project().server_compile_time_info().environment(),
            self.project().client_compile_time_info().environment(),
        ))
    }

    #[turbo_tasks::function]
    async fn edge_rsc_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        Ok(get_server_module_options_context(
            self.project().project_path().owned().await?,
            self.project().execution_context(),
            self.rsc_ty().owned().await?,
            self.project().next_mode(),
            self.project().next_config(),
            NextRuntime::Edge,
            self.project().encryption_key(),
            self.project().edge_compile_time_info().environment(),
            self.project().client_compile_time_info().environment(),
        ))
    }

    #[turbo_tasks::function]
    async fn route_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        Ok(get_server_module_options_context(
            self.project().project_path().owned().await?,
            self.project().execution_context(),
            self.route_ty().owned().await?,
            self.project().next_mode(),
            self.project().next_config(),
            NextRuntime::NodeJs,
            self.project().encryption_key(),
            self.project().server_compile_time_info().environment(),
            self.project().client_compile_time_info().environment(),
        ))
    }

    #[turbo_tasks::function]
    async fn edge_route_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        Ok(get_server_module_options_context(
            self.project().project_path().owned().await?,
            self.project().execution_context(),
            self.route_ty().owned().await?,
            self.project().next_mode(),
            self.project().next_config(),
            NextRuntime::Edge,
            self.project().encryption_key(),
            self.project().edge_compile_time_info().environment(),
            self.project().client_compile_time_info().environment(),
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
                    AppProject::client_transition_name(),
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
            ]
            .into_iter()
            .collect(),
            transition_rules: vec![
                // Mark as client reference (and exclude from RSC chunking) the edge from the
                // CSS Module to the actual CSS
                TransitionRule::new(
                    RuleCondition::all(vec![
                        RuleCondition::ReferenceType(ReferenceType::Css(
                            CssReferenceSubType::Inner,
                        )),
                        module_styles_rule_condition(),
                    ]),
                    self.css_client_reference_transition().to_resolved().await?,
                ),
                // Don't wrap in marker module but change context, this is used to determine
                // the list of CSS module classes.
                TransitionRule::new(
                    RuleCondition::all(vec![
                        RuleCondition::ReferenceType(ReferenceType::Css(
                            CssReferenceSubType::Analyze,
                        )),
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
    fn rsc_module_context(self: Vc<Self>) -> Result<Vc<ModuleAssetContext>> {
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
    async fn route_module_context(self: Vc<Self>) -> Result<Vc<ModuleAssetContext>> {
        let transitions = [
            (
                AppProject::client_transition_name(),
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
                AppProject::client_transition_name(),
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
                            RuleCondition::ReferenceType(ReferenceType::Css(
                                CssReferenceSubType::Analyze,
                            )),
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
                            RuleCondition::ReferenceType(ReferenceType::Css(
                                CssReferenceSubType::Analyze,
                            )),
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
    fn client_env(self: Vc<Self>) -> Vc<Box<dyn ProcessEnv>> {
        Vc::upcast(CustomProcessEnv::new(
            self.project().env(),
            self.project().next_config().env(),
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
        let app_entrypoints = self.app_entrypoints();
        Ok(Vc::cell(
            app_entrypoints
                .await?
                .iter()
                .map(|(pathname, app_entrypoint)| async {
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
            false,
        )
        .resolve()
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
        client_shared_entries: Vc<EvaluatableAssets>,
        has_layout_segments: bool,
    ) -> Result<Vc<ModuleGraphs>> {
        if *self.project.per_page_module_graph().await? {
            let should_trace = self.project.next_mode().await?.is_production();
            let client_shared_entries = client_shared_entries
                .await?
                .into_iter()
                .map(|m| ResolvedVc::upcast(*m))
                .collect();
            // Implements layout segment optimization to compute a graph "chain" for each layout
            // segment
            async move {
                let rsc_entry_chunk_group = ChunkGroupEntry::Entry(vec![rsc_entry]);

                let mut graphs = vec![];
                let mut visited_modules = if has_layout_segments {
                    let ServerEntries {
                        server_utils,
                        server_component_entries,
                    } = &*find_server_entries(*rsc_entry, should_trace).await?;

                    let graph = SingleModuleGraph::new_with_entries_visited_intern(
                        vec![
                            ChunkGroupEntry::SharedMerged {
                                parent: Box::new(rsc_entry_chunk_group.clone()),
                                merge_tag: NEXT_SERVER_UTILITY_MERGE_TAG.clone(),
                                entries: server_utils
                                    .iter()
                                    .map(async |m| Ok(ResolvedVc::upcast(m.await?.module)))
                                    .try_join()
                                    .await?,
                            },
                            ChunkGroupEntry::Entry(client_shared_entries),
                        ],
                        VisitedModules::empty(),
                        should_trace,
                    );
                    graphs.push(graph);
                    let mut visited_modules = VisitedModules::from_graph(graph);

                    // Skip the last server component, which is the page itself, because that one
                    // won't have it's visited modules added, and will be visited in the next step
                    // as part of rsc_entry
                    for module in server_component_entries
                        .iter()
                        .take(server_component_entries.len().saturating_sub(1))
                    {
                        let graph = SingleModuleGraph::new_with_entries_visited_intern(
                            // This should really be ChunkGroupEntry::Shared(module.await?.module),
                            // but that breaks everything for some reason.
                            vec![ChunkGroupEntry::Entry(vec![ResolvedVc::upcast(*module)])],
                            visited_modules,
                            should_trace,
                        );
                        graphs.push(graph);
                        let is_layout = module.server_path().await?.file_stem() == Some("layout");
                        visited_modules = if is_layout {
                            // Only propagate the visited_modules of the parent layout(s), not
                            // across siblings such as loading.js and
                            // page.js.
                            visited_modules.concatenate(graph)
                        } else {
                            // Prevents graph index from getting out of sync.
                            // TODO We should remove VisitedModule entirely in favor of lookups
                            // in SingleModuleGraph
                            visited_modules.with_incremented_index()
                        };
                    }
                    visited_modules
                } else {
                    let graph = SingleModuleGraph::new_with_entries_visited_intern(
                        vec![ChunkGroupEntry::Entry(client_shared_entries)],
                        VisitedModules::empty(),
                        should_trace,
                    );
                    graphs.push(graph);
                    VisitedModules::from_graph(graph)
                };

                let graph = SingleModuleGraph::new_with_entries_visited_intern(
                    vec![rsc_entry_chunk_group],
                    visited_modules,
                    should_trace,
                );
                graphs.push(graph);
                visited_modules = visited_modules.concatenate(graph);

                let base = ModuleGraph::from_graphs(graphs.clone());
                let additional_entries = endpoint.additional_entries(base);
                let additional_module_graph = SingleModuleGraph::new_with_entries_visited_intern(
                    additional_entries.owned().await?,
                    visited_modules,
                    should_trace,
                );
                graphs.push(additional_module_graph);

                let full = ModuleGraph::from_graphs(graphs);
                Ok(ModuleGraphs {
                    base: base.to_resolved().await?,
                    full: full.to_resolved().await?,
                }
                .cell())
            }
            .instrument(tracing::info_span!("module graph for endpoint"))
            .await
        } else {
            Ok(self.project.whole_app_module_graphs())
        }
    }
}

#[turbo_tasks::function]
pub fn app_entry_point_to_route(
    app_project: ResolvedVc<AppProject>,
    entrypoint: AppEntrypoint,
) -> Vc<Route> {
    match entrypoint {
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
                    rsc_endpoint: ResolvedVc::upcast(
                        AppEndpoint {
                            ty: AppEndpointType::Page {
                                ty: AppPageEndpointType::Rsc,
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
        AppEntrypoint::AppRoute {
            page,
            path,
            root_layouts,
            ..
        } => Route::AppRoute {
            original_name: page.to_string().into(),
            endpoint: ResolvedVc::upcast(
                AppEndpoint {
                    ty: AppEndpointType::Route { path, root_layouts },
                    app_project,
                    page,
                }
                .resolved_cell(),
            ),
        },
        AppEntrypoint::AppMetadata { page, metadata, .. } => Route::AppRoute {
            original_name: page.to_string().into(),
            endpoint: ResolvedVc::upcast(
                AppEndpoint {
                    ty: AppEndpointType::Metadata { metadata },
                    app_project,
                    page,
                }
                .resolved_cell(),
            ),
        },
    }
    .cell()
}

#[turbo_tasks::value(transparent)]
struct OutputAssetsWithAvailability((ResolvedVc<OutputAssets>, AvailabilityInfo));

#[derive(Copy, Clone, Serialize, Deserialize, PartialEq, Eq, Debug, TraceRawVcs, NonLocalValue)]
enum AppPageEndpointType {
    Html,
    Rsc,
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq, Debug, TraceRawVcs, NonLocalValue)]
enum AppEndpointType {
    Page {
        ty: AppPageEndpointType,
        loader_tree: ResolvedVc<AppPageLoaderTree>,
    },
    Route {
        path: FileSystemPath,
        root_layouts: ResolvedVc<FileSystemPathVec>,
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
        root_layouts: Vc<FileSystemPathVec>,
        next_config: Vc<NextConfig>,
    ) -> Result<Vc<AppEntry>> {
        let root_layouts = root_layouts.await?;
        let config = if root_layouts.is_empty() {
            None
        } else {
            let mut config = NextSegmentConfig::default();

            for layout in root_layouts.iter().rev() {
                let source = Vc::upcast(FileSource::new(layout.clone()));
                let layout_config = parse_segment_config_from_source(source, ParseSegmentMode::App);
                config.apply_parent_config(&*layout_config.await?);
            }

            Some(config.cell())
        };

        Ok(get_app_route_entry(
            self.app_project.route_module_context(),
            self.app_project.edge_route_module_context(),
            Vc::upcast(FileSource::new(path)),
            self.page.clone(),
            self.app_project.project().project_path().owned().await?,
            config,
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
            AppEndpointType::Route { path, root_layouts } => {
                self.app_route_entry(path.clone(), **root_layouts, next_config)
            }
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
                if is_app_page {
                    this.app_project.client_runtime_entries()
                } else {
                    EvaluatableAssets::empty()
                },
                is_app_page,
            )
            .await?;

        let client_chunking_context = project.client_chunking_context().to_resolved().await?;

        let ssr_chunking_context = if process_ssr {
            Some(
                match runtime {
                    NextRuntime::NodeJs => Vc::upcast(project.server_chunking_context(true)),
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

        // We only need the client runtime entries for pages not for Route Handlers
        let (availability_info, client_shared_chunks) = if is_app_page {
            let client_shared_chunk_group = get_app_client_shared_chunk_group(
                AssetIdent::from_path(project.project_path().owned().await?)
                    .with_modifier(rcstr!("client-shared-chunks")),
                this.app_project.client_runtime_entries(),
                *module_graphs.full,
                *client_chunking_context,
            )
            .await?;

            client_assets.extend(client_shared_chunk_group.referenced_assets.await?);

            let client_shared_chunks = client_shared_chunk_group.assets.owned().await?;
            client_assets.extend(client_shared_chunks.iter().copied());

            (
                client_shared_chunk_group.availability_info,
                client_shared_chunks,
            )
        } else {
            (AvailabilityInfo::Root, vec![])
        };

        let global_information = get_global_information_for_endpoint(
            *module_graphs.base,
            *project.per_page_module_graph().await?,
        );
        let next_dynamic_imports = global_information
            .get_next_dynamic_imports_for_endpoint(*rsc_entry)
            .await?;

        let client_references = global_information
            .get_client_references_for_endpoint(
                *rsc_entry,
                matches!(this.ty, AppEndpointType::Page { .. }),
                project.next_mode().await?.is_production(),
            )
            .to_resolved()
            .await?;

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

        for OutputAssetsWithReferenced {
            assets,
            referenced_assets,
        } in client_references_chunks_ref
            .layout_segment_client_chunks
            .values()
        {
            client_assets.extend(assets.await?.iter().copied());
            client_assets.extend(referenced_assets.await?.iter().copied());
        }
        for ChunkGroupResult {
            assets,
            referenced_assets,
            availability_info: _,
        } in client_references_chunks_ref
            .client_component_client_chunks
            .values()
        {
            client_assets.extend(assets.await?.iter().copied());
            client_assets.extend(referenced_assets.await?.iter().copied());
        }
        for ChunkGroupResult {
            assets,
            referenced_assets,
            availability_info: _,
        } in client_references_chunks_ref
            .client_component_ssr_chunks
            .values()
        {
            // TODO(alexkirsz) In which manifest does this go?
            server_assets.extend(assets.await?.iter().copied());
            server_assets.extend(referenced_assets.await?.iter().copied());
        }

        let manifest_path_prefix = &app_entry.original_name;

        // polyfill-nomodule.js is a pre-compiled asset distributed as part of next,
        // load it as a RawModule.
        let next_package = get_next_package(project.project_path().owned().await?).await?;
        let polyfill_source =
            FileSource::new(next_package.join("dist/build/polyfills/polyfill-nomodule.js")?);
        let polyfill_output_path = client_chunking_context
            .chunk_path(
                Some(Vc::upcast(polyfill_source)),
                polyfill_source.ident(),
                None,
                rcstr!(".js"),
            )
            .owned()
            .await?;
        let polyfill_output_asset = ResolvedVc::upcast(
            RawOutput::new(polyfill_output_path, Vc::upcast(polyfill_source))
                .to_resolved()
                .await?,
        );
        client_assets.insert(polyfill_output_asset);

        if emit_manifests != EmitManifests::None {
            if *this
                .app_project
                .project()
                .should_create_webpack_stats()
                .await?
            {
                let webpack_stats = generate_webpack_stats(
                    *module_graphs.base,
                    app_entry.original_name.clone(),
                    client_assets.iter().copied(),
                )
                .await?;
                let stats_output = VirtualOutputAsset::new(
                    node_root.join(&format!(
                        "server/app{manifest_path_prefix}/webpack-stats.json",
                    ))?,
                    AssetContent::file(
                        File::from(serde_json::to_string_pretty(&webpack_stats)?).into(),
                    ),
                )
                .to_resolved()
                .await?;
                server_assets.insert(ResolvedVc::upcast(stats_output));
            }

            let build_manifest = BuildManifest {
                output_path: node_root.join(&format!(
                    "server/app{manifest_path_prefix}/build-manifest.json",
                ))?,
                client_relative_path: client_relative_path.clone(),
                pages: Default::default(),
                root_main_files: client_shared_chunks,
                polyfill_files: vec![polyfill_output_asset],
            };
            server_assets.insert(ResolvedVc::upcast(build_manifest.resolved_cell()));
        }

        if runtime == NextRuntime::Edge {
            // as the edge runtime doesn't support chunk loading we need to add all client
            // references to the middleware manifest so they get loaded during runtime
            // initialization
            let client_references_chunks = &*client_references_chunks.await?;

            for ChunkGroupResult {
                assets,
                referenced_assets,
                availability_info: _,
            } in client_references_chunks
                .client_component_ssr_chunks
                .values()
            {
                middleware_assets.extend(assets.await?);
                middleware_assets.extend(referenced_assets.await?);
            }
        }

        let actions = global_information.get_server_actions_for_endpoint(
            *rsc_entry,
            match runtime {
                NextRuntime::Edge => Vc::upcast(this.app_project.edge_rsc_module_context()),
                NextRuntime::NodeJs => Vc::upcast(this.app_project.rsc_module_context()),
            },
        );

        let server_action_manifest = create_server_actions_manifest(
            actions,
            project.project_path().owned().await?,
            node_root.clone(),
            app_entry.original_name.clone(),
            runtime,
            match runtime {
                NextRuntime::Edge => Vc::upcast(this.app_project.edge_rsc_module_context()),
                NextRuntime::NodeJs => Vc::upcast(this.app_project.rsc_module_context()),
            },
            *module_graphs.full,
            this.app_project
                .project()
                .runtime_chunking_context(process_client_assets, runtime),
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
        let app_entry_chunk_group_ref = app_entry_chunks.await?;
        let app_entry_chunks = app_entry_chunk_group_ref.assets;
        let app_entry_chunks_ref = app_entry_chunks.await?;
        server_assets.extend(app_entry_chunks_ref.iter().copied());
        server_assets.extend(
            app_entry_chunk_group_ref
                .referenced_assets
                .await?
                .iter()
                .copied(),
        );

        let client_assets = OutputAssets::new(client_assets.iter().map(|asset| **asset).collect())
            .to_resolved()
            .await?;

        // these references are important for turbotrace
        let mut client_reference_manifest = None;

        if emit_rsc_manifests {
            let entry_manifest = ResolvedVc::upcast(
                ClientReferenceManifest {
                    node_root: node_root.clone(),
                    client_relative_path: client_relative_path.clone(),
                    entry_name: app_entry.original_name.clone(),
                    client_references,
                    client_references_chunks,
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
                if emit_manifests == EmitManifests::Full {
                    file_paths_from_root.insert(rcstr!("server/next-font-manifest.js"));
                };
                if emit_rsc_manifests {
                    file_paths_from_root.insert(rcstr!("server/server-reference-manifest.js"));
                }

                let mut wasm_paths_from_root = fxindexset![];

                let node_root_value = node_root.clone();

                file_paths_from_root
                    .extend(get_js_paths_from_root(&node_root_value, &middleware_assets).await?);
                file_paths_from_root
                    .extend(get_js_paths_from_root(&node_root_value, &app_entry_chunks_ref).await?);

                let all_output_assets = all_assets_from_entries(*app_entry_chunks).await?;

                wasm_paths_from_root
                    .extend(get_wasm_paths_from_root(&node_root_value, &middleware_assets).await?);
                wasm_paths_from_root
                    .extend(get_wasm_paths_from_root(&node_root_value, &all_output_assets).await?);

                let all_assets =
                    get_asset_paths_from_root(&node_root_value, &all_output_assets).await?;

                let entry_file = rcstr!("app-edge-has-no-entrypoint");

                if emit_manifests == EmitManifests::Full {
                    let dynamic_import_entries = collect_next_dynamic_chunks(
                        *module_graphs.full,
                        *client_chunking_context,
                        next_dynamic_imports,
                        NextDynamicChunkAvailability::ClientReferences(
                            &*(client_references_chunks.await?),
                        ),
                    )
                    .await?;

                    let loadable_manifest_output = create_react_loadable_manifest(
                        *dynamic_import_entries,
                        client_relative_path.clone(),
                        node_root.join(&format!(
                            "server/app{}/react-loadable-manifest",
                            &app_entry.original_name
                        ))?,
                        NextRuntime::Edge,
                    )
                    .await?;

                    server_assets.extend(loadable_manifest_output.iter().copied());
                    file_paths_from_root.extend(
                        get_js_paths_from_root(&node_root_value, &loadable_manifest_output).await?,
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
                    let edge_function_definition = EdgeFunctionDefinition {
                        files: file_paths_from_root.into_iter().collect(),
                        wasm: wasm_paths_to_bindings(wasm_paths_from_root).await?,
                        assets: paths_to_bindings(all_assets),
                        name: app_function_name(&app_entry.original_name).into(),
                        page: app_entry.original_name.clone(),
                        regions: app_entry
                            .config
                            .await?
                            .preferred_region
                            .clone()
                            .map(Regions::Multiple),
                        matchers: vec![matchers],
                        env: project.edge_env().owned().await?,
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

                AppEndpointOutput::Edge {
                    files: app_entry_chunks,
                    server_assets: ResolvedVc::cell(
                        server_assets.iter().cloned().collect::<Vec<_>>(),
                    ),
                    client_assets,
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
                        NextDynamicChunkAvailability::ClientReferences(
                            &*(client_references_chunks.await?),
                        ),
                    )
                    .await?;

                    let loadable_manifest_output = create_react_loadable_manifest(
                        *dynamic_import_entries,
                        client_relative_path.clone(),
                        node_root.join(&format!(
                            "server/app{}/react-loadable-manifest",
                            &app_entry.original_name
                        ))?,
                        NextRuntime::NodeJs,
                    )
                    .await?;

                    server_assets.extend(loadable_manifest_output.iter().copied());
                    Some(loadable_manifest_output)
                } else {
                    None
                };

                if this
                    .app_project
                    .project()
                    .next_mode()
                    .await?
                    .is_production()
                {
                    server_assets.insert(ResolvedVc::upcast(
                        NftJsonAsset::new(
                            project,
                            Some(app_function_name(&app_entry.original_name).into()),
                            *rsc_chunk,
                            client_reference_manifest
                                .iter()
                                .copied()
                                .chain(loadable_manifest_output.iter().flat_map(|m| &**m).copied())
                                .map(|m| *m)
                                .collect(),
                        )
                        .to_resolved()
                        .await?,
                    ));
                }

                AppEndpointOutput::NodeJs {
                    rsc_chunk,
                    server_assets: ResolvedVc::cell(
                        server_assets.iter().cloned().collect::<Vec<_>>(),
                    ),
                    client_assets,
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
                let ChunkGroupResult {
                    assets,
                    referenced_assets,
                    availability_info,
                } = *chunking_context
                    .chunk_group(
                        server_action_manifest_loader.ident(),
                        ChunkGroup::Entry(
                            [ResolvedVc::upcast(server_action_manifest_loader)]
                                .into_iter()
                                .collect(),
                        ),
                        module_graph,
                        AvailabilityInfo::Root,
                    )
                    .await?;

                let chunk_group = chunking_context
                    .evaluated_chunk_group_assets(
                        app_entry.rsc_entry.ident(),
                        ChunkGroup::Entry(vec![app_entry.rsc_entry]),
                        module_graph,
                        availability_info,
                    )
                    .await?;
                OutputAssetsWithReferenced {
                    assets: assets
                        .concatenate(*chunk_group.assets)
                        .to_resolved()
                        .await?,
                    referenced_assets: referenced_assets
                        .concatenate(*chunk_group.referenced_assets)
                        .to_resolved()
                        .await?,
                }
                .cell()
            }
            NextRuntime::NodeJs => {
                let Some(rsc_entry) = ResolvedVc::try_downcast(app_entry.rsc_entry) else {
                    bail!("rsc_entry must be evaluatable");
                };

                let evaluatable_assets = Vc::cell(vec![rsc_entry]);

                async {
                    let mut current_chunks = OutputAssets::empty();
                    let mut current_referenced_assets = OutputAssets::empty();
                    let mut current_availability_info = AvailabilityInfo::Root;

                    let client_references = client_references.await?;
                    let span = tracing::trace_span!("server utils");
                    async {
                        let server_utils = client_references
                            .server_utils
                            .iter()
                            .map(async |m| Ok(ResolvedVc::upcast(m.await?.module)))
                            .try_join()
                            .await?;
                        let ChunkGroupResult {
                            assets,
                            referenced_assets,
                            availability_info,
                        } = *chunking_context
                            .chunk_group(
                                AssetIdent::from_path(
                                    this.app_project.project().project_path().owned().await?,
                                )
                                .with_modifier(rcstr!("server-utils")),
                                // TODO this should be ChunkGroup::Shared
                                ChunkGroup::Entry(server_utils),
                                module_graph,
                                current_availability_info,
                            )
                            .await?;

                        current_chunks = current_chunks.concatenate(*assets).resolve().await?;
                        current_referenced_assets = current_referenced_assets
                            .concatenate(*referenced_assets)
                            .resolve()
                            .await?;
                        current_availability_info = availability_info;

                        anyhow::Ok(())
                    }
                    .instrument(span)
                    .await?;
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
                            let ChunkGroupResult {
                                assets,
                                referenced_assets,
                                availability_info,
                            } = *chunking_context
                                .chunk_group(
                                    server_component.ident(),
                                    // TODO this should be ChunkGroup::Shared
                                    ChunkGroup::Entry(vec![ResolvedVc::upcast(
                                        server_component.await?.module,
                                    )]),
                                    module_graph,
                                    current_availability_info,
                                )
                                .await?;

                            current_chunks = current_chunks.concatenate(*assets).resolve().await?;
                            current_referenced_assets = current_referenced_assets
                                .concatenate(*referenced_assets)
                                .resolve()
                                .await?;
                            current_availability_info = availability_info;

                            anyhow::Ok(())
                        }
                        .instrument(span)
                        .await?;
                    }

                    {
                        let ChunkGroupResult {
                            assets,
                            referenced_assets,
                            availability_info,
                        } = *chunking_context
                            .chunk_group(
                                server_action_manifest_loader.ident(),
                                ChunkGroup::Entry(vec![ResolvedVc::upcast(
                                    server_action_manifest_loader,
                                )]),
                                module_graph,
                                current_availability_info,
                            )
                            .await?;

                        current_chunks = current_chunks.concatenate(*assets).resolve().await?;
                        current_referenced_assets = current_referenced_assets
                            .concatenate(*referenced_assets)
                            .resolve()
                            .await?;
                        current_availability_info = availability_info;
                    }

                    anyhow::Ok(
                        OutputAssetsWithReferenced {
                            assets: ResolvedVc::cell(vec![
                                chunking_context
                                    .entry_chunk_group_asset(
                                        server_path.join(&format!(
                                            "app{original_name}.js",
                                            original_name = app_entry.original_name
                                        ))?,
                                        evaluatable_assets,
                                        module_graph,
                                        current_chunks,
                                        current_referenced_assets,
                                        current_availability_info,
                                    )
                                    .to_resolved()
                                    .await?,
                            ]),
                            referenced_assets: ResolvedVc::cell(vec![]),
                        }
                        .cell(),
                    )
                }
                .instrument(tracing::trace_span!("server node entrypoint"))
                .await?
            }
        })
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
                File::from(serde_json::to_string_pretty(&app_paths_manifest)?).into(),
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
                ty: AppPageEndpointType::Rsc,
                ..
            } => {
                tracing::info_span!("app endpoint RSC", name = page_name)
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
            let output_assets = output.output_assets();
            let output = output.await?;
            let node_root = &*this.app_project.project().node_root().await?;

            let (server_paths, client_paths) = if this
                .app_project
                .project()
                .next_mode()
                .await?
                .is_development()
            {
                let node_root = this.app_project.project().node_root().owned().await?;
                let server_paths = all_server_paths(output_assets, node_root).owned().await?;

                let client_relative_root = this
                    .app_project
                    .project()
                    .client_relative_path()
                    .owned()
                    .await?;
                let client_paths = all_paths_in_root(output_assets, client_relative_root)
                    .owned()
                    .await?;
                (server_paths, client_paths)
            } else {
                (vec![], vec![])
            };

            let written_endpoint = match *output {
                AppEndpointOutput::NodeJs { rsc_chunk, .. } => EndpointOutputPaths::NodeJs {
                    server_entry_path: node_root
                        .get_path_to(&*rsc_chunk.path().await?)
                        .context("Node.js chunk entry path must be inside the node root")?
                        .into(),
                    server_paths,
                    client_paths,
                },
                AppEndpointOutput::Edge { .. } => EndpointOutputPaths::Edge {
                    server_paths,
                    client_paths,
                },
            };

            anyhow::Ok(
                EndpointOutput {
                    output_assets: output_assets.to_resolved().await?,
                    output_paths: written_endpoint.resolved_cell(),
                    project: this.app_project.project().to_resolved().await?,
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
    async fn entries(self: Vc<Self>) -> Result<Vc<GraphEntries>> {
        let this = self.await?;
        Ok(Vc::cell(vec![
            ChunkGroupEntry::Entry(vec![self.app_endpoint_entry().await?.rsc_entry]),
            ChunkGroupEntry::Entry(
                this.app_project
                    .client_runtime_entries()
                    .await?
                    .iter()
                    .copied()
                    .map(ResolvedVc::upcast)
                    .collect(),
            ),
        ]))
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

        let actions = get_global_information_for_endpoint(
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

        Ok(Vc::cell(vec![ChunkGroupEntry::Entry(vec![
            server_actions_loader,
        ])]))
    }
}

#[turbo_tasks::value]
enum AppEndpointOutput {
    NodeJs {
        rsc_chunk: ResolvedVc<Box<dyn OutputAsset>>,
        server_assets: ResolvedVc<OutputAssets>,
        client_assets: ResolvedVc<OutputAssets>,
    },
    Edge {
        files: ResolvedVc<OutputAssets>,
        server_assets: ResolvedVc<OutputAssets>,
        client_assets: ResolvedVc<OutputAssets>,
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
