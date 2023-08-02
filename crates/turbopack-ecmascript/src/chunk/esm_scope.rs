use std::collections::HashMap;

use anyhow::{Context, Result};
use petgraph::{algo::tarjan_scc, prelude::DiGraphMap};
use turbo_tasks::{TryFlatJoinIterExt, Value, Vc};
use turbopack_core::{
    chunk::{availability_info::AvailabilityInfo, available_modules::chunkable_modules_set},
    module::{Module, ModulesSet},
};

use crate::{
    chunk::EcmascriptChunkPlaceable,
    references::esm::{base::ReferencedAsset, EsmAssetReference},
    EcmascriptModuleAssets,
};

/// A graph representing all ESM imports in a chunk group.
#[turbo_tasks::value(serialization = "none", cell = "new", eq = "manual")]
pub(crate) struct EsmScope {
    scc_map: HashMap<Vc<Box<dyn EcmascriptChunkPlaceable>>, Vc<EsmScopeScc>>,
    #[turbo_tasks(trace_ignore, debug_ignore)]
    scc_graph: DiGraphMap<Vc<EsmScopeScc>, ()>,
}

/// Represents a strongly connected component in the EsmScope graph.
///
/// See https://en.wikipedia.org/wiki/Strongly_connected_component
#[turbo_tasks::value(transparent)]
pub(crate) struct EsmScopeScc(Vec<Vc<Box<dyn EcmascriptChunkPlaceable>>>);

#[turbo_tasks::value(transparent)]
pub(crate) struct OptionEsmScopeScc(Option<Vc<EsmScopeScc>>);

#[turbo_tasks::value(transparent)]
pub(crate) struct EsmScopeSccs(Vec<Vc<EsmScopeScc>>);

#[turbo_tasks::value_impl]
impl EsmScope {
    /// Create a new [EsmScope] from the availability root given.
    #[turbo_tasks::function]
    pub(crate) async fn new(availability_info: Value<AvailabilityInfo>) -> Result<Vc<Self>> {
        let assets = if let Some(root) = availability_info.current_availability_root() {
            chunkable_modules_set(root)
        } else {
            ModulesSet::empty()
        };

        let esm_assets = get_ecmascript_module_assets(assets);
        let import_references = collect_import_references(esm_assets).await?;

        let mut graph = DiGraphMap::new();

        for (parent, child) in &*import_references {
            graph.add_edge(*parent, *child, ());
        }

        let sccs = tarjan_scc(&graph);

        let mut scc_map = HashMap::new();
        for scc in sccs {
            let scc_vc = EsmScopeScc(scc.clone()).cell();

            for placeable in scc {
                scc_map.insert(placeable, scc_vc);
            }
        }

        let mut scc_graph = DiGraphMap::new();
        for (parent, child, _) in graph.all_edges() {
            let parent_scc_vc = *scc_map
                .get(&parent)
                .context("unexpected missing SCC in map")?;
            let child_scc_vc = *scc_map
                .get(&child)
                .context("unexpected missing SCC in map")?;

            if parent_scc_vc != child_scc_vc {
                scc_graph.add_edge(parent_scc_vc, child_scc_vc, ());
            }
        }

        Ok(Self::cell(EsmScope { scc_map, scc_graph }))
    }

    /// Gets the [EsmScopeScc] for a given [EcmascriptChunkPlaceable] if it's
    /// part of this graph.
    #[turbo_tasks::function]
    pub(crate) async fn get_scc(
        self: Vc<Self>,
        placeable: Vc<Box<dyn EcmascriptChunkPlaceable>>,
    ) -> Result<Vc<OptionEsmScopeScc>> {
        let this = self.await?;

        Ok(Vc::cell(this.scc_map.get(&placeable).copied()))
    }

    /// Returns all direct children of an [EsmScopeScc].
    #[turbo_tasks::function]
    pub(crate) async fn get_scc_children(
        self: Vc<Self>,
        scc: Vc<EsmScopeScc>,
    ) -> Result<Vc<EsmScopeSccs>> {
        let this = self.await?;

        let children = this.scc_graph.neighbors(scc).collect();

        Ok(Vc::cell(children))
    }
}

#[turbo_tasks::function]
async fn get_ecmascript_module_assets(
    modules: Vc<ModulesSet>,
) -> Result<Vc<EcmascriptModuleAssets>> {
    let esm_assets = modules
        .await?
        .iter()
        .copied()
        .map(|r| async move { anyhow::Ok(Vc::try_resolve_downcast_type(r).await?) })
        .try_flat_join()
        .await?;

    Ok(Vc::cell(esm_assets))
}

// for clippy
type PlaceableVc = Vc<Box<dyn EcmascriptChunkPlaceable>>;

/// A directional reference between 2 [EcmascriptChunkPlaceable]s.
#[turbo_tasks::value(transparent)]
struct ImportReferences(Vec<(PlaceableVc, PlaceableVc)>);

#[turbo_tasks::function]
async fn collect_import_references(
    esm_assets: Vc<EcmascriptModuleAssets>,
) -> Result<Vc<ImportReferences>> {
    let import_references = esm_assets
        .await?
        .iter()
        .copied()
        .map(|a| async move {
            let placeable = Vc::upcast::<Box<dyn EcmascriptChunkPlaceable>>(a)
                .resolve()
                .await?;

            a.references()
                .await?
                .iter()
                .copied()
                .map(|r| async move {
                    let Some(r) = Vc::try_resolve_downcast_type::<EsmAssetReference>(r).await?
                    else {
                        return Ok(None);
                    };

                    let ReferencedAsset::Some(child_placeable) = &*r.get_referenced_asset().await?
                    else {
                        return Ok(None);
                    };

                    let child_placeable = child_placeable.resolve().await?;

                    anyhow::Ok(Some((placeable, child_placeable)))
                })
                .try_flat_join()
                .await
        })
        .try_flat_join()
        .await?;

    Ok(Vc::cell(import_references))
}
