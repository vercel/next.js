use std::time::Duration;

use anyhow::{Context, Result, bail};
use async_trait::async_trait;
use bincode::{Decode, Encode};
use indexmap::map::Entry;
use next_core::{
    app_structure::find_app_dir,
    emit_assets, get_edge_chunking_context, get_edge_chunking_context_with_client_assets,
    get_edge_compile_time_info, get_edge_resolve_options_context,
    instrumentation::instrumentation_files,
    middleware::middleware_files,
    mode::NextMode,
    next_app::{AppPage, AppPath},
    next_client::{
        ClientChunkingContextOptions, get_client_chunking_context, get_client_compile_time_info,
    },
    next_config::{
        DIST_PROFILES_DIR_NAME, ModuleIds as ModuleIdStrategyConfig, NextConfig, OutputType,
        TurbopackPluginRuntimeStrategy,
    },
    next_edge::context::EdgeChunkingContextOptions,
    next_server::{
        ServerChunkingContextOptions, ServerContextType, get_server_chunking_context,
        get_server_chunking_context_with_client_assets, get_server_compile_time_info,
        get_server_module_options_context, get_server_resolve_options_context,
        get_tracing_compile_time_info,
    },
    next_telemetry::ProjectFeatureUsageSummary,
    parse_segment_config_from_source,
    segment_config::ParseSegmentMode,
    util::{NextRuntime, OptionEnvMap},
};
use rustc_hash::{FxHashMap, FxHashSet};
use serde::{Deserialize, Serialize};
use tracing::{Instrument, field::Empty};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    Completion, Completions, FxIndexMap, NonLocalValue, OperationValue, OperationVc, ReadRef,
    ResolvedVc, State, TransientInstance, TryFlatJoinIterExt, TryJoinIterExt, Vc,
    debug::ValueDebugFormat, fxindexmap, trace::TraceRawVcs,
};
use turbo_tasks_env::{EnvMap, ProcessEnv};
use turbo_tasks_fs::{
    DiskFileSystem, FileContent, FileSystem, FileSystemPath, VirtualFileSystem, invalidation,
};
use turbo_unix_path::{join_path, unix_to_sys};
use turbopack::{
    ModuleAssetContext, evaluate_context::node_build_environment, externals_tracing_module_context,
    global_module_ids::get_global_module_id_strategy, transition::TransitionOptions,
};
use turbopack_core::{
    PROJECT_FILESYSTEM_NAME,
    changed::content_changed,
    chunk::{
        ChunkingContext, EvaluatableAssets, UnusedReferences,
        chunk_id_strategy::{ModuleIdFallback, ModuleIdStrategy},
    },
    compile_time_info::CompileTimeInfo,
    context::AssetContext,
    environment::NodeJsVersion,
    file_source::FileSource,
    ident::Layer,
    issue::{
        CollectibleIssuesExt, Issue, IssueExt, IssueFilter, IssueSeverity, IssueStage, StyledString,
    },
    module::{Module, Modules},
    module_graph::{
        GraphEntries, ModuleGraph, SingleModuleGraph, VisitedModules,
        binding_usage_info::{
            BindingUsageInfo, OptionBindingUsageInfo, compute_binding_usage_info,
        },
        chunk_group_info::ChunkGroupEntry,
    },
    output::{
        ExpandOutputAssetsInput, ExpandedOutputAssets, OutputAsset, OutputAssets,
        expand_output_assets,
    },
    reference::all_assets_from_entries,
    reference_type::{CommonJsReferenceSubType, ReferenceType},
    resolve::{FindContextFileResult, find_context_file},
    version::{
        NotFoundVersion, OptionVersionedContent, Update, Version, VersionState, VersionedContent,
    },
};
#[cfg(feature = "process_pool")]
use turbopack_node::child_process_backend;
use turbopack_node::execution_context::ExecutionContext;
#[cfg(feature = "worker_pool")]
use turbopack_node::worker_threads_backend;
use turbopack_nodejs::NodeJsChunkingContext;

use crate::{
    app::{AppProject, OptionAppProject},
    empty::EmptyEndpoint,
    entrypoints::Entrypoints,
    instrumentation::InstrumentationEndpoint,
    middleware::MiddlewareEndpoint,
    pages::PagesProject,
    route::{
        Endpoint, EndpointGroup, EndpointGroupEntry, EndpointGroupKey, EndpointGroups, Endpoints,
        Route,
    },
    versioned_content_map::VersionedContentMap,
};

#[turbo_tasks::task_input]
#[derive(
    Debug,
    Serialize,
    Deserialize,
    Clone,
    PartialEq,
    Eq,
    Hash,
    TraceRawVcs,
    OperationValue,
    Encode,
    Decode,
)]
#[serde(rename_all = "camelCase")]
pub struct DraftModeOptions {
    pub preview_mode_id: RcStr,
    pub preview_mode_encryption_key: RcStr,
    pub preview_mode_signing_key: RcStr,
}

#[turbo_tasks::task_input]
#[derive(
    Debug,
    Default,
    Serialize,
    Deserialize,
    Copy,
    Clone,
    PartialEq,
    Eq,
    Hash,
    TraceRawVcs,
    OperationValue,
    Encode,
    Decode,
)]
#[serde(rename_all = "camelCase")]
pub struct WatchOptions {
    /// Whether to watch the filesystem for file changes.
    pub enable: bool,

    /// Enable polling at a certain interval if the native file watching doesn't work (e.g.
    /// docker).
    pub poll_interval: Option<Duration>,
}

#[turbo_tasks::task_input]
#[derive(
    Debug,
    Default,
    Serialize,
    Deserialize,
    Clone,
    PartialEq,
    Eq,
    Hash,
    TraceRawVcs,
    OperationValue,
    Encode,
    Decode,
)]
#[serde(rename_all = "camelCase")]
pub struct DebugBuildPaths {
    pub app: Vec<RcStr>,
    pub pages: Vec<RcStr>,
}

/// Target for HMR operations - client-side (browser) or server-side (Node.js).
#[turbo_tasks::task_input]
#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Hash, TraceRawVcs, Encode, Decode)]
pub enum HmrTarget {
    #[default]
    Client,
    Server,
}

impl std::fmt::Display for HmrTarget {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            HmrTarget::Client => write!(f, "client"),
            HmrTarget::Server => write!(f, "server"),
        }
    }
}

impl std::str::FromStr for HmrTarget {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "client" => Ok(HmrTarget::Client),
            "server" => Ok(HmrTarget::Server),
            _ => Err(format!(
                "Invalid HMR target: '{}'. Expected 'client' or 'server'",
                s
            )),
        }
    }
}

/// Pre-converted route keys from debug build paths for O(1) lookups.
struct DebugBuildPathsRouteKeys {
    app: FxHashSet<RcStr>,
    pages: FxHashSet<RcStr>,
}

impl DebugBuildPathsRouteKeys {
    fn app_route_key_from_debug_path(path: &str) -> Result<RcStr> {
        let mut segments = path
            .trim_start_matches('/')
            .split('/')
            .filter(|segment| !segment.is_empty())
            .collect::<Vec<_>>();

        if let Some(last_segment) = segments.last()
            && (*last_segment == "page"
                || last_segment.starts_with("page.")
                || *last_segment == "route"
                || last_segment.starts_with("route."))
        {
            segments.pop();
        }

        let normalized_path = segments.join("/");
        Ok(AppPath::from(AppPage::parse(&normalized_path)?)
            .to_string()
            .into())
    }

