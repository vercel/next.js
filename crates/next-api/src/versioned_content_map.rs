use anyhow::Result;
use bincode::{Decode, Encode};
use next_core::emit_assets;
use rustc_hash::{FxHashMap, FxHashSet};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexSet, NonLocalValue, OperationValue, OperationVc, ResolvedVc, State, TryFlatJoinIterExt,
    TryJoinIterExt, Vc, debug::ValueDebugFormat, trace::TraceRawVcs, turbo_tasks, turbobail,
};
use turbo_tasks_fs::{FileContent, FileSystemPath};
use turbopack_core::{
    asset::Asset,
    output::{ExpandedOutputAssets, OptionOutputAsset, OutputAsset},
    source_map::GenerateSourceMap,
    version::OptionVersionedContent,
};

#[derive(
    Clone, TraceRawVcs, PartialEq, Eq, ValueDebugFormat, Debug, NonLocalValue, Encode, Decode,
)]
struct MapEntry {
    assets_operation: OperationVc<ExpandedOutputAssets>,
    /// Precomputed map for quick access to output asset by filepath
    path_to_asset: FxHashMap<FileSystemPath, ResolvedVc<Box<dyn OutputAsset>>>,
}

// HACK: This is technically incorrect because `path_to_asset` contains `ResolvedVc`...
unsafe impl OperationValue for MapEntry {}

#[turbo_tasks::value(transparent, operation)]
struct OptionMapEntry(Option<MapEntry>);

#[derive(
    Clone, TraceRawVcs, PartialEq, Eq, ValueDebugFormat, Debug, NonLocalValue, Encode, Decode,
)]
pub struct PathToOutputOperation(
    /// We need to use an operation for outputs as it's stored for later usage and we want to
    /// reconnect this operation when it's received from the map again.
    ///
    /// It may not be 100% correct for the key (`FileSystemPath`) to contain a `ResolvedVc` here,
    /// but it's impractical to make it an `OperationVc`/`OperationValue`, and it's unlikely to
    /// change/break?
    FxHashMap<FileSystemPath, ExpandedOutputAssetsOperationSet>,
);

#[derive(
    Clone,
    Default,
    TraceRawVcs,
    PartialEq,
    Eq,
    ValueDebugFormat,
    Debug,
    NonLocalValue,
    Encode,
    Decode,
)]
struct ExpandedOutputAssetsOperationSet(
    #[bincode(with = "turbo_bincode::indexset")] FxIndexSet<OperationVc<ExpandedOutputAssets>>,
);

// HACK: This is technically incorrect because the map's key contains a `ResolvedVc`...
unsafe impl OperationValue for PathToOutputOperation {}

// A precomputed map for quick access to output asset by filepath
type OutputOperationToComputeEntry =
    FxHashMap<OperationVc<ExpandedOutputAssets>, OperationVc<OptionMapEntry>>;

