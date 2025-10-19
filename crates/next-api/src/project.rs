use std::time::Duration;

use anyhow::{Context, Result, bail};
use indexmap::map::Entry;
use next_core::{
    all_assets_from_entries,
    app_structure::find_app_dir,
    emit_assets, get_edge_chunking_context, get_edge_chunking_context_with_client_assets,
    get_edge_compile_time_info, get_edge_resolve_options_context,
    instrumentation::instrumentation_files,
    middleware::middleware_files,
    mode::NextMode,
    next_client::{
        ClientChunkingContextOptions, get_client_chunking_context, get_client_compile_time_info,
    },
    next_config::{ModuleIds as ModuleIdStrategyConfig, NextConfig},
    next_edge::context::EdgeChunkingContextOptions,
    next_server::{
        ServerChunkingContextOptions, ServerContextType, get_server_chunking_context,
        get_server_chunking_context_with_client_assets, get_server_compile_time_info,
        get_server_module_options_context, get_server_resolve_options_context,
    },
    next_telemetry::NextFeatureTelemetry,
    parse_segment_config_from_source,
    segment_config::ParseSegmentMode,
    util::{NextRuntime, OptionEnvMap},
};
use serde::{Deserialize, Serialize};
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    Completion, Completions, FxIndexMap, IntoTraitRef, NonLocalValue, OperationValue, OperationVc,
    ReadRef, ResolvedVc, State, TaskInput, TransientInstance, TryFlatJoinIterExt, Vc,
    debug::ValueDebugFormat,
    fxindexmap,
    graph::{AdjacencyMap, GraphTraversal},
    mark_root,
    trace::TraceRawVcs,
};
use turbo_tasks_env::{EnvMap, ProcessEnv};
use turbo_tasks_fs::{DiskFileSystem, FileSystem, FileSystemPath, VirtualFileSystem, invalidation};
use turbo_unix_path::{join_path, unix_to_sys};
use turbopack::{
    ModuleAssetContext, evaluate_context::node_build_environment,
    global_module_ids::get_global_module_id_strategy, transition::TransitionOptions,
};
use turbopack_core::{
    PROJECT_FILESYSTEM_NAME,
    changed::content_changed,
    chunk::{
        ChunkingContext, EvaluatableAssets, SourceMapsType,
        module_id_strategies::{DevModuleIdStrategy, ModuleIdStrategy},
    },
    compile_time_info::CompileTimeInfo,
    context::AssetContext,
    diagnostics::DiagnosticExt,
    environment::NodeJsVersion,
    file_source::FileSource,
    ident::Layer,
    issue::{
        CollectibleIssuesExt, Issue, IssueExt, IssueSeverity, IssueStage, OptionStyledString,
        StyledString,
    },
    module::Module,
    module_graph::{
        GraphEntries, ModuleGraph, SingleModuleGraph, VisitedModules,
        chunk_group_info::ChunkGroupEntry,
        export_usage::{OptionExportUsageInfo, compute_export_usage_info},
    },
    output::{OutputAsset, OutputAssets},
    resolve::{FindContextFileResult, find_context_file},
    source_map::OptionStringifiedSourceMap,
    version::{
        NotFoundVersion, OptionVersionedContent, Update, Version, VersionState, VersionedContent,
    },
};
use turbopack_node::execution_context::ExecutionContext;
use turbopack_nodejs::NodeJsChunkingContext;

use crate::{
    app::{AppProject, OptionAppProject},
    empty::EmptyEndpoint,
    entrypoints::Entrypoints,
    instrumentation::InstrumentationEndpoint,
    middleware::MiddlewareEndpoint,
    pages::PagesProject,
    route::{AppPageRoute, Endpoint, Endpoints, Route},
    versioned_content_map::VersionedContentMap,
};

#[derive(
    Debug,
    Serialize,
    Deserialize,
    Clone,
    TaskInput,
    PartialEq,
    Eq,
    Hash,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
)]
#[serde(rename_all = "camelCase")]
pub struct DraftModeOptions {
    pub preview_mode_id: RcStr,
    pub preview_mode_encryption_key: RcStr,
    pub preview_mode_signing_key: RcStr,
}

#[derive(
    Debug,
    Default,
    Serialize,
    Deserialize,
    Copy,
    Clone,
    TaskInput,
    PartialEq,
    Eq,
    Hash,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
)]
#[serde(rename_all = "camelCase")]
pub struct WatchOptions {
    /// Whether to watch the filesystem for file changes.
    pub enable: bool,

    /// Enable polling at a certain interval if the native file watching doesn't work (e.g.
    /// docker).
    pub poll_interval: Option<Duration>,
}

#[derive(
    Debug,
    Serialize,
    Deserialize,
    Clone,
    TaskInput,
    PartialEq,
    Eq,
    Hash,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
)]
#[serde(rename_all = "camelCase")]
pub struct ProjectOptions {
    /// An absolute root path (Unix or Windows path) from which all files must be nested under.
    /// Trying to access a file outside this root will fail, so think of this as a chroot.
    /// E.g. `/home/user/projects/my-repo`.
    pub root_path: RcStr,

    /// A path which contains the app/pages directories, relative to [`Project::root_path`], always
    /// Unix path. E.g. `apps/my-app`
    pub project_path: RcStr,

    /// The contents of next.config.js, serialized to JSON.
    pub next_config: RcStr,

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

    /// When the code is minified, this opts out of the default mangling of
    /// local names for variables, functions etc., which can be useful for
    /// debugging/profiling purposes.
    pub no_mangling: bool,

    /// The version of Node.js that is available/currently running.
    pub current_node_js_version: RcStr,
}

#[derive(
    Debug, Serialize, Deserialize, Clone, TaskInput, PartialEq, Eq, Hash, TraceRawVcs, NonLocalValue,
)]
#[serde(rename_all = "camelCase")]
pub struct PartialProjectOptions {
    /// A root path from which all files must be nested under. Trying to access
    /// a file outside this root will fail. Think of this as a chroot.
    pub root_path: Option<RcStr>,

    /// A path inside the root_path which contains the app/pages directories.
    pub project_path: Option<RcStr>,

