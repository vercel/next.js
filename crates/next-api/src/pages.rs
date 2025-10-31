use anyhow::{Context, Result, bail};
use futures::future::BoxFuture;
use next_core::{
    PageLoaderAsset, all_assets_from_entries, create_page_loader_entry_module,
    get_asset_path_from_pathname, get_edge_resolve_options_context,
    hmr_entry::HmrEntryModule,
    mode::NextMode,
    next_client::{
        ClientContextType, get_client_module_options_context, get_client_resolve_options_context,
        get_client_runtime_entries,
    },
    next_dynamic::NextDynamicTransition,
    next_edge::route_regex::get_named_middleware_regex,
    next_manifests::{
        BuildManifest, ClientBuildManifest, EdgeFunctionDefinition, MiddlewaresManifestV2,
        PagesManifest, ProxyMatcher, Regions,
    },
    next_pages::create_page_ssr_entry_module,
    next_server::{
        ServerContextType, get_server_module_options_context, get_server_resolve_options_context,
    },
    pages_structure::{
        PagesDirectoryStructure, PagesStructure, PagesStructureItem, find_pages_structure,
    },
    parse_segment_config_from_source,
    segment_config::ParseSegmentMode,
    util::{NextRuntime, get_asset_prefix_from_pathname, pages_function_name},
};
use serde::{Deserialize, Serialize};
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    Completion, FxIndexMap, NonLocalValue, ResolvedVc, TaskInput, ValueToString, Vc, fxindexmap,
    fxindexset, trace::TraceRawVcs,
};
use turbo_tasks_fs::{
    self, File, FileContent, FileSystem, FileSystemPath, FileSystemPathOption, VirtualFileSystem,
};
use turbopack::{
    ModuleAssetContext,
    module_options::ModuleOptionsContext,
    resolve_options_context::ResolveOptionsContext,
    transition::{FullContextTransition, Transition, TransitionOptions},
};
use turbopack_core::{
    asset::AssetContent,
    chunk::{
        ChunkGroupResult, ChunkingContext, ChunkingContextExt, EvaluatableAsset, EvaluatableAssets,
        availability_info::AvailabilityInfo,
    },
    context::AssetContext,
    file_source::FileSource,
    ident::{AssetIdent, Layer},
    module::Module,
    module_graph::{
        GraphEntries, ModuleGraph, SingleModuleGraph, VisitedModules,
        chunk_group_info::{ChunkGroup, ChunkGroupEntry},
    },
    output::{OptionOutputAsset, OutputAsset, OutputAssets, OutputAssetsWithReferenced},
    reference_type::{EcmaScriptModulesReferenceSubType, EntryReferenceSubType, ReferenceType},
    resolve::{origin::PlainResolveOrigin, parse::Request, pattern::Pattern},
    source::Source,
    virtual_output::VirtualOutputAsset,
};
use turbopack_ecmascript::resolve::esm_resolve;
use turbopack_nodejs::NodeJsChunkingContext;

use crate::{
    dynamic_imports::{
        DynamicImportedChunks, NextDynamicChunkAvailability, collect_next_dynamic_chunks,
    },
    font::FontManifest,
    loadable_manifest::create_react_loadable_manifest,
    module_graph::get_global_information_for_endpoint,
    nft_json::NftJsonAsset,
    paths::{
        all_paths_in_root, all_server_paths, get_asset_paths_from_root, get_js_paths_from_root,
        get_wasm_paths_from_root, paths_to_bindings, wasm_paths_to_bindings,
    },
    project::Project,
    route::{Endpoint, EndpointOutput, EndpointOutputPaths, Route, Routes},
    webpack_stats::generate_webpack_stats,
};

#[turbo_tasks::value]
pub struct PagesProject {
    project: ResolvedVc<Project>,
}

#[turbo_tasks::value_impl]
impl PagesProject {
    #[turbo_tasks::function]
    pub fn new(project: ResolvedVc<Project>) -> Vc<Self> {
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
            error_500: _,
            has_user_pages: _,
            should_create_pages_entries,
        } = &*pages_structure.await?;
        let mut routes = FxIndexMap::default();

        // If pages entries shouldn't be created (build mode with no pages), return empty routes
        if !should_create_pages_entries {
            return Ok(Vc::cell(routes));
        }

        async fn add_page_to_routes(
            routes: &mut FxIndexMap<RcStr, Route>,
            page: Vc<PagesStructureItem>,
            make_route: impl Fn(
                RcStr,
                RcStr,
                Vc<PagesStructureItem>,
            ) -> BoxFuture<'static, Result<Route>>,
        ) -> Result<()> {
            let PagesStructureItem {
                next_router_path,
                original_path,
                ..
            } = &*page.await?;
            let pathname: RcStr = format!("/{}", next_router_path.path).into();
            let original_name = format!("/{}", original_path.path).into();
            let route = make_route(pathname.clone(), original_name, page).await?;
            routes.insert(pathname, route);
            Ok(())
        }

