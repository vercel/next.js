use anyhow::{bail, Context, Result};
use next_core::{
    app_structure::{
        get_entrypoints, Entrypoint as AppEntrypoint, Entrypoints as AppEntrypoints, LoaderTree,
        MetadataItem,
    },
    get_edge_resolve_options_context,
    mode::NextMode,
    next_app::{
        get_app_client_references_chunks, get_app_client_shared_chunks, get_app_page_entry,
        get_app_route_entry, metadata::route::get_app_metadata_route_entry, AppEntry, AppPage,
    },
    next_client::{
        get_client_module_options_context, get_client_resolve_options_context,
        get_client_runtime_entries, ClientContextType, RuntimeEntries,
    },
    next_client_reference::{
        ClientReferenceGraph, ClientReferenceType, NextEcmascriptClientReferenceTransition,
    },
    next_dynamic::{NextDynamicEntries, NextDynamicTransition},
    next_edge::route_regex::get_named_middleware_regex,
    next_manifests::{
        AppBuildManifest, AppPathsManifest, BuildManifest, ClientReferenceManifest,
        EdgeFunctionDefinition, MiddlewareMatcher, MiddlewaresManifestV2, PagesManifest, Regions,
    },
    next_server::{
        get_server_module_options_context, get_server_resolve_options_context,
        get_server_runtime_entries, ServerContextType,
    },
    util::{get_asset_prefix_from_pathname, NextRuntime},
};
use serde::{Deserialize, Serialize};
use turbo_tasks::{trace::TraceRawVcs, Completion, TryFlatJoinIterExt, TryJoinIterExt, Value, Vc};
use turbopack_binding::{
    turbo::{
        tasks_env::{CustomProcessEnv, ProcessEnv},
        tasks_fs::{rope::RopeBuilder, File, FileContent, FileSystemPath},
    },
    turbopack::{
        core::{
            asset::{Asset, AssetContent},
            chunk::{ChunkableModule, ChunkingContext, EvaluatableAssets},
            file_source::FileSource,
            output::{OutputAsset, OutputAssets},
            virtual_output::VirtualOutputAsset,
        },
        turbopack::{
            module_options::ModuleOptionsContext, resolve_options_context::ResolveOptionsContext,
            transition::ContextTransition, ModuleAssetContext,
        },
    },
};

use crate::{
    project::Project,
    route::{Endpoint, Route, Routes, WrittenEndpoint},
    server_paths::all_server_paths,
};

#[turbo_tasks::value]
pub struct AppProject {
    project: Vc<Project>,
    app_dir: Vc<FileSystemPath>,
    mode: NextMode,
}

#[turbo_tasks::value(transparent)]
pub struct OptionAppProject(Option<Vc<AppProject>>);

impl AppProject {
    fn client_ty(self: Vc<Self>) -> ClientContextType {
        ClientContextType::App {
            app_dir: self.app_dir(),
        }
    }

    fn rsc_ty(self: Vc<Self>) -> ServerContextType {
        ServerContextType::AppRSC {
            app_dir: self.app_dir(),
            client_transition: Some(Vc::upcast(self.client_transition())),
            ecmascript_client_reference_transition_name: Some(self.client_transition_name()),
        }
    }

    fn ssr_ty(self: Vc<Self>) -> ServerContextType {
        ServerContextType::AppSSR {
            app_dir: self.app_dir(),
        }
    }
}

const ECMASCRIPT_CLIENT_TRANSITION_NAME: &str = "next-ecmascript-client-reference";

#[turbo_tasks::value_impl]
impl AppProject {
    #[turbo_tasks::function]
    pub fn new(project: Vc<Project>, app_dir: Vc<FileSystemPath>, mode: NextMode) -> Vc<Self> {
        AppProject {
            project,
            app_dir,
            mode,
        }
        .cell()
    }

    #[turbo_tasks::function]
    fn project(&self) -> Vc<Project> {
        self.project
    }

    #[turbo_tasks::function]
    fn app_dir(&self) -> Vc<FileSystemPath> {
        self.app_dir
    }

