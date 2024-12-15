use std::future::IntoFuture;

use anyhow::{Context, Result};
use next_core::{
    all_assets_from_entries,
    app_segment_config::NextSegmentConfig,
    app_structure::{
        get_entrypoints, AppPageLoaderTree, Entrypoint as AppEntrypoint,
        Entrypoints as AppEntrypoints, FileSystemPathVec, MetadataItem,
    },
    get_edge_resolve_options_context, get_next_package,
    next_app::{
        get_app_client_references_chunks, get_app_client_shared_chunk_group, get_app_page_entry,
        get_app_route_entry, include_modules_module::IncludeModulesModule,
        metadata::route::get_app_metadata_route_entry, AppEntry, AppPage,
    },
    next_client::{
        get_client_module_options_context, get_client_resolve_options_context,
        get_client_runtime_entries, ClientContextType, RuntimeEntries,
    },
    next_client_reference::{ClientReferenceGraphResult, NextEcmascriptClientReferenceTransition},
    next_config::NextConfig,
    next_dynamic::NextDynamicTransition,
    next_edge::route_regex::get_named_middleware_regex,
    next_manifests::{
        AppBuildManifest, AppPathsManifest, BuildManifest, ClientReferenceManifest,
        EdgeFunctionDefinition, MiddlewareMatcher, MiddlewaresManifestV2, PagesManifest, Regions,
    },
    next_server::{
        get_server_module_options_context, get_server_resolve_options_context,
        get_server_runtime_entries, ServerContextType,
    },
    next_server_utility::NextServerUtilityTransition,
    parse_segment_config_from_source,
    util::NextRuntime,
};
use serde::{Deserialize, Serialize};
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    fxindexmap, fxindexset, trace::TraceRawVcs, Completion, FxIndexSet, NonLocalValue, ResolvedVc,
    TryJoinIterExt, Value, ValueToString, Vc,
};
use turbo_tasks_env::{CustomProcessEnv, ProcessEnv};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbopack::{
    module_options::{transition_rule::TransitionRule, ModuleOptionsContext, RuleCondition},
    resolve_options_context::ResolveOptionsContext,
    transition::{ContextTransition, FullContextTransition, Transition, TransitionOptions},
    ModuleAssetContext,
};
use turbopack_core::{
    asset::AssetContent,
    chunk::{
        availability_info::AvailabilityInfo, ChunkingContext, ChunkingContextExt,
        EntryChunkGroupResult, EvaluatableAsset, EvaluatableAssets,
    },
    file_source::FileSource,
    ident::AssetIdent,
    module::{Module, Modules},
    output::{OutputAsset, OutputAssets},
    raw_output::RawOutput,
    resolve::{origin::PlainResolveOrigin, parse::Request, pattern::Pattern},
    source::Source,
    virtual_output::VirtualOutputAsset,
};
use turbopack_ecmascript::resolve::cjs_resolve;

use crate::{
    dynamic_imports::{collect_chunk_group, collect_evaluated_chunk_group},
    font::create_font_manifest,
    loadable_manifest::create_react_loadable_manifest,
    module_graph::get_reduced_graphs_for_endpoint,
    nft_json::NftJsonAsset,
    paths::{
        all_paths_in_root, all_server_paths, get_asset_paths_from_root, get_js_paths_from_root,
        get_wasm_paths_from_root, paths_to_bindings, wasm_paths_to_bindings,
    },
    project::Project,
    route::{AppPageRoute, Endpoint, Route, Routes, WrittenEndpoint},
    server_actions::create_server_actions_manifest,
    webpack_stats::generate_webpack_stats,
};

#[turbo_tasks::value]
pub struct AppProject {
    project: ResolvedVc<Project>,
    app_dir: ResolvedVc<FileSystemPath>,
}

#[turbo_tasks::value(transparent)]
pub struct OptionAppProject(Option<ResolvedVc<AppProject>>);

impl AppProject {}

pub(crate) const ECMASCRIPT_CLIENT_TRANSITION_NAME: &str = "next-ecmascript-client-reference";

fn styles_rule_condition() -> RuleCondition {
    RuleCondition::any(vec![
        RuleCondition::ResourcePathEndsWith(".css".into()),
        RuleCondition::ResourcePathEndsWith(".scss".into()),
        RuleCondition::ResourcePathEndsWith(".sass".into()),
    ])
}

#[turbo_tasks::value_impl]
impl AppProject {
    #[turbo_tasks::function]
    pub fn new(project: ResolvedVc<Project>, app_dir: ResolvedVc<FileSystemPath>) -> Vc<Self> {
        AppProject { project, app_dir }.cell()
    }

    #[turbo_tasks::function]
    fn project(&self) -> Vc<Project> {
        *self.project
    }

    #[turbo_tasks::function]
    fn app_dir(&self) -> Vc<FileSystemPath> {
        *self.app_dir
    }

