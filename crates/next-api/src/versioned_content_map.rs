use anyhow::Result;
use bincode::{Decode, Encode};
use next_core::emit_assets;
use rustc_hash::{FxHashMap, FxHashSet};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexSet, NonLocalValue, OperationValue, OperationVc, ResolvedVc, State, TryFlatJoinIterExt,
    TryJoinIterExt, Vc, debug::ValueDebugFormat, trace::TraceRawVcs, turbobail,
};
use turbo_tasks_fs::{FileContent, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    output::{ExpandedOutputAssets, OptionOutputAsset, OutputAsset},
    source_map::GenerateSourceMap,
    version::OptionVersionedContent,
};

use crate::aggregate_hmr::{HmrChunkWithContent, is_entry_chunk_list_content};

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
struct InactiveHmrPaths(FxHashSet<FileSystemPath>);

// HACK: As above, the set's keys contain `ResolvedVc`s.
unsafe impl OperationValue for InactiveHmrPaths {}

// A precomputed map for quick access to output asset by filepath
type OutputOperationToComputeEntry =
    FxHashMap<OperationVc<ExpandedOutputAssets>, OperationVc<OptionMapEntry>>;

#[derive(
    Clone, TraceRawVcs, PartialEq, Eq, ValueDebugFormat, Debug, NonLocalValue, Encode, Decode,
)]
struct InactiveOutputOperation {
    compute_entry: OperationVc<OptionMapEntry>,
    /// A materialized lookup snapshot keeps existing client-chunk subscriptions
    /// and source maps valid without reconnecting the endpoint's output graph.
    path_to_asset: FxHashMap<FileSystemPath, ResolvedVc<Box<dyn OutputAsset>>>,
}

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
struct InactiveOutputOperations(
    #[turbo_tasks(trace_ignore)]
    FxHashMap<OperationVc<ExpandedOutputAssets>, InactiveOutputOperation>,
);

// The ignored trace is intentional: these operation and asset handles must be
// available for lookup/reactivation without keeping their task graphs connected.
unsafe impl OperationValue for InactiveOutputOperations {}

pub struct HmrChunkSnapshot {
    pub active: Vec<HmrChunkWithContent>,
    pub inactive_paths: FxHashSet<RcStr>,
}

// TODO: Ideally this structure is never persisted, so new sessions start from scratch and don't
// accumulate entries or force rebuilds of all chunks when a new session is only interested in some
// of them. If this happens, this should have #[turbo_tasks::value(evict = "never")].
#[turbo_tasks::value]
pub struct VersionedContentMap {
    // TODO: turn into a bi-directional multimap, ExpandedOutputAssets ->
    // FxIndexSet<FileSystemPath>
    map_path_to_op: State<PathToOutputOperation>,
    map_op_to_compute_entry: State<OutputOperationToComputeEntry>,
    inactive_output_operations: State<InactiveOutputOperations>,
    /// Entry chunks that are not part of the aggregate HMR working set. Their
    /// path index and operation handles remain available for reactivation, but
    /// changes do not invalidate or rebuild the aggregate subscription until the
    /// entry becomes active again.
    inactive_hmr_paths: State<InactiveHmrPaths>,
}

impl VersionedContentMap {
    // NOTE(alexkirsz) This must not be a `#[turbo_tasks::function]` because it
    // should be a singleton for each project.
    pub fn new() -> ResolvedVc<Self> {
        VersionedContentMap {
            map_path_to_op: State::new(PathToOutputOperation(FxHashMap::default())),
            map_op_to_compute_entry: State::new(FxHashMap::default()),
            inactive_output_operations: State::new(InactiveOutputOperations::default()),
            inactive_hmr_paths: State::new(InactiveHmrPaths::default()),
        }
        .resolved_cell()
    }