    #[turbo_tasks::function]
    fn mode(&self) -> Vc<NextMode> {
        self.mode.cell()
    }

    #[turbo_tasks::function]
    fn app_entrypoints(&self) -> Vc<AppEntrypoints> {
        get_entrypoints(self.app_dir, self.project.next_config().page_extensions())
    }

    #[turbo_tasks::function]
    async fn client_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        let this = self.await?;
        Ok(get_client_module_options_context(
            self.project().project_path(),
            self.project().execution_context(),
            self.project().client_compile_time_info().environment(),
            Value::new(self.client_ty()),
            this.mode,
            self.project().next_config(),
        ))
    }

    #[turbo_tasks::function]
    async fn client_resolve_options_context(self: Vc<Self>) -> Result<Vc<ResolveOptionsContext>> {
        let this = self.await?;
        Ok(get_client_resolve_options_context(
            self.project().project_path(),
            Value::new(self.client_ty()),
            this.mode,
            self.project().next_config(),
            self.project().execution_context(),
        ))
    }

    #[turbo_tasks::function]
    fn client_transition_name(self: Vc<Self>) -> Vc<String> {
        Vc::cell(ECMASCRIPT_CLIENT_TRANSITION_NAME.to_string())
    }

    #[turbo_tasks::function]
    fn client_transition(self: Vc<Self>) -> Vc<ContextTransition> {
        ContextTransition::new(
            self.project().client_compile_time_info(),
            self.client_module_options_context(),
            self.client_resolve_options_context(),
        )
    }

    #[turbo_tasks::function]
    async fn rsc_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        let this = self.await?;
        Ok(get_server_module_options_context(
            self.project().project_path(),
            self.project().execution_context(),
            Value::new(self.rsc_ty()),
            this.mode,
            self.project().next_config(),
        ))
    }

    #[turbo_tasks::function]
    async fn rsc_resolve_options_context(self: Vc<Self>) -> Result<Vc<ResolveOptionsContext>> {
        let this = self.await?;
        Ok(get_server_resolve_options_context(
            self.project().project_path(),
            Value::new(self.rsc_ty()),
            this.mode,
            self.project().next_config(),
            self.project().execution_context(),
        ))
    }

    #[turbo_tasks::function]
    async fn edge_rsc_resolve_options_context(self: Vc<Self>) -> Result<Vc<ResolveOptionsContext>> {
        let this = self.await?;
        Ok(get_edge_resolve_options_context(
            self.project().project_path(),
            Value::new(self.rsc_ty()),
            this.mode,
            self.project().next_config(),
            self.project().execution_context(),
        ))
    }

    #[turbo_tasks::function]
    fn rsc_module_context(self: Vc<Self>) -> Vc<ModuleAssetContext> {
        let transitions = [
            (
                ECMASCRIPT_CLIENT_TRANSITION_NAME.to_string(),
                Vc::upcast(NextEcmascriptClientReferenceTransition::new(
                    self.client_transition(),
                    self.ssr_transition(),
                )),
            ),
            (
                "next-dynamic".to_string(),
                Vc::upcast(NextDynamicTransition::new(self.client_transition())),
            ),
            ("next-ssr".to_string(), Vc::upcast(self.ssr_transition())),
        ]
        .into_iter()
        .collect();
        ModuleAssetContext::new(
            Vc::cell(transitions),
            self.project().server_compile_time_info(),
            self.rsc_module_options_context(),
            self.rsc_resolve_options_context(),
        )
    }

    #[turbo_tasks::function]
    fn edge_rsc_module_context(self: Vc<Self>) -> Vc<ModuleAssetContext> {
        let transitions = [
            (
                ECMASCRIPT_CLIENT_TRANSITION_NAME.to_string(),
                Vc::upcast(NextEcmascriptClientReferenceTransition::new(
                    self.client_transition(),
                    self.ssr_transition(),
                )),
            ),
            (
                "next-dynamic".to_string(),
                Vc::upcast(NextDynamicTransition::new(self.client_transition())),
            ),
        ]
        .into_iter()
        .collect();
        ModuleAssetContext::new(
            Vc::cell(transitions),
            self.project().edge_compile_time_info(),
            self.rsc_module_options_context(),
            self.edge_rsc_resolve_options_context(),
        )
    }

    #[turbo_tasks::function]
    fn client_module_context(self: Vc<Self>) -> Vc<ModuleAssetContext> {
        ModuleAssetContext::new(
            Vc::cell(Default::default()),
            self.project().client_compile_time_info(),
            self.client_module_options_context(),
            self.client_resolve_options_context(),
        )
    }

    #[turbo_tasks::function]
    async fn ssr_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        let this = self.await?;
        Ok(get_server_module_options_context(
            self.project().project_path(),
            self.project().execution_context(),
            Value::new(self.ssr_ty()),
            this.mode,
            self.project().next_config(),
        ))
    }

    #[turbo_tasks::function]
    async fn ssr_resolve_options_context(self: Vc<Self>) -> Result<Vc<ResolveOptionsContext>> {
        let this = self.await?;
        Ok(get_server_resolve_options_context(
            self.project().project_path(),
            Value::new(self.ssr_ty()),
            this.mode,
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
        )
    }

    #[turbo_tasks::function]
    async fn runtime_entries(self: Vc<Self>) -> Result<Vc<RuntimeEntries>> {
        let this = self.await?;
        Ok(get_server_runtime_entries(
            Value::new(self.rsc_ty()),
            this.mode,
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
        let this = self.await?;
        Ok(get_client_runtime_entries(
            self.project().project_path(),
            Value::new(self.client_ty()),
            this.mode,
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
                        pathname.to_string(),
                        *app_entry_point_to_route(self, app_entrypoint.clone()).await?,
                    ))
                })
                .try_join()
                .await?
                .into_iter()
                .collect(),
        ))
    }
}