    /// The contents of next.config.js, serialized to JSON.
    pub next_config: Option<RcStr>,

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

#[derive(
    Debug,
    Serialize,
    Deserialize,
    Clone,
    TaskInput,
    PartialEq,
    Eq,
    Hash,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
)]
#[serde(rename_all = "camelCase")]
pub struct DefineEnv {
    pub client: Vec<(RcStr, Option<RcStr>)>,
    pub edge: Vec<(RcStr, Option<RcStr>)>,
    pub nodejs: Vec<(RcStr, Option<RcStr>)>,
}

#[derive(Serialize, Deserialize, TraceRawVcs, PartialEq, Eq, ValueDebugFormat, NonLocalValue)]
pub struct Middleware {
    pub endpoint: ResolvedVc<Box<dyn Endpoint>>,
    pub is_proxy: bool,
}

#[derive(Serialize, Deserialize, TraceRawVcs, PartialEq, Eq, ValueDebugFormat, NonLocalValue)]
pub struct Instrumentation {
    pub node_js: ResolvedVc<Box<dyn Endpoint>>,
    pub edge: ResolvedVc<Box<dyn Endpoint>>,
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
    pub fn new(name: RcStr, dev: bool) -> Result<Vc<Self>> {
        Ok(ProjectContainer {
            name,
            // we only need to enable versioning in dev mode, since build
            // is assumed to be operating over a static snapshot
            versioned_content_map: if dev {
                Some(VersionedContentMap::new())
            } else {
                None
            },
            options_state: State::new(None),
        }
        .cell())
    }
}

#[turbo_tasks::function(operation)]
fn project_operation(project: ResolvedVc<ProjectContainer>) -> Vc<Project> {
    project.project()
}

#[turbo_tasks::function(operation)]
fn project_fs_operation(project: ResolvedVc<Project>) -> Vc<DiskFileSystem> {
    project.project_fs()
}

#[turbo_tasks::function(operation)]
fn output_fs_operation(project: ResolvedVc<Project>) -> Vc<DiskFileSystem> {
    project.project_fs()
}

impl ProjectContainer {
    #[tracing::instrument(level = "info", name = "initialize project", skip_all)]
    pub async fn initialize(self: ResolvedVc<Self>, options: ProjectOptions) -> Result<()> {
        let watch = options.watch;

        self.await?.options_state.set(Some(options));

        let project = self.project().to_resolved().await?;
        let project_fs = project_fs_operation(project)
            .read_strongly_consistent()
            .await?;
        if watch.enable {
            project_fs
                .start_watching_with_invalidation_reason(watch.poll_interval)
                .await?;
        } else {
            project_fs.invalidate_with_reason(|path| invalidation::Initialize {
                // this path is just used for display purposes
                path: RcStr::from(path.to_string_lossy()),
            });
        }
        let output_fs = output_fs_operation(project)
            .read_strongly_consistent()
            .await?;
        output_fs.invalidate_with_reason(|path| invalidation::Initialize {
            path: RcStr::from(path.to_string_lossy()),
        });
        Ok(())
    }

