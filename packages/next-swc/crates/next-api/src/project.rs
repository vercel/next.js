use std::path::MAIN_SEPARATOR;

use anyhow::Result;
use indexmap::{map::Entry, IndexMap};
use next_core::{
    all_assets_from_entries,
    app_structure::find_app_dir,
    emit_assets, get_edge_chunking_context, get_edge_compile_time_info,
    get_edge_resolve_options_context,
    instrumentation::instrumentation_files,
    middleware::middleware_files,
    mode::NextMode,
    next_client::{get_client_chunking_context, get_client_compile_time_info},
    next_config::{JsConfig, NextConfig},
    next_server::{
        get_server_chunking_context, get_server_compile_time_info,
        get_server_module_options_context, get_server_resolve_options_context, ServerContextType,
    },
    next_telemetry::NextFeatureTelemetry,
};
use serde::{Deserialize, Serialize};
use tracing::Instrument;
use turbo_tasks::{
    debug::ValueDebugFormat,
    graph::{AdjacencyMap, GraphTraversal},
    trace::TraceRawVcs,
    Completion, Completions, IntoTraitRef, State, TaskInput, TraitRef, TransientInstance,
    TryFlatJoinIterExt, Value, Vc,
};
use turbopack_binding::{
    turbo::{
        tasks_env::{EnvMap, ProcessEnv},
        tasks_fs::{DiskFileSystem, FileSystem, FileSystemPath, VirtualFileSystem},
    },
    turbopack::{
        build::BuildChunkingContext,
        core::{
            changed::content_changed,
            compile_time_info::CompileTimeInfo,
            context::AssetContext,
            diagnostics::DiagnosticExt,
            file_source::FileSource,
            issue::{Issue, IssueExt, IssueSeverity, IssueStage, OptionStyledString, StyledString},
            output::{OutputAsset, OutputAssets},
            resolve::{find_context_file, FindContextFileResult},
            source::Source,
            source_map::OptionSourceMap,
            version::{Update, Version, VersionState, VersionedContent},
            PROJECT_FILESYSTEM_NAME,
        },
        dev::DevChunkingContext,
        ecmascript::chunk::EcmascriptChunkingContext,
        node::execution_context::ExecutionContext,
        turbopack::{evaluate_context::node_build_environment, ModuleAssetContext},
    },
};

use crate::{
    app::{AppProject, OptionAppProject},
    build,
    entrypoints::Entrypoints,
    instrumentation::InstrumentationEndpoint,
    middleware::MiddlewareEndpoint,
    pages::PagesProject,
    route::{Endpoint, Route},
    versioned_content_map::{OutputAssetsOperation, VersionedContentMap},
};

#[derive(Debug, Serialize, Deserialize, Clone, TaskInput, PartialEq, Eq, TraceRawVcs)]
#[serde(rename_all = "camelCase")]
pub struct ProjectOptions {
    /// A root path from which all files must be nested under. Trying to access
    /// a file outside this root will fail. Think of this as a chroot.
    pub root_path: String,

    /// A path inside the root_path which contains the app/pages directories.
    pub project_path: String,

    /// The contents of next.config.js, serialized to JSON.
    pub next_config: String,

    /// The contents of ts/config read by load-jsconfig, serialized to JSON.
    pub js_config: String,

    /// A map of environment variables to use when compiling code.
    pub env: Vec<(String, String)>,

    /// A map of environment variables which should get injected at compile
    /// time.
    pub define_env: DefineEnv,

    /// Whether to watch the filesystem for file changes.
    pub watch: bool,

    /// The mode in which Next.js is running.
    pub dev: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, TaskInput, PartialEq, Eq, TraceRawVcs)]
#[serde(rename_all = "camelCase")]
pub struct PartialProjectOptions {
    /// A root path from which all files must be nested under. Trying to access
    /// a file outside this root will fail. Think of this as a chroot.
    pub root_path: Option<String>,

    /// A path inside the root_path which contains the app/pages directories.
    pub project_path: Option<String>,

