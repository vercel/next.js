use anyhow::{bail, Context, Result};
use indexmap::IndexMap;
use next_core::{
    create_page_loader_entry_module, emit_all_assets, get_asset_path_from_pathname,
    pages_structure::{
        PagesDirectoryStructure, PagesDirectoryStructureVc, PagesStructure, PagesStructureItem,
        PagesStructureVc,
    },
};
use turbo_tasks::{primitives::StringVc, CompletionVc, CompletionsVc, Value};
use turbopack_binding::{
    turbo::tasks_fs::FileSystemPathVc,
    turbopack::{
        core::{
            asset::{Asset, AssetVc, AssetsVc},
            changed::{any_content_changed, any_content_changed_of_assets},
            chunk::{ChunkableModule, ChunkingContext},
            context::AssetContext,
            file_source::FileSourceVc,
            reference_type::{EntryReferenceSubType, ReferenceType},
            source::SourceVc,
        },
        ecmascript::EcmascriptModuleAssetVc,
    },
};

use crate::{
    project::ProjectVc,
    route::{Endpoint, EndpointVc, Route, RoutesVc, WrittenEndpoint, WrittenEndpointVc},
};

#[turbo_tasks::function]
pub async fn get_pages_routes(
    project: ProjectVc,
    page_structure: PagesStructureVc,
) -> Result<RoutesVc> {
    let PagesStructure { api, pages, .. } = *page_structure.await?;
    let mut routes = IndexMap::new();
    async fn add_dir_to_routes(
        routes: &mut IndexMap<String, Route>,
        dir: PagesDirectoryStructureVc,
        make_route: impl Fn(StringVc, StringVc, FileSystemPathVc) -> Route,
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
                let pathname_vc = StringVc::cell(pathname.clone());
                let original_name = StringVc::cell(format!("/{}", original_path.await?.path));
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
                endpoint: ApiEndpointVc::new(project, pathname, original_name, path).into(),
            }
        })
        .await?;
    }
    if let Some(page) = pages {
        add_dir_to_routes(&mut routes, page, |pathname, original_name, path| {
            Route::Page {
                html_endpoint: PageHtmlEndpointVc::new(
                    project,
                    pathname.clone(),
                    original_name.clone(),
                    path,
                )
                .into(),
                data_endpoint: PageDataEndpointVc::new(project, pathname, original_name, path)
                    .into(),
            }
        })
        .await?;
    }
    Ok(RoutesVc::cell(routes))
}

#[turbo_tasks::value]
struct PageHtmlEndpoint {
    project: ProjectVc,
    pathname: StringVc,
    original_name: StringVc,
    path: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl PageHtmlEndpointVc {
    #[turbo_tasks::function]
    fn new(
        project: ProjectVc,
        pathname: StringVc,
        original_name: StringVc,
        path: FileSystemPathVc,
    ) -> Self {
        PageHtmlEndpoint {
            project,
            pathname,
            original_name,
            path,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn source(self) -> Result<SourceVc> {
        let this = self.await?;
        Ok(FileSourceVc::new(this.path).into())
    }

    #[turbo_tasks::function]
    async fn client_chunks(self) -> Result<AssetsVc> {
        let this = self.await?;

        let client_module = create_page_loader_entry_module(
            this.project.pages_client_module_context(),
            self.source(),
            this.pathname,
        );

        let Some(client_module) = EcmascriptModuleAssetVc::resolve_from(client_module).await?
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
    async fn ssr_chunk(self) -> Result<AssetVc> {
        let this = self.await?;
        let reference_type = Value::new(ReferenceType::Entry(EntryReferenceSubType::Page));

        let ssr_module = this
            .project
            .pages_ssr_module_context()
            .process(self.source(), reference_type.clone());

        let Some(ssr_module) = EcmascriptModuleAssetVc::resolve_from(ssr_module).await? else {
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
    async fn write_to_disk(self_vc: PageHtmlEndpointVc) -> Result<WrittenEndpointVc> {
        let this = self_vc.await?;
        let ssr_chunk = self_vc.ssr_chunk();
        let ssr_emit = emit_all_assets(
            AssetsVc::cell(vec![ssr_chunk]),
            this.project.node_root(),
            this.project.client_root().join("_next"),
            this.project.node_root(),
        );
        let client_emit = emit_all_assets(
            self_vc.client_chunks(),
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
    fn changed(self_vc: PageHtmlEndpointVc) -> CompletionVc {
        let ssr_chunk = self_vc.ssr_chunk();
        CompletionsVc::all(vec![
            any_content_changed(ssr_chunk),
            any_content_changed_of_assets(self_vc.client_chunks()),
        ])
    }
}

#[turbo_tasks::value]
struct PageDataEndpoint {
    project: ProjectVc,
    pathname: StringVc,
    original_name: StringVc,
    path: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl PageDataEndpointVc {
    #[turbo_tasks::function]
    fn new(
        project: ProjectVc,
        pathname: StringVc,
        original_name: StringVc,
        path: FileSystemPathVc,
    ) -> Self {
        PageDataEndpoint {
            project,
            pathname,
            original_name,
            path,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn ssr_data_chunk(self) -> Result<AssetVc> {
        let this = self.await?;
        let reference_type = Value::new(ReferenceType::Entry(EntryReferenceSubType::Page));

        let ssr_data_module = this
            .project
            .pages_ssr_data_module_context()
            .process(self.source(), reference_type.clone());

        let Some(ssr_data_module) = EcmascriptModuleAssetVc::resolve_from(ssr_data_module).await?
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
    async fn write_to_disk(self_vc: PageDataEndpointVc) -> Result<WrittenEndpointVc> {
        let this = self_vc.await?;
        let ssr_data_chunk = self_vc.ssr_data_chunk();
        emit_all_assets(
            AssetsVc::cell(vec![ssr_data_chunk]),
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
    async fn changed(self_vc: PageDataEndpointVc) -> Result<CompletionVc> {
        let ssr_data_chunk = self_vc.ssr_data_chunk();
        Ok(any_content_changed(ssr_data_chunk))
    }
}

#[turbo_tasks::value]
struct ApiEndpoint {
    project: ProjectVc,
    pathname: StringVc,
    original_name: StringVc,
    path: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl ApiEndpointVc {
    #[turbo_tasks::function]
    fn new(
        project: ProjectVc,
        pathname: StringVc,
        original_name: StringVc,
        path: FileSystemPathVc,
    ) -> Self {
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
    fn write_to_disk(&self) -> WrittenEndpointVc {
        todo!()
    }

    #[turbo_tasks::function]
    fn changed(&self) -> CompletionVc {
        todo!()
    }
}
