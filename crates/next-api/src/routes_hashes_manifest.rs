use anyhow::Result;
use serde::Serialize;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, FxIndexSet, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc};
use turbo_tasks_fs::{FileContent, FileSystemPath};
use turbo_tasks_hash::{DeterministicHash, HashAlgorithm, Xxh3Hash64Hasher, hash_xxh3_hash64};
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
    Ok(*turbo_tasks::read!(endpoint.output())?.output_assets)
}

#[turbo_tasks::function]
pub async fn endpoints_outputs(endpoints: Vc<Endpoints>) -> Result<Vc<OutputAssets>> {
    let endpoints = turbo_tasks::read!(endpoints)?;
    #[cfg(not(feature = "sync"))]
    let all_outputs = turbo_tasks::read!(
        endpoints
            .iter()
            .map(async |endpoint| Ok(turbo_tasks::read!(
                turbo_tasks::read!(endpoint.output())?.output_assets
            )?))
            .try_join()
    )?;
    #[cfg(feature = "sync")]
    let all_outputs = {
        let mut all_outputs = Vec::new();
        for endpoint in endpoints.iter() {
            all_outputs.push({
                Ok::<_, anyhow::Error>(turbo_tasks::read!(
                    turbo_tasks::read!(endpoint.output())?.output_assets
                )?)?
            });
        }
        all_outputs
    };
    let set = all_outputs.into_iter().flatten().collect::<FxIndexSet<_>>();
    Ok(Vc::cell(set.into_iter().collect()))
}

#[turbo_tasks::function]
pub async fn outputs_hash(outputs: Vc<OutputAssets>) -> Result<Vc<u64>> {
    let output_assets = turbo_tasks::read!(expand_output_assets(
        turbo_tasks::read!(outputs)?
            .into_iter()
            .map(ExpandOutputAssetsInput::Asset),
        true,
    ))?;
    #[cfg(not(feature = "sync"))]
    let outputs_hashes = turbo_tasks::read!(
        output_assets
            .iter()
            .map(|asset| asset.content().hash(HashAlgorithm::Xxh3Hash128Hex))
            .try_join()
    )?;
    #[cfg(feature = "sync")]
    let outputs_hashes = {
        let mut outputs_hashes = Vec::new();
        for asset in output_assets.iter() {
            outputs_hashes.push(turbo_tasks::read!(
                asset.content().hash(HashAlgorithm::Xxh3Hash128Hex)
            )?);
        }
        outputs_hashes
    };

    Ok(Vc::cell(hash_xxh3_hash64(outputs_hashes)))
}

#[turbo_tasks::function]
pub async fn endpoint_entry_modules(
    base_module_graph: Vc<ModuleGraph>,
    endpoint: Vc<Box<dyn Endpoint>>,
) -> Result<Vc<Modules>> {
    let entries = turbo_tasks::read!(endpoint.entries())?;
    let additional_entries = turbo_tasks::read!(endpoint.additional_entries(base_module_graph))?;
    let modules = entries
        .chunk_group_modules()
        .chain(additional_entries.chunk_group_modules())
        .collect::<FxIndexSet<_>>();
    Ok(Vc::cell(modules.into_iter().collect()))
}

#[turbo_tasks::function]
pub async fn endpoints_entry_modules(
    base_module_graph: Vc<ModuleGraph>,
    endpoints: Vc<Endpoints>,
) -> Result<Vc<Modules>> {
    let endpoints = turbo_tasks::read!(endpoints)?;
    #[cfg(not(feature = "sync"))]
    let entries_and_additional_entries = turbo_tasks::read!(
        endpoints
            .iter()
            .map(async |endpoint| {
                let entries = endpoint.entries();
                let additional_entries = endpoint.additional_entries(base_module_graph);
                Ok((
                    turbo_tasks::read!(entries)?,
                    turbo_tasks::read!(additional_entries)?,
                ))
            })
            .try_join()
    )?;
    #[cfg(feature = "sync")]
    let entries_and_additional_entries = {
        let mut entries_and_additional_entries = Vec::new();
        for endpoint in endpoints.iter() {
            let entries = endpoint.entries();
            let additional_entries = endpoint.additional_entries(base_module_graph);
            entries_and_additional_entries.push((
                turbo_tasks::read!(entries)?,
                turbo_tasks::read!(additional_entries)?,
            ));
        }
        entries_and_additional_entries
    };
    let modules = entries_and_additional_entries
        .iter()
        .flat_map(|(entries, additional_entries)| {
            entries
                .chunk_group_modules()
                .chain(additional_entries.chunk_group_modules())
        })
        .collect::<FxIndexSet<_>>();
    Ok(Vc::cell(modules.into_iter().collect()))
}