    /// The contents of next.config.js, serialized to JSON.
    pub next_config: Option<String>,

    /// The contents of ts/config read by load-jsconfig, serialized to JSON.
    pub js_config: Option<String>,

    /// A map of environment variables to use when compiling code.
    pub env: Option<Vec<(String, String)>>,

    /// A map of environment variables which should get injected at compile
    /// time.
    pub define_env: Option<DefineEnv>,

    /// Whether to watch the filesystem for file changes.
    pub watch: Option<bool>,

    /// The mode in which Next.js is running.
    pub dev: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone, TaskInput, PartialEq, Eq, TraceRawVcs)]
#[serde(rename_all = "camelCase")]
pub struct DefineEnv {
    pub client: Vec<(String, String)>,
    pub edge: Vec<(String, String)>,
    pub nodejs: Vec<(String, String)>,
}

#[derive(Serialize, Deserialize, TraceRawVcs, PartialEq, Eq, ValueDebugFormat)]
pub struct Middleware {
    pub endpoint: Vc<Box<dyn Endpoint>>,
}

#[derive(Serialize, Deserialize, TraceRawVcs, PartialEq, Eq, ValueDebugFormat)]
pub struct Instrumentation {
    pub node_js: Vc<Box<dyn Endpoint>>,
    pub edge: Vc<Box<dyn Endpoint>>,
}

#[turbo_tasks::value]
pub struct ProjectContainer {
    options_state: State<ProjectOptions>,
    versioned_content_map: Vc<VersionedContentMap>,
}

