use std::future::IntoFuture;

use anyhow::{bail, Context, Result};
use next_core::{
    all_assets_from_entries, create_page_loader_entry_module, get_asset_path_from_pathname,
    get_edge_resolve_options_context,
    hmr_entry::HmrEntryModule,
    mode::NextMode,
    next_client::{
        get_client_module_options_context, get_client_resolve_options_context,
        get_client_runtime_entries, ClientContextType, RuntimeEntries,
    },
    next_dynamic::NextDynamicTransition,
    next_edge::route_regex::get_named_middleware_regex,
    next_manifests::{
        BuildManifest, EdgeFunctionDefinition, MiddlewareMatcher, MiddlewaresManifestV2,
        PagesManifest,
    },
    next_pages::create_page_ssr_entry_module,
    next_server::{
        get_server_module_options_context, get_server_resolve_options_context,
        get_server_runtime_entries, ServerContextType,
    },
    pages_structure::{
        find_pages_structure, PagesDirectoryStructure, PagesStructure, PagesStructureItem,
    },
    util::{get_asset_prefix_from_pathname, parse_config_from_source, NextRuntime},
    PageLoaderAsset,
};
use serde::{Deserialize, Serialize};
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    fxindexmap, trace::TraceRawVcs, Completion, FxIndexMap, ResolvedVc, TaskInput, Value, Vc,
};
use turbo_tasks_fs::{
    self, File, FileContent, FileSystem, FileSystemPath, FileSystemPathOption, VirtualFileSystem,
};
use turbopack::{
    module_options::ModuleOptionsContext,
    resolve_options_context::ResolveOptionsContext,
    transition::{ContextTransition, TransitionOptions},
    ModuleAssetContext,
};
use turbopack_core::{
    asset::AssetContent,
    chunk::{
        availability_info::AvailabilityInfo, ChunkingContext, ChunkingContextExt,
        EntryChunkGroupResult, EvaluatableAsset, EvaluatableAssets,
    },
    context::AssetContext,
    file_source::FileSource,
    ident::AssetIdent,
    module::{Module, Modules},
    output::{OptionOutputAsset, OutputAsset, OutputAssets},
    reference_type::{EcmaScriptModulesReferenceSubType, EntryReferenceSubType, ReferenceType},
    resolve::{origin::PlainResolveOrigin, parse::Request, pattern::Pattern},
    source::Source,
    virtual_output::VirtualOutputAsset,
};
use turbopack_ecmascript::resolve::esm_resolve;
use turbopack_nodejs::NodeJsChunkingContext;

use crate::{
    dynamic_imports::{
        collect_chunk_group, collect_evaluated_chunk_group, collect_next_dynamic_imports,
        DynamicImportedChunks, VisitedDynamicImportModules,
    },
    font::create_font_manifest,
    loadable_manifest::create_react_loadable_manifest,
    nft_json::NftJsonAsset,
    paths::{
        all_paths_in_root, all_server_paths, get_asset_paths_from_root, get_js_paths_from_root,
        get_wasm_paths_from_root, paths_to_bindings, wasm_paths_to_bindings,
    },
    project::Project,
    route::{Endpoint, Route, Routes, WrittenEndpoint},
    webpack_stats::generate_webpack_stats,
};

#[turbo_tasks::value]
pub struct PagesProject {
    project: Vc<Project>,
}

#[turbo_tasks::value_impl]
impl PagesProject {
    #[turbo_tasks::function]
    pub fn new(project: Vc<Project>) -> Vc<Self> {
        PagesProject { project }.cell()
    }