        async fn add_dir_to_routes(
            routes: &mut FxIndexMap<RcStr, Route>,
            dir: Vc<PagesDirectoryStructure>,
            make_route: impl Fn(
                RcStr,
                RcStr,
                Vc<PagesStructureItem>,
            ) -> BoxFuture<'static, Result<Route>>,
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
                    add_page_to_routes(routes, *item, &make_route).await?;
                }
                for &child in children.iter() {
                    queue.push(*child);
                }
            }
            Ok(())
        }

        if let Some(api) = *api {
            add_dir_to_routes(&mut routes, *api, |pathname, original_name, page| {
                Box::pin(async move {
                    Ok(Route::PageApi {
                        endpoint: ResolvedVc::upcast(
                            PageEndpoint::new(
                                PageEndpointType::Api,
                                self,
                                pathname,
                                original_name,
                                page,
                                pages_structure,
                            )
                            .to_resolved()
                            .await?,
                        ),
                    })
                })
            })
            .await?;
        }

        let make_page_route = |pathname: RcStr, original_name: RcStr, page| -> BoxFuture<_> {
            Box::pin(async move {
                Ok(Route::Page {
                    html_endpoint: ResolvedVc::upcast(
                        PageEndpoint::new(
                            PageEndpointType::Html,
                            self,
                            pathname.clone(),
                            original_name.clone(),
                            page,
                            pages_structure,
                        )
                        .to_resolved()
                        .await?,
                    ),
                    // The data endpoint is only needed in development mode to support HMR
                    data_endpoint: if self.project().next_mode().await?.is_development() {
                        Some(ResolvedVc::upcast(
                            PageEndpoint::new(
                                PageEndpointType::Data,
                                self,
                                pathname,
                                original_name,
                                page,
                                pages_structure,
                            )
                            .to_resolved()
                            .await?,
                        ))
                    } else {
                        None
                    },
                })
            })
        };

        if let Some(pages) = *pages {
            add_dir_to_routes(&mut routes, *pages, make_page_route).await?;
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
        } = &*item.await?;
        let pathname: RcStr = format!("/{}", next_router_path.path).into();
        let original_name = format!("/{}", original_path.path).into();
        let endpoint = Vc::upcast(PageEndpoint::new(
            ty,
            self,
            pathname,
            original_name,
            item,
            self.pages_structure(),
        ));
        Ok(endpoint)
    }

    #[turbo_tasks::function]
    pub async fn document_endpoint(self: Vc<Self>) -> Result<Vc<Box<dyn Endpoint>>> {
        Ok(self.to_endpoint(
            *self.pages_structure().await?.document,
            PageEndpointType::SsrOnly,
        ))
    }

    #[turbo_tasks::function]
    pub async fn app_endpoint(self: Vc<Self>) -> Result<Vc<Box<dyn Endpoint>>> {
        Ok(self.to_endpoint(*self.pages_structure().await?.app, PageEndpointType::Html))
    }

    #[turbo_tasks::function]
    pub async fn error_endpoint(self: Vc<Self>) -> Result<Vc<Box<dyn Endpoint>>> {
        Ok(self.to_endpoint(*self.pages_structure().await?.error, PageEndpointType::Html))
    }

    #[turbo_tasks::function]
    fn project(&self) -> Vc<Project> {
        *self.project
    }

    #[turbo_tasks::function]
    async fn pages_structure(&self) -> Result<Vc<PagesStructure>> {
        let next_router_fs = Vc::upcast::<Box<dyn FileSystem>>(VirtualFileSystem::new());
        let next_router_root = next_router_fs.root().owned().await?;
        Ok(find_pages_structure(
            self.project.project_path().owned().await?,
            next_router_root,
            self.project.next_config().page_extensions(),
            self.project.next_mode(),
        ))
    }

    #[turbo_tasks::function]
    async fn pages_dir(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        Ok(if let Some(pages) = self.pages_structure().await?.pages {
            pages.project_path()
        } else {
            self.project().project_path().await?.join("pages")?.cell()
        })
    }

    #[turbo_tasks::function]
    async fn client_transitions(self: Vc<Self>) -> Result<Vc<TransitionOptions>> {
        Ok(TransitionOptions {
            named_transitions: [
                (
                    rcstr!("next-dynamic"),
                    ResolvedVc::upcast(NextDynamicTransition::new_marker().to_resolved().await?),
                ),
                (
                    rcstr!("next-dynamic-client"),
                    ResolvedVc::upcast(NextDynamicTransition::new_marker().to_resolved().await?),
                ),
            ]
            .into_iter()
            .collect(),
            ..Default::default()
        }
        .cell())
    }

    #[turbo_tasks::function]
    async fn server_transitions(self: Vc<Self>) -> Result<Vc<TransitionOptions>> {
        Ok(TransitionOptions {
            named_transitions: [
                (
                    rcstr!("next-dynamic"),
                    ResolvedVc::upcast(NextDynamicTransition::new_marker().to_resolved().await?),
                ),
                (
                    rcstr!("next-dynamic-client"),
                    ResolvedVc::upcast(
                        NextDynamicTransition::new_client(self.client_transition())
                            .to_resolved()
                            .await?,
                    ),
                ),
            ]
            .into_iter()
            .collect(),
            ..Default::default()
        }
        .cell())
    }

    #[turbo_tasks::function]
    fn client_transition(self: Vc<Self>) -> Vc<Box<dyn Transition>> {
        Vc::upcast(FullContextTransition::new(self.client_module_context()))
    }

    #[turbo_tasks::function]
    async fn client_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        Ok(get_client_module_options_context(
            self.project().project_path().owned().await?,
            self.project().execution_context(),
            self.project().client_compile_time_info().environment(),
            ClientContextType::Pages {
                pages_dir: self.pages_dir().owned().await?,
            },
            self.project().next_mode(),
            self.project().next_config(),
            self.project().encryption_key(),
        ))
    }

    #[turbo_tasks::function]
    async fn client_resolve_options_context(self: Vc<Self>) -> Result<Vc<ResolveOptionsContext>> {
        Ok(get_client_resolve_options_context(
            self.project().project_path().owned().await?,
            ClientContextType::Pages {
                pages_dir: self.pages_dir().owned().await?,
            },
            self.project().next_mode(),
            self.project().next_config(),
            self.project().execution_context(),
        ))
    }

    #[turbo_tasks::function]
    pub(super) fn client_module_context(self: Vc<Self>) -> Vc<ModuleAssetContext> {
        ModuleAssetContext::new(
            self.client_transitions(),
            self.project().client_compile_time_info(),
            self.client_module_options_context(),
            self.client_resolve_options_context(),
            Layer::new_with_user_friendly_name(rcstr!("client"), rcstr!("Browser")),
        )
    }

    #[turbo_tasks::function]
    pub(super) fn ssr_module_context(self: Vc<Self>) -> Vc<ModuleAssetContext> {
        ModuleAssetContext::new(
            self.server_transitions(),
            self.project().server_compile_time_info(),
            self.ssr_module_options_context(),
            self.ssr_resolve_options_context(),
            Layer::new_with_user_friendly_name(rcstr!("ssr"), rcstr!("SSR")),
        )
    }

    /// Returns a context specific to pages/api.
    /// This mimics the current configuration in [next-dev](https://github.com/vercel/next.js/blob/9b4b0847ed4a1025e73bec16a9ee11766e632e14/packages/next/src/build/webpack-config.ts#L1381-L1385)
    #[turbo_tasks::function]
    pub(super) fn api_module_context(self: Vc<Self>) -> Vc<ModuleAssetContext> {
        ModuleAssetContext::new(
            self.server_transitions(),
            self.project().server_compile_time_info(),
            self.api_module_options_context(),
            self.ssr_resolve_options_context(),
            Layer::new_with_user_friendly_name(rcstr!("api"), rcstr!("Route")),
        )
    }

    #[turbo_tasks::function]
    pub(super) fn edge_ssr_module_context(self: Vc<Self>) -> Vc<ModuleAssetContext> {
        ModuleAssetContext::new(
            Default::default(),
            self.project().edge_compile_time_info(),
            self.edge_ssr_module_options_context(),
            self.edge_ssr_resolve_options_context(),
            Layer::new_with_user_friendly_name(rcstr!("edge-ssr"), rcstr!("Edge SSR")),
        )
    }

    #[turbo_tasks::function]
    pub(super) fn edge_api_module_context(self: Vc<Self>) -> Vc<ModuleAssetContext> {
        ModuleAssetContext::new(
            Default::default(),
            self.project().edge_compile_time_info(),
            self.edge_api_module_options_context(),
            self.edge_ssr_resolve_options_context(),
            Layer::new_with_user_friendly_name(rcstr!("edge-api"), rcstr!("Edge Route")),
        )
    }

    #[turbo_tasks::function]
    async fn ssr_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        Ok(get_server_module_options_context(
            self.project().project_path().owned().await?,
            self.project().execution_context(),
            ServerContextType::Pages {
                pages_dir: self.pages_dir().owned().await?,
            },
            self.project().next_mode(),
            self.project().next_config(),
            NextRuntime::NodeJs,
            self.project().encryption_key(),
            self.project().server_compile_time_info().environment(),
            self.project().client_compile_time_info().environment(),
        ))
    }

    #[turbo_tasks::function]
    async fn edge_ssr_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        Ok(get_server_module_options_context(
            self.project().project_path().owned().await?,
            self.project().execution_context(),
            ServerContextType::Pages {
                pages_dir: self.pages_dir().owned().await?,
            },
            self.project().next_mode(),
            self.project().next_config(),
            NextRuntime::Edge,
            self.project().encryption_key(),
            self.project().edge_compile_time_info().environment(),
            self.project().client_compile_time_info().environment(),
        ))
    }

    #[turbo_tasks::function]
    async fn api_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        Ok(get_server_module_options_context(
            self.project().project_path().owned().await?,
            self.project().execution_context(),
            ServerContextType::PagesApi {
                pages_dir: self.pages_dir().owned().await?,
            },
            self.project().next_mode(),
            self.project().next_config(),
            NextRuntime::NodeJs,
            self.project().encryption_key(),
            self.project().server_compile_time_info().environment(),
            self.project().client_compile_time_info().environment(),
        ))
    }

    #[turbo_tasks::function]
    async fn edge_api_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        Ok(get_server_module_options_context(
            self.project().project_path().owned().await?,
            self.project().execution_context(),
            ServerContextType::PagesApi {
                pages_dir: self.pages_dir().owned().await?,
            },
            self.project().next_mode(),
            self.project().next_config(),
            NextRuntime::Edge,
            self.project().encryption_key(),
            self.project().edge_compile_time_info().environment(),
            self.project().client_compile_time_info().environment(),
        ))
    }

    #[turbo_tasks::function]
    async fn ssr_resolve_options_context(self: Vc<Self>) -> Result<Vc<ResolveOptionsContext>> {
        Ok(get_server_resolve_options_context(
            self.project().project_path().owned().await?,
            // NOTE(alexkirsz) This could be `PagesData` for the data endpoint, but it doesn't
            // matter (for now at least) because `get_server_resolve_options_context` doesn't
            // differentiate between the two.
            ServerContextType::Pages {
                pages_dir: self.pages_dir().owned().await?,
            },
            self.project().next_mode(),
            self.project().next_config(),
            self.project().execution_context(),
            None, // root params are not available in pages dir
        ))
    }

    #[turbo_tasks::function]
    async fn edge_ssr_resolve_options_context(self: Vc<Self>) -> Result<Vc<ResolveOptionsContext>> {
        Ok(get_edge_resolve_options_context(
            self.project().project_path().owned().await?,
            // NOTE(alexkirsz) This could be `PagesData` for the data endpoint, but it doesn't
            // matter (for now at least) because `get_server_resolve_options_context` doesn't
            // differentiate between the two.
            ServerContextType::Pages {
                pages_dir: self.pages_dir().owned().await?,
            },
            self.project().next_mode(),
            self.project().next_config(),
            self.project().execution_context(),
            None, // root params are not available in pages dir
        ))
    }

    #[turbo_tasks::function]
    async fn client_runtime_entries(self: Vc<Self>) -> Result<Vc<EvaluatableAssets>> {
        let client_runtime_entries = get_client_runtime_entries(
            self.project().project_path().owned().await?,
            ClientContextType::Pages {
                pages_dir: self.pages_dir().owned().await?,
            },
            self.project().next_mode(),
            self.project().next_config(),
            self.project().execution_context(),
        );
        Ok(client_runtime_entries.resolve_entries(Vc::upcast(self.client_module_context())))
    }

    #[turbo_tasks::function]
    pub async fn client_main_module(self: Vc<Self>) -> Result<Vc<Box<dyn Module>>> {
        let client_module_context = Vc::upcast(self.client_module_context());

        let client_main_module = esm_resolve(
            Vc::upcast(PlainResolveOrigin::new(
                client_module_context,
                self.project().project_path().await?.join("_")?,
            )),
            Request::parse(Pattern::Constant(
                match *self.project().next_mode().await? {
                    NextMode::Development => rcstr!("next/dist/client/next-dev-turbopack.js"),
                    NextMode::Build => rcstr!("next/dist/client/next-turbopack.js"),
                },
            )),
            EcmaScriptModulesReferenceSubType::Undefined,
            false,
            None,
        )
        .await?
        .first_module()
        .await?
        .context("expected Next.js client runtime to resolve to a module")?;

        Ok(*client_main_module)
    }
}