    #[turbo_tasks::function]
    fn client_ty(&self) -> Vc<ClientContextType> {
        ClientContextType::App {
            app_dir: self.app_dir,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn rsc_ty(self: Vc<Self>) -> Result<Vc<ServerContextType>> {
        let this = self.await?;
        Ok(ServerContextType::AppRSC {
            app_dir: this.app_dir,
            client_transition: Some(ResolvedVc::upcast(
                self.client_transition().to_resolved().await?,
            )),
            ecmascript_client_reference_transition_name: Some(
                self.client_transition_name().to_resolved().await?,
            ),
        }
        .cell())
    }

    #[turbo_tasks::function]
    async fn route_ty(self: Vc<Self>) -> Result<Vc<ServerContextType>> {
        let this = self.await?;
        Ok(ServerContextType::AppRoute {
            app_dir: this.app_dir,
            ecmascript_client_reference_transition_name: Some(
                self.client_transition_name().to_resolved().await?,
            ),
        }
        .cell())
    }

    #[turbo_tasks::function]
    fn ssr_ty(&self) -> Vc<ServerContextType> {
        ServerContextType::AppSSR {
            app_dir: self.app_dir,
        }
        .cell()
    }

    #[turbo_tasks::function]
    fn app_entrypoints(&self) -> Vc<AppEntrypoints> {
        get_entrypoints(*self.app_dir, self.project.next_config().page_extensions())
    }

    #[turbo_tasks::function]
    async fn client_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        Ok(get_client_module_options_context(
            self.project().project_path(),
            self.project().execution_context(),
            self.project().client_compile_time_info().environment(),
            Value::new(self.client_ty().await?.clone_value()),
            self.project().next_mode(),
            self.project().next_config(),
        ))
    }

    #[turbo_tasks::function]
    async fn client_resolve_options_context(self: Vc<Self>) -> Result<Vc<ResolveOptionsContext>> {
        Ok(get_client_resolve_options_context(
            self.project().project_path(),
            Value::new(self.client_ty().await?.clone_value()),
            self.project().next_mode(),
            self.project().next_config(),
            self.project().execution_context(),
        ))
    }

    #[turbo_tasks::function]
    pub(crate) fn client_transition_name(self: Vc<Self>) -> Vc<RcStr> {
        Vc::cell(ECMASCRIPT_CLIENT_TRANSITION_NAME.into())
    }

    #[turbo_tasks::function]
    fn client_transition(self: Vc<Self>) -> Vc<FullContextTransition> {
        let module_context = self.client_module_context();
        FullContextTransition::new(module_context)
    }

    #[turbo_tasks::function]
    async fn rsc_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        Ok(get_server_module_options_context(
            self.project().project_path(),
            self.project().execution_context(),
            Value::new(self.rsc_ty().await?.clone_value()),
            self.project().next_mode(),
            self.project().next_config(),
            NextRuntime::NodeJs,
        ))
    }