    #[turbo_tasks::function]
    pub async fn routes(self: Vc<Self>) -> Result<Vc<Routes>> {
        let pages_structure = self.pages_structure();
        let PagesStructure {
            api,
            pages,
            app: _,
            document: _,
            error: _,
        } = &*pages_structure.await?;
        let mut routes = FxIndexMap::default();

        async fn add_page_to_routes(
            routes: &mut FxIndexMap<RcStr, Route>,
            page: Vc<PagesStructureItem>,
            make_route: impl Fn(Vc<RcStr>, Vc<RcStr>, Vc<PagesStructureItem>) -> Route,
        ) -> Result<()> {
            let PagesStructureItem {
                next_router_path,
                original_path,
                ..
            } = *page.await?;
            let pathname: RcStr = format!("/{}", next_router_path.await?.path).into();
            let pathname_vc = Vc::cell(pathname.clone());
            let original_name = Vc::cell(format!("/{}", original_path.await?.path).into());
            let route = make_route(pathname_vc, original_name, page);
            routes.insert(pathname, route);
            Ok(())
        }

        async fn add_dir_to_routes(
            routes: &mut FxIndexMap<RcStr, Route>,
            dir: Vc<PagesDirectoryStructure>,
            make_route: impl Fn(Vc<RcStr>, Vc<RcStr>, Vc<PagesStructureItem>) -> Route,
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
                    add_page_to_routes(routes, item, &make_route).await?;
                }
                for &child in children.iter() {
                    queue.push(child);
                }
            }
            Ok(())
        }

        if let Some(api) = *api {
            add_dir_to_routes(&mut routes, *api, |pathname, original_name, page| {
                Route::PageApi {
                    endpoint: Vc::upcast(PageEndpoint::new(
                        PageEndpointType::Api,
                        self,
                        pathname,
                        original_name,
                        page,
                        pages_structure,
                    )),
                }
            })
            .await?;
        }

        let make_page_route = |pathname, original_name, page| Route::Page {
            html_endpoint: Vc::upcast(PageEndpoint::new(
                PageEndpointType::Html,
                self,
                pathname,
                original_name,
                page,
                pages_structure,
            )),
            data_endpoint: Vc::upcast(PageEndpoint::new(
                PageEndpointType::Data,
                self,
                pathname,
                original_name,
                page,
                pages_structure,
            )),
        };

        if let Some(pages) = *pages {
            add_dir_to_routes(&mut routes, *pages, make_page_route).await?;
        }

        for route in routes.values_mut() {
            route.resolve().await?;
        }

        Ok(Vc::cell(routes))
    }

    #[turbo_tasks::function]
    async fn to_endpoint(
        self: Vc<Self>,
        item: Vc<PagesStructureItem>,
        ty: PageEndpointType,
    ) -> Result<Vc<Box<dyn Endpoint>>> {
        let PagesStructureItem {
            next_router_path,
            original_path,
            ..
        } = *item.await?;
        let pathname: RcStr = format!("/{}", next_router_path.await?.path).into();
        let pathname_vc = Vc::cell(pathname.clone());
        let original_name = Vc::cell(format!("/{}", original_path.await?.path).into());
        let endpoint = Vc::upcast(PageEndpoint::new(
            ty,
            self,
            pathname_vc,
            original_name,
            item,
            self.pages_structure(),
        ));
        Ok(endpoint)
    }

    #[turbo_tasks::function]
    pub async fn document_endpoint(self: Vc<Self>) -> Result<Vc<Box<dyn Endpoint>>> {
        Ok(self.to_endpoint(
            self.pages_structure().await?.document,
            PageEndpointType::SsrOnly,
        ))
    }

    #[turbo_tasks::function]
    pub async fn app_endpoint(self: Vc<Self>) -> Result<Vc<Box<dyn Endpoint>>> {
        Ok(self.to_endpoint(self.pages_structure().await?.app, PageEndpointType::Html))
    }

    #[turbo_tasks::function]
    pub async fn error_endpoint(self: Vc<Self>) -> Result<Vc<Box<dyn Endpoint>>> {
        Ok(self.to_endpoint(self.pages_structure().await?.error, PageEndpointType::Html))
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
            self.project().project_path().join("pages".into())
        })
    }

    #[turbo_tasks::function]
    async fn transitions(self: Vc<Self>) -> Result<Vc<TransitionOptions>> {
        Ok(TransitionOptions {
            named_transitions: [(
                "next-dynamic".into(),
                ResolvedVc::upcast(
                    NextDynamicTransition::new(Vc::upcast(self.client_transition()))
                        .to_resolved()
                        .await?,
                ),
            )]
            .into_iter()
            .collect(),
            ..Default::default()
        }
        .cell())
    }

    #[turbo_tasks::function]
    fn client_transition(self: Vc<Self>) -> Vc<ContextTransition> {
        ContextTransition::new(
            self.project().client_compile_time_info(),
            self.client_module_options_context(),
            self.client_resolve_options_context(),
            Vc::cell("client".into()),
        )
    }

    #[turbo_tasks::function]
    async fn client_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        Ok(get_client_module_options_context(
            self.project().project_path(),
            self.project().execution_context(),
            self.project().client_compile_time_info().environment(),
            Value::new(ClientContextType::Pages {
                pages_dir: self.pages_dir().to_resolved().await?,
            }),
            self.project().next_mode(),
            self.project().next_config(),
        ))
    }

    #[turbo_tasks::function]
    async fn client_resolve_options_context(self: Vc<Self>) -> Result<Vc<ResolveOptionsContext>> {
        Ok(get_client_resolve_options_context(
            self.project().project_path(),
            Value::new(ClientContextType::Pages {
                pages_dir: self.pages_dir().to_resolved().await?,
            }),
            self.project().next_mode(),
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
            Vc::cell("client".into()),
        ))
    }

    #[turbo_tasks::function]
    pub(super) fn ssr_module_context(self: Vc<Self>) -> Vc<ModuleAssetContext> {
        ModuleAssetContext::new(
            self.transitions(),
            self.project().server_compile_time_info(),
            self.ssr_module_options_context(),
            self.ssr_resolve_options_context(),
            Vc::cell("ssr".into()),
        )
    }

    /// Returns a context specific to pages/api.
    /// This mimics the current configuration in [next-dev](https://github.com/vercel/next.js/blob/9b4b0847ed4a1025e73bec16a9ee11766e632e14/packages/next/src/build/webpack-config.ts#L1381-L1385)
    #[turbo_tasks::function]
    pub(super) fn api_module_context(self: Vc<Self>) -> Vc<ModuleAssetContext> {
        ModuleAssetContext::new(
            self.transitions(),
            self.project().server_compile_time_info(),
            self.api_module_options_context(),
            self.ssr_resolve_options_context(),
            Vc::cell("api".into()),
        )
    }

    #[turbo_tasks::function]
    pub(super) fn ssr_data_module_context(self: Vc<Self>) -> Vc<ModuleAssetContext> {
        ModuleAssetContext::new(
            self.transitions(),
            self.project().server_compile_time_info(),
            self.ssr_data_module_options_context(),
            self.ssr_resolve_options_context(),
            Vc::cell("ssr-data".into()),
        )
    }

    #[turbo_tasks::function]
    pub(super) fn edge_ssr_module_context(self: Vc<Self>) -> Vc<ModuleAssetContext> {
        ModuleAssetContext::new(
            Default::default(),
            self.project().edge_compile_time_info(),
            self.edge_ssr_module_options_context(),
            self.edge_ssr_resolve_options_context(),
            Vc::cell("edge-ssr".into()),
        )
    }

    #[turbo_tasks::function]
    pub(super) fn edge_api_module_context(self: Vc<Self>) -> Vc<ModuleAssetContext> {
        ModuleAssetContext::new(
            Default::default(),
            self.project().edge_compile_time_info(),
            self.edge_api_module_options_context(),
            self.edge_ssr_resolve_options_context(),
            Vc::cell("edge-api".into()),
        )
    }

    #[turbo_tasks::function]
    pub(super) fn edge_ssr_data_module_context(self: Vc<Self>) -> Vc<ModuleAssetContext> {
        ModuleAssetContext::new(
            Default::default(),
            self.project().edge_compile_time_info(),
            self.edge_ssr_data_module_options_context(),
            self.edge_ssr_resolve_options_context(),
            Vc::cell("edge-ssr-data".into()),
        )
    }

    #[turbo_tasks::function]
    async fn ssr_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        Ok(get_server_module_options_context(
            self.project().project_path(),
            self.project().execution_context(),
            Value::new(ServerContextType::Pages {
                pages_dir: self.pages_dir().to_resolved().await?,
            }),
            self.project().next_mode(),
            self.project().next_config(),
            NextRuntime::NodeJs,
        ))
    }

    #[turbo_tasks::function]
    async fn edge_ssr_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        Ok(get_server_module_options_context(
            self.project().project_path(),
            self.project().execution_context(),
            Value::new(ServerContextType::Pages {
                pages_dir: self.pages_dir().to_resolved().await?,
            }),
            self.project().next_mode(),
            self.project().next_config(),
            NextRuntime::Edge,
        ))
    }

    #[turbo_tasks::function]
    async fn api_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        Ok(get_server_module_options_context(
            self.project().project_path(),
            self.project().execution_context(),
            Value::new(ServerContextType::PagesApi {
                pages_dir: self.pages_dir().to_resolved().await?,
            }),
            self.project().next_mode(),
            self.project().next_config(),
            NextRuntime::NodeJs,
        ))
    }

    #[turbo_tasks::function]
    async fn edge_api_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        Ok(get_server_module_options_context(
            self.project().project_path(),
            self.project().execution_context(),
            Value::new(ServerContextType::PagesApi {
                pages_dir: self.pages_dir().to_resolved().await?,
            }),
            self.project().next_mode(),
            self.project().next_config(),
            NextRuntime::Edge,
        ))
    }

    #[turbo_tasks::function]
    async fn ssr_data_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        Ok(get_server_module_options_context(
            self.project().project_path(),
            self.project().execution_context(),
            Value::new(ServerContextType::PagesData {
                pages_dir: self.pages_dir().to_resolved().await?,
            }),
            self.project().next_mode(),
            self.project().next_config(),
            NextRuntime::NodeJs,
        ))
    }

    #[turbo_tasks::function]
    async fn edge_ssr_data_module_options_context(
        self: Vc<Self>,
    ) -> Result<Vc<ModuleOptionsContext>> {
        Ok(get_server_module_options_context(
            self.project().project_path(),
            self.project().execution_context(),
            Value::new(ServerContextType::PagesData {
                pages_dir: self.pages_dir().to_resolved().await?,
            }),
            self.project().next_mode(),
            self.project().next_config(),
            NextRuntime::Edge,
        ))
    }

    #[turbo_tasks::function]
    async fn ssr_resolve_options_context(self: Vc<Self>) -> Result<Vc<ResolveOptionsContext>> {
        Ok(get_server_resolve_options_context(
            self.project().project_path(),
            // NOTE(alexkirsz) This could be `PagesData` for the data endpoint, but it doesn't
            // matter (for now at least) because `get_server_resolve_options_context` doesn't
            // differentiate between the two.
            Value::new(ServerContextType::Pages {
                pages_dir: self.pages_dir().to_resolved().await?,
            }),
            self.project().next_mode(),
            self.project().next_config(),
            self.project().execution_context(),
        ))
    }

    #[turbo_tasks::function]
    async fn edge_ssr_resolve_options_context(self: Vc<Self>) -> Result<Vc<ResolveOptionsContext>> {
        Ok(get_edge_resolve_options_context(
            self.project().project_path(),
            // NOTE(alexkirsz) This could be `PagesData` for the data endpoint, but it doesn't
            // matter (for now at least) because `get_server_resolve_options_context` doesn't
            // differentiate between the two.
            Value::new(ServerContextType::Pages {
                pages_dir: self.pages_dir().to_resolved().await?,
            }),
            self.project().next_mode(),
            self.project().next_config(),
            self.project().execution_context(),
        ))
    }

    #[turbo_tasks::function]
    async fn client_runtime_entries(self: Vc<Self>) -> Result<Vc<EvaluatableAssets>> {
        let client_runtime_entries = get_client_runtime_entries(
            self.project().project_path(),
            Value::new(ClientContextType::Pages {
                pages_dir: self.pages_dir().to_resolved().await?,
            }),
            self.project().next_mode(),
            self.project().next_config(),
            self.project().execution_context(),
        );
        Ok(client_runtime_entries.resolve_entries(self.client_module_context()))
    }

    #[turbo_tasks::function]
    async fn runtime_entries(self: Vc<Self>) -> Result<Vc<RuntimeEntries>> {
        Ok(get_server_runtime_entries(
            Value::new(ServerContextType::Pages {
                pages_dir: self.pages_dir().to_resolved().await?,
            }),
            self.project().next_mode(),
        ))
    }

    #[turbo_tasks::function]
    async fn data_runtime_entries(self: Vc<Self>) -> Result<Vc<RuntimeEntries>> {
        Ok(get_server_runtime_entries(
            Value::new(ServerContextType::PagesData {
                pages_dir: self.pages_dir().to_resolved().await?,
            }),
            self.project().next_mode(),
        ))
    }

    #[turbo_tasks::function]
    fn ssr_runtime_entries(self: Vc<Self>) -> Vc<EvaluatableAssets> {
        let ssr_runtime_entries = self.runtime_entries();
        ssr_runtime_entries.resolve_entries(Vc::upcast(self.ssr_module_context()))
    }

    #[turbo_tasks::function]
    fn ssr_data_runtime_entries(self: Vc<Self>) -> Vc<EvaluatableAssets> {
        let ssr_data_runtime_entries = self.data_runtime_entries();
        ssr_data_runtime_entries.resolve_entries(Vc::upcast(self.ssr_module_context()))
    }

    #[turbo_tasks::function]
    fn edge_ssr_runtime_entries(self: Vc<Self>) -> Vc<EvaluatableAssets> {
        let ssr_runtime_entries = self.runtime_entries();
        ssr_runtime_entries.resolve_entries(Vc::upcast(self.edge_ssr_module_context()))
    }

    #[turbo_tasks::function]
    fn edge_ssr_data_runtime_entries(self: Vc<Self>) -> Vc<EvaluatableAssets> {
        let ssr_data_runtime_entries = self.data_runtime_entries();
        ssr_data_runtime_entries.resolve_entries(Vc::upcast(self.edge_ssr_module_context()))
    }

    #[turbo_tasks::function]
    pub async fn client_main_module(self: Vc<Self>) -> Result<Vc<Box<dyn Module>>> {
        let client_module_context = self.client_module_context();

        let client_main_module = esm_resolve(
            Vc::upcast(PlainResolveOrigin::new(
                client_module_context,
                self.project().project_path().join("_".into()),
            )),
            Request::parse(Value::new(Pattern::Constant(
                match *self.project().next_mode().await? {
                    NextMode::Development => "next/dist/client/next-dev-turbopack.js",
                    NextMode::Build => "next/dist/client/next-turbopack.js",
                }
                .into(),
            ))),
            Value::new(EcmaScriptModulesReferenceSubType::Undefined),
            false,
            None,
        )
        .first_module()
        .await?
        .context("expected Next.js client runtime to resolve to a module")?;

        Ok(*client_main_module)
    }
}