    fn pages_route_key_from_debug_path(path: &RcStr) -> Result<RcStr> {
        // Strip extension: "/foo.tsx" -> "/foo"
        // Catch-all routes like "/foo/[...slug]" contain dots in the segment name;
        // only treat the suffix as an extension when it is a plain alphanumeric token.
        let file_name = path.rsplit('/').next().unwrap_or(path);
        let result = if let Some(dot_idx) = file_name.rfind('.') {
            let ext = &file_name[dot_idx + 1..];
            if !ext.is_empty() && ext.chars().all(|c| c.is_ascii_alphanumeric()) {
                let trimmed_len = path.len() - (file_name.len() - dot_idx);
                path[..trimmed_len].into()
            } else {
                path.clone()
            }
        } else {
            path.clone()
        };

        // Strip index suffix: "/foo/index.tsx" -> "/foo"
        Ok(if let Some(stripped) = result.strip_suffix("/index") {
            if stripped.is_empty() {
                "/".into()
            } else {
                stripped.into()
            }
        } else {
            result
        })
    }

    fn from_debug_build_paths(paths: &DebugBuildPaths) -> Result<Self> {
        Ok(Self {
            app: paths
                .app
                .iter()
                .map(|path| Self::app_route_key_from_debug_path(path))
                .collect::<Result<_>>()?,
            pages: paths
                .pages
                .iter()
                .map(Self::pages_route_key_from_debug_path)
                .collect::<Result<_>>()?,
        })
    }

    fn should_include_app_route(&self, route_key: &RcStr) -> bool {
        // Special app router framework routes
        if matches!(route_key.as_str(), "/_not-found" | "/_global-error") {
            return true;
        }
        self.app.contains(route_key)
    }

    fn should_include_pages_route(&self, route_key: &RcStr) -> bool {
        // Special pages router framework routes
        if matches!(route_key.as_str(), "/_error" | "/_document" | "/_app") {
            return true;
        }
        self.pages.contains(route_key)
    }
}

#[derive(
    Debug,
    Serialize,
    Deserialize,
    Clone,
    PartialEq,
    Eq,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
    Encode,
    Decode,
)]
#[serde(rename_all = "camelCase")]
pub struct ProjectOptions {
    /// An absolute root path (Unix or Windows path) from which all files must be nested under.
    /// Trying to access a file outside this root will fail, so think of this as a chroot.
    /// E.g. `/home/user/projects/my-repo`.
    pub root_path: RcStr,

    /// A path which contains the app/pages directories, relative to [`Project::project_path`],
    /// always Unix path. E.g. `apps/my-app`
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

    /// Whether to write the route hashes manifest.
    pub write_routes_hashes_manifest: bool,

    /// The version of Node.js that is available/currently running.
    pub current_node_js_version: RcStr,

    /// Debug build paths for selective builds.
    /// When set, only routes matching these paths will be included in the build.
    pub debug_build_paths: Option<DebugBuildPaths>,

    /// App-router page routes that should be built after non-deferred routes.
    pub deferred_entries: Option<Vec<RcStr>>,

    /// Whether to enable persistent caching
    pub is_persistent_caching_enabled: bool,

    /// The version of Next.js that is running.
    pub next_version: RcStr,

    /// Whether server-side HMR is enabled (disabled with --no-server-fast-refresh).
    pub server_hmr: bool,
}

#[derive(Default)]
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

    /// The browserslist query to use for targeting browsers.
    pub browserslist_query: Option<RcStr>,

    /// When the code is minified, this opts out of the default mangling of
    /// local names for variables, functions etc., which can be useful for
    /// debugging/profiling purposes.
    pub no_mangling: Option<bool>,

    /// Whether to write the route hashes manifest.
    pub write_routes_hashes_manifest: Option<bool>,

    /// Debug build paths for selective builds.
    /// When set, only routes matching these paths will be included in the build.
    pub debug_build_paths: Option<DebugBuildPaths>,
}

#[turbo_tasks::task_input]
#[derive(
    Debug,
    Serialize,
    Deserialize,
    Clone,
    PartialEq,
    Eq,
    Hash,
    TraceRawVcs,
    OperationValue,
    Encode,
    Decode,
)]
#[serde(rename_all = "camelCase")]
pub struct DefineEnv {
    pub client: Vec<(RcStr, Option<RcStr>)>,
    pub edge: Vec<(RcStr, Option<RcStr>)>,
    pub nodejs: Vec<(RcStr, Option<RcStr>)>,
}

#[derive(TraceRawVcs, PartialEq, Eq, ValueDebugFormat, NonLocalValue, Encode, Decode)]
pub struct Middleware {
    pub endpoint: ResolvedVc<Box<dyn Endpoint>>,
    pub is_proxy: bool,
}