// This map is a dev-only, rebuilt-every-session index over the current session's output assets
// (populated via `insert_output_assets` during the write/emit phase), not a source of truth — the
// underlying `ExpandedOutputAssets` operations are the persisted data. So we skip persisting it
// (`serialization = "skip"`), which keeps the `OperationVc` GC pins it holds (see the pin/unpin
// calls in the mutation methods below) purely in-session: no persist/restore re-pinning needed.
//
// `evict = "never"` because the op set and the record of what's pinned live in this cell's `State`;
// evicting the cell would drop that state and (with serialization skipped) it could not be
// restored, silently resetting the map and orphaning the pins.
#[turbo_tasks::value(serialization = "skip", evict = "never")]
pub struct VersionedContentMap {
    // TODO: turn into a bi-directional multimap, ExpandedOutputAssets ->
    // FxIndexSet<FileSystemPath>
    map_path_to_op: State<PathToOutputOperation>,
    map_op_to_compute_entry: State<OutputOperationToComputeEntry>,
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
        assets_operation: OperationVc<ExpandedOutputAssets>,
        node_root: FileSystemPath,
        client_relative_path: FileSystemPath,
        client_output_path: FileSystemPath,
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
            let previous = map.insert(assets_operation, compute_entry);
            if previous == Some(compute_entry) {
                // Nothing changed: the same value was already stored under this key, so the
                // `insert` replaced `compute_entry` with an identical `compute_entry`. The key op's
                // pin (taken when it was first inserted) and the value op's pin are both still
                // correct; no pin bookkeeping needed.
                return false;
            }
            // Pin the operations so GC keeps their tasks alive while they're held in this map (the
            // map stores them outside the task graph, so nothing else anchors them). This runs in a
            // task function body — the unguarded region — so acquiring the pin guard is safe.
            let tt = turbo_tasks();
            match previous {
                None => {
                    // New key: pin both the key op and the value op.
                    tt.pin_task_for_gc(assets_operation.task_id());
                    tt.pin_task_for_gc(compute_entry.task_id());
                }
                Some(old_compute_entry) => {
                    // Key already present (its pin stays); the value op changed — unpin the old,
                    // pin the new.
                    tt.unpin_task_for_gc(old_compute_entry.task_id());
                    tt.pin_task_for_gc(compute_entry.task_id());
                }
            }
            true
        });
        Ok(())
    }

    /// Creates a [`MapEntry`] (a pre-computed map for optimized lookup) for an output assets
    /// operation. When assets change, map_path_to_op is updated.
    #[turbo_tasks::function]
    async fn compute_entry(
        &self,
        assets_operation: OperationVc<ExpandedOutputAssets>,
        node_root: FileSystemPath,
        client_relative_path: FileSystemPath,
        client_output_path: FileSystemPath,
    ) -> Result<Vc<OptionMapEntry>> {
        let entries = get_entries(assets_operation)
            .read_strongly_consistent()
            .await
            // Any error should result in an empty list, which removes all assets from the map
            .ok();

        self.map_path_to_op.update_conditionally(|map| {
            let mut changed = false;

            // The map stores `assets_operation` outside the task graph, so pin its task for the
            // duration of each (path -> op) membership: pin on a genuine insert, unpin on a genuine
            // removal. This runs in a task function body (the unguarded region), so acquiring the
            // pin guard is safe. Balance is one pin per distinct path bucket the op lives in.
            let tt = turbo_tasks();

            // get current map's keys, subtract keys that don't exist in operation
            let mut stale_assets = map.0.keys().cloned().collect::<FxHashSet<_>>();

            for (k, _) in entries.iter().flatten() {
                let inserted = map
                    .0
                    .entry(k.clone())
                    .or_default()
                    .0
                    .insert(assets_operation);
                if inserted {
                    tt.pin_task_for_gc(assets_operation.task_id());
                }
                stale_assets.remove(k);
                changed = changed || inserted;
            }

            // Make more efficient with reverse map
            for k in &stale_assets {
                let removed = map
                    .0
                    .get_mut(k)
                    // guaranteed
                    .unwrap()
                    .0
                    .swap_remove(&assets_operation);
                if removed {
                    tt.unpin_task_for_gc(assets_operation.task_id());
                }
                changed = changed || removed
            }
            changed
        });

        // Make sure all written client assets are up-to-date
        emit_assets(
            assets_operation.connect(),
            node_root,
            client_relative_path,
            client_output_path,
        )
        .as_side_effect()
        .await?;
        let map_entry = Vc::cell(Some(MapEntry {
            assets_operation,
            path_to_asset: entries.iter().flatten().cloned().collect(),
        }));
        Ok(map_entry)
    }

    #[turbo_tasks::function]
    pub async fn get(self: Vc<Self>, path: FileSystemPath) -> Result<Vc<OptionVersionedContent>> {
        Ok(Vc::cell(match *self.get_asset(path).await? {
            Some(asset) => Some(asset.versioned_content().to_resolved().await?),
            None => None,
        }))
    }

    #[turbo_tasks::function]
    pub async fn get_source_map(
        self: Vc<Self>,
        path: FileSystemPath,
        section: Option<RcStr>,
    ) -> Result<Vc<FileContent>> {
        let Some(asset) = &*self.get_asset(path.clone()).await? else {
            return Ok(FileContent::NotFound.cell());
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
            turbobail!("no source map for path {path}");
        }
    }

    #[turbo_tasks::function]
    pub async fn get_asset(self: Vc<Self>, path: FileSystemPath) -> Result<Vc<OptionOutputAsset>> {
        let result = self.raw_get(path.clone()).await?;
        if let Some(MapEntry {
            assets_operation: _,
            path_to_asset,
        }) = &*result
            && let Some(&asset) = path_to_asset.get(&path)
        {
            return Ok(Vc::cell(Some(asset)));
        }

        Ok(Vc::cell(None))
    }

    #[turbo_tasks::function]
    pub async fn keys_in_path(&self, root: FileSystemPath) -> Result<Vc<Vec<RcStr>>> {
        let keys = {
            let map = &self.map_path_to_op.get().0;
            map.keys().cloned().collect::<Vec<_>>()
        };
        let keys = keys
            .into_iter()
            .map(|path| {
                let root = root.clone();
                async move { Ok(root.get_path_to(&path).map(RcStr::from)) }
            })
            .try_flat_join()
            .await?;
        Ok(Vc::cell(keys))
    }

    #[turbo_tasks::function]
    fn raw_get(&self, path: FileSystemPath) -> Vc<OptionMapEntry> {
        let assets = {
            let map = &self.map_path_to_op.get().0;
            map.get(&path).and_then(|m| m.0.iter().next().copied())
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

type GetEntriesResultT = Vec<(FileSystemPath, ResolvedVc<Box<dyn OutputAsset>>)>;

#[turbo_tasks::value(transparent)]
struct GetEntriesResult(GetEntriesResultT);

#[turbo_tasks::function(operation, root)]
async fn get_entries(assets: OperationVc<ExpandedOutputAssets>) -> Result<Vc<GetEntriesResult>> {
    let assets_ref = assets.connect().await?;
    let entries = assets_ref
        .iter()
        .map(|&asset| async move {
            let path = asset.path().owned().await?;
            Ok((path, asset))
        })
        .try_join()
        .await?;
    Ok(Vc::cell(entries))
}

#[turbo_tasks::function(operation, root)]
fn compute_entry_operation(
    map: ResolvedVc<VersionedContentMap>,
    assets_operation: OperationVc<ExpandedOutputAssets>,
    node_root: FileSystemPath,
    client_relative_path: FileSystemPath,
    client_output_path: FileSystemPath,
) -> Vc<OptionMapEntry> {
    map.compute_entry(
        assets_operation,
        node_root,
        client_relative_path,
        client_output_path,
    )
}