#[turbo_tasks::function]
pub async fn sources_hash(module_graph: Vc<ModuleGraph>, modules: Vc<Modules>) -> Result<Vc<u64>> {
    let modules = turbo_tasks::read!(modules)?;

    let mut all_modules = FxIndexSet::default();

    let module_graph = turbo_tasks::read!(module_graph)?;

    module_graph.traverse_nodes_dfs(
        modules,
        &mut all_modules,
        |module, all_modules| {
            all_modules.insert(*module);
            Ok(GraphTraversalAction::Continue)
        },
        |_, _| Ok(()),
    )?;

    #[cfg(not(feature = "sync"))]
    let sources = turbo_tasks::read!(
        turbo_tasks::read!(
            all_modules
                .iter()
                .map(|module| module.source())
                .try_flat_join()
        )?
        .into_iter()
        .map(|source| source.content().hash(HashAlgorithm::Xxh3Hash128Hex))
        .try_join()
    )?;
    #[cfg(feature = "sync")]
    let sources = {
        let flat_sources = {
            let mut flat_sources = Vec::new();
            for module in all_modules.iter() {
                flat_sources.extend(turbo_tasks::read!(module.source())?);
            }
            flat_sources
        };
        let mut sources = Vec::new();
        for source in flat_sources.into_iter() {
            sources.push(turbo_tasks::read!(
                source.content().hash(HashAlgorithm::Xxh3Hash128Hex)
            )?);
        }
        sources
    };

    Ok(Vc::cell(hash_xxh3_hash64(sources)))
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
        let module_graphs = turbo_tasks::read!(self.project.whole_app_module_graphs())?;
        let base_module_graph = *module_graphs.base;
        let full_module_graph = *module_graphs.full;

        let mut entrypoint_hashes = FxIndexMap::default();

        let entrypoint_groups = turbo_tasks::read!(self.project.get_all_endpoint_groups(false))?;

        for (key, EndpointGroup { primary, .. }) in &entrypoint_groups {
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

        #[cfg(not(feature = "sync"))]
        let entrypoint_hashes_values = turbo_tasks::read!(
            entrypoint_hashes
                .values()
                .map(async |(sources_hash, outputs_hash)| {
                    Ok((
                        turbo_tasks::read!(sources_hash)?,
                        turbo_tasks::read!(outputs_hash)?,
                    ))
                })
                .try_join()
        )?;
        #[cfg(feature = "sync")]
        let entrypoint_hashes_values = {
            let mut entrypoint_hashes_values = Vec::new();
            for (sources_hash, outputs_hash) in entrypoint_hashes.values() {
                entrypoint_hashes_values.push((
                    turbo_tasks::read!(sources_hash)?,
                    turbo_tasks::read!(outputs_hash)?,
                ));
            }
            entrypoint_hashes_values
        };

        let manifest = serde_json::to_string_pretty(&RoutesHashesManifest {
            routes: entrypoint_hashes
                .into_keys()
                .zip(entrypoint_hashes_values)
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
    let should_write = *turbo_tasks::read!(project.should_write_routes_hashes_manifest())?;
    let assets = if should_write {
        let path = turbo_tasks::read!(project.node_root())?
            .join("diagnostics/routes-hashes-manifest.json")?;
        let asset =
            turbo_tasks::read!(RoutesHashesManifestAsset::new(path, *project).to_resolved())?;
        vec![ResolvedVc::upcast(asset)]
    } else {
        vec![]
    };
    Ok(Vc::cell(assets))
}