#[turbo_tasks::value]
struct PageEndpoint {
    ty: PageEndpointType,
    pages_project: ResolvedVc<PagesProject>,
    pathname: RcStr,
    original_name: RcStr,
    page: ResolvedVc<PagesStructureItem>,
    pages_structure: ResolvedVc<PagesStructure>,
}

#[derive(
    Copy,
    Clone,
    Serialize,
    Deserialize,
    PartialEq,
    Eq,
    Hash,
    Debug,
    TaskInput,
    TraceRawVcs,
    NonLocalValue,
)]
enum PageEndpointType {
    Api,
    Html,
    // A development only type that is used in pages router so we can differentiate between
    // components changing and server props changing.
    Data,
    // for _document.js
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

#[derive(
    Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, TaskInput, TraceRawVcs,
)]
enum EmitManifests {
    /// Don't emit any manifests
    None,
    /// Emit the manifest for basic Next.js functionality (e.g. pages-manifest.json)
    Minimal,
    /// All manifests: `Minimal` plus server-reference-manifest, next/font, next/dynamic
    Full,
}

#[turbo_tasks::value_impl]
impl PageEndpoint {
    #[turbo_tasks::function]
    fn new(
        ty: PageEndpointType,
        pages_project: ResolvedVc<PagesProject>,
        pathname: RcStr,
        original_name: RcStr,
        page: ResolvedVc<PagesStructureItem>,
        pages_structure: ResolvedVc<PagesStructure>,
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
    async fn source(&self) -> Result<Vc<Box<dyn Source>>> {
        Ok(Vc::upcast(FileSource::new_with_query(
            self.page.file_path().owned().await?,
            // When creating a data endpoint we also create an Html endpoint for the same source
            // So add a query parameter to differentiate between the two.
            if self.ty == PageEndpointType::Data {
                rcstr!("?server-data")
            } else {
                rcstr!("")
            },
        )))
    }

    #[turbo_tasks::function]
    async fn client_module(self: Vc<Self>) -> Result<Vc<Box<dyn Module>>> {
        let this = self.await?;
        let page_loader = create_page_loader_entry_module(
            Vc::upcast(this.pages_project.client_module_context()),
            self.source(),
            this.pathname.clone(),
        );
        if matches!(
            *this.pages_project.project().next_mode().await?,
            NextMode::Development
        ) && let Some(chunkable) = Vc::try_resolve_downcast(page_loader).await?
        {
            return Ok(Vc::upcast(HmrEntryModule::new(
                AssetIdent::from_path(this.page.await?.base_path.clone()),
                chunkable,
            )));
        }
        Ok(page_loader)
    }

    #[turbo_tasks::function]
    async fn client_evaluatable_assets(self: Vc<Self>) -> Result<Vc<EvaluatableAssets>> {
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

        let evaluatable_assets = this
            .pages_project
            .client_runtime_entries()
            .with_entry(client_main_module)
            .with_entry(client_module);
        Ok(evaluatable_assets)
    }

    #[turbo_tasks::function]
    async fn client_module_graph(self: Vc<Self>) -> Result<Vc<ModuleGraph>> {
        let this = self.await?;
        let project = this.pages_project.project();
        let evaluatable_assets = self.client_evaluatable_assets();
        Ok(project.module_graph_for_modules(evaluatable_assets))
    }

    #[turbo_tasks::function]
    async fn ssr_module_graph(self: Vc<Self>) -> Result<Vc<ModuleGraph>> {
        let this = self.await?;
        let project = this.pages_project.project();

        if *project.per_page_module_graph().await? {
            let should_trace = project.next_mode().await?.is_production();
            let ssr_chunk_module = self.internal_ssr_chunk_module().await?;
            // Implements layout segment optimization to compute a graph "chain" for document, app,
            // page
            let mut graphs = vec![];
            let mut visited_modules = VisitedModules::empty();
            for module in [
                ssr_chunk_module.document_module,
                ssr_chunk_module.app_module,
            ]
            .into_iter()
            .flatten()
            {
                let graph = SingleModuleGraph::new_with_entries_visited_intern(
                    vec![ChunkGroupEntry::Shared(module)],
                    visited_modules,
                    should_trace,
                );
                graphs.push(graph);
                visited_modules = visited_modules.concatenate(graph);
            }

            let graph = SingleModuleGraph::new_with_entries_visited_intern(
                vec![ChunkGroupEntry::Entry(vec![ssr_chunk_module.ssr_module])],
                visited_modules,
                should_trace,
            );
            graphs.push(graph);

            Ok(ModuleGraph::from_graphs(graphs))
        } else {
            Ok(*project.whole_app_module_graphs().await?.full)
        }
    }

    #[turbo_tasks::function]
    async fn client_chunk_group(self: Vc<Self>) -> Result<Vc<ChunkGroupResult>> {
        async move {
            let this = self.await?;

            let project = this.pages_project.project();
            let client_chunking_context = project.client_chunking_context();

            let module_graph = self.client_module_graph();

            let evaluatable_assets = self
                .client_evaluatable_assets()
                .await?
                .iter()
                .map(|m| ResolvedVc::upcast(*m))
                .collect();
            let client_chunk_group = client_chunking_context.evaluated_chunk_group(
                AssetIdent::from_path(this.page.await?.base_path.clone()),
                ChunkGroup::Entry(evaluatable_assets),
                module_graph,
                AvailabilityInfo::Root,
            );

            Ok(client_chunk_group)
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
        let node_root = project.client_root().owned().await?;
        let client_relative_path = self.client_relative_path();
        // In development mode, don't include a content hash and put the chunk at e.g.
        // `static/chunks/pages/page2.js`, so that the dev runtime can request it at a known path.
        // https://github.com/vercel/next.js/blob/84873e00874e096e6c4951dcf070e8219ed414e5/packages/next/src/client/route-loader.ts#L256-L271
        let use_fixed_path = this
            .pages_project
            .project()
            .next_mode()
            .await?
            .is_development();
        let page_loader = PageLoaderAsset::new(
            node_root,
            this.pathname.clone(),
            client_relative_path,
            client_chunks,
            project.client_chunking_context(),
            use_fixed_path,
        );
        Ok(Vc::upcast(page_loader))
    }

    #[turbo_tasks::function]
    async fn internal_ssr_chunk_module(self: Vc<Self>) -> Result<Vc<InternalSsrChunkModule>> {
        let this = self.await?;

        let (reference_type, project_root, module_context, edge_module_context) = match this.ty {
            PageEndpointType::Html | PageEndpointType::SsrOnly => (
                ReferenceType::Entry(EntryReferenceSubType::Page),
                this.pages_project.project().project_path().owned().await?,
                this.pages_project.ssr_module_context(),
                this.pages_project.edge_ssr_module_context(),
            ),
            PageEndpointType::Data => (
                ReferenceType::Entry(EntryReferenceSubType::PageData),
                this.pages_project.project().project_path().owned().await?,
                this.pages_project.ssr_module_context(),
                this.pages_project.edge_ssr_module_context(),
            ),
            PageEndpointType::Api => (
                ReferenceType::Entry(EntryReferenceSubType::PagesApi),
                this.pages_project.project().project_path().owned().await?,
                this.pages_project.api_module_context(),
                this.pages_project.edge_api_module_context(),
            ),
        };

        let config =
            parse_segment_config_from_source(self.source(), ParseSegmentMode::Base).await?;

        let runtime = config.runtime.unwrap_or(NextRuntime::NodeJs);

        Ok(
            // `/_app` and `/_document` never get rendered directly so they don't need to be
            // wrapped in the route module, and don't need to be handled as edge runtime as the
            // rendering for edge is part of the page bundle.
            if this.pathname == "/_app" || this.pathname == "/_document" {
                let ssr_module = module_context
                    .process(self.source(), reference_type)
                    .module();
                InternalSsrChunkModule {
                    ssr_module: ssr_module.to_resolved().await?,
                    app_module: None,
                    document_module: None,
                    // /_app and /_document are always rendered for Node.js for this case. For edge
                    // they're included in the page bundle.
                    runtime: NextRuntime::NodeJs,
                    regions: config.preferred_region.clone(),
                }
            } else if runtime == NextRuntime::Edge {
                let modules = create_page_ssr_entry_module(
                    this.pathname.clone(),
                    reference_type,
                    project_root,
                    Vc::upcast(edge_module_context),
                    self.source(),
                    this.original_name.clone(),
                    *this.pages_structure,
                    runtime,
                    this.pages_project.project().next_config(),
                )
                .await?;

                InternalSsrChunkModule {
                    ssr_module: modules.ssr_module,
                    app_module: modules.app_module,
                    document_module: modules.document_module,
                    runtime,
                    regions: config.preferred_region.clone(),
                }
            } else {
                let modules = create_page_ssr_entry_module(
                    this.pathname.clone(),
                    reference_type,
                    project_root,
                    Vc::upcast(module_context),
                    self.source(),
                    this.original_name.clone(),
                    *this.pages_structure,
                    runtime,
                    this.pages_project.project().next_config(),
                )
                .await?;
                InternalSsrChunkModule {
                    ssr_module: modules.ssr_module,
                    app_module: modules.app_module,
                    document_module: modules.document_module,
                    runtime,
                    regions: config.preferred_region.clone(),
                }
            }
            .cell(),
        )
    }

    #[turbo_tasks::function]
    async fn internal_ssr_chunk(
        self: Vc<Self>,
        ty: SsrChunkType,
        emit_manifests: EmitManifests,
        node_path: FileSystemPath,
        node_chunking_context: Vc<NodeJsChunkingContext>,
        edge_chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<SsrChunk>> {
        async move {
            let this = self.await?;

            let InternalSsrChunkModule {
                ssr_module,
                app_module,
                document_module,
                runtime,
                ref regions,
            } = *self.internal_ssr_chunk_module().await?;

            let project = this.pages_project.project();
            // The SSR and Client Graphs are not connected in Pages Router.
            // We are only interested in get_next_dynamic_imports_for_endpoint at the
            // moment, which only needs the client graph anyway.
            let ssr_module_graph = self.ssr_module_graph();

            let next_dynamic_imports = if let PageEndpointType::Html = this.ty {
                let client_availability_info = self.client_chunk_group().await?.availability_info;

                let client_module_graph = self.client_module_graph();

                let global_information = get_global_information_for_endpoint(
                    client_module_graph,
                    *project.per_page_module_graph().await?,
                );

                // We only validate the global css imports when there is not a `app` folder at the
                // root of the project.
                if project.app_project().await?.is_none() {
                    // We recreate the app_module here because the one provided from the
                    // `internal_ssr_chunk_module` is not the same as the one
                    // provided from the `client_module_graph`. There can be cases where
                    // the `app_module` is None, and we are processing the `pages/_app.js` file
                    // as a page rather than the app module.
                    let app_module = project
                        .pages_project()
                        .client_module_context()
                        .process(
                            Vc::upcast(FileSource::new(
                                this.pages_structure.await?.app.file_path().owned().await?,
                            )),
                            ReferenceType::Entry(EntryReferenceSubType::Page),
                        )
                        .to_resolved()
                        .await?
                        .module();

                    global_information
                        .validate_pages_css_imports(self.client_module(), app_module)
                        .await?;
                }

                let next_dynamic_imports = global_information
                    .get_next_dynamic_imports_for_endpoint(self.client_module())
                    .await?;
                Some((next_dynamic_imports, client_availability_info))
            } else {
                None
            };

            let dynamic_import_entries = if let Some((
                next_dynamic_imports,
                client_availability_info,
            )) = next_dynamic_imports
            {
                collect_next_dynamic_chunks(
                    self.client_module_graph(),
                    project.client_chunking_context(),
                    next_dynamic_imports,
                    NextDynamicChunkAvailability::AvailabilityInfo(client_availability_info),
                )
                .await?
            } else {
                DynamicImportedChunks::default().resolved_cell()
            };

            let chunking_context: Vc<Box<dyn ChunkingContext>> = match runtime {
                NextRuntime::NodeJs => Vc::upcast(node_chunking_context),
                NextRuntime::Edge => edge_chunking_context,
            };

            let mut current_chunks = OutputAssets::empty();
            let mut current_referenced_assets = OutputAssets::empty();
            let mut current_availability_info = AvailabilityInfo::Root;
            for layout in [document_module, app_module].iter().flatten().copied() {
                let span = tracing::trace_span!(
                    "layout segment",
                    name = display(layout.ident().to_string().await?)
                );
                async {
                    let ChunkGroupResult {
                        assets,
                        referenced_assets,
                        availability_info,
                    } = *chunking_context
                        .chunk_group(
                            layout.ident(),
                            ChunkGroup::Shared(layout),
                            ssr_module_graph,
                            current_availability_info,
                        )
                        .await?;

                    current_chunks = current_chunks.concatenate(*assets).resolve().await?;
                    current_referenced_assets = current_referenced_assets
                        .concatenate(*referenced_assets)
                        .resolve()
                        .await?;
                    current_availability_info = availability_info;

                    anyhow::Ok(())
                }
                .instrument(span)
                .await?;
            }

            let ssr_module_evaluatable = ResolvedVc::try_sidecast(ssr_module)
                .context("could not process page loader entry module")?;
            let is_edge = matches!(runtime, NextRuntime::Edge);
            if is_edge {
                let OutputAssetsWithReferenced {
                    assets: edge_assets,
                    referenced_assets: edge_referenced_assets,
                } = *edge_chunking_context
                    .evaluated_chunk_group_assets(
                        ssr_module.ident(),
                        ChunkGroup::Entry(vec![ResolvedVc::upcast(ssr_module_evaluatable)]),
                        ssr_module_graph,
                        current_availability_info,
                    )
                    .await?;

                Ok(SsrChunk::Edge {
                    assets: current_chunks
                        .concatenate(*edge_assets)
                        .to_resolved()
                        .await?,
                    referenced_assets: current_referenced_assets
                        .concatenate(*edge_referenced_assets)
                        .to_resolved()
                        .await?,
                    dynamic_import_entries,
                    regions: regions.clone(),
                }
                .cell())
            } else {
                let pathname = &this.pathname;

                let asset_path = get_asset_path_from_pathname(pathname, ".js");

                let ssr_entry_chunk_path_string = format!("pages{asset_path}");
                let ssr_entry_chunk_path = node_path.join(&ssr_entry_chunk_path_string)?;
                let ssr_entry_chunk = node_chunking_context
                    .entry_chunk_group_asset(
                        ssr_entry_chunk_path,
                        EvaluatableAssets::empty().with_entry(*ssr_module_evaluatable),
                        ssr_module_graph,
                        current_chunks,
                        current_referenced_assets,
                        current_availability_info,
                    )
                    .to_resolved()
                    .await?;

                let server_asset_trace_file = if this
                    .pages_project
                    .project()
                    .next_mode()
                    .await?
                    .is_production()
                {
                    let additional_assets = if emit_manifests == EmitManifests::Full {
                        self.react_loadable_manifest(*dynamic_import_entries, NextRuntime::NodeJs)
                            .await?
                            .iter()
                            .map(|m| **m)
                            .collect()
                    } else {
                        vec![]
                    };

                    ResolvedVc::cell(Some(ResolvedVc::upcast(
                        NftJsonAsset::new(
                            project,
                            Some(pages_function_name(&this.original_name).into()),
                            *ssr_entry_chunk,
                            additional_assets,
                        )
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
    async fn ssr_chunk(self: Vc<Self>, emit_manifests: EmitManifests) -> Result<Vc<SsrChunk>> {
        let this = self.await?;
        let project = this.pages_project.project();
        Ok(self.internal_ssr_chunk(
            SsrChunkType::Page,
            emit_manifests,
            this.pages_project
                .project()
                .node_root()
                .await?
                .join("server")?,
            project.server_chunking_context(true),
            project.edge_chunking_context(true),
        ))
    }

    #[turbo_tasks::function]
    async fn ssr_data_chunk(self: Vc<Self>, emit_manifests: EmitManifests) -> Result<Vc<SsrChunk>> {
        let this = self.await?;
        Ok(self.internal_ssr_chunk(
            SsrChunkType::Data,
            emit_manifests,
            this.pages_project
                .project()
                .node_root()
                .await?
                .join("server/data")?,
            this.pages_project.project().server_chunking_context(true),
            this.pages_project.project().edge_chunking_context(true),
        ))
    }

    #[turbo_tasks::function]
    async fn api_chunk(self: Vc<Self>, emit_manifests: EmitManifests) -> Result<Vc<SsrChunk>> {
        let this = self.await?;
        Ok(self.internal_ssr_chunk(
            SsrChunkType::Api,
            emit_manifests,
            this.pages_project
                .project()
                .node_root()
                .await?
                .join("server")?,
            this.pages_project.project().server_chunking_context(false),
            this.pages_project.project().edge_chunking_context(false),
        ))
    }

    #[turbo_tasks::function]
    async fn pages_manifest(
        &self,
        entry_chunk: Vc<Box<dyn OutputAsset>>,
    ) -> Result<Vc<Box<dyn OutputAsset>>> {
        let node_root = self.pages_project.project().node_root().await?;

        // Check if we should include pages in the manifest
        let pages_structure = self.pages_structure.await?;
        let pages = if pages_structure.should_create_pages_entries {
            let chunk_path = entry_chunk.path().await?;
            let asset_path = node_root
                .join("server")?
                .get_path_to(&chunk_path)
                .context("ssr chunk entry path must be inside the node root")?;
            [(self.pathname.clone(), asset_path.into())]
                .into_iter()
                .collect()
        } else {
            FxIndexMap::default() // Empty pages when no user pages should be created
        };

        let pages_manifest = PagesManifest { pages };
        let manifest_path_prefix = get_asset_prefix_from_pathname(&self.pathname);
        let asset = Vc::upcast(VirtualOutputAsset::new(
            node_root.join(&format!(
                "server/pages{manifest_path_prefix}/pages-manifest.json",
            ))?,
            AssetContent::file(File::from(serde_json::to_string_pretty(&pages_manifest)?).into()),
        ));
        Ok(asset)
    }

    #[turbo_tasks::function]
    async fn react_loadable_manifest(
        &self,
        dynamic_import_entries: Vc<DynamicImportedChunks>,
        runtime: NextRuntime,
    ) -> Result<Vc<OutputAssets>> {
        let node_root = self.pages_project.project().node_root().owned().await?;
        let client_relative_path = self
            .pages_project
            .project()
            .client_relative_path()
            .owned()
            .await?;
        let loadable_path_prefix = get_asset_prefix_from_pathname(&self.pathname);
        Ok(create_react_loadable_manifest(
            dynamic_import_entries,
            client_relative_path,
            node_root.join(&format!(
                "server/pages{loadable_path_prefix}/react-loadable-manifest",
            ))?,
            runtime,
        ))
    }

    #[turbo_tasks::function]
    async fn build_manifest(
        &self,
        client_chunks: ResolvedVc<OutputAssets>,
    ) -> Result<Vc<Box<dyn OutputAsset>>> {
        let node_root = self.pages_project.project().node_root().owned().await?;
        let client_relative_path = self
            .pages_project
            .project()
            .client_relative_path()
            .owned()
            .await?;

        // Check if we should include pages in the manifest
        let pages_structure = self.pages_structure.await?;
        let pages = if pages_structure.should_create_pages_entries {
            fxindexmap!(self.pathname.clone() => client_chunks)
        } else {
            fxindexmap![] // Empty pages when no user pages should be created
        };

        let manifest_path_prefix = get_asset_prefix_from_pathname(&self.pathname);
        let build_manifest = BuildManifest {
            output_path: node_root.join(&format!(
                "server/pages{manifest_path_prefix}/build-manifest.json",
            ))?,
            client_relative_path,
            pages,
            polyfill_files: Default::default(),
            root_main_files: Default::default(),
        };
        Ok(Vc::upcast(build_manifest.cell()))
    }

    #[turbo_tasks::function]
    async fn client_build_manifest(
        &self,
        page_loader: ResolvedVc<Box<dyn OutputAsset>>,
    ) -> Result<Vc<Box<dyn OutputAsset>>> {
        let node_root = self.pages_project.project().node_root().await?;
        let client_relative_path = self
            .pages_project
            .project()
            .client_relative_path()
            .owned()
            .await?;

        // Check if we should include pages in the manifest
        let pages_structure = self.pages_structure.await?;
        let pages = if pages_structure.should_create_pages_entries {
            fxindexmap!(self.pathname.clone() => page_loader)
        } else {
            fxindexmap![] // Empty pages when no user pages should be created
        };

        let manifest_path_prefix = get_asset_prefix_from_pathname(&self.pathname);
        let client_build_manifest = ClientBuildManifest {
            output_path: node_root.join(&format!(
                "server/pages{manifest_path_prefix}/client-build-manifest.json",
            ))?,
            client_relative_path,
            pages,
        };

        Ok(Vc::upcast(client_build_manifest.cell()))
    }

    #[turbo_tasks::function]
    async fn output(self: Vc<Self>) -> Result<Vc<PageEndpointOutput>> {
        let this = self.await?;

        let mut server_assets = vec![];
        let mut client_assets = vec![];

        let emit_manifests = match this.ty {
            PageEndpointType::Html | PageEndpointType::SsrOnly => EmitManifests::Full,
            PageEndpointType::Api => EmitManifests::Minimal,
            PageEndpointType::Data => EmitManifests::None,
        };

        let ssr_chunk = match this.ty {
            PageEndpointType::Html => {
                let client_chunk_group = self.client_chunk_group().await?;
                let client_chunks = *client_chunk_group.assets;
                client_assets.extend(client_chunks.await?.iter().map(|asset| **asset));
                client_assets.extend(
                    client_chunk_group
                        .referenced_assets
                        .await?
                        .iter()
                        .map(|asset| **asset),
                );

                let build_manifest = self.build_manifest(client_chunks).to_resolved().await?;
                let page_loader = self.page_loader(client_chunks);
                let client_build_manifest = self
                    .client_build_manifest(page_loader)
                    .to_resolved()
                    .await?;
                client_assets.push(page_loader);
                server_assets.push(build_manifest);
                server_assets.push(client_build_manifest);

                self.ssr_chunk(emit_manifests)
            }

            PageEndpointType::Data => self.ssr_data_chunk(emit_manifests),
            PageEndpointType::Api => self.api_chunk(emit_manifests),
            PageEndpointType::SsrOnly => self.ssr_chunk(emit_manifests),
        };

        let client_assets = OutputAssets::new(client_assets).to_resolved().await?;

        let manifest_path_prefix = get_asset_prefix_from_pathname(&this.pathname);
        let node_root = this.pages_project.project().node_root().owned().await?;

        if emit_manifests == EmitManifests::Full {
            let next_font_manifest_output = ResolvedVc::upcast(
                FontManifest {
                    client_root: this.pages_project.project().client_root().owned().await?,
                    node_root: node_root.clone(),
                    dir: this.pages_project.pages_dir().owned().await?,
                    original_name: this.original_name.clone(),
                    manifest_path_prefix: manifest_path_prefix.clone().into(),
                    pathname: this.pathname.clone(),
                    client_assets,
                    app_dir: false,
                }
                .resolved_cell(),
            );
            server_assets.push(next_font_manifest_output);
        }

        if *this
            .pages_project
            .project()
            .should_create_webpack_stats()
            .await?
        {
            let webpack_stats = generate_webpack_stats(
                self.client_module_graph(),
                this.original_name.clone(),
                client_assets.await?.iter().copied(),
            )
            .await?;
            let stats_output = VirtualOutputAsset::new(
                node_root.join(&format!(
                    "server/pages{manifest_path_prefix}/webpack-stats.json",
                ))?,
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
                // Only include the actual SSR entry chunk if pages should be created
                let pages_structure = this.pages_structure.await?;
                if pages_structure.should_create_pages_entries {
                    server_assets.push(entry);
                    if let Some(server_asset_trace_file) = &*server_asset_trace_file.await? {
                        server_assets.push(*server_asset_trace_file);
                    }
                }

                if emit_manifests != EmitManifests::None {
                    let pages_manifest = self.pages_manifest(*entry).to_resolved().await?;
                    server_assets.push(pages_manifest);
                }
                if emit_manifests == EmitManifests::Full {
                    let loadable_manifest_output =
                        self.react_loadable_manifest(*dynamic_import_entries, NextRuntime::NodeJs);
                    server_assets.extend(loadable_manifest_output.await?.iter().copied());
                }

                PageEndpointOutput::NodeJs {
                    entry_chunk: entry,
                    server_assets: ResolvedVc::cell(server_assets),
                    client_assets,
                }
            }
            SsrChunk::Edge {
                assets,
                referenced_assets,
                dynamic_import_entries,
                ref regions,
            } => {
                let node_root = this.pages_project.project().node_root().owned().await?;
                if emit_manifests != EmitManifests::None {
                    // the next-edge-ssr-loader templates expect the manifests to be stored in
                    // global variables defined in these files
                    //
                    // they are created in `setup-dev-bundler.ts`
                    let mut file_paths_from_root = if emit_manifests == EmitManifests::Full {
                        fxindexset![
                            rcstr!("server/server-reference-manifest.js"),
                            rcstr!("server/middleware-build-manifest.js"),
                            rcstr!("server/next-font-manifest.js"),
                        ]
                    } else {
                        fxindexset![]
                    };

                    let all_assets = assets.concatenate(*referenced_assets);
                    let assets_ref = assets.await?;

                    server_assets.extend(referenced_assets.await?.iter().copied());

                    // TODO(sokra): accessing the 1st asset is a bit hacky, we should find a better
                    // way to get the main entry asset
                    if let Some(&file) = assets_ref.first() {
                        let pages_manifest = self.pages_manifest(*file).to_resolved().await?;
                        server_assets.push(pages_manifest);
                    }

                    // Only include the actual edge files if pages should be created
                    let pages_structure = this.pages_structure.await?;
                    if pages_structure.should_create_pages_entries {
                        server_assets.extend(assets_ref.iter().copied());
                        file_paths_from_root
                            .extend(get_js_paths_from_root(&node_root, &assets_ref).await?);
                    }

                    if emit_manifests == EmitManifests::Full {
                        let loadable_manifest_output = self
                            .react_loadable_manifest(*dynamic_import_entries, NextRuntime::Edge)
                            .await?;
                        if pages_structure.should_create_pages_entries {
                            server_assets.extend(loadable_manifest_output.iter().copied());
                            file_paths_from_root.extend(
                                get_js_paths_from_root(&node_root, &loadable_manifest_output)
                                    .await?,
                            );
                        }
                    }

                    let (wasm_paths_from_root, all_assets) =
                        if pages_structure.should_create_pages_entries {
                            let all_output_assets = all_assets_from_entries(all_assets).await?;

                            let mut wasm_paths_from_root = fxindexset![];
                            wasm_paths_from_root.extend(
                                get_wasm_paths_from_root(&node_root, &all_output_assets).await?,
                            );

                            let all_assets =
                                get_asset_paths_from_root(&node_root, &all_output_assets).await?;

                            (wasm_paths_from_root, all_assets)
                        } else {
                            (fxindexset![], vec![])
                        };

                    let named_regex = get_named_middleware_regex(&this.pathname).into();
                    let matchers = ProxyMatcher {
                        regexp: Some(named_regex),
                        original_source: this.pathname.clone(),
                        ..Default::default()
                    };
                    let regions = if let Some(regions) = regions.as_ref() {
                        if regions.len() == 1 {
                            regions
                                .first()
                                .map(|region| Regions::Single(region.clone()))
                        } else {
                            Some(Regions::Multiple(regions.clone()))
                        }
                    } else {
                        None
                    };

                    let edge_function_definition = EdgeFunctionDefinition {
                        files: file_paths_from_root.into_iter().collect(),
                        wasm: wasm_paths_to_bindings(wasm_paths_from_root).await?,
                        assets: paths_to_bindings(all_assets),
                        name: pages_function_name(&this.original_name).into(),
                        page: this.original_name.clone(),
                        regions,
                        matchers: vec![matchers],
                        env: this.pages_project.project().edge_env().owned().await?,
                    };
                    let middleware_manifest_v2 = MiddlewaresManifestV2 {
                        sorted_middleware: vec![this.pathname.clone()],
                        functions: [(this.pathname.clone(), edge_function_definition)]
                            .into_iter()
                            .collect(),
                        ..Default::default()
                    };
                    let manifest_path_prefix = get_asset_prefix_from_pathname(&this.pathname);
                    let middleware_manifest_v2 = VirtualOutputAsset::new(
                        node_root.join(&format!(
                            "server/pages{manifest_path_prefix}/middleware-manifest.json",
                        ))?,
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

                PageEndpointOutput::Edge {
                    files: assets,
                    server_assets: ResolvedVc::cell(server_assets),
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
                .owned()
                .await?,
        )))
    }
}

#[turbo_tasks::value]
pub struct InternalSsrChunkModule {
    pub ssr_module: ResolvedVc<Box<dyn Module>>,
    pub app_module: Option<ResolvedVc<Box<dyn Module>>>,
    pub document_module: Option<ResolvedVc<Box<dyn Module>>>,
    pub runtime: NextRuntime,
    pub regions: Option<Vec<RcStr>>,
}

#[turbo_tasks::value_impl]
impl Endpoint for PageEndpoint {
    #[turbo_tasks::function]
    async fn output(self: ResolvedVc<Self>) -> Result<Vc<EndpointOutput>> {
        let this = &*self.await?;
        let original_name = &this.original_name;
        let span = {
            match &this.ty {
                PageEndpointType::Html => {
                    tracing::info_span!("page endpoint HTML", name = display(original_name))
                }
                PageEndpointType::Data => {
                    tracing::info_span!("page endpoint data", name = display(original_name))
                }
                PageEndpointType::Api => {
                    tracing::info_span!("page endpoint API", name = display(original_name))
                }
                PageEndpointType::SsrOnly => {
                    tracing::info_span!("page endpoint SSR", name = display(original_name))
                }
            }
        };
        async move {
            let output = self.output().await?;
            let output_assets = self.output().output_assets();

            let node_root = this.pages_project.project().node_root().owned().await?;

            let (server_paths, client_paths) = if this
                .pages_project
                .project()
                .next_mode()
                .await?
                .is_development()
            {
                let server_paths = all_server_paths(output_assets, node_root.clone())
                    .owned()
                    .await?;

                let client_relative_root = this
                    .pages_project
                    .project()
                    .client_relative_path()
                    .owned()
                    .await?;
                let client_paths = all_paths_in_root(output_assets, client_relative_root)
                    .owned()
                    .await?;
                (server_paths, client_paths)
            } else {
                (vec![], vec![])
            };

            let node_root = node_root.clone();
            let written_endpoint = match *output {
                PageEndpointOutput::NodeJs { entry_chunk, .. } => {
                    // Only set server_entry_path if pages should be created
                    let pages_structure = this.pages_structure.await?;
                    let server_entry_path = if pages_structure.should_create_pages_entries {
                        node_root
                            .get_path_to(&*entry_chunk.path().await?)
                            .context("ssr chunk entry path must be inside the node root")?
                            .into()
                    } else {
                        rcstr!("") // Empty path when no pages should be created
                    };

                    EndpointOutputPaths::NodeJs {
                        server_entry_path,
                        server_paths,
                        client_paths,
                    }
                }
                PageEndpointOutput::Edge { .. } => EndpointOutputPaths::Edge {
                    server_paths,
                    client_paths,
                },
            };

            anyhow::Ok(
                EndpointOutput {
                    output_assets: output_assets.to_resolved().await?,
                    output_paths: written_endpoint.resolved_cell(),
                    project: this.pages_project.project().to_resolved().await?,
                }
                .cell(),
            )
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
    async fn entries(self: Vc<Self>) -> Result<Vc<GraphEntries>> {
        let this = self.await?;

        let ssr_chunk_module = self.internal_ssr_chunk_module().await?;

        let shared_entries = [
            ssr_chunk_module.document_module,
            ssr_chunk_module.app_module,
        ];

        let modules = shared_entries
            .into_iter()
            .flatten()
            .map(ChunkGroupEntry::Shared)
            .chain(std::iter::once(ChunkGroupEntry::Entry(vec![
                ssr_chunk_module.ssr_module,
            ])))
            .chain(if this.ty == PageEndpointType::Html {
                Some(ChunkGroupEntry::Entry(
                    self.client_evaluatable_assets()
                        .await?
                        .iter()
                        .map(|m| ResolvedVc::upcast(*m))
                        .collect(),
                ))
                .into_iter()
            } else {
                None.into_iter()
            })
            .collect::<Vec<_>>();

        Ok(Vc::cell(modules))
    }
}

#[turbo_tasks::value]
enum PageEndpointOutput {
    NodeJs {
        entry_chunk: ResolvedVc<Box<dyn OutputAsset>>,
        server_assets: ResolvedVc<OutputAssets>,
        client_assets: ResolvedVc<OutputAssets>,
    },
    Edge {
        files: ResolvedVc<OutputAssets>,
        server_assets: ResolvedVc<OutputAssets>,
        client_assets: ResolvedVc<OutputAssets>,
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
            | PageEndpointOutput::Edge { server_assets, .. } => *server_assets,
        }
    }

    #[turbo_tasks::function]
    pub fn client_assets(&self) -> Vc<OutputAssets> {
        match *self {
            PageEndpointOutput::NodeJs { client_assets, .. }
            | PageEndpointOutput::Edge { client_assets, .. } => *client_assets,
        }
    }
}

#[turbo_tasks::value]
pub enum SsrChunk {
    NodeJs {
        entry: ResolvedVc<Box<dyn OutputAsset>>,
        dynamic_import_entries: ResolvedVc<DynamicImportedChunks>,
        server_asset_trace_file: ResolvedVc<OptionOutputAsset>,
    },
    Edge {
        assets: ResolvedVc<OutputAssets>,
        referenced_assets: ResolvedVc<OutputAssets>,
        dynamic_import_entries: ResolvedVc<DynamicImportedChunks>,
        regions: Option<Vec<RcStr>>,
    },
}