    #[tracing::instrument(level = "info", name = "update project options", skip_all)]
    pub async fn update(self: Vc<Self>, options: PartialProjectOptions) -> Result<()> {
        let PartialProjectOptions {
            root_path,
            project_path,
            next_config,
            env,
            define_env,
            watch,
            dev,
            encryption_key,
            build_id,
            preview_props,
        } = options;

        let resolved_self = self.to_resolved().await?;
        let this = resolved_self.await?;

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

        let project = project_operation(resolved_self)
            .resolve_strongly_consistent()
            .await?;
        let prev_project_fs = project_fs_operation(project)
            .read_strongly_consistent()
            .await?;
        let prev_output_fs = output_fs_operation(project)
            .read_strongly_consistent()
            .await?;

        this.options_state.set(Some(new_options));
        let project = project_operation(resolved_self)
            .resolve_strongly_consistent()
            .await?;
        let project_fs = project_fs_operation(project)
            .read_strongly_consistent()
            .await?;
        let output_fs = output_fs_operation(project)
            .read_strongly_consistent()
            .await?;

        if !ReadRef::ptr_eq(&prev_project_fs, &project_fs) {
            if watch.enable {
                // TODO stop watching: prev_project_fs.stop_watching()?;
                project_fs
                    .start_watching_with_invalidation_reason(watch.poll_interval)
                    .await?;
            } else {
                project_fs.invalidate_with_reason(|path| invalidation::Initialize {
                    // this path is just used for display purposes
                    path: RcStr::from(path.to_string_lossy()),
                });
            }
        }
        if !ReadRef::ptr_eq(&prev_output_fs, &output_fs) {
            prev_output_fs.invalidate_with_reason(|path| invalidation::Initialize {
                path: RcStr::from(path.to_string_lossy()),
            });
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
        let root_path;
        let project_path;
        let watch;
        let dev;
        let encryption_key;
        let build_id;
        let preview_props;
        let browserslist_query;
        let no_mangling;
        let current_node_js_version;
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
            root_path = options.root_path.clone();
            project_path = options.project_path.clone();
            watch = options.watch;
            dev = options.dev;
            encryption_key = options.encryption_key.clone();
            build_id = options.build_id.clone();
            preview_props = options.preview_props.clone();
            browserslist_query = options.browserslist_query.clone();
            no_mangling = options.no_mangling;
            current_node_js_version = options.current_node_js_version.clone();
        }

        let dist_dir = next_config.dist_dir().owned().await?;
        let dist_dir_root = next_config.dist_dir_root().owned().await?;
        Ok(Project {
            root_path,
            project_path,
            watch,
            next_config: next_config.to_resolved().await?,
            dist_dir,
            dist_dir_root,
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
            no_mangling,
            current_node_js_version,
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

    /// Gets a source map for a particular `file_path`. If `dev` mode is disabled, this will always
    /// return [`OptionStringifiedSourceMap::none`].
    #[turbo_tasks::function]
    pub fn get_source_map(
        &self,
        file_path: FileSystemPath,
        section: Option<RcStr>,
    ) -> Vc<OptionStringifiedSourceMap> {
        if let Some(map) = self.versioned_content_map {
            map.get_source_map(file_path, section)
        } else {
            OptionStringifiedSourceMap::none()
        }
    }
}

#[turbo_tasks::value]
pub struct Project {
    /// An absolute root path (Windows or Unix path) from which all files must be nested under.
    /// Trying to access a file outside this root will fail, so think of this as a chroot.
    /// E.g. `/home/user/projects/my-repo`.
    root_path: RcStr,

    /// A path which contains the app/pages directories, relative to [`Project::root_path`], always
    /// a Unix path.
    /// E.g. `apps/my-app`
    project_path: RcStr,

    /// A path where to emit the build outputs, relative to [`Project::project_path`], always a
    /// Unix path. Corresponds to next.config.js's `distDir`.
    /// E.g. `.next`
    dist_dir: RcStr,

    /// The root directory of the distDir. Generally the same as `distDir` but when
    /// `isolatedDevBuild` is true it is the parent directory of `distDir`.  This is used to
    /// ensure that the bundler doesn't traverse into the output directory.
    dist_dir_root: RcStr,

    /// Filesystem watcher options.
    watch: WatchOptions,

    /// Next config.
    next_config: ResolvedVc<NextConfig>,

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

    /// When the code is minified, this opts out of the default mangling of
    /// local names for variables, functions etc., which can be useful for
    /// debugging/profiling purposes.
    no_mangling: bool,

    current_node_js_version: RcStr,
}

#[turbo_tasks::value]
pub struct ProjectDefineEnv {
    client: ResolvedVc<OptionEnvMap>,
    edge: ResolvedVc<OptionEnvMap>,
    nodejs: ResolvedVc<OptionEnvMap>,
}

#[turbo_tasks::value_impl]
impl ProjectDefineEnv {
    #[turbo_tasks::function]
    pub fn client(&self) -> Vc<OptionEnvMap> {
        *self.client
    }

    #[turbo_tasks::function]
    pub fn edge(&self) -> Vc<OptionEnvMap> {
        *self.edge
    }

    #[turbo_tasks::function]
    pub fn nodejs(&self) -> Vc<OptionEnvMap> {
        *self.nodejs
    }
}

#[turbo_tasks::value(shared)]
struct ConflictIssue {
    path: FileSystemPath,
    title: ResolvedVc<StyledString>,
    description: ResolvedVc<StyledString>,
    severity: IssueSeverity,
}

#[turbo_tasks::value_impl]
impl Issue for ConflictIssue {
    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::AppStructure.cell()
    }

    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.path.clone().cell()
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
        let app_dir = find_app_dir(self.project_path().owned().await?).await?;

        Ok(match &*app_dir {
            Some(app_dir) => Vc::cell(Some(
                AppProject::new(self, app_dir.clone()).to_resolved().await?,
            )),
            None => Vc::cell(None),
        })
    }

    #[turbo_tasks::function]
    pub fn pages_project(self: Vc<Self>) -> Vc<PagesProject> {
        PagesProject::new(self)
    }

    #[turbo_tasks::function]
    pub fn project_fs(&self) -> Result<Vc<DiskFileSystem>> {
        let denied_path = match join_path(&self.project_path, &self.dist_dir_root) {
            Some(dist_dir_root) => dist_dir_root.into(),
            None => {
                bail!(
                    "Invalid distDirRoot: {:?}. distDirRoot should not navigate out of the \
                     projectPath.",
                    self.dist_dir_root
                );
            }
        };

        Ok(DiskFileSystem::new_with_denied_path(
            rcstr!(PROJECT_FILESYSTEM_NAME),
            self.root_path.clone(),
            denied_path,
        ))
    }

    #[turbo_tasks::function]
    pub fn client_fs(self: Vc<Self>) -> Vc<Box<dyn FileSystem>> {
        let virtual_fs = VirtualFileSystem::new_with_name(rcstr!("client-fs"));
        Vc::upcast(virtual_fs)
    }

    #[turbo_tasks::function]
    pub fn output_fs(&self) -> Vc<DiskFileSystem> {
        DiskFileSystem::new(rcstr!("output"), self.root_path.clone())
    }

    #[turbo_tasks::function]
    pub fn dist_dir_absolute(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!(
                "{}{}{}",
                self.root_path,
                std::path::MAIN_SEPARATOR,
                unix_to_sys(
                    &join_path(&self.project_path, &self.dist_dir)
                        .context("expected project_path to be inside of root_path")?
                )
            )
            .into(),
        ))
    }

    #[turbo_tasks::function]
    pub async fn node_root(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        let this = self.await?;
        Ok(self
            .output_fs()
            .root()
            .await?
            .join(&this.project_path)?
            .join(&this.dist_dir)?
            .cell())
    }

    #[turbo_tasks::function]
    pub fn client_root(self: Vc<Self>) -> Vc<FileSystemPath> {
        self.client_fs().root()
    }

    #[turbo_tasks::function]
    pub fn project_root_path(self: Vc<Self>) -> Vc<FileSystemPath> {
        self.project_fs().root()
    }

    #[turbo_tasks::function]
    pub async fn client_relative_path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        let next_config = self.next_config();
        Ok(self
            .client_root()
            .await?
            .join(&format!(
                "{}/_next",
                next_config
                    .base_path()
                    .await?
                    .as_deref()
                    .unwrap_or_default(),
            ))?
            .cell())
    }

    /// Returns the relative path from the node root to the output root.
    /// E.g. from `[project]/test/e2e/app-dir/non-root-project-monorepo/apps/web/app/
    /// import-meta-url-ssr/page.tsx` to `[project]/`.
    #[turbo_tasks::function]
    pub async fn node_root_to_root_path(self: Vc<Self>) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            self.node_root()
                .await?
                .get_relative_path_to(&*self.output_fs().root().await?)
                .context("Expected node root to be inside of output fs")?,
        ))
    }

    #[turbo_tasks::function]
    pub async fn project_path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        let this = self.await?;
        let root = self.project_root_path().await?;
        Ok(root.join(&this.project_path)?.cell())
    }

    #[turbo_tasks::function]
    pub(super) fn env(&self) -> Vc<Box<dyn ProcessEnv>> {
        *self.env
    }

    #[turbo_tasks::function]
    pub async fn ci_has_next_support(&self) -> Result<Vc<bool>> {
        Ok(Vc::cell(
            self.env.read(rcstr!("NOW_BUILDER")).await?.is_some(),
        ))
    }

    #[turbo_tasks::function]
    pub(super) fn current_node_js_version(&self) -> Vc<NodeJsVersion> {
        NodeJsVersion::Static(ResolvedVc::cell(self.current_node_js_version.clone())).cell()
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
    pub(super) fn is_watch_enabled(&self) -> Result<Vc<bool>> {
        Ok(Vc::cell(self.watch.enable))
    }

    #[turbo_tasks::function]
    pub(super) async fn per_page_module_graph(&self) -> Result<Vc<bool>> {
        Ok(Vc::cell(*self.mode.await? == NextMode::Development))
    }

    #[turbo_tasks::function]
    pub(super) fn encryption_key(&self) -> Vc<RcStr> {
        Vc::cell(self.encryption_key.clone())
    }

    #[turbo_tasks::function]
    pub(super) fn no_mangling(&self) -> Vc<bool> {
        Vc::cell(self.no_mangling)
    }

    #[turbo_tasks::function]
    pub(super) async fn should_create_webpack_stats(&self) -> Result<Vc<bool>> {
        Ok(Vc::cell(
            self.env.read(rcstr!("TURBOPACK_STATS")).await?.is_some(),
        ))
    }

    #[turbo_tasks::function]
    pub(super) async fn execution_context(self: Vc<Self>) -> Result<Vc<ExecutionContext>> {
        let node_root = self.node_root().owned().await?;
        let next_mode = self.next_mode().await?;

        let node_execution_chunking_context = Vc::upcast(
            NodeJsChunkingContext::builder(
                self.project_root_path().owned().await?,
                node_root.join("build")?,
                self.node_root_to_root_path().owned().await?,
                node_root.join("build")?,
                node_root.join("build/chunks")?,
                node_root.join("build/assets")?,
                node_build_environment().to_resolved().await?,
                next_mode.runtime_type(),
            )
            .source_maps(if *self.next_config().server_source_maps().await? {
                SourceMapsType::Full
            } else {
                SourceMapsType::None
            })
            .build(),
        );

        Ok(ExecutionContext::new(
            self.project_path().owned().await?,
            node_execution_chunking_context,
            self.env(),
        ))
    }

    #[turbo_tasks::function]
    pub(super) fn client_compile_time_info(&self) -> Vc<CompileTimeInfo> {
        get_client_compile_time_info(self.browserslist_query.clone(), self.define_env.client())
    }

    #[turbo_tasks::function]
    pub async fn get_all_endpoints(self: Vc<Self>, app_dir_only: bool) -> Result<Vc<Endpoints>> {
        let mut endpoints = Vec::new();

        let entrypoints = self.entrypoints().await?;
        let mut is_pages_entries_added = false;

        if let Some(middleware) = &entrypoints.middleware {
            endpoints.push(middleware.endpoint);
        }

        if let Some(instrumentation) = &entrypoints.instrumentation {
            endpoints.push(instrumentation.node_js);
            endpoints.push(instrumentation.edge);
        }

        for (_, route) in entrypoints.routes.iter() {
            match route {
                Route::Page {
                    html_endpoint,
                    data_endpoint,
                } => {
                    if !app_dir_only {
                        endpoints.push(*html_endpoint);
                        if !is_pages_entries_added {
                            endpoints.push(entrypoints.pages_error_endpoint);
                            endpoints.push(entrypoints.pages_app_endpoint);
                            endpoints.push(entrypoints.pages_document_endpoint);
                            is_pages_entries_added = true;
                        }
                        // This only exists in development mode for HMR
                        if let Some(data_endpoint) = data_endpoint {
                            endpoints.push(*data_endpoint);
                        }
                    }
                }
                Route::PageApi { endpoint } => {
                    if !app_dir_only {
                        endpoints.push(*endpoint);
                        if !is_pages_entries_added {
                            endpoints.push(entrypoints.pages_error_endpoint);
                            endpoints.push(entrypoints.pages_app_endpoint);
                            endpoints.push(entrypoints.pages_document_endpoint);
                            is_pages_entries_added = true;
                        }
                    }
                }
                Route::AppPage(page_routes) => {
                    for AppPageRoute {
                        original_name: _,
                        html_endpoint,
                        rsc_endpoint: _,
                    } in page_routes
                    {
                        endpoints.push(*html_endpoint);
                    }
                }
                Route::AppRoute {
                    original_name: _,
                    endpoint,
                } => {
                    endpoints.push(*endpoint);
                }
                Route::Conflict => {
                    tracing::info!("WARN: conflict");
                }
            }
        }

        Ok(Vc::cell(endpoints))
    }

    #[turbo_tasks::function]
    pub async fn get_all_entries(self: Vc<Self>) -> Result<Vc<GraphEntries>> {
        let mut modules = self
            .get_all_endpoints(false)
            .await?
            .iter()
            .map(async |endpoint| Ok(endpoint.entries().owned().await?))
            .try_flat_join()
            .await?;
        modules.extend(self.client_main_modules().await?.iter().cloned());
        Ok(Vc::cell(modules))
    }

    #[turbo_tasks::function]
    pub async fn get_all_additional_entries(
        self: Vc<Self>,
        graphs: Vc<ModuleGraph>,
    ) -> Result<Vc<GraphEntries>> {
        let modules = self
            .get_all_endpoints(false)
            .await?
            .iter()
            .map(async |endpoint| Ok(endpoint.additional_entries(graphs).owned().await?))
            .try_flat_join()
            .await?;
        Ok(Vc::cell(modules))
    }

    #[turbo_tasks::function]
    pub async fn module_graph(
        self: Vc<Self>,
        entry: ResolvedVc<Box<dyn Module>>,
    ) -> Result<Vc<ModuleGraph>> {
        Ok(if *self.per_page_module_graph().await? {
            ModuleGraph::from_entry_module(*entry, self.next_mode().await?.is_production())
        } else {
            *self.whole_app_module_graphs().await?.full
        })
    }

    #[turbo_tasks::function]
    pub async fn module_graph_for_modules(
        self: Vc<Self>,
        evaluatable_assets: Vc<EvaluatableAssets>,
    ) -> Result<Vc<ModuleGraph>> {
        Ok(if *self.per_page_module_graph().await? {
            let entries = evaluatable_assets
                .await?
                .iter()
                .copied()
                .map(ResolvedVc::upcast)
                .collect();
            ModuleGraph::from_modules(
                Vc::cell(vec![ChunkGroupEntry::Entry(entries)]),
                self.next_mode().await?.is_production(),
            )
        } else {
            *self.whole_app_module_graphs().await?.full
        })
    }

    #[turbo_tasks::function]
    pub async fn whole_app_module_graphs(self: ResolvedVc<Self>) -> Result<Vc<ModuleGraphs>> {
        async move {
            let module_graphs_op = whole_app_module_graph_operation(self);
            let module_graphs_vc = if self.next_mode().await?.is_production() {
                module_graphs_op.connect()
            } else {
                // In development mode, we need to to take and drop the issues, otherwise every
                // route will report all issues.
                let vc = module_graphs_op.resolve_strongly_consistent().await?;
                module_graphs_op.drop_issues();
                *vc
            };

            // At this point all modules have been computed and we can get rid of the node.js
            // process pools
            if *self.is_watch_enabled().await? {
                turbopack_node::evaluate::scale_down();
            } else {
                turbopack_node::evaluate::scale_zero();
            }

            Ok(module_graphs_vc)
        }
        .instrument(tracing::info_span!("module graph for app"))
        .await
    }

    #[turbo_tasks::function]
    pub(super) async fn server_compile_time_info(self: Vc<Self>) -> Result<Vc<CompileTimeInfo>> {
        let this = self.await?;
        Ok(get_server_compile_time_info(
            // `/ROOT` corresponds to `[project]/`, so we need exactly the `path` part.
            self.project_path(),
            this.define_env.nodejs(),
            self.current_node_js_version(),
        ))
    }

    #[turbo_tasks::function]
    pub(super) async fn edge_compile_time_info(self: Vc<Self>) -> Result<Vc<CompileTimeInfo>> {
        let this = self.await?;
        Ok(get_edge_compile_time_info(
            self.project_path().owned().await?,
            this.define_env.edge(),
            self.current_node_js_version(),
        ))
    }

    #[turbo_tasks::function]
    pub(super) fn edge_env(&self) -> Vc<EnvMap> {
        let edge_env = fxindexmap! {
            rcstr!("__NEXT_BUILD_ID") => self.build_id.clone(),
            rcstr!("NEXT_SERVER_ACTIONS_ENCRYPTION_KEY") => self.encryption_key.clone(),
            rcstr!("__NEXT_PREVIEW_MODE_ID") => self.preview_props.preview_mode_id.clone(),
            rcstr!("__NEXT_PREVIEW_MODE_ENCRYPTION_KEY") => self.preview_props.preview_mode_encryption_key.clone(),
            rcstr!("__NEXT_PREVIEW_MODE_SIGNING_KEY") => self.preview_props.preview_mode_signing_key.clone(),
        };
        Vc::cell(edge_env)
    }

    #[turbo_tasks::function]
    pub(super) async fn client_chunking_context(
        self: Vc<Self>,
    ) -> Result<Vc<Box<dyn ChunkingContext>>> {
        Ok(get_client_chunking_context(ClientChunkingContextOptions {
            mode: self.next_mode(),
            root_path: self.project_root_path().owned().await?,
            client_root: self.client_relative_path().owned().await?,
            client_root_to_root_path: rcstr!("/ROOT"),
            asset_prefix: self.next_config().computed_asset_prefix(),
            chunk_suffix_path: self.next_config().chunk_suffix_path(),
            environment: self.client_compile_time_info().environment(),
            module_id_strategy: self.module_ids(),
            export_usage: self.export_usage(),
            minify: self.next_config().turbo_minify(self.next_mode()),
            source_maps: self.next_config().client_source_maps(self.next_mode()),
            no_mangling: self.no_mangling(),
            scope_hoisting: self.next_config().turbo_scope_hoisting(self.next_mode()),
            debug_ids: self.next_config().turbopack_debug_ids(),
        }))
    }

    #[turbo_tasks::function]
    pub(super) async fn server_chunking_context(
        self: Vc<Self>,
        client_assets: bool,
    ) -> Result<Vc<NodeJsChunkingContext>> {
        let options = ServerChunkingContextOptions {
            mode: self.next_mode(),
            root_path: self.project_root_path().owned().await?,
            node_root: self.node_root().owned().await?,
            node_root_to_root_path: self.node_root_to_root_path().owned().await?,
            environment: self.server_compile_time_info().environment(),
            module_id_strategy: self.module_ids(),
            export_usage: self.export_usage(),
            turbo_minify: self.next_config().turbo_minify(self.next_mode()),
            turbo_source_maps: self.next_config().server_source_maps(),
            no_mangling: self.no_mangling(),
            scope_hoisting: self.next_config().turbo_scope_hoisting(self.next_mode()),
            debug_ids: self.next_config().turbopack_debug_ids(),
            client_root: self.client_relative_path().owned().await?,
            asset_prefix: self.next_config().computed_asset_prefix().owned().await?,
        };
        Ok(if client_assets {
            get_server_chunking_context_with_client_assets(options)
        } else {
            get_server_chunking_context(options)
        })
    }

    #[turbo_tasks::function]
    pub(super) async fn edge_chunking_context(
        self: Vc<Self>,
        client_assets: bool,
    ) -> Result<Vc<Box<dyn ChunkingContext>>> {
        let options = EdgeChunkingContextOptions {
            mode: self.next_mode(),
            root_path: self.project_root_path().owned().await?,
            node_root: self.node_root().owned().await?,
            output_root_to_root_path: self.node_root_to_root_path(),
            environment: self.edge_compile_time_info().environment(),
            module_id_strategy: self.module_ids(),
            export_usage: self.export_usage(),
            turbo_minify: self.next_config().turbo_minify(self.next_mode()),
            turbo_source_maps: self.next_config().server_source_maps(),
            no_mangling: self.no_mangling(),
            scope_hoisting: self.next_config().turbo_scope_hoisting(self.next_mode()),
            client_root: self.client_relative_path().owned().await?,
            asset_prefix: self.next_config().computed_asset_prefix().owned().await?,
        };
        Ok(if client_assets {
            get_edge_chunking_context_with_client_assets(options)
        } else {
            get_edge_chunking_context(options)
        })
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
                .resolved_cell()
                .emit();
        };

        // First, emit an event for the binary target triple.
        // This is different to webpack-config; when this is being called,
        // it is always using SWC so we don't check swc here.
        emit_event(env!("VERGEN_CARGO_TARGET_TRIPLE"), true);

        // Go over config and report enabled features.
        // [TODO]: useSwcLoader is not being reported as it is not directly corresponds (it checks babel config existence)
        // need to confirm what we'll do with turbopack.
        let config = self.next_config();

        emit_event(
            "skipProxyUrlNormalize",
            *config.skip_proxy_url_normalize().await?,
        );

        emit_event(
            "skipTrailingSlashRedirect",
            *config.skip_trailing_slash_redirect().await?,
        );
        emit_event(
            "persistentCaching",
            *config.persistent_caching_enabled().await?,
        );

        emit_event(
            "modularizeImports",
            !config.modularize_imports().await?.is_empty(),
        );
        emit_event(
            "transpilePackages",
            !config.transpile_packages().await?.is_empty(),
        );
        emit_event("turbotrace", false);

        // compiler options
        let compiler_options = config.compiler().await?;
        let swc_relay_enabled = compiler_options.relay.is_some();
        let styled_components_enabled = compiler_options
            .styled_components
            .as_ref()
            .map(|sc| sc.is_enabled())
            .unwrap_or_default();
        let react_remove_properties_enabled = compiler_options
            .react_remove_properties
            .as_ref()
            .map(|rc| rc.is_enabled())
            .unwrap_or_default();
        let remove_console_enabled = compiler_options
            .remove_console
            .as_ref()
            .map(|rc| rc.is_enabled())
            .unwrap_or_default();
        let emotion_enabled = compiler_options
            .emotion
            .as_ref()
            .map(|e| e.is_enabled())
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
                        path: self.project_path().owned().await?,
                        title: StyledString::Text(
                            format!("App Router and Pages Router both match path: {pathname}")
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
                        severity: IssueSeverity::Error,
                    }
                    .resolved_cell()
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
        let middleware = if let FindContextFileResult::Found(fs_path, _) = &*middleware.await? {
            let is_proxy = fs_path.file_stem() == Some("proxy");
            Some(Middleware {
                endpoint: self.middleware_endpoint().to_resolved().await?,
                is_proxy,
            })
        } else {
            None
        };

        let instrumentation = self.find_instrumentation();
        let instrumentation = if let FindContextFileResult::Found(..) = *instrumentation.await? {
            Some(Instrumentation {
                node_js: self.instrumentation_endpoint(false).to_resolved().await?,
                edge: self.instrumentation_endpoint(true).to_resolved().await?,
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
    async fn edge_middleware_context(self: Vc<Self>) -> Result<Vc<Box<dyn AssetContext>>> {
        let mut transitions = vec![];

        let app_dir = find_app_dir(self.project_path().owned().await?)
            .owned()
            .await?;
        let app_project = *self.app_project().await?;

        let ecmascript_client_reference_transition_name =
            app_project.map(|_| AppProject::client_transition_name());

        if let Some(app_project) = app_project {
            transitions.push((
                AppProject::client_transition_name(),
                app_project
                    .edge_ecmascript_client_reference_transition()
                    .to_resolved()
                    .await?,
            ));
        }

        Ok(Vc::upcast(ModuleAssetContext::new(
            TransitionOptions {
                named_transitions: transitions.clone().into_iter().collect(),
                ..Default::default()
            }
            .cell(),
            self.edge_compile_time_info(),
            get_server_module_options_context(
                self.project_path().owned().await?,
                self.execution_context(),
                ServerContextType::Middleware {
                    app_dir: app_dir.clone(),
                    ecmascript_client_reference_transition_name:
                        ecmascript_client_reference_transition_name.clone(),
                },
                self.next_mode(),
                self.next_config(),
                NextRuntime::Edge,
                self.encryption_key(),
                self.edge_compile_time_info().environment(),
                self.client_compile_time_info().environment(),
            ),
            get_edge_resolve_options_context(
                self.project_path().owned().await?,
                ServerContextType::Middleware {
                    app_dir: app_dir.clone(),
                    ecmascript_client_reference_transition_name:
                        ecmascript_client_reference_transition_name.clone(),
                },
                self.next_mode(),
                self.next_config(),
                self.execution_context(),
                None, // root params can't be used in middleware
            ),
            Layer::new_with_user_friendly_name(
                rcstr!("middleware-edge"),
                rcstr!("Edge Middleware"),
            ),
        )))
    }

    #[turbo_tasks::function]
    async fn node_middleware_context(self: Vc<Self>) -> Result<Vc<Box<dyn AssetContext>>> {
        let mut transitions = vec![];

        let app_dir = find_app_dir(self.project_path().owned().await?)
            .owned()
            .await?;
        let app_project = *self.app_project().await?;

        let ecmascript_client_reference_transition_name =
            app_project.map(|_| AppProject::client_transition_name());

        if let Some(app_project) = app_project {
            transitions.push((
                AppProject::client_transition_name(),
                app_project
                    .edge_ecmascript_client_reference_transition()
                    .to_resolved()
                    .await?,
            ));
        }

        Ok(Vc::upcast(ModuleAssetContext::new(
            TransitionOptions {
                named_transitions: transitions.clone().into_iter().collect(),
                ..Default::default()
            }
            .cell(),
            self.server_compile_time_info(),
            get_server_module_options_context(
                self.project_path().owned().await?,
                self.execution_context(),
                ServerContextType::Middleware {
                    app_dir: app_dir.clone(),
                    ecmascript_client_reference_transition_name:
                        ecmascript_client_reference_transition_name.clone(),
                },
                self.next_mode(),
                self.next_config(),
                NextRuntime::NodeJs,
                self.encryption_key(),
                self.server_compile_time_info().environment(),
                self.client_compile_time_info().environment(),
            ),
            get_server_resolve_options_context(
                self.project_path().owned().await?,
                ServerContextType::Middleware {
                    app_dir: app_dir.clone(),
                    ecmascript_client_reference_transition_name,
                },
                self.next_mode(),
                self.next_config(),
                self.execution_context(),
                None, // root params can't be used in middleware
            ),
            Layer::new_with_user_friendly_name(rcstr!("middleware"), rcstr!("Middleware")),
        )))
    }

    #[turbo_tasks::function]
    async fn middleware_context(self: Vc<Self>) -> Result<Vc<Box<dyn AssetContext>>> {
        let edge_module_context = self.edge_middleware_context();

        let middleware = self.find_middleware();
        let FindContextFileResult::Found(fs_path, _) = &*middleware.await? else {
            return Ok(edge_module_context);
        };
        let source = Vc::upcast(FileSource::new(fs_path.clone()));

        let runtime = parse_segment_config_from_source(source, ParseSegmentMode::Base)
            .await?
            .runtime
            .unwrap_or(NextRuntime::Edge);

        if matches!(runtime, NextRuntime::NodeJs) {
            Ok(self.node_middleware_context())
        } else {
            Ok(edge_module_context)
        }
    }

    #[turbo_tasks::function]
    async fn find_middleware(self: Vc<Self>) -> Result<Vc<FindContextFileResult>> {
        Ok(find_context_file(
            self.project_path().owned().await?,
            middleware_files(self.next_config().page_extensions()),
            // our callers do not care about affecting sources
            false,
        ))
    }

    #[turbo_tasks::function]
    async fn middleware_endpoint(self: Vc<Self>) -> Result<Vc<Box<dyn Endpoint>>> {
        let middleware = self.find_middleware();
        let FindContextFileResult::Found(fs_path, _) = &*middleware.await? else {
            return Ok(Vc::upcast(EmptyEndpoint::new()));
        };
        let source = Vc::upcast(FileSource::new(fs_path.clone()));
        let app_dir = find_app_dir(self.project_path().owned().await?)
            .owned()
            .await?;
        let ecmascript_client_reference_transition_name = (*self.app_project().await?)
            .as_ref()
            .map(|_| AppProject::client_transition_name());

        let middleware_asset_context = self.middleware_context();

        Ok(Vc::upcast(MiddlewareEndpoint::new(
            self,
            middleware_asset_context,
            source,
            app_dir.clone(),
            ecmascript_client_reference_transition_name,
        )))
    }

    #[turbo_tasks::function]
    async fn node_instrumentation_context(self: Vc<Self>) -> Result<Vc<Box<dyn AssetContext>>> {
        let mut transitions = vec![];

        let app_dir = find_app_dir(self.project_path().owned().await?)
            .owned()
            .await?;
        let app_project = &*self.app_project().await?;

        let ecmascript_client_reference_transition_name = app_project
            .as_ref()
            .map(|_| AppProject::client_transition_name());

        if let Some(app_project) = app_project {
            transitions.push((
                AppProject::client_transition_name(),
                app_project
                    .ecmascript_client_reference_transition()
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
                self.project_path().owned().await?,
                self.execution_context(),
                ServerContextType::Instrumentation {
                    app_dir: app_dir.clone(),
                    ecmascript_client_reference_transition_name:
                        ecmascript_client_reference_transition_name.clone(),
                },
                self.next_mode(),
                self.next_config(),
                NextRuntime::NodeJs,
                self.encryption_key(),
                self.server_compile_time_info().environment(),
                self.client_compile_time_info().environment(),
            ),
            get_server_resolve_options_context(
                self.project_path().owned().await?,
                ServerContextType::Instrumentation {
                    app_dir: app_dir.clone(),
                    ecmascript_client_reference_transition_name,
                },
                self.next_mode(),
                self.next_config(),
                self.execution_context(),
                None, // root params can't be used in instrumentation
            ),
            Layer::new_with_user_friendly_name(
                rcstr!("instrumentation"),
                rcstr!("Instrumentation"),
            ),
        )))
    }

    #[turbo_tasks::function]
    async fn edge_instrumentation_context(self: Vc<Self>) -> Result<Vc<Box<dyn AssetContext>>> {
        let mut transitions = vec![];

        let app_dir = find_app_dir(self.project_path().owned().await?)
            .owned()
            .await?;
        let app_project = &*self.app_project().await?;

        let ecmascript_client_reference_transition_name = app_project
            .as_ref()
            .map(|_| AppProject::client_transition_name());

        if let Some(app_project) = app_project {
            transitions.push((
                AppProject::client_transition_name(),
                app_project
                    .edge_ecmascript_client_reference_transition()
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
                self.project_path().owned().await?,
                self.execution_context(),
                ServerContextType::Instrumentation {
                    app_dir: app_dir.clone(),
                    ecmascript_client_reference_transition_name:
                        ecmascript_client_reference_transition_name.clone(),
                },
                self.next_mode(),
                self.next_config(),
                NextRuntime::Edge,
                self.encryption_key(),
                self.edge_compile_time_info().environment(),
                self.client_compile_time_info().environment(),
            ),
            get_edge_resolve_options_context(
                self.project_path().owned().await?,
                ServerContextType::Instrumentation {
                    app_dir: app_dir.clone(),
                    ecmascript_client_reference_transition_name,
                },
                self.next_mode(),
                self.next_config(),
                self.execution_context(),
                None, // root params can't be used in instrumentation
            ),
            Layer::new_with_user_friendly_name(
                rcstr!("instrumentation-edge"),
                rcstr!("Edge Instrumentation"),
            ),
        )))
    }

    #[turbo_tasks::function]
    async fn find_instrumentation(self: Vc<Self>) -> Result<Vc<FindContextFileResult>> {
        Ok(find_context_file(
            self.project_path().owned().await?,
            instrumentation_files(self.next_config().page_extensions()),
            // our callers do not care about affecting sources
            false,
        ))
    }

    #[turbo_tasks::function]
    async fn instrumentation_endpoint(
        self: Vc<Self>,
        is_edge: bool,
    ) -> Result<Vc<Box<dyn Endpoint>>> {
        let instrumentation = self.find_instrumentation();
        let FindContextFileResult::Found(fs_path, _) = &*instrumentation.await? else {
            return Ok(Vc::upcast(EmptyEndpoint::new()));
        };
        let source = Vc::upcast(FileSource::new(fs_path.clone()));
        let app_dir = find_app_dir(self.project_path().owned().await?)
            .owned()
            .await?;
        let ecmascript_client_reference_transition_name = (*self.app_project().await?)
            .as_ref()
            .map(|_| AppProject::client_transition_name());

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
            app_dir.clone(),
            ecmascript_client_reference_transition_name,
        )))
    }

    #[turbo_tasks::function]
    pub async fn emit_all_output_assets(
        self: Vc<Self>,
        output_assets: OperationVc<OutputAssets>,
    ) -> Result<()> {
        let span = tracing::info_span!("emitting");
        async move {
            let all_output_assets = all_assets_from_entries_operation(output_assets);

            let client_relative_path = self.client_relative_path().owned().await?;
            let node_root = self.node_root().owned().await?;

            if let Some(map) = self.await?.versioned_content_map {
                map.insert_output_assets(
                    all_output_assets,
                    node_root.clone(),
                    client_relative_path.clone(),
                    node_root.clone(),
                )
                .as_side_effect()
                .await?;

                Ok(())
            } else {
                emit_assets(
                    all_output_assets.connect(),
                    node_root.clone(),
                    client_relative_path.clone(),
                    node_root.clone(),
                )
                .as_side_effect()
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
            let content = map.get(self.client_relative_path().await?.join(&identifier)?);
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
                .into_trait_ref()
                .strongly_consistent()
                .untracked()
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
            Ok(map.keys_in_path(self.client_relative_path().owned().await?))
        } else {
            bail!("must be in dev mode to hmr")
        }
    }

    /// Completion when server side changes are detected in output assets
    /// referenced from the roots
    #[turbo_tasks::function]
    pub async fn server_changed(self: Vc<Self>, roots: Vc<OutputAssets>) -> Result<Vc<Completion>> {
        let path = self.node_root().owned().await?;
        Ok(any_output_changed(roots, path, true))
    }

    /// Completion when client side changes are detected in output assets
    /// referenced from the roots
    #[turbo_tasks::function]
    pub async fn client_changed(self: Vc<Self>, roots: Vc<OutputAssets>) -> Result<Vc<Completion>> {
        let path = self.client_root().owned().await?;
        Ok(any_output_changed(roots, path, false))
    }

    #[turbo_tasks::function]
    pub async fn client_main_modules(self: Vc<Self>) -> Result<Vc<GraphEntries>> {
        let pages_project = self.pages_project();
        let mut modules = vec![ChunkGroupEntry::Entry(vec![
            pages_project.client_main_module().to_resolved().await?,
        ])];

        if let Some(app_project) = *self.app_project().await? {
            modules.push(ChunkGroupEntry::Entry(vec![
                app_project.client_main_module().to_resolved().await?,
            ]));
        }

        Ok(Vc::cell(modules))
    }

    /// Gets the module id strategy for the project.
    #[turbo_tasks::function]
    pub async fn module_ids(self: Vc<Self>) -> Result<Vc<Box<dyn ModuleIdStrategy>>> {
        let module_id_strategy = *self.next_config().module_ids(self.next_mode()).await?;
        match module_id_strategy {
            ModuleIdStrategyConfig::Named => Ok(Vc::upcast(DevModuleIdStrategy::new())),
            ModuleIdStrategyConfig::Deterministic => {
                let module_graphs = self.whole_app_module_graphs().await?;
                Ok(Vc::upcast(get_global_module_id_strategy(
                    *module_graphs.full,
                )))
            }
        }
    }

    /// Compute the used exports for each module.
    #[turbo_tasks::function]
    pub async fn export_usage(self: Vc<Self>) -> Result<Vc<OptionExportUsageInfo>> {
        if *self
            .next_config()
            .turbopack_remove_unused_exports(self.next_mode())
            .await?
        {
            let module_graphs = self.whole_app_module_graphs().await?;
            Ok(Vc::cell(Some(
                compute_export_usage_info(module_graphs.full)
                    // As a performance optimization, we resolve strongly consistently
                    .resolve_strongly_consistent()
                    .await?,
            )))
        } else {
            Ok(Vc::cell(None))
        }
    }
}

