use std::path::MAIN_SEPARATOR;

use anyhow::{Context, Result};
use indexmap::{map::Entry, IndexMap};
use next_core::{
    app_structure::{find_app_dir, get_entrypoints},
    mode::NextMode,
    next_client::{
        get_client_chunking_context, get_client_compile_time_info,
        get_client_module_options_context, get_client_resolve_options_context,
        get_client_runtime_entries, ClientContextType,
    },
    next_config::NextConfig,
    next_dynamic::NextDynamicTransition,
    next_server::{
        get_server_chunking_context, get_server_compile_time_info,
        get_server_module_options_context, get_server_resolve_options_context,
        get_server_runtime_entries, ServerContextType,
    },
    pages_structure::{find_pages_structure, PagesStructure},
    util::NextSourceConfig,
};
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    debug::ValueDebugFormat, trace::TraceRawVcs, unit, TaskInput, TransientValue, TryJoinIterExt,
    Value, Vc,
};
use turbopack_binding::{
    turbo::{
        tasks_env::ProcessEnv,
        tasks_fs::{DiskFileSystem, FileSystem, FileSystemPath, VirtualFileSystem},
    },
    turbopack::{
        build::BuildChunkingContext,
        core::{
            chunk::{ChunkingContext, EvaluatableAssets},
            compile_time_info::CompileTimeInfo,
            context::AssetContext,
            environment::ServerAddr,
            PROJECT_FILESYSTEM_NAME,
        },
        dev::DevChunkingContext,
        ecmascript::chunk::EcmascriptChunkingContext,
        env::dotenv::load_env,
        node::execution_context::ExecutionContext,
        turbopack::{
            evaluate_context::node_build_environment,
            module_options::ModuleOptionsContext,
            resolve_options_context::ResolveOptionsContext,
            transition::{ContextTransition, TransitionsByName},
            ModuleAssetContext,
        },
    },
};

use crate::{
    app::app_entry_point_to_route,
    pages::get_pages_routes,
    route::{Endpoint, Route},
};

#[derive(Debug, Serialize, Deserialize, Clone, TaskInput)]
#[serde(rename_all = "camelCase")]
pub struct ProjectOptions {
    /// A root path from which all files must be nested under. Trying to access
    /// a file outside this root will fail. Think of this as a chroot.
    pub root_path: String,

    /// A path inside the root_path which contains the app/pages directories.
    pub project_path: String,

    /// The contents of next.config.js, serialized to JSON.
    pub next_config: String,

    /// Whether to watch the filesystem for file changes.
    pub watch: bool,

    /// An upper bound of memory that turbopack will attempt to stay under.
    pub memory_limit: Option<u64>,
}

#[derive(Serialize, Deserialize, TraceRawVcs, PartialEq, Eq, ValueDebugFormat)]
pub struct Middleware {
    pub endpoint: Vc<Box<dyn Endpoint>>,
    pub config: NextSourceConfig,
}

#[turbo_tasks::value]
pub struct Entrypoints {
    pub routes: IndexMap<String, Route>,
    pub middleware: Option<Middleware>,
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

    browserslist_query: String,

    mode: NextMode,
}

