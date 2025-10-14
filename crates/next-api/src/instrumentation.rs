use anyhow::{Result, bail};
use next_core::{
    all_assets_from_entries,
    next_edge::entry::wrap_edge_entry,
    next_manifests::{InstrumentationDefinition, MiddlewaresManifestV2},
};
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{Completion, ResolvedVc, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
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
    output::{OutputAsset, OutputAssets, OutputAssetsWithReferenced},
    reference_type::{EntryReferenceSubType, ReferenceType},
    source::Source,
    virtual_output::VirtualOutputAsset,
};

use crate::{
    nft_json::NftJsonAsset,
    paths::{
        all_server_paths, get_js_paths_from_root, get_wasm_paths_from_root, wasm_paths_to_bindings,
    },
    project::Project,
    route::{Endpoint, EndpointOutput, EndpointOutputPaths},
};

#[turbo_tasks::value]
pub struct InstrumentationEndpoint {
    project: ResolvedVc<Project>,
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
    source: ResolvedVc<Box<dyn Source>>,
    is_edge: bool,

    app_dir: Option<FileSystemPath>,
    ecmascript_client_reference_transition_name: Option<RcStr>,
}

#[turbo_tasks::value_impl]
impl InstrumentationEndpoint {
    #[turbo_tasks::function]
    pub fn new(
        project: ResolvedVc<Project>,
        asset_context: ResolvedVc<Box<dyn AssetContext>>,
        source: ResolvedVc<Box<dyn Source>>,
        is_edge: bool,
        app_dir: Option<FileSystemPath>,
        ecmascript_client_reference_transition_name: Option<RcStr>,
    ) -> Vc<Self> {
        Self {
            project,
            asset_context,
            source,
            is_edge,
            app_dir,
            ecmascript_client_reference_transition_name,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn core_modules(&self) -> Result<Vc<InstrumentationCoreModules>> {
        let userland_module = self
            .asset_context
            .process(
                *self.source,
                ReferenceType::Entry(EntryReferenceSubType::Instrumentation),
            )
            .module()
            .to_resolved()
            .await?;

        let edge_entry_module = wrap_edge_entry(
            *self.asset_context,
            self.project.project_path().owned().await?,
            *userland_module,
            rcstr!("instrumentation"),
        )
        .to_resolved()
        .await?;

        Ok(InstrumentationCoreModules {
            userland_module,
            edge_entry_module,
        }
        .cell())
    }

    #[turbo_tasks::function]
    async fn edge_chunk_group(self: Vc<Self>) -> Result<Vc<OutputAssetsWithReferenced>> {
        let this = self.await?;
        let module = self.core_modules().await?.edge_entry_module;

        let module_graph = this.project.module_graph(*module);

        let edge_chunking_context = this.project.edge_chunking_context(false);
        Ok(edge_chunking_context.evaluated_chunk_group_assets(
            module.ident(),
            ChunkGroup::Entry(vec![module]),
            module_graph,
            AvailabilityInfo::Root,
        ))
    }

    #[turbo_tasks::function]
    async fn node_chunk(self: Vc<Self>) -> Result<Vc<Box<dyn OutputAsset>>> {
        let this = self.await?;

        let chunking_context = this.project.server_chunking_context(false);

        let userland_module = self.core_modules().await?.userland_module;
        let module_graph = this.project.module_graph(*userland_module);

        let Some(module) = ResolvedVc::try_downcast(userland_module) else {
            bail!("Entry module must be evaluatable");
        };

        let EntryChunkGroupResult { asset: chunk, .. } = *chunking_context
            .entry_chunk_group(
                this.project
                    .node_root()
                    .await?
                    .join("server/instrumentation.js")?,
                Vc::cell(vec![module]),
                module_graph,
                OutputAssets::empty(),
                OutputAssets::empty(),
                AvailabilityInfo::Root,
            )
            .await?;
        Ok(*chunk)
    }

    #[turbo_tasks::function]
    async fn output_assets(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;

        if this.is_edge {
            let edge_chunk_group = self.edge_chunk_group();
            let edge_all_assets = edge_chunk_group.all_assets();

            let node_root = this.project.node_root().owned().await?;
            let node_root_value = node_root.clone();

            let file_paths_from_root =
                get_js_paths_from_root(&node_root_value, &edge_chunk_group.await?.assets.await?)
                    .await?;

            let mut output_assets = all_assets_from_entries(edge_all_assets).owned().await?;

            let wasm_paths_from_root =
                get_wasm_paths_from_root(&node_root_value, &output_assets).await?;

            let instrumentation_definition = InstrumentationDefinition {
                files: file_paths_from_root,
                wasm: wasm_paths_to_bindings(wasm_paths_from_root).await?,
                name: rcstr!("instrumentation"),
                ..Default::default()
            };
            let middleware_manifest_v2 = MiddlewaresManifestV2 {
                instrumentation: Some(instrumentation_definition),
                ..Default::default()
            };
            let middleware_manifest_v2 = VirtualOutputAsset::new(
                node_root.join("server/instrumentation/middleware-manifest.json")?,
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
            let chunk = self.node_chunk().to_resolved().await?;
            let mut output_assets = vec![chunk];
            if this.project.next_mode().await?.is_production() {
                output_assets.push(ResolvedVc::upcast(
                    NftJsonAsset::new(*this.project, None, *chunk, vec![])
                        .to_resolved()
                        .await?,
                ));
            }
            Ok(Vc::cell(output_assets))
        }
    }
}

#[turbo_tasks::value]
struct InstrumentationCoreModules {
    pub userland_module: ResolvedVc<Box<dyn Module>>,
    pub edge_entry_module: ResolvedVc<Box<dyn Module>>,
}

#[turbo_tasks::value_impl]
impl Endpoint for InstrumentationEndpoint {
    #[turbo_tasks::function]
    async fn output(self: ResolvedVc<Self>) -> Result<Vc<EndpointOutput>> {
        let span = tracing::info_span!("instrumentation endpoint");
        async move {
            let this = self.await?;
            let output_assets = self.output_assets();

            let server_paths = if this.project.next_mode().await?.is_development() {
                let node_root = this.project.node_root().owned().await?;
                all_server_paths(output_assets, node_root).owned().await?
            } else {
                vec![]
            };

            Ok(EndpointOutput {
                output_assets: output_assets.to_resolved().await?,
                output_paths: EndpointOutputPaths::Edge {
                    server_paths,
                    client_paths: vec![],
                }
                .resolved_cell(),
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
        let core_modules = self.core_modules().await?;
        Ok(Vc::cell(vec![ChunkGroupEntry::Entry(
            if self.await?.is_edge {
                vec![core_modules.edge_entry_module]
            } else {
                vec![core_modules.userland_module]
            },
        )]))
    }
}