// This is a performance optimization. This function is a root aggregation function that
// aggregates over the whole subgraph.
#[turbo_tasks::function(operation)]
async fn whole_app_module_graph_operation(
    project: ResolvedVc<Project>,
) -> Result<Vc<ModuleGraphs>> {
    mark_root();

    let should_trace = project.next_mode().await?.is_production();
    let base_single_module_graph =
        SingleModuleGraph::new_with_entries(project.get_all_entries(), should_trace);
    let base_visited_modules = VisitedModules::from_graph(base_single_module_graph);

    let base = ModuleGraph::from_single_graph(base_single_module_graph);
    let additional_entries = project.get_all_additional_entries(base);

    let additional_module_graph = SingleModuleGraph::new_with_entries_visited(
        additional_entries,
        base_visited_modules,
        should_trace,
    );

    let full = ModuleGraph::from_graphs(vec![base_single_module_graph, additional_module_graph]);
    Ok(ModuleGraphs {
        base: base.to_resolved().await?,
        full: full.to_resolved().await?,
    }
    .cell())
}

#[turbo_tasks::value(shared)]
pub struct ModuleGraphs {
    pub base: ResolvedVc<ModuleGraph>,
    pub full: ResolvedVc<ModuleGraph>,
}

#[turbo_tasks::function]
async fn any_output_changed(
    roots: Vc<OutputAssets>,
    path: FileSystemPath,
    server: bool,
) -> Result<Vc<Completion>> {
    let completions = AdjacencyMap::new()
        .skip_duplicates()
        .visit(roots.await?.iter().copied(), get_referenced_output_assets)
        .await
        .completed()?
        .into_inner()
        .into_postorder_topological()
        .map(|m| {
            let path = path.clone();

            async move {
                let asset_path = m.path().await?;
                if !asset_path.path.ends_with(".map")
                    && (!server || !asset_path.path.ends_with(".css"))
                    && asset_path.is_inside_ref(&path)
                {
                    anyhow::Ok(Some(
                        content_changed(*ResolvedVc::upcast(m))
                            .to_resolved()
                            .await?,
                    ))
                } else {
                    Ok(None)
                }
            }
        })
        .try_flat_join()
        .await?;

    Ok(Vc::<Completions>::cell(completions).completed())
}

async fn get_referenced_output_assets(
    parent: ResolvedVc<Box<dyn OutputAsset>>,
) -> Result<impl Iterator<Item = ResolvedVc<Box<dyn OutputAsset>>> + Send> {
    Ok(parent.references().owned().await?.into_iter())
}

#[turbo_tasks::function(operation)]
fn all_assets_from_entries_operation(
    operation: OperationVc<OutputAssets>,
) -> Result<Vc<OutputAssets>> {
    let assets = operation.connect();
    Ok(all_assets_from_entries(assets))
}

#[turbo_tasks::function]
fn stable_endpoint(endpoint: Vc<Box<dyn Endpoint>>) -> Vc<Box<dyn Endpoint>> {
    endpoint
}
