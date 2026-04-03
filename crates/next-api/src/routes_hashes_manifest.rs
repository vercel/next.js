use anyhow::Result;
use serde::Serialize;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, FxIndexSet, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc};
use turbo_tasks_fs::{FileContent, FileSystemPath};
use turbo_tasks_hash::{DeterministicHash, Xxh3Hash64Hasher};
use turbopack_core::{
    asset::{Asset, AssetContent},
    module::{Module, Modules},
    module_graph::{GraphTraversalAction, ModuleGraph},
    output::{
        ExpandOutputAssetsInput, OutputAsset, OutputAssets, OutputAssetsReference,
        expand_output_assets,
    },
};

use crate::{
    project::Project,
    route::{Endpoint, EndpointGroup, Endpoints},
};

#[turbo_tasks::value(shared)]
pub struct EndpointHashes {
    pub sources_hash: u64,
    pub outputs_hash: u64,
}

impl EndpointHashes {
    pub fn merge<'l>(iterator: impl Iterator<Item = (Option<RcStr>, &'l EndpointHashes)>) -> Self {
        let mut sources_hasher = Xxh3Hash64Hasher::new();
        let mut outputs_hasher = Xxh3Hash64Hasher::new();

        for (key, hashes) in iterator {
            key.deterministic_hash(&mut sources_hasher);
            key.deterministic_hash(&mut outputs_hasher);
            hashes.sources_hash.deterministic_hash(&mut sources_hasher);
            hashes.outputs_hash.deterministic_hash(&mut outputs_hasher);
        }

        Self {
            sources_hash: sources_hasher.finish(),
            outputs_hash: outputs_hasher.finish(),
        }
    }
}

#[turbo_tasks::function]
pub async fn endpoint_outputs(endpoint: Vc<Box<dyn Endpoint>>) -> Result<Vc<OutputAssets>> {
    Ok(*endpoint.output().await?.output_assets)
}

#[turbo_tasks::function]
pub async fn endpoints_outputs(endpoints: Vc<Endpoints>) -> Result<Vc<OutputAssets>> {
    let endpoints = endpoints.await?;
    let all_outputs = endpoints
        .iter()
        .map(async |endpoint| Ok(endpoint.output().await?.output_assets.await?))
        .try_join()
        .await?;
    let set = all_outputs
        .into_iter()
        .flatten()
        .copied()
        .collect::<FxIndexSet<_>>();
    Ok(Vc::cell(set.into_iter().collect()))
}

#[turbo_tasks::function]
pub async fn outputs_hash(outputs: Vc<OutputAssets>) -> Result<Vc<u64>> {
    let output_assets = expand_output_assets(
        outputs
            .await?
            .into_iter()
            .map(|asset| ExpandOutputAssetsInput::Asset(*asset)),
        true,
    )
    .await?;
    let outputs_hashes = output_assets
        .iter()
        .map(|asset| asset.content().hash())
        .try_join()
        .await?;

    let outputs_hash = {
        let mut hasher = Xxh3Hash64Hasher::new();
        for hash in outputs_hashes.iter() {
            hash.deterministic_hash(&mut hasher);
        }
        hasher.finish()
    };

    Ok(Vc::cell(outputs_hash))
}

#[turbo_tasks::function]
pub async fn endpoint_entry_modules(
    base_module_graph: Vc<ModuleGraph>,
    endpoint: Vc<Box<dyn Endpoint>>,
) -> Result<Vc<Modules>> {
    let entries = endpoint.entries();
    let additional_entries = endpoint.additional_entries(base_module_graph);
    let modules = entries
        .await?
        .into_iter()
        .chain(additional_entries.await?.into_iter())
        .flat_map(|e| e.entries())
        .collect::<FxIndexSet<_>>();
    Ok(Vc::cell(modules.into_iter().collect()))
}

#[turbo_tasks::function]
pub async fn endpoints_entry_modules(
    base_module_graph: Vc<ModuleGraph>,
    endpoints: Vc<Endpoints>,
) -> Result<Vc<Modules>> {
    let endpoints = endpoints.await?;
    let entries_and_additional_entries = endpoints
        .iter()
        .map(async |endpoint| {
            let entries = endpoint.entries();
            let additional_entries = endpoint.additional_entries(base_module_graph);
            Ok((entries.await?, additional_entries.await?))
        })
        .try_join()
        .await?;
    let modules = entries_and_additional_entries
        .into_iter()
        .flat_map(|(entries, additional_entries)| {
            entries
                .into_iter()
                .chain(additional_entries.into_iter())
                .flat_map(|e| e.entries())
        })
        .collect::<FxIndexSet<_>>();
    Ok(Vc::cell(modules.into_iter().collect()))
}