    #[turbo_tasks::function]
    async fn edge_rsc_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        Ok(get_server_module_options_context(
            self.project().project_path(),
            self.project().execution_context(),
            Value::new(self.rsc_ty().await?.clone_value()),
            self.project().next_mode(),
            self.project().next_config(),
            NextRuntime::Edge,
        ))
    }

    #[turbo_tasks::function]
    async fn route_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        Ok(get_server_module_options_context(
            self.project().project_path(),
            self.project().execution_context(),
            Value::new(self.route_ty().await?.clone_value()),
            self.project().next_mode(),
            self.project().next_config(),
            NextRuntime::NodeJs,
        ))
    }

    #[turbo_tasks::function]
    async fn edge_route_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        Ok(get_server_module_options_context(
            self.project().project_path(),
            self.project().execution_context(),
            Value::new(self.route_ty().await?.clone_value()),
            self.project().next_mode(),
            self.project().next_config(),
            NextRuntime::Edge,
        ))
    }

    #[turbo_tasks::function]
    async fn rsc_resolve_options_context(self: Vc<Self>) -> Result<Vc<ResolveOptionsContext>> {
        Ok(get_server_resolve_options_context(
            self.project().project_path(),
            Value::new(self.rsc_ty().await?.clone_value()),
            self.project().next_mode(),
            self.project().next_config(),
            self.project().execution_context(),
        ))
    }

    #[turbo_tasks::function]
    async fn edge_rsc_resolve_options_context(self: Vc<Self>) -> Result<Vc<ResolveOptionsContext>> {
        Ok(get_edge_resolve_options_context(
            self.project().project_path(),
            Value::new(self.rsc_ty().await?.clone_value()),
            self.project().next_mode(),
            self.project().next_config(),
            self.project().execution_context(),
        ))
    }

    #[turbo_tasks::function]
    async fn route_resolve_options_context(self: Vc<Self>) -> Result<Vc<ResolveOptionsContext>> {
        Ok(get_server_resolve_options_context(
            self.project().project_path(),
            Value::new(self.route_ty().await?.clone_value()),
            self.project().next_mode(),
            self.project().next_config(),
            self.project().execution_context(),
        ))
    }

    #[turbo_tasks::function]
    async fn edge_route_resolve_options_context(
        self: Vc<Self>,
    ) -> Result<Vc<ResolveOptionsContext>> {
        Ok(get_edge_resolve_options_context(
            self.project().project_path(),
            Value::new(self.route_ty().await?.clone_value()),
            self.project().next_mode(),
            self.project().next_config(),
            self.project().execution_context(),
        ))
    }

    #[turbo_tasks::function]
    pub fn client_reference_transition(self: Vc<Self>) -> Vc<Box<dyn Transition>> {
        Vc::upcast(NextEcmascriptClientReferenceTransition::new(
            Vc::upcast(self.client_transition()),
            self.ssr_transition(),
        ))
    }

    #[turbo_tasks::function]
    pub fn edge_client_reference_transition(self: Vc<Self>) -> Vc<Box<dyn Transition>> {
        Vc::upcast(NextEcmascriptClientReferenceTransition::new(
            Vc::upcast(self.client_transition()),
            self.edge_ssr_transition(),
        ))
    }

    #[turbo_tasks::function]
    async fn rsc_module_context(self: Vc<Self>) -> Result<Vc<ModuleAssetContext>> {
        let transitions = [
            (
                ECMASCRIPT_CLIENT_TRANSITION_NAME.into(),
                self.client_reference_transition().to_resolved().await?,
            ),
            (
                "next-dynamic".into(),
                ResolvedVc::upcast(
                    NextDynamicTransition::new(Vc::upcast(self.client_transition()))
                        .to_resolved()
                        .await?,
                ),
            ),
            (
                "next-ssr".into(),
                ResolvedVc::upcast(self.ssr_transition().to_resolved().await?),
            ),
            (
                "next-shared".into(),
                ResolvedVc::upcast(self.shared_transition().to_resolved().await?),
            ),
            (
                "next-server-utility".into(),
                ResolvedVc::upcast(NextServerUtilityTransition::new().to_resolved().await?),
            ),
        ]
        .into_iter()
        .collect();
        Ok(ModuleAssetContext::new(
            TransitionOptions {
                named_transitions: transitions,
                transition_rules: vec![TransitionRule::new(
                    styles_rule_condition(),
                    Vc::upcast(self.client_transition()),
                )],
                ..Default::default()
            }
            .cell(),
            self.project().server_compile_time_info(),
            self.rsc_module_options_context(),
            self.rsc_resolve_options_context(),
            Vc::cell("app-rsc".into()),
        ))
    }

    #[turbo_tasks::function]
    async fn edge_rsc_module_context(self: Vc<Self>) -> Result<Vc<ModuleAssetContext>> {
        let transitions = [
            (
                ECMASCRIPT_CLIENT_TRANSITION_NAME.into(),
                self.edge_client_reference_transition()
                    .to_resolved()
                    .await?,
            ),
            (
                "next-dynamic".into(),
                ResolvedVc::upcast(
                    NextDynamicTransition::new(Vc::upcast(self.client_transition()))
                        .to_resolved()
                        .await?,
                ),
            ),
            (
                "next-ssr".into(),
                ResolvedVc::upcast(self.edge_ssr_transition().to_resolved().await?),
            ),
            (
                "next-shared".into(),
                ResolvedVc::upcast(self.edge_shared_transition().to_resolved().await?),
            ),
            (
                "next-server-utility".into(),
                ResolvedVc::upcast(NextServerUtilityTransition::new().to_resolved().await?),
            ),
        ]
        .into_iter()
        .collect();
        Ok(ModuleAssetContext::new(
            TransitionOptions {
                named_transitions: transitions,
                transition_rules: vec![TransitionRule::new(
                    styles_rule_condition(),
                    Vc::upcast(self.client_transition()),
                )],
                ..Default::default()
            }
            .cell(),
            self.project().edge_compile_time_info(),
            self.edge_rsc_module_options_context(),
            self.edge_rsc_resolve_options_context(),
            Vc::cell("app-edge-rsc".into()),
        ))
    }

    #[turbo_tasks::function]
    async fn route_module_context(self: Vc<Self>) -> Result<Vc<ModuleAssetContext>> {
        let transitions = [
            (
                ECMASCRIPT_CLIENT_TRANSITION_NAME.into(),
                self.client_reference_transition().to_resolved().await?,
            ),
            (
                "next-dynamic".into(),
                ResolvedVc::upcast(
                    NextDynamicTransition::new(Vc::upcast(self.client_transition()))
                        .to_resolved()
                        .await?,
                ),
            ),
            (
                "next-ssr".into(),
                ResolvedVc::upcast(self.ssr_transition().to_resolved().await?),
            ),
            (
                "next-shared".into(),
                ResolvedVc::upcast(self.shared_transition().to_resolved().await?),
            ),
            (
                "next-server-utility".into(),
                ResolvedVc::upcast(NextServerUtilityTransition::new().to_resolved().await?),
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
            self.project().server_compile_time_info(),
            self.route_module_options_context(),
            self.route_resolve_options_context(),
            Vc::cell("app-route".into()),
        ))
    }

    #[turbo_tasks::function]
    async fn edge_route_module_context(self: Vc<Self>) -> Result<Vc<ModuleAssetContext>> {
        let transitions = [
            (
                ECMASCRIPT_CLIENT_TRANSITION_NAME.into(),
                self.edge_client_reference_transition()
                    .to_resolved()
                    .await?,
            ),
            (
                "next-dynamic".into(),
                ResolvedVc::upcast(
                    NextDynamicTransition::new(Vc::upcast(self.client_transition()))
                        .to_resolved()
                        .await?,
                ),
            ),
            (
                "next-ssr".into(),
                ResolvedVc::upcast(self.edge_ssr_transition().to_resolved().await?),
            ),
            (
                "next-shared".into(),
                ResolvedVc::upcast(self.edge_shared_transition().to_resolved().await?),
            ),
            (
                "next-server-utility".into(),
                ResolvedVc::upcast(NextServerUtilityTransition::new().to_resolved().await?),
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
            self.project().edge_compile_time_info(),
            self.edge_route_module_options_context(),
            self.edge_route_resolve_options_context(),
            Vc::cell("app-edge-route".into()),
        ))
    }

    #[turbo_tasks::function]
    fn client_module_context(self: Vc<Self>) -> Vc<ModuleAssetContext> {
        ModuleAssetContext::new(
            Default::default(),
            self.project().client_compile_time_info(),
            self.client_module_options_context(),
            self.client_resolve_options_context(),
            Vc::cell("app-client".into()),
        )
    }

    #[turbo_tasks::function]
    async fn ssr_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        Ok(get_server_module_options_context(
            self.project().project_path(),
            self.project().execution_context(),
            Value::new(self.ssr_ty().await?.clone_value()),
            self.project().next_mode(),
            self.project().next_config(),
            NextRuntime::NodeJs,
        ))
    }

    #[turbo_tasks::function]
    async fn edge_ssr_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        Ok(get_server_module_options_context(
            self.project().project_path(),
            self.project().execution_context(),
            Value::new(self.ssr_ty().await?.clone_value()),
            self.project().next_mode(),
            self.project().next_config(),
            NextRuntime::Edge,
        ))
    }

    #[turbo_tasks::function]
    async fn ssr_resolve_options_context(self: Vc<Self>) -> Result<Vc<ResolveOptionsContext>> {
        Ok(get_server_resolve_options_context(
            self.project().project_path(),
            Value::new(self.ssr_ty().await?.clone_value()),
            self.project().next_mode(),
            self.project().next_config(),
            self.project().execution_context(),
        ))
    }

    #[turbo_tasks::function]
    async fn edge_ssr_resolve_options_context(self: Vc<Self>) -> Result<Vc<ResolveOptionsContext>> {
        Ok(get_edge_resolve_options_context(
            self.project().project_path(),
            Value::new(self.ssr_ty().await?.clone_value()),
            self.project().next_mode(),
            self.project().next_config(),
            self.project().execution_context(),
        ))
    }

    #[turbo_tasks::function]
    fn ssr_transition(self: Vc<Self>) -> Vc<ContextTransition> {
        ContextTransition::new(
            self.project().server_compile_time_info(),
            self.ssr_module_options_context(),
            self.ssr_resolve_options_context(),
            Vc::cell("app-ssr".into()),
        )
    }

    #[turbo_tasks::function]
    fn shared_transition(self: Vc<Self>) -> Vc<ContextTransition> {
        ContextTransition::new(
            self.project().server_compile_time_info(),
            self.ssr_module_options_context(),
            self.ssr_resolve_options_context(),
            Vc::cell("app-shared".into()),
        )
    }

    #[turbo_tasks::function]
    fn edge_ssr_transition(self: Vc<Self>) -> Vc<ContextTransition> {
        ContextTransition::new(
            self.project().edge_compile_time_info(),
            self.edge_ssr_module_options_context(),
            self.edge_ssr_resolve_options_context(),
            Vc::cell("app-edge-ssr".into()),
        )
    }

    #[turbo_tasks::function]
    fn edge_shared_transition(self: Vc<Self>) -> Vc<ContextTransition> {
        ContextTransition::new(
            self.project().edge_compile_time_info(),
            self.edge_ssr_module_options_context(),
            self.edge_ssr_resolve_options_context(),
            Vc::cell("app-edge-shared".into()),
        )
    }

    #[turbo_tasks::function]
    async fn runtime_entries(self: Vc<Self>) -> Result<Vc<RuntimeEntries>> {
        Ok(get_server_runtime_entries(
            Value::new(self.rsc_ty().await?.clone_value()),
            self.project().next_mode(),
        ))
    }

    #[turbo_tasks::function]
    fn rsc_runtime_entries(self: Vc<Self>) -> Vc<EvaluatableAssets> {
        self.runtime_entries()
            .resolve_entries(Vc::upcast(self.rsc_module_context()))
    }

    #[turbo_tasks::function]
    fn edge_rsc_runtime_entries(self: Vc<Self>) -> Vc<EvaluatableAssets> {
        self.runtime_entries()
            .resolve_entries(Vc::upcast(self.edge_rsc_module_context()))
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
            self.project().project_path(),
            Value::new(self.client_ty().await?.clone_value()),
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
                            .await?
                            .clone_value(),
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
                self.project().project_path().join("_".into()),
            )),
            Request::parse(Value::new(Pattern::Constant(
                "next/dist/client/app-next-turbopack.js".into(),
            ))),
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
}