#[turbo_tasks::function]
pub async fn app_entry_point_to_route(
    app_project: Vc<AppProject>,
    entrypoint: AppEntrypoint,
) -> Vc<Route> {
    match entrypoint {
        AppEntrypoint::AppPage { page, loader_tree } => Route::AppPage {
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
        },
        AppEntrypoint::AppRoute { page, path } => Route::AppRoute {
            endpoint: Vc::upcast(
                AppEndpoint {
                    ty: AppEndpointType::Route { path },
                    app_project,
                    page,
                }
                .cell(),
            ),
        },
        AppEntrypoint::AppMetadata { page, metadata } => Route::AppRoute {
            endpoint: Vc::upcast(
                AppEndpoint {
                    ty: AppEndpointType::Metadata { metadata },
                    app_project,
                    page,
                }
                .cell(),
            ),
        },
    }
    .cell()
}

#[derive(Copy, Clone, Serialize, Deserialize, PartialEq, Eq, Debug, TraceRawVcs)]
enum AppPageEndpointType {
    Html,
    Rsc,
}

#[derive(Copy, Clone, Serialize, Deserialize, PartialEq, Eq, Debug, TraceRawVcs)]
enum AppEndpointType {
    Page {
        ty: AppPageEndpointType,
        loader_tree: Vc<LoaderTree>,
    },
    Route {
        path: Vc<FileSystemPath>,
    },
    Metadata {
        metadata: MetadataItem,
    },
}

#[turbo_tasks::value]
struct AppEndpoint {
    ty: AppEndpointType,
    app_project: Vc<AppProject>,
    page: AppPage,
}

#[turbo_tasks::value_impl]
impl AppEndpoint {
    #[turbo_tasks::function]
    fn app_page_entry(&self, loader_tree: Vc<LoaderTree>) -> Vc<AppEntry> {
        get_app_page_entry(
            self.app_project.rsc_module_context(),
            self.app_project.edge_rsc_module_context(),
            loader_tree,
            self.page.clone(),
            self.app_project.project().project_path(),
        )
    }

