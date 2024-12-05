use std::{path::MAIN_SEPARATOR, time::Duration};

use anyhow::{bail, Context, Result};
use indexmap::map::Entry;
use next_core::{
    all_assets_from_entries,
    app_structure::find_app_dir,
    emit_assets, get_edge_chunking_context, get_edge_chunking_context_with_client_assets,
    get_edge_compile_time_info, get_edge_resolve_options_context,
    instrumentation::instrumentation_files,
    middleware::middleware_files,
    mode::NextMode,
    next_client::{get_client_chunking_context, get_client_compile_time_info},
    next_config::{JsConfig, ModuleIdStrategy as ModuleIdStrategyConfig, NextConfig},
    next_server::{
        get_server_chunking_context, get_server_chunking_context_with_client_assets,
        get_server_compile_time_info, get_server_module_options_context,
        get_server_resolve_options_context, ServerContextType,
    },
    next_telemetry::NextFeatureTelemetry,
    util::NextRuntime,
};
use serde::{Deserialize, Serialize};
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    debug::ValueDebugFormat,
    fxindexmap,
    graph::{AdjacencyMap, GraphTraversal},
    trace::TraceRawVcs,
    Completion, Completions, FxIndexMap, IntoTraitRef, ReadRef, ResolvedVc, State, TaskInput,
    TransientInstance, TryFlatJoinIterExt, Value, Vc,
};
use turbo_tasks_env::{EnvMap, ProcessEnv};
use turbo_tasks_fs::{DiskFileSystem, FileSystem, FileSystemPath, VirtualFileSystem};
use turbopack::{
    evaluate_context::node_build_environment, transition::TransitionOptions, ModuleAssetContext,
};
use turbopack_core::{
    changed::content_changed,
    chunk::{
        module_id_strategies::{DevModuleIdStrategy, ModuleIdStrategy},
        ChunkingContext,
    },
    compile_time_info::CompileTimeInfo,
    context::AssetContext,
    diagnostics::DiagnosticExt,
    file_source::FileSource,
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, OptionStyledString, StyledString},
    module::Modules,
    output::{OutputAsset, OutputAssets},
    resolve::{find_context_file, FindContextFileResult},
    source_map::OptionSourceMap,
    version::{
        NotFoundVersion, OptionVersionedContent, Update, Version, VersionState, VersionedContent,
    },
    PROJECT_FILESYSTEM_NAME,
};
use turbopack_node::execution_context::ExecutionContext;
use turbopack_nodejs::NodeJsChunkingContext;

use crate::{
    app::{AppProject, OptionAppProject, ECMASCRIPT_CLIENT_TRANSITION_NAME},
    build,
    empty::EmptyEndpoint,
    entrypoints::Entrypoints,
    global_module_id_strategy::GlobalModuleIdStrategyBuilder,
    instrumentation::InstrumentationEndpoint,
    middleware::MiddlewareEndpoint,
    pages::PagesProject,
    route::{Endpoint, Route},
    versioned_content_map::{OutputAssetsOperation, VersionedContentMap},
};

#[derive(Debug, Serialize, Deserialize, Clone, TaskInput, PartialEq, Eq, Hash, TraceRawVcs)]
#[serde(rename_all = "camelCase")]
pub struct DraftModeOptions {
    pub preview_mode_id: RcStr,
    pub preview_mode_encryption_key: RcStr,
    pub preview_mode_signing_key: RcStr,
}

#[derive(
    Debug, Default, Serialize, Deserialize, Copy, Clone, TaskInput, PartialEq, Eq, Hash, TraceRawVcs,
)]
#[serde(rename_all = "camelCase")]
pub struct WatchOptions {
    /// Whether to watch the filesystem for file changes.
    pub enable: bool,

    /// Enable polling at a certain interval if the native file watching doesn't work (e.g.
    /// docker).
    pub poll_interval: Option<Duration>,
}

#[derive(Debug, Serialize, Deserialize, Clone, TaskInput, PartialEq, Eq, Hash, TraceRawVcs)]
#[serde(rename_all = "camelCase")]
pub struct ProjectOptions {
    /// A root path from which all files must be nested under. Trying to access
    /// a file outside this root will fail. Think of this as a chroot.
    pub root_path: RcStr,

    /// A path inside the root_path which contains the app/pages directories.
    pub project_path: RcStr,

    /// The contents of next.config.js, serialized to JSON.
    pub next_config: RcStr,

    /// The contents of ts/config read by load-jsconfig, serialized to JSON.
    pub js_config: RcStr,

    /// A map of environment variables to use when compiling code.
    pub env: Vec<(RcStr, RcStr)>,

    /// A map of environment variables which should get injected at compile
    /// time.
    pub define_env: DefineEnv,

    /// Filesystem watcher options.
    pub watch: WatchOptions,