#[turbo_tasks::function]
pub fn app_entry_point_to_route(
    app_project: ResolvedVc<AppProject>,
    entrypoint: AppEntrypoint,
) -> Vc<Route> {
    match entrypoint {
        AppEntrypoint::AppPage { pages, loader_tree } => Route::AppPage(
            pages
                .into_iter()
                .map(|page| AppPageRoute {
                    original_name: page.to_string(),
                    html_endpoint: Vc::upcast(
                        AppEndpoint {
                            ty: AppEndpointType::Page {
                                ty: AppPageEndpointType::Html,
                                loader_tree,
                            },
                            app_project,
                            page: page.clone(),
                        }
                        .cell(),
                    ),
                    rsc_endpoint: Vc::upcast(
                        AppEndpoint {
                            ty: AppEndpointType::Page {
                                ty: AppPageEndpointType::Rsc,
                                loader_tree,
                            },
                            app_project,
                            page,
                        }
                        .cell(),
                    ),
                })
                .collect(),
        ),
        AppEntrypoint::AppRoute {
            page,
            path,
            root_layouts,
        } => Route::AppRoute {
            original_name: page.to_string(),
            endpoint: ResolvedVc::upcast(
                AppEndpoint {
                    ty: AppEndpointType::Route { path, root_layouts },
                    app_project,
                    page,
                }
                .resolved_cell(),
            ),
        },
        AppEntrypoint::AppMetadata { page, metadata } => Route::AppRoute {
            original_name: page.to_string(),
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

#[turbo_tasks::function]
fn client_shared_chunks_modifier() -> Vc<RcStr> {
    Vc::cell("client-shared-chunks".into())
}

#[turbo_tasks::function]
fn server_utils_modifier() -> Vc<RcStr> {
    Vc::cell("server-utils".into())
}

#[turbo_tasks::value(transparent)]
struct OutputAssetsWithAvailability((ResolvedVc<OutputAssets>, AvailabilityInfo));

#[derive(Copy, Clone, Serialize, Deserialize, PartialEq, Eq, Debug, TraceRawVcs, NonLocalValue)]
enum AppPageEndpointType {
    Html,
    Rsc,
}

#[derive(Copy, Clone, Serialize, Deserialize, PartialEq, Eq, Debug, TraceRawVcs)]
enum AppEndpointType {
    Page {
        ty: AppPageEndpointType,
        loader_tree: ResolvedVc<AppPageLoaderTree>,
    },
    Route {
        path: ResolvedVc<FileSystemPath>,
        root_layouts: ResolvedVc<FileSystemPathVec>,
    },
    Metadata {
        metadata: MetadataItem,
    },
}

#[turbo_tasks::value(local)]
struct AppEndpoint {
    ty: AppEndpointType,
    app_project: ResolvedVc<AppProject>,
    page: AppPage,
}

#[turbo_tasks::value_impl]
impl AppEndpoint {
    #[turbo_tasks::function]
    fn app_page_entry(&self, loader_tree: Vc<AppPageLoaderTree>) -> Vc<AppEntry> {
        get_app_page_entry(
            self.app_project.rsc_module_context(),
            self.app_project.edge_rsc_module_context(),
            loader_tree,
            self.page.clone(),
            self.app_project.project().project_path(),
            self.app_project.project().next_config(),
        )
    }

    #[turbo_tasks::function]
    async fn app_route_entry(
        &self,
        path: Vc<FileSystemPath>,
        root_layouts: Vc<FileSystemPathVec>,
        next_config: Vc<NextConfig>,
    ) -> Result<Vc<AppEntry>> {
        let root_layouts = root_layouts.await?;
        let config = if root_layouts.is_empty() {
            None
        } else {
            let mut config = NextSegmentConfig::default();

            for layout in root_layouts.iter().rev() {
                let source = Vc::upcast(FileSource::new(**layout));
                let layout_config = parse_segment_config_from_source(source);
                config.apply_parent_config(&*layout_config.await?);
            }

            Some(config.cell())
        };

        Ok(get_app_route_entry(
            self.app_project.route_module_context(),
            self.app_project.edge_route_module_context(),
            Vc::upcast(FileSource::new(path)),
            self.page.clone(),
            self.app_project.project().project_path(),
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
            self.app_project.rsc_module_context(),
            self.app_project.edge_rsc_module_context(),
            self.app_project.project().project_path(),
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
        let app_entry = match this.ty {
            AppEndpointType::Page { loader_tree, .. } => self.app_page_entry(*loader_tree),
            AppEndpointType::Route { path, root_layouts } => {
                self.app_route_entry(*path, *root_layouts, next_config)
            }
            AppEndpointType::Metadata { metadata } => {
                self.app_metadata_entry(metadata, next_config)
            }
        };

        Ok(app_entry)
    }

    #[turbo_tasks::function]
    fn output_assets(self: Vc<Self>) -> Vc<OutputAssets> {
        self.output().output_assets()
    }

    #[turbo_tasks::function]
    async fn output(self: Vc<Self>) -> Result<Vc<AppEndpointOutput>> {
        let this = self.await?;

        let app_entry = self.app_endpoint_entry().await?;

        let (process_client_components, process_client_assets, process_ssr, emit_manifests) =
            match this.ty {
                AppEndpointType::Page { ty, .. } => (
                    true,
                    true,
                    matches!(ty, AppPageEndpointType::Html),
                    matches!(ty, AppPageEndpointType::Html),
                ),
                AppEndpointType::Route { .. } => (true, false, false, true),
                AppEndpointType::Metadata { .. } => (false, false, false, true),
            };

        let node_root = this.app_project.project().node_root();

        let client_relative_path = this.app_project.project().client_relative_path();

        let server_path = node_root.join("server".into());

        let mut server_assets = fxindexset![];
        let mut client_assets = fxindexset![];
        // assets to add to the middleware manifest (to be loaded in the edge runtime).
        let mut middleware_assets = vec![];

        let runtime = app_entry.config.await?.runtime.unwrap_or_default();

        let rsc_entry = app_entry.rsc_entry;

        let client_chunking_context = this.app_project.project().client_chunking_context();

        let ssr_chunking_context = if process_ssr {
            Some(match runtime {
                NextRuntime::NodeJs => {
                    Vc::upcast(this.app_project.project().server_chunking_context(true))
                }
                NextRuntime::Edge => this
                    .app_project
                    .project()
                    .edge_chunking_context(process_client_assets),
            })
        } else {
            None
        };

        let (next_dynamic_imports, client_references, client_references_chunks) =
            if process_client_components {
                let client_shared_chunk_group = get_app_client_shared_chunk_group(
                    AssetIdent::from_path(this.app_project.project().project_path())
                        .with_modifier(client_shared_chunks_modifier()),
                    this.app_project.client_runtime_entries(),
                    client_chunking_context,
                )
                .await?;

                let mut client_shared_chunks = vec![];
                for chunk in client_shared_chunk_group.assets.await?.iter().copied() {
                    client_assets.insert(chunk);

                    let chunk_path = chunk.ident().path().await?;
                    if chunk_path.extension_ref() == Some("js") {
                        client_shared_chunks.push(chunk);
                    }
                }
                let client_shared_availability_info = client_shared_chunk_group.availability_info;

                let reduced_graphs = get_reduced_graphs_for_endpoint(
                    this.app_project.project(),
                    *rsc_entry,
                    Vc::upcast(this.app_project.client_module_context()),
                );
                let next_dynamic_imports = reduced_graphs
                    .get_next_dynamic_imports_for_endpoint(*rsc_entry)
                    .await?;

                let client_references_cell =
                    reduced_graphs.get_client_references_for_endpoint(*rsc_entry);

                let client_references_chunks = get_app_client_references_chunks(
                    client_references_cell,
                    client_chunking_context,
                    Value::new(client_shared_availability_info),
                    ssr_chunking_context,
                );
                let client_references_chunks_ref = client_references_chunks.await?;

                let mut entry_client_chunks = FxIndexSet::default();
                // TODO(alexkirsz) In which manifest does this go?
                let mut entry_ssr_chunks = FxIndexSet::default();
                for chunks in client_references_chunks_ref
                    .layout_segment_client_chunks
                    .values()
                {
                    entry_client_chunks.extend(chunks.await?.iter().copied());
                }
                for (chunks, _) in client_references_chunks_ref
                    .client_component_client_chunks
                    .values()
                {
                    client_assets.extend(chunks.await?.iter().copied());
                }
                for (chunks, _) in client_references_chunks_ref
                    .client_component_ssr_chunks
                    .values()
                {
                    entry_ssr_chunks.extend(chunks.await?.iter().copied());
                }

                client_assets.extend(entry_client_chunks.iter().copied());
                server_assets.extend(entry_ssr_chunks.iter().copied());

                let manifest_path_prefix = &app_entry.original_name;

                if emit_manifests {
                    let app_build_manifest = AppBuildManifest {
                        pages: fxindexmap!(
                            app_entry.original_name.clone() => Vc::cell(entry_client_chunks
                                .iter()
                                .chain(client_shared_chunks.iter())
                                .copied()
                                .collect())
                        ),
                    };
                    let app_build_manifest_output =
                        app_build_manifest
                            .build_output(
                                node_root.join(
                                    format!(
                                        "server/app{manifest_path_prefix}/app-build-manifest.json",
                                    )
                                    .into(),
                                ),
                                client_relative_path,
                            )
                            .await?
                            .to_resolved()
                            .await?;

                    server_assets.insert(app_build_manifest_output);
                }

                // polyfill-nomodule.js is a pre-compiled asset distributed as part of next,
                // load it as a RawModule.
                let next_package = get_next_package(this.app_project.project().project_path());
                let polyfill_source = FileSource::new(
                    next_package.join("dist/build/polyfills/polyfill-nomodule.js".into()),
                );
                let polyfill_output_path =
                    client_chunking_context.chunk_path(polyfill_source.ident(), ".js".into());
                let polyfill_output_asset = ResolvedVc::upcast(
                    RawOutput::new(polyfill_output_path, Vc::upcast(polyfill_source))
                        .to_resolved()
                        .await?,
                );
                client_assets.insert(polyfill_output_asset);

                if emit_manifests {
                    if *this
                        .app_project
                        .project()
                        .should_create_webpack_stats()
                        .await?
                    {
                        let webpack_stats =
                            generate_webpack_stats(app_entry.original_name.clone(), &client_assets)
                                .await?;
                        let stats_output = VirtualOutputAsset::new(
                            node_root.join(
                                format!("server/app{manifest_path_prefix}/webpack-stats.json",)
                                    .into(),
                            ),
                            AssetContent::file(
                                File::from(serde_json::to_string_pretty(&webpack_stats)?).into(),
                            ),
                        )
                        .to_resolved()
                        .await?;
                        server_assets.insert(ResolvedVc::upcast(stats_output));
                    }

                    let build_manifest = BuildManifest {
                        root_main_files: client_shared_chunks,
                        polyfill_files: vec![polyfill_output_asset],
                        ..Default::default()
                    };
                    let build_manifest_output =
                        ResolvedVc::upcast(
                            build_manifest
                                .build_output(
                                    node_root.join(
                                        format!(
                                            "server/app{manifest_path_prefix}/build-manifest.json",
                                        )
                                        .into(),
                                    ),
                                    client_relative_path,
                                )
                                .await?
                                .to_resolved()
                                .await?,
                        );
                    server_assets.insert(build_manifest_output);
                }

                if runtime == NextRuntime::Edge {
                    // as the edge runtime doesn't support chunk loading we need to add all client
                    // references to the middleware manifest so they get loaded during runtime
                    // initialization
                    let client_references_chunks = &*client_references_chunks.await?;

                    for (ssr_chunks, _) in client_references_chunks
                        .client_component_ssr_chunks
                        .values()
                    {
                        let ssr_chunks = ssr_chunks.await?;

                        middleware_assets.extend(ssr_chunks);
                    }
                }

                (
                    Some(next_dynamic_imports),
                    Some(client_references_cell),
                    Some(client_references_chunks),
                )
            } else {
                (None, None, None)
            };

        let server_action_manifest_loader = if process_client_components {
            let reduced_graphs = get_reduced_graphs_for_endpoint(
                this.app_project.project(),
                *rsc_entry,
                Vc::upcast(this.app_project.client_module_context()),
            );
            let actions = reduced_graphs.get_server_actions_for_endpoint(
                *rsc_entry,
                match runtime {
                    NextRuntime::Edge => Vc::upcast(this.app_project.edge_rsc_module_context()),
                    NextRuntime::NodeJs => Vc::upcast(this.app_project.rsc_module_context()),
                },
            );

            let server_action_manifest = create_server_actions_manifest(
                actions,
                this.app_project.project().project_path(),
                node_root,
                app_entry.original_name.clone(),
                runtime,
                match runtime {
                    NextRuntime::Edge => Vc::upcast(this.app_project.edge_rsc_module_context()),
                    NextRuntime::NodeJs => Vc::upcast(this.app_project.rsc_module_context()),
                },
                this.app_project
                    .project()
                    .runtime_chunking_context(process_client_assets, runtime),
            )
            .await?;
            server_assets.insert(server_action_manifest.manifest);
            Some(server_action_manifest.loader)
        } else {
            None
        };

        let (app_entry_chunks, app_entry_chunks_availability) = &*self
            .app_entry_chunks(
                client_references,
                server_action_manifest_loader.map(|v| *v),
                server_path,
                process_client_assets,
            )
            .await?;
        let app_entry_chunks_ref = app_entry_chunks.await?;
        server_assets.extend(app_entry_chunks_ref.iter().copied());

        let client_assets = OutputAssets::new(client_assets.iter().map(|asset| **asset).collect())
            .to_resolved()
            .await?;

        // these references are important for turbotrace
        let mut client_reference_manifest = None;

        if emit_manifests {
            if let (Some(client_references), Some(client_references_chunks)) =
                (client_references, client_references_chunks)
            {
                let entry_manifest = ClientReferenceManifest::build_output(
                    node_root,
                    client_relative_path,
                    app_entry.original_name.clone(),
                    client_references,
                    client_references_chunks,
                    **app_entry_chunks,
                    Value::new(*app_entry_chunks_availability),
                    client_chunking_context,
                    ssr_chunking_context,
                    this.app_project.project().next_config(),
                    runtime,
                    this.app_project.project().next_mode(),
                )
                .to_resolved()
                .await?;
                server_assets.insert(entry_manifest);
                if runtime == NextRuntime::Edge {
                    middleware_assets.push(entry_manifest);
                }
                client_reference_manifest = Some(entry_manifest)
            }

            let next_font_manifest_output = create_font_manifest(
                this.app_project.project().client_root(),
                node_root,
                this.app_project.app_dir(),
                &app_entry.original_name,
                &app_entry.original_name,
                &app_entry.original_name,
                *client_assets,
                true,
            )
            .await?;
            server_assets.insert(next_font_manifest_output);
        }

        let endpoint_output = match runtime {
            NextRuntime::Edge => {
                // the next-edge-ssr-loader templates expect the manifests to be stored in
                // global variables defined in these files
                //
                // they are created in `setup-dev-bundler.ts`
                let mut file_paths_from_root = vec![
                    "server/server-reference-manifest.js".into(),
                    "server/middleware-build-manifest.js".into(),
                    "server/middleware-react-loadable-manifest.js".into(),
                    "server/next-font-manifest.js".into(),
                    "server/interception-route-rewrite-manifest.js".into(),
                ];
                let mut wasm_paths_from_root = vec![];

                let node_root_value = node_root.await?;

                file_paths_from_root
                    .extend(get_js_paths_from_root(&node_root_value, &middleware_assets).await?);
                file_paths_from_root
                    .extend(get_js_paths_from_root(&node_root_value, &app_entry_chunks_ref).await?);

                let all_output_assets = all_assets_from_entries(**app_entry_chunks).await?;

                wasm_paths_from_root
                    .extend(get_wasm_paths_from_root(&node_root_value, &middleware_assets).await?);
                wasm_paths_from_root
                    .extend(get_wasm_paths_from_root(&node_root_value, &all_output_assets).await?);

                let all_assets =
                    get_asset_paths_from_root(&node_root_value, &all_output_assets).await?;

                let entry_file = "app-edge-has-no-entrypoint".into();

                if emit_manifests {
                    // create middleware manifest
                    let named_regex = get_named_middleware_regex(&app_entry.pathname);
                    let matchers = MiddlewareMatcher {
                        regexp: Some(named_regex.into()),
                        original_source: app_entry.pathname.clone(),
                        ..Default::default()
                    };
                    let edge_function_definition = EdgeFunctionDefinition {
                        files: file_paths_from_root,
                        wasm: wasm_paths_to_bindings(wasm_paths_from_root),
                        assets: paths_to_bindings(all_assets),
                        name: app_entry.pathname.clone(),
                        page: app_entry.original_name.clone(),
                        regions: app_entry
                            .config
                            .await?
                            .preferred_region
                            .clone()
                            .map(Regions::Multiple),
                        matchers: vec![matchers],
                        env: this.app_project.project().edge_env().await?.clone_value(),
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
                            node_root.join(
                                format!(
                                    "server/app{manifest_path_prefix}/middleware-manifest.json",
                                )
                                .into(),
                            ),
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

                    // create app paths manifest
                    let app_paths_manifest_output =
                        create_app_paths_manifest(node_root, &app_entry.original_name, entry_file)
                            .await?;
                    server_assets.insert(app_paths_manifest_output);

                    let dynamic_import_entries = collect_evaluated_chunk_group(
                        Vc::upcast(client_chunking_context),
                        next_dynamic_imports
                            .as_deref()
                            .unwrap_or(&Default::default()),
                    )
                    .await?;
                    let loadable_manifest_output = create_react_loadable_manifest(
                        dynamic_import_entries,
                        client_relative_path,
                        node_root.join(
                            format!(
                                "server/app{}/react-loadable-manifest.json",
                                &app_entry.original_name
                            )
                            .into(),
                        ),
                    );
                    server_assets.extend(loadable_manifest_output.await?.iter().copied());
                }

                AppEndpointOutput::Edge {
                    files: *app_entry_chunks,
                    server_assets: ResolvedVc::cell(
                        server_assets.iter().cloned().collect::<Vec<_>>(),
                    ),
                    client_assets,
                }
            }
            NextRuntime::NodeJs => {
                // For node, there will be exactly one asset in this
                let rsc_chunk = *app_entry_chunks_ref.first().unwrap();

                if emit_manifests {
                    // create app paths manifest
                    let app_paths_manifest_output = create_app_paths_manifest(
                        node_root,
                        &app_entry.original_name,
                        server_path
                            .await?
                            .get_path_to(&*rsc_chunk.ident().path().await?)
                            .context(
                                "RSC chunk path should be within app paths manifest directory",
                            )?
                            .into(),
                    )
                    .await?;
                    server_assets.insert(app_paths_manifest_output);

                    // create react-loadable-manifest for next/dynamic
                    let availability_info = Value::new(AvailabilityInfo::Root);
                    let dynamic_import_entries = collect_chunk_group(
                        Vc::upcast(client_chunking_context),
                        next_dynamic_imports
                            .as_deref()
                            .unwrap_or(&Default::default()),
                        availability_info,
                    )
                    .await?;
                    let loadable_manifest_output = create_react_loadable_manifest(
                        dynamic_import_entries,
                        client_relative_path,
                        node_root.join(
                            format!(
                                "server/app{}/react-loadable-manifest.json",
                                &app_entry.original_name
                            )
                            .into(),
                        ),
                    );
                    server_assets.extend(loadable_manifest_output.await?.iter().copied());
                }

                if this
                    .app_project
                    .project()
                    .next_mode()
                    .await?
                    .is_production()
                {
                    server_assets.insert(ResolvedVc::upcast(
                        NftJsonAsset::new(
                            this.app_project.project(),
                            *rsc_chunk,
                            client_reference_manifest.iter().map(|m| **m).collect(),
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
        client_references: Option<Vc<ClientReferenceGraphResult>>,
        server_action_manifest_loader: Option<Vc<Box<dyn EvaluatableAsset>>>,
        server_path: Vc<FileSystemPath>,
        process_client_assets: bool,
    ) -> Result<Vc<OutputAssetsWithAvailability>> {
        let this = self.await?;
        let app_entry = self.app_endpoint_entry().await?;
        let runtime = app_entry.config.await?.runtime.unwrap_or_default();

        let chunking_context = this
            .app_project
            .project()
            .runtime_chunking_context(process_client_assets, runtime);

        Ok(match runtime {
            NextRuntime::Edge => {
                let mut evaluatable_assets = this
                    .app_project
                    .edge_rsc_runtime_entries()
                    .await?
                    .clone_value();
                let evaluatable = ResolvedVc::try_sidecast(app_entry.rsc_entry)
                    .await?
                    .context("Entry module must be evaluatable")?;
                evaluatable_assets.push(evaluatable);

                if let Some(server_action_manifest_loader) = server_action_manifest_loader {
                    evaluatable_assets.push(server_action_manifest_loader.to_resolved().await?);
                }

                {
                    let _span = tracing::info_span!("Server Components");
                    Vc::cell((
                        chunking_context
                            .evaluated_chunk_group_assets(
                                app_entry.rsc_entry.ident(),
                                Vc::cell(evaluatable_assets.clone()),
                                Value::new(AvailabilityInfo::Root),
                            )
                            .to_resolved()
                            .await?,
                        AvailabilityInfo::Untracked,
                    ))
                }
            }
            NextRuntime::NodeJs => {
                let mut evaluatable_assets =
                    this.app_project.rsc_runtime_entries().await?.clone_value();

                if let Some(server_action_manifest_loader) = server_action_manifest_loader {
                    evaluatable_assets.push(server_action_manifest_loader.to_resolved().await?);
                }

                let EntryChunkGroupResult {
                    asset: rsc_chunk,
                    availability_info,
                } = *(async {
                    let mut current_chunks = OutputAssets::empty();
                    let mut current_availability_info = AvailabilityInfo::Root;
                    if let Some(client_references) = client_references {
                        let client_references = client_references.await?;
                        let span = tracing::trace_span!("server utils");
                        async {
                            let utils_module = IncludeModulesModule::new(
                                AssetIdent::from_path(this.app_project.project().project_path())
                                    .with_modifier(server_utils_modifier()),
                                client_references.server_utils.iter().map(|v| **v).collect(),
                            );

                            let chunk_group = chunking_context
                                .chunk_group(
                                    utils_module.ident(),
                                    Vc::upcast(utils_module),
                                    Value::new(current_availability_info),
                                )
                                .await?;

                            current_chunks = current_chunks
                                .concatenate(*chunk_group.assets)
                                .resolve()
                                .await?;
                            current_availability_info = chunk_group.availability_info;

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
                                name = server_component.ident().to_string().await?.as_str()
                            );
                            async {
                                let chunk_group = chunking_context
                                    .chunk_group(
                                        server_component.ident(),
                                        *ResolvedVc::upcast(server_component),
                                        Value::new(current_availability_info),
                                    )
                                    .await?;

                                current_chunks = current_chunks
                                    .concatenate(*chunk_group.assets)
                                    .resolve()
                                    .await?;
                                current_availability_info = chunk_group.availability_info;

                                anyhow::Ok(())
                            }
                            .instrument(span)
                            .await?;
                        }
                    }
                    chunking_context
                        .entry_chunk_group(
                            server_path.join(
                                format!(
                                    "app{original_name}.js",
                                    original_name = app_entry.original_name
                                )
                                .into(),
                            ),
                            *app_entry.rsc_entry,
                            Vc::cell(evaluatable_assets),
                            current_chunks,
                            Value::new(current_availability_info),
                        )
                        .await
                }
                .instrument(tracing::trace_span!("server node entrypoint"))
                .await?);
                Vc::cell((ResolvedVc::cell(vec![rsc_chunk]), availability_info))
            }
        })
    }
}

async fn create_app_paths_manifest(
    node_root: Vc<FileSystemPath>,
    original_name: &str,
    filename: RcStr,
) -> Result<ResolvedVc<Box<dyn OutputAsset>>> {
    let manifest_path_prefix = original_name;
    let path =
        node_root.join(format!("server/app{manifest_path_prefix}/app-paths-manifest.json",).into());
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
    async fn write_to_disk(self: Vc<Self>) -> Result<Vc<WrittenEndpoint>> {
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
            let output = self.output().await?;
            // Must use self.output_assets() instead of output.output_assets() to make it a
            // single operation
            let output_assets = self.output_assets();

            let node_root = this.app_project.project().node_root();

            let node_root_ref = &node_root.await?;

            let _ = this
                .app_project
                .project()
                .emit_all_output_assets(Vc::cell(output_assets));

            let (server_paths, client_paths) = if this
                .app_project
                .project()
                .next_mode()
                .await?
                .is_development()
            {
                let node_root = this.app_project.project().node_root();
                let server_paths = all_server_paths(output_assets, node_root)
                    .await?
                    .clone_value();

                let client_relative_root = this.app_project.project().client_relative_path();
                let client_paths = all_paths_in_root(output_assets, client_relative_root)
                    .into_future()
                    .instrument(tracing::info_span!("client_paths"))
                    .await?
                    .clone_value();
                (server_paths, client_paths)
            } else {
                (vec![], vec![])
            };

            let written_endpoint = match *output {
                AppEndpointOutput::NodeJs { rsc_chunk, .. } => WrittenEndpoint::NodeJs {
                    server_entry_path: node_root_ref
                        .get_path_to(&*rsc_chunk.ident().path().await?)
                        .context("Node.js chunk entry path must be inside the node root")?
                        .to_string(),
                    server_paths,
                    client_paths,
                },
                AppEndpointOutput::Edge { .. } => WrittenEndpoint::Edge {
                    server_paths,
                    client_paths,
                },
            };
            anyhow::Ok(written_endpoint.cell())
        }
        .instrument(span)
        .await
        .with_context(|| format!("Failed to write app endpoint {}", page_name))
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
    async fn root_modules(self: Vc<Self>) -> Result<Vc<Modules>> {
        let rsc_entry = self.app_endpoint_entry().await?.rsc_entry;
        Ok(Vc::cell(vec![rsc_entry]))
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