    /// Lists the aggregate-HMR *entry* chunks under `root` with their
    /// [`VersionedContent`], sorted by path. Only entry-chunk-list content is
    /// returned (see [`is_entry_chunk_list_content`]). Callers scope which
    /// entries are included by narrowing `root` (e.g. the aggregate server-HMR
    /// subscription passes `server/app` to include App Router entries only).
    ///
    /// `map_path_to_op` is an `FxHashMap`, whose iteration order depends on
    /// bucket layout rather than insertion order, so the same set of paths can
    /// come out in a different order across calls. Since this map contains
    /// entries that span server and client contexts, changes for one context
    /// can shift the internals of the map, making iteration order different
    /// for the same set of paths.
    pub async fn hmr_chunks_in_path(
        self: Vc<Self>,
        root: &FileSystemPath,
    ) -> Result<HmrChunkSnapshot> {
        let this = self.await?;
        // `State::get` returns a lock guard, which can't be held across the
        // awaits below, so snapshot the keys and release it. Keep the inactive
        // paths from the same snapshot: only those paths may retain their prior
        // aggregate version when absent from the active chunks below.
        let (paths, inactive_paths): (Vec<FileSystemPath>, FxHashSet<RcStr>) = {
            let map = &this.map_path_to_op.get().0;
            let inactive_hmr_paths = &this.inactive_hmr_paths.get().0;
            (
                map.keys()
                    .filter(|path| !inactive_hmr_paths.contains(*path))
                    .cloned()
                    .collect(),
                inactive_hmr_paths
                    .iter()
                    .filter_map(|path| root.get_path_to(path).map(RcStr::from))
                    .collect(),
            )
        };

        let mut chunks = paths
            .into_iter()
            .filter_map(|path| {
                let rel = root.get_path_to(&path)?;
                Some((RcStr::from(rel), path))
            })
            .map(|(name, path)| async move {
                // Skip Redirect assets: they're symlinks with no file content,
                // so versioning them would bail with "not a file".
                let Some(asset) = *self.get_asset(path).await? else {
                    return Ok::<_, anyhow::Error>(None);
                };
                if !matches!(*asset.content().await?, AssetContent::File(_)) {
                    return Ok(None);
                }
                let content = asset.versioned_content().to_resolved().await?;

                // *Important*: only chunk lists are subscribed to. Individual chunks are already
                // covered by the chunk list that owns them, so including them here
                // would produce duplicate updates for the same change.
                if !is_entry_chunk_list_content(content) {
                    return Ok(None);
                }

                Ok(Some(HmrChunkWithContent {
                    path: name,
                    content,
                }))
            })
            .try_flat_join()
            .await?;
        chunks.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(HmrChunkSnapshot {
            active: chunks,
            inactive_paths,
        })
    }

    /// Adds or removes entry chunks from the aggregate HMR working set.
    ///
    /// Retiring an entry disconnects every output operation that owns that entry
    /// path. The operation handles and path index are retained without tracing
    /// them, so reactivation can reconnect the exact cached operation without a
    /// new endpoint write.
    ///
    /// This is deliberately a direct state mutation rather than a cached
    /// `turbo_tasks::function`: the same path can transition between active and
    /// inactive multiple times during one dev session.
    pub async fn set_hmr_chunks_active(
        &self,
        paths: impl IntoIterator<Item = FileSystemPath>,
        active: bool,
    ) -> Result<()> {
        let paths = paths.into_iter().collect::<Vec<_>>();
        let operations = {
            let map = &self.map_path_to_op.get().0;
            paths
                .iter()
                .filter_map(|path| map.get(path))
                .flat_map(|operations| operations.0.iter().copied())
                .collect::<FxHashSet<_>>()
        };

        if active {
            let reactivated = {
                let inactive = self.inactive_output_operations.get_untracked();
                operations
                    .iter()
                    .filter_map(|operation| {
                        inactive
                            .0
                            .get(operation)
                            .map(|entry| (*operation, entry.compute_entry))
                    })
                    .collect::<Vec<_>>()
            };

            // Publish the live lookup before removing the inactive snapshot. A
            // reader may briefly see both, but never sees the asset disappear.
            self.map_op_to_compute_entry.update_conditionally(|map| {
                let mut changed = false;
                for &(operation, compute_entry) in &reactivated {
                    changed |= map.insert(operation, compute_entry) != Some(compute_entry);
                }
                changed
            });
            // Retirement materializes each compute entry before disconnecting,
            // so a strongly-consistent read is sufficient to catch up only the
            // operations being reactivated.
            for &(_, compute_entry) in &reactivated {
                compute_entry.read_strongly_consistent().await?;
            }
            self.inactive_output_operations
                .update_conditionally(|inactive| {
                    let mut changed = false;
                    for (operation, _) in &reactivated {
                        changed |= inactive.0.remove(operation).is_some();
                    }
                    changed
                });
            // Reactivation reconnects operations before publishing their paths as
            // active so a concurrent aggregate read never observes a missing entry.
            self.inactive_hmr_paths
                .update_conditionally(|inactive_hmr_paths| {
                    let mut changed = false;
                    for path in &paths {
                        changed |= inactive_hmr_paths.0.remove(path);
                    }
                    changed
                });
        } else {
            // Materialize the last asset lookup before disconnecting. Existing
            // client chunk subscriptions and source-map requests can use this
            // snapshot without reconnecting the endpoint's aggregate graph.
            let compute_entries = {
                let map = self.map_op_to_compute_entry.get();
                operations
                    .iter()
                    .filter_map(|operation| {
                        map.get(operation)
                            .map(|compute_entry| (*operation, *compute_entry))
                    })
                    .collect::<Vec<_>>()
            };
            let snapshots = compute_entries
                .into_iter()
                .map(|(operation, compute_entry)| async move {
                    let map_entry = compute_entry.read_strongly_consistent().await?;
                    let path_to_asset = if let Some(entry) = &*map_entry {
                        entry.path_to_asset.clone()
                    } else {
                        FxHashMap::default()
                    };
                    Ok::<_, anyhow::Error>((
                        operation,
                        InactiveOutputOperation {
                            compute_entry,
                            path_to_asset,
                        },
                    ))
                })
                .try_join()
                .await?
                .into_iter()
                .collect::<FxHashMap<_, _>>();

            // Publish retirement before disconnecting its operations so a concurrent
            // aggregate read preserves the previous versions.
            self.inactive_hmr_paths
                .update_conditionally(|inactive_hmr_paths| {
                    let mut changed = false;
                    for path in &paths {
                        changed |= inactive_hmr_paths.0.insert(path.clone());
                    }
                    changed
                });

            let snapshot_operations = snapshots.keys().copied().collect::<Vec<_>>();
            // Publish the inactive fallback before dropping the live lookup. A
            // reader may briefly prefer the live entry, but never observes a gap.
            self.inactive_output_operations
                .update_conditionally(|inactive| {
                    if snapshots.is_empty() {
                        return false;
                    }
                    for (operation, inactive_operation) in snapshots {
                        inactive.0.insert(operation, inactive_operation);
                    }
                    true
                });
            // Drop the traced roots only after their lookup snapshots are visible.
            // No compute task depends on this project-wide state transition.
            self.map_op_to_compute_entry.update_conditionally(|map| {
                let mut changed = false;
                for operation in snapshot_operations {
                    changed |= map.remove(&operation).is_some();
                }
                changed
            });
        }
        Ok(())
    }
}

