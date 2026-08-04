use anyhow::Result;
use next_core::{
    app_structure::FileSystemPathVec,
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
    nft::{EndpointTraceResult, trace_endpoint},
    nft_json::NftJsonAsset,
    paths::{
        all_asset_paths, get_js_paths_from_root, get_wasm_paths_from_root, wasm_paths_to_bindings,
    },
    project::Project,
    route::{Endpoint, EndpointOutput, EndpointOutputPaths, ModuleGraphs},
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
    async fn entry_module(&self) -> Result<Vc<Box<dyn Module>>> {
        let userland_module = turbo_tasks::read!(
            self.asset_context
                .process(
                    *self.source,
                    ReferenceType::Entry(EntryReferenceSubType::Instrumentation),
                )
                .module()
                .to_resolved()
        )?;

        if !self.is_edge {
            return Ok(*userland_module);
        }

        let edge_entry_module = turbo_tasks::read!(
            wrap_edge_entry(
                *self.asset_context,
                turbo_tasks::read!(self.project.project_path().owned())?,
                *userland_module,
                rcstr!("instrumentation"),
            )
            .to_resolved()
        )?;

        Ok(*edge_entry_module)
    }

    #[turbo_tasks::function]
    async fn edge_chunk_group(self: Vc<Self>) -> Result<Vc<OutputAssetsWithReferenced>> {
        let this = turbo_tasks::read!(self)?;
        let module = turbo_tasks::read!(self.entry_module().to_resolved())?;

        let module_graph = this.project.module_graph(*module);

        let edge_chunking_context = this.project.edge_chunking_context(false);
        Ok(edge_chunking_context.evaluated_chunk_group_assets(
            module.ident(),
            ChunkGroup::Entry(vec![module]),
            module_graph,
            OutputAssets::empty(),
            AvailabilityInfo::root(),
        ))
    }

    #[turbo_tasks::function]
    async fn node_chunk(self: Vc<Self>) -> Result<Vc<Box<dyn OutputAsset>>> {
        let this = turbo_tasks::read!(self)?;

        let chunking_context = this.project.server_chunking_context(false);

        let userland_module = turbo_tasks::read!(self.entry_module().to_resolved())?;
        let module_graph = this.project.module_graph(*userland_module);

        let EntryChunkGroupResult { asset: chunk, .. } =
            *turbo_tasks::read!(chunking_context.entry_chunk_group(
                turbo_tasks::read!(this.project.node_root())?.join("server/instrumentation.js")?,
                ChunkGroup::Entry(vec![userland_module]),
                module_graph,
                OutputAssets::empty(),
                OutputAssets::empty(),
                AvailabilityInfo::root(),
            ))?;
        Ok(*chunk)
    }

    #[turbo_tasks::function]
    async fn output_assets(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = turbo_tasks::read!(self)?;

        if this.is_edge {
            let edge_chunk_group = self.edge_chunk_group();
            let edge_all_assets = edge_chunk_group.expand_all_assets();

            let node_root = turbo_tasks::read!(this.project.node_root().owned())?;
            let node_root_value = node_root.clone();

            let file_paths_from_root = turbo_tasks::read!(get_js_paths_from_root(
                &node_root_value,
                turbo_tasks::read!(turbo_tasks::read!(edge_chunk_group)?.assets)?
            ))?;

            let mut output_assets = turbo_tasks::read!(edge_chunk_group.all_assets().owned())?;

            let wasm_paths_from_root = turbo_tasks::read!(get_wasm_paths_from_root(
                &node_root_value,
                turbo_tasks::read!(edge_all_assets)?
            ))?;

            let instrumentation_definition = InstrumentationDefinition {
                files: file_paths_from_root,
                wasm: turbo_tasks::read!(wasm_paths_to_bindings(wasm_paths_from_root))?,
                name: rcstr!("instrumentation"),
                ..Default::default()
            };
            let middleware_manifest_v2 = MiddlewaresManifestV2 {
                instrumentation: Some(instrumentation_definition),
                ..Default::default()
            };
            let middleware_manifest_v2 = turbo_tasks::read!(
                VirtualOutputAsset::new(
                    node_root.join("server/instrumentation/middleware-manifest.json")?,
                    AssetContent::file(
                        FileContent::Content(File::from(serde_json::to_string_pretty(
                            &middleware_manifest_v2,
                        )?))
                        .cell(),
                    ),
                )
                .to_resolved()
            )?;
            output_assets.push(ResolvedVc::upcast(middleware_manifest_v2));

            Ok(Vc::cell(output_assets))
        } else {
            let chunk = turbo_tasks::read!(self.node_chunk().to_resolved())?;
            let mut output_assets = vec![chunk];
            if *turbo_tasks::read!(this.project.should_write_nft_manifests())? {
                output_assets.push(ResolvedVc::upcast(turbo_tasks::read!(
                    NftJsonAsset::new(*this.project, None, *chunk, vec![], self.trace_result())
                        .to_resolved()
                )?));
            }
            Ok(Vc::cell(output_assets))
        }
    }

    #[turbo_tasks::function]
    async fn trace_result(self: Vc<Self>) -> Result<Vc<EndpointTraceResult>> {
        let this = turbo_tasks::read!(self)?;
        let userland_module = self.entry_module();
        Ok(trace_endpoint(
            *this.project,
            None,
            this.project.module_graph(userland_module),
            userland_module,
        ))
    }
}