#[turbo_tasks::value_impl]
impl ProjectContainer {
    #[turbo_tasks::function]
    pub fn new(options: ProjectOptions) -> Vc<Self> {
        ProjectContainer {
            options_state: State::new(options),
            versioned_content_map: VersionedContentMap::new(),
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub fn update(&self, options: PartialProjectOptions) -> Vc<()> {
        let mut new_options = self.options_state.get().clone();

        if let Some(root_path) = options.root_path {
            new_options.root_path = root_path;
        }
        if let Some(project_path) = options.project_path {
            new_options.project_path = project_path;
        }
        if let Some(next_config) = options.next_config {
            new_options.next_config = next_config;
        }
        if let Some(js_config) = options.js_config {
            new_options.js_config = js_config;
        }
        if let Some(env) = options.env {
            new_options.env = env;
        }
        if let Some(define_env) = options.define_env {
            new_options.define_env = define_env;
        }
        if let Some(watch) = options.watch {
            new_options.watch = watch;
        }

        // TODO: Handle mode switch, should prevent mode being switched.

        self.options_state.set(new_options);

        Default::default()
    }

    #[turbo_tasks::function]
    pub async fn project(self: Vc<Self>) -> Result<Vc<Project>> {
        let this = self.await?;

        let (env, define_env, next_config, js_config, root_path, project_path, watch, dev) = {
            let options = this.options_state.get();
            let env: Vc<EnvMap> = Vc::cell(options.env.iter().cloned().collect());
            let define_env: Vc<ProjectDefineEnv> = ProjectDefineEnv {
                client: Vc::cell(options.define_env.client.iter().cloned().collect()),
                edge: Vc::cell(options.define_env.edge.iter().cloned().collect()),
                nodejs: Vc::cell(options.define_env.nodejs.iter().cloned().collect()),
            }
            .cell();
            let next_config = NextConfig::from_string(Vc::cell(options.next_config.clone()));
            let js_config = JsConfig::from_string(Vc::cell(options.js_config.clone()));
            let root_path = options.root_path.clone();
            let project_path = options.project_path.clone();
            let watch = options.watch;
            let dev = options.dev;
            (
                env,
                define_env,
                next_config,
                js_config,
                root_path,
                project_path,
                watch,
                dev,
            )
        };

        let dist_dir = next_config
            .await?
            .dist_dir
            .as_ref()
            .map_or_else(|| ".next".to_string(), |d| d.to_string());

        Ok(Project {
            root_path,
            project_path,
            watch,
            next_config,
            js_config,
            dist_dir,
            env: Vc::upcast(env),
            define_env,
            browserslist_query: "last 1 Chrome versions, last 1 Firefox versions, last 1 Safari \
                                 versions, last 1 Edge versions"
                .to_string(),
            mode: if dev {
                NextMode::Development.cell()
            } else {
                NextMode::Build.cell()
            },
            versioned_content_map: this.versioned_content_map,
        }
        .cell())
    }

    /// See [Project::entrypoints].
    #[turbo_tasks::function]
    pub fn entrypoints(self: Vc<Self>) -> Vc<Entrypoints> {
        self.project().entrypoints()
    }

    /// See [Project::hmr_identifiers].
    #[turbo_tasks::function]
    pub fn hmr_identifiers(self: Vc<Self>) -> Vc<Vec<String>> {
        self.project().hmr_identifiers()
    }

    #[turbo_tasks::function]
    pub async fn get_versioned_content(
        self: Vc<Self>,
        file_path: Vc<FileSystemPath>,
    ) -> Result<Vc<Box<dyn VersionedContent>>> {
        let this = self.await?;
        Ok(this.versioned_content_map.get(file_path))
    }

    #[turbo_tasks::function]
    pub async fn get_source_map(
        self: Vc<Self>,
        file_path: Vc<FileSystemPath>,
        section: Option<String>,
    ) -> Result<Vc<OptionSourceMap>> {
        let this = self.await?;
        Ok(this
            .versioned_content_map
            .get_source_map(file_path, section))
    }
}

#[turbo_tasks::value]
pub struct Project {
    /// A root path from which all files must be nested under. Trying to access
    /// a file outside this root will fail. Think of this as a chroot.
    root_path: String,

    /// A path where to emit the build outputs. next.config.js's distDir.
    dist_dir: String,

    /// A path inside the root_path which contains the app/pages directories.
    pub project_path: String,

    /// Whether to watch the filesystem for file changes.
    watch: bool,

    /// Next config.
    next_config: Vc<NextConfig>,

    /// Js/Tsconfig read by load-jsconfig
    js_config: Vc<JsConfig>,

    /// A map of environment variables to use when compiling code.
    env: Vc<Box<dyn ProcessEnv>>,

    /// A map of environment variables which should get injected at compile
    /// time.
    define_env: Vc<ProjectDefineEnv>,

    browserslist_query: String,

    mode: Vc<NextMode>,

    versioned_content_map: Vc<VersionedContentMap>,
}

#[turbo_tasks::value]
pub struct ProjectDefineEnv {
    client: Vc<EnvMap>,
    edge: Vc<EnvMap>,
    nodejs: Vc<EnvMap>,
}

#[turbo_tasks::value_impl]
impl ProjectDefineEnv {
    #[turbo_tasks::function]
    pub fn client(&self) -> Vc<EnvMap> {
        self.client
    }

    #[turbo_tasks::function]
    pub fn edge(&self) -> Vc<EnvMap> {
        self.edge
    }

    #[turbo_tasks::function]
    pub fn nodejs(&self) -> Vc<EnvMap> {
        self.nodejs
    }
}

#[turbo_tasks::value(shared)]
struct ConflictIssue {
    path: Vc<FileSystemPath>,
    title: Vc<StyledString>,
    description: Vc<StyledString>,
    severity: Vc<IssueSeverity>,
}

#[turbo_tasks::value_impl]
impl Issue for ConflictIssue {
    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::AppStructure.cell()
    }

    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        self.severity
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.path
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        self.title
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(self.description))
    }
}

#[turbo_tasks::value_impl]
impl Project {
    #[turbo_tasks::function]
    async fn app_project(self: Vc<Self>) -> Result<Vc<OptionAppProject>> {
        let app_dir = find_app_dir(self.project_path()).await?;

        Ok(Vc::cell(
            app_dir.map(|app_dir| AppProject::new(self, app_dir)),
        ))
    }