#[turbo_tasks::value]
struct PageEndpoint {
    ty: PageEndpointType,
    pages_project: Vc<PagesProject>,
    pathname: Vc<RcStr>,
    original_name: Vc<RcStr>,
    page: Vc<PagesStructureItem>,
    pages_structure: Vc<PagesStructure>,
}

#[derive(
    Copy, Clone, Serialize, Deserialize, PartialEq, Eq, Hash, Debug, TaskInput, TraceRawVcs,
)]
enum PageEndpointType {
    Api,
    Html,
    Data,
    SsrOnly,
}

#[derive(
    Copy, Clone, Serialize, Deserialize, PartialEq, Eq, Hash, Debug, TaskInput, TraceRawVcs,
)]
enum SsrChunkType {
    Page,
    Data,
    Api,
}

#[turbo_tasks::value_impl]
impl PageEndpoint {
    #[turbo_tasks::function]
    fn new(
        ty: PageEndpointType,
        pages_project: Vc<PagesProject>,
        pathname: Vc<RcStr>,
        original_name: Vc<RcStr>,
        page: Vc<PagesStructureItem>,
        pages_structure: Vc<PagesStructure>,
    ) -> Vc<Self> {
        PageEndpoint {
            ty,
            pages_project,
            pathname,
            original_name,
            page,
            pages_structure,
        }
        .cell()
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<Box<dyn Source>> {
        Vc::upcast(FileSource::new(self.page.project_path()))
    }

    #[turbo_tasks::function]
    async fn client_module(self: Vc<Self>) -> Result<Vc<Box<dyn Module>>> {
        let this = self.await?;
        let page_loader = create_page_loader_entry_module(
            this.pages_project.client_module_context(),
            self.source(),
            this.pathname,
        );
        if matches!(
            *this.pages_project.project().next_mode().await?,
            NextMode::Development
        ) {
            if let Some(chunkable) = Vc::try_resolve_downcast(page_loader).await? {
                return Ok(Vc::upcast(HmrEntryModule::new(
                    AssetIdent::from_path(this.page.await?.base_path),
                    chunkable,
                )));
            }
        }
        Ok(page_loader)
    }

    #[turbo_tasks::function]
    async fn client_chunks(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        async move {
            let this = self.await?;

            let client_module = self.client_module();
            let client_main_module = this.pages_project.client_main_module();

            let Some(client_module) =
                Vc::try_resolve_sidecast::<Box<dyn EvaluatableAsset>>(client_module).await?
            else {
                bail!("expected an evaluateable asset");
            };

            let Some(client_main_module) =
                Vc::try_resolve_sidecast::<Box<dyn EvaluatableAsset>>(client_main_module).await?
            else {
                bail!("expected an evaluateable asset");
            };

            let client_chunking_context = this.pages_project.project().client_chunking_context();

            let client_chunks = client_chunking_context.evaluated_chunk_group_assets(
                AssetIdent::from_path(this.page.await?.base_path),
                this.pages_project
                    .client_runtime_entries()
                    .with_entry(client_main_module)
                    .with_entry(client_module),
                Value::new(AvailabilityInfo::Root),
            );

            Ok(client_chunks)
        }
        .instrument(tracing::info_span!("page client side rendering"))
        .await
    }

    #[turbo_tasks::function]
    async fn page_loader(
        self: Vc<Self>,
        client_chunks: Vc<OutputAssets>,
    ) -> Result<Vc<Box<dyn OutputAsset>>> {
        let this = self.await?;
        let project = this.pages_project.project();
        let node_root = project.client_root();
        let client_relative_path = self.client_relative_path();
        let page_loader = PageLoaderAsset::new(
            node_root,
            this.pathname,
            client_relative_path,
            client_chunks,
        );
        Ok(Vc::upcast(page_loader))
    }

    #[turbo_tasks::function]
    async fn internal_ssr_chunk_module(self: Vc<Self>) -> Result<Vc<InternalSsrChunkModule>> {
        let this = self.await?;

        let (reference_type, project_root, module_context, edge_module_context) = match this.ty {
            PageEndpointType::Html | PageEndpointType::SsrOnly => (
                Value::new(ReferenceType::Entry(EntryReferenceSubType::Page)),
                this.pages_project.project().project_path(),
                this.pages_project.ssr_module_context(),
                this.pages_project.edge_ssr_module_context(),
            ),
            PageEndpointType::Data => (
                Value::new(ReferenceType::Entry(EntryReferenceSubType::Page)),
                this.pages_project.project().project_path(),
                this.pages_project.ssr_data_module_context(),
                this.pages_project.edge_ssr_data_module_context(),
            ),
            PageEndpointType::Api => (
                Value::new(ReferenceType::Entry(EntryReferenceSubType::PagesApi)),
                this.pages_project.project().project_path(),
                this.pages_project.api_module_context(),
                this.pages_project.edge_api_module_context(),
            ),
        };

        let ssr_module = module_context
            .process(self.source(), reference_type.clone())
            .module();

        let config = parse_config_from_source(ssr_module).await?;
        let is_edge = matches!(config.runtime, NextRuntime::Edge);

        let ssr_module = if is_edge {
            create_page_ssr_entry_module(
                this.pathname,
                reference_type,
                project_root,
                Vc::upcast(edge_module_context),
                self.source(),
                this.original_name,
                this.pages_structure,
                config.runtime,
                this.pages_project.project().next_config(),
            )
        } else {
            let pathname = &**this.pathname.await?;

            // `/_app` and `/_document` never get rendered directly so they don't need to be
            // wrapped in the route module.
            if pathname == "/_app" || pathname == "/_document" {
                ssr_module
            } else {
                create_page_ssr_entry_module(
                    this.pathname,
                    reference_type,
                    project_root,
                    Vc::upcast(module_context),
                    self.source(),
                    this.original_name,
                    this.pages_structure,
                    config.runtime,
                    this.pages_project.project().next_config(),
                )
            }
        };

        Ok(InternalSsrChunkModule {
            ssr_module: ssr_module.to_resolved().await?,
            runtime: config.runtime,
        }
        .cell())
    }

    #[turbo_tasks::function]
    async fn internal_ssr_chunk(
        self: Vc<Self>,
        ty: SsrChunkType,
        node_path: Vc<FileSystemPath>,
        chunking_context: Vc<NodeJsChunkingContext>,
        edge_chunking_context: Vc<Box<dyn ChunkingContext>>,
        runtime_entries: Vc<EvaluatableAssets>,
        edge_runtime_entries: Vc<EvaluatableAssets>,
    ) -> Result<Vc<SsrChunk>> {
        async move {
            let this = self.await?;

            let InternalSsrChunkModule {
                ssr_module,
                runtime,
            } = *self.internal_ssr_chunk_module().await?;

            let dynamic_import_modules = collect_next_dynamic_imports(
                vec![*ResolvedVc::upcast(ssr_module)],
                this.pages_project.client_module_context(),
                VisitedDynamicImportModules::empty(),
            )
            .await?
            .client_dynamic_imports
            .clone();

            let is_edge = matches!(runtime, NextRuntime::Edge);
            if is_edge {
                let mut evaluatable_assets = edge_runtime_entries.await?.clone_value();
                let evaluatable = *ResolvedVc::try_sidecast(ssr_module)
                    .await?
                    .context("could not process page loader entry module")?;
                evaluatable_assets.push(evaluatable);

                let edge_files = edge_chunking_context.evaluated_chunk_group_assets(
                    ssr_module.ident(),
                    Vc::cell(evaluatable_assets),
                    Value::new(AvailabilityInfo::Root),
                );

                let client_chunking_context =
                    this.pages_project.project().client_chunking_context();
                let dynamic_import_entries = collect_evaluated_chunk_group(
                    Vc::upcast(client_chunking_context),
                    dynamic_import_modules,
                )
                .await?;

                Ok(SsrChunk::Edge {
                    files: edge_files,
                    dynamic_import_entries,
                }
                .cell())
            } else {
                let pathname = &**this.pathname.await?;

                let asset_path = get_asset_path_from_pathname(pathname, ".js");

                let ssr_entry_chunk_path_string: RcStr = format!("pages{asset_path}").into();
                let ssr_entry_chunk_path = node_path.join(ssr_entry_chunk_path_string);
                let EntryChunkGroupResult {
                    asset: ssr_entry_chunk,
                    ..
                } = *chunking_context
                    .entry_chunk_group(
                        ssr_entry_chunk_path,
                        *ssr_module,
                        runtime_entries,
                        OutputAssets::empty(),
                        Value::new(AvailabilityInfo::Root),
                    )
                    .await?;

                let client_chunking_context =
                    this.pages_project.project().client_chunking_context();
                let dynamic_import_entries = collect_chunk_group(
                    Vc::upcast(client_chunking_context),
                    dynamic_import_modules,
                    Value::new(AvailabilityInfo::Root),
                )
                .await?;

                let server_asset_trace_file = if this
                    .pages_project
                    .project()
                    .next_mode()
                    .await?
                    .is_production()
                {
                    ResolvedVc::cell(Some(ResolvedVc::upcast(
                        NftJsonAsset::new(this.pages_project.project(), *ssr_entry_chunk, vec![])
                            .to_resolved()
                            .await?,
                    )))
                } else {
                    ResolvedVc::cell(None)
                };

                Ok(SsrChunk::NodeJs {
                    entry: ssr_entry_chunk,
                    dynamic_import_entries,
                    server_asset_trace_file,
                }
                .cell())
            }
        }
        .instrument(match ty {
            SsrChunkType::Page => tracing::info_span!("page server side rendering"),
            SsrChunkType::Data => tracing::info_span!("server side data"),
            SsrChunkType::Api => tracing::info_span!("server side api"),
        })
        .await
    }

    #[turbo_tasks::function]
    async fn ssr_chunk(self: Vc<Self>) -> Result<Vc<SsrChunk>> {
        let this = self.await?;
        Ok(self.internal_ssr_chunk(
            SsrChunkType::Page,
            this.pages_project
                .project()
                .node_root()
                .join("server".into()),
            this.pages_project.project().server_chunking_context(true),
            this.pages_project.project().edge_chunking_context(true),
            this.pages_project.ssr_runtime_entries(),
            this.pages_project.edge_ssr_runtime_entries(),
        ))
    }

    #[turbo_tasks::function]
    async fn ssr_data_chunk(self: Vc<Self>) -> Result<Vc<SsrChunk>> {
        let this = self.await?;
        Ok(self.internal_ssr_chunk(
            SsrChunkType::Data,
            this.pages_project
                .project()
                .node_root()
                .join("server/data".into()),
            this.pages_project.project().server_chunking_context(true),
            this.pages_project.project().edge_chunking_context(true),
            this.pages_project.ssr_data_runtime_entries(),
            this.pages_project.edge_ssr_data_runtime_entries(),
        ))
    }

    #[turbo_tasks::function]
    async fn api_chunk(self: Vc<Self>) -> Result<Vc<SsrChunk>> {
        let this = self.await?;
        Ok(self.internal_ssr_chunk(
            SsrChunkType::Api,
            this.pages_project
                .project()
                .node_root()
                .join("server".into()),
            this.pages_project.project().server_chunking_context(false),
            this.pages_project.project().edge_chunking_context(false),
            this.pages_project.ssr_runtime_entries(),
            this.pages_project.edge_ssr_runtime_entries(),
        ))
    }

    #[turbo_tasks::function]
    async fn pages_manifest(
        &self,
        entry_chunk: Vc<Box<dyn OutputAsset>>,
    ) -> Result<Vc<Box<dyn OutputAsset>>> {
        let node_root = self.pages_project.project().node_root();
        let chunk_path = entry_chunk.ident().path().await?;

        let asset_path = node_root
            .join("server".into())
            .await?
            .get_path_to(&chunk_path)
            .context("ssr chunk entry path must be inside the node root")?;

        let pages_manifest = PagesManifest {
            pages: [(self.pathname.await?.clone_value(), asset_path.into())]
                .into_iter()
                .collect(),
        };
        let manifest_path_prefix = get_asset_prefix_from_pathname(&self.pathname.await?);
        let asset = Vc::upcast(VirtualOutputAsset::new(
            node_root
                .join(format!("server/pages{manifest_path_prefix}/pages-manifest.json",).into()),
            AssetContent::file(File::from(serde_json::to_string_pretty(&pages_manifest)?).into()),
        ));
        Ok(asset)
    }

    #[turbo_tasks::function]
    async fn react_loadable_manifest(
        &self,
        dynamic_import_entries: Vc<DynamicImportedChunks>,
    ) -> Result<Vc<OutputAssets>> {
        let node_root = self.pages_project.project().node_root();
        let client_relative_path = self.pages_project.project().client_relative_path();
        let loadable_path_prefix = get_asset_prefix_from_pathname(&self.pathname.await?);
        Ok(create_react_loadable_manifest(
            dynamic_import_entries,
            client_relative_path,
            node_root.join(
                format!("server/pages{loadable_path_prefix}/react-loadable-manifest.json").into(),
            ),
        ))
    }

    #[turbo_tasks::function]
    async fn build_manifest(
        &self,
        client_chunks: Vc<OutputAssets>,
    ) -> Result<Vc<Box<dyn OutputAsset>>> {
        let node_root = self.pages_project.project().node_root();
        let client_relative_path = self.pages_project.project().client_relative_path();
        let build_manifest = BuildManifest {
            pages: fxindexmap!(self.pathname.await?.clone_value() => client_chunks),
            ..Default::default()
        };
        let manifest_path_prefix = get_asset_prefix_from_pathname(&self.pathname.await?);
        Ok(Vc::upcast(
            build_manifest
                .build_output(
                    node_root.join(
                        format!("server/pages{manifest_path_prefix}/build-manifest.json",).into(),
                    ),
                    client_relative_path,
                )
                .await?,
        ))
    }

    #[turbo_tasks::function]
    fn output_assets(self: Vc<Self>) -> Vc<OutputAssets> {
        self.output().output_assets()
    }

    #[turbo_tasks::function]
    async fn output(self: Vc<Self>) -> Result<Vc<PageEndpointOutput>> {
        let this = self.await?;

        let mut server_assets = vec![];
        let mut client_assets = vec![];

        let ssr_chunk = match this.ty {
            PageEndpointType::Html => {
                let client_chunks = self.client_chunks();
                client_assets.extend(client_chunks.await?.iter().map(|asset| **asset));
                let build_manifest = self.build_manifest(client_chunks).to_resolved().await?;
                let page_loader = self.page_loader(client_chunks);
                client_assets.push(page_loader);
                server_assets.push(build_manifest);
                self.ssr_chunk()
            }
            PageEndpointType::Data => self.ssr_data_chunk(),
            PageEndpointType::Api => self.api_chunk(),
            PageEndpointType::SsrOnly => self.ssr_chunk(),
        };
        let emit_manifests = !matches!(this.ty, PageEndpointType::Data);

        let pathname = this.pathname.await?;
        let original_name = &*this.original_name.await?;

        let client_assets = OutputAssets::new(client_assets);

        let manifest_path_prefix = get_asset_prefix_from_pathname(&pathname);
        let node_root = this.pages_project.project().node_root();
        let next_font_manifest_output = create_font_manifest(
            this.pages_project.project().client_root(),
            node_root,
            this.pages_project.pages_dir(),
            original_name,
            &manifest_path_prefix,
            &pathname,
            client_assets,
            false,
        )
        .await?;
        server_assets.push(next_font_manifest_output);

        if *this
            .pages_project
            .project()
            .should_create_webpack_stats()
            .await?
        {
            let webpack_stats =
                generate_webpack_stats(original_name.to_owned(), &client_assets.await?).await?;
            let stats_output = VirtualOutputAsset::new(
                node_root
                    .join(format!("server/pages{manifest_path_prefix}/webpack-stats.json",).into()),
                AssetContent::file(
                    File::from(serde_json::to_string_pretty(&webpack_stats)?).into(),
                ),
            )
            .to_resolved()
            .await?;
            server_assets.push(ResolvedVc::upcast(stats_output));
        }

        let page_output = match *ssr_chunk.await? {
            SsrChunk::NodeJs {
                entry,
                dynamic_import_entries,
                server_asset_trace_file,
            } => {
                server_assets.push(entry);
                if let Some(server_asset_trace_file) = &*server_asset_trace_file.await? {
                    server_assets.push(*server_asset_trace_file);
                }

                if emit_manifests {
                    let pages_manifest = self.pages_manifest(*entry).to_resolved().await?;
                    server_assets.push(pages_manifest);

                    let loadable_manifest_output =
                        self.react_loadable_manifest(dynamic_import_entries);
                    server_assets.extend(loadable_manifest_output.await?.iter().copied());
                }

                PageEndpointOutput::NodeJs {
                    entry_chunk: entry,
                    server_assets: Vc::cell(server_assets),
                    client_assets,
                }
            }
            SsrChunk::Edge {
                files,
                dynamic_import_entries,
            } => {
                let node_root = this.pages_project.project().node_root();
                if emit_manifests {
                    let files_value = files.await?;
                    if let Some(&file) = files_value.first() {
                        let pages_manifest = self.pages_manifest(*file).to_resolved().await?;
                        server_assets.push(pages_manifest);
                    }
                    server_assets.extend(files_value.iter().copied());

                    // the next-edge-ssr-loader templates expect the manifests to be stored in
                    // global variables defined in these files
                    //
                    // they are created in `setup-dev-bundler.ts`
                    let mut file_paths_from_root = vec![
                        "server/server-reference-manifest.js".into(),
                        "server/middleware-build-manifest.js".into(),
                        "server/middleware-react-loadable-manifest.js".into(),
                        "server/next-font-manifest.js".into(),
                    ];
                    let mut wasm_paths_from_root = vec![];

                    let node_root_value = node_root.await?;

                    file_paths_from_root
                        .extend(get_js_paths_from_root(&node_root_value, &files_value).await?);

                    let all_output_assets = all_assets_from_entries(files).await?;

                    wasm_paths_from_root.extend(
                        get_wasm_paths_from_root(&node_root_value, &all_output_assets).await?,
                    );

                    let all_assets =
                        get_asset_paths_from_root(&node_root_value, &all_output_assets).await?;

                    let named_regex = get_named_middleware_regex(&pathname).into();
                    let matchers = MiddlewareMatcher {
                        regexp: Some(named_regex),
                        original_source: pathname.clone_value(),
                        ..Default::default()
                    };
                    let original_name = this.original_name.await?;
                    let edge_function_definition = EdgeFunctionDefinition {
                        files: file_paths_from_root,
                        wasm: wasm_paths_to_bindings(wasm_paths_from_root),
                        assets: paths_to_bindings(all_assets),
                        name: pathname.clone_value(),
                        page: original_name.clone_value(),
                        regions: None,
                        matchers: vec![matchers],
                        env: this.pages_project.project().edge_env().await?.clone_value(),
                    };
                    let middleware_manifest_v2 = MiddlewaresManifestV2 {
                        sorted_middleware: vec![pathname.clone_value()],
                        functions: [(pathname.clone_value(), edge_function_definition)]
                            .into_iter()
                            .collect(),
                        ..Default::default()
                    };
                    let manifest_path_prefix =
                        get_asset_prefix_from_pathname(&this.pathname.await?);
                    let middleware_manifest_v2 = VirtualOutputAsset::new(
                        node_root.join(
                            format!("server/pages{manifest_path_prefix}/middleware-manifest.json")
                                .into(),
                        ),
                        AssetContent::file(
                            FileContent::Content(File::from(serde_json::to_string_pretty(
                                &middleware_manifest_v2,
                            )?))
                            .cell(),
                        ),
                    )
                    .to_resolved()
                    .await?;
                    server_assets.push(ResolvedVc::upcast(middleware_manifest_v2));
                }

                let loadable_manifest_output = self.react_loadable_manifest(dynamic_import_entries);
                server_assets.extend(loadable_manifest_output.await?.iter().copied());

                PageEndpointOutput::Edge {
                    files,
                    server_assets: Vc::cell(server_assets),
                    client_assets,
                }
            }
        };

        Ok(page_output.cell())
    }

    #[turbo_tasks::function]
    async fn client_relative_path(&self) -> Result<Vc<FileSystemPathOption>> {
        Ok(Vc::cell(Some(
            self.pages_project
                .project()
                .client_relative_path()
                .to_resolved()
                .await?,
        )))
    }
}

#[turbo_tasks::value]
pub struct InternalSsrChunkModule {
    pub ssr_module: ResolvedVc<Box<dyn Module>>,
    pub runtime: NextRuntime,
}

#[turbo_tasks::value_impl]
impl Endpoint for PageEndpoint {
    #[turbo_tasks::function]
    async fn write_to_disk(self: Vc<Self>) -> Result<Vc<WrittenEndpoint>> {
        let this = self.await?;
        let original_name = this.original_name.await?;
        let span = {
            match this.ty {
                PageEndpointType::Html => {
                    tracing::info_span!("page endpoint HTML", name = original_name.to_string())
                }
                PageEndpointType::Data => {
                    tracing::info_span!("page endpoint data", name = original_name.to_string())
                }
                PageEndpointType::Api => {
                    tracing::info_span!("page endpoint API", name = original_name.to_string())
                }
                PageEndpointType::SsrOnly => {
                    tracing::info_span!("page endpoint SSR", name = original_name.to_string())
                }
            }
        };
        async move {
            let output = self.output().await?;
            // Must use self.output_assets() instead of output.output_assets() to make it a
            // single operation
            let output_assets = self.output_assets();

            let _ = this
                .pages_project
                .project()
                .emit_all_output_assets(Vc::cell(output_assets));

            let node_root = this.pages_project.project().node_root();
            let server_paths = all_server_paths(output_assets, node_root)
                .await?
                .clone_value();

            let client_relative_root = this.pages_project.project().client_relative_path();
            let client_paths = all_paths_in_root(output_assets, client_relative_root)
                .into_future()
                .instrument(tracing::info_span!("client_paths"))
                .await?
                .clone_value();

            let node_root = &node_root.await?;
            let written_endpoint = match *output {
                PageEndpointOutput::NodeJs { entry_chunk, .. } => WrittenEndpoint::NodeJs {
                    server_entry_path: node_root
                        .get_path_to(&*entry_chunk.ident().path().await?)
                        .context("ssr chunk entry path must be inside the node root")?
                        .to_string(),
                    server_paths,
                    client_paths,
                },
                PageEndpointOutput::Edge { .. } => WrittenEndpoint::Edge {
                    server_paths,
                    client_paths,
                },
            };

            anyhow::Ok(written_endpoint.cell())
        }
        .instrument(span)
        .await
        .with_context(|| format!("Failed to write page endpoint {}", *original_name))
    }