#[derive(TraceRawVcs, PartialEq, Eq, ValueDebugFormat, NonLocalValue, Encode, Decode)]
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
    #[turbo_tasks::function(operation, root)]
    pub fn new_operation(name: RcStr, dev: bool) -> Result<Vc<Self>> {
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

#[turbo_tasks::function(operation, root)]
fn project_operation(project: ResolvedVc<ProjectContainer>) -> Vc<Project> {
    project.project()
}

#[turbo_tasks::function(operation, root)]
fn project_fs_operation(project: ResolvedVc<Project>) -> Vc<DiskFileSystem> {
    project.project_fs()
}

#[turbo_tasks::function(operation, root)]
fn output_fs_operation(project: ResolvedVc<Project>) -> Vc<DiskFileSystem> {
    project.project_fs()
}

enum EnvDiffType {
    Added,
    Removed,
    Modified,
}

fn env_diff(
    old: &[(RcStr, Option<RcStr>)],
    new: &[(RcStr, Option<RcStr>)],
) -> Vec<(RcStr, EnvDiffType)> {
    let mut diffs = Vec::new();
    let mut old_map: FxHashMap<_, _> = old.iter().cloned().collect();

    for (key, new_value) in new.iter() {
        match old_map.remove(key) {
            Some(old_value) => {
                if &old_value != new_value {
                    diffs.push((key.clone(), EnvDiffType::Modified));
                }
            }
            None => {
                diffs.push((key.clone(), EnvDiffType::Added));
            }
        }
    }

    for (key, _) in old.iter() {
        if old_map.contains_key(key) {
            diffs.push((key.clone(), EnvDiffType::Removed));
        }
    }

    diffs
}

fn env_diff_report(old: &[(RcStr, Option<RcStr>)], new: &[(RcStr, Option<RcStr>)]) -> String {
    use std::fmt::Write;

    let diff = env_diff(old, new);

    let mut report = String::new();
    for (key, diff_type) in diff {
        let symbol = match diff_type {
            EnvDiffType::Added => "+",
            EnvDiffType::Removed => "-",
            EnvDiffType::Modified => "*",
        };
        if !report.is_empty() {
            report.push_str(", ");
        }
        write!(report, "{}{}", symbol, key).unwrap();
    }
    report
}

fn define_env_diff_report(old: &DefineEnv, new: &DefineEnv) -> String {
    use std::fmt::Write;

    let mut report = String::new();
    for (name, old, new) in [
        ("client", &old.client, &new.client),
        ("edge", &old.edge, &new.edge),
        ("nodejs", &old.nodejs, &new.nodejs),
    ] {
        let diff = env_diff_report(old, new);
        if !diff.is_empty() {
            if !report.is_empty() {
                report.push_str(", ");
            }
            write!(report, "{name}: {{ {diff} }}").unwrap();
        }
    }
    report
}

impl ProjectContainer {
    /// Set up filesystems, watchers, and construct the [`Project`] instance inside the container.
    ///
    /// This function is intended to be called inside of [`turbo_tasks::TurboTasks::run`], but not
    /// part of a [`turbo_tasks::function`]. We don't want it to be possibly re-executed.
    ///
    /// This is an associated function instead of a method because we don't currently implement
    /// [`std::ops::Receiver`] on [`OperationVc`].
    pub async fn initialize(this_op: OperationVc<Self>, options: ProjectOptions) -> Result<()> {
        let this = this_op.read_strongly_consistent().await?;
        let span = tracing::info_span!(
            "initialize project",
            project_name = %this.name,
            version = options.next_version.as_str(),
            node_version = options.current_node_js_version.as_str(),
            os = std::env::consts::OS,
            arch = std::env::consts::ARCH,
            turbo_tasks_available_parallelism =
                turbo_tasks::parallel::available_parallelism().map(|n| n.get()).unwrap_or(0),
            std_thread_available_parallelism =
                std::thread::available_parallelism().map(|n| n.get()).unwrap_or(0),
            dev = options.dev,
            env_diff = Empty
        );
        let span_clone = span.clone();
        async move {
            let watch = options.watch;

            if let Some(old_options) = &*this.options_state.get_untracked() {
                span.record(
                    "env_diff",
                    define_env_diff_report(&old_options.define_env, &options.define_env).as_str(),
                );
            }
            this.options_state.set(Some(options));

            #[turbo_tasks::function(operation, root)]
            fn project_from_container_operation(
                container: OperationVc<ProjectContainer>,
            ) -> Vc<Project> {
                container.connect().project()
            }
            let project = project_from_container_operation(this_op)
                .resolve()
                .strongly_consistent()
                .await?;
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
        .instrument(span_clone)
        .await
    }

    pub async fn update(self: ResolvedVc<Self>, options: PartialProjectOptions) -> Result<()> {
        let span = tracing::info_span!(
            "update project options",
            project_name = %self.await?.name,
            env_diff = Empty
        );
        let span_clone = span.clone();
        async move {
            // HACK: `update` is called from a top-level function. Top-level functions are not
            // allowed to perform eventually consistent reads. Create a stub operation
            // to upgrade the `ResolvedVc` to an `OperationVc`. This is mostly okay
            // because we can assume the `ProjectContainer` was originally resolved with
            // strong consistency, and is rarely updated.
            #[turbo_tasks::function(operation, root)]
            fn project_container_operation_hack(
                container: ResolvedVc<ProjectContainer>,
            ) -> Vc<ProjectContainer> {
                *container
            }
            let this = project_container_operation_hack(self)
                .read_strongly_consistent()
                .await?;
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
                browserslist_query,
                no_mangling,
                write_routes_hashes_manifest,
                debug_build_paths,
            } = options;

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
            if let Some(browserslist_query) = browserslist_query {
                new_options.browserslist_query = browserslist_query;
            }
            if let Some(no_mangling) = no_mangling {
                new_options.no_mangling = no_mangling;
            }
            if let Some(write_routes_hashes_manifest) = write_routes_hashes_manifest {
                new_options.write_routes_hashes_manifest = write_routes_hashes_manifest;
            }
            if let Some(debug_build_paths) = debug_build_paths {
                new_options.debug_build_paths = Some(debug_build_paths);
            }

            // TODO: Handle mode switch, should prevent mode being switched.
            let watch = new_options.watch;

            let project = project_operation(self)
                .resolve()
                .strongly_consistent()
                .await?;
            let prev_project_fs = project_fs_operation(project)
                .read_strongly_consistent()
                .await?;
            let prev_output_fs = output_fs_operation(project)
                .read_strongly_consistent()
                .await?;

            if let Some(old_options) = &*this.options_state.get_untracked() {
                span.record(
                    "env_diff",
                    define_env_diff_report(&old_options.define_env, &new_options.define_env)
                        .as_str(),
                );
            }
            this.options_state.set(Some(new_options));
            let project = project_operation(self)
                .resolve()
                .strongly_consistent()
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
        .instrument(span_clone)
        .await
    }
}

#[turbo_tasks::value_impl]
impl ProjectContainer {
    #[turbo_tasks::function]
    pub async fn project(&self) -> Result<Vc<Project>> {
        let env_map: Vc<EnvMap>;
        let next_config;
        let define_env;
        let root_path_str: RcStr;
        let project_path;
        let watch;
        let dev;
        let encryption_key;
        let build_id;
        let preview_props;
        let browserslist_query;
        let no_mangling;
        let write_routes_hashes_manifest;
        let current_node_js_version;
        let debug_build_paths;
        let deferred_entries;
        let is_persistent_caching_enabled;
        let server_hmr;
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
            root_path_str = options.root_path.clone();
            project_path = options.project_path.clone();
            watch = options.watch;
            dev = options.dev;
            encryption_key = options.encryption_key.clone();
            build_id = options.build_id.clone();
            preview_props = options.preview_props.clone();
            browserslist_query = options.browserslist_query.clone();
            no_mangling = options.no_mangling;
            write_routes_hashes_manifest = options.write_routes_hashes_manifest;
            current_node_js_version = options.current_node_js_version.clone();
            debug_build_paths = options.debug_build_paths.clone();
            deferred_entries = options.deferred_entries.clone().unwrap_or_default();
            is_persistent_caching_enabled = options.is_persistent_caching_enabled;
            server_hmr = options.server_hmr;
        }

        let root_path = ResolvedVc::cell(root_path_str);
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
            write_routes_hashes_manifest,
            current_node_js_version,
            debug_build_paths,
            deferred_entries,
            is_persistent_caching_enabled,
            server_hmr,
        }
        .cell())
    }

    /// See [Project::entrypoints].
    #[turbo_tasks::function]
    pub fn entrypoints(self: Vc<Self>) -> Vc<Entrypoints> {
        self.project().entrypoints()
    }

    /// See [`Project::hmr_chunk_names`].
    #[turbo_tasks::function]
    pub fn hmr_chunk_names(self: Vc<Self>, target: HmrTarget) -> Vc<Vec<RcStr>> {
        self.project().hmr_chunk_names(target)
    }

    /// Gets a source map for a particular `file_path`. If `dev` mode is disabled, this will always
    /// return [`FileContent::NotFound`].
    #[turbo_tasks::function]
    pub fn get_source_map(
        &self,
        file_path: FileSystemPath,
        section: Option<RcStr>,
    ) -> Vc<FileContent> {
        if let Some(map) = self.versioned_content_map {
            map.get_source_map(file_path, section)
        } else {
            FileContent::NotFound.cell()
        }
    }
}

#[derive(Clone)]
#[turbo_tasks::value]
pub struct Project {
    /// An absolute root path (Windows or Unix path) from which all files must be nested under.
    /// Trying to access a file outside this root will fail, so think of this as a chroot.
    /// E.g. `/home/user/projects/my-repo`.
    root_path: ResolvedVc<RcStr>,

    /// A path which contains the app/pages directories, relative to [`Project::root_path`], always
    /// a Unix path.
    /// E.g. `apps/my-app`
    project_path: RcStr,

    /// A path where to emit the build outputs, relative to [`Project::project_path`], always a
    /// Unix path. Corresponds to next.config.js's `distDir`.
    /// E.g. `.next`
    dist_dir: RcStr,

    /// The root directory of the distDir. In development mode, this is the parent directory of
    /// `distDir` since development builds use `{distDir}/dev`. This is used to ensure that the
    /// bundler doesn't traverse into the output directory.
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

    /// Whether to write the route hashes manifest.
    write_routes_hashes_manifest: bool,

    current_node_js_version: RcStr,

    /// Debug build paths for selective builds.
    /// When set, only routes matching these paths will be included in the build.
    debug_build_paths: Option<DebugBuildPaths>,

    /// App-router page routes that should be built after non-deferred routes.
    deferred_entries: Vec<RcStr>,

    /// Whether to enable persistent caching
    is_persistent_caching_enabled: bool,

