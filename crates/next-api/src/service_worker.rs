use anyhow::Result;
use next_core::app_structure::FileSystemPathVec;
use tracing::Instrument;
use turbo_tasks::{Completion, ResolvedVc, Vc};
use turbopack_core::{
    chunk::{ChunkingContext, EntryChunkGroupResult, availability_info::AvailabilityInfo},
    context::AssetContext,
    module::Module,
    module_graph::{
        GraphEntries,
        chunk_group_info::{ChunkGroup, ChunkGroupEntry},
    },
    output::{OutputAsset, OutputAssets},
    reference_type::{EntryReferenceSubType, ReferenceType},
    source::Source,
};

use crate::{
    nft::{EndpointTraceResult, trace_endpoint},
    nft_json::NftJsonAsset,
    project::Project,
    route::{Endpoint, EndpointOutput, EndpointOutputPaths, ModuleGraphs},
};

/// Endpoint that compiles `experimental.turbopackServiceWorkerPath` into a
/// single self-contained bundle served as `/service-worker.js`.
#[turbo_tasks::value]
pub struct ServiceWorkerEndpoint {
    project: ResolvedVc<Project>,
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
    source: ResolvedVc<Box<dyn Source>>,
}

#[turbo_tasks::value_impl]
impl ServiceWorkerEndpoint {
    #[turbo_tasks::function]
    pub fn new(
        project: ResolvedVc<Project>,
        asset_context: ResolvedVc<Box<dyn AssetContext>>,
        source: ResolvedVc<Box<dyn Source>>,
    ) -> Vc<Self> {
        Self {
            project,
            asset_context,
            source,
        }
        .cell()
    }

    #[turbo_tasks::function]
    fn entry_module(&self) -> Vc<Box<dyn Module>> {
        self.asset_context
            .process(
                *self.source,
                ReferenceType::Entry(EntryReferenceSubType::Web),
            )
            .module()
    }

    #[turbo_tasks::function]
    async fn chunk(self: Vc<Self>) -> Result<Vc<Box<dyn OutputAsset>>> {
        let this = self.await?;
        let module = self.entry_module().to_resolved().await?;
        let module_graph = this.project.module_graph(*module);
        let chunking_context = this.project.service_worker_chunking_context();

        let EntryChunkGroupResult { asset: chunk, .. } = *chunking_context
            .entry_chunk_group(
                this.project.node_root().await?.join("service-worker.js")?,
                ChunkGroup::Entry(vec![module]),
                module_graph,
                OutputAssets::empty(),
                OutputAssets::empty(),
                AvailabilityInfo::root(),
            )
            .await?;
        Ok(*chunk)
    }

    #[turbo_tasks::function]
    async fn output_assets(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;
        let chunk = self.chunk().to_resolved().await?;
        let mut output_assets = vec![chunk];
        if this.project.next_mode().await?.is_production() {
            output_assets.push(ResolvedVc::upcast(
                NftJsonAsset::new(*this.project, None, *chunk, vec![], self.trace_result())
                    .to_resolved()
                    .await?,
            ));
        }
        Ok(Vc::cell(output_assets))
    }

    #[turbo_tasks::function]
    async fn trace_result(self: Vc<Self>) -> Result<Vc<EndpointTraceResult>> {
        let this = self.await?;
        let module = self.entry_module();
        Ok(trace_endpoint(
            *this.project,
            None,
            this.project.module_graph(module),
            module,
        ))
    }
}

#[turbo_tasks::value_impl]
impl Endpoint for ServiceWorkerEndpoint {
    #[turbo_tasks::function]
    async fn output(self: ResolvedVc<Self>) -> Result<Vc<EndpointOutput>> {
        let span = tracing::info_span!("service worker endpoint");
        async move {
            let this = self.await?;
            let output_assets = self.output_assets();

            // A service worker is not HMR-hot-swapped — the browser updates it via
            // its own install/activate lifecycle — so we surface no per-file dev
            // change paths here. Rebuild-on-edit in dev is handled separately by
            // the endpoint change subscription in `handleEntrypoints`, which
            // rebuilds the bundle on edit and pushes a full page reload so the
            // browser re-fetches the worker and picks up the change.
            Ok(EndpointOutput {
                output_assets: output_assets.to_resolved().await?,
                output_paths: EndpointOutputPaths::Edge {
                    server_paths: vec![],
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
        let entry_module = self.entry_module().to_resolved().await?;
        Ok(
            GraphEntries::from_chunk_groups(vec![ChunkGroupEntry::Entry(vec![entry_module])])
                .cell(),
        )
    }

    #[turbo_tasks::function]
    async fn module_graphs(self: Vc<Self>) -> Result<Vc<ModuleGraphs>> {
        let this = self.await?;
        let module = self.entry_module();
        let module_graph = this.project.module_graph(module).to_resolved().await?;
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
