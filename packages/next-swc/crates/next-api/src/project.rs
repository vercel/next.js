use std::path::MAIN_SEPARATOR;

use anyhow::Result;
use indexmap::{map::Entry, IndexMap};
use next_core::{
    app_structure::find_app_dir,
    get_edge_chunking_context, get_edge_compile_time_info,
    mode::NextMode,
    next_client::{get_client_chunking_context, get_client_compile_time_info},
    next_config::{JsConfig, NextConfig},
    next_server::{get_server_chunking_context, get_server_compile_time_info},
    next_telemetry::NextFeatureTelemetry,
    util::NextSourceConfig,
};
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    debug::ValueDebugFormat, trace::TraceRawVcs, unit, State, TaskInput, TransientValue, Vc,
};
use turbopack_binding::{
    turbo::{
        tasks_env::{EnvMap, ProcessEnv},
        tasks_fs::{DiskFileSystem, FileSystem, FileSystemPath, VirtualFileSystem},
    },
    turbopack::{
        build::BuildChunkingContext,
        core::{
            chunk::ChunkingContext, compile_time_info::CompileTimeInfo, diagnostics::DiagnosticExt,
            environment::ServerAddr, PROJECT_FILESYSTEM_NAME,
        },
        dev::DevChunkingContext,
        ecmascript::chunk::EcmascriptChunkingContext,
        node::execution_context::ExecutionContext,
        turbopack::evaluate_context::node_build_environment,
    },
};

use crate::{
    app::{AppProject, OptionAppProject},
    build,
    entrypoints::Entrypoints,
    pages::PagesProject,
    route::{Endpoint, Route},
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

    /// Whether to watch the filesystem for file changes.
    pub watch: bool,
}

#[derive(Serialize, Deserialize, TraceRawVcs, PartialEq, Eq, ValueDebugFormat)]
pub struct Middleware {
    pub endpoint: Vc<Box<dyn Endpoint>>,
    pub config: NextSourceConfig,
}

#[turbo_tasks::value]
pub struct ProjectContainer {
    state: State<ProjectOptions>,
}