    /// The mode in which Next.js is running.
    pub dev: bool,

    /// The server actions encryption key.
    pub encryption_key: RcStr,

    /// The build id.
    pub build_id: RcStr,

    /// Options for draft mode.
    pub preview_props: DraftModeOptions,

    /// The browserslist query to use for targeting browsers.
    pub browserslist_query: RcStr,
}

#[derive(Debug, Serialize, Deserialize, Clone, TaskInput, PartialEq, Eq, Hash, TraceRawVcs)]
#[serde(rename_all = "camelCase")]
pub struct PartialProjectOptions {
    /// A root path from which all files must be nested under. Trying to access
    /// a file outside this root will fail. Think of this as a chroot.
    pub root_path: Option<RcStr>,

    /// A path inside the root_path which contains the app/pages directories.
    pub project_path: Option<RcStr>,

    /// The contents of next.config.js, serialized to JSON.
    pub next_config: Option<RcStr>,

    /// The contents of ts/config read by load-jsconfig, serialized to JSON.
    pub js_config: Option<RcStr>,

    /// A map of environment variables to use when compiling code.
    pub env: Option<Vec<(RcStr, RcStr)>>,

    /// A map of environment variables which should get injected at compile
    /// time.
    pub define_env: Option<DefineEnv>,

    /// Filesystem watcher options.
    pub watch: Option<WatchOptions>,

    /// The mode in which Next.js is running.
    pub dev: Option<bool>,

    /// The server actions encryption key.
    pub encryption_key: Option<RcStr>,

    /// The build id.
    pub build_id: Option<RcStr>,

    /// Options for draft mode.
    pub preview_props: Option<DraftModeOptions>,
}

#[derive(Debug, Serialize, Deserialize, Clone, TaskInput, PartialEq, Eq, Hash, TraceRawVcs)]
#[serde(rename_all = "camelCase")]
pub struct DefineEnv {
    pub client: Vec<(RcStr, RcStr)>,
    pub edge: Vec<(RcStr, RcStr)>,
    pub nodejs: Vec<(RcStr, RcStr)>,
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
    name: RcStr,
    options_state: State<Option<ProjectOptions>>,
    versioned_content_map: Option<ResolvedVc<VersionedContentMap>>,
}

#[turbo_tasks::value_impl]
impl ProjectContainer {
    #[turbo_tasks::function]
    pub async fn new(name: RcStr, dev: bool) -> Result<Vc<Self>> {
        Ok(ProjectContainer {
            name,
            // we only need to enable versioning in dev mode, since build
            // is assumed to be operating over a static snapshot
            versioned_content_map: if dev {
                Some(VersionedContentMap::new().to_resolved().await?)
            } else {
                None
            },
            options_state: State::new(None),
        }
        .cell())
    }
}

impl ProjectContainer {
    #[tracing::instrument(level = "info", name = "initialize project", skip_all)]
    pub async fn initialize(self: Vc<Self>, options: ProjectOptions) -> Result<()> {
        let watch = options.watch;

        self.await?.options_state.set(Some(options));

        let project = self.project();
        let project_fs = project.project_fs().strongly_consistent().await?;
        if watch.enable {
            project_fs
                .start_watching_with_invalidation_reason(watch.poll_interval)
                .await?;
        } else {
            project_fs.invalidate_with_reason();
        }
        let output_fs = project.output_fs().strongly_consistent().await?;
        output_fs.invalidate_with_reason();
        Ok(())
    }

    #[tracing::instrument(level = "info", name = "update project", skip_all)]
    pub async fn update(self: Vc<Self>, options: PartialProjectOptions) -> Result<()> {
        let PartialProjectOptions {
            root_path,
            project_path,
            next_config,
            js_config,
            env,
            define_env,
            watch,
            dev,
            encryption_key,
            build_id,
            preview_props,
        } = options;

        let this = self.await?;

        let mut new_options = this
            .options_state
            .get()
            .clone()
            .context("ProjectContainer need to be initialized with initialize()")?;

        if let Some(root_path) = root_path {
            new_options.root_path = root_path;
        }
        if let Some(project_path) = project_path {
            new_options.project_path = project_path;
        }
        if let Some(next_config) = next_config {
            new_options.next_config = next_config;
        }
        if let Some(js_config) = js_config {
            new_options.js_config = js_config;
        }
        if let Some(env) = env {
            new_options.env = env;
        }
        if let Some(define_env) = define_env {
            new_options.define_env = define_env;
        }
        if let Some(watch) = watch {
            new_options.watch = watch;
        }
        if let Some(dev) = dev {
            new_options.dev = dev;
        }
        if let Some(encryption_key) = encryption_key {
            new_options.encryption_key = encryption_key;
        }
        if let Some(build_id) = build_id {
            new_options.build_id = build_id;
        }
        if let Some(preview_props) = preview_props {
            new_options.preview_props = preview_props;
        }

        // TODO: Handle mode switch, should prevent mode being switched.
        let watch = new_options.watch;

        let project = self.project();
        let prev_project_fs = project.project_fs().strongly_consistent().await?;
        let prev_output_fs = project.output_fs().strongly_consistent().await?;

        this.options_state.set(Some(new_options));
        let project_fs = project.project_fs().strongly_consistent().await?;
        let output_fs = project.output_fs().strongly_consistent().await?;

        if !ReadRef::ptr_eq(&prev_project_fs, &project_fs) {
            if watch.enable {
                // TODO stop watching: prev_project_fs.stop_watching()?;
                project_fs
                    .start_watching_with_invalidation_reason(watch.poll_interval)
                    .await?;
            } else {
                project_fs.invalidate_with_reason();
            }
        }
        if !ReadRef::ptr_eq(&prev_output_fs, &output_fs) {
            prev_output_fs.invalidate_with_reason();
        }

        Ok(())
    }
}