#[turbo_tasks::function]
pub async fn sources_hash(module_graph: Vc<ModuleGraph>, modules: Vc<Modules>) -> Result<Vc<u64>> {
    let modules = modules.await?;

    let mut all_modules = FxIndexSet::default();

    let module_graph = module_graph.await?;

    module_graph.traverse_nodes_dfs(
        modules.into_iter().copied(),
        &mut all_modules,
        |module, all_modules| {
            all_modules.insert(*module);
            Ok(GraphTraversalAction::Continue)
        },
        |_, _| Ok(()),
    )?;

    let sources = all_modules
        .iter()
        .map(|module| module.source())
        .try_flat_join()
        .await?
        .into_iter()
        .map(|source| source.content().hash())
        .try_join()
        .await?;

    let sources_hash = {
        let mut hasher = Xxh3Hash64Hasher::new();
        for source in sources.iter() {
            source.deterministic_hash(&mut hasher);
        }
        hasher.finish()
    };

    Ok(Vc::cell(sources_hash))
}

#[derive(Serialize)]
struct RoutesHashesManifest<'l> {
    pub routes: FxIndexMap<&'l str, EndpointHashStrings>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EndpointHashStrings {
    pub sources_hash: String,
    pub outputs_hash: String,
}

#[turbo_tasks::value]
pub struct RoutesHashesManifestAsset {
    path: FileSystemPath,
    project: ResolvedVc<Project>,
}

#[turbo_tasks::value_impl]
impl RoutesHashesManifestAsset {
    #[turbo_tasks::function]
    pub fn new(path: FileSystemPath, project: ResolvedVc<Project>) -> Vc<Self> {
        RoutesHashesManifestAsset { path, project }.cell()
    }
}

#[turbo_tasks::value_impl]
impl Asset for RoutesHashesManifestAsset {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        let module_graphs = self.project.whole_app_module_graphs().await?;
        let base_module_graph = *module_graphs.base;
        let full_module_graph = *module_graphs.full;

        let mut entrypoint_hashes = FxIndexMap::default();

        let entrypoint_groups = self.project.get_all_endpoint_groups(false).await?;

        for (key, EndpointGroup { primary, .. }) in entrypoint_groups {
            let entry = if let &[entry] = &primary.as_slice() {
                (
                    sources_hash(
                        full_module_graph,
                        endpoint_entry_modules(base_module_graph, *entry.endpoint),
                    ),
                    outputs_hash(endpoint_outputs(*entry.endpoint)),
                )
            } else {
                let endpoints = Vc::cell(primary.iter().map(|entry| entry.endpoint).collect());
                (
                    sources_hash(
                        full_module_graph,
                        endpoints_entry_modules(base_module_graph, endpoints),
                    ),
                    outputs_hash(endpoints_outputs(endpoints)),
                )
            };
            entrypoint_hashes.insert(key.as_str(), entry);
        }

        let entrypoint_hashes_values = entrypoint_hashes
            .values()
            .map(async |(sources_hash, outputs_hash)| {
                Ok((sources_hash.await?, outputs_hash.await?))
            })
            .try_join()
            .await?;

        let manifest = serde_json::to_string_pretty(&RoutesHashesManifest {
            routes: entrypoint_hashes
                .into_keys()
                .zip(entrypoint_hashes_values.into_iter())
                .map(|(k, (sources_hash, outputs_hash))| {
                    (
                        k,
                        EndpointHashStrings {
                            sources_hash: format!("{:016x}", *sources_hash),
                            outputs_hash: format!("{:016x}", *outputs_hash),
                        },
                    )
                })
                .collect(),
        })?;
        Ok(AssetContent::File(FileContent::Content(manifest.into()).resolved_cell()).cell())
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for RoutesHashesManifestAsset {}

#[turbo_tasks::value_impl]
impl OutputAsset for RoutesHashesManifestAsset {
    #[turbo_tasks::function]
    fn path(&self) -> Vc<FileSystemPath> {
        self.path.clone().cell()
    }
}

#[turbo_tasks::function]
pub async fn routes_hashes_manifest_asset_if_enabled(
    project: ResolvedVc<Project>,
) -> Result<Vc<OutputAssets>> {
    let should_write = *project.should_write_routes_hashes_manifest().await?;
    let assets = if should_write {
        let path = project
            .node_root()
            .await?
            .join("diagnostics/routes-hashes-manifest.json")?;
        let asset = RoutesHashesManifestAsset::new(path, *project)
            .to_resolved()
            .await?;
        vec![ResolvedVc::upcast(asset)]
    } else {
        vec![]
    };
    Ok(Vc::cell(assets))
}