#[turbo_tasks::value_impl]
impl VersionedContentMap {
    /// Inserts output assets into the map and returns a completion that when
    /// awaited will emit the assets that were inserted.
    //
    // TODO: If `VersionedContentMap` becomes transient as described above, these methods should be
    // `#[turbo_tasks::function(session_dependent)]`
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
        this.inactive_output_operations
            .update_conditionally(|inactive| inactive.0.remove(&assets_operation).is_some());
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

        // Retirement strongly reads this materialized entry before disconnecting
        // it, so an in-flight computation can finish without observing global
        // activity state or becoming a dependency of every route transition.
        self.map_path_to_op.update_conditionally(|map| {
            let mut changed = false;

            // get current map's keys, subtract keys that don't exist in operation
            let mut stale_assets = map.0.keys().cloned().collect::<FxHashSet<_>>();

            for (k, _) in entries.iter().flatten() {
                let res = map
                    .0
                    .entry(k.clone())
                    .or_default()
                    .0
                    .insert(assets_operation);
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
                    .0
                    .swap_remove(&assets_operation);
                changed = changed || res
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

        // A retired output operation is intentionally disconnected, but its
        // last materialized assets remain valid lookup results. Returning only
        // the requested asset avoids reconnecting the whole endpoint graph.
        let inactive_asset = {
            let this = self.await?;
            let path_to_operations = &this.map_path_to_op.get().0;
            let inactive_operations = this.inactive_output_operations.get();
            path_to_operations.get(&path).and_then(|operations| {
                operations.0.iter().find_map(|operation| {
                    inactive_operations
                        .0
                        .get(operation)
                        .and_then(|entry| entry.path_to_asset.get(&path))
                        .copied()
                })
            })
        };
        Ok(Vc::cell(inactive_asset))
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
        let operation = {
            let path_to_operations = &self.map_path_to_op.get().0;
            let operation_to_compute_entry = self.map_op_to_compute_entry.get();
            path_to_operations.get(&path).and_then(|operations| {
                operations.0.iter().find_map(|operation| {
                    operation_to_compute_entry
                        .get(operation)
                        .map(|compute_entry| (*operation, *compute_entry))
                })
            })
        };
        let Some((assets_operation, compute_entry)) = operation else {
            return Vc::cell(None);
        };
        // Need to reconnect both operations to the map.
        let _ = assets_operation.connect();
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