#[turbo_tasks::value_impl]
impl ProjectContainer {
    #[turbo_tasks::function]
    pub async fn project(&self) -> Result<Vc<Project>> {
        let env_map: Vc<EnvMap>;
        let next_config;
        let define_env;
        let js_config;
        let root_path;
        let project_path;
        let watch;
        let dev;
        let encryption_key;
        let build_id;
        let preview_props;
        let browserslist_query;
        {
            let options = self.options_state.get();
            let options = options
                .as_ref()
                .context("ProjectContainer need to be initialized with initialize()")?;
            env_map = Vc::cell(options.env.iter().cloned().collect());
            define_env = ProjectDefineEnv {
                client: ResolvedVc::cell(options.define_env.client.iter().cloned().collect()),
                edge: ResolvedVc::cell(options.define_env.edge.iter().cloned().collect()),
                nodejs: ResolvedVc::cell(options.define_env.nodejs.iter().cloned().collect()),
            }
            .cell();
            next_config = NextConfig::from_string(Vc::cell(options.next_config.clone()));
            js_config = JsConfig::from_string(Vc::cell(options.js_config.clone()));
            root_path = options.root_path.clone();
            project_path = options.project_path.clone();
            watch = options.watch;
            dev = options.dev;
            encryption_key = options.encryption_key.clone();
            build_id = options.build_id.clone();
            preview_props = options.preview_props.clone();
            browserslist_query = options.browserslist_query.clone();
        }

        let dist_dir = next_config
            .await?
            .dist_dir
            .as_ref()
            .map_or_else(|| ".next".into(), |d| d.clone());

        Ok(Project {
            root_path,
            project_path,
            watch,
            next_config: next_config.to_resolved().await?,
            js_config: js_config.to_resolved().await?,
            dist_dir,
            env: ResolvedVc::upcast(env_map.to_resolved().await?),
            define_env: define_env.to_resolved().await?,
            browserslist_query,
            mode: if dev {
                NextMode::Development.resolved_cell()
            } else {
                NextMode::Build.resolved_cell()
            },
            versioned_content_map: self.versioned_content_map,
            build_id,
            encryption_key,
            preview_props,
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
    pub fn hmr_identifiers(self: Vc<Self>) -> Vc<Vec<RcStr>> {
        self.project().hmr_identifiers()
    }

    /// Gets a source map for a particular `file_path`. If `dev` mode is
    /// disabled, this will always return [`OptionSourceMap::none`].
    #[turbo_tasks::function]
    pub fn get_source_map(
        &self,
        file_path: Vc<FileSystemPath>,
        section: Option<RcStr>,
    ) -> Vc<OptionSourceMap> {
        if let Some(map) = self.versioned_content_map {
            map.get_source_map(file_path, section)
        } else {
            OptionSourceMap::none()
        }
    }
}

#[turbo_tasks::value]
pub struct Project {
    /// A root path from which all files must be nested under. Trying to access
    /// a file outside this root will fail. Think of this as a chroot.
    root_path: RcStr,

    /// A path where to emit the build outputs. next.config.js's distDir.
    dist_dir: RcStr,

    /// A path inside the root_path which contains the app/pages directories.
    pub project_path: RcStr,

    /// Filesystem watcher options.
    watch: WatchOptions,

    /// Next config.
    next_config: ResolvedVc<NextConfig>,

    /// Js/Tsconfig read by load-jsconfig
    js_config: ResolvedVc<JsConfig>,

    /// A map of environment variables to use when compiling code.
    env: ResolvedVc<Box<dyn ProcessEnv>>,

    /// A map of environment variables which should get injected at compile
    /// time.
    define_env: ResolvedVc<ProjectDefineEnv>,

    /// The browserslist query to use for targeting browsers.
    browserslist_query: RcStr,

    mode: ResolvedVc<NextMode>,

    versioned_content_map: Option<ResolvedVc<VersionedContentMap>>,

    build_id: RcStr,

    encryption_key: RcStr,

    preview_props: DraftModeOptions,
}

#[turbo_tasks::value]
pub struct ProjectDefineEnv {
    client: ResolvedVc<EnvMap>,
    edge: ResolvedVc<EnvMap>,
    nodejs: ResolvedVc<EnvMap>,
}

#[turbo_tasks::value_impl]
impl ProjectDefineEnv {
    #[turbo_tasks::function]
    pub fn client(&self) -> Vc<EnvMap> {
        *self.client
    }

    #[turbo_tasks::function]
    pub fn edge(&self) -> Vc<EnvMap> {
        *self.edge
    }

    #[turbo_tasks::function]
    pub fn nodejs(&self) -> Vc<EnvMap> {
        *self.nodejs
    }
}

#[turbo_tasks::value(shared)]
struct ConflictIssue {
    path: ResolvedVc<FileSystemPath>,
    title: ResolvedVc<StyledString>,
    description: ResolvedVc<StyledString>,
    severity: ResolvedVc<IssueSeverity>,
}

#[turbo_tasks::value_impl]
impl Issue for ConflictIssue {
    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::AppStructure.cell()
    }

    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        *self.severity
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        *self.path
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        *self.title
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(self.description))
    }
}

