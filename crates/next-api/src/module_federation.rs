use anyhow::{Context, Result};
use next_core::app_structure::FileSystemPathVec;
use turbo_tasks::{Completion, ResolvedVc, Vc};
use turbopack::module_federation::module_federation_container_source;
use turbopack_browser::BrowserChunkingContext;
use turbopack_core::{
    chunk::{
        AssetSuffix, ChunkingContext, EntryChunkGroupResult, availability_info::AvailabilityInfo,
    },
    context::AssetContext,
    module::Module,
    module_graph::{
        GraphEntries,
        chunk_group_info::{ChunkGroup, ChunkGroupEntry, EntryHeuristics},
    },
    output::OutputAssets,
    reference_type::{EntryReferenceSubType, ReferenceType},
    source::Source,
};

use crate::{
    app::AppProject,
    project::Project,
    route::{Endpoint, EndpointOutput, EndpointOutputPaths, ModuleGraphs},
};

/// Project-global browser endpoint for a Module Federation container.
#[turbo_tasks::value]
pub struct ModuleFederationEndpoint {
    project: ResolvedVc<Project>,
    app_project: ResolvedVc<AppProject>,
}

#[turbo_tasks::value_impl]
impl ModuleFederationEndpoint {
    #[turbo_tasks::function]
    pub fn new(project: ResolvedVc<Project>, app_project: ResolvedVc<AppProject>) -> Vc<Self> {
        Self {
            project,
            app_project,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn entry_module(&self) -> Result<Vc<Box<dyn Module>>> {
        let config = self
            .project
            .next_config()
            .turbopack_module_federation()
            .await?;
        let source: Vc<Box<dyn Source>> = *module_federation_container_source(
            self.project.project_path().owned().await?,
            &config,
        )
        .await?;
        Ok(self
            .app_project
            .client_module_context()
            .process(source, ReferenceType::Entry(EntryReferenceSubType::Web))
            .module())
    }

    #[turbo_tasks::function]
    async fn output_assets(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;
        let config = this
            .project
            .next_config()
            .turbopack_module_federation()
            .await?;
        let name = config
            .name
            .as_deref()
            .context("Module Federation exposes require a container name")?;
        let filename = config
            .filename
            .clone()
            .unwrap_or_else(|| format!("{name}.js").into());
        let module = self.entry_module().to_resolved().await?;
        let module_graph = this.project.module_graph(*module);
        let client_chunking_context = this.project.client_chunking_context().to_resolved().await?;
        let client_chunking_context =
            ResolvedVc::try_downcast_type::<BrowserChunkingContext>(client_chunking_context)
                .context("expected a browser chunking context")?;
        let federation_chunking_context = client_chunking_context
            .await?
            .clone_builder()
            .asset_suffix(AssetSuffix::None.resolved_cell())
            .shared_runtime(false)
            .shared_runtime_chunk(false)
            .chunk_loading_global(format!("TURBOPACK_{name}").into())
            .single_chunk()
            .await?
            .build();
        let EntryChunkGroupResult { asset, .. } = *federation_chunking_context
            .entry_chunk_group(
                this.project
                    .node_root()
                    .owned()
                    .await?
                    .join("static")?
                    .join(&filename)?,
                ChunkGroup::Entry(vec![module]),
                module_graph,
                OutputAssets::empty(),
                OutputAssets::empty(),
                AvailabilityInfo::root(),
            )
            .await?;
        Ok(Vc::cell(vec![asset]))
    }
}

#[turbo_tasks::value_impl]
impl Endpoint for ModuleFederationEndpoint {
    #[turbo_tasks::function]
    async fn output(self: ResolvedVc<Self>) -> Result<Vc<EndpointOutput>> {
        let this = self.await?;
        Ok(EndpointOutput {
            output_assets: self.output_assets().to_resolved().await?,
            output_paths: EndpointOutputPaths::Edge {
                server_paths: vec![],
                client_paths: vec![],
            }
            .resolved_cell(),
            project: this.project,
        }
        .cell())
    }

    #[turbo_tasks::function]
    fn server_changed(self: Vc<Self>) -> Vc<Completion> {
        Completion::immutable()
    }

    #[turbo_tasks::function]
    async fn client_changed(self: Vc<Self>) -> Result<Vc<Completion>> {
        Ok(self.await?.project.client_changed(self.output_assets()))
    }

    #[turbo_tasks::function]
    async fn entries(self: Vc<Self>) -> Result<Vc<GraphEntries>> {
        let module = self.entry_module().to_resolved().await?;
        Ok(
            GraphEntries::from_chunk_groups(vec![ChunkGroupEntry::Entry {
                modules: vec![module],
                heuristics: EntryHeuristics::high_priority(),
            }])
            .cell(),
        )
    }

    #[turbo_tasks::function]
    async fn module_graphs(self: Vc<Self>) -> Result<Vc<ModuleGraphs>> {
        let this = self.await?;
        let module = self.entry_module().to_resolved().await?;
        Ok(Vc::cell(vec![
            this.project.module_graph(*module).to_resolved().await?,
        ]))
    }

    #[turbo_tasks::function]
    fn project(&self) -> Vc<Project> {
        *self.project
    }

    #[turbo_tasks::function]
    fn traced_files(self: Vc<Self>) -> Vc<FileSystemPathVec> {
        Vc::cell(vec![])
    }
}
