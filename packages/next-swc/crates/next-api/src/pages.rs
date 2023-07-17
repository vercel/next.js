use anyhow::{bail, Context, Result};
use indexmap::IndexMap;
use next_core::{
    create_page_loader_entry_module, emit_all_assets, get_asset_path_from_pathname,
    mode::NextMode,
    next_client::{
        get_client_module_options_context, get_client_resolve_options_context,
        get_client_runtime_entries, ClientContextType,
    },
    next_dynamic::NextDynamicTransition,
    next_server::{
        get_server_module_options_context, get_server_resolve_options_context,
        get_server_runtime_entries, ServerContextType,
    },
    pages_structure::{
        find_pages_structure, PagesDirectoryStructure, PagesStructure, PagesStructureItem,
    },
};
use turbo_tasks::{Completion, Completions, Value, Vc};
use turbopack_binding::{
    turbo::tasks_fs::{FileSystem, FileSystemPath, VirtualFileSystem},
    turbopack::{
        core::{
            asset::Asset,
            changed::{any_content_changed, any_content_changed_of_output_assets},
            chunk::{ChunkableModule, ChunkingContext, EvaluatableAssets},
            context::AssetContext,
            file_source::FileSource,
            output::{OutputAsset, OutputAssets},
            reference_type::{EntryReferenceSubType, ReferenceType},
            source::Source,
        },
        ecmascript::EcmascriptModuleAsset,
        turbopack::{
            module_options::ModuleOptionsContext,
            resolve_options_context::ResolveOptionsContext,
            transition::{ContextTransition, TransitionsByName},
            ModuleAssetContext,
        },
    },
};

use crate::{
    project::Project,
    route::{Endpoint, Route, Routes, WrittenEndpoint},
};

#[turbo_tasks::value]
pub struct PagesProject {
    project: Vc<Project>,
    mode: NextMode,
}

#[turbo_tasks::value_impl]
impl PagesProject {
    #[turbo_tasks::function]
    pub async fn new(project: Vc<Project>, mode: NextMode) -> Result<Vc<Self>> {
        Ok(PagesProject { project, mode }.cell())
    }

    #[turbo_tasks::function]
    pub async fn routes(self: Vc<Self>) -> Result<Vc<Routes>> {
        let PagesStructure { api, pages, .. } = &*self.pages_structure().await?;
        let mut routes = IndexMap::new();
        async fn add_dir_to_routes(
            routes: &mut IndexMap<String, Route>,
            dir: Vc<PagesDirectoryStructure>,
            make_route: impl Fn(Vc<String>, Vc<String>, Vc<FileSystemPath>) -> Route,
        ) -> Result<()> {
            let mut queue = vec![dir];
            while let Some(dir) = queue.pop() {
                let PagesDirectoryStructure {
                    ref items,
                    ref children,
                    next_router_path: _,
                    project_path: _,
                } = *dir.await?;
                for &item in items.iter() {
                    let PagesStructureItem {
                        next_router_path,
                        project_path,
                        original_path,
                    } = *item.await?;
                    let pathname = format!("/{}", next_router_path.await?.path);
                    let pathname_vc = Vc::cell(pathname.clone());
                    let original_name = Vc::cell(format!("/{}", original_path.await?.path));
                    let route = make_route(pathname_vc, original_name, project_path);
                    routes.insert(pathname, route);
                }
                for &child in children.iter() {
                    queue.push(child);
                }
            }
            Ok(())
        }
        if let Some(api) = api {
            add_dir_to_routes(&mut routes, *api, |pathname, original_name, path| {
                Route::PageApi {
                    endpoint: Vc::upcast(PageApiEndpoint::new(self, pathname, original_name, path)),
                }
            })
            .await?;
        }
        if let Some(page) = pages {
            add_dir_to_routes(&mut routes, *page, |pathname, original_name, path| {
                Route::Page {
                    html_endpoint: Vc::upcast(PageHtmlEndpoint::new(
                        self,
                        pathname,
                        original_name,
                        path,
                    )),
                    data_endpoint: Vc::upcast(PageDataEndpoint::new(
                        self,
                        pathname,
                        original_name,
                        path,
                    )),
                }
            })
            .await?;
        }
        Ok(Vc::cell(routes))
    }

