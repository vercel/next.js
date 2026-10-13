use std::collections::BTreeSet;

use anyhow::{Context, Result, bail};
use next_core::app_structure::FileSystemPathVec;
use turbo_rcstr::RcStr;
use turbo_tasks::{Completion, Completions, ResolvedVc, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbopack::module_federation::{module_federation_container_source, shared_provider_version};
use turbopack_browser::BrowserChunkingContext;
use turbopack_core::{
    asset::AssetContent,
    changed::any_source_content_changed_of_module,
    chunk::{
        AssetSuffix, ChunkableModule, ChunkingContext, ChunkingContextExt, EntryChunkGroupResult,
        availability_info::AvailabilityInfo,
    },
    context::AssetContext,
    module::Module,
    module_graph::{
        GraphEntries, ModuleGraph, SingleModuleGraph,
        binding_usage_info::compute_binding_usage_info,
        chunk_group_info::{ChunkGroup, ChunkGroupEntry, EntryHeuristics},
    },
    output::{OutputAsset, OutputAssets, OutputAssetsReference},
    reference_type::{EcmaScriptModulesReferenceSubType, EntryReferenceSubType, ReferenceType},
    resolve::{ResolveErrorMode, origin::PlainResolveOrigin, parse::Request, pattern::Pattern},
    source::Source,
    virtual_output::VirtualOutputAsset,
};
use turbopack_resolve::ecmascript::esm_resolve;

use crate::{
    app::AppProject,
    project::Project,
    route::{Endpoint, EndpointOutput, EndpointOutputPaths, ModuleGraphs},
};

/// Returns a manifest-relative JS or CSS path, checking that the entry actually emits it.
async fn manifest_asset_path(
    asset: ResolvedVc<Box<dyn OutputAsset>>,
    static_root: &FileSystemPath,
    emitted_paths: &BTreeSet<RcStr>,
) -> Result<Option<RcStr>> {
    let path = asset.path().owned().await?;
    let relative = static_root
        .get_relative_path_to(&path)
        .context("Federation output must share its filesystem with the static root")?;
    if !relative.ends_with(".js") && !relative.ends_with(".css") {
        return Ok(None);
    }
    if relative.starts_with("../") || relative.starts_with('/') || relative == ".." {
        bail!("Federation asset escapes the public static root");
    }
    if !emitted_paths.contains(&relative) {
        bail!("Federation manifest asset {relative} is not referenced by its entry");
    }
    Ok(Some(relative))
}

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
            .turbopack_module_federation_for_client(true)
            .await?;
        let source: Vc<Box<dyn Source>> = *module_federation_container_source(
            self.project.project_path().owned().await?,
            &config,
        )
        .await?;
        Ok(self
            .app_project
            .federation_expose_module_context()
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
        let is_production = this.project.next_mode().await?.is_production();
        let graphs = vec![SingleModuleGraph::new_with_entry(
            ChunkGroupEntry::Entry {
                modules: vec![module],
                heuristics: EntryHeuristics::high_priority(),
            },
            false,
            is_production,
        )];
        let (module_graph, binding_usage_info) = if is_production {
            let graph_without_usage = ModuleGraph::from_graphs(graphs.clone(), None);
            let binding_usage_info = compute_binding_usage_info(graph_without_usage, true);
            let resolved_binding_usage_info = binding_usage_info.resolve().await?;
            (
                ModuleGraph::from_graphs(graphs, Some(binding_usage_info)).connect(),
                Some(resolved_binding_usage_info),
            )
        } else {
            (ModuleGraph::from_graphs(graphs, None).connect(), None)
        };
        let client_chunking_context = this.project.client_chunking_context().to_resolved().await?;
        let client_chunking_context =
            ResolvedVc::try_downcast_type::<BrowserChunkingContext>(client_chunking_context)
                .context("expected a browser chunking context")?;
        let federation_chunk_root = this
            .project
            .node_root()
            .owned()
            .await?
            .join("static/chunks/mf")?;
        let output_root_to_root_path = format!(
            "../../../{}",
            client_chunking_context.output_root_to_root_path().await?
        )
        .into();
        let mut federation_chunking_context = client_chunking_context
            .await?
            .clone_builder()
            .asset_suffix(AssetSuffix::None.resolved_cell())
            .output_root(federation_chunk_root.clone(), output_root_to_root_path)
            .chunk_root_path(federation_chunk_root.clone())
            .asset_root_path(federation_chunk_root.join("media")?)
            .shared_runtime(false)
            .shared_runtime_chunk(false)
            .chunk_loading_global(format!("TURBOPACK_{name}").into());
        if let Some(binding_usage_info) = binding_usage_info {
            federation_chunking_context = federation_chunking_context
                .export_usage(Some(binding_usage_info))
                .unused_references(binding_usage_info.unused_references().to_resolved().await?);
        }
        let federation_chunking_context = federation_chunking_context.build();
        let static_root = this.project.node_root().owned().await?.join("static")?;
        let EntryChunkGroupResult {
            asset,
            availability_info,
        } = *federation_chunking_context
            .entry_chunk_group(
                static_root.join(&filename)?,
                ChunkGroup::Entry(vec![module]),
                module_graph,
                OutputAssets::empty(),
                OutputAssets::empty(),
                AvailabilityInfo::root(),
            )
            .await?;
        let (entry_path, entry_name) = filename.rsplit_once('/').unwrap_or(("", filename.as_str()));
        let mut emitted_paths = BTreeSet::new();
        let referenced = asset.references().expand_all_assets().await?;
        for output_asset in std::iter::once(asset).chain(referenced.iter().copied()) {
            let path = output_asset.path().owned().await?;
            let relative = static_root.get_relative_path_to(&path).context(
                "Federation entry output must share its filesystem with the static root",
            )?;
            emitted_paths.insert(relative);
        }

        let mut exposes = Vec::with_capacity(config.exposes.len());
        let expose_origin = Vc::upcast(PlainResolveOrigin::new(
            Vc::upcast(this.app_project.federation_expose_module_context()),
            this.project
                .project_path()
                .owned()
                .await?
                .join("__turbopack_module_federation_entry__.js")?,
        ));
        for expose in &config.exposes {
            let mut sync_js = BTreeSet::new();
            let mut async_js = BTreeSet::new();
            let mut sync_css = BTreeSet::new();
            let mut async_css = BTreeSet::new();
            for request in &expose.imports {
                let exposed_module = esm_resolve(
                    expose_origin,
                    Request::parse(Pattern::Constant(request.clone())),
                    EcmaScriptModulesReferenceSubType::DynamicImport,
                    ResolveErrorMode::Error,
                    None,
                )
                .await?
                .await?
                .first_module()
                .await?
                .with_context(|| format!("Federation expose {request} did not resolve"))?;
                let chunkable =
                    ResolvedVc::try_sidecast::<Box<dyn ChunkableModule>>(exposed_module)
                        .with_context(|| format!("Federation expose {request} is not chunkable"))?;
                // Replay the exact async chunk group that the entry's dynamic import loader uses.
                let group = federation_chunking_context.chunk_group_assets(
                    chunkable.ident(),
                    ChunkGroup::Async(exposed_module),
                    module_graph,
                    availability_info.in_async_module(),
                );
                let direct = group.await?.assets;
                for candidate in direct.await?.iter().copied() {
                    if let Some(path) =
                        manifest_asset_path(candidate, &static_root, &emitted_paths).await?
                    {
                        if path.ends_with(".js") {
                            sync_js.insert(path);
                        } else {
                            sync_css.insert(path);
                        }
                    }
                }
                for candidate in group.expand_all_assets().await?.iter().copied() {
                    if let Some(path) =
                        manifest_asset_path(candidate, &static_root, &emitted_paths).await?
                    {
                        if path.ends_with(".js") && !sync_js.contains(&path) {
                            async_js.insert(path);
                        } else if path.ends_with(".css") && !sync_css.contains(&path) {
                            async_css.insert(path);
                        }
                    }
                }
            }
            async_js.retain(|path| !sync_js.contains(path));
            async_css.retain(|path| !sync_css.contains(path));
            let exposed = expose.request.strip_prefix("./").unwrap_or(&expose.request);
            exposes.push(serde_json::json!({
                "id": format!("{name}:{exposed}"),
                "name": exposed,
                "path": expose.request,
                "assets": {
                    "js": { "sync": sync_js, "async": async_js },
                    "css": { "sync": sync_css, "async": async_css },
                },
            }));
        }
        let project_path = this.project.project_path().owned().await?;
        let mut shared = Vec::new();
        for provider in config
            .shared
            .iter()
            .filter(|provider| provider.import.is_some())
        {
            let version = shared_provider_version(&project_path, provider).await?;
            shared.push(serde_json::json!({
                "id": format!("{name}:{}", provider.share_key),
                "name": provider.share_key,
                "version": version,
                "requiredVersion": provider.required_version,
                "singleton": provider.singleton,
                "assets": {
                    "js": { "sync": [], "async": [] },
                    "css": { "sync": [], "async": [] },
                },
            }));
        }
        let remotes = config
            .remotes
            .iter()
            .filter_map(|remote| {
                let (global, url) = if let Some(manifest) = &remote.manifest {
                    (remote.request.as_str(), manifest.as_str())
                } else {
                    let entry = remote.external.first()?;
                    (entry.global.as_str(), entry.url.as_str())
                };
                Some(serde_json::json!({
                    "federationContainerName": global,
                    "moduleName": ".",
                    "alias": remote.request,
                    "entry": url,
                }))
            })
            .collect::<Vec<_>>();
        let manifest = serde_json::json!({
            "id": name,
            "name": name,
            "metaData": {
                "name": name,
                "globalName": name,
                "buildInfo": { "buildVersion": "UNKNOWN", "buildName": "UNKNOWN" },
                "publicPath": "auto",
                "remoteEntry": { "name": entry_name, "path": entry_path, "type": "global" },
            },
            "shared": shared,
            "remotes": remotes,
            "exposes": exposes,
        });
        let manifest_asset = ResolvedVc::upcast(
            VirtualOutputAsset::new(
                static_root.join("mf-manifest.json")?,
                AssetContent::file(
                    FileContent::Content(File::from(serde_json::to_string_pretty(&manifest)?))
                        .cell(),
                ),
            )
            .to_resolved()
            .await?,
        );
        Ok(Vc::cell(vec![asset, manifest_asset]))
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
        let project = self.await?.project;
        let outputs = project.federation_changed(self.output_assets());
        if !project
            .next_config()
            .turbopack_module_federation()
            .await?
            .dts_enabled
        {
            return Ok(outputs);
        }
        // A declaration-only edit need not change the emitted JS. Watch the exposed source
        // graph as well so development type archives cannot silently become stale.
        let source =
            any_source_content_changed_of_module(*self.entry_module().to_resolved().await?);
        Ok(Vc::<Completions>::cell(vec![
            outputs.to_resolved().await?,
            source.to_resolved().await?,
        ])
        .completed())
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