    #[turbo_tasks::function]
    async fn pages_project(self: Vc<Self>) -> Result<Vc<PagesProject>> {
        Ok(PagesProject::new(self))
    }

    #[turbo_tasks::function]
    async fn project_fs(self: Vc<Self>) -> Result<Vc<Box<dyn FileSystem>>> {
        let this = self.await?;
        let disk_fs = DiskFileSystem::new(
            PROJECT_FILESYSTEM_NAME.to_string(),
            this.root_path.to_string(),
            vec![],
        );
        if this.watch {
            disk_fs.await?.start_watching_with_invalidation_reason()?;
        }
        Ok(Vc::upcast(disk_fs))
    }

    #[turbo_tasks::function]
    async fn client_fs(self: Vc<Self>) -> Result<Vc<Box<dyn FileSystem>>> {
        let virtual_fs = VirtualFileSystem::new();
        Ok(Vc::upcast(virtual_fs))
    }

    #[turbo_tasks::function]
    pub async fn output_fs(self: Vc<Self>) -> Result<Vc<Box<dyn FileSystem>>> {
        let this = self.await?;
        let disk_fs = DiskFileSystem::new("output".to_string(), this.project_path.clone(), vec![]);
        Ok(Vc::upcast(disk_fs))
    }

    #[turbo_tasks::function]
    pub async fn dist_dir(self: Vc<Self>) -> Result<Vc<String>> {
        Ok(Vc::cell(self.await?.dist_dir.to_string()))
    }

    #[turbo_tasks::function]
    pub async fn node_root(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        let this = self.await?;
        Ok(self.output_fs().root().join(this.dist_dir.to_string()))
    }

    #[turbo_tasks::function]
    pub fn client_root(self: Vc<Self>) -> Vc<FileSystemPath> {
        self.client_fs().root()
    }

    #[turbo_tasks::function]
    fn project_root_path(self: Vc<Self>) -> Vc<FileSystemPath> {
        self.project_fs().root()
    }