    #[turbo_tasks::function]
    fn project(&self) -> Vc<Project> {
        self.project
    }

    #[turbo_tasks::function]
    fn pages_structure(&self) -> Vc<PagesStructure> {
        let next_router_fs = Vc::upcast::<Box<dyn FileSystem>>(VirtualFileSystem::new());
        let next_router_root = next_router_fs.root();
        find_pages_structure(
            self.project.project_path(),
            next_router_root,
            self.project.next_config().page_extensions(),
        )
    }

    #[turbo_tasks::function]
    async fn pages_dir(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        Ok(if let Some(pages) = self.pages_structure().await?.pages {
            pages.project_path()
        } else {
            self.project().project_path().join("pages".to_string())
        })
    }

    #[turbo_tasks::function]
    fn transitions(self: Vc<Self>) -> Vc<TransitionsByName> {
        Vc::cell(
            [(
                "next-dynamic".to_string(),
                Vc::upcast(NextDynamicTransition::new(self.client_transition())),
            )]
            .into_iter()
            .collect(),
        )
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
    async fn client_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        let this = self.await?;
        Ok(get_client_module_options_context(
            self.project().project_path(),
            self.project().execution_context(),
            self.project().client_compile_time_info().environment(),
            Value::new(ClientContextType::Pages {
                pages_dir: self.pages_dir(),
            }),
            this.mode,
            self.project().next_config(),
        ))
    }

    #[turbo_tasks::function]
    async fn client_resolve_options_context(self: Vc<Self>) -> Result<Vc<ResolveOptionsContext>> {
        let this = self.await?;
        Ok(get_client_resolve_options_context(
            self.project().project_path(),
            Value::new(ClientContextType::Pages {
                pages_dir: self.pages_dir(),
            }),
            this.mode,
            self.project().next_config(),
            self.project().execution_context(),
        ))
    }

    #[turbo_tasks::function]
    pub(super) fn client_module_context(self: Vc<Self>) -> Vc<Box<dyn AssetContext>> {
        Vc::upcast(ModuleAssetContext::new(
            self.transitions(),
            self.project().client_compile_time_info(),
            self.client_module_options_context(),
            self.client_resolve_options_context(),
        ))
    }

    #[turbo_tasks::function]
    pub(super) fn ssr_module_context(self: Vc<Self>) -> Vc<Box<dyn AssetContext>> {
        Vc::upcast(ModuleAssetContext::new(
            self.transitions(),
            self.project().server_compile_time_info(),
            self.ssr_module_options_context(),
            self.ssr_resolve_options_context(),
        ))
    }

    #[turbo_tasks::function]
    pub(super) fn ssr_data_module_context(self: Vc<Self>) -> Vc<Box<dyn AssetContext>> {
        Vc::upcast(ModuleAssetContext::new(
            self.transitions(),
            self.project().server_compile_time_info(),
            self.ssr_data_module_options_context(),
            self.ssr_resolve_options_context(),
        ))
    }