#[turbo_tasks::value_impl]
impl Endpoint for InstrumentationEndpoint {
    #[turbo_tasks::function]
    async fn output(self: ResolvedVc<Self>) -> Result<Vc<EndpointOutput>> {
        let span = tracing::info_span!("instrumentation endpoint");
        #[cfg(not(feature = "sync"))]
        {
            turbo_tasks::read!(
                async move {
                    let this = turbo_tasks::read!(self)?;
                    let output_assets = self.output_assets();

                    let server_paths = if turbo_tasks::read!(this.project.next_mode())?
                        .is_development()
                    {
                        let node_root = turbo_tasks::read!(this.project.node_root().owned())?;
                        turbo_tasks::read!(all_asset_paths(output_assets, node_root, None).owned())?
                    } else {
                        vec![]
                    };

                    Ok(EndpointOutput {
                        output_assets: turbo_tasks::read!(output_assets.to_resolved())?,
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
            )
        }
        #[cfg(feature = "sync")]
        {
            let _g = span.entered();
            let this = turbo_tasks::read!(self)?;
            let output_assets = self.output_assets();

            let server_paths = if turbo_tasks::read!(this.project.next_mode())?.is_development() {
                let node_root = turbo_tasks::read!(this.project.node_root().owned())?;
                turbo_tasks::read!(all_asset_paths(output_assets, node_root, None).owned())?
            } else {
                vec![]
            };

            Ok(EndpointOutput {
                output_assets: turbo_tasks::read!(output_assets.to_resolved())?,
                output_paths: EndpointOutputPaths::Edge {
                    server_paths,
                    client_paths: vec![],
                }
                .resolved_cell(),
                project: this.project,
            }
            .cell())
        }
    }

    #[turbo_tasks::function]
    async fn server_changed(self: Vc<Self>) -> Result<Vc<Completion>> {
        Ok(turbo_tasks::read!(self)?
            .project
            .server_changed(self.output_assets()))
    }

    #[turbo_tasks::function]
    fn client_changed(self: Vc<Self>) -> Vc<Completion> {
        Completion::immutable()
    }

    #[turbo_tasks::function]
    async fn entries(self: Vc<Self>) -> Result<Vc<GraphEntries>> {
        let entry_module = turbo_tasks::read!(self.entry_module().to_resolved())?;
        Ok(
            GraphEntries::from_chunk_groups(vec![ChunkGroupEntry::Entry(vec![entry_module])])
                .cell(),
        )
    }

    #[turbo_tasks::function]
    async fn module_graphs(self: Vc<Self>) -> Result<Vc<ModuleGraphs>> {
        let this = turbo_tasks::read!(self)?;
        let module = self.entry_module();
        let module_graph = turbo_tasks::read!(this.project.module_graph(module).to_resolved())?;
        Ok(Vc::cell(vec![module_graph]))
    }

    #[turbo_tasks::function]
    fn project(&self) -> Vc<Project> {
        *self.project
    }

    #[turbo_tasks::function]
    fn traced_files(self: Vc<Self>) -> Vc<FileSystemPathVec> {
        self.trace_result().all_files()
    }
}
