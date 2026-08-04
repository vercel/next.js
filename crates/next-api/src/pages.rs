use anyhow::{Context, Result, bail};
use bincode::{Decode, Encode};
use futures::future::BoxFuture;
use next_core::{
    PageLoaderAsset,
    app_structure::FileSystemPathVec,
    create_page_loader_entry_module, get_asset_path_from_pathname,
    get_edge_resolve_options_context,
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
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    Completion, FxIndexMap, ResolvedVc, ValueToString, Vc, fxindexmap, fxindexset,
    trace::TraceRawVcs,
};
use turbo_tasks_fs::{
    self, File, FileContent, FileSystem, FileSystemPath, FileSystemPathOption, VirtualFileSystem,
};
use turbopack::{
    ModuleAssetContext,
    module_options::ModuleOptionsContext,
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
        binding_usage_info::compute_binding_usage_info,
        chunk_group_info::{ChunkGroup, ChunkGroupEntry},
    },
    output::{OptionOutputAsset, OutputAsset, OutputAssets},
    reference::all_assets_from_entries,
    reference_type::{EcmaScriptModulesReferenceSubType, EntryReferenceSubType, ReferenceType},
    resolve::{ResolveErrorMode, origin::PlainResolveOrigin, parse::Request, pattern::Pattern},
    source::Source,
    virtual_output::VirtualOutputAsset,
};
use turbopack_nodejs::NodeJsChunkingContext;
use turbopack_resolve::{ecmascript::esm_resolve, resolve_options_context::ResolveOptionsContext};

