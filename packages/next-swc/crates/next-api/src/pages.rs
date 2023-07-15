use anyhow::{bail, Context, Result};
use indexmap::IndexMap;
use next_core::{
    create_page_loader_entry_module, emit_all_assets, get_asset_path_from_pathname,
    pages_structure::{PagesDirectoryStructure, PagesStructure, PagesStructureItem},
};
use turbo_tasks::{Completion, Completions, Value, Vc};
use turbopack_binding::{
    turbo::tasks_fs::FileSystemPath,
    turbopack::{
        core::{
            asset::Asset,
            changed::{any_content_changed, any_content_changed_of_output_assets},
            chunk::{ChunkableModule, ChunkingContext},
            context::AssetContext,
            file_source::FileSource,
            output::{OutputAsset, OutputAssets},
            reference_type::{EntryReferenceSubType, ReferenceType},
            source::Source,
        },
        ecmascript::EcmascriptModuleAsset,
    },
};

use crate::{
    project::Project,
    route::{Endpoint, Route, Routes, WrittenEndpoint},
};

#[turbo_tasks::function]
pub async fn get_pages_routes(
    project: Vc<Project>,
    page_structure: Vc<PagesStructure>,
) -> Result<Vc<Routes>> {
    let PagesStructure { api, pages, .. } = *page_structure.await?;
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
        add_dir_to_routes(&mut routes, api, |pathname, original_name, path| {
            Route::PageApi {
                endpoint: Vc::upcast(ApiEndpoint::new(project, pathname, original_name, path)),
            }
        })
        .await?;
    }
    if let Some(page) = pages {
        add_dir_to_routes(&mut routes, page, |pathname, original_name, path| {
            Route::Page {
                html_endpoint: Vc::upcast(PageHtmlEndpoint::new(
                    project,
                    pathname,
                    original_name,
                    path,
                )),
                data_endpoint: Vc::upcast(PageDataEndpoint::new(
                    project,
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

#[turbo_tasks::value]
struct PageHtmlEndpoint {
    project: Vc<Project>,
    pathname: Vc<String>,
    original_name: Vc<String>,
    path: Vc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl PageHtmlEndpoint {
    #[turbo_tasks::function]
    fn new(
        project: Vc<Project>,
        pathname: Vc<String>,
        original_name: Vc<String>,
        path: Vc<FileSystemPath>,
    ) -> Vc<Self> {
        PageHtmlEndpoint {
            project,
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
            this.project.pages_client_module_context(),
            self.source(),
            this.pathname,
        );

        let Some(client_module) = Vc::try_resolve_downcast_type::<EcmascriptModuleAsset>(client_module).await?
        else {
            bail!("expected an ECMAScript module asset");
        };

        let client_chunking_context = this.project.client_chunking_context();

        let client_entry_chunk = client_module.as_root_chunk(client_chunking_context.into());

        let client_chunks = client_chunking_context.evaluated_chunk_group(
            client_entry_chunk,
            this.project
                .pages_client_runtime_entries()
                .with_entry(client_module.into()),
        );

        Ok(client_chunks)
    }

    #[turbo_tasks::function]
    async fn ssr_chunk(self: Vc<Self>) -> Result<Vc<Box<dyn OutputAsset>>> {
        let this = self.await?;
        let reference_type = Value::new(ReferenceType::Entry(EntryReferenceSubType::Page));

        let ssr_module = this
            .project
            .pages_ssr_module_context()
            .process(self.source(), reference_type.clone());

        let Some(ssr_module) = Vc::try_resolve_downcast_type::<EcmascriptModuleAsset>(ssr_module).await? else {
            bail!("expected an ECMAScript module asset");
        };

        let asset_path = get_asset_path_from_pathname(&this.pathname.await?, ".js");

        let ssr_entry_chunk_path_string = format!("server/pages{asset_path}");
        let ssr_entry_chunk_path = this.project.node_root().join(&ssr_entry_chunk_path_string);
        let ssr_entry_chunk = this.project.ssr_chunking_context().entry_chunk(
            ssr_entry_chunk_path,
            ssr_module.into(),
            this.project.pages_ssr_runtime_entries(),
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
            this.project.node_root(),
            this.project.client_root().join("_next"),
            this.project.node_root(),
        );
        let client_emit = emit_all_assets(
            self.client_chunks(),
            this.project.node_root(),
            this.project.client_root().join("_next"),
            this.project.node_root(),
        );

        ssr_emit.await?;
        client_emit.await?;

        Ok(WrittenEndpoint {
            server_entry_path: this
                .project
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
            any_content_changed(ssr_chunk.into()),
            any_content_changed_of_output_assets(self.client_chunks()),
        ])
    }
}

#[turbo_tasks::value]
struct PageDataEndpoint {
    project: Vc<Project>,
    pathname: Vc<String>,
    original_name: Vc<String>,
    path: Vc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl PageDataEndpoint {
    #[turbo_tasks::function]
    fn new(
        project: Vc<Project>,
        pathname: Vc<String>,
        original_name: Vc<String>,
        path: Vc<FileSystemPath>,
    ) -> Vc<Self> {
        PageDataEndpoint {
            project,
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
            .project
            .pages_ssr_data_module_context()
            .process(self.source(), reference_type.clone());

        let Some(ssr_data_module) = Vc::try_resolve_downcast_type::<EcmascriptModuleAsset>(ssr_data_module).await?
        else {
            bail!("expected an ECMAScript module asset");
        };

        let asset_path = get_asset_path_from_pathname(&this.pathname.await?, ".js");

        let ssr_data_entry_chunk_path_string = format!("server/pages-data/{asset_path}");
        let ssr_data_entry_chunk_path = this
            .project
            .node_root()
            .join(&ssr_data_entry_chunk_path_string);
        let ssr_data_entry_chunk = this.project.ssr_data_chunking_context().entry_chunk(
            ssr_data_entry_chunk_path,
            ssr_data_module.into(),
            this.project.pages_ssr_runtime_entries(),
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
            this.project.node_root(),
            this.project.client_root().join("_next"),
            this.project.node_root(),
        )
        .await?;

        Ok(WrittenEndpoint {
            server_entry_path: this
                .project
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
        Ok(any_content_changed(ssr_data_chunk.into()))
    }
}

#[turbo_tasks::value]
struct ApiEndpoint {
    project: Vc<Project>,
    pathname: Vc<String>,
    original_name: Vc<String>,
    path: Vc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl ApiEndpoint {
    #[turbo_tasks::function]
    fn new(
        project: Vc<Project>,
        pathname: Vc<String>,
        original_name: Vc<String>,
        path: Vc<FileSystemPath>,
    ) -> Vc<Self> {
        ApiEndpoint {
            project,
            pathname,
            original_name,
            path,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl Endpoint for ApiEndpoint {
    #[turbo_tasks::function]
    fn write_to_disk(&self) -> Vc<WrittenEndpoint> {
        todo!()
    }

    #[turbo_tasks::function]
    fn changed(&self) -> Vc<Completion> {
        todo!()
    }
}