#[turbo_tasks::value_impl]
impl Project {
    #[turbo_tasks::function]
    pub async fn new(options: ProjectOptions) -> Result<Vc<Self>> {
        let next_config = NextConfig::from_string(options.next_config);
        Ok(Project {
            root_path: options.root_path,
            project_path: options.project_path,
            watch: options.watch,
            next_config,
            browserslist_query: "last 1 Chrome versions, last 1 Firefox versions, last 1 Safari \
                                 versions, last 1 Edge versions"
                .to_string(),
            mode: NextMode::Development,
        }
        .cell())
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
    async fn project_path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
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
    async fn pages_structure(self: Vc<Self>) -> Result<Vc<PagesStructure>> {
        let this: turbo_tasks::ReadRef<Project> = self.await?;
        let next_router_fs = Vc::upcast::<Box<dyn FileSystem>>(VirtualFileSystem::new());
        let next_router_root = next_router_fs.root();
        Ok(find_pages_structure(
            self.project_path(),
            next_router_root,
            this.next_config.page_extensions(),
        ))
    }

    #[turbo_tasks::function]
    fn env(self: Vc<Self>) -> Vc<Box<dyn ProcessEnv>> {
        load_env(self.project_path())
    }

    #[turbo_tasks::function]
    async fn next_config(self: Vc<Self>) -> Result<Vc<NextConfig>> {
        Ok(self.await?.next_config)
    }

    #[turbo_tasks::function]
    fn execution_context(self: Vc<Self>) -> Vc<ExecutionContext> {
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
    async fn client_compile_time_info(self: Vc<Self>) -> Result<Vc<CompileTimeInfo>> {
        let this = self.await?;
        Ok(get_client_compile_time_info(
            this.mode,
            this.browserslist_query.clone(),
        ))
    }

    #[turbo_tasks::function]
    async fn server_compile_time_info(self: Vc<Self>) -> Result<Vc<CompileTimeInfo>> {
        let this = self.await?;
        Ok(get_server_compile_time_info(
            this.mode,
            self.env(),
            // TODO(alexkirsz) Fill this out.
            ServerAddr::empty(),
        ))
    }

    #[turbo_tasks::function]
    async fn pages_dir(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        Ok(if let Some(pages) = self.pages_structure().await?.pages {
            pages.project_path()
        } else {
            self.project_path().join("pages".to_string())
        })
    }

    #[turbo_tasks::function]
    fn pages_transitions(self: Vc<Self>) -> Vc<TransitionsByName> {
        Vc::cell(
            [(
                "next-dynamic".to_string(),
                Vc::upcast(NextDynamicTransition::new(self.pages_client_transition())),
            )]
            .into_iter()
            .collect(),
        )
    }

    #[turbo_tasks::function]
    fn pages_client_transition(self: Vc<Self>) -> Vc<ContextTransition> {
        ContextTransition::new(
            self.client_compile_time_info(),
            self.pages_client_module_options_context(),
            self.pages_client_resolve_options_context(),
        )
    }

    #[turbo_tasks::function]
    async fn pages_client_module_options_context(
        self: Vc<Self>,
    ) -> Result<Vc<ModuleOptionsContext>> {
        let this = self.await?;
        Ok(get_client_module_options_context(
            self.project_path(),
            self.execution_context(),
            self.client_compile_time_info().environment(),
            Value::new(ClientContextType::Pages {
                pages_dir: self.pages_dir(),
            }),
            this.mode,
            self.next_config(),
        ))
    }

    #[turbo_tasks::function]
    async fn pages_client_resolve_options_context(
        self: Vc<Self>,
    ) -> Result<Vc<ResolveOptionsContext>> {
        let this = self.await?;
        Ok(get_client_resolve_options_context(
            self.project_path(),
            Value::new(ClientContextType::Pages {
                pages_dir: self.pages_dir(),
            }),
            this.mode,
            self.next_config(),
            self.execution_context(),
        ))
    }

    #[turbo_tasks::function]
    pub(super) fn pages_client_module_context(self: Vc<Self>) -> Vc<Box<dyn AssetContext>> {
        Vc::upcast(ModuleAssetContext::new(
            self.pages_transitions(),
            self.client_compile_time_info(),
            self.pages_client_module_options_context(),
            self.pages_client_resolve_options_context(),
        ))
    }

    #[turbo_tasks::function]
    pub(super) fn pages_ssr_module_context(self: Vc<Self>) -> Vc<Box<dyn AssetContext>> {
        Vc::upcast(ModuleAssetContext::new(
            self.pages_transitions(),
            self.server_compile_time_info(),
            self.pages_ssr_module_options_context(),
            self.pages_ssr_resolve_options_context(),
        ))
    }

    #[turbo_tasks::function]
    pub(super) fn pages_ssr_data_module_context(self: Vc<Self>) -> Vc<Box<dyn AssetContext>> {
        Vc::upcast(ModuleAssetContext::new(
            self.pages_transitions(),
            self.server_compile_time_info(),
            self.pages_ssr_data_module_options_context(),
            self.pages_ssr_resolve_options_context(),
        ))
    }

    #[turbo_tasks::function]
    async fn pages_ssr_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        let this = self.await?;
        Ok(get_server_module_options_context(
            self.project_path(),
            self.execution_context(),
            Value::new(ServerContextType::Pages {
                pages_dir: self.pages_dir(),
            }),
            this.mode,
            self.next_config(),
        ))
    }

    #[turbo_tasks::function]
    async fn pages_ssr_data_module_options_context(
        self: Vc<Self>,
    ) -> Result<Vc<ModuleOptionsContext>> {
        let this = self.await?;
        Ok(get_server_module_options_context(
            self.project_path(),
            self.execution_context(),
            Value::new(ServerContextType::PagesData {
                pages_dir: self.pages_dir(),
            }),
            this.mode,
            self.next_config(),
        ))
    }

    #[turbo_tasks::function]
    async fn pages_ssr_resolve_options_context(
        self: Vc<Self>,
    ) -> Result<Vc<ResolveOptionsContext>> {
        let this = self.await?;
        Ok(get_server_resolve_options_context(
            self.project_path(),
            Value::new(ServerContextType::Pages {
                pages_dir: self.pages_dir(),
            }),
            this.mode,
            self.next_config(),
            self.execution_context(),
        ))
    }

    #[turbo_tasks::function]
    pub(super) async fn pages_client_runtime_entries(
        self: Vc<Self>,
    ) -> Result<Vc<EvaluatableAssets>> {
        let this = self.await?;
        let client_runtime_entries = get_client_runtime_entries(
            self.project_path(),
            self.env(),
            Value::new(ClientContextType::Pages {
                pages_dir: self.pages_dir(),
            }),
            this.mode,
            self.next_config(),
            self.execution_context(),
        );
        Ok(client_runtime_entries.resolve_entries(self.pages_client_module_context()))
    }

    #[turbo_tasks::function]
    pub(super) async fn pages_ssr_runtime_entries(self: Vc<Self>) -> Result<Vc<EvaluatableAssets>> {
        let this = self.await?;
        let ssr_runtime_entries = get_server_runtime_entries(
            self.project_path(),
            self.env(),
            Value::new(ServerContextType::Pages {
                pages_dir: self.pages_dir(),
            }),
            this.mode,
            self.next_config(),
        );
        Ok(ssr_runtime_entries.resolve_entries(self.pages_ssr_module_context()))
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
    pub(super) fn server_chunking_context(self: Vc<Self>) -> Vc<BuildChunkingContext> {
        get_server_chunking_context(
            self.project_path(),
            self.node_root(),
            self.client_fs().root(),
            self.server_compile_time_info().environment(),
        )
    }

    #[turbo_tasks::function]
    pub(super) async fn ssr_chunking_context(self: Vc<Self>) -> Result<Vc<BuildChunkingContext>> {
        let ssr_chunking_context = self.server_chunking_context().with_layer("ssr".to_string());
        Vc::try_resolve_downcast_type::<BuildChunkingContext>(ssr_chunking_context)
            .await?
            .context("with_layer should not change the type of the chunking context")
    }

    #[turbo_tasks::function]
    pub(super) async fn ssr_data_chunking_context(
        self: Vc<Self>,
    ) -> Result<Vc<BuildChunkingContext>> {
        let ssr_chunking_context = self
            .server_chunking_context()
            .with_layer("ssr data".to_string());
        Vc::try_resolve_downcast_type::<BuildChunkingContext>(ssr_chunking_context)
            .await?
            .context("with_layer should not change the type of the chunking context")
    }

    #[turbo_tasks::function]
    pub(super) async fn rsc_chunking_context(self: Vc<Self>) -> Result<Vc<BuildChunkingContext>> {
        let rsc_chunking_context = self.server_chunking_context().with_layer("rsc".to_string());
        Vc::try_resolve_downcast_type::<BuildChunkingContext>(rsc_chunking_context)
            .await?
            .context("with_layer should not change the type of the chunking context")
    }

    /// Scans the app/pages directories for entry points files (matching the
    /// provided page_extensions).
    #[turbo_tasks::function]
    pub async fn entrypoints(self: Vc<Self>) -> Result<Vc<Entrypoints>> {
        let this = self.await?;
        let mut routes = IndexMap::new();
        if let Some(app_dir) = *find_app_dir(self.project_path()).await? {
            let app_entrypoints = get_entrypoints(app_dir, this.next_config.page_extensions());
            routes.extend(
                app_entrypoints
                    .await?
                    .iter()
                    .map(|(pathname, app_entrypoint)| async {
                        Ok((
                            pathname.clone(),
                            *app_entry_point_to_route(*app_entrypoint).await?,
                        ))
                    })
                    .try_join()
                    .await?,
            );
        }
        for (pathname, page_route) in get_pages_routes(self, self.pages_structure()).await?.iter() {
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
