use anyhow::Result;
use bincode::{Decode, Encode};
use next_core::emit_assets;
use rustc_hash::{FxHashMap, FxHashSet};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexMap, FxIndexSet, NonLocalValue, OperationValue, OperationVc, ResolvedVc, State,
    TryFlatJoinIterExt, TryJoinIterExt, Vc, debug::ValueDebugFormat, trace::TraceRawVcs, turbobail,
};
use turbo_tasks_fs::{FileContent, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    output::{ExpandedOutputAssets, OptionOutputAsset, OutputAsset},
    source_map::GenerateSourceMap,
    version::{OptionVersionedContent, VersionedContent},
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

#[turbo_tasks::value(transparent)]
struct HmrEntryChunks(Vec<(FileSystemPath, ResolvedVc<Box<dyn VersionedContent>>)>);

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
struct HmrEntryChunkOperations(
    #[bincode(with = "turbo_bincode::indexmap")]
    FxIndexMap<OperationVc<ExpandedOutputAssets>, ResolvedVc<Box<dyn VersionedContent>>>,
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
struct PathToHmrEntryChunks(FxHashMap<FileSystemPath, HmrEntryChunkOperations>);

// HACK: These maps contain `ResolvedVc`s in their keys or values.
unsafe impl OperationValue for PathToOutputOperation {}
unsafe impl OperationValue for PathToHmrEntryChunks {}
unsafe impl OperationValue for HmrEntryOperationGenerations {}
unsafe impl OperationValue for HmrEntryRootGenerations {}

// A precomputed map for quick access to output asset by filepath
type OutputOperationToComputeEntry =
    FxHashMap<OperationVc<ExpandedOutputAssets>, OperationVc<OptionMapEntry>>;

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
struct HmrEntryOperationGenerations(
    #[bincode(with = "turbo_bincode::indexmap")] FxIndexMap<OperationVc<ExpandedOutputAssets>, u64>,
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
struct HmrEntryRootGenerations(FxHashMap<FileSystemPath, HmrEntryOperationGenerations>);

fn scope_hmr_entry_refresh<T>(refresh: Result<T>, is_current_owner: bool) -> Result<Option<T>> {
    match refresh {
        Ok(value) => Ok(Some(value)),
        // An indexed owner must preserve the existing full-recovery behavior
        // and its last-good baseline.
        Err(error) if is_current_owner => Err(error),
        // A pending-only operation may belong to another root, so its error
        // must not poison this root; leave its generation pending.
        Err(_) => Ok(None),
    }
}

// TODO: Ideally this structure is never persisted, so new sessions start from scratch and don't
// accumulate entries or force rebuilds of all chunks when a new session is only interested in some
// of them. If this happens, this should have #[turbo_tasks::value(evict = "never")].
#[turbo_tasks::value]
pub struct VersionedContentMap {
    // TODO: turn into a bi-directional multimap, ExpandedOutputAssets ->
    // FxIndexSet<FileSystemPath>
    map_path_to_op: State<PathToOutputOperation>,
    map_path_to_hmr_entry_chunks: State<PathToHmrEntryChunks>,
    map_op_to_compute_entry: State<OutputOperationToComputeEntry>,
    hmr_entry_operation_generations: State<HmrEntryOperationGenerations>,
    hmr_entry_root_generations: State<HmrEntryRootGenerations>,
}

impl VersionedContentMap {
    // NOTE(alexkirsz) This must not be a `#[turbo_tasks::function]` because it
    // should be a singleton for each project.
    pub fn new() -> ResolvedVc<Self> {
        VersionedContentMap {
            map_path_to_op: State::new(PathToOutputOperation(FxHashMap::default())),
            map_path_to_hmr_entry_chunks: State::new(PathToHmrEntryChunks(FxHashMap::default())),
            map_op_to_compute_entry: State::new(FxHashMap::default()),
            hmr_entry_operation_generations: State::new(HmrEntryOperationGenerations::default()),
            hmr_entry_root_generations: State::new(HmrEntryRootGenerations::default()),
        }
        .resolved_cell()
    }

    /// Lists the aggregate-HMR *entry* chunks under `root` with their
    /// [`VersionedContent`], sorted by path. Only entry-chunk-list content is
    /// returned (see [`is_entry_chunk_list_content`]). Callers scope which
    /// entries are included by narrowing `root` (e.g. the aggregate server-HMR
    /// subscription passes `server/app` to include App Router entries only).
    ///
    /// The entry index is maintained when endpoint output sets change. Reading
    /// it here avoids reconnecting every side-effectful output operation on an
    /// ordinary source edit.
    pub async fn hmr_chunks_in_path(
        self: Vc<Self>,
        root: &FileSystemPath,
    ) -> Result<Vec<HmrChunkWithContent>> {
        // Refresh operations whose structural generation has not yet been
        // observed under this root, plus the operations that currently own an
        // indexed entry here. Per-root generations make deleted and out-of-root
        // endpoints inactive while preserving empty -> non-empty discovery and
        // preventing a concurrent newer generation from being cleared.
        let resolved_self = self.to_resolved().await?;
        let this = resolved_self.await?;
        let compute_operations = {
            let operation_generations = this.hmr_entry_operation_generations.get();
            // This state is bookkeeping, not a discovery signal. Reading it
            // untracked avoids self-invalidating this task when successful
            // generations are recorded below.
            let root_generations = this.hmr_entry_root_generations.get_untracked();
            let processed_generations = root_generations.0.get(root);
            let mut assets_operations = operation_generations
                .0
                .iter()
                .filter(|(operation, generation)| {
                    processed_generations
                        .and_then(|processed| processed.0.get(*operation))
                        .copied()
                        != Some(**generation)
                })
                .map(|(operation, generation)| (*operation, (*generation, false)))
                .collect::<FxIndexMap<_, _>>();

            // The final index read below is tracked after refresh. This
            // pre-refresh owner snapshot is only scheduling input and must not
            // self-invalidate the caller when a scan changes the index.
            for (path, entries) in &this.map_path_to_hmr_entry_chunks.get_untracked().0 {
                if root.get_path_to(path).is_some() {
                    for operation in entries.0.keys() {
                        if let Some(&generation) = operation_generations.0.get(operation) {
                            assets_operations
                                .entry(*operation)
                                .and_modify(|(_, is_current_owner)| *is_current_owner = true)
                                .or_insert((generation, true));
                        }
                    }
                }
            }

            let registered_operations = this.map_op_to_compute_entry.get();
            assets_operations
                .into_iter()
                .filter(|(operation, _)| registered_operations.contains_key(operation))
                .map(|(operation, (generation, is_current_owner))| {
                    let compute_operation =
                        compute_hmr_entry_operation(resolved_self, operation, root.clone());
                    (operation, generation, is_current_owner, compute_operation)
                })
                .collect::<Vec<_>>()
        };
        let refreshed_generations = compute_operations
            .into_iter()
            .map(
                |(assets_operation, generation, is_current_owner, operation)| async move {
                    scope_hmr_entry_refresh(
                        operation
                            .connect()
                            .await
                            .map(|_| (assets_operation, generation)),
                        is_current_owner,
                    )
                },
            )
            .try_flat_join()
            .await?;

        self.await?
            .hmr_entry_root_generations
            .update_conditionally(|root_generations| {
                let processed = root_generations.0.entry(root.clone()).or_default();
                let mut changed = false;
                for (operation, generation) in refreshed_generations {
                    if processed
                        .0
                        .get(&operation)
                        .is_none_or(|&processed| processed < generation)
                    {
                        processed.0.insert(operation, generation);
                        changed = true;
                    }
                }
                changed
            });

        let this = self.await?;
        let mut chunks = this
            .map_path_to_hmr_entry_chunks
            .get()
            .0
            .iter()
            .filter_map(|(path, operations)| {
                let rel = root.get_path_to(path)?;
                let content = operations.0.values().next().copied()?;
                Some(HmrChunkWithContent {
                    path: RcStr::from(rel),
                    content,
                })
            })
            .collect::<Vec<_>>();
        chunks.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(chunks)
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
        this.map_op_to_compute_entry.update_conditionally(|map| {
            map.insert(assets_operation, compute_entry) != Some(compute_entry)
        });
        this.hmr_entry_operation_generations
            .update_conditionally(|generations| {
                *generations.0.entry(assets_operation).or_default() += 1;
                true
            });
        Ok(())
    }

    /// Maintains the aggregate-HMR entry index without reconnecting the full
    /// `compute_entry` operation and its asset-emission side effect.
    #[turbo_tasks::function]
    async fn compute_hmr_entry(
        &self,
        assets_operation: OperationVc<ExpandedOutputAssets>,
        root: FileSystemPath,
    ) -> Result<()> {
        // Propagate in-root structural scan failures so the HMR subscriber
        // performs its full-recovery path. The last good index stays intact
        // until the scan succeeds, preventing a recovered entry from being
        // misclassified as new. Out-of-root asset content is never evaluated.
        let hmr_entry_chunks = get_hmr_entry_chunks(assets_operation, root.clone())
            .read_strongly_consistent()
            .await?;

        self.map_path_to_hmr_entry_chunks
            .update_conditionally(|map| {
                let mut changed = false;
                let mut stale_paths = map
                    .0
                    .iter()
                    .filter_map(|(path, operations)| {
                        (root.get_path_to(path).is_some()
                            && operations.0.contains_key(&assets_operation))
                        .then_some(path.clone())
                    })
                    .collect::<FxHashSet<_>>();

                for (path, content) in hmr_entry_chunks.iter() {
                    let previous = map
                        .0
                        .entry(path.clone())
                        .or_default()
                        .0
                        .insert(assets_operation, *content);
                    stale_paths.remove(path);
                    changed = changed || previous != Some(*content);
                }

                for path in &stale_paths {
                    let remove_path = {
                        let operations = map.0.get_mut(path).unwrap();
                        changed = operations.0.swap_remove(&assets_operation).is_some() || changed;
                        operations.0.is_empty()
                    };
                    if remove_path {
                        map.0.remove(path);
                    }
                }
                changed
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
        // Structural output changes are the discovery signal for new, deleted,
        // or recreated aggregate-HMR entries. Every root records the exact
        // generation completed by its lightweight scan, so concurrent changes
        // cannot be cleared by an older scan.
        self.hmr_entry_operation_generations
            .update_conditionally(|generations| {
                *generations.0.entry(assets_operation).or_default() += 1;
                true
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

/// Computes only the entry chunks needed by aggregate HMR. This reconnects the
/// endpoint output operation to inspect its structure, but avoids reconnecting the
/// full `compute_entry` operation that owns the asset-emission side effect.
#[turbo_tasks::function(operation, root)]
async fn get_hmr_entry_chunks(
    assets: OperationVc<ExpandedOutputAssets>,
    root: FileSystemPath,
) -> Result<Vc<HmrEntryChunks>> {
    let assets_ref = assets.read_strongly_consistent().await?;
    let entries = assets_ref
        .iter()
        .map(|&asset| {
            let root = root.clone();
            async move {
                let path = asset.path().owned().await?;
                if root.get_path_to(&path).is_none() {
                    return Ok::<_, anyhow::Error>(None);
                }
                if !matches!(*asset.content().await?, AssetContent::File(_)) {
                    return Ok(None);
                }
                let content = asset.versioned_content().to_resolved().await?;
                if !is_entry_chunk_list_content(content) {
                    return Ok(None);
                }
                Ok(Some((path, content)))
            }
        })
        .try_flat_join()
        .await?;
    Ok(Vc::cell(entries))
}

#[turbo_tasks::function(operation, root)]
fn compute_hmr_entry_operation(
    map: ResolvedVc<VersionedContentMap>,
    assets_operation: OperationVc<ExpandedOutputAssets>,
    root: FileSystemPath,
) -> Vc<()> {
    map.compute_hmr_entry(assets_operation, root)
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

#[cfg(test)]
mod tests {
    use anyhow::anyhow;

    use super::scope_hmr_entry_refresh;

    #[test]
    fn hmr_entry_refresh_errors_are_scoped_to_current_owners() {
        assert_eq!(
            scope_hmr_entry_refresh::<u8>(Ok(7), false).unwrap(),
            Some(7)
        );

        let owner_error =
            scope_hmr_entry_refresh::<()>(Err(anyhow!("owner scan failed")), true).unwrap_err();
        assert_eq!(owner_error.to_string(), "owner scan failed");

        assert_eq!(
            scope_hmr_entry_refresh::<()>(Err(anyhow!("other root failed")), false).unwrap(),
            None
        );
    }
}