#[turbo_tasks::value_impl]
impl ProjectContainer {
    #[turbo_tasks::function]
    pub fn new(options: ProjectOptions) -> Vc<Self> {
        ProjectContainer {
            state: State::new(options),
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub async fn update(self: Vc<Self>, options: ProjectOptions) -> Result<Vc<()>> {
        self.await?.state.set(options);
        Ok(unit())
    }

    #[turbo_tasks::function]
    pub async fn project(self: Vc<Self>) -> Result<Vc<Project>> {
        let this = self.await?;
        let options = this.state.get();
        let next_config = NextConfig::from_string(Vc::cell(options.next_config.clone()));
        let js_config = JsConfig::from_string(Vc::cell(options.js_config.clone()));
        let env: Vc<EnvMap> = Vc::cell(options.env.iter().cloned().collect());
        Ok(Project {
            root_path: options.root_path.clone(),
            project_path: options.project_path.clone(),
            watch: options.watch,
            next_config,
            js_config,
            env: Vc::upcast(env),
            browserslist_query: "last 1 Chrome versions, last 1 Firefox versions, last 1 Safari \
                                 versions, last 1 Edge versions"
                .to_string(),
            mode: NextMode::Development,
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub fn entrypoints(self: Vc<Self>) -> Vc<Entrypoints> {
        self.project().entrypoints()
    }
}

#[turbo_tasks::value]
pub struct Project {
    /// A root path from which all files must be nested under. Trying to access
    /// a file outside this root will fail. Think of this as a chroot.
    root_path: String,

    /// A path inside the root_path which contains the app/pages directories.
    project_path: String,

    /// Whether to watch the filesystem for file changes.
    watch: bool,

    /// Next config.
    next_config: Vc<NextConfig>,

    /// Js/Tsconfig read by load-jsconfig
    js_config: Vc<JsConfig>,

    /// A map of environment variables to use when compiling code.
    env: Vc<Box<dyn ProcessEnv>>,

    browserslist_query: String,

    mode: NextMode,
}

#[turbo_tasks::value_impl]
impl Project {
    #[turbo_tasks::function]
    async fn app_project(self: Vc<Self>) -> Result<Vc<OptionAppProject>> {
        let this = self.await?;
        let app_dir = find_app_dir(self.project_path()).await?;

        Ok(Vc::cell(if let Some(app_dir) = &*app_dir {
            Some(AppProject::new(self, *app_dir, this.mode))
        } else {
            None
        }))
    }

    #[turbo_tasks::function]
    async fn pages_project(self: Vc<Self>) -> Result<Vc<PagesProject>> {
        let this = self.await?;
        Ok(PagesProject::new(self, this.mode))
    }

    #[turbo_tasks::function]
    async fn project_fs(self: Vc<Self>) -> Result<Vc<Box<dyn FileSystem>>> {
        let this = self.await?;
        let disk_fs = DiskFileSystem::new(
            PROJECT_FILESYSTEM_NAME.to_string(),
            this.root_path.to_string(),
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
    async fn node_fs(self: Vc<Self>) -> Result<Vc<Box<dyn FileSystem>>> {
        let this = self.await?;
        let disk_fs = DiskFileSystem::new("node".to_string(), this.project_path.clone());
        disk_fs.await?.start_watching_with_invalidation_reason()?;
        Ok(Vc::upcast(disk_fs))
    }

    #[turbo_tasks::function]
    pub(super) fn node_root(self: Vc<Self>) -> Vc<FileSystemPath> {
        self.node_fs().root().join(".next".to_string())
    }

    #[turbo_tasks::function]
    pub(super) fn client_root(self: Vc<Self>) -> Vc<FileSystemPath> {
        self.client_fs().root()
    }

    #[turbo_tasks::function]
    fn project_root_path(self: Vc<Self>) -> Vc<FileSystemPath> {
        self.project_fs().root()
    }

    #[turbo_tasks::function]
    pub(super) fn client_relative_path(self: Vc<Self>) -> Vc<FileSystemPath> {
        self.client_root().join("_next".to_string())
    }

    #[turbo_tasks::function]
    pub(super) async fn project_path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
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
    pub(super) fn client_compile_time_info(&self) -> Vc<CompileTimeInfo> {
        get_client_compile_time_info(self.mode, self.browserslist_query.clone())
    }

    #[turbo_tasks::function]
    pub(super) async fn server_compile_time_info(self: Vc<Self>) -> Result<Vc<CompileTimeInfo>> {
        let this = self.await?;
        Ok(get_server_compile_time_info(
            this.mode,
            self.env(),
            // TODO(alexkirsz) Fill this out.
            ServerAddr::empty(),
        ))
    }

    #[turbo_tasks::function]
    pub(super) fn edge_compile_time_info(self: Vc<Self>) -> Vc<CompileTimeInfo> {
        get_edge_compile_time_info(
            self.project_path(),
            // TODO(alexkirsz) Fill this out.
            ServerAddr::empty(),
        )
    }

    #[turbo_tasks::function]
    pub(super) async fn client_chunking_context(
        self: Vc<Self>,
    ) -> Result<Vc<Box<dyn EcmascriptChunkingContext>>> {
        let this = self.await?;
        Ok(get_client_chunking_context(
            self.project_path(),
            self.client_root(),
            self.client_compile_time_info().environment(),
            this.mode,
        ))
    }

    #[turbo_tasks::function]
    fn server_chunking_context(self: Vc<Self>) -> Vc<BuildChunkingContext> {
        get_server_chunking_context(
            self.project_path(),
            self.node_root(),
            self.client_root(),
            self.server_compile_time_info().environment(),
        )
    }

    #[turbo_tasks::function]
    fn edge_chunking_context(self: Vc<Self>) -> Vc<Box<dyn EcmascriptChunkingContext>> {
        get_edge_chunking_context(
            self.project_path(),
            self.node_root(),
            self.client_root(),
            self.edge_compile_time_info().environment(),
        )
    }

    /// Emit a telemetry event corresponding to webpack configuration telemetry
    /// (https://github.com/vercel/next.js/blob/9da305fe320b89ee2f8c3cfb7ecbf48856368913/packages/next/src/build/webpack-config.ts#L2516)
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
            .map(|c| c.styled_components.is_some())
            .unwrap_or_default();
        let react_remove_properties_enabled = compiler_options
            .and_then(|c| c.react_remove_properties)
            .unwrap_or_default();
        let remove_console_enabled = compiler_options
            .map(|c| c.remove_console.is_some())
            .unwrap_or_default();
        let emotion_enabled = compiler_options
            .map(|c| c.emotion.is_some())
            .unwrap_or_default();

        emit_event("swcRelay", swc_relay_enabled);
        emit_event("swcStyledComponents", styled_components_enabled);
        emit_event("swcReactRemoveProperties", react_remove_properties_enabled);
        emit_event("swcRemoveConsole", remove_console_enabled);
        emit_event("swcEmotion", emotion_enabled);

        Ok(unit())
    }

    #[turbo_tasks::function]
    pub(super) fn ssr_chunking_context(self: Vc<Self>) -> Vc<BuildChunkingContext> {
        self.server_chunking_context().with_layer("ssr".to_string())
    }

    #[turbo_tasks::function]
    pub(super) fn edge_ssr_chunking_context(
        self: Vc<Self>,
    ) -> Vc<Box<dyn EcmascriptChunkingContext>> {
        self.edge_chunking_context()
            .with_layer("edge ssr".to_string())
    }

    #[turbo_tasks::function]
    pub(super) fn ssr_data_chunking_context(self: Vc<Self>) -> Vc<BuildChunkingContext> {
        self.server_chunking_context()
            .with_layer("ssr data".to_string())
    }

    #[turbo_tasks::function]
    pub(super) fn edge_ssr_data_chunking_context(
        self: Vc<Self>,
    ) -> Vc<Box<dyn EcmascriptChunkingContext>> {
        self.edge_chunking_context()
            .with_layer("edge ssr data".to_string())
    }

    #[turbo_tasks::function]
    pub(super) fn rsc_chunking_context(self: Vc<Self>) -> Vc<BuildChunkingContext> {
        self.server_chunking_context().with_layer("rsc".to_string())
    }

    #[turbo_tasks::function]
    pub(super) fn edge_rsc_chunking_context(
        self: Vc<Self>,
    ) -> Vc<Box<dyn EcmascriptChunkingContext>> {
        self.edge_chunking_context()
            .with_layer("edge rsc".to_string())
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
            routes.extend(app_routes.await?.iter().map(|(k, v)| (k.clone(), *v)));
        }

        for (pathname, page_route) in pages_project.routes().await?.iter() {
            match routes.entry(pathname.clone()) {
                Entry::Occupied(mut entry) => {
                    *entry.get_mut() = Route::Conflict;
                }
                Entry::Vacant(entry) => {
                    entry.insert(*page_route);
                }
            }
        }

        // TODO middleware
        Ok(Entrypoints {
            routes,
            middleware: None,
            pages_document_endpoint: self.pages_project().document_endpoint(),
            pages_app_endpoint: self.pages_project().app_endpoint(),
            pages_error_endpoint: self.pages_project().error_endpoint(),
        }
        .cell())
    }

    /// Emits opaque HMR events whenever a change is detected in the chunk group
    /// internally known as `identifier`.
    #[turbo_tasks::function]
    pub fn hmr_events(self: Vc<Self>, _identifier: String, _sender: TransientValue<()>) -> Vc<()> {
        unit()
    }
}

#[turbo_tasks::function]
async fn project_fs(project_dir: String, watching: bool) -> Result<Vc<Box<dyn FileSystem>>> {
    let disk_fs = DiskFileSystem::new(PROJECT_FILESYSTEM_NAME.to_string(), project_dir.to_string());
    if watching {
        disk_fs.await?.start_watching_with_invalidation_reason()?;
    }
    Ok(Vc::upcast(disk_fs))
}