    #[turbo_tasks::function]
    fn app_route_entry(&self, path: Vc<FileSystemPath>) -> Vc<AppEntry> {
        get_app_route_entry(
            self.app_project.rsc_module_context(),
            self.app_project.edge_rsc_module_context(),
            Vc::upcast(FileSource::new(path)),
            self.page.clone(),
            self.app_project.project().project_path(),
        )
    }

    #[turbo_tasks::function]
    async fn app_metadata_entry(&self, metadata: MetadataItem) -> Result<Vc<AppEntry>> {
        Ok(get_app_metadata_route_entry(
            self.app_project.rsc_module_context(),
            self.app_project.edge_rsc_module_context(),
            self.app_project.project().project_path(),
            self.page.clone(),
            *self.app_project.mode().await?,
            metadata,
        ))
    }

    #[turbo_tasks::function]
    fn output_assets(self: Vc<Self>) -> Vc<OutputAssets> {
        self.output().output_assets()
    }

    #[turbo_tasks::function]
    async fn output(self: Vc<Self>) -> Result<Vc<AppEndpointOutput>> {
        let this = self.await?;

        let (app_entry, ty, ssr_and_client) = match this.ty {
            AppEndpointType::Page { ty, loader_tree } => (
                self.app_page_entry(loader_tree),
                "page",
                matches!(ty, AppPageEndpointType::Html),
            ),
            // NOTE(alexkirsz) For routes, technically, a lot of the following code is not needed,
            // as we know we won't have any client references. However, for now, for simplicity's
            // sake, we just do the same thing as for pages.
            AppEndpointType::Route { path } => (self.app_route_entry(path), "route", false),
            AppEndpointType::Metadata { metadata } => {
                (self.app_metadata_entry(metadata), "route", false)
            }
        };

        let node_root = this.app_project.project().node_root();

        let client_relative_path = this.app_project.project().client_relative_path();
        let client_relative_path_ref = client_relative_path.await?;

        let server_path = node_root.join("server".to_string());

        let mut server_assets = vec![];
        let mut client_assets = vec![];

        let client_shared_chunks = get_app_client_shared_chunks(
            this.app_project.client_runtime_entries(),
            this.app_project.project().client_chunking_context(),
        );

        let mut client_shared_chunks_paths = vec![];
        for chunk in client_shared_chunks.await?.iter().copied() {
            client_assets.push(chunk);

            let chunk_path = chunk.ident().path().await?;
            if chunk_path.extension_ref() == Some("js") {
                if let Some(chunk_path) = client_relative_path_ref.get_path_to(&chunk_path) {
                    client_shared_chunks_paths.push(chunk_path.to_string());
                }
            }
        }

        let app_entry = app_entry.await?;
        let rsc_entry = app_entry.rsc_entry;

        let rsc_entry_asset = Vc::upcast(rsc_entry);
        let client_reference_graph = ClientReferenceGraph::new(Vc::cell(vec![rsc_entry_asset]));
        let client_reference_types = client_reference_graph.types();
        let client_references = client_reference_graph.entry(rsc_entry_asset);

        let app_ssr_entries: Vec<_> = client_reference_types
            .await?
            .iter()
            .map(|client_reference_ty| async move {
                let ClientReferenceType::EcmascriptClientReference(entry) = client_reference_ty
                else {
                    return Ok(None);
                };

                Ok(Some(entry.await?.ssr_module))
            })
            .try_join()
            .await?
            .into_iter()
            .flatten()
            .collect();

        let app_node_entries: Vec<_> = app_ssr_entries.iter().copied().chain([rsc_entry]).collect();

        // TODO(alexkirsz) Handle dynamic entries and dynamic chunks.
        let _dynamic_entries = NextDynamicEntries::from_entries(Vc::cell(
            app_node_entries.iter().copied().map(Vc::upcast).collect(),
        ))
        .await?;

        let app_entry_client_references = client_reference_graph
            .entry(Vc::upcast(app_entry.rsc_entry))
            .await?;

        if ssr_and_client {
            let client_references_chunks = get_app_client_references_chunks(
                client_reference_types,
                this.app_project.project().client_chunking_context(),
                this.app_project.project().ssr_chunking_context(),
            );
            let client_references_chunks_ref = client_references_chunks.await?;

            let mut entry_client_chunks = vec![];
            // TODO(alexkirsz) In which manifest does this go?
            let mut entry_ssr_chunks = vec![];
            for client_reference in app_entry_client_references.iter() {
                let client_reference_chunks = client_references_chunks_ref
                    .get(client_reference.ty())
                    .expect("client reference should have corresponding chunks");
                entry_client_chunks
                    .extend(client_reference_chunks.client_chunks.await?.iter().copied());
                entry_ssr_chunks.extend(client_reference_chunks.ssr_chunks.await?.iter().copied());
            }

            client_assets.extend(entry_client_chunks.iter().copied());
            server_assets.extend(entry_ssr_chunks.iter().copied());

            let entry_client_chunks_paths = entry_client_chunks
                .iter()
                .map(|chunk| chunk.ident().path())
                .try_join()
                .await?;
            let mut entry_client_chunks_paths: Vec<_> = entry_client_chunks_paths
                .iter()
                .map(|path| {
                    client_relative_path_ref
                        .get_path_to(path)
                        .expect("asset path should be inside client root")
                        .to_string()
                })
                .collect();
            entry_client_chunks_paths.extend(client_shared_chunks_paths.iter().cloned());

            let app_build_manifest = AppBuildManifest {
                pages: [(app_entry.original_name.clone(), entry_client_chunks_paths)]
                    .into_iter()
                    .collect(),
            };
            let manifest_path_prefix = get_asset_prefix_from_pathname(&app_entry.pathname);
            let app_build_manifest_output = Vc::upcast(VirtualOutputAsset::new(
                node_root.join(format!(
                    "server/app{manifest_path_prefix}/{ty}/app-build-manifest.json",
                )),
                AssetContent::file(
                    File::from(serde_json::to_string_pretty(&app_build_manifest)?).into(),
                ),
            ));
            server_assets.push(app_build_manifest_output);

            let build_manifest = BuildManifest {
                root_main_files: client_shared_chunks_paths,
                ..Default::default()
            };
            let build_manifest_output = Vc::upcast(VirtualOutputAsset::new(
                node_root.join(format!(
                    "server/app{manifest_path_prefix}/{ty}/build-manifest.json",
                )),
                AssetContent::file(
                    File::from(serde_json::to_string_pretty(&build_manifest)?).into(),
                ),
            ));
            server_assets.push(build_manifest_output);

            let entry_manifest = ClientReferenceManifest::build_output(
                node_root,
                client_relative_path,
                app_entry.original_name.clone(),
                client_references,
                client_references_chunks,
                this.app_project.project().client_chunking_context(),
                Vc::upcast(this.app_project.project().ssr_chunking_context()),
                this.app_project
                    .project()
                    .next_config()
                    .computed_asset_prefix(),
            );
            server_assets.push(entry_manifest);
        }

        fn create_app_paths_manifest(
            node_root: Vc<FileSystemPath>,
            ty: &'static str,
            pathname: &str,
            original_name: &str,
            filename: String,
        ) -> Result<Vc<Box<dyn OutputAsset>>> {
            let manifest_path_prefix = get_asset_prefix_from_pathname(pathname);
            let path = node_root.join(format!(
                "server/app{manifest_path_prefix}/{ty}/app-paths-manifest.json",
            ));
            let app_paths_manifest = AppPathsManifest {
                node_server_app_paths: PagesManifest {
                    pages: [(original_name.to_string(), filename)]
                        .into_iter()
                        .collect(),
                },
                ..Default::default()
            };
            Ok(Vc::upcast(VirtualOutputAsset::new(
                path,
                AssetContent::file(
                    File::from(serde_json::to_string_pretty(&app_paths_manifest)?).into(),
                ),
            )))
        }

        let endpoint_output = match app_entry.config.await?.runtime.unwrap_or_default() {
            NextRuntime::Edge => {
                // create edge chunks
                let chunking_context = this.app_project.project().edge_rsc_chunking_context();
                let mut evaluatable_assets = this
                    .app_project
                    .edge_rsc_runtime_entries()
                    .await?
                    .clone_value();
                let Some(evaluatable) = Vc::try_resolve_sidecast(app_entry.rsc_entry).await? else {
                    bail!("Entry module must be evaluatable");
                };
                evaluatable_assets.push(evaluatable);
                let files = chunking_context.evaluated_chunk_group(
                    app_entry
                        .rsc_entry
                        .as_root_chunk(Vc::upcast(chunking_context)),
                    Vc::cell(evaluatable_assets),
                );
                server_assets.extend(files.await?.iter().copied());

                let node_root_value = node_root.await?;
                let files_paths_from_root = files
                    .await?
                    .iter()
                    .map(move |&file| {
                        let node_root_value = node_root_value.clone();
                        async move {
                            Ok(node_root_value
                                .get_path_to(&*file.ident().path().await?)
                                .map(|path| path.to_string()))
                        }
                    })
                    .try_flat_join()
                    .await?;

                let server_path_value = server_path.await?;
                let files_paths_from_server = files
                    .await?
                    .iter()
                    .map(move |&file| {
                        let server_path_value = server_path_value.clone();
                        async move {
                            Ok(server_path_value
                                .get_path_to(&*file.ident().path().await?)
                                .map(|path| path.to_string()))
                        }
                    })
                    .try_flat_join()
                    .await?;
                let base_file = files_paths_from_server[0].to_string();

                // create middleware manifest
                // TODO(alexkirsz) This should be shared with next build.
                let named_regex = get_named_middleware_regex(&app_entry.pathname);
                let matchers = MiddlewareMatcher {
                    regexp: Some(named_regex),
                    original_source: app_entry.pathname.clone(),
                    ..Default::default()
                };
                let edge_function_definition = EdgeFunctionDefinition {
                    files: files_paths_from_root,
                    name: app_entry.pathname.to_string(),
                    page: app_entry.original_name.clone(),
                    regions: app_entry
                        .config
                        .await?
                        .preferred_region
                        .clone()
                        .map(Regions::Single),
                    matchers: vec![matchers],
                    ..Default::default()
                };
                let middleware_manifest_v2 = MiddlewaresManifestV2 {
                    sorted_middleware: vec![app_entry.original_name.clone()],
                    middleware: Default::default(),
                    functions: [(app_entry.original_name.clone(), edge_function_definition)]
                        .into_iter()
                        .collect(),
                };
                let manifest_path_prefix = get_asset_prefix_from_pathname(&app_entry.pathname);
                let middleware_manifest_v2 = Vc::upcast(VirtualOutputAsset::new(
                    node_root.join(format!(
                        "server/app{manifest_path_prefix}/{ty}/middleware-manifest.json",
                    )),
                    AssetContent::file(
                        FileContent::Content(File::from(serde_json::to_string_pretty(
                            &middleware_manifest_v2,
                        )?))
                        .cell(),
                    ),
                ));
                server_assets.push(middleware_manifest_v2);

                // create app paths manifest
                let app_paths_manifest_output = create_app_paths_manifest(
                    node_root,
                    ty,
                    &app_entry.pathname,
                    &app_entry.original_name,
                    base_file,
                )?;
                server_assets.push(app_paths_manifest_output);

                AppEndpointOutput::Edge {
                    files,
                    server_assets: Vc::cell(server_assets),
                    client_assets: Vc::cell(client_assets),
                }
            }
            NextRuntime::NodeJs => {
                let rsc_chunk = this
                    .app_project
                    .project()
                    .rsc_chunking_context()
                    .entry_chunk(
                        server_path.join(format!(
                            "app{original_name}.js",
                            original_name = app_entry.original_name
                        )),
                        app_entry.rsc_entry,
                        this.app_project.rsc_runtime_entries(),
                    );
                server_assets.push(rsc_chunk);

                let app_paths_manifest_output = create_app_paths_manifest(
                    node_root,
                    ty,
                    &app_entry.pathname,
                    &app_entry.original_name,
                    server_path
                        .await?
                        .get_path_to(&*rsc_chunk.ident().path().await?)
                        .expect("RSC chunk path should be within app paths manifest directory")
                        .to_string(),
                )?;
                server_assets.push(app_paths_manifest_output);

                AppEndpointOutput::NodeJs {
                    rsc_chunk,
                    server_assets: Vc::cell(server_assets),
                    client_assets: Vc::cell(client_assets),
                }
            }
        };
        Ok(endpoint_output.cell())
    }
}