#[turbo_tasks::value_impl]
impl Project {
    #[turbo_tasks::function]
    pub async fn app_project(self: Vc<Self>) -> Result<Vc<OptionAppProject>> {
        let app_dir = find_app_dir(self.project_path()).await?;

        Ok(match *app_dir {
            Some(app_dir) => Vc::cell(Some(AppProject::new(self, *app_dir).to_resolved().await?)),
            None => Vc::cell(None),
        })
    }

    #[turbo_tasks::function]
    pub fn pages_project(self: Vc<Self>) -> Vc<PagesProject> {
        PagesProject::new(self)
    }

    #[turbo_tasks::function]
    pub fn project_fs(&self) -> Vc<DiskFileSystem> {
        DiskFileSystem::new(
            PROJECT_FILESYSTEM_NAME.into(),
            self.root_path.clone(),
            vec![],
        )
    }

    #[turbo_tasks::function]
    pub fn client_fs(self: Vc<Self>) -> Vc<Box<dyn FileSystem>> {
        let virtual_fs = VirtualFileSystem::new_with_name("client-fs".into());
        Vc::upcast(virtual_fs)
    }

    #[turbo_tasks::function]
    pub fn output_fs(&self) -> Vc<DiskFileSystem> {
        DiskFileSystem::new("output".into(), self.project_path.clone(), vec![])
    }

    #[turbo_tasks::function]
    pub fn dist_dir(&self) -> Vc<RcStr> {
        Vc::cell(self.dist_dir.clone())
    }

    #[turbo_tasks::function]
    pub async fn node_root(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        let this = self.await?;
        Ok(self.output_fs().root().join(this.dist_dir.clone()))
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
        Ok(self.client_root().join(
            format!(
                "{}/_next",
                next_config.base_path.clone().unwrap_or_else(|| "".into()),
            )
            .into(),
        ))
    }