    #[turbo_tasks::function]
    async fn ssr_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        let this = self.await?;
        Ok(get_server_module_options_context(
            self.project().project_path(),
            self.project().execution_context(),
            Value::new(ServerContextType::Pages {
                pages_dir: self.pages_dir(),
            }),
            this.mode,
            self.project().next_config(),
        ))
    }

    #[turbo_tasks::function]
    async fn ssr_data_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        let this = self.await?;
        Ok(get_server_module_options_context(
            self.project().project_path(),
            self.project().execution_context(),
            Value::new(ServerContextType::PagesData {
                pages_dir: self.pages_dir(),
            }),
            this.mode,
            self.project().next_config(),
        ))
    }

    #[turbo_tasks::function]
    async fn ssr_resolve_options_context(self: Vc<Self>) -> Result<Vc<ResolveOptionsContext>> {
        let this = self.await?;
        Ok(get_server_resolve_options_context(
            self.project().project_path(),
            Value::new(ServerContextType::Pages {
                pages_dir: self.pages_dir(),
            }),
            this.mode,
            self.project().next_config(),
            self.project().execution_context(),
        ))
    }

    #[turbo_tasks::function]
    async fn client_runtime_entries(self: Vc<Self>) -> Result<Vc<EvaluatableAssets>> {
        let this = self.await?;
        let client_runtime_entries = get_client_runtime_entries(
            self.project().project_path(),
            self.project().env(),
            Value::new(ClientContextType::Pages {
                pages_dir: self.pages_dir(),
            }),
            this.mode,
            self.project().next_config(),
            self.project().execution_context(),
        );
        Ok(client_runtime_entries.resolve_entries(self.client_module_context()))
    }

    #[turbo_tasks::function]
    async fn ssr_runtime_entries(self: Vc<Self>) -> Result<Vc<EvaluatableAssets>> {
        let this = self.await?;
        let ssr_runtime_entries = get_server_runtime_entries(
            self.project().project_path(),
            self.project().env(),
            Value::new(ServerContextType::Pages {
                pages_dir: self.pages_dir(),
            }),
            this.mode,
            self.project().next_config(),
        );
        Ok(ssr_runtime_entries.resolve_entries(self.ssr_module_context()))
    }
}

