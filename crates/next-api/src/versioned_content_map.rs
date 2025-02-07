use anyhow::{bail, Result};
use next_core::emit_assets;
use rustc_hash::{FxHashMap, FxHashSet};
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    debug::ValueDebugFormat, trace::TraceRawVcs, FxIndexSet, NonLocalValue, OperationValue,
    OperationVc, ResolvedVc, State, TryFlatJoinIterExt, TryJoinIterExt, ValueDefault,
    ValueToString, Vc,
};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    asset::Asset,
    output::{OptionOutputAsset, OutputAsset, OutputAssets},
    source_map::{GenerateSourceMap, OptionStringifiedSourceMap},
    version::OptionVersionedContent,
};

#[derive(
    Clone,
    TraceRawVcs,
    PartialEq,
    Eq,
    ValueDebugFormat,
    Serialize,
    Deserialize,
    Debug,
    NonLocalValue,
)]
struct MapEntry {
    assets_operation: OperationVc<OutputAssets>,
    /// Precomputed map for quick access to output asset by filepath
    path_to_asset: FxHashMap<ResolvedVc<FileSystemPath>, ResolvedVc<Box<dyn OutputAsset>>>,
}

// HACK: This is technically incorrect because `path_to_asset` contains `ResolvedVc`...
unsafe impl OperationValue for MapEntry {}

#[turbo_tasks::value(transparent, operation)]
struct OptionMapEntry(Option<MapEntry>);

#[turbo_tasks::value]
#[derive(Debug)]
pub struct PathToOutputOperation(
    /// We need to use an operation for outputs as it's stored for later usage and we want to
    /// reconnect this operation when it's received from the map again.
    ///
    /// It may not be 100% correct for the key (`FileSystemPath`) to be in a `ResolvedVc` here, but
    /// it's impractical to make it an `OperationVc`/`OperationValue`, and it's unlikely to
    /// change/break?
    FxHashMap<ResolvedVc<FileSystemPath>, FxIndexSet<OperationVc<OutputAssets>>>,
);

// HACK: This is technically incorrect because the map's key is a `ResolvedVc`...
unsafe impl OperationValue for PathToOutputOperation {}

// A precomputed map for quick access to output asset by filepath
type OutputOperationToComputeEntry =
    FxHashMap<OperationVc<OutputAssets>, OperationVc<OptionMapEntry>>;

#[turbo_tasks::value]
pub struct VersionedContentMap {
    // TODO: turn into a bi-directional multimap, OutputAssets -> FxIndexSet<FileSystemPath>
    map_path_to_op: State<PathToOutputOperation>,
    map_op_to_compute_entry: State<OutputOperationToComputeEntry>,
}

impl ValueDefault for VersionedContentMap {
    fn value_default() -> Vc<Self> {
        *VersionedContentMap::new()
    }
}

impl VersionedContentMap {
    // NOTE(alexkirsz) This must not be a `#[turbo_tasks::function]` because it
    // should be a singleton for each project.
    pub fn new() -> ResolvedVc<Self> {
        VersionedContentMap {
            map_path_to_op: State::new(PathToOutputOperation(FxHashMap::default())),
            map_op_to_compute_entry: State::new(FxHashMap::default()),
        }
        .resolved_cell()
    }
}

#[turbo_tasks::value_impl]
impl VersionedContentMap {
    /// Inserts output assets into the map and returns a completion that when
    /// awaited will emit the assets that were inserted.
    #[turbo_tasks::function]
    pub async fn insert_output_assets(
        self: ResolvedVc<Self>,
        // Output assets to emit
        assets_operation: OperationVc<OutputAssets>,
        node_root: ResolvedVc<FileSystemPath>,
        client_relative_path: ResolvedVc<FileSystemPath>,
        client_output_path: ResolvedVc<FileSystemPath>,
    ) -> Result<()> {
        let this = self.await?;
        let compute_entry = compute_entry_operation(
            self,
            assets_operation,
            node_root,
            client_relative_path,
            client_output_path,
        );
        this.map_op_to_compute_entry.update_conditionally(|map| {
            map.insert(assets_operation, compute_entry) != Some(compute_entry)
        });
        Ok(())
    }

