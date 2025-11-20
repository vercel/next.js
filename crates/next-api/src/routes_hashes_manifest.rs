use anyhow::Result;
use serde::Serialize;
use turbo_tasks::{FxIndexMap, FxIndexSet, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc};
use turbo_tasks_fs::{FileContent, FileSystemPath};
use turbo_tasks_hash::{DeterministicHash, Xxh3Hash64Hasher};
use turbopack_core::{
    asset::{Asset, AssetContent},
    module::Module,
    module_graph::{GraphTraversalAction, ModuleGraph},
    output::{
        ExpandOutputAssetsInput, OutputAsset, OutputAssets, OutputAssetsReference,
        expand_output_assets,
    },
};

use crate::{
    project::Project,
    route::{AppPageRoute, Endpoint, Route},
};

#[turbo_tasks::value(shared)]
pub struct EndpointHashes {
    pub sources_hash: u64,
    pub outputs_hash: u64,
}

impl EndpointHashes {
    pub fn merge<'l>(iterator: impl Iterator<Item = (&'l str, &'l EndpointHashes)>) -> Self {
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
pub async fn endpoint_hashes(
    base_module_graph: Vc<ModuleGraph>,
    module_graph: Vc<ModuleGraph>,
    endpoint: Vc<Box<dyn Endpoint>>,
) -> Result<Vc<EndpointHashes>> {
    let entries = endpoint.entries();
    let additional_entries = endpoint.additional_entries(base_module_graph);
    let modules = entries
        .await?
        .into_iter()
        .chain(additional_entries.await?.into_iter())
        .flat_map(|e| e.entries())
        .collect::<FxIndexSet<_>>();
    let outputs = endpoint.output();

    let mut all_modules = FxIndexSet::default();

    let module_graph = module_graph.read_graphs().await?;

    module_graph.traverse_nodes_from_entries_dfs(
        modules,
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

    let output_assets = expand_output_assets(
        outputs
            .await?
            .output_assets
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

    let sources_hash = {
        let mut hasher = Xxh3Hash64Hasher::new();
        for source in sources.iter() {
            source.deterministic_hash(&mut hasher);
        }
        hasher.finish()
    };
    let outputs_hash = {
        let mut hasher = Xxh3Hash64Hasher::new();
        for hash in outputs_hashes.iter() {
            hash.deterministic_hash(&mut hasher);
        }
        hasher.finish()
    };

    Ok(EndpointHashes {
        sources_hash,
        outputs_hash,
    }
    .cell())
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
        let entrypoints = self.project.entrypoints().await?;
        let module_graphs = self.project.whole_app_module_graphs().await?;
        let base_module_graph = *module_graphs.base;
        let full_module_graph = *module_graphs.full;

        let mut entrypoint_hashes = FxIndexMap::default();

        if let Some(instrumentation) = &entrypoints.instrumentation {
            entrypoint_hashes.insert(
                "instrumentation",
                endpoint_hashes(
                    base_module_graph,
                    full_module_graph,
                    *instrumentation.node_js,
                ),
            );
            entrypoint_hashes.insert(
                "edgeInstrumentation",
                endpoint_hashes(base_module_graph, full_module_graph, *instrumentation.edge),
            );
        }
        if let Some(middleware) = &entrypoints.middleware {
            entrypoint_hashes.insert(
                "middleware",
                endpoint_hashes(base_module_graph, full_module_graph, *middleware.endpoint),
            );
        }
        entrypoint_hashes.insert(
            "_document",
            endpoint_hashes(
                base_module_graph,
                full_module_graph,
                *entrypoints.pages_document_endpoint,
            ),
        );
        entrypoint_hashes.insert(
            "_app",
            endpoint_hashes(
                base_module_graph,
                full_module_graph,
                *entrypoints.pages_app_endpoint,
            ),
        );
        entrypoint_hashes.insert(
            "_error",
            endpoint_hashes(
                base_module_graph,
                full_module_graph,
                *entrypoints.pages_error_endpoint,
            ),
        );

        for (key, route) in entrypoints.routes.iter() {
            match route {
                Route::Page {
                    html_endpoint,
                    // Only for dev
                    data_endpoint: _,
                } => {
                    entrypoint_hashes.insert(
                        key,
                        endpoint_hashes(base_module_graph, full_module_graph, **html_endpoint),
                    );
                }
                Route::PageApi { endpoint } => {
                    entrypoint_hashes.insert(
                        key,
                        endpoint_hashes(base_module_graph, full_module_graph, **endpoint),
                    );
                }
                Route::AppPage(pages) => {
                    if pages.len() == 1 {
                        entrypoint_hashes.insert(
                            key,
                            endpoint_hashes(
                                base_module_graph,
                                full_module_graph,
                                *pages[0].html_endpoint,
                            ),
                        );
                    } else {
                        let hashes = pages
                            .iter()
                            .map(
                                |&AppPageRoute {
                                     original_name: _,
                                     html_endpoint,
                                     // Only for dev
                                     rsc_endpoint: _,
                                 }| {
                                    endpoint_hashes(
                                        base_module_graph,
                                        full_module_graph,
                                        *html_endpoint,
                                    )
                                },
                            )
                            .try_join()
                            .await?;
                        let hashes = EndpointHashes::merge(
                            pages
                                .iter()
                                .map(|page| page.original_name.as_str())
                                .zip(hashes.iter())
                                .map(|(k, v)| (k, &**v)),
                        )
                        .cell();
                        entrypoint_hashes.insert(key, hashes);
                    }
                }
                Route::AppRoute {
                    original_name: _,
                    endpoint,
                } => {
                    entrypoint_hashes.insert(
                        key,
                        endpoint_hashes(base_module_graph, full_module_graph, **endpoint),
                    );
                }
                Route::Conflict => {}
            }
        }

        let entrypoint_hashes_values = entrypoint_hashes.values().copied().try_join().await?;

        let manifest = serde_json::to_string_pretty(&RoutesHashesManifest {
            routes: entrypoint_hashes
                .keys()
                .zip(entrypoint_hashes_values.iter())
                .map(|(k, v)| {
                    (
                        *k,
                        EndpointHashStrings {
                            sources_hash: format!("{:016x}", v.sources_hash),
                            outputs_hash: format!("{:016x}", v.outputs_hash),
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