#[turbo_tasks::function]
async fn concatenate_output_assets(
    path: Vc<FileSystemPath>,
    files: Vc<OutputAssets>,
) -> Result<Vc<Box<dyn OutputAsset>>> {
    let mut concatenated_content = RopeBuilder::default();
    let contents = files
        .await?
        .iter()
        .map(|&file| async move {
            Ok(
                if let AssetContent::File(content) = *file.content().await? {
                    Some(content.await?)
                } else {
                    None
                },
            )
        })
        .try_flat_join()
        .await?;
    for file in contents.iter().flat_map(|content| content.as_content()) {
        concatenated_content.concat(file.content());
        concatenated_content.push_static_bytes(b"\n\n");
    }
    Ok(Vc::upcast(VirtualOutputAsset::new(
        path,
        AssetContent::file(FileContent::Content(concatenated_content.build().into()).cell()),
    )))
}

#[turbo_tasks::value_impl]
impl Endpoint for AppEndpoint {
    #[turbo_tasks::function]
    async fn write_to_disk(self: Vc<Self>) -> Result<Vc<WrittenEndpoint>> {
        let output = self.output();
        // Must use self.output_assets() instead of output.output_assets() to make it a
        // single operation
        let output_assets = self.output_assets();

        let this = self.await?;
        let node_root = this.app_project.project().node_root();

        let node_root_ref = &node_root.await?;

        let node_root = this.app_project.project().node_root();
        this.app_project
            .project()
            .emit_all_output_assets(Vc::cell(output_assets))
            .await?;

        let server_paths = all_server_paths(output_assets, node_root)
            .await?
            .clone_value();

        let written_endpoint = match *output.await? {
            AppEndpointOutput::NodeJs { rsc_chunk, .. } => WrittenEndpoint::NodeJs {
                server_entry_path: node_root_ref
                    .get_path_to(&*rsc_chunk.ident().path().await?)
                    .context("Node.js chunk entry path must be inside the node root")?
                    .to_string(),
                server_paths,
            },
            AppEndpointOutput::Edge { files, .. } => WrittenEndpoint::Edge {
                files: files
                    .await?
                    .iter()
                    .map(|&file| async move {
                        Ok(node_root_ref
                            .get_path_to(&*file.ident().path().await?)
                            .context("edge chunk file path must be inside the node root")?
                            .to_string())
                    })
                    .try_join()
                    .await?,
                global_var_name: "TODO".to_string(),
                server_paths,
            },
        };
        Ok(written_endpoint.cell())
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
}

#[turbo_tasks::value]
enum AppEndpointOutput {
    NodeJs {
        rsc_chunk: Vc<Box<dyn OutputAsset>>,
        server_assets: Vc<OutputAssets>,
        client_assets: Vc<OutputAssets>,
    },
    Edge {
        files: Vc<OutputAssets>,
        server_assets: Vc<OutputAssets>,
        client_assets: Vc<OutputAssets>,
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
            | AppEndpointOutput::Edge { server_assets, .. } => server_assets,
        }
    }

    #[turbo_tasks::function]
    pub fn client_assets(&self) -> Vc<OutputAssets> {
        match *self {
            AppEndpointOutput::NodeJs { client_assets, .. }
            | AppEndpointOutput::Edge { client_assets, .. } => client_assets,
        }
    }
}