use crate::{
    dynamic_imports::{
        DynamicImportedChunks, NextDynamicChunkAvailability, collect_next_dynamic_chunks,
    },
    font::FontManifest,
    loadable_manifest::create_react_loadable_manifest,
    module_graph::{NextDynamicGraphs, validate_pages_css_imports},
    nft::{EndpointTraceResult, trace_endpoint},
    nft_json::NftJsonAsset,
    paths::{
        all_asset_paths, all_paths_in_root, get_asset_paths_from_root, get_js_paths_from_root,
        get_wasm_paths_from_root, paths_to_bindings, wasm_paths_to_bindings,
    },
    project::Project,
    route::{Endpoint, EndpointOutput, EndpointOutputPaths, ModuleGraphs, Route, Routes},
    sri_manifest::get_sri_manifest_asset,
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
        } = &*turbo_tasks::read!(pages_structure)?;
        let mut routes = FxIndexMap::default();

        // If pages entries shouldn't be created (build mode with no pages), return empty routes
        if !should_create_pages_entries {
            return Ok(Vc::cell(routes));
        }

        #[cfg(not(feature = "sync"))]
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
            } = &*turbo_tasks::read!(page)?;
            let pathname: RcStr = format!("/{}", next_router_path.path).into();
            let original_name = format!("/{}", original_path.path).into();
            let route = turbo_tasks::read!(make_route(pathname.clone(), original_name, page))?;
            routes.insert(pathname, route);
            Ok(())
        }

        #[cfg(feature = "sync")]
        fn add_page_to_routes(
            routes: &mut FxIndexMap<RcStr, Route>,
            page: Vc<PagesStructureItem>,
            make_route: impl Fn(RcStr, RcStr, Vc<PagesStructureItem>) -> Result<Route>,
        ) -> Result<()> {
            let PagesStructureItem {
                next_router_path,
                original_path,
                ..
            } = &*turbo_tasks::read!(page)?;
            let pathname: RcStr = format!("/{}", next_router_path.path).into();
            let original_name = format!("/{}", original_path.path).into();
            let route = make_route(pathname.clone(), original_name, page)?;
            routes.insert(pathname, route);
            Ok(())
        }

        #[cfg(not(feature = "sync"))]
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
                } = *turbo_tasks::read!(dir)?;
                for &item in items.iter() {
                    turbo_tasks::read!(add_page_to_routes(routes, *item, &make_route))?;
                }
                for &child in children.iter() {
                    queue.push(*child);
                }
            }
            Ok(())
        }

        #[cfg(feature = "sync")]
        fn add_dir_to_routes(
            routes: &mut FxIndexMap<RcStr, Route>,
            dir: Vc<PagesDirectoryStructure>,
            make_route: impl Fn(RcStr, RcStr, Vc<PagesStructureItem>) -> Result<Route>,
        ) -> Result<()> {
            let mut queue = vec![dir];
            while let Some(dir) = queue.pop() {
                let PagesDirectoryStructure {
                    ref items,
                    ref children,
                    next_router_path: _,
                    project_path: _,
                } = *turbo_tasks::read!(dir)?;
                for &item in items.iter() {
                    add_page_to_routes(routes, *item, &make_route)?;
                }
                for &child in children.iter() {
                    queue.push(*child);
                }
            }
            Ok(())
        }

        if let Some(api) = *api {
            #[cfg(not(feature = "sync"))]
            turbo_tasks::read!(add_dir_to_routes(
                &mut routes,
                *api,
                |pathname, original_name, page| {
                    Box::pin(async move {
                        Ok(Route::PageApi {
                            endpoint: ResolvedVc::upcast(turbo_tasks::read!(
                                PageEndpoint::new(
                                    PageEndpointType::Api,
                                    self,
                                    pathname,
                                    original_name,
                                    page,
                                    pages_structure,
                                )
                                .to_resolved()
                            )?),
                        })
                    })
                }
            ))?;
            #[cfg(feature = "sync")]
            add_dir_to_routes(&mut routes, *api, |pathname, original_name, page| {
                Ok(Route::PageApi {
                    endpoint: ResolvedVc::upcast(turbo_tasks::read!(
                        PageEndpoint::new(
                            PageEndpointType::Api,
                            self,
                            pathname,
                            original_name,
                            page,
                            pages_structure,
                        )
                        .to_resolved()
                    )?),
                })
            })?;
        }

        #[cfg(not(feature = "sync"))]
        let make_page_route = |pathname: RcStr, original_name: RcStr, page| -> BoxFuture<_> {
            Box::pin(async move {
                Ok(Route::Page {
                    html_endpoint: ResolvedVc::upcast(turbo_tasks::read!(
                        PageEndpoint::new(
                            PageEndpointType::Html,
                            self,
                            pathname.clone(),
                            original_name.clone(),
                            page,
                            pages_structure,
                        )
                        .to_resolved()
                    )?),
                    // The data endpoint is only needed in development mode to support HMR
                    data_endpoint: if turbo_tasks::read!(self.project().next_mode())?
                        .is_development()
                    {
                        Some(ResolvedVc::upcast(turbo_tasks::read!(
                            PageEndpoint::new(
                                PageEndpointType::Data,
                                self,
                                pathname,
                                original_name,
                                page,
                                pages_structure,
                            )
                            .to_resolved()
                        )?))
                    } else {
                        None
                    },
                })
            })
        };

        #[cfg(feature = "sync")]
        let make_page_route = |pathname: RcStr, original_name: RcStr, page| -> Result<Route> {
            Ok(Route::Page {
                html_endpoint: ResolvedVc::upcast(turbo_tasks::read!(
                    PageEndpoint::new(
                        PageEndpointType::Html,
                        self,
                        pathname.clone(),
                        original_name.clone(),
                        page,
                        pages_structure,
                    )
                    .to_resolved()
                )?),
                // The data endpoint is only needed in development mode to support HMR
                data_endpoint: if turbo_tasks::read!(self.project().next_mode())?.is_development() {
                    Some(ResolvedVc::upcast(turbo_tasks::read!(
                        PageEndpoint::new(
                            PageEndpointType::Data,
                            self,
                            pathname,
                            original_name,
                            page,
                            pages_structure,
                        )
                        .to_resolved()
                    )?))
                } else {
                    None
                },
            })
        };

        if let Some(pages) = *pages {
            turbo_tasks::read!(add_dir_to_routes(&mut routes, *pages, make_page_route))?;
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
        } = &*turbo_tasks::read!(item)?;
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
            *turbo_tasks::read!(self.pages_structure())?.document,
            PageEndpointType::SsrOnly,
        ))
    }

    #[turbo_tasks::function]
    pub async fn app_endpoint(self: Vc<Self>) -> Result<Vc<Box<dyn Endpoint>>> {
        Ok(self.to_endpoint(
            *turbo_tasks::read!(self.pages_structure())?.app,
            PageEndpointType::Html,
        ))
    }

    #[turbo_tasks::function]
    pub async fn error_endpoint(self: Vc<Self>) -> Result<Vc<Box<dyn Endpoint>>> {
        Ok(self.to_endpoint(
            *turbo_tasks::read!(self.pages_structure())?.error,
            PageEndpointType::Html,
        ))
    }

    #[turbo_tasks::function]
    fn project(&self) -> Vc<Project> {
        *self.project
    }

    #[turbo_tasks::function]
    async fn pages_structure(&self) -> Result<Vc<PagesStructure>> {
        let next_router_fs = Vc::upcast::<Box<dyn FileSystem>>(VirtualFileSystem::new());
        let next_router_root = turbo_tasks::read!(next_router_fs.root().owned())?;
        Ok(find_pages_structure(
            turbo_tasks::read!(self.project.project_path().owned())?,
            next_router_root,
            self.project.next_config().page_extensions(),
            self.project.next_mode(),
        ))
    }

    #[turbo_tasks::function]
    async fn pages_dir(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        Ok(
            if let Some(pages) = turbo_tasks::read!(self.pages_structure())?.pages {
                pages.project_path()
            } else {
                turbo_tasks::read!(self.project().project_path())?
                    .join("pages")?
                    .cell()
            },
        )
    }

    #[turbo_tasks::function]
    async fn client_transitions(self: Vc<Self>) -> Result<Vc<TransitionOptions>> {
        Ok(TransitionOptions {
            named_transitions: [
                (
                    rcstr!("next-dynamic"),
                    ResolvedVc::upcast(turbo_tasks::read!(
                        NextDynamicTransition::new_marker().to_resolved()
                    )?),
                ),
                (
                    rcstr!("next-dynamic-client"),
                    ResolvedVc::upcast(turbo_tasks::read!(
                        NextDynamicTransition::new_marker().to_resolved()
                    )?),
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
                    ResolvedVc::upcast(turbo_tasks::read!(
                        NextDynamicTransition::new_marker().to_resolved()
                    )?),
                ),
                (
                    rcstr!("next-dynamic-client"),
                    ResolvedVc::upcast(turbo_tasks::read!(
                        NextDynamicTransition::new_client(self.client_transition()).to_resolved()
                    )?),
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
            turbo_tasks::read!(self.project().project_path().owned())?,
            self.project().execution_context(),
            self.project().client_compile_time_info().environment(),
            ClientContextType::Pages {
                pages_dir: turbo_tasks::read!(self.pages_dir().owned())?,
            },
            self.project().next_mode(),
            self.project().next_config(),
            self.project().encryption_key(),
        ))
    }

    #[turbo_tasks::function]
    async fn client_resolve_options_context(self: Vc<Self>) -> Result<Vc<ResolveOptionsContext>> {
        Ok(get_client_resolve_options_context(
            turbo_tasks::read!(self.project().project_path().owned())?,
            ClientContextType::Pages {
                pages_dir: turbo_tasks::read!(self.pages_dir().owned())?,
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
            turbo_tasks::read!(self.project().project_path().owned())?,
            self.project().execution_context(),
            ServerContextType::Pages {
                pages_dir: turbo_tasks::read!(self.pages_dir().owned())?,
            },
            self.project().next_mode(),
            self.project().next_config(),
            NextRuntime::NodeJs,
            self.project().encryption_key(),
            self.project().server_compile_time_info().environment(),
            self.project().client_compile_time_info().environment(),
            *turbo_tasks::read!(self.project().should_write_nft_manifests())?,
        ))
    }

    #[turbo_tasks::function]
    async fn edge_ssr_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        Ok(get_server_module_options_context(
            turbo_tasks::read!(self.project().project_path().owned())?,
            self.project().execution_context(),
            ServerContextType::Pages {
                pages_dir: turbo_tasks::read!(self.pages_dir().owned())?,
            },
            self.project().next_mode(),
            self.project().next_config(),
            NextRuntime::Edge,
            self.project().encryption_key(),
            self.project().edge_compile_time_info().environment(),
            self.project().client_compile_time_info().environment(),
            // There is no NFT on edge,
            false,
        ))
    }

    #[turbo_tasks::function]
    async fn api_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        Ok(get_server_module_options_context(
            turbo_tasks::read!(self.project().project_path().owned())?,
            self.project().execution_context(),
            ServerContextType::PagesApi {
                pages_dir: turbo_tasks::read!(self.pages_dir().owned())?,
            },
            self.project().next_mode(),
            self.project().next_config(),
            NextRuntime::NodeJs,
            self.project().encryption_key(),
            self.project().server_compile_time_info().environment(),
            self.project().client_compile_time_info().environment(),
            *turbo_tasks::read!(self.project().should_write_nft_manifests())?,
        ))
    }

    #[turbo_tasks::function]
    async fn edge_api_module_options_context(self: Vc<Self>) -> Result<Vc<ModuleOptionsContext>> {
        Ok(get_server_module_options_context(
            turbo_tasks::read!(self.project().project_path().owned())?,
            self.project().execution_context(),
            ServerContextType::PagesApi {
                pages_dir: turbo_tasks::read!(self.pages_dir().owned())?,
            },
            self.project().next_mode(),
            self.project().next_config(),
            NextRuntime::Edge,
            self.project().encryption_key(),
            self.project().edge_compile_time_info().environment(),
            self.project().client_compile_time_info().environment(),
            // There is no NFT on edge
            false,
        ))
    }

    #[turbo_tasks::function]
    async fn ssr_resolve_options_context(self: Vc<Self>) -> Result<Vc<ResolveOptionsContext>> {
        Ok(get_server_resolve_options_context(
            turbo_tasks::read!(self.project().project_path().owned())?,
            // NOTE(alexkirsz) This could be `PagesData` for the data endpoint, but it doesn't
            // matter (for now at least) because `get_server_resolve_options_context` doesn't
            // differentiate between the two.
            ServerContextType::Pages {
                pages_dir: turbo_tasks::read!(self.pages_dir().owned())?,
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
            turbo_tasks::read!(self.project().project_path().owned())?,
            // NOTE(alexkirsz) This could be `PagesData` for the data endpoint, but it doesn't
            // matter (for now at least) because `get_server_resolve_options_context` doesn't
            // differentiate between the two.
            ServerContextType::Pages {
                pages_dir: turbo_tasks::read!(self.pages_dir().owned())?,
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
            turbo_tasks::read!(self.project().project_path().owned())?,
            ClientContextType::Pages {
                pages_dir: turbo_tasks::read!(self.pages_dir().owned())?,
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

        let client_main_module = turbo_tasks::read!(
            turbo_tasks::read!(turbo_tasks::read!(esm_resolve(
                Vc::upcast(PlainResolveOrigin::new(
                    client_module_context,
                    turbo_tasks::read!(self.project().project_path())?.join("_")?,
                )),
                Request::parse(Pattern::Constant(
                    match *turbo_tasks::read!(self.project().next_mode())? {
                        NextMode::Development => rcstr!("next/dist/client/next-dev-turbopack.js"),
                        NextMode::Build => rcstr!("next/dist/client/next-turbopack.js"),
                    },
                )),
                EcmaScriptModulesReferenceSubType::Undefined,
                ResolveErrorMode::Error,
                None,
            ))?)?
            .first_module()
        )?
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

#[turbo_tasks::task_input]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, TraceRawVcs, Encode, Decode)]
enum PageEndpointType {
    Api,
    Html,
    // A development only type that is used in pages router so we can differentiate between
    // components changing and server props changing.
    Data,
    // for _document.js
    SsrOnly,
}

#[turbo_tasks::task_input]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, TraceRawVcs, Encode, Decode)]
enum SsrChunkType {
    Page,
    Data,
    Api,
}

#[turbo_tasks::task_input]
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, TraceRawVcs, Encode, Decode)]
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
            turbo_tasks::read!(self.page.file_path().owned())?,
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
        let this = turbo_tasks::read!(self)?;
        let page_loader = create_page_loader_entry_module(
            Vc::upcast(this.pages_project.client_module_context()),
            self.source(),
            this.pathname.clone(),
        );
        if matches!(
            *turbo_tasks::read!(this.pages_project.project().next_mode())?,
            NextMode::Development
        ) && let Some(chunkable) =
            ResolvedVc::try_downcast(turbo_tasks::read!(page_loader.to_resolved())?)
        {
            return Ok(Vc::upcast(HmrEntryModule::new(
                AssetIdent::from_path(turbo_tasks::read!(this.page)?.base_path.clone()).into_vc(),
                *chunkable,
            )));
        }
        Ok(page_loader)
    }

    #[turbo_tasks::function]
    async fn client_evaluatable_assets(self: Vc<Self>) -> Result<Vc<EvaluatableAssets>> {
        let this = turbo_tasks::read!(self)?;

        let client_module = self.client_module();
        let client_main_module = this.pages_project.client_main_module();

        let Some(client_module) = ResolvedVc::try_sidecast::<Box<dyn EvaluatableAsset>>(
            turbo_tasks::read!(client_module.to_resolved())?,
        ) else {
            bail!("expected an evaluateable asset");
        };

        let Some(client_main_module) = ResolvedVc::try_sidecast::<Box<dyn EvaluatableAsset>>(
            turbo_tasks::read!(client_main_module.to_resolved())?,
        ) else {
            bail!("expected an evaluateable asset");
        };

        let evaluatable_assets = this
            .pages_project
            .client_runtime_entries()
            .with_entry(*client_main_module)
            .with_entry(*client_module);
        Ok(evaluatable_assets)
    }

    #[turbo_tasks::function]
    async fn client_module_graph(self: Vc<Self>) -> Result<Vc<ModuleGraph>> {
        let this = turbo_tasks::read!(self)?;
        let project = this.pages_project.project();
        let evaluatable_assets = self.client_evaluatable_assets();
        Ok(project.module_graph_for_modules(evaluatable_assets))
    }

    #[turbo_tasks::function]
    async fn ssr_module_graph(self: Vc<Self>) -> Result<Vc<ModuleGraph>> {
        let this = turbo_tasks::read!(self)?;
        let project = this.pages_project.project();

        if *turbo_tasks::read!(project.per_page_module_graph())? {
            let next_mode = project.next_mode();
            let next_mode_ref = turbo_tasks::read!(next_mode)?;
            let should_trace = *turbo_tasks::read!(project.should_write_nft_manifests())?;
            let should_read_binding_usage = next_mode_ref.is_production();

            let ssr_chunk_module = turbo_tasks::read!(self.internal_ssr_chunk_module())?;
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
                    GraphEntries::from_chunk_groups(vec![ChunkGroupEntry::Shared(module)]),
                    visited_modules,
                    should_trace,
                    should_read_binding_usage,
                );
                graphs.push(graph);
                visited_modules = VisitedModules::concatenate(visited_modules, graph);
            }

            let graph = SingleModuleGraph::new_with_entries_visited_intern(
                GraphEntries::from_chunk_groups(vec![ChunkGroupEntry::Entry(vec![
                    ssr_chunk_module.ssr_module,
                ])]),
                visited_modules,
                should_trace,
                should_read_binding_usage,
            );
            graphs.push(graph);

            let remove_unused_imports = *turbo_tasks::read!(
                project
                    .next_config()
                    .turbopack_remove_unused_imports(next_mode)
            )?;

            let graph = if remove_unused_imports {
                let graph = ModuleGraph::from_graphs(graphs.clone(), None);
                let binding_usage_info = compute_binding_usage_info(graph, true);
                ModuleGraph::from_graphs(graphs, Some(binding_usage_info))
            } else {
                ModuleGraph::from_graphs(graphs, None)
            };

            Ok(graph.connect())
        } else {
            Ok(*turbo_tasks::read!(project.whole_app_module_graphs())?.full)
        }
    }

    #[turbo_tasks::function]
    async fn client_chunk_group(self: Vc<Self>) -> Result<Vc<ChunkGroupResult>> {
        #[cfg(not(feature = "sync"))]
        {
            turbo_tasks::read!(
                async move {
                    let this = turbo_tasks::read!(self)?;

                    let project = this.pages_project.project();
                    let client_chunking_context = project.client_chunking_context();

                    let module_graph = self.client_module_graph();

                    let evaluatable_assets = turbo_tasks::read!(self.client_evaluatable_assets())?
                        .iter()
                        .map(|m| ResolvedVc::upcast(*m))
                        .collect();
                    let client_chunk_group = client_chunking_context.evaluated_chunk_group(
                        AssetIdent::from_path(turbo_tasks::read!(this.page)?.base_path.clone())
                            .into_vc(),
                        ChunkGroup::Entry(evaluatable_assets),
                        module_graph,
                        OutputAssets::empty(),
                        AvailabilityInfo::root(),
                    );

                    Ok(client_chunk_group)
                }
                .instrument(tracing::info_span!("page client side rendering"))
            )
        }
        #[cfg(feature = "sync")]
        {
            let _g = tracing::info_span!("page client side rendering").entered();
            let this = turbo_tasks::read!(self)?;

            let project = this.pages_project.project();
            let client_chunking_context = project.client_chunking_context();

            let module_graph = self.client_module_graph();

            let evaluatable_assets = turbo_tasks::read!(self.client_evaluatable_assets())?
                .iter()
                .map(|m| ResolvedVc::upcast(*m))
                .collect();
            let client_chunk_group = client_chunking_context.evaluated_chunk_group(
                AssetIdent::from_path(turbo_tasks::read!(this.page)?.base_path.clone()).into_vc(),
                ChunkGroup::Entry(evaluatable_assets),
                module_graph,
                OutputAssets::empty(),
                AvailabilityInfo::root(),
            );

            Ok(client_chunk_group)
        }
    }

    #[turbo_tasks::function]
    async fn page_loader(
        self: Vc<Self>,
        client_chunks: Vc<OutputAssets>,
    ) -> Result<Vc<Box<dyn OutputAsset>>> {
        let this = turbo_tasks::read!(self)?;
        let project = this.pages_project.project();
        let node_root = turbo_tasks::read!(project.client_root().owned())?;
        let client_relative_path = self.client_relative_path();
        // In development mode, don't include a content hash and put the chunk at e.g.
        // `static/chunks/pages/page2.js`, so that the dev runtime can request it at a known path.
        // https://github.com/vercel/next.js/blob/84873e00874e096e6c4951dcf070e8219ed414e5/packages/next/src/client/route-loader.ts#L256-L271
        let use_fixed_path =
            turbo_tasks::read!(this.pages_project.project().next_mode())?.is_development();
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
        let this = turbo_tasks::read!(self)?;

        let (reference_type, project_root, module_context, edge_module_context) = match this.ty {
            PageEndpointType::Html | PageEndpointType::SsrOnly => (
                ReferenceType::Entry(EntryReferenceSubType::Page),
                turbo_tasks::read!(this.pages_project.project().project_path().owned())?,
                this.pages_project.ssr_module_context(),
                this.pages_project.edge_ssr_module_context(),
            ),
            PageEndpointType::Data => (
                ReferenceType::Entry(EntryReferenceSubType::PageData),
                turbo_tasks::read!(this.pages_project.project().project_path().owned())?,
                this.pages_project.ssr_module_context(),
                this.pages_project.edge_ssr_module_context(),
            ),
            PageEndpointType::Api => (
                ReferenceType::Entry(EntryReferenceSubType::PagesApi),
                turbo_tasks::read!(this.pages_project.project().project_path().owned())?,
                this.pages_project.api_module_context(),
                this.pages_project.edge_api_module_context(),
            ),
        };

        let config = turbo_tasks::read!(parse_segment_config_from_source(
            self.source(),
            ParseSegmentMode::Base
        ))?;

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
                    ssr_module: turbo_tasks::read!(ssr_module.to_resolved())?,
                    app_module: None,
                    document_module: None,
                    // /_app and /_document are always rendered for Node.js for this case. For edge
                    // they're included in the page bundle.
                    runtime: NextRuntime::NodeJs,
                    regions: config.preferred_region.clone(),
                }
            } else {
                let modules = turbo_tasks::read!(create_page_ssr_entry_module(
                    this.pathname.clone(),
                    reference_type,
                    project_root,
                    if runtime == NextRuntime::Edge {
                        Vc::upcast(edge_module_context)
                    } else {
                        Vc::upcast(module_context)
                    },
                    self.source(),
                    this.original_name.clone(),
                    *this.pages_structure,
                    this.pages_project.project().next_config(),
                    runtime,
                ))?;

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
        #[cfg(not(feature = "sync"))]
        {
            turbo_tasks::read!(
                async move {
                    let this = turbo_tasks::read!(self)?;

                    let InternalSsrChunkModule {
                        ssr_module,
                        app_module,
                        document_module,
                        runtime,
                        ref regions,
                    } = *turbo_tasks::read!(self.internal_ssr_chunk_module())?;

                    let project = this.pages_project.project();
                    // The SSR and Client Graphs are not connected in Pages Router.
                    // We are only interested in get_next_dynamic_imports_for_endpoint at the
                    // moment, which only needs the client graph anyway.
                    let ssr_module_graph = self.ssr_module_graph();

                    let next_dynamic_imports = if let PageEndpointType::Html = this.ty {
                        let client_availability_info =
                            turbo_tasks::read!(self.client_chunk_group())?.availability_info;

                        let client_module_graph = self.client_module_graph();
                        let per_page_module_graph =
                            *turbo_tasks::read!(project.per_page_module_graph())?;

                        // We only validate the global css imports when there is not a `app` folder
                        // at the root of the project.
                        if turbo_tasks::read!(project.app_project())?.is_none() {
                            // We recreate the app_module here because the one provided from the
                            // `internal_ssr_chunk_module` is not the same as the one
                            // provided from the `client_module_graph`. There can be cases where
                            // the `app_module` is None, and we are processing the `pages/_app.js`
                            // file as a page rather than the app
                            // module.
                            let app_module = turbo_tasks::read!(
                                project
                                    .pages_project()
                                    .client_module_context()
                                    .process(
                                        Vc::upcast(FileSource::new(turbo_tasks::read!(
                                            turbo_tasks::read!(this.pages_structure)?
                                                .app
                                                .file_path()
                                                .owned()
                                        )?,)),
                                        ReferenceType::Entry(EntryReferenceSubType::Page),
                                    )
                                    .to_resolved()
                            )?
                            .module();

                            turbo_tasks::read!(validate_pages_css_imports(
                                client_module_graph,
                                per_page_module_graph,
                                self.client_module(),
                                app_module,
                            ))?;
                        }

                        let next_dynamic_imports = turbo_tasks::read!(
                            NextDynamicGraphs::new(client_module_graph, per_page_module_graph)
                                .get_next_dynamic_imports_for_endpoint(self.client_module())
                        )?;
                        Some((next_dynamic_imports, client_availability_info))
                    } else {
                        None
                    };

                    let dynamic_import_entries =
                        if let Some((next_dynamic_imports, client_availability_info)) =
                            next_dynamic_imports
                        {
                            turbo_tasks::read!(collect_next_dynamic_chunks(
                                self.client_module_graph(),
                                project.client_chunking_context(),
                                next_dynamic_imports,
                                NextDynamicChunkAvailability::AvailabilityInfo(
                                    client_availability_info
                                ),
                            ))?
                        } else {
                            DynamicImportedChunks::default().resolved_cell()
                        };

                    let chunking_context: Vc<Box<dyn ChunkingContext>> = match runtime {
                        NextRuntime::NodeJs => Vc::upcast(node_chunking_context),
                        NextRuntime::Edge => edge_chunking_context,
                    };

                    let mut current_chunk_group = ChunkGroupResult::empty_resolved();
                    for layout in [document_module, app_module].iter().flatten().copied() {
                        let span = tracing::trace_span!(
                            "layout segment",
                            name = display(turbo_tasks::read!(layout.ident().to_string())?)
                        );
                        turbo_tasks::read!(
                            async {
                                let chunk_group = chunking_context.chunk_group(
                                    layout.ident(),
                                    ChunkGroup::Shared(layout),
                                    ssr_module_graph,
                                    turbo_tasks::read!(current_chunk_group)?.availability_info,
                                );

                                current_chunk_group = turbo_tasks::read!(
                                    current_chunk_group.concatenate(chunk_group).to_resolved()
                                )?;

                                anyhow::Ok(())
                            }
                            .instrument(span)
                        )?;
                    }

                    let is_edge = matches!(runtime, NextRuntime::Edge);
                    if is_edge {
                        let chunk_assets = edge_chunking_context.evaluated_chunk_group_assets(
                            ssr_module.ident(),
                            ChunkGroup::Entry(vec![ssr_module]),
                            ssr_module_graph,
                            OutputAssets::empty(),
                            turbo_tasks::read!(current_chunk_group)?.availability_info,
                        );

                        let chunk_assets = turbo_tasks::read!(
                            current_chunk_group
                                .output_assets_with_referenced()
                                .concatenate(chunk_assets)
                                .to_resolved()
                        )?;

                        Ok(SsrChunk::Edge {
                            assets: turbo_tasks::read!(
                                chunk_assets.primary_assets().to_resolved()
                            )?,
                            referenced_assets: turbo_tasks::read!(
                                chunk_assets.referenced_assets().to_resolved()
                            )?,
                            dynamic_import_entries,
                            regions: regions.clone(),
                        }
                        .cell())
                    } else {
                        let pathname = &this.pathname;

                        let asset_path = get_asset_path_from_pathname(pathname, ".js");

                        let ssr_entry_chunk_path_string = format!("pages{asset_path}");
                        let ssr_entry_chunk_path = node_path.join(&ssr_entry_chunk_path_string)?;
                        let ssr_entry_chunk = turbo_tasks::read!(
                            node_chunking_context
                                .entry_chunk_group_asset(
                                    ssr_entry_chunk_path,
                                    ChunkGroup::Entry(vec![ssr_module]),
                                    ssr_module_graph,
                                    current_chunk_group.primary_assets(),
                                    current_chunk_group.referenced_assets(),
                                    turbo_tasks::read!(current_chunk_group)?.availability_info,
                                )
                                .to_resolved()
                        )?;

                        let server_asset_trace_file = if *turbo_tasks::read!(
                            this.pages_project.project().should_write_nft_manifests()
                        )? {
                            let additional_assets = if emit_manifests == EmitManifests::Full {
                                turbo_tasks::read!(self.react_loadable_manifest(
                                    *dynamic_import_entries,
                                    project.client_chunking_context(),
                                    NextRuntime::NodeJs,
                                ))?
                                .iter()
                                .map(|m| **m)
                                .collect()
                            } else {
                                vec![]
                            };

                            ResolvedVc::cell(Some(ResolvedVc::upcast(turbo_tasks::read!(
                                NftJsonAsset::new(
                                    project,
                                    Some(pages_function_name(&this.original_name).into()),
                                    *ssr_entry_chunk,
                                    additional_assets,
                                    self.trace_result(),
                                )
                                .to_resolved()
                            )?)))
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
            )
        }
        #[cfg(feature = "sync")]
        {
            let _g = match ty {
                SsrChunkType::Page => tracing::info_span!("page server side rendering"),
                SsrChunkType::Data => tracing::info_span!("server side data"),
                SsrChunkType::Api => tracing::info_span!("server side api"),
            }
            .entered();
            let this = turbo_tasks::read!(self)?;

            let InternalSsrChunkModule {
                ssr_module,
                app_module,
                document_module,
                runtime,
                ref regions,
            } = *turbo_tasks::read!(self.internal_ssr_chunk_module())?;

            let project = this.pages_project.project();
            // The SSR and Client Graphs are not connected in Pages Router.
            // We are only interested in get_next_dynamic_imports_for_endpoint at the
            // moment, which only needs the client graph anyway.
            let ssr_module_graph = self.ssr_module_graph();

            let next_dynamic_imports = if let PageEndpointType::Html = this.ty {
                let client_availability_info =
                    turbo_tasks::read!(self.client_chunk_group())?.availability_info;

                let client_module_graph = self.client_module_graph();
                let per_page_module_graph = *turbo_tasks::read!(project.per_page_module_graph())?;

                // We only validate the global css imports when there is not a `app` folder at the
                // root of the project.
                if turbo_tasks::read!(project.app_project())?.is_none() {
                    // We recreate the app_module here because the one provided from the
                    // `internal_ssr_chunk_module` is not the same as the one
                    // provided from the `client_module_graph`. There can be cases where
                    // the `app_module` is None, and we are processing the `pages/_app.js` file
                    // as a page rather than the app module.
                    let app_module = turbo_tasks::read!(
                        project
                            .pages_project()
                            .client_module_context()
                            .process(
                                Vc::upcast(FileSource::new(turbo_tasks::read!(
                                    turbo_tasks::read!(this.pages_structure)?
                                        .app
                                        .file_path()
                                        .owned()
                                )?,)),
                                ReferenceType::Entry(EntryReferenceSubType::Page),
                            )
                            .to_resolved()
                    )?
                    .module();

                    turbo_tasks::read!(validate_pages_css_imports(
                        client_module_graph,
                        per_page_module_graph,
                        self.client_module(),
                        app_module,
                    ))?;
                }

                let next_dynamic_imports = turbo_tasks::read!(
                    NextDynamicGraphs::new(client_module_graph, per_page_module_graph)
                        .get_next_dynamic_imports_for_endpoint(self.client_module())
                )?;
                Some((next_dynamic_imports, client_availability_info))
            } else {
                None
            };

            let dynamic_import_entries = if let Some((
                next_dynamic_imports,
                client_availability_info,
            )) = next_dynamic_imports
            {
                turbo_tasks::read!(collect_next_dynamic_chunks(
                    self.client_module_graph(),
                    project.client_chunking_context(),
                    next_dynamic_imports,
                    NextDynamicChunkAvailability::AvailabilityInfo(client_availability_info),
                ))?
            } else {
                DynamicImportedChunks::default().resolved_cell()
            };

            let chunking_context: Vc<Box<dyn ChunkingContext>> = match runtime {
                NextRuntime::NodeJs => Vc::upcast(node_chunking_context),
                NextRuntime::Edge => edge_chunking_context,
            };

            let mut current_chunk_group = ChunkGroupResult::empty_resolved();
            for layout in [document_module, app_module].iter().flatten().copied() {
                let span = tracing::trace_span!(
                    "layout segment",
                    name = display(turbo_tasks::read!(layout.ident().to_string())?)
                );
                {
                    let _g = span.entered();
                    let chunk_group = chunking_context.chunk_group(
                        layout.ident(),
                        ChunkGroup::Shared(layout),
                        ssr_module_graph,
                        turbo_tasks::read!(current_chunk_group)?.availability_info,
                    );

                    current_chunk_group = turbo_tasks::read!(
                        current_chunk_group.concatenate(chunk_group).to_resolved()
                    )?;

                    anyhow::Ok::<()>(())
                }?;
            }

            let is_edge = matches!(runtime, NextRuntime::Edge);
            if is_edge {
                let chunk_assets = edge_chunking_context.evaluated_chunk_group_assets(
                    ssr_module.ident(),
                    ChunkGroup::Entry(vec![ssr_module]),
                    ssr_module_graph,
                    OutputAssets::empty(),
                    turbo_tasks::read!(current_chunk_group)?.availability_info,
                );

                let chunk_assets = turbo_tasks::read!(
                    current_chunk_group
                        .output_assets_with_referenced()
                        .concatenate(chunk_assets)
                        .to_resolved()
                )?;

                Ok(SsrChunk::Edge {
                    assets: turbo_tasks::read!(chunk_assets.primary_assets().to_resolved())?,
                    referenced_assets: turbo_tasks::read!(
                        chunk_assets.referenced_assets().to_resolved()
                    )?,
                    dynamic_import_entries,
                    regions: regions.clone(),
                }
                .cell())
            } else {
                let pathname = &this.pathname;

                let asset_path = get_asset_path_from_pathname(pathname, ".js");

                let ssr_entry_chunk_path_string = format!("pages{asset_path}");
                let ssr_entry_chunk_path = node_path.join(&ssr_entry_chunk_path_string)?;
                let ssr_entry_chunk = turbo_tasks::read!(
                    node_chunking_context
                        .entry_chunk_group_asset(
                            ssr_entry_chunk_path,
                            ChunkGroup::Entry(vec![ssr_module]),
                            ssr_module_graph,
                            current_chunk_group.primary_assets(),
                            current_chunk_group.referenced_assets(),
                            turbo_tasks::read!(current_chunk_group)?.availability_info,
                        )
                        .to_resolved()
                )?;

                let server_asset_trace_file = if *turbo_tasks::read!(
                    this.pages_project.project().should_write_nft_manifests()
                )? {
                    let additional_assets = if emit_manifests == EmitManifests::Full {
                        turbo_tasks::read!(self.react_loadable_manifest(
                            *dynamic_import_entries,
                            project.client_chunking_context(),
                            NextRuntime::NodeJs,
                        ))?
                        .iter()
                        .map(|m| **m)
                        .collect()
                    } else {
                        vec![]
                    };

                    ResolvedVc::cell(Some(ResolvedVc::upcast(turbo_tasks::read!(
                        NftJsonAsset::new(
                            project,
                            Some(pages_function_name(&this.original_name).into()),
                            *ssr_entry_chunk,
                            additional_assets,
                            self.trace_result(),
                        )
                        .to_resolved()
                    )?)))
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
    }

    #[turbo_tasks::function]
    async fn ssr_chunk(self: Vc<Self>, emit_manifests: EmitManifests) -> Result<Vc<SsrChunk>> {
        let this = turbo_tasks::read!(self)?;
        let project = this.pages_project.project();
        Ok(self.internal_ssr_chunk(
            SsrChunkType::Page,
            emit_manifests,
            turbo_tasks::read!(this.pages_project.project().node_root())?.join("server")?,
            project.server_chunking_context(true),
            project.edge_chunking_context(true),
        ))
    }

    #[turbo_tasks::function]
    async fn ssr_data_chunk(self: Vc<Self>, emit_manifests: EmitManifests) -> Result<Vc<SsrChunk>> {
        let this = turbo_tasks::read!(self)?;
        Ok(self.internal_ssr_chunk(
            SsrChunkType::Data,
            emit_manifests,
            turbo_tasks::read!(this.pages_project.project().node_root())?.join("server/data")?,
            this.pages_project.project().server_chunking_context(true),
            this.pages_project.project().edge_chunking_context(true),
        ))
    }

    #[turbo_tasks::function]
    async fn api_chunk(self: Vc<Self>, emit_manifests: EmitManifests) -> Result<Vc<SsrChunk>> {
        let this = turbo_tasks::read!(self)?;
        Ok(self.internal_ssr_chunk(
            SsrChunkType::Api,
            emit_manifests,
            turbo_tasks::read!(this.pages_project.project().node_root())?.join("server")?,
            this.pages_project.project().server_chunking_context(false),
            this.pages_project.project().edge_chunking_context(false),
        ))
    }

    #[turbo_tasks::function]
    async fn pages_manifest(
        &self,
        entry_chunk: Vc<Box<dyn OutputAsset>>,
    ) -> Result<Vc<Box<dyn OutputAsset>>> {
        let node_root = turbo_tasks::read!(self.pages_project.project().node_root())?;

        // Check if we should include pages in the manifest
        let pages_structure = turbo_tasks::read!(self.pages_structure)?;
        let pages = if pages_structure.should_create_pages_entries {
            let chunk_path = turbo_tasks::read!(entry_chunk.path())?;
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
            AssetContent::file(
                FileContent::Content(File::from(serde_json::to_string_pretty(&pages_manifest)?))
                    .cell(),
            ),
        ));
        Ok(asset)
    }

    #[turbo_tasks::function]
    async fn react_loadable_manifest(
        &self,
        dynamic_import_entries: Vc<DynamicImportedChunks>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        runtime: NextRuntime,
    ) -> Result<Vc<OutputAssets>> {
        let node_root = turbo_tasks::read!(self.pages_project.project().node_root().owned())?;
        let client_relative_path =
            turbo_tasks::read!(self.pages_project.project().client_relative_path().owned())?;
        let loadable_path_prefix = get_asset_prefix_from_pathname(&self.pathname);
        Ok(create_react_loadable_manifest(
            dynamic_import_entries,
            chunking_context,
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
        let node_root = turbo_tasks::read!(self.pages_project.project().node_root().owned())?;
        let client_relative_path =
            turbo_tasks::read!(self.pages_project.project().client_relative_path().owned())?;

        // Check if we should include pages in the manifest
        let pages_structure = turbo_tasks::read!(self.pages_structure)?;
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
            root_main_files_per_page: Default::default(),
        };
        Ok(Vc::upcast(build_manifest.cell()))
    }

    #[turbo_tasks::function]
    async fn client_build_manifest(
        &self,
        page_loader: ResolvedVc<Box<dyn OutputAsset>>,
    ) -> Result<Vc<Box<dyn OutputAsset>>> {
        let node_root = turbo_tasks::read!(self.pages_project.project().node_root())?;
        let client_relative_path =
            turbo_tasks::read!(self.pages_project.project().client_relative_path().owned())?;

        // Check if we should include pages in the manifest
        let pages_structure = turbo_tasks::read!(self.pages_structure)?;
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
        let this = turbo_tasks::read!(self)?;

        let mut server_assets = vec![];
        let mut client_assets = vec![];

        let emit_manifests = match this.ty {
            PageEndpointType::Html | PageEndpointType::SsrOnly => EmitManifests::Full,
            PageEndpointType::Api => EmitManifests::Minimal,
            PageEndpointType::Data => EmitManifests::None,
        };

        let ssr_chunk = match this.ty {
            PageEndpointType::Html => {
                let client_chunk_group = self.client_chunk_group();
                client_assets.extend(
                    turbo_tasks::read!(client_chunk_group.all_assets())?
                        .iter()
                        .copied(),
                );
                let client_chunks = *turbo_tasks::read!(client_chunk_group)?.assets;

                let build_manifest =
                    turbo_tasks::read!(self.build_manifest(client_chunks).to_resolved())?;
                let page_loader =
                    turbo_tasks::read!(self.page_loader(client_chunks).to_resolved())?;
                let client_build_manifest =
                    turbo_tasks::read!(self.client_build_manifest(*page_loader).to_resolved())?;
                client_assets.push(page_loader);
                server_assets.push(build_manifest);
                server_assets.push(client_build_manifest);

                self.ssr_chunk(emit_manifests)
            }

            PageEndpointType::Data => self.ssr_data_chunk(emit_manifests),
            PageEndpointType::Api => self.api_chunk(emit_manifests),
            PageEndpointType::SsrOnly => self.ssr_chunk(emit_manifests),
        };

        let client_assets: ResolvedVc<OutputAssets> = ResolvedVc::cell(client_assets);

        let manifest_path_prefix = get_asset_prefix_from_pathname(&this.pathname);
        let node_root = turbo_tasks::read!(this.pages_project.project().node_root().owned())?;

        if emit_manifests == EmitManifests::Full {
            let next_font_manifest_output = ResolvedVc::upcast(
                FontManifest {
                    client_root: turbo_tasks::read!(
                        this.pages_project.project().client_root().owned()
                    )?,
                    node_root: node_root.clone(),
                    dir: turbo_tasks::read!(this.pages_project.pages_dir().owned())?,
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

        let page_output = match *turbo_tasks::read!(ssr_chunk)? {
            SsrChunk::NodeJs {
                entry,
                dynamic_import_entries,
                server_asset_trace_file,
            } => {
                // Only include the actual SSR entry chunk if pages should be created
                let pages_structure = turbo_tasks::read!(this.pages_structure)?;
                if pages_structure.should_create_pages_entries {
                    server_assets.push(entry);
                    if let Some(server_asset_trace_file) =
                        &*turbo_tasks::read!(server_asset_trace_file)?
                    {
                        server_assets.push(*server_asset_trace_file);
                    }
                }

                if emit_manifests != EmitManifests::None {
                    let pages_manifest =
                        turbo_tasks::read!(self.pages_manifest(*entry).to_resolved())?;
                    server_assets.push(pages_manifest);
                }
                if emit_manifests == EmitManifests::Full {
                    let loadable_manifest_output = self.react_loadable_manifest(
                        *dynamic_import_entries,
                        this.pages_project.project().client_chunking_context(),
                        NextRuntime::NodeJs,
                    );
                    server_assets.extend(
                        turbo_tasks::read!(loadable_manifest_output)?
                            .iter()
                            .copied(),
                    );
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
                let node_root =
                    turbo_tasks::read!(this.pages_project.project().node_root().owned())?;
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

                    if turbo_tasks::read!(this.pages_project.project().next_mode())?.is_production()
                    {
                        file_paths_from_root.insert(rcstr!("required-server-files.js"));
                    }

                    let all_assets = assets.concatenate(*referenced_assets);
                    let assets_ref = turbo_tasks::read!(assets)?;

                    server_assets.extend(turbo_tasks::read!(referenced_assets)?.iter().copied());

                    // TODO(sokra): accessing the 1st asset is a bit hacky, we should find a better
                    // way to get the main entry asset
                    if let Some(&file) = assets_ref.first() {
                        let pages_manifest =
                            turbo_tasks::read!(self.pages_manifest(*file).to_resolved())?;
                        server_assets.push(pages_manifest);
                    }

                    // Only include the actual edge files if pages should be created
                    let pages_structure = turbo_tasks::read!(this.pages_structure)?;
                    if pages_structure.should_create_pages_entries {
                        server_assets.extend(assets_ref.iter().copied());
                        file_paths_from_root.extend(turbo_tasks::read!(get_js_paths_from_root(
                            &node_root,
                            assets_ref.iter().copied()
                        ))?);
                    }

                    if emit_manifests == EmitManifests::Full {
                        let loadable_manifest_output =
                            turbo_tasks::read!(self.react_loadable_manifest(
                                *dynamic_import_entries,
                                this.pages_project.project().client_chunking_context(),
                                NextRuntime::Edge,
                            ))?;
                        if pages_structure.should_create_pages_entries {
                            server_assets.extend(loadable_manifest_output.iter().copied());
                            file_paths_from_root.extend(turbo_tasks::read!(
                                get_js_paths_from_root(&node_root, loadable_manifest_output)
                            )?);
                        }
                    }

                    let (wasm_paths_from_root, all_assets) = if pages_structure
                        .should_create_pages_entries
                    {
                        let all_output_assets =
                            turbo_tasks::read!(all_assets_from_entries(all_assets))?;

                        let mut wasm_paths_from_root = fxindexset![];
                        wasm_paths_from_root.extend(turbo_tasks::read!(get_wasm_paths_from_root(
                            &node_root,
                            all_output_assets.iter().copied()
                        ))?);

                        let all_assets = turbo_tasks::read!(get_asset_paths_from_root(
                            &node_root,
                            all_output_assets
                        ))?;

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
                    let entrypoint_asset = *assets_ref
                        .last()
                        .context("expected assets for edge pages endpoint")?;
                    let entrypoint = node_root
                        .get_path_to(&*turbo_tasks::read!(entrypoint_asset.path())?)
                        .context("expected edge pages asset to be within node root")?
                        .into();

                    let edge_function_definition = EdgeFunctionDefinition {
                        files: file_paths_from_root.into_iter().collect(),
                        wasm: turbo_tasks::read!(wasm_paths_to_bindings(wasm_paths_from_root))?,
                        assets: paths_to_bindings(all_assets),
                        name: pages_function_name(&this.original_name).into(),
                        page: this.original_name.clone(),
                        entrypoint,
                        regions,
                        matchers: vec![matchers],
                        env: turbo_tasks::read!(this.pages_project.project().edge_env().owned())?,
                    };
                    let middleware_manifest_v2 = MiddlewaresManifestV2 {
                        sorted_middleware: vec![this.pathname.clone()],
                        functions: [(this.pathname.clone(), edge_function_definition)]
                            .into_iter()
                            .collect(),
                        ..Default::default()
                    };
                    let manifest_path_prefix = get_asset_prefix_from_pathname(&this.pathname);
                    let middleware_manifest_v2 = turbo_tasks::read!(
                        VirtualOutputAsset::new(
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
                    )?;
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
        Ok(Vc::cell(Some(turbo_tasks::read!(
            self.pages_project.project().client_relative_path().owned()
        )?)))
    }

    #[turbo_tasks::function]
    async fn trace_result(self: Vc<Self>) -> Result<Vc<EndpointTraceResult>> {
        let this = turbo_tasks::read!(self)?;
        let ssr_module_graph = self.ssr_module_graph();
        let InternalSsrChunkModule { ssr_module, .. } =
            *turbo_tasks::read!(self.internal_ssr_chunk_module())?;
        Ok(trace_endpoint(
            this.pages_project.project(),
            Some(pages_function_name(&this.original_name).into()),
            ssr_module_graph,
            *ssr_module,
        ))
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
        let this = &*turbo_tasks::read!(self)?;
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
        #[cfg(not(feature = "sync"))]
        {
            turbo_tasks::read!(
                async move {
                    let output = self.output();
                    let project = this.pages_project.project();
                    let node_root = turbo_tasks::read!(project.node_root().owned())?;
                    let client_relative_root =
                        turbo_tasks::read!(project.client_relative_path().owned())?;

                    let output_assets = output.output_assets();
                    let output_assets = if let Some(sri) =
                        &*turbo_tasks::read!(project.next_config().experimental_sri())?
                        && let Some(algorithm) = sri.algorithm.clone()
                    {
                        let sri_manifest = get_sri_manifest_asset(
                            node_root.join(&format!(
                                "server/pages{}/subresource-integrity-manifest.json",
                                get_asset_prefix_from_pathname(&this.pathname)
                            ))?,
                            output_assets,
                            client_relative_root.clone(),
                            algorithm,
                        );
                        output_assets.concat_asset(sri_manifest)
                    } else {
                        output_assets
                    };

                    let (server_paths, client_paths) =
                        if turbo_tasks::read!(project.next_mode())?.is_development() {
                            let server_paths = turbo_tasks::read!(
                                all_asset_paths(output_assets, node_root.clone(), None).owned()
                            )?;
                            let client_paths = turbo_tasks::read!(
                                all_paths_in_root(output_assets, client_relative_root).owned()
                            )?;
                            (server_paths, client_paths)
                        } else {
                            (vec![], vec![])
                        };

                    let written_endpoint = match *turbo_tasks::read!(output)? {
                        PageEndpointOutput::NodeJs { entry_chunk, .. } => {
                            // Only set server_entry_path if pages should be created
                            let pages_structure = turbo_tasks::read!(this.pages_structure)?;
                            let server_entry_path = if pages_structure.should_create_pages_entries {
                                node_root
                                    .get_path_to(&*turbo_tasks::read!(entry_chunk.path())?)
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
                            output_assets: turbo_tasks::read!(output_assets.to_resolved())?,
                            output_paths: written_endpoint.resolved_cell(),
                            project: turbo_tasks::read!(project.to_resolved())?,
                        }
                        .cell(),
                    )
                }
                .instrument(span)
            )
            .with_context(|| format!("Failed to write page endpoint {}", *original_name))
        }
        #[cfg(feature = "sync")]
        {
            let _g = span.entered();
            (|| -> anyhow::Result<Vc<EndpointOutput>> {
                let output = self.output();
                let project = this.pages_project.project();
                let node_root = turbo_tasks::read!(project.node_root().owned())?;
                let client_relative_root =
                    turbo_tasks::read!(project.client_relative_path().owned())?;

                let output_assets = output.output_assets();
                let output_assets = if let Some(sri) =
                    &*turbo_tasks::read!(project.next_config().experimental_sri())?
                    && let Some(algorithm) = sri.algorithm.clone()
                {
                    let sri_manifest = get_sri_manifest_asset(
                        node_root.join(&format!(
                            "server/pages{}/subresource-integrity-manifest.json",
                            get_asset_prefix_from_pathname(&this.pathname)
                        ))?,
                        output_assets,
                        client_relative_root.clone(),
                        algorithm,
                    );
                    output_assets.concat_asset(sri_manifest)
                } else {
                    output_assets
                };

                let (server_paths, client_paths) =
                    if turbo_tasks::read!(project.next_mode())?.is_development() {
                        let server_paths = turbo_tasks::read!(
                            all_asset_paths(output_assets, node_root.clone(), None).owned()
                        )?;
                        let client_paths = turbo_tasks::read!(
                            all_paths_in_root(output_assets, client_relative_root).owned()
                        )?;
                        (server_paths, client_paths)
                    } else {
                        (vec![], vec![])
                    };

                let written_endpoint = match *turbo_tasks::read!(output)? {
                    PageEndpointOutput::NodeJs { entry_chunk, .. } => {
                        // Only set server_entry_path if pages should be created
                        let pages_structure = turbo_tasks::read!(this.pages_structure)?;
                        let server_entry_path = if pages_structure.should_create_pages_entries {
                            node_root
                                .get_path_to(&*turbo_tasks::read!(entry_chunk.path())?)
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
                        output_assets: turbo_tasks::read!(output_assets.to_resolved())?,
                        output_paths: written_endpoint.resolved_cell(),
                        project: turbo_tasks::read!(project.to_resolved())?,
                    }
                    .cell(),
                )
            })()
            .with_context(|| format!("Failed to write page endpoint {}", *original_name))
        }
    }

    #[turbo_tasks::function]
    async fn server_changed(self: Vc<Self>) -> Result<Vc<Completion>> {
        Ok(turbo_tasks::read!(self)?
            .pages_project
            .project()
            .server_changed(self.output().server_assets()))
    }

    #[turbo_tasks::function]
    async fn client_changed(self: Vc<Self>) -> Result<Vc<Completion>> {
        Ok(turbo_tasks::read!(self)?
            .pages_project
            .project()
            .client_changed(self.output().client_assets()))
    }

    #[turbo_tasks::function]
    async fn entries(self: Vc<Self>) -> Result<Vc<GraphEntries>> {
        let this = turbo_tasks::read!(self)?;

        let ssr_chunk_module = turbo_tasks::read!(self.internal_ssr_chunk_module())?;

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
                    turbo_tasks::read!(self.client_evaluatable_assets())?
                        .iter()
                        .map(|m| ResolvedVc::upcast(*m))
                        .collect(),
                ))
                .into_iter()
            } else {
                None.into_iter()
            })
            .collect::<Vec<_>>();

        Ok(GraphEntries::from_chunk_groups(modules).cell())
    }

    #[turbo_tasks::function]
    async fn module_graphs(self: Vc<Self>) -> Result<Vc<ModuleGraphs>> {
        let client_module_graph = turbo_tasks::read!(self.client_module_graph().to_resolved())?;
        let ssr_module_graph = turbo_tasks::read!(self.ssr_module_graph().to_resolved())?;
        Ok(Vc::cell(if client_module_graph != ssr_module_graph {
            vec![client_module_graph, ssr_module_graph]
        } else {
            vec![ssr_module_graph]
        }))
    }

    #[turbo_tasks::function]
    async fn project(self: Vc<Self>) -> Result<Vc<Project>> {
        Ok(turbo_tasks::read!(self)?.pages_project.project())
    }

    #[turbo_tasks::function]
    fn traced_files(self: Vc<Self>) -> Vc<FileSystemPathVec> {
        self.trace_result().all_files()
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
        let server_assets = turbo_tasks::read!(self.server_assets())?;
        let client_assets = turbo_tasks::read!(self.client_assets())?;
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