    #[turbo_tasks::function]
    pub async fn client_relative_path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        let next_config = self.next_config().await?;
        Ok(self.client_root().join(format!(
            "{}/_next",
            next_config
                .base_path
                .clone()
                .unwrap_or_else(|| "".to_string()),
        )))
    }

    #[turbo_tasks::function]
    pub async fn project_path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        let this = self.await?;
        let root = self.project_root_path();
        let project_relative = this.project_path.strip_prefix(&this.root_path).unwrap();
        let project_relative = project_relative
            .strip_prefix(MAIN_SEPARATOR)
            .unwrap_or(project_relative)
            .replace(MAIN_SEPARATOR, "/");
        Ok(root.join(project_relative))
    }

    #[turbo_tasks::function]
    pub(super) async fn env(self: Vc<Self>) -> Result<Vc<Box<dyn ProcessEnv>>> {
        Ok(self.await?.env)
    }

    #[turbo_tasks::function]
    pub(super) async fn next_config(self: Vc<Self>) -> Result<Vc<NextConfig>> {
        Ok(self.await?.next_config)
    }

    #[turbo_tasks::function]
    pub(super) async fn next_mode(self: Vc<Self>) -> Result<Vc<NextMode>> {
        Ok(self.await?.mode)
    }

    #[turbo_tasks::function]
    pub(super) async fn js_config(self: Vc<Self>) -> Result<Vc<JsConfig>> {
        Ok(self.await?.js_config)
    }

    #[turbo_tasks::function]
    pub(super) fn execution_context(self: Vc<Self>) -> Vc<ExecutionContext> {
        let node_root = self.node_root();

        let node_execution_chunking_context = Vc::upcast(
            DevChunkingContext::builder(
                self.project_path(),
                node_root,
                node_root,
                node_root.join("chunks".to_string()),
                node_root.join("assets".to_string()),
                node_build_environment(),
            )
            .build(),
        );

        ExecutionContext::new(
            self.project_path(),
            node_execution_chunking_context,
            self.env(),
        )
    }

    #[turbo_tasks::function]
    pub(super) async fn client_compile_time_info(&self) -> Result<Vc<CompileTimeInfo>> {
        Ok(get_client_compile_time_info(
            self.browserslist_query.clone(),
            self.define_env.client(),
        ))
    }

    #[turbo_tasks::function]
    pub(super) async fn server_compile_time_info(self: Vc<Self>) -> Result<Vc<CompileTimeInfo>> {
        let this = self.await?;
        Ok(get_server_compile_time_info(
            self.env(),
            this.define_env.nodejs(),
        ))
    }

    #[turbo_tasks::function]
    pub(super) async fn edge_compile_time_info(self: Vc<Self>) -> Result<Vc<CompileTimeInfo>> {
        let this = self.await?;
        Ok(get_edge_compile_time_info(
            self.project_path(),
            this.define_env.edge(),
        ))
    }

    #[turbo_tasks::function]
    pub(super) async fn client_chunking_context(
        self: Vc<Self>,
    ) -> Result<Vc<Box<dyn EcmascriptChunkingContext>>> {
        Ok(get_client_chunking_context(
            self.project_path(),
            self.client_relative_path(),
            self.next_config().computed_asset_prefix(),
            self.client_compile_time_info().environment(),
            self.next_mode(),
        ))
    }

    #[turbo_tasks::function]
    pub(super) fn server_chunking_context(self: Vc<Self>) -> Vc<BuildChunkingContext> {
        get_server_chunking_context(
            self.project_path(),
            self.node_root(),
            self.client_relative_path(),
            self.next_config().computed_asset_prefix(),
            self.server_compile_time_info().environment(),
        )
    }

    #[turbo_tasks::function]
    pub(super) fn edge_chunking_context(self: Vc<Self>) -> Vc<Box<dyn EcmascriptChunkingContext>> {
        get_edge_chunking_context(
            self.project_path(),
            self.node_root(),
            self.client_relative_path(),
            self.next_config().computed_asset_prefix(),
            self.edge_compile_time_info().environment(),
        )
    }

    /// Emit a telemetry event corresponding to [webpack configuration telemetry](https://github.com/vercel/next.js/blob/9da305fe320b89ee2f8c3cfb7ecbf48856368913/packages/next/src/build/webpack-config.ts#L2516)
    /// to detect which feature is enabled.
    #[turbo_tasks::function]
    async fn collect_project_feature_telemetry(self: Vc<Self>) -> Result<Vc<()>> {
        let emit_event = |feature_name: &str, enabled: bool| {
            NextFeatureTelemetry::new(feature_name.to_string(), enabled)
                .cell()
                .emit();
        };

        // First, emit an event for the binary target triple.
        // This is different to webpack-config; when this is being called,
        // it is always using SWC so we don't check swc here.
        emit_event(build::BUILD_TARGET, true);

        // Go over jsconfig and report enabled features.
        let compiler_options = self.js_config().compiler_options().await?;
        let compiler_options = compiler_options.as_object();
        let experimental_decorators_enabled = compiler_options
            .as_ref()
            .and_then(|compiler_options| compiler_options.get("experimentalDecorators"))
            .is_some();
        let jsx_import_source_enabled = compiler_options
            .as_ref()
            .and_then(|compiler_options| compiler_options.get("jsxImportSource"))
            .is_some();

        emit_event("swcExperimentalDecorators", experimental_decorators_enabled);
        emit_event("swcImportSource", jsx_import_source_enabled);

        // Go over config and report enabled features.
        // [TODO]: useSwcLoader is not being reported as it is not directly corresponds (it checks babel config existence)
        // need to confirm what we'll do with turbopack.
        let config = self.next_config();

        emit_event("swcMinify", *config.swc_minify().await?);
        emit_event(
            "skipMiddlewareUrlNormalize",
            *config.skip_middleware_url_normalize().await?,
        );

        emit_event(
            "skipTrailingSlashRedirect",
            *config.skip_trailing_slash_redirect().await?,
        );

        let config = &config.await?;

        emit_event("modularizeImports", config.modularize_imports.is_some());
        emit_event("transpilePackages", config.transpile_packages.is_some());
        emit_event("turbotrace", config.experimental.turbotrace.is_some());

        // compiler options
        let compiler_options = config.compiler.as_ref();
        let swc_relay_enabled = compiler_options.and_then(|c| c.relay.as_ref()).is_some();
        let styled_components_enabled = compiler_options
            .and_then(|c| c.styled_components.as_ref().map(|sc| sc.is_enabled()))
            .unwrap_or_default();
        let react_remove_properties_enabled = compiler_options
            .and_then(|c| c.react_remove_properties)
            .unwrap_or_default();
        let remove_console_enabled = compiler_options
            .and_then(|c| c.remove_console.as_ref().map(|rc| rc.is_enabled()))
            .unwrap_or_default();
        let emotion_enabled = compiler_options
            .and_then(|c| c.emotion.as_ref().map(|e| e.is_enabled()))
            .unwrap_or_default();

        emit_event("swcRelay", swc_relay_enabled);
        emit_event("swcStyledComponents", styled_components_enabled);
        emit_event("swcReactRemoveProperties", react_remove_properties_enabled);
        emit_event("swcRemoveConsole", remove_console_enabled);
        emit_event("swcEmotion", emotion_enabled);

        Ok(Default::default())
    }

    /// Scans the app/pages directories for entry points files (matching the
    /// provided page_extensions).
    #[turbo_tasks::function]
    pub async fn entrypoints(self: Vc<Self>) -> Result<Vc<Entrypoints>> {
        self.collect_project_feature_telemetry().await?;

        let mut routes = IndexMap::new();
        let app_project = self.app_project();
        let pages_project = self.pages_project();

        if let Some(app_project) = &*app_project.await? {
            let app_routes = app_project.routes();
            routes.extend(
                app_routes
                    .await?
                    .iter()
                    .map(|(k, v)| (k.clone(), v.clone())),
            );
        }

        for (pathname, page_route) in pages_project.routes().await?.iter() {
            match routes.entry(pathname.clone()) {
                Entry::Occupied(mut entry) => {
                    ConflictIssue {
                        path: self.project_path(),
                        title: StyledString::Text(
                            format!("App Router and Pages Router both match path: {}", pathname)
                                .to_string(),
                        )
                        .cell(),
                        description: StyledString::Text(
                            "Next.js does not support having both App Router and Pages Router \
                             routes matching the same path. Please remove one of the conflicting \
                             routes."
                                .to_string(),
                        )
                        .cell(),
                        severity: IssueSeverity::Error.cell(),
                    }
                    .cell()
                    .emit();
                    *entry.get_mut() = Route::Conflict;
                }
                Entry::Vacant(entry) => {
                    entry.insert(page_route.clone());
                }
            }
        }

        let pages_document_endpoint = TraitRef::cell(
            self.pages_project()
                .document_endpoint()
                .into_trait_ref()
                .await?,
        );
        let pages_app_endpoint =
            TraitRef::cell(self.pages_project().app_endpoint().into_trait_ref().await?);
        let pages_error_endpoint = TraitRef::cell(
            self.pages_project()
                .error_endpoint()
                .into_trait_ref()
                .await?,
        );

        let middleware = find_context_file(
            self.project_path(),
            middleware_files(self.next_config().page_extensions()),
        );
        let middleware = if let FindContextFileResult::Found(fs_path, _) = *middleware.await? {
            let source = Vc::upcast(FileSource::new(fs_path));
            Some(Middleware {
                endpoint: TraitRef::cell(
                    Vc::upcast::<Box<dyn Endpoint>>(self.middleware_endpoint(source))
                        .into_trait_ref()
                        .await?,
                ),
            })
        } else {
            None
        };

        let instrumentation = find_context_file(
            self.project_path(),
            instrumentation_files(self.next_config().page_extensions()),
        );
        let instrumentation = if let FindContextFileResult::Found(fs_path, _) =
            *instrumentation.await?
        {
            let source = Vc::upcast(FileSource::new(fs_path));
            Some(Instrumentation {
                node_js: TraitRef::cell(
                    Vc::upcast::<Box<dyn Endpoint>>(self.instrumentation_endpoint(source, false))
                        .into_trait_ref()
                        .await?,
                ),
                edge: TraitRef::cell(
                    Vc::upcast::<Box<dyn Endpoint>>(self.instrumentation_endpoint(source, true))
                        .into_trait_ref()
                        .await?,
                ),
            })
        } else {
            None
        };

        Ok(Entrypoints {
            routes,
            middleware,
            instrumentation,
            pages_document_endpoint,
            pages_app_endpoint,
            pages_error_endpoint,
        }
        .cell())
    }

    #[turbo_tasks::function]
    fn middleware_context(self: Vc<Self>) -> Vc<Box<dyn AssetContext>> {
        Vc::upcast(ModuleAssetContext::new(
            Default::default(),
            self.edge_compile_time_info(),
            get_server_module_options_context(
                self.project_path(),
                self.execution_context(),
                Value::new(ServerContextType::Middleware),
                self.next_mode(),
                self.next_config(),
            ),
            get_edge_resolve_options_context(
                self.project_path(),
                Value::new(ServerContextType::Middleware),
                self.next_mode(),
                self.next_config(),
                self.execution_context(),
            ),
            Vc::cell("middleware".to_string()),
        ))
    }

    #[turbo_tasks::function]
    async fn middleware_endpoint(
        self: Vc<Self>,
        source: Vc<Box<dyn Source>>,
    ) -> Result<Vc<MiddlewareEndpoint>> {
        let context = self.middleware_context();

        Ok(MiddlewareEndpoint::new(self, context, source))
    }

    #[turbo_tasks::function]
    fn node_instrumentation_context(self: Vc<Self>) -> Vc<Box<dyn AssetContext>> {
        Vc::upcast(ModuleAssetContext::new(
            Default::default(),
            self.server_compile_time_info(),
            get_server_module_options_context(
                self.project_path(),
                self.execution_context(),
                Value::new(ServerContextType::Instrumentation),
                self.next_mode(),
                self.next_config(),
            ),
            get_server_resolve_options_context(
                self.project_path(),
                Value::new(ServerContextType::Instrumentation),
                self.next_mode(),
                self.next_config(),
                self.execution_context(),
            ),
            Vc::cell("instrumentation".to_string()),
        ))
    }

    #[turbo_tasks::function]
    fn instrumentation_endpoint(
        self: Vc<Self>,
        source: Vc<Box<dyn Source>>,
        is_edge: bool,
    ) -> Vc<InstrumentationEndpoint> {
        let context = if is_edge {
            self.middleware_context()
        } else {
            self.node_instrumentation_context()
        };

        InstrumentationEndpoint::new(self, context, source, is_edge)
    }

    #[turbo_tasks::function]
    pub async fn emit_all_output_assets(
        self: Vc<Self>,
        output_assets: Vc<OutputAssetsOperation>,
    ) -> Result<Vc<Completion>> {
        let span = tracing::info_span!("emitting");
        async move {
            let all_output_assets = all_assets_from_entries_operation(output_assets);

            let client_relative_path = self.client_relative_path();
            let node_root = self.node_root();

            self.await?
                .versioned_content_map
                .insert_output_assets(all_output_assets, client_relative_path, node_root)
                .await?;

            Ok(emit_assets(
                *all_output_assets.await?,
                self.node_root(),
                client_relative_path,
                node_root,
            ))
        }
        .instrument(span)
        .await
    }

    #[turbo_tasks::function]
    async fn hmr_content(
        self: Vc<Self>,
        identifier: String,
    ) -> Result<Vc<Box<dyn VersionedContent>>> {
        Ok(self
            .await?
            .versioned_content_map
            .get(self.client_relative_path().join(identifier)))
    }

    #[turbo_tasks::function]
    async fn hmr_version(self: Vc<Self>, identifier: String) -> Result<Vc<Box<dyn Version>>> {
        let content = self.hmr_content(identifier);

        Ok(content.version())
    }

    /// Get the version state for a session. Initialized with the first seen
    /// version in that session.
    #[turbo_tasks::function]
    pub async fn hmr_version_state(
        self: Vc<Self>,
        identifier: String,
        session: TransientInstance<()>,
    ) -> Result<Vc<VersionState>> {
        let version = self.hmr_version(identifier);

        // The session argument is important to avoid caching this function between
        // sessions.
        let _ = session;

        // INVALIDATION: This is intentionally untracked to avoid invalidating this
        // function completely. We want to initialize the VersionState with the
        // first seen version of the session.
        VersionState::new(version.into_trait_ref_untracked().await?).await
    }

    /// Emits opaque HMR events whenever a change is detected in the chunk group
    /// internally known as `identifier`.
    #[turbo_tasks::function]
    pub async fn hmr_update(
        self: Vc<Self>,
        identifier: String,
        from: Vc<VersionState>,
    ) -> Result<Vc<Update>> {
        let from = from.get();
        Ok(self.hmr_content(identifier).update(from))
    }

    /// Gets a list of all HMR identifiers that can be subscribed to. This is
    /// only needed for testing purposes and isn't used in real apps.
    #[turbo_tasks::function]
    pub async fn hmr_identifiers(self: Vc<Self>) -> Result<Vc<Vec<String>>> {
        Ok(self
            .await?
            .versioned_content_map
            .keys_in_path(self.client_relative_path()))
    }

    /// Completion when server side changes are detected in output assets
    /// referenced from the roots
    #[turbo_tasks::function]
    pub fn server_changed(self: Vc<Self>, roots: Vc<OutputAssets>) -> Vc<Completion> {
        let path = self.node_root();
        any_output_changed(roots, path, true)
    }

    /// Completion when client side changes are detected in output assets
    /// referenced from the roots
    #[turbo_tasks::function]
    pub fn client_changed(self: Vc<Self>, roots: Vc<OutputAssets>) -> Vc<Completion> {
        let path = self.client_root();
        any_output_changed(roots, path, false)
    }
}

