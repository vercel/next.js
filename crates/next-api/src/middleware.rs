use std::future::IntoFuture;

use anyhow::{Result, bail};
use next_core::{
    all_assets_from_entries,
    middleware::get_middleware_module,
    next_edge::entry::wrap_edge_entry,
    next_manifests::{EdgeFunctionDefinition, MiddlewareMatcher, MiddlewaresManifestV2, Regions},
    next_server::{ServerContextType, get_server_runtime_entries},
    util::{MiddlewareMatcherKind, NextRuntime, parse_config_from_source},
};
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{Completion, ResolvedVc, Vc};
use turbo_tasks_fs::{self, File, FileContent, FileSystemPath};
use turbopack_core::{
    asset::AssetContent,
    chunk::{
        ChunkingContext, ChunkingContextExt, EntryChunkGroupResult,
        availability_info::AvailabilityInfo,
    },
    context::AssetContext,
    module::Module,
    module_graph::{
        GraphEntries,
        chunk_group_info::{ChunkGroup, ChunkGroupEntry},
    },
    output::{OutputAsset, OutputAssets},
    reference_type::{EntryReferenceSubType, ReferenceType},
    source::Source,
    virtual_output::VirtualOutputAsset,
};

use crate::{
    nft_json::NftJsonAsset,
    paths::{
        all_paths_in_root, all_server_paths, get_asset_paths_from_root, get_js_paths_from_root,
        get_wasm_paths_from_root, paths_to_bindings, wasm_paths_to_bindings,
    },
    project::Project,
    route::{Endpoint, EndpointOutput, EndpointOutputPaths},
};

#[turbo_tasks::value]
pub struct MiddlewareEndpoint {
    project: ResolvedVc<Project>,
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
    source: ResolvedVc<Box<dyn Source>>,
    app_dir: Option<ResolvedVc<FileSystemPath>>,
    ecmascript_client_reference_transition_name: Option<RcStr>,
}