    #[turbo_tasks::function]
    pub async fn project_path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        let this = self.await?;
        let root = self.project_root_path();
        let project_relative = this.project_path.strip_prefix(&*this.root_path).unwrap();
        let project_relative = project_relative
            .strip_prefix(MAIN_SEPARATOR)
            .unwrap_or(project_relative)
            .replace(MAIN_SEPARATOR, "/");
        Ok(root.join(project_relative.into()))
    }

    #[turbo_tasks::function]
    pub(super) fn env(&self) -> Vc<Box<dyn ProcessEnv>> {
        *self.env
    }

    #[turbo_tasks::function]
    pub(super) fn next_config(&self) -> Vc<NextConfig> {
        *self.next_config
    }

    #[turbo_tasks::function]
    pub(super) fn next_mode(&self) -> Vc<NextMode> {
        *self.mode
    }

    #[turbo_tasks::function]
    pub(super) fn js_config(&self) -> Vc<JsConfig> {
        *self.js_config
    }

    #[turbo_tasks::function]
    pub(super) async fn should_create_webpack_stats(&self) -> Result<Vc<bool>> {
        Ok(Vc::cell(
            self.env.read("TURBOPACK_STATS".into()).await?.is_some(),
        ))
    }

    #[turbo_tasks::function]
    pub(super) async fn execution_context(self: Vc<Self>) -> Result<Vc<ExecutionContext>> {
        let node_root = self.node_root().to_resolved().await?;
        let next_mode = self.next_mode().await?;

        let node_execution_chunking_context = Vc::upcast(
            NodeJsChunkingContext::builder(
                self.project_path().to_resolved().await?,
                node_root,
                node_root,
                node_root.join("build/chunks".into()).to_resolved().await?,
                node_root.join("build/assets".into()).to_resolved().await?,
                node_build_environment().to_resolved().await?,
                next_mode.runtime_type(),
            )
            .build(),
        );

        Ok(ExecutionContext::new(
            self.project_path(),
            node_execution_chunking_context,
            self.env(),
        ))
    }

    #[turbo_tasks::function]
    pub(super) fn client_compile_time_info(&self) -> Vc<CompileTimeInfo> {
        get_client_compile_time_info(self.browserslist_query.clone(), self.define_env.client())
    }

    #[turbo_tasks::function]
    pub(super) async fn server_compile_time_info(self: Vc<Self>) -> Result<Vc<CompileTimeInfo>> {
        let this = self.await?;
        Ok(get_server_compile_time_info(
            self.env(),
            this.define_env.nodejs(),
            // `/ROOT` corresponds to `[project]/`, so we need exactly the `path` part.
            format!("/ROOT/{}", self.project_path().await?.path).into(),
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
    pub(super) fn edge_env(&self) -> Vc<EnvMap> {
        let edge_env = fxindexmap! {
            "__NEXT_BUILD_ID".into() => self.build_id.clone(),
            "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY".into() => self.encryption_key.clone(),
            "__NEXT_PREVIEW_MODE_ID".into() => self.preview_props.preview_mode_id.clone(),
            "__NEXT_PREVIEW_MODE_ENCRYPTION_KEY".into() => self.preview_props.preview_mode_encryption_key.clone(),
            "__NEXT_PREVIEW_MODE_SIGNING_KEY".into() => self.preview_props.preview_mode_signing_key.clone(),
        };
        Vc::cell(edge_env)
    }

    #[turbo_tasks::function]
    pub(super) fn client_chunking_context(self: Vc<Self>) -> Vc<Box<dyn ChunkingContext>> {
        get_client_chunking_context(
            self.project_path(),
            self.client_relative_path(),
            self.next_config().computed_asset_prefix(),
            self.client_compile_time_info().environment(),
            self.next_mode(),
            self.module_id_strategy(),
            self.next_config().turbo_minify(self.next_mode()),
        )
    }

    #[turbo_tasks::function]
    pub(super) fn server_chunking_context(
        self: Vc<Self>,
        client_assets: bool,
    ) -> Vc<NodeJsChunkingContext> {
        if client_assets {
            get_server_chunking_context_with_client_assets(
                self.next_mode(),
                self.project_path(),
                self.node_root(),
                self.client_relative_path(),
                self.next_config().computed_asset_prefix(),
                self.server_compile_time_info().environment(),
                self.module_id_strategy(),
                self.next_config().turbo_minify(self.next_mode()),
            )
        } else {
            get_server_chunking_context(
                self.next_mode(),
                self.project_path(),
                self.node_root(),
                self.server_compile_time_info().environment(),
                self.module_id_strategy(),
                self.next_config().turbo_minify(self.next_mode()),
            )
        }
    }

    #[turbo_tasks::function]
    pub(super) fn edge_chunking_context(
        self: Vc<Self>,
        client_assets: bool,
    ) -> Vc<Box<dyn ChunkingContext>> {
        if client_assets {
            get_edge_chunking_context_with_client_assets(
                self.next_mode(),
                self.project_path(),
                self.node_root(),
                self.client_relative_path(),
                self.next_config().computed_asset_prefix(),
                self.edge_compile_time_info().environment(),
                self.module_id_strategy(),
                self.next_config().turbo_minify(self.next_mode()),
            )
        } else {
            get_edge_chunking_context(
                self.next_mode(),
                self.project_path(),
                self.node_root(),
                self.edge_compile_time_info().environment(),
                self.module_id_strategy(),
                self.next_config().turbo_minify(self.next_mode()),
            )
        }
    }

    #[turbo_tasks::function]
    pub(super) fn runtime_chunking_context(
        self: Vc<Self>,
        client_assets: bool,
        runtime: NextRuntime,
    ) -> Vc<Box<dyn ChunkingContext>> {
        match runtime {
            NextRuntime::Edge => self.edge_chunking_context(client_assets),
            NextRuntime::NodeJs => Vc::upcast(self.server_chunking_context(client_assets)),
        }
    }

    /// Emit a telemetry event corresponding to [webpack configuration telemetry](https://github.com/vercel/next.js/blob/9da305fe320b89ee2f8c3cfb7ecbf48856368913/packages/next/src/build/webpack-config.ts#L2516)
    /// to detect which feature is enabled.
    #[turbo_tasks::function]
    async fn collect_project_feature_telemetry(self: Vc<Self>) -> Result<Vc<()>> {
        let emit_event = |feature_name: &str, enabled: bool| {
            NextFeatureTelemetry::new(feature_name.into(), enabled)
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
        emit_event("turbotrace", false);

        // compiler options
        let compiler_options = config.compiler.as_ref();
        let swc_relay_enabled = compiler_options.and_then(|c| c.relay.as_ref()).is_some();
        let styled_components_enabled = compiler_options
            .and_then(|c| c.styled_components.as_ref().map(|sc| sc.is_enabled()))
            .unwrap_or_default();
        let react_remove_properties_enabled = compiler_options
            .and_then(|c| c.react_remove_properties.as_ref().map(|rc| rc.is_enabled()))
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

        let mut routes = FxIndexMap::default();
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
                        path: self.project_path().to_resolved().await?,
                        title: StyledString::Text(
                            format!("App Router and Pages Router both match path: {}", pathname)
                                .into(),
                        )
                        .resolved_cell(),
                        description: StyledString::Text(
                            "Next.js does not support having both App Router and Pages Router \
                             routes matching the same path. Please remove one of the conflicting \
                             routes."
                                .into(),
                        )
                        .resolved_cell(),
                        severity: IssueSeverity::Error.resolved_cell(),
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

        let pages_document_endpoint = self
            .pages_project()
            .document_endpoint()
            .to_resolved()
            .await?;
        let pages_app_endpoint = self.pages_project().app_endpoint().to_resolved().await?;
        let pages_error_endpoint = self.pages_project().error_endpoint().to_resolved().await?;

        let middleware = self.find_middleware();
        let middleware = if let FindContextFileResult::Found(..) = *middleware.await? {
            Some(Middleware {
                endpoint: self.middleware_endpoint(),
            })
        } else {
            None
        };

        let instrumentation = self.find_instrumentation();
        let instrumentation = if let FindContextFileResult::Found(..) = *instrumentation.await? {
            Some(Instrumentation {
                node_js: self.instrumentation_endpoint(false),
                edge: self.instrumentation_endpoint(true),
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
    async fn middleware_context(self: Vc<Self>) -> Result<Vc<Box<dyn AssetContext>>> {
        let mut transitions = vec![];

        let app_dir = *find_app_dir(self.project_path()).await?;
        let app_project = *self.app_project().await?;

        let ecmascript_client_reference_transition_name = match app_project {
            Some(app_project) => Some(app_project.client_transition_name().to_resolved().await?),
            None => None,
        };

        if let Some(app_project) = app_project {
            transitions.push((
                ECMASCRIPT_CLIENT_TRANSITION_NAME.into(),
                app_project
                    .edge_client_reference_transition()
                    .to_resolved()
                    .await?,
            ));
        }

        Ok(Vc::upcast(ModuleAssetContext::new(
            TransitionOptions {
                named_transitions: transitions.into_iter().collect(),
                ..Default::default()
            }
            .cell(),
            self.edge_compile_time_info(),
            get_server_module_options_context(
                self.project_path(),
                self.execution_context(),
                Value::new(ServerContextType::Middleware {
                    app_dir,
                    ecmascript_client_reference_transition_name,
                }),
                self.next_mode(),
                self.next_config(),
                NextRuntime::Edge,
            ),
            get_edge_resolve_options_context(
                self.project_path(),
                Value::new(ServerContextType::Middleware {
                    app_dir,
                    ecmascript_client_reference_transition_name,
                }),
                self.next_mode(),
                self.next_config(),
                self.execution_context(),
            ),
            Vc::cell("middleware".into()),
        )))
    }

    #[turbo_tasks::function]
    fn find_middleware(self: Vc<Self>) -> Vc<FindContextFileResult> {
        find_context_file(
            self.project_path(),
            middleware_files(self.next_config().page_extensions()),
        )
    }

    #[turbo_tasks::function]
    async fn middleware_endpoint(self: Vc<Self>) -> Result<Vc<Box<dyn Endpoint>>> {
        let middleware = self.find_middleware();
        let FindContextFileResult::Found(fs_path, _) = *middleware.await? else {
            return Ok(Vc::upcast(EmptyEndpoint::new()));
        };
        let source = Vc::upcast(FileSource::new(*fs_path));
        let app_dir = *find_app_dir(self.project_path()).await?;
        let ecmascript_client_reference_transition_name = (*self.app_project().await?)
            .as_ref()
            .map(|app_project| app_project.client_transition_name());

        let middleware_asset_context = self.middleware_context();

        Ok(Vc::upcast(MiddlewareEndpoint::new(
            self,
            middleware_asset_context,
            source,
            app_dir.as_deref().copied(),
            ecmascript_client_reference_transition_name,
        )))
    }

    #[turbo_tasks::function]
    async fn node_instrumentation_context(self: Vc<Self>) -> Result<Vc<Box<dyn AssetContext>>> {
        let mut transitions = vec![];

        let app_dir = *find_app_dir(self.project_path()).await?;
        let app_project = &*self.app_project().await?;

        let ecmascript_client_reference_transition_name = match app_project {
            Some(app_project) => Some(app_project.client_transition_name().to_resolved().await?),
            None => None,
        };

        if let Some(app_project) = app_project {
            transitions.push((
                ECMASCRIPT_CLIENT_TRANSITION_NAME.into(),
                app_project
                    .client_reference_transition()
                    .to_resolved()
                    .await?,
            ));
        }

        Ok(Vc::upcast(ModuleAssetContext::new(
            TransitionOptions {
                named_transitions: transitions.into_iter().collect(),
                ..Default::default()
            }
            .cell(),
            self.server_compile_time_info(),
            get_server_module_options_context(
                self.project_path(),
                self.execution_context(),
                Value::new(ServerContextType::Instrumentation {
                    app_dir,
                    ecmascript_client_reference_transition_name,
                }),
                self.next_mode(),
                self.next_config(),
                NextRuntime::NodeJs,
            ),
            get_server_resolve_options_context(
                self.project_path(),
                Value::new(ServerContextType::Instrumentation {
                    app_dir,
                    ecmascript_client_reference_transition_name,
                }),
                self.next_mode(),
                self.next_config(),
                self.execution_context(),
            ),
            Vc::cell("instrumentation-edge".into()),
        )))
    }

    #[turbo_tasks::function]
    async fn edge_instrumentation_context(self: Vc<Self>) -> Result<Vc<Box<dyn AssetContext>>> {
        let mut transitions = vec![];

        let app_dir = *find_app_dir(self.project_path()).await?;
        let app_project = &*self.app_project().await?;

        let ecmascript_client_reference_transition_name = match app_project {
            Some(app_project) => Some(app_project.client_transition_name().to_resolved().await?),
            None => None,
        };

        if let Some(app_project) = app_project {
            transitions.push((
                ECMASCRIPT_CLIENT_TRANSITION_NAME.into(),
                app_project
                    .edge_client_reference_transition()
                    .to_resolved()
                    .await?,
            ));
        }

        Ok(Vc::upcast(ModuleAssetContext::new(
            TransitionOptions {
                named_transitions: transitions.into_iter().collect(),
                ..Default::default()
            }
            .cell(),
            self.edge_compile_time_info(),
            get_server_module_options_context(
                self.project_path(),
                self.execution_context(),
                Value::new(ServerContextType::Instrumentation {
                    app_dir,
                    ecmascript_client_reference_transition_name,
                }),
                self.next_mode(),
                self.next_config(),
                NextRuntime::Edge,
            ),
            get_edge_resolve_options_context(
                self.project_path(),
                Value::new(ServerContextType::Instrumentation {
                    app_dir,
                    ecmascript_client_reference_transition_name,
                }),
                self.next_mode(),
                self.next_config(),
                self.execution_context(),
            ),
            Vc::cell("instrumentation".into()),
        )))
    }

    #[turbo_tasks::function]
    fn find_instrumentation(self: Vc<Self>) -> Vc<FindContextFileResult> {
        find_context_file(
            self.project_path(),
            instrumentation_files(self.next_config().page_extensions()),
        )
    }

    #[turbo_tasks::function]
    async fn instrumentation_endpoint(
        self: Vc<Self>,
        is_edge: bool,
    ) -> Result<Vc<Box<dyn Endpoint>>> {
        let instrumentation = self.find_instrumentation();
        let FindContextFileResult::Found(fs_path, _) = *instrumentation.await? else {
            return Ok(Vc::upcast(EmptyEndpoint::new()));
        };
        let source = Vc::upcast(FileSource::new(*fs_path));
        let app_dir = *find_app_dir(self.project_path()).await?;
        let ecmascript_client_reference_transition_name = (*self.app_project().await?)
            .as_ref()
            .map(|app_project| app_project.client_transition_name());

        let instrumentation_asset_context = if is_edge {
            self.edge_instrumentation_context()
        } else {
            self.node_instrumentation_context()
        };

        Ok(Vc::upcast(InstrumentationEndpoint::new(
            self,
            instrumentation_asset_context,
            source,
            is_edge,
            app_dir.as_deref().copied(),
            ecmascript_client_reference_transition_name,
        )))
    }

    #[turbo_tasks::function]
    pub async fn emit_all_output_assets(
        self: Vc<Self>,
        output_assets: Vc<OutputAssetsOperation>,
    ) -> Result<()> {
        let span = tracing::info_span!("emitting");
        async move {
            let all_output_assets = all_assets_from_entries_operation(output_assets);

            let client_relative_path = self.client_relative_path();
            let node_root = self.node_root();

            if let Some(map) = self.await?.versioned_content_map {
                let _ = map
                    .insert_output_assets(
                        all_output_assets,
                        node_root,
                        client_relative_path,
                        node_root,
                    )
                    .resolve()
                    .await?;

                Ok(())
            } else {
                let _ = emit_assets(
                    *all_output_assets.await?,
                    node_root,
                    client_relative_path,
                    node_root,
                )
                .resolve()
                .await?;

                Ok(())
            }
        }
        .instrument(span)
        .await
    }

    #[turbo_tasks::function]
    async fn hmr_content(self: Vc<Self>, identifier: RcStr) -> Result<Vc<OptionVersionedContent>> {
        if let Some(map) = self.await?.versioned_content_map {
            let content = map.get(self.client_relative_path().join(identifier.clone()));
            Ok(content)
        } else {
            bail!("must be in dev mode to hmr")
        }
    }

    #[turbo_tasks::function]
    async fn hmr_version(self: Vc<Self>, identifier: RcStr) -> Result<Vc<Box<dyn Version>>> {
        let content = self.hmr_content(identifier).await?;
        if let Some(content) = &*content {
            Ok(content.version())
        } else {
            Ok(Vc::upcast(NotFoundVersion::new()))
        }
    }

    /// Get the version state for a session. Initialized with the first seen
    /// version in that session.
    #[turbo_tasks::function]
    pub async fn hmr_version_state(
        self: Vc<Self>,
        identifier: RcStr,
        session: TransientInstance<()>,
    ) -> Result<Vc<VersionState>> {
        let version = self.hmr_version(identifier);

        // The session argument is important to avoid caching this function between
        // sessions.
        let _ = session;

        // INVALIDATION: This is intentionally untracked to avoid invalidating this
        // function completely. We want to initialize the VersionState with the
        // first seen version of the session.
        let state = VersionState::new(
            version
                .into_trait_ref_strongly_consistent_untracked()
                .await?,
        )
        .await?;
        Ok(state)
    }

    /// Emits opaque HMR events whenever a change is detected in the chunk group
    /// internally known as `identifier`.
    #[turbo_tasks::function]
    pub async fn hmr_update(
        self: Vc<Self>,
        identifier: RcStr,
        from: Vc<VersionState>,
    ) -> Result<Vc<Update>> {
        let from = from.get();
        let content = self.hmr_content(identifier).await?;
        if let Some(content) = *content {
            Ok(content.update(from))
        } else {
            Ok(Update::Missing.cell())
        }
    }

    /// Gets a list of all HMR identifiers that can be subscribed to. This is
    /// only needed for testing purposes and isn't used in real apps.
    #[turbo_tasks::function]
    pub async fn hmr_identifiers(self: Vc<Self>) -> Result<Vc<Vec<RcStr>>> {
        if let Some(map) = self.await?.versioned_content_map {
            Ok(map.keys_in_path(self.client_relative_path()))
        } else {
            bail!("must be in dev mode to hmr")
        }
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

    #[turbo_tasks::function]
    pub async fn client_main_modules(self: Vc<Self>) -> Result<Vc<Modules>> {
        let pages_project = self.pages_project();
        let mut modules = vec![pages_project.client_main_module().to_resolved().await?];

        if let Some(app_project) = *self.app_project().await? {
            modules.push(app_project.client_main_module().to_resolved().await?);
        }

        Ok(Vc::cell(modules))
    }

    /// Gets the module id strategy for the project.
    #[turbo_tasks::function]
    pub async fn module_id_strategy(self: Vc<Self>) -> Result<Vc<Box<dyn ModuleIdStrategy>>> {
        let module_id_strategy = self.next_config().module_id_strategy_config();
        match *module_id_strategy.await? {
            Some(ModuleIdStrategyConfig::Named) => Ok(Vc::upcast(DevModuleIdStrategy::new())),
            Some(ModuleIdStrategyConfig::Deterministic) => {
                Ok(Vc::upcast(GlobalModuleIdStrategyBuilder::build(self)))
            }
            None => match *self.next_mode().await? {
                NextMode::Development => Ok(Vc::upcast(DevModuleIdStrategy::new())),
                NextMode::Build => Ok(Vc::upcast(DevModuleIdStrategy::new())),
            },
        }
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
                Ok(Some(content_changed(*ResolvedVc::upcast(m))))
            } else {
                Ok(None)
            }
        })
        .try_flat_join()
        .await?;

    Ok(Vc::<Completions>::cell(completions).completed())
}

async fn get_referenced_output_assets(
    parent: ResolvedVc<Box<dyn OutputAsset>>,
) -> Result<impl Iterator<Item = ResolvedVc<Box<dyn OutputAsset>>> + Send> {
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

#[turbo_tasks::function]
fn stable_endpoint(endpoint: Vc<Box<dyn Endpoint>>) -> Vc<Box<dyn Endpoint>> {
    endpoint
}