#[turbo_tasks::function]
async fn any_output_changed(
    roots: Vc<OutputAssets>,
    path: Vc<FileSystemPath>,
    server: bool,
) -> Result<Vc<Completion>> {
    let path = &path.await?;
    let completions = AdjacencyMap::new()
        .skip_duplicates()
        .visit(roots.await?.iter().copied(), get_referenced_output_assets)
        .await
        .completed()?
        .into_inner()
        .into_reverse_topological()
        .map(|m| async move {
            let asset_path = m.ident().path().await?;
            if !asset_path.path.ends_with(".map")
                && (!server || !asset_path.path.ends_with(".css"))
                && asset_path.is_inside_ref(path)
            {
                Ok(Some(content_changed(Vc::upcast(m))))
            } else {
                Ok(None)
            }
        })
        .try_flat_join()
        .await?;

    Ok(Vc::<Completions>::cell(completions).completed())
}

async fn get_referenced_output_assets(
    parent: Vc<Box<dyn OutputAsset>>,
) -> Result<impl Iterator<Item = Vc<Box<dyn OutputAsset>>> + Send> {
    Ok(parent.references().await?.clone_value().into_iter())
}

#[turbo_tasks::function]
async fn all_assets_from_entries_operation_inner(
    operation: Vc<OutputAssetsOperation>,
) -> Result<Vc<OutputAssets>> {
    let assets = *operation.await?;
    Vc::connect(assets);
    Ok(all_assets_from_entries(assets))
}

fn all_assets_from_entries_operation(
    operation: Vc<OutputAssetsOperation>,
) -> Vc<OutputAssetsOperation> {
    Vc::cell(all_assets_from_entries_operation_inner(operation))
}