#[turbo_tasks::value_impl]
impl MiddlewareEndpoint {
    #[turbo_tasks::function]
    pub fn new(
        project: ResolvedVc<Project>,
        asset_context: ResolvedVc<Box<dyn AssetContext>>,
        source: ResolvedVc<Box<dyn Source>>,
        app_dir: Option<ResolvedVc<FileSystemPath>>,
        ecmascript_client_reference_transition_name: Option<RcStr>,
    ) -> Vc<Self> {
        Self {
            project,
            asset_context,
            source,
            app_dir,
            ecmascript_client_reference_transition_name,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn entry_module(&self) -> Result<Vc<Box<dyn Module>>> {
        let userland_module = self
            .asset_context
            .process(
                *self.source,
                ReferenceType::Entry(EntryReferenceSubType::Middleware),
            )
            .module();

        let module = get_middleware_module(
            *self.asset_context,
            self.project.project_path(),
            userland_module,
        );

        let config = parse_config_from_source(userland_module, NextRuntime::Edge).await?;

        if matches!(config.runtime, NextRuntime::NodeJs) {
            return Ok(module);
        }
        Ok(wrap_edge_entry(
            *self.asset_context,
            self.project.project_path(),
            module,
            rcstr!("middleware"),
        ))
    }

    #[turbo_tasks::function]
    async fn edge_files(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;
        let module = self.entry_module().to_resolved().await?;

        let module_graph = this.project.module_graph(*module);

        let evaluatable_assets = get_server_runtime_entries(
            ServerContextType::Middleware {
                app_dir: this.app_dir,
                ecmascript_client_reference_transition_name: this
                    .ecmascript_client_reference_transition_name
                    .clone(),
            },
            this.project.next_mode(),
        )
        .resolve_entries(*this.asset_context)
        .await?
        .iter()
        .map(|m| ResolvedVc::upcast(*m))
        .chain(std::iter::once(module))
        .collect();

        let edge_chunking_context = this.project.edge_chunking_context(false);
        let edge_files = edge_chunking_context.evaluated_chunk_group_assets(
            module.ident(),
            ChunkGroup::Entry(evaluatable_assets),
            module_graph,
            AvailabilityInfo::Root,
        );
        Ok(edge_files)
    }

    #[turbo_tasks::function]
    async fn node_chunk(self: Vc<Self>) -> Result<Vc<Box<dyn OutputAsset>>> {
        let this = self.await?;

        let chunking_context = this.project.server_chunking_context(false);

        let userland_module = self.entry_module().to_resolved().await?;
        let module_graph = this.project.module_graph(*userland_module);

        let Some(module) = ResolvedVc::try_downcast(userland_module) else {
            bail!("Entry module must be evaluatable");
        };

        let EntryChunkGroupResult { asset: chunk, .. } = *chunking_context
            .entry_chunk_group(
                this.project
                    .node_root()
                    .join(rcstr!("server/middleware.js")),
                get_server_runtime_entries(
                    ServerContextType::Middleware {
                        app_dir: this.app_dir,
                        ecmascript_client_reference_transition_name: this
                            .ecmascript_client_reference_transition_name
                            .clone(),
                    },
                    this.project.next_mode(),
                )
                .resolve_entries(*this.asset_context)
                .with_entry(*module),
                module_graph,
                OutputAssets::empty(),
                AvailabilityInfo::Root,
            )
            .await?;
        Ok(*chunk)
    }

    #[turbo_tasks::function]
    async fn output_assets(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;

        let userland_module = self.userland_module();

        let config = parse_config_from_source(userland_module, NextRuntime::Edge).await?;

        let next_config = this.project.next_config().await?;
        let has_i18n = next_config.i18n.is_some();
        let has_i18n_locales = next_config
            .i18n
            .as_ref()
            .map(|i18n| i18n.locales.len() > 1)
            .unwrap_or(false);
        let base_path = next_config.base_path.as_ref();

        let matchers = if let Some(matchers) = config.matcher.as_ref() {
            matchers
                .iter()
                .map(|matcher| {
                    let mut matcher = match matcher {
                        MiddlewareMatcherKind::Str(matcher) => MiddlewareMatcher {
                            original_source: matcher.as_str().into(),
                            ..Default::default()
                        },
                        MiddlewareMatcherKind::Matcher(matcher) => matcher.clone(),
                    };

                    // Mirrors implementation in get-page-static-info.ts getMiddlewareMatchers
                    let mut source = matcher.original_source.to_string();
                    let is_root = source == "/";
                    let has_locale = matcher.locale;

                    if has_i18n_locales && has_locale {
                        if is_root {
                            source.clear();
                        }
                        source.insert_str(0, "/:nextInternalLocale((?!_next/)[^/.]{1,})");
                    }

                    if is_root {
                        source.push('(');
                        if has_i18n {
                            source.push_str("|\\\\.json|");
                        }
                        source.push_str("/?index|/?index\\\\.json)?")
                    } else {
                        source.push_str("{(\\\\.json)}?")
                    };

                    source.insert_str(0, "/:nextData(_next/data/[^/]{1,})?");

                    if let Some(base_path) = base_path {
                        source.insert_str(0, base_path);
                    }

                    // TODO: The implementation of getMiddlewareMatchers outputs a regex here
                    // using path-to-regexp. Currently there is no
                    // equivalent of that so it post-processes
                    // this value to the relevant regex in manifest-loader.ts
                    matcher.regexp = Some(RcStr::from(source));

                    matcher
                })
                .collect()
        } else {
            vec![MiddlewareMatcher {
                regexp: Some(rcstr!("^/.*$")),
                original_source: rcstr!("/:path*"),
                ..Default::default()
            }]
        };

        if matches!(config.runtime, NextRuntime::NodeJs) {
            let chunk = self.node_chunk().to_resolved().await?;
            let mut output_assets = vec![chunk];
            if this.project.next_mode().await?.is_production() {
                output_assets.push(ResolvedVc::upcast(
                    NftJsonAsset::new(*this.project, *chunk, vec![])
                        .to_resolved()
                        .await?,
                ));
            }
            let middleware_manifest_v2 = MiddlewaresManifestV2 {
                middleware: [].into_iter().collect(),
                ..Default::default()
            };
            let middleware_manifest_v2 = VirtualOutputAsset::new(
                this.project
                    .node_root()
                    .join(rcstr!("server/middleware/middleware-manifest.json")),
                AssetContent::file(
                    FileContent::Content(File::from(serde_json::to_string_pretty(
                        &middleware_manifest_v2,
                    )?))
                    .cell(),
                ),
            )
            .to_resolved()
            .await?;
            output_assets.push(ResolvedVc::upcast(middleware_manifest_v2));

            Ok(Vc::cell(output_assets))
        } else {
            let edge_files = self.edge_files();
            let mut output_assets = edge_files.owned().await?;

            let node_root = this.project.node_root();
            let node_root_value = node_root.await?;

            let file_paths_from_root =
                get_js_paths_from_root(&node_root_value, &output_assets).await?;

            let all_output_assets = all_assets_from_entries(edge_files).await?;

            let wasm_paths_from_root =
                get_wasm_paths_from_root(&node_root_value, &all_output_assets).await?;

            let all_assets =
                get_asset_paths_from_root(&node_root_value, &all_output_assets).await?;

            let regions = if let Some(regions) = config.regions.as_ref() {
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
                files: file_paths_from_root,
                wasm: wasm_paths_to_bindings(wasm_paths_from_root).await?,
                assets: paths_to_bindings(all_assets),
                name: rcstr!("middleware"),
                page: rcstr!("/"),
                regions,
                matchers: matchers.clone(),
                env: this.project.edge_env().owned().await?,
            };
            let middleware_manifest_v2 = MiddlewaresManifestV2 {
                middleware: [(rcstr!("/"), edge_function_definition)]
                    .into_iter()
                    .collect(),
                ..Default::default()
            };
            let middleware_manifest_v2 = VirtualOutputAsset::new(
                node_root.join(rcstr!("server/middleware/middleware-manifest.json")),
                AssetContent::file(
                    FileContent::Content(File::from(serde_json::to_string_pretty(
                        &middleware_manifest_v2,
                    )?))
                    .cell(),
                ),
            )
            .to_resolved()
            .await?;
            output_assets.push(ResolvedVc::upcast(middleware_manifest_v2));

            Ok(Vc::cell(output_assets))
        }
    }

    #[turbo_tasks::function]
    fn userland_module(&self) -> Vc<Box<dyn Module>> {
        self.asset_context
            .process(
                *self.source,
                ReferenceType::Entry(EntryReferenceSubType::Middleware),
            )
            .module()
    }
}

#[turbo_tasks::value_impl]
impl Endpoint for MiddlewareEndpoint {
    #[turbo_tasks::function]
    async fn output(self: ResolvedVc<Self>) -> Result<Vc<EndpointOutput>> {
        let span = tracing::info_span!("middleware endpoint");
        async move {
            let this = self.await?;
            let output_assets = self.output_assets();

            let (server_paths, client_paths) = if this.project.next_mode().await?.is_development() {
                let node_root = this.project.node_root();
                let server_paths = all_server_paths(output_assets, node_root).owned().await?;

                // Middleware could in theory have a client path (e.g. `new URL`).
                let client_relative_root = this.project.client_relative_path();
                let client_paths = all_paths_in_root(output_assets, client_relative_root)
                    .into_future()
                    .owned()
                    .instrument(tracing::info_span!("client_paths"))
                    .await?;
                (server_paths, client_paths)
            } else {
                (vec![], vec![])
            };

            Ok(EndpointOutput {
                output_paths: EndpointOutputPaths::Edge {
                    server_paths,
                    client_paths,
                }
                .resolved_cell(),
                output_assets: output_assets.to_resolved().await?,
                project: this.project,
            }
            .cell())
        }
        .instrument(span)
        .await
    }

    #[turbo_tasks::function]
    async fn server_changed(self: Vc<Self>) -> Result<Vc<Completion>> {
        Ok(self.await?.project.server_changed(self.output_assets()))
    }

    #[turbo_tasks::function]
    fn client_changed(self: Vc<Self>) -> Vc<Completion> {
        Completion::immutable()
    }

    #[turbo_tasks::function]
    async fn entries(self: Vc<Self>) -> Result<Vc<GraphEntries>> {
        Ok(Vc::cell(vec![ChunkGroupEntry::Entry(vec![
            self.entry_module().to_resolved().await?,
        ])]))
    }
}