    /// Whether server-side HMR is enabled (disabled with --no-server-fast-refresh).
    server_hmr: bool,
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

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for ConflictIssue {
    fn stage(&self) -> IssueStage {
        IssueStage::AppStructure
    }

    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.path.clone())
    }

    async fn title(&self) -> Result<StyledString> {
        self.title.owned().await
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(self.description.owned().await?))
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

        // CPU profiles are written to `.next-profiles/` at the project root (see `--cpu-prof`).
        // Deny access to it so the bundler doesn't traverse into the profiling output directory.
        let denied_profiles_path = join_path(&self.project_path, DIST_PROFILES_DIR_NAME)
            .unwrap()
            .into();

        Ok(DiskFileSystem::new_with_denied_paths(
            PROJECT_FILESYSTEM_NAME,
            *self.root_path,
            vec![denied_path, denied_profiles_path],
        ))
    }

    #[turbo_tasks::function]
    pub fn client_fs(self: Vc<Self>) -> Vc<Box<dyn FileSystem>> {
        let virtual_fs = VirtualFileSystem::new_with_name(rcstr!("client-fs"));
        Vc::upcast(virtual_fs)
    }

    #[turbo_tasks::function]
    pub fn output_fs(&self) -> Vc<DiskFileSystem> {
        DiskFileSystem::new(rcstr!("output"), *self.root_path)
    }

    #[turbo_tasks::function]
    pub async fn dist_dir_absolute(&self) -> Result<Vc<RcStr>> {
        let root_path = self.root_path.await?;
        Ok(Vc::cell(
            format!(
                "{}{}{}",
                root_path,
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
    pub fn next_config(&self) -> Vc<NextConfig> {
        *self.next_config
    }

    /// Build the `IssueFilter` for this project, incorporating any
    /// `turbopack.ignoreIssue` rules from the Next.js config.
    #[turbo_tasks::function]
    pub async fn issue_filter(self: Vc<Self>) -> Result<Vc<IssueFilter>> {
        let ignore_rules = self.next_config().turbopack_ignore_issue_rules().await?;
        Ok(IssueFilter::warnings_and_foreign_errors()
            .with_ignore_rules(ReadRef::into_owned(ignore_rules))
            .cell())
    }

    #[turbo_tasks::function]
    pub(super) fn is_persistent_caching_enabled(&self) -> Vc<bool> {
        Vc::cell(self.is_persistent_caching_enabled)
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
    pub(super) fn should_write_routes_hashes_manifest(&self) -> Result<Vc<bool>> {
        Ok(Vc::cell(self.write_routes_hashes_manifest))
    }

    #[turbo_tasks::function]
    pub(super) async fn should_write_nft_manifests(&self) -> Result<Vc<bool>> {
        Ok(Vc::cell(
            self.mode.await?.is_production()
                && *self.next_config.output().await? != Some(OutputType::Export),
        ))
    }

    #[turbo_tasks::function]
    pub fn deferred_entries(&self) -> Vc<Vec<RcStr>> {
        Vc::cell(self.deferred_entries.clone())
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
    pub(super) async fn execution_context(self: Vc<Self>) -> Result<Vc<ExecutionContext>> {
        let node_root = self.node_root().owned().await?;
        let next_mode = self.next_mode().await?;
        let strategy = *self
            .next_config()
            .turbopack_plugin_runtime_strategy()
            .await?;
        let node_backend = match strategy {
            #[cfg(feature = "worker_pool")]
            TurbopackPluginRuntimeStrategy::WorkerThreads => worker_threads_backend(),
            #[cfg(feature = "process_pool")]
            TurbopackPluginRuntimeStrategy::ChildProcesses => child_process_backend(),
        };

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
            .source_maps(*self.next_config().server_source_maps().await?)
            .build(),
        );

        Ok(ExecutionContext::new(
            self.project_path().owned().await?,
            node_execution_chunking_context,
            self.env(),
            node_backend,
        ))
    }

    #[turbo_tasks::function]
    pub(super) async fn client_compile_time_info(&self) -> Result<Vc<CompileTimeInfo>> {
        let next_mode = self.mode.await?;
        Ok(get_client_compile_time_info(
            self.browserslist_query.clone(),
            self.define_env.client(),
            self.next_config.report_system_env_inlining(),
            next_mode.is_development(),
        ))
    }

    #[turbo_tasks::function]
    pub async fn get_all_endpoint_groups(
        self: Vc<Self>,
        app_dir_only: bool,
    ) -> Result<Vc<EndpointGroups>> {
        Ok(self.get_all_endpoint_groups_with_app_route_filter(app_dir_only, None))
    }

    #[turbo_tasks::function]
    pub async fn get_all_endpoint_groups_with_app_route_filter(
        self: Vc<Self>,
        app_dir_only: bool,
        app_route_filter: Option<Vec<RcStr>>,
    ) -> Result<Vc<EndpointGroups>> {
        let mut endpoint_groups = Vec::new();

        let entrypoints = self
            .entrypoints_with_app_route_filter(app_route_filter)
            .await?;
        let mut add_pages_entries = false;

        if let Some(middleware) = &entrypoints.middleware {
            endpoint_groups.push((
                EndpointGroupKey::Middleware,
                EndpointGroup::from(middleware.endpoint),
            ));
        }

        if let Some(instrumentation) = &entrypoints.instrumentation {
            endpoint_groups.push((
                EndpointGroupKey::Instrumentation,
                EndpointGroup::from(instrumentation.node_js),
            ));
            endpoint_groups.push((
                EndpointGroupKey::InstrumentationEdge,
                EndpointGroup::from(instrumentation.edge),
            ));
        }

        for (key, route) in entrypoints.routes.iter() {
            match route {
                Route::Page {
                    html_endpoint,
                    data_endpoint,
                } => {
                    if !app_dir_only {
                        endpoint_groups.push((
                            EndpointGroupKey::Route(key.clone()),
                            EndpointGroup {
                                primary: vec![EndpointGroupEntry {
                                    endpoint: *html_endpoint,
                                    sub_name: None,
                                }],
                                // This only exists in development mode for HMR
                                additional: data_endpoint
                                    .iter()
                                    .map(|endpoint| EndpointGroupEntry {
                                        endpoint: *endpoint,
                                        sub_name: None,
                                    })
                                    .collect(),
                            },
                        ));
                        add_pages_entries = true;
                    }
                }
                Route::PageApi { endpoint } => {
                    if !app_dir_only {
                        endpoint_groups.push((
                            EndpointGroupKey::Route(key.clone()),
                            EndpointGroup::from(*endpoint),
                        ));
                        add_pages_entries = true;
                    }
                }
                Route::AppPage(page_routes) => {
                    endpoint_groups.push((
                        EndpointGroupKey::Route(key.clone()),
                        EndpointGroup {
                            primary: page_routes
                                .iter()
                                .map(|r| EndpointGroupEntry {
                                    endpoint: r.html_endpoint,
                                    sub_name: Some(r.original_name.clone()),
                                })
                                .collect(),
                            additional: Vec::new(),
                        },
                    ));
                }
                Route::AppRoute {
                    original_name: _,
                    endpoint,
                } => {
                    endpoint_groups.push((
                        EndpointGroupKey::Route(key.clone()),
                        EndpointGroup::from(*endpoint),
                    ));
                }
                Route::Conflict => {
                    tracing::info!("WARN: conflict");
                }
            }
        }

        if add_pages_entries {
            endpoint_groups.push((
                EndpointGroupKey::PagesError,
                EndpointGroup::from(entrypoints.pages_error_endpoint),
            ));
            endpoint_groups.push((
                EndpointGroupKey::PagesApp,
                EndpointGroup::from(entrypoints.pages_app_endpoint),
            ));
            endpoint_groups.push((
                EndpointGroupKey::PagesDocument,
                EndpointGroup::from(entrypoints.pages_document_endpoint),
            ));
        }

        Ok(Vc::cell(endpoint_groups))
    }

    #[turbo_tasks::function]
    pub async fn get_all_endpoints(self: Vc<Self>, app_dir_only: bool) -> Result<Vc<Endpoints>> {
        let mut endpoints = Vec::new();
        for (_key, group) in self.get_all_endpoint_groups(app_dir_only).await?.iter() {
            for entry in group.primary.iter() {
                endpoints.push(entry.endpoint);
            }
            for entry in group.additional.iter() {
                endpoints.push(entry.endpoint);
            }
        }

        Ok(Vc::cell(endpoints))
    }

    #[turbo_tasks::function]
    pub async fn get_all_entries(self: Vc<Self>) -> Result<Vc<GraphEntries>> {
        let endpoint_entries = self
            .get_all_endpoints(false)
            .await?
            .iter()
            .map(|endpoint| endpoint.entries().owned())
            .try_join()
            .await?;

        let result = GraphEntries::concatenate(
            endpoint_entries
                .into_iter()
                .chain(std::iter::once(self.client_main_modules().owned().await?))
                .chain(std::iter::once(GraphEntries::new(
                    vec![],
                    self.additional_traced_modules().owned().await?,
                ))),
        );

        Ok(result.cell())
    }

    #[turbo_tasks::function]
    pub async fn get_all_additional_entries(
        self: Vc<Self>,
        graphs: Vc<ModuleGraph>,
    ) -> Result<Vc<GraphEntries>> {
        let result = GraphEntries::concatenate(
            self.get_all_endpoints(false)
                .await?
                .iter()
                .map(|endpoint| endpoint.additional_entries(graphs).owned())
                .try_join()
                .await?,
        );
        Ok(result.cell())
    }

    #[turbo_tasks::function]
    pub async fn module_graph(
        self: Vc<Self>,
        entry: ResolvedVc<Box<dyn Module>>,
    ) -> Result<Vc<ModuleGraph>> {
        Ok(if *self.per_page_module_graph().await? {
            ModuleGraph::from_graphs(
                vec![SingleModuleGraph::new_with_entry(
                    ChunkGroupEntry::Entry(vec![entry]),
                    /* include_traced */ *self.should_write_nft_manifests().await?,
                    /* include_binding_usage */ self.next_mode().await?.is_production(),
                )],
                None,
            )
            .connect()
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
            ModuleGraph::from_graphs(
                vec![SingleModuleGraph::new_with_entries(
                    GraphEntries::from_chunk_groups(vec![ChunkGroupEntry::Entry(entries)])
                        .resolved_cell(),
                    /* include_traced */ *self.should_write_nft_manifests().await?,
                    /* include_binding_usage */ self.next_mode().await?.is_production(),
                )],
                None,
            )
            .connect()
        } else {
            *self.whole_app_module_graphs().await?.full
        })
    }

    /// Computes the whole app module graph without dropping issues.
    ///
    /// Use this instead of [Self::whole_app_module_graphs] when you need to collect issues from
    /// the computation (e.g. for the `get_compilation_issues` MCP tool).
    #[turbo_tasks::function]
    pub async fn whole_app_module_graphs_without_dropping_issues(
        self: ResolvedVc<Self>,
    ) -> Result<Vc<BaseAndFullModuleGraph>> {
        let module_graphs_op = whole_app_module_graph_operation(self);
        let module_graphs_vc = module_graphs_op.connect();
        scale_down_node_pool(self).await?;
        Ok(module_graphs_vc)
    }

    /// Computes the whole app module graph, dropping issues in development mode so that
    /// individual routes don't each report every issue from the shared graph.
    #[turbo_tasks::function(root)]
    pub async fn whole_app_module_graphs(
        self: ResolvedVc<Self>,
    ) -> Result<Vc<BaseAndFullModuleGraph>> {
        let module_graphs_op = whole_app_module_graph_operation(self);
        let module_graphs_vc = if self.next_mode().await?.is_production() {
            module_graphs_op.connect()
        } else {
            let vc = module_graphs_op.resolve().strongly_consistent().await?;
            module_graphs_op.drop_issues();
            *vc
        };
        scale_down_node_pool(self).await?;
        Ok(module_graphs_vc)
    }

    #[turbo_tasks::function]
    pub(super) async fn server_compile_time_info(self: Vc<Self>) -> Result<Vc<CompileTimeInfo>> {
        let this = self.await?;
        Ok(get_server_compile_time_info(
            // `/ROOT` corresponds to `[project]/`, so we need exactly the `path` part.
            self.project_path(),
            this.define_env.nodejs(),
            self.current_node_js_version(),
            this.next_config.report_system_env_inlining(),
            this.server_hmr,
        ))
    }

    #[turbo_tasks::function]
    pub(super) async fn edge_compile_time_info(self: Vc<Self>) -> Result<Vc<CompileTimeInfo>> {
        let this = self.await?;
        Ok(get_edge_compile_time_info(
            self.project_path().owned().await?,
            this.define_env.edge(),
            self.current_node_js_version(),
            this.next_config.report_system_env_inlining(),
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
        let css_url_suffix = self.next_config().asset_suffix_path();
        Ok(get_client_chunking_context(ClientChunkingContextOptions {
            mode: self.next_mode(),
            root_path: self.project_root_path().owned().await?,
            client_root: self.client_relative_path().owned().await?,
            client_root_to_root_path: rcstr!("/ROOT"),
            client_static_folder_name: self
                .next_config()
                .client_static_folder_name()
                .owned()
                .await?,
            asset_prefix: self.next_config().computed_asset_prefix(),
            environment: self.client_compile_time_info().environment(),
            module_id_strategy: self.module_ids(),
            export_usage: self.export_usage(),
            unused_references: self.unused_references(),
            minify: self.next_config().turbo_minify(self.next_mode()),
            source_maps: self.next_config().client_source_maps(self.next_mode()),
            no_mangling: self.no_mangling(),
            scope_hoisting: self.next_config().turbo_scope_hoisting(self.next_mode()),
            nested_async_chunking: self
                .next_config()
                .turbo_nested_async_chunking(self.next_mode(), true),
            debug_ids: self.next_config().turbopack_debug_ids(),
            worker_asset_prefix: self.next_config().turbopack_worker_asset_prefix(),
            should_use_absolute_url_references: self.next_config().inline_css(),
            css_url_suffix,
            hash_salt: self.next_config().output_hash_salt().to_resolved().await?,
            cross_origin: self.next_config().cross_origin(),
            chunk_loading_global: self.next_config().turbopack_chunk_loading_global(),
            style_groups_algorithm: self.next_config().css_chunking().owned().await?,
        }))
    }

    #[turbo_tasks::function]
    pub(super) async fn server_chunking_context(
        self: Vc<Self>,
        client_assets: bool,
    ) -> Result<Vc<NodeJsChunkingContext>> {
        let css_url_suffix = self.next_config().asset_suffix_path();
        let options = ServerChunkingContextOptions {
            mode: self.next_mode(),
            root_path: self.project_root_path().owned().await?,
            node_root: self.node_root().owned().await?,
            node_root_to_root_path: self.node_root_to_root_path().owned().await?,
            environment: self.server_compile_time_info().environment(),
            module_id_strategy: self.module_ids(),
            export_usage: self.export_usage(),
            unused_references: self.unused_references(),
            minify: self.next_config().turbo_minify(self.next_mode()),
            source_maps: self.next_config().server_source_maps(),
            no_mangling: self.no_mangling(),
            scope_hoisting: self.next_config().turbo_scope_hoisting(self.next_mode()),
            nested_async_chunking: self
                .next_config()
                .turbo_nested_async_chunking(self.next_mode(), false),
            debug_ids: self.next_config().turbopack_debug_ids(),
            client_root: self.client_relative_path().owned().await?,
            client_static_folder_name: self
                .next_config()
                .client_static_folder_name()
                .owned()
                .await?,
            asset_prefix: self.next_config().computed_asset_prefix().owned().await?,
            css_url_suffix,
            hash_salt: self.next_config().output_hash_salt().to_resolved().await?,
            style_groups_algorithm: self.next_config().css_chunking().owned().await?,
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
        let css_url_suffix = self.next_config().asset_suffix_path();
        let options = EdgeChunkingContextOptions {
            mode: self.next_mode(),
            root_path: self.project_root_path().owned().await?,
            node_root: self.node_root().owned().await?,
            output_root_to_root_path: self.node_root_to_root_path(),
            environment: self.edge_compile_time_info().environment(),
            module_id_strategy: self.module_ids(),
            export_usage: self.export_usage(),
            unused_references: self.unused_references(),
            turbo_minify: self.next_config().turbo_minify(self.next_mode()),
            turbo_source_maps: self.next_config().server_source_maps(),
            no_mangling: self.no_mangling(),
            scope_hoisting: self.next_config().turbo_scope_hoisting(self.next_mode()),
            nested_async_chunking: self
                .next_config()
                .turbo_nested_async_chunking(self.next_mode(), false),
            client_root: self.client_relative_path().owned().await?,
            client_static_folder_name: self
                .next_config()
                .client_static_folder_name()
                .owned()
                .await?,
            asset_prefix: self.next_config().computed_asset_prefix().owned().await?,
            css_url_suffix,
            hash_salt: self.next_config().output_hash_salt().to_resolved().await?,
            cross_origin: self.next_config().cross_origin(),
            style_groups_algorithm: self.next_config().css_chunking().owned().await?,
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

    /// Computes the project's feature-usage telemetry summary.
    ///
    /// Includes:
    /// - The SWC target triple (`swc/target/...`, always on).
    /// - Boolean config and compiler-option flags, mirroring the webpack [`TelemetryPlugin`](https://github.com/vercel/next.js/blob/9da305fe320b89ee2f8c3cfb7ecbf48856368913/packages/next/src/build/webpack-config.ts#L2516)
    ///   shape.
    /// - Per-feature-module import counts (e.g. `next/image`, `next/font/google`) computed by
    ///   walking the whole-app module graph and counting **unique importing modules** per feature.
    ///   This replaces an earlier `before_resolve` plugin that emitted telemetry per resolve;
    ///   because Turbopack caches resolves, the earlier approach under-counted to at most one per
    ///   feature.
    ///
    /// Returns `bail!` if the project is not in build mode — `whole_app_module_graphs` drops
    /// issues in development and the graph may not reflect the full project, so reporting
    /// telemetry from dev would produce misleading counts.
    ///
    /// The returned summary is sorted by feature name for determinism.
    #[turbo_tasks::function]
    pub async fn project_feature_usage(
        self: ResolvedVc<Self>,
    ) -> Result<Vc<ProjectFeatureUsageSummary>> {
        if !self.next_mode().await?.is_production() {
            bail!("project_feature_usage() may only be called during `next build`");
        }

        // (public feature specifier, path suffix) pairs. The suffix identifies the resolved
        // feature module; we match via `module.ident().path.path.ends_with(suffix)`. Mirrors
        // the webpack `FEATURE_MODULE_MAP` + `FEATURE_MODULE_REGEXP_MAP` in
        // `packages/next/src/build/webpack/plugins/telemetry-plugin/telemetry-plugin.ts`.
        //
        // Font specifiers (`next/font/*`, `@next/font/*`) are matched against the synthesized
        // `target.css` virtual module produced by the Next.js font loader transform
        // (`crates/next-custom-transforms/src/transforms/fonts`). That transform rewrites
        // `import { Inter } from 'next/font/google'` into
        // `import inter from 'next/font/google/target.css?{...}'` — the original specifier never
        // appears in the module graph, but the synthesized `target.css` module's path suffix does.
        // `ident.path.path` does not include the query string (that lives on `ident.query`), so
        // `ends_with` is the correct matcher here.
        static FEATURE_MODULE_PATH_SUFFIXES: &[(&str, &str)] = &[
            ("next/image", "/next/image.js"),
            ("next/future/image", "/next/future/image.js"),
            ("next/legacy/image", "/next/legacy/image.js"),
            ("next/script", "/next/script.js"),
            ("next/dynamic", "/next/dynamic.js"),
            ("next/font/google", "/next/font/google/target.css"),
            ("next/font/local", "/next/font/local/target.css"),
            ("@next/font/google", "/@next/font/google/target.css"),
            ("@next/font/local", "/@next/font/local/target.css"),
        ];

        // TODO: useSwcLoader is not being reported as it is not directly corresponds (it checks
        // babel config existence) — need to confirm what we'll do with turbopack.
        let config = self.next_config();
        let compiler_options = config.compiler().await?;
        let mut features: Vec<(RcStr, u32)> = vec![
            // SWC target triple is prefixed with `swc/target/` to match the webpack
            // `swc/target/${SWC_TARGET_TRIPLE}` variant in `EventBuildFeatureUsage`.
            (
                format!("swc/target/{}", env!("VERGEN_CARGO_TARGET_TRIPLE")).into(),
                1,
            ),
            (
                rcstr!("skipProxyUrlNormalize"),
                (*config.skip_proxy_url_normalize().await?) as u32,
            ),
            (
                rcstr!("skipTrailingSlashRedirect"),
                (*config.skip_trailing_slash_redirect().await?) as u32,
            ),
            (
                rcstr!("modularizeImports"),
                !config.modularize_imports().await?.is_empty() as u32,
            ),
            (
                rcstr!("transpilePackages"),
                !config.transpile_packages().await?.is_empty() as u32,
            ),
            (rcstr!("swcRelay"), compiler_options.relay.is_some() as u32),
            (
                rcstr!("swcStyledComponents"),
                compiler_options
                    .styled_components
                    .as_ref()
                    .is_some_and(|sc| sc.is_enabled()) as u32,
            ),
            (
                rcstr!("swcReactRemoveProperties"),
                compiler_options
                    .react_remove_properties
                    .as_ref()
                    .is_some_and(|rc| rc.is_enabled()) as u32,
            ),
            (
                rcstr!("swcRemoveConsole"),
                compiler_options
                    .remove_console
                    .as_ref()
                    .is_some_and(|rc| rc.is_enabled()) as u32,
            ),
            (
                rcstr!("swcEmotion"),
                compiler_options
                    .emotion
                    .as_ref()
                    .is_some_and(|e| e.is_enabled()) as u32,
            ),
        ];

        // Module-usage counts: two passes over the module graph.
        //  1. Iterate all nodes, classify each in parallel, keep only feature-module matches.
        //  2. Walk edges, for each edge whose target is a classified feature module, add the parent
        //     to that feature's unique-importer set.
        let module_graph = self.whole_app_module_graphs().await?.full.await?;

        let matching: FxHashMap<ResolvedVc<Box<dyn Module>>, &'static str> = module_graph
            .iter_nodes()
            .map(async |node| {
                let ident = node.ident().await?;
                let path = &ident.path.path;
                for &(feature, suffix) in FEATURE_MODULE_PATH_SUFFIXES {
                    if path.ends_with(suffix) {
                        return Ok(Some((node, feature)));
                    }
                }
                Ok(None)
            })
            .try_flat_join()
            .await?
            .into_iter()
            .collect();

        // Collect (feature, parent) pairs for every edge whose target is a feature module.
        //
        // We count every such edge regardless of whether the import is eventually tree-shaken.
        // This matches webpack's `TelemetryPlugin`, which hooks `finishModules` (before DCE).
        // We could filter via `BindingUsageInfo` to only count edges that survive tree-shaking,
        // but staying parallel to webpack lets dashboards compare counts across the two bundlers
        // directly.
        let mut pairs: FxHashSet<(&'static str, ResolvedVc<Box<dyn Module>>)> =
            FxHashSet::default();
        module_graph.traverse_edges_unordered(|parent, node| {
            if let Some((parent_node, _)) = parent
                && let Some(&feature) = matching.get(&node)
            {
                pairs.insert((feature, parent_node));
            }
            Ok(())
        })?;

        // Dedupe parents by their source location (path + query + fragment), ignoring
        // `ident().layer` and other modifiers. In Turbopack the same user file often appears as
        // separate modules per layer (e.g. SSR, client, edge), but webpack counts one "importer"
        // per source file — this matches that semantics.
        let parent_source_keys = pairs
            .into_iter()
            .map(async |(feature, parent)| {
                let ident = parent.ident().await?;
                let key = (
                    ident.path.path.clone(),
                    ident.query.clone(),
                    ident.fragment.clone(),
                );
                Ok((feature, key))
            })
            .try_join()
            .await?;

        let mut importers: FxHashMap<&'static str, FxHashSet<(RcStr, RcStr, RcStr)>> =
            FxHashMap::default();
        for (feature, key) in parent_source_keys {
            importers.entry(feature).or_default().insert(key);
        }
        for (feature, unique_sources) in importers {
            features.push((RcStr::from(feature), unique_sources.len() as u32));
        }

        features.sort_by(|a, b| a.0.cmp(&b.0));
        Ok(ProjectFeatureUsageSummary { features }.cell())
    }

    /// Scans the app/pages directories for entry points files (matching the
    /// provided page_extensions).
    #[turbo_tasks::function]
    pub async fn entrypoints(self: Vc<Self>) -> Result<Vc<Entrypoints>> {
        Ok(self.entrypoints_with_app_route_filter(None))
    }

    #[turbo_tasks::function]
    pub async fn entrypoints_with_app_route_filter(
        self: Vc<Self>,
        app_route_filter: Option<Vec<RcStr>>,
    ) -> Result<Vc<Entrypoints>> {
        let this = self.await?;
        let mut routes = FxIndexMap::default();
        let app_project = self.app_project();
        let pages_project = self.pages_project();

        // Convert debug build paths to route keys once for O(1) lookups
        let debug_build_paths_route_keys = this
            .debug_build_paths
            .as_ref()
            .map(DebugBuildPathsRouteKeys::from_debug_build_paths)
            .transpose()?;

        if let Some(app_project) = &*app_project.await? {
            let app_routes = app_project.routes_with_filter(app_route_filter);
            routes.extend(
                app_routes
                    .await?
                    .iter()
                    .filter(|(k, _)| {
                        debug_build_paths_route_keys
                            .as_ref()
                            .is_none_or(|keys| keys.should_include_app_route(k))
                    })
                    .map(|(k, v)| (k.clone(), v.clone())),
            );
        }

        for (pathname, page_route) in &pages_project.routes().await? {
            if debug_build_paths_route_keys
                .as_ref()
                .is_some_and(|keys| !keys.should_include_pages_route(pathname))
            {
                continue;
            }

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
                // There is no NFT on edge
                false,
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
                *self.should_write_nft_manifests().await?,
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
            return Ok(Vc::upcast(EmptyEndpoint::new(self)));
        };
        let source = Vc::upcast(FileSource::new(fs_path.clone()));
        let app_dir = find_app_dir(self.project_path().owned().await?)
            .owned()
            .await?;
        let ecmascript_client_reference_transition_name = (*self.app_project().await?)
            .as_ref()
            .map(|_| AppProject::client_transition_name());

        let is_proxy = fs_path.file_stem() == Some("proxy");
        let config = parse_segment_config_from_source(
            source,
            if is_proxy {
                ParseSegmentMode::Proxy
            } else {
                ParseSegmentMode::Base
            },
        );
        let runtime = config.await?.runtime.unwrap_or(if is_proxy {
            NextRuntime::NodeJs
        } else {
            NextRuntime::Edge
        });

        let middleware_asset_context = match runtime {
            NextRuntime::NodeJs => self.node_middleware_context(),
            NextRuntime::Edge => self.edge_middleware_context(),
        };

        Ok(Vc::upcast(MiddlewareEndpoint::new(
            self,
            middleware_asset_context,
            source,
            app_dir.clone(),
            ecmascript_client_reference_transition_name,
            config,
            runtime,
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
                *self.should_write_nft_manifests().await?,
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
                // There is no NFT on edge
                false,
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
            return Ok(Vc::upcast(EmptyEndpoint::new(self)));
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

    /// Returns the root path for HMR content based on the target.
    /// Client uses client_relative_path, Server uses node_root.
    #[turbo_tasks::function]
    async fn hmr_root_path(self: Vc<Self>, target: HmrTarget) -> Result<Vc<FileSystemPath>> {
        Ok(match target {
            HmrTarget::Client => self.client_relative_path(),
            HmrTarget::Server => self.node_root(),
        })
    }

    /// Get HMR content by chunk_name for the specified target.
    #[turbo_tasks::function]
    async fn hmr_content(
        self: Vc<Self>,
        chunk_name: RcStr,
        target: HmrTarget,
    ) -> Result<Vc<OptionVersionedContent>> {
        if let Some(map) = self.await?.versioned_content_map {
            let content = map.get(self.hmr_root_path(target).await?.join(&chunk_name)?);
            Ok(content)
        } else {
            bail!("must be in dev mode to hmr")
        }
    }

    /// Get the version state for an HMR session. Initialized with the first seen
    /// version in that session.
    #[turbo_tasks::function]
    pub async fn hmr_version_state(
        self: ResolvedVc<Self>,
        chunk_name: RcStr,
        target: HmrTarget,
        session: TransientInstance<()>,
    ) -> Result<Vc<VersionState>> {
        // The session argument is important to avoid caching this function between
        // sessions.
        let _ = session;

        #[tracing::instrument(
            level = "info",
            name = "get HMR version",
            skip_all,
            fields(chunk_name = %chunk_name, target = %target),
        )]
        #[turbo_tasks::function(operation, root)]
        async fn hmr_version_operation(
            this: ResolvedVc<Project>,
            chunk_name: RcStr,
            target: HmrTarget,
        ) -> Result<Vc<Box<dyn Version>>> {
            tracing::info!(chunk_name = %chunk_name, target = %target, "hmr subscription");
            let content = this.hmr_content(chunk_name, target).await?;
            if let Some(content) = &*content {
                Ok(content.version())
            } else {
                Ok(Vc::upcast(NotFoundVersion::new()))
            }
        }
        let version_op = hmr_version_operation(self, chunk_name, target);

        // INVALIDATION: This is intentionally untracked to avoid invalidating this
        // function completely. We want to initialize the VersionState with the
        // first seen version of the session.
        let state = VersionState::new(
            version_op
                .read_trait_strongly_consistent()
                .untracked()
                .await?,
        )
        .await?;
        Ok(state)
    }

    /// Emits opaque HMR events whenever a change is detected in the chunk group
    /// internally known as `chunk_name` for the specified target.
    #[turbo_tasks::function]
    pub async fn hmr_update(
        self: Vc<Self>,
        chunk_name: RcStr,
        target: HmrTarget,
        from: Vc<VersionState>,
    ) -> Result<Vc<Update>> {
        let from = from.get();
        let content = self.hmr_content(chunk_name, target).await?;
        if let Some(content) = *content {
            Ok(content.update(from))
        } else {
            Ok(Update::Missing.cell())
        }
    }

    /// Gets a list of all HMR chunk names that can be subscribed to for the
    /// specified target. Used by the dev server to set up server-side HMR
    /// subscriptions for all Node.js App Router entries (pages and route
    /// handlers).
    #[turbo_tasks::function]
    pub async fn hmr_chunk_names(self: Vc<Self>, target: HmrTarget) -> Result<Vc<Vec<RcStr>>> {
        if let Some(map) = self.await?.versioned_content_map {
            Ok(map.keys_in_path(self.hmr_root_path(target).owned().await?))
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
        let mut chunk_groups = vec![ChunkGroupEntry::Entry(vec![
            pages_project.client_main_module().to_resolved().await?,
        ])];

        if let Some(app_project) = *self.app_project().await? {
            chunk_groups.push(ChunkGroupEntry::Entry(vec![
                app_project.client_main_module().to_resolved().await?,
            ]));
        }

        Ok(GraphEntries::from_chunk_groups(chunk_groups).cell())
    }

    /// Gets the module id strategy for the project.
    #[turbo_tasks::function]
    pub async fn module_ids(self: Vc<Self>) -> Result<Vc<ModuleIdStrategy>> {
        let module_id_strategy = *self.next_config().module_ids(self.next_mode()).await?;
        match module_id_strategy {
            ModuleIdStrategyConfig::Named => Ok(ModuleIdStrategy {
                module_id_map: None,
                fallback: ModuleIdFallback::Ident,
            }
            .cell()),
            ModuleIdStrategyConfig::Deterministic => {
                let module_graphs = self.whole_app_module_graphs().await?;
                Ok(get_global_module_id_strategy(*module_graphs.full))
            }
        }
    }

    /// Compute the used exports and unused imports for each module.
    #[turbo_tasks::function]
    async fn binding_usage_info(self: Vc<Self>) -> Result<Vc<BindingUsageInfo>> {
        let module_graphs = self.whole_app_module_graphs().await?;
        Ok(module_graphs
            .binding_usage_info
            .context("No binding usage info")?
            .connect())
    }

    /// Compute the used exports for each module.
    #[turbo_tasks::function]
    pub async fn export_usage(self: Vc<Self>) -> Result<Vc<OptionBindingUsageInfo>> {
        if *self
            .next_config()
            .turbopack_remove_unused_exports(self.next_mode())
            .await?
        {
            Ok(Vc::cell(Some(
                self.binding_usage_info().to_resolved().await?,
            )))
        } else {
            Ok(Vc::cell(None))
        }
    }

    /// Compute the unused references that were removed (inner graph tree shaking).
    #[turbo_tasks::function]
    pub async fn unused_references(self: Vc<Self>) -> Result<Vc<UnusedReferences>> {
        if *self
            .next_config()
            .turbopack_remove_unused_imports(self.next_mode())
            .await?
        {
            Ok(self.binding_usage_info().unused_references())
        } else {
            Ok(Vc::cell(Default::default()))
        }
    }

    #[turbo_tasks::function]
    pub async fn with_next_config(&self, next_config: Vc<NextConfig>) -> Result<Vc<Self>> {
        Ok(Self {
            next_config: next_config.to_resolved().await?,
            ..(*self).clone()
        }
        .cell())
    }

    /// Returns any modules specified as `nextConfig.cacheHandler` and/or `nextConfig.cacheHandlers`
    #[turbo_tasks::function]
    pub async fn additional_traced_modules(self: Vc<Self>) -> Result<Vc<Modules>> {
        let project_path = self.project_path().owned().await?;
        let cache_handler = self
            .next_config()
            .cache_handler(project_path.clone())
            .await?;
        let cache_handlers = self
            .next_config()
            .cache_handlers(project_path.clone())
            .await?;

        let asset_context =
            externals_tracing_module_context(get_tracing_compile_time_info(), false);

        Ok(Vc::cell(
            cache_handler
                .iter()
                .chain(cache_handlers.iter())
                .map(|f| {
                    asset_context
                        .process(
                            Vc::upcast(FileSource::new(f.clone())),
                            ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined),
                        )
                        .module()
                })
                .map(|m| m.to_resolved())
                .try_join()
                .await?,
        ))
    }
}

/// Scales down or shuts down the Node.js process pool after module graph computation.
async fn scale_down_node_pool(project: ResolvedVc<Project>) -> Result<()> {
    let execution_context = project.execution_context().await?;
    let node_backend = execution_context.node_backend.into_trait_ref().await?;
    if *project.is_watch_enabled().await? {
        node_backend.scale_down()?;
    } else {
        node_backend.scale_zero()?;
    }
    Ok(())
}

// This is a performance optimization. This function is a root aggregation function that
// aggregates over the whole subgraph.
#[turbo_tasks::function(operation, root)]
async fn whole_app_module_graph_operation(
    project: ResolvedVc<Project>,
) -> Result<Vc<BaseAndFullModuleGraph>> {
    let span = tracing::info_span!("whole app module graph", modules = Empty, edges = Empty);
    let span_clone = span.clone();
    async move {
        let next_mode = project.next_mode();
        let should_trace = *project.should_write_nft_manifests().await?;
        let should_read_binding_usage = next_mode.await?.is_production();
        let base_single_module_graph = SingleModuleGraph::new_with_entries(
            project.get_all_entries().to_resolved().await?,
            should_trace,
            should_read_binding_usage,
        );
        let base_visited_modules = VisitedModules::from_graph(base_single_module_graph);

        let base = ModuleGraph::from_graphs(vec![base_single_module_graph], None);

        let turbopack_remove_unused_imports = *project
            .next_config()
            .turbopack_remove_unused_imports(next_mode)
            .await?;

        let base = if turbopack_remove_unused_imports {
            // TODO suboptimal that we do compute_binding_usage_info twice (once for the base
            // graph and later for the full graph)
            let binding_usage_info = compute_binding_usage_info(base, true);
            ModuleGraph::from_graphs(vec![base_single_module_graph], Some(binding_usage_info))
        } else {
            base
        };

        let additional_entries = project
            .get_all_additional_entries(base.connect())
            .to_resolved()
            .await?;

        let additional_module_graph = SingleModuleGraph::new_with_entries_visited(
            additional_entries,
            base_visited_modules,
            should_trace,
            should_read_binding_usage,
        );

        if !span.is_disabled() {
            let base_module_count = base_single_module_graph
                .connect()
                .module_count()
                .untracked()
                .await?;
            let additional_module_count = additional_module_graph
                .connect()
                .module_count()
                .untracked()
                .await?;
            span.record("modules", *base_module_count + *additional_module_count);
            let base_edge_count = base_single_module_graph
                .connect()
                .edge_count()
                .untracked()
                .await?;
            let additional_edge_count = additional_module_graph
                .connect()
                .edge_count()
                .untracked()
                .await?;
            span.record("edges", *base_edge_count + *additional_edge_count);
        }

        let graphs = vec![base_single_module_graph, additional_module_graph];

        let (full, binding_usage_info) = if turbopack_remove_unused_imports {
            let full_with_unused_references = ModuleGraph::from_graphs(graphs.clone(), None);
            let binding_usage_info = compute_binding_usage_info(full_with_unused_references, true);
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
}

#[turbo_tasks::value(shared)]
pub struct BaseAndFullModuleGraph {
    /// The base module graph generated from the entry points.
    pub base: ResolvedVc<ModuleGraph>,
    /// `full_with_unused_references` but with unused references removed.
    pub full: ResolvedVc<ModuleGraph>,
    /// Information about binding usage in the module graph.
    pub binding_usage_info: Option<OperationVc<BindingUsageInfo>>,
}

#[turbo_tasks::function]
async fn any_output_changed(
    roots: Vc<OutputAssets>,
    path: FileSystemPath,
    server: bool,
) -> Result<Vc<Completion>> {
    let all_assets = expand_output_assets(
        roots.await?.into_iter().map(ExpandOutputAssetsInput::Asset),
        true,
    )
    .await?;
    let completions = all_assets
        .into_iter()
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

#[turbo_tasks::function(operation, root)]
fn all_assets_from_entries_operation(
    operation: OperationVc<OutputAssets>,
) -> Result<Vc<ExpandedOutputAssets>> {
    let assets = operation.connect();
    Ok(all_assets_from_entries(assets))
}
