use anyhow::Result;
use next_core::{app_structure::FileSystemPathVec, module_federation::module_federation_options};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{Completion, ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    chunk::{ChunkingContext, EntryChunkGroupResult, availability_info::AvailabilityInfo},
    context::AssetContext,
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, StyledString},
    module_graph::{
        GraphEntries, ModuleGraph, SingleModuleGraph,
        chunk_group_info::{ChunkGroup, ChunkGroupEntry, EntryHeuristics},
    },
    output::{OutputAsset, OutputAssets},
    reference_type::{EntryReferenceSubType, ReferenceType},
    source::Source,
};
use turbopack_module_federation::{container_entry_source, module_federation_chunk_loading_global};

use crate::{
    project::Project,
    route::{Endpoint, EndpointOutput, EndpointOutputPaths, ModuleGraphs},
};

/// Project-global endpoint for the configured Module Federation remote entry.
///
/// The endpoint is present only when the configuration exposes at least one module. Keeping it
/// independent from route endpoints makes the remote entry available before any page is compiled
/// and ensures production emits it exactly once.
#[turbo_tasks::value]
pub struct ModuleFederationEndpoint {
    project: ResolvedVc<Project>,
}

#[turbo_tasks::value_impl]
impl ModuleFederationEndpoint {
    #[turbo_tasks::function]
    pub fn new(project: ResolvedVc<Project>) -> Vc<Self> {
        Self { project }.cell()
    }
}

#[turbo_tasks::value_impl]
impl Endpoint for ModuleFederationEndpoint {
    #[turbo_tasks::function]
    async fn output(self: ResolvedVc<Self>) -> Result<Vc<EndpointOutput>> {
        let this = self.await?;
        let output_assets = module_federation_output_assets(*this.project);

        Ok(EndpointOutput {
            output_assets: output_assets.to_resolved().await?,
            output_paths: EndpointOutputPaths::NotFound.resolved_cell(),
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
        let project = self.await?.project;
        Ok(project.client_changed(module_federation_output_assets(*project)))
    }

    #[turbo_tasks::function]
    fn entries(self: Vc<Self>) -> Vc<GraphEntries> {
        GraphEntries::empty()
    }

    #[turbo_tasks::function]
    fn module_graphs(self: Vc<Self>) -> Vc<ModuleGraphs> {
        Vc::cell(vec![])
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

/// Compiles the configured container into one self-contained browser entry.
///
/// Next owns the endpoint, fixed filename, compilation contexts, and issue reporting. The
/// framework-neutral crate owns configuration semantics and generated protocol modules.
#[turbo_tasks::function]
pub async fn module_federation_output_assets(project: Vc<Project>) -> Result<Vc<OutputAssets>> {
    let config = project.next_config().turbopack_module_federation().await?;
    let Some(config) = &*config else {
        return Ok(OutputAssets::empty());
    };
    if !config
        .exposes
        .as_ref()
        .is_some_and(|exposes| !exposes.is_empty())
    {
        return Ok(OutputAssets::empty());
    }

    let options = match module_federation_options(config) {
        Ok(options) => options,
        Err(error) => {
            InvalidModuleFederationConfigIssue {
                message: error.to_string().into(),
                file_path: project.project_path().owned().await?,
            }
            .resolved_cell()
            .emit();
            return Ok(OutputAssets::empty());
        }
    };
    let filename = config.filename();
    let chunk_loading_global = module_federation_chunk_loading_global(&options.name);
    let options = options.resolved_cell();
    let source = container_entry_source(project.project_path().owned().await?, *options);
    let asset = module_federation_chunk(project, filename, source, chunk_loading_global)
        .to_resolved()
        .await?;
    Ok(Vc::cell(vec![asset]))
}

#[turbo_tasks::function]
async fn module_federation_chunk(
    project: Vc<Project>,
    filename: RcStr,
    source: Vc<Box<dyn Source>>,
    chunk_loading_global: RcStr,
) -> Result<Vc<Box<dyn OutputAsset>>> {
    let asset_context = project.module_federation_asset_context();
    let chunking_context = project.module_federation_chunking_context(chunk_loading_global);
    let is_production = project.next_mode().await?.is_production();
    let module = asset_context
        .process(source, ReferenceType::Entry(EntryReferenceSubType::Web))
        .module()
        .to_resolved()
        .await?;

    let own_graph = ModuleGraph::from_graphs(
        vec![SingleModuleGraph::new_with_entry(
            ChunkGroupEntry::Entry {
                modules: vec![module],
                heuristics: EntryHeuristics::default(),
            },
            *project.should_write_nft_manifests().await?,
            is_production,
        )],
        None,
    )
    .connect();
    let output_path = project
        .client_relative_path()
        .owned()
        .await?
        .join(&filename)?;
    let EntryChunkGroupResult { asset, .. } = *chunking_context
        .entry_chunk_group(
            output_path,
            ChunkGroup::Entry(vec![module]),
            own_graph,
            OutputAssets::empty(),
            OutputAssets::empty(),
            AvailabilityInfo::root(),
        )
        .await?;
    Ok(*asset)
}

#[turbo_tasks::value(shared)]
struct InvalidModuleFederationConfigIssue {
    message: RcStr,
    file_path: FileSystemPath,
}

#[async_trait::async_trait]
#[turbo_tasks::value_impl]
impl Issue for InvalidModuleFederationConfigIssue {
    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.file_path.clone())
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Config
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(rcstr!(
            "Invalid Module Federation config"
        )))
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Text(self.message.clone())))
    }

    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    fn documentation_link(&self) -> RcStr {
        rcstr!(
            "https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopackModuleFederation"
        )
    }
}
