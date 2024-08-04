use std::collections::HashMap;

use anyhow::{bail, Result};
use next_core::emit_assets;
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    debug::ValueDebugFormat, trace::TraceRawVcs, Completion, RcStr, State, TryFlatJoinIterExt,
    TryJoinIterExt, ValueDefault, ValueToString, Vc,
};
use turbopack_binding::{
    turbo::tasks_fs::FileSystemPath,
    turbopack::core::{
        asset::Asset,
        output::{OutputAsset, OutputAssets},
        source_map::{GenerateSourceMap, OptionSourceMap},
        version::VersionedContent,
    },
};

/// An unresolved output assets operation. We need to pass an operation here as
/// it's stored for later usage and we want to reconnect this operation when
/// it's received from the map again.
#[turbo_tasks::value(transparent)]
pub struct OutputAssetsOperation(Vc<OutputAssets>);

#[derive(Clone, TraceRawVcs, PartialEq, Eq, ValueDebugFormat, Serialize, Deserialize, Debug)]
struct MapEntry {
    assets_operation: Vc<OutputAssets>,
    side_effects: Vc<Completion>,
    path_to_asset: HashMap<Vc<FileSystemPath>, Vc<Box<dyn OutputAsset>>>,
}

#[turbo_tasks::value(transparent)]
struct OptionMapEntry(Option<MapEntry>);

type PathToOutputOperation = HashMap<Vc<FileSystemPath>, Vc<OutputAssets>>;
type OutputOperationToComputeEntry = HashMap<Vc<OutputAssets>, Vc<OptionMapEntry>>;

#[turbo_tasks::value]
pub struct VersionedContentMap {
    map_path_to_op: State<PathToOutputOperation>,
    map_op_to_compute_entry: State<OutputOperationToComputeEntry>,
}

impl ValueDefault for VersionedContentMap {
    fn value_default() -> Vc<Self> {
        VersionedContentMap {
            map_path_to_op: State::new(HashMap::new()),
            map_op_to_compute_entry: State::new(HashMap::new()),
        }
        .cell()
    }
}

impl VersionedContentMap {
    // NOTE(alexkirsz) This must not be a `#[turbo_tasks::function]` because it
    // should be a singleton for each project.
    pub fn new() -> Vc<Self> {
        Self::value_default()
    }
}

#[turbo_tasks::value_impl]
impl VersionedContentMap {
    #[turbo_tasks::function]
    pub async fn insert_output_assets(
        self: Vc<Self>,
        assets_operation: Vc<OutputAssetsOperation>,
        node_root: Vc<FileSystemPath>,
        client_relative_path: Vc<FileSystemPath>,
        client_output_path: Vc<FileSystemPath>,
    ) -> Result<Vc<Completion>> {
        let this = self.await?;
        let compute_entry = self.compute_entry(
            assets_operation,
            node_root,
            client_relative_path,
            client_output_path,
        );
        let assets = *assets_operation.await?;
        this.map_op_to_compute_entry
            .update_conditionally(|map| map.insert(assets, compute_entry) != Some(compute_entry));
        let Some(entry) = &*compute_entry.await? else {
            unreachable!("compute_entry always returns Some(MapEntry)")
        };
        Ok(entry.side_effects)
    }

    #[turbo_tasks::function]
    async fn compute_entry(
        self: Vc<Self>,
        assets_operation: Vc<OutputAssetsOperation>,
        node_root: Vc<FileSystemPath>,
        client_relative_path: Vc<FileSystemPath>,
        client_output_path: Vc<FileSystemPath>,
    ) -> Result<Vc<OptionMapEntry>> {
        let assets = *assets_operation.await?;
        let entries: Vec<_> = assets
            .await?
            .iter()
            .map(|&asset| async move { Ok((asset.ident().path().resolve().await?, asset, assets)) })
            .try_join()
            .await?;

        self.await?.map_path_to_op.update_conditionally(|map| {
            let mut changed = false;
            for &(k, _, v) in entries.iter() {
                if map.insert(k, v) != Some(v) {
                    changed = true;
                }
            }
            changed
        });
        // Make sure all written client assets are up-to-date
        let side_effects = emit_assets(assets, node_root, client_relative_path, client_output_path);
        let map_entry = Vc::cell(Some(MapEntry {
            assets_operation: assets,
            side_effects,
            path_to_asset: entries.into_iter().map(|(k, v, _)| (k, v)).collect(),
        }));
        Ok(map_entry)
    }

    #[turbo_tasks::function]
    pub fn get(self: Vc<Self>, path: Vc<FileSystemPath>) -> Vc<Box<dyn VersionedContent>> {
        self.get_asset(path).versioned_content()
    }

    #[turbo_tasks::function]
    pub async fn get_source_map(
        self: Vc<Self>,
        path: Vc<FileSystemPath>,
        section: Option<RcStr>,
    ) -> Result<Vc<OptionSourceMap>> {
        if let Some(generate_source_map) =
            Vc::try_resolve_sidecast::<Box<dyn GenerateSourceMap>>(self.get_asset(path)).await?
        {
            Ok(if let Some(section) = section {
                generate_source_map.by_section(section)
            } else {
                generate_source_map.generate_source_map()
            })
        } else {
            let path = path.to_string().await?;
            bail!("no source map for path {}", path);
        }
    }

    #[turbo_tasks::function]
    pub async fn get_asset(
        self: Vc<Self>,
        path: Vc<FileSystemPath>,
    ) -> Result<Vc<Box<dyn OutputAsset>>> {
        let result = self.raw_get(path).await?;
        if let Some(MapEntry {
            assets_operation: _,
            side_effects,
            path_to_asset,
        }) = &*result
        {
            side_effects.await?;

            if let Some(asset) = path_to_asset.get(&path) {
                return Ok(*asset);
            } else {
                let path = path.to_string().await?;
                bail!(
                    "could not find asset for path {} (asset has been removed)",
                    path
                );
            }
        }
        let path = path.to_string().await?;
        bail!("could not find asset for path {}", path);
    }

    #[turbo_tasks::function]
    pub async fn keys_in_path(&self, root: Vc<FileSystemPath>) -> Result<Vc<Vec<RcStr>>> {
        let keys = {
            let map = self.map_path_to_op.get();
            map.keys().copied().collect::<Vec<_>>()
        };
        let root = &root.await?;
        let keys = keys
            .into_iter()
            .map(|path| async move { Ok(root.get_path_to(&*path.await?).map(RcStr::from)) })
            .try_flat_join()
            .await?;
        Ok(Vc::cell(keys))
    }

    #[turbo_tasks::function]
    async fn raw_get(&self, path: Vc<FileSystemPath>) -> Result<Vc<OptionMapEntry>> {
        let assets = {
            let map = self.map_path_to_op.get();
            map.get(&path).copied()
        };
        let Some(assets) = assets else {
            return Ok(Vc::cell(None));
        };
        // Need to reconnect the operation to the map
        Vc::connect(assets);

        let compute_entry = {
            let map = self.map_op_to_compute_entry.get();
            map.get(&assets).copied()
        };
        let Some(compute_entry) = compute_entry else {
            return Ok(Vc::cell(None));
        };
        // Need to reconnect the operation to the map
        Vc::connect(compute_entry);

        Ok(compute_entry)
    }
}