#[turbo_tasks::value]
struct PageHtmlEndpoint {
    pages_project: Vc<PagesProject>,
    pathname: Vc<String>,
    original_name: Vc<String>,
    path: Vc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl PageHtmlEndpoint {
    #[turbo_tasks::function]
    fn new(
        pages_project: Vc<PagesProject>,
        pathname: Vc<String>,
        original_name: Vc<String>,
        path: Vc<FileSystemPath>,
    ) -> Vc<Self> {
        PageHtmlEndpoint {
            pages_project,
            pathname,
            original_name,
            path,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn source(self: Vc<Self>) -> Result<Vc<Box<dyn Source>>> {
        let this = self.await?;
        Ok(Vc::upcast(FileSource::new(this.path)))
    }

    #[turbo_tasks::function]
    async fn client_chunks(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;

        let client_module = create_page_loader_entry_module(
            this.pages_project.client_module_context(),
            self.source(),
            this.pathname,
        );

        let Some(client_module) =
            Vc::try_resolve_downcast_type::<EcmascriptModuleAsset>(client_module).await?
        else {
            bail!("expected an ECMAScript module asset");
        };

        let client_chunking_context = this.pages_project.project().client_chunking_context();

        let client_entry_chunk = client_module.as_root_chunk(Vc::upcast(client_chunking_context));

        let client_chunks = client_chunking_context.evaluated_chunk_group(
            client_entry_chunk,
            this.pages_project
                .client_runtime_entries()
                .with_entry(Vc::upcast(client_module)),
        );

        Ok(client_chunks)
    }

    #[turbo_tasks::function]
    async fn ssr_chunk(self: Vc<Self>) -> Result<Vc<Box<dyn OutputAsset>>> {
        let this = self.await?;
        let reference_type = Value::new(ReferenceType::Entry(EntryReferenceSubType::Page));

        let ssr_module = this
            .pages_project
            .ssr_module_context()
            .process(self.source(), reference_type.clone());

        let Some(ssr_module) =
            Vc::try_resolve_downcast_type::<EcmascriptModuleAsset>(ssr_module).await?
        else {
            bail!("expected an ECMAScript module asset");
        };

        let asset_path = get_asset_path_from_pathname(&this.pathname.await?, ".js");

        let ssr_entry_chunk_path_string = format!("server/pages{asset_path}");
        let ssr_entry_chunk_path = this
            .pages_project
            .project()
            .node_root()
            .join(ssr_entry_chunk_path_string);
        let ssr_entry_chunk = this
            .pages_project
            .project()
            .ssr_chunking_context()
            .entry_chunk(
                ssr_entry_chunk_path,
                Vc::upcast(ssr_module),
                this.pages_project.ssr_runtime_entries(),
            );

        Ok(ssr_entry_chunk)
    }
}

#[turbo_tasks::value_impl]
impl Endpoint for PageHtmlEndpoint {
    #[turbo_tasks::function]
    async fn write_to_disk(self: Vc<Self>) -> Result<Vc<WrittenEndpoint>> {
        let this = self.await?;
        let ssr_chunk = self.ssr_chunk();
        let ssr_emit = emit_all_assets(
            Vc::cell(vec![ssr_chunk]),
            this.pages_project.project().node_root(),
            this.pages_project.project().client_relative_path(),
            this.pages_project.project().node_root(),
        );
        let client_emit = emit_all_assets(
            self.client_chunks(),
            this.pages_project.project().node_root(),
            this.pages_project.project().client_relative_path(),
            this.pages_project.project().node_root(),
        );

        ssr_emit.await?;
        client_emit.await?;

        Ok(WrittenEndpoint {
            server_entry_path: this
                .pages_project
                .project()
                .node_root()
                .await?
                .get_path_to(&*ssr_chunk.ident().path().await?)
                .context("ssr chunk entry path must be inside the node root")?
                .to_string(),
            server_paths: vec![],
        }
        .cell())
    }

    #[turbo_tasks::function]
    fn changed(self: Vc<Self>) -> Vc<Completion> {
        let ssr_chunk = self.ssr_chunk();
        Completions::all(vec![
            any_content_changed(Vc::upcast(ssr_chunk)),
            any_content_changed_of_output_assets(self.client_chunks()),
        ])
    }
}

#[turbo_tasks::value]
struct PageDataEndpoint {
    pages_project: Vc<PagesProject>,
    pathname: Vc<String>,
    original_name: Vc<String>,
    path: Vc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl PageDataEndpoint {
    #[turbo_tasks::function]
    fn new(
        pages_project: Vc<PagesProject>,
        pathname: Vc<String>,
        original_name: Vc<String>,
        path: Vc<FileSystemPath>,
    ) -> Vc<Self> {
        PageDataEndpoint {
            pages_project,
            pathname,
            original_name,
            path,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn source(self: Vc<Self>) -> Result<Vc<Box<dyn Source>>> {
        let this = self.await?;
        Ok(Vc::upcast(FileSource::new(this.path)))
    }

    #[turbo_tasks::function]
    async fn ssr_data_chunk(self: Vc<Self>) -> Result<Vc<Box<dyn OutputAsset>>> {
        let this = self.await?;
        let reference_type = Value::new(ReferenceType::Entry(EntryReferenceSubType::Page));

        let ssr_data_module = this
            .pages_project
            .ssr_data_module_context()
            .process(self.source(), reference_type.clone());

        let Some(ssr_data_module) =
            Vc::try_resolve_downcast_type::<EcmascriptModuleAsset>(ssr_data_module).await?
        else {
            bail!("expected an ECMAScript module asset");
        };

        let asset_path = get_asset_path_from_pathname(&this.pathname.await?, ".js");

        let ssr_data_entry_chunk_path_string = format!("server/pages-data/{asset_path}");
        let ssr_data_entry_chunk_path = this
            .pages_project
            .project()
            .node_root()
            .join(ssr_data_entry_chunk_path_string);
        let ssr_data_entry_chunk = this
            .pages_project
            .project()
            .ssr_data_chunking_context()
            .entry_chunk(
                ssr_data_entry_chunk_path,
                Vc::upcast(ssr_data_module),
                this.pages_project.ssr_runtime_entries(),
            );

        Ok(ssr_data_entry_chunk)
    }
}

#[turbo_tasks::value_impl]
impl Endpoint for PageDataEndpoint {
    #[turbo_tasks::function]
    async fn write_to_disk(self: Vc<Self>) -> Result<Vc<WrittenEndpoint>> {
        let this = self.await?;
        let ssr_data_chunk = self.ssr_data_chunk();
        emit_all_assets(
            Vc::cell(vec![ssr_data_chunk]),
            this.pages_project.project().node_root(),
            this.pages_project.project().client_relative_path(),
            this.pages_project.project().node_root(),
        )
        .await?;

        Ok(WrittenEndpoint {
            server_entry_path: this
                .pages_project
                .project()
                .node_root()
                .await?
                .get_path_to(&*ssr_data_chunk.ident().path().await?)
                .context("ssr data chunk entry path must be inside the node root")?
                .to_string(),
            server_paths: vec![],
        }
        .cell())
    }

    #[turbo_tasks::function]
    async fn changed(self: Vc<Self>) -> Result<Vc<Completion>> {
        let ssr_data_chunk = self.ssr_data_chunk();
        Ok(any_content_changed(Vc::upcast(ssr_data_chunk)))
    }
}

#[turbo_tasks::value]
struct PageApiEndpoint {
    pages_project: Vc<PagesProject>,
    pathname: Vc<String>,
    original_name: Vc<String>,
    path: Vc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl PageApiEndpoint {
    #[turbo_tasks::function]
    fn new(
        pages_project: Vc<PagesProject>,
        pathname: Vc<String>,
        original_name: Vc<String>,
        path: Vc<FileSystemPath>,
    ) -> Vc<Self> {
        PageApiEndpoint {
            pages_project,
            pathname,
            original_name,
            path,
        }
        .cell()
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<Box<dyn Source>> {
        Vc::upcast(FileSource::new(self.path))
    }

    #[turbo_tasks::function]
    async fn api_chunk(self: Vc<Self>) -> Result<Vc<Box<dyn OutputAsset>>> {
        let this = self.await?;
        let reference_type = Value::new(ReferenceType::Entry(EntryReferenceSubType::PagesApi));

        let api_module = this
            .pages_project
            .ssr_module_context()
            .process(self.source(), reference_type.clone());

        let Some(api_module) =
            Vc::try_resolve_downcast_type::<EcmascriptModuleAsset>(api_module).await?
        else {
            bail!("expected an ECMAScript module asset");
        };

        let asset_path = get_asset_path_from_pathname(&this.pathname.await?, ".js");

        let api_entry_chunk_path_string = format!("server/pages/{asset_path}");
        let api_entry_chunk_path = this
            .pages_project
            .project()
            .node_root()
            .join(api_entry_chunk_path_string);
        let api_entry_chunk = this
            .pages_project
            .project()
            .ssr_chunking_context()
            .entry_chunk(
                api_entry_chunk_path,
                Vc::upcast(api_module),
                this.pages_project.ssr_runtime_entries(),
            );

        Ok(api_entry_chunk)
    }
}

#[turbo_tasks::value_impl]
impl Endpoint for PageApiEndpoint {
    #[turbo_tasks::function]
    async fn write_to_disk(self: Vc<Self>) -> Result<Vc<WrittenEndpoint>> {
        let this = self.await?;
        let api_chunk = self.api_chunk();
        emit_all_assets(
            Vc::cell(vec![api_chunk]),
            this.pages_project.project().node_root(),
            this.pages_project.project().client_relative_path(),
            this.pages_project.project().node_root(),
        )
        .await?;

        Ok(WrittenEndpoint {
            server_entry_path: this
                .pages_project
                .project()
                .node_root()
                .await?
                .get_path_to(&*api_chunk.ident().path().await?)
                .context("API chunk entry path must be inside the node root")?
                .to_string(),
            server_paths: vec![],
        }
        .cell())
    }

    #[turbo_tasks::function]
    fn changed(self: Vc<Self>) -> Vc<Completion> {
        let api_chunk = self.api_chunk();
        any_content_changed(Vc::upcast(api_chunk))
    }
}