    #[turbo_tasks::function]
    async fn server_changed(self: Vc<Self>) -> Result<Vc<Completion>> {
        Ok(self
            .await?
            .pages_project
            .project()
            .server_changed(self.output().server_assets()))
    }

    #[turbo_tasks::function]
    async fn client_changed(self: Vc<Self>) -> Result<Vc<Completion>> {
        Ok(self
            .await?
            .pages_project
            .project()
            .client_changed(self.output().client_assets()))
    }

    #[turbo_tasks::function]
    async fn root_modules(self: Vc<Self>) -> Result<Vc<Modules>> {
        let this = self.await?;
        let mut modules = vec![];

        let ssr_chunk_module = self.internal_ssr_chunk_module().await?;
        modules.push(ssr_chunk_module.ssr_module);

        if let PageEndpointType::Html = this.ty {
            modules.push(self.client_module().to_resolved().await?);
        }

        Ok(Vc::cell(modules))
    }
}

#[turbo_tasks::value]
enum PageEndpointOutput {
    NodeJs {
        entry_chunk: ResolvedVc<Box<dyn OutputAsset>>,
        server_assets: Vc<OutputAssets>,
        client_assets: Vc<OutputAssets>,
    },
    Edge {
        files: Vc<OutputAssets>,
        server_assets: Vc<OutputAssets>,
        client_assets: Vc<OutputAssets>,
    },
}

#[turbo_tasks::value_impl]
impl PageEndpointOutput {
    #[turbo_tasks::function]
    pub async fn output_assets(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let server_assets = self.server_assets().await?;
        let client_assets = self.client_assets().await?;
        Ok(Vc::cell(
            server_assets
                .iter()
                .cloned()
                .chain(client_assets.iter().cloned())
                .collect(),
        ))
    }

    #[turbo_tasks::function]
    pub fn server_assets(&self) -> Vc<OutputAssets> {
        match *self {
            PageEndpointOutput::NodeJs { server_assets, .. }
            | PageEndpointOutput::Edge { server_assets, .. } => server_assets,
        }
    }

    #[turbo_tasks::function]
    pub fn client_assets(&self) -> Vc<OutputAssets> {
        match *self {
            PageEndpointOutput::NodeJs { client_assets, .. }
            | PageEndpointOutput::Edge { client_assets, .. } => client_assets,
        }
    }
}

#[turbo_tasks::value]
pub enum SsrChunk {
    NodeJs {
        entry: ResolvedVc<Box<dyn OutputAsset>>,
        dynamic_import_entries: Vc<DynamicImportedChunks>,
        server_asset_trace_file: ResolvedVc<OptionOutputAsset>,
    },
    Edge {
        files: Vc<OutputAssets>,
        dynamic_import_entries: Vc<DynamicImportedChunks>,
    },
}