    /// Creates a [`MapEntry`] (a pre-computed map for optimized lookup) for an output assets
    /// operation. When assets change, map_path_to_op is updated.
    #[turbo_tasks::function]
    async fn compute_entry(
        &self,
        assets_operation: OperationVc<OutputAssets>,
        node_root: Vc<FileSystemPath>,
        client_relative_path: Vc<FileSystemPath>,
        client_output_path: Vc<FileSystemPath>,
    ) -> Result<Vc<OptionMapEntry>> {
        let assets = assets_operation.connect();
        async fn get_entries(
            assets: Vc<OutputAssets>,
        ) -> Result<Vec<(ResolvedVc<FileSystemPath>, ResolvedVc<Box<dyn OutputAsset>>)>> {
            let assets_ref = assets.await?;
            let entries = assets_ref
                .iter()
                .map(|&asset| async move {
                    let path = asset.path().to_resolved().await?;
                    Ok((path, asset))
                })
                .try_join()
                .await?;
            Ok(entries)
        }
        let entries = get_entries(assets).await.unwrap_or_default();

        self.map_path_to_op.update_conditionally(|map| {
            let mut changed = false;

            // get current map's keys, subtract keys that don't exist in operation
            let mut stale_assets = map.0.keys().copied().collect::<FxHashSet<_>>();

            for (k, _) in entries.iter() {
                let res = map.0.entry(*k).or_default().insert(assets_operation);
                stale_assets.remove(k);
                changed = changed || res;
            }

            // Make more efficient with reverse map
            for k in &stale_assets {
                let res = map
                    .0
                    .get_mut(k)
                    // guaranteed
                    .unwrap()
                    .swap_remove(&assets_operation);
                changed = changed || res
            }
            changed
        });

        // Make sure all written client assets are up-to-date
        let _ = emit_assets(assets, node_root, client_relative_path, client_output_path)
            .resolve()
            .await?;
        let map_entry = Vc::cell(Some(MapEntry {
            assets_operation,
            path_to_asset: entries.into_iter().collect(),
        }));
        Ok(map_entry)
    }

    #[turbo_tasks::function]
    pub async fn get(
        self: Vc<Self>,
        path: Vc<FileSystemPath>,
    ) -> Result<Vc<OptionVersionedContent>> {
        Ok(Vc::cell(match *self.get_asset(path).await? {
            Some(asset) => Some(asset.versioned_content().to_resolved().await?),
            None => None,
        }))
    }

    #[turbo_tasks::function]
    pub async fn get_source_map(
        self: Vc<Self>,
        path: Vc<FileSystemPath>,
        section: Option<RcStr>,
    ) -> Result<Vc<OptionStringifiedSourceMap>> {
        let Some(asset) = &*self.get_asset(path).await? else {
            return Ok(Vc::cell(None));
        };

        if let Some(generate_source_map) =
            ResolvedVc::try_sidecast::<Box<dyn GenerateSourceMap>>(*asset)
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
        path: ResolvedVc<FileSystemPath>,
    ) -> Result<Vc<OptionOutputAsset>> {
        let result = self.raw_get(*path).await?;
        if let Some(MapEntry {
            assets_operation: _,
            path_to_asset,
        }) = &*result
        {
            if let Some(&asset) = path_to_asset.get(&path) {
                return Ok(Vc::cell(Some(asset)));
            } else {
                let path = path.to_string().await?;
                bail!(
                    "could not find asset for path {} (asset has been removed)",
                    path,
                );
            }
        }

        Ok(Vc::cell(None))
    }

    #[turbo_tasks::function]
    pub async fn keys_in_path(&self, root: Vc<FileSystemPath>) -> Result<Vc<Vec<RcStr>>> {
        let keys = {
            let map = &self.map_path_to_op.get().0;
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
    fn raw_get(&self, path: ResolvedVc<FileSystemPath>) -> Vc<OptionMapEntry> {
        let assets = {
            let map = &self.map_path_to_op.get().0;
            map.get(&path).and_then(|m| m.iter().next().copied())
        };
        let Some(assets) = assets else {
            return Vc::cell(None);
        };
        // Need to reconnect the operation to the map
        let _ = assets.connect();

        let compute_entry = {
            let map = self.map_op_to_compute_entry.get();
            map.get(&assets).copied()
        };
        let Some(compute_entry) = compute_entry else {
            return Vc::cell(None);
        };
        compute_entry.connect()
    }
}

#[turbo_tasks::function(operation)]
fn compute_entry_operation(
    map: ResolvedVc<VersionedContentMap>,
    assets_operation: OperationVc<OutputAssets>,
    node_root: ResolvedVc<FileSystemPath>,
    client_relative_path: ResolvedVc<FileSystemPath>,
    client_output_path: ResolvedVc<FileSystemPath>,
) -> Vc<OptionMapEntry> {
    map.compute_entry(
        assets_operation,
        *node_root,
        *client_relative_path,
        *client_output_path,
    )
}
