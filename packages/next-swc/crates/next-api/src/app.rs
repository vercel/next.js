use anyhow::{Context, Result};
use next_core::{
    all_server_paths,
    app_structure::{
        get_entrypoints, Entrypoint as AppEntrypoint, Entrypoints as AppEntrypoints, LoaderTree,
    },
    emit_all_assets, get_edge_resolve_options_context,
    mode::NextMode,
    next_app::{
        get_app_client_references_chunks, get_app_client_shared_chunks, get_app_page_entry,
        get_app_route_entry, AppEntry,
    },
    next_client::{
        get_client_module_options_context, get_client_resolve_options_context,
        get_client_runtime_entries, ClientContextType, RuntimeEntries,
    },
    next_client_reference::{
        ClientReferenceGraph, ClientReferenceType, NextEcmascriptClientReferenceTransition,
    },
    next_dynamic::{NextDynamicEntries, NextDynamicTransition},
    next_manifests::{
        AppBuildManifest, AppPathsManifest, BuildManifest, ClientReferenceManifest, PagesManifest,
    },
    next_server::{
        get_server_module_options_context, get_server_resolve_options_context,
        get_server_runtime_entries, ServerContextType,
    },
    util::NextRuntime,
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
            changed::any_content_changed_of_output_assets,
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
            self.project().project_path(),
            // TODO(alexkirsz) Should we pass env here or EnvMap::empty, as is done in
            // app_source?
            self.project().env(),
            Value::new(self.rsc_ty()),
            this.mode,
            self.project().next_config(),
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
            self.client_env(),
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
                        pathname.clone(),
                        *app_entry_point_to_route(self, app_entrypoint.clone(), pathname.clone())
                            .await?,
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
    pathname: String,
) -> Vc<Route> {
    match entrypoint {
        AppEntrypoint::AppPage {
            original_name,
            loader_tree,
        } => Route::AppPage {
            html_endpoint: Vc::upcast(
                AppEndpoint {
                    ty: AppEndpointType::Page {
                        ty: AppPageEndpointType::Html,
                        loader_tree,
                    },
                    app_project,
                    pathname: pathname.clone(),
                    original_name: original_name.clone(),
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
                    pathname,
                    original_name,
                }
                .cell(),
            ),
        },
        AppEntrypoint::AppRoute {
            original_name,
            path,
        } => Route::AppRoute {
            endpoint: Vc::upcast(
                AppEndpoint {
                    ty: AppEndpointType::Route { path },
                    app_project,
                    pathname,
                    original_name,
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
}

#[turbo_tasks::value]
struct AppEndpoint {
    ty: AppEndpointType,
    app_project: Vc<AppProject>,
    pathname: String,
    original_name: String,
}

#[turbo_tasks::value_impl]
impl AppEndpoint {
    #[turbo_tasks::function]
    fn client_relative_path(&self) -> Vc<FileSystemPath> {
        self.app_project
            .project()
            .client_root()
            .join("_next".to_string())
    }

    #[turbo_tasks::function]
    fn app_page_entry(&self, loader_tree: Vc<LoaderTree>) -> Vc<AppEntry> {
        get_app_page_entry(
            self.app_project.rsc_module_context(),
            self.app_project.edge_rsc_module_context(),
            loader_tree,
            self.app_project.app_dir(),
            self.pathname.clone(),
            self.original_name.clone(),
            self.app_project.project().project_path(),
        )
    }

    #[turbo_tasks::function]
    fn app_route_entry(&self, path: Vc<FileSystemPath>) -> Vc<AppEntry> {
        get_app_route_entry(
            self.app_project.rsc_module_context(),
            self.app_project.edge_rsc_module_context(),
            Vc::upcast(FileSource::new(path)),
            self.pathname.clone(),
            self.original_name.clone(),
            self.app_project.project().project_path(),
        )
    }

    #[turbo_tasks::function]
    async fn output(self: Vc<Self>) -> Result<Vc<AppEndpointOutput>> {
        let this = self.await?;

        let app_entry = match this.ty {
            AppEndpointType::Page { ty: _, loader_tree } => self.app_page_entry(loader_tree),
            // NOTE(alexkirsz) For routes, technically, a lot of the following code is not needed,
            // as we know we won't have any client references. However, for now, for simplicity's
            // sake, we just do the same thing as for pages.
            AppEndpointType::Route { path } => self.app_route_entry(path),
        };

        let node_root = this.app_project.project().node_root();

        let client_relative_path = self.client_relative_path();
        let client_relative_path_ref = client_relative_path.await?;

        let server_path = node_root.join("server".to_string());

        let mut output_assets = vec![];

        let client_shared_chunks = get_app_client_shared_chunks(
            this.app_project.client_runtime_entries(),
            this.app_project.project().client_chunking_context(),
        );

        let mut client_shared_chunks_paths = vec![];
        for chunk in client_shared_chunks.await?.iter().copied() {
            output_assets.push(chunk);

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

        output_assets.extend(entry_client_chunks.iter().copied());
        output_assets.extend(entry_ssr_chunks.iter().copied());

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
        let app_build_manifest_output = Vc::upcast(VirtualOutputAsset::new(
            node_root.join(format!(
                "server/app{original_name}/app-build-manifest.json",
                original_name = app_entry.original_name
            )),
            AssetContent::file(
                File::from(serde_json::to_string_pretty(&app_build_manifest)?).into(),
            ),
        ));
        output_assets.push(app_build_manifest_output);

        let build_manifest = BuildManifest {
            root_main_files: client_shared_chunks_paths,
            ..Default::default()
        };
        let build_manifest_output = Vc::upcast(VirtualOutputAsset::new(
            node_root.join(format!(
                "server/app{original_name}/build-manifest.json",
                original_name = app_entry.original_name
            )),
            AssetContent::file(File::from(serde_json::to_string_pretty(&build_manifest)?).into()),
        ));
        output_assets.push(build_manifest_output);

        let entry_manifest = ClientReferenceManifest::build_output(
            node_root,
            client_relative_path,
            app_entry.original_name.clone(),
            client_references,
            client_references_chunks,
            this.app_project.project().client_chunking_context(),
            Vc::upcast(this.app_project.project().ssr_chunking_context()),
        );
        output_assets.push(entry_manifest);

        // TODO(alexkirsz) Expose config and type: edge/normal on AppEntry.
        // TODO(alexkirsz) This should be shared with next build.
        if let Some(edge_config) = &app_entry.edge_config {
            let named_regex = get_named_middleware_regex(&app_entry.pathname);
            let matchers = MiddlewareMatcher {
                regexp: named_regex,
                original_source: app_entry.pathname.clone(),
                ..Default::default()
            };
            let edge_function_definition = EdgeFunctionDefinition {
                files: todo!(), // get_entry_files(...),
                name: "".to_string(),
                page: app_entry.original_name.clone(),
                regions: edge_config
                    .await?
                    .preferred_region
                    .map(|region| Regions::Single(region)),
                matchers: vec![matchers],
                ..Default::default()
            };
            let middleware_manifest_v2 = MiddlewaresManifestV2 {
                sorted_middleware: vec![original_name.clone()],
                middleware: Default::default(),
                functions: [(original_name, edge_function_definition)]
                    .into_iter()
                    .collect(),
            };
            // TODO(alexkirsz) Add the manifest.
        }

        fn create_app_paths_manifest(
            node_root: Vc<FileSystemPath>,
            original_name: &str,
            filename: String,
        ) -> Result<Vc<Box<dyn OutputAsset>>> {
            let path =
                node_root.join(format!("server/app{original_name}/app-paths-manifest.json",));
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
                let chunking_context = this.app_project.project().edge_rsc_chunking_context();
                let files = chunking_context.evaluated_chunk_group(
                    app_entry
                        .rsc_entry
                        .as_root_chunk(Vc::upcast(chunking_context)),
                    this.app_project.edge_rsc_runtime_entries(),
                );
                // TODO concatenation is not good, we should use all files once next.js supports
                // that output_assets.extend(files.await?.iter().copied());
                let file = concatenate_output_assets(
                    server_path.join(format!(
                        "app/{original_name}.js",
                        original_name = app_entry.original_name
                    )),
                    files,
                );
                output_assets.push(file);

                let app_paths_manifest_output = create_app_paths_manifest(
                    node_root,
                    &app_entry.original_name,
                    server_path
                        .await?
                        .get_path_to(&*file.ident().path().await?)
                        .expect("edge bundle path should be within app paths manifest directory")
                        .to_string(),
                )?;
                output_assets.push(app_paths_manifest_output);

                AppEndpointOutput::Edge {
                    file,
                    output_assets: Vc::cell(output_assets),
                }
            }
            NextRuntime::NodeJs => {
                let rsc_chunk = this
                    .app_project
                    .project()
                    .rsc_chunking_context()
                    .entry_chunk(
                        server_path.join(format!(
                            "app/{original_name}.js",
                            original_name = app_entry.original_name
                        )),
                        app_entry.rsc_entry,
                        this.app_project.rsc_runtime_entries(),
                    );
                output_assets.push(rsc_chunk);

                let app_paths_manifest_output = create_app_paths_manifest(
                    node_root,
                    &app_entry.original_name,
                    server_path
                        .await?
                        .get_path_to(&*rsc_chunk.ident().path().await?)
                        .expect("RSC chunk path should be within app paths manifest directory")
                        .to_string(),
                )?;
                output_assets.push(app_paths_manifest_output);

                AppEndpointOutput::NodeJs {
                    rsc_chunk,
                    output_assets: Vc::cell(output_assets),
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
        let output_assets = output.output_assets();

        let this = self.await?;
        let node_root = this.app_project.project().node_root();

        let node_root_ref = &node_root.await?;

        let node_root = this.app_project.project().node_root();
        emit_all_assets(
            output_assets,
            node_root,
            self.client_relative_path(),
            this.app_project.project().node_root(),
        )
        .await?;

        let server_paths = all_server_paths(output_assets, node_root)
            .await?
            .clone_value();

        let written_endpoint = match *output.await? {
            AppEndpointOutput::NodeJs {
                rsc_chunk,
                output_assets: _,
            } => WrittenEndpoint::NodeJs {
                server_entry_path: node_root_ref
                    .get_path_to(&*rsc_chunk.ident().path().await?)
                    .context("Node.js chunk entry path must be inside the node root")?
                    .to_string(),
                server_paths,
            },
            AppEndpointOutput::Edge {
                file,
                output_assets: _,
            } => WrittenEndpoint::Edge {
                files: vec![node_root_ref
                    .get_path_to(&*file.ident().path().await?)
                    .context("edge chunk file path must be inside the node root")?
                    .to_string()],
                global_var_name: "TODO".to_string(),
                server_paths,
            },
        };
        Ok(written_endpoint.cell())
    }

    #[turbo_tasks::function]
    async fn changed(self: Vc<Self>) -> Result<Vc<Completion>> {
        let output_assets = self.output().output_assets();
        Ok(any_content_changed_of_output_assets(output_assets))
    }
}

#[turbo_tasks::value]
enum AppEndpointOutput {
    NodeJs {
        rsc_chunk: Vc<Box<dyn OutputAsset>>,
        output_assets: Vc<OutputAssets>,
    },
    Edge {
        file: Vc<Box<dyn OutputAsset>>,
        output_assets: Vc<OutputAssets>,
    },
}

#[turbo_tasks::value_impl]
impl AppEndpointOutput {
    #[turbo_tasks::function]
    pub fn output_assets(&self) -> Vc<OutputAssets> {
        match *self {
            AppEndpointOutput::NodeJs {
                rsc_chunk: _,
                output_assets,
            } => output_assets,
            AppEndpointOutput::Edge {
                file: _,
                output_assets,
            } => output_assets,
        }
    }
}
