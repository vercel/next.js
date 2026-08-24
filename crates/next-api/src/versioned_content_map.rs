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

use crate::aggregate_hmr::{
    HmrChunkWithContent, HmrChunksWithContent, is_entry_chunk_list_content,
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

#[derive(Clone, TraceRawVcs, PartialEq, Eq, ValueDebugFormat, Debug, NonLocalValue)]
pub struct PathToOutputOperation(
    /// We need to use an operation for outputs as it's stored for later usage and we want to
    /// reconnect this operation when it's received from the map again.
    ///
    /// It may not be 100% correct for the key (`FileSystemPath`) to contain a `ResolvedVc` here,
    /// but it's impractical to make it an `OperationVc`/`OperationValue`, and it's unlikely to
    /// change/break?
    FxHashMap<FileSystemPath, ExpandedOutputAssetsOperationSet>,
);

#[derive(Clone, Default, TraceRawVcs, PartialEq, Eq, ValueDebugFormat, Debug, NonLocalValue)]
struct ExpandedOutputAssetsOperationSet(FxIndexSet<OperationVc<ExpandedOutputAssets>>);

// HACK: This is technically incorrect because the map's key contains a `ResolvedVc`...
unsafe impl OperationValue for PathToOutputOperation {}

// A precomputed map for quick access to output asset by filepath
type OutputOperationToComputeEntry =
    FxHashMap<OperationVc<ExpandedOutputAssets>, OperationVc<OptionMapEntry>>;

/// Tracks all the output assets produced in a session. This allows us to compute fine grained
/// change information which drives HMR sessions.
///
/// `serialization = "skip"` so that HMR sessions fully restart on each new session.
/// `evict = "never"` in order to ensure that we don't lose track of version state in the middle of
/// a session.
#[turbo_tasks::value(serialization = "skip", evict = "never")]
pub struct VersionedContentMap {
    // TODO: turn into a bi-directional multimap, ExpandedOutputAssets ->
    // FxIndexSet<FileSystemPath>

    // Because the cell is not serialized, these `State`s -- and the sets of invalidators
    // registered on them by `State::get` -- start out empty in every new session. A task that
    // restores clean would therefore serve stale entries forever, since it never re-runs and so
    // never re-registers its invalidator. Every `#[turbo_tasks::function]` that touches these
    // must be `session_dependent` so it re-executes once per session and rebuilds that wiring.
    //
    // Keep those accesses inside this file. A plain `async fn` helper reading a `State` runs in
    // its *caller's* task frame, which silently pushes the `session_dependent` obligation onto
    // every transitive caller.
    map_path_to_op: State<PathToOutputOperation>,
    map_op_to_compute_entry: State<OutputOperationToComputeEntry>,
}

impl VersionedContentMap {
    /// Applies one operation's emitted-path set to `map_path_to_op`.
    ///
    /// The whole update — adding the operation to its current paths, dropping it from paths it no
    /// longer emits, and deleting a path whose last operation just went away — runs inside a single
    /// `update_conditionally` closure, so it holds the `State` mutex throughout. Splitting it (for
    /// example checking emptiness, releasing the lock, then deleting the key) would let a
    /// concurrent insertion under that path be dropped.
    fn update_output_operation_paths<'a>(
        &self,
        assets_operation: OperationVc<ExpandedOutputAssets>,
        paths: impl IntoIterator<Item = &'a FileSystemPath>,
    ) {
        self.map_path_to_op.update_conditionally(|map| {
            update_output_operation_paths(map, assets_operation, paths)
        });
    }

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
    #[turbo_tasks::function(session_dependent)]
    pub async fn hmr_chunks_in_path(
        self: Vc<Self>,
        root: FileSystemPath,
    ) -> Result<Vc<HmrChunksWithContent>> {
        let this = self.await?;
        // `State::get` returns a lock guard, which can't be held across the
        // awaits below, so snapshot the keys and release it.
        let paths: Vec<FileSystemPath> = {
            let map = &this.map_path_to_op.get().0;
            map.keys().cloned().collect()
        };

        let mut chunks = paths
            .into_iter()
            .filter_map(|path| {
                let rel = root.get_path_to(&path)?;
                Some((RcStr::from(rel), path))
            })
            .map(async |(name, path)| {
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
        Ok(Vc::cell(chunks))
    }

    /// Inserts output assets into the map and returns a completion that when
    /// awaited will emit the assets that were inserted.
    #[turbo_tasks::function(session_dependent)]
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
        Ok(())
    }

    /// Creates a [`MapEntry`] (a pre-computed map for optimized lookup) for an output assets
    /// operation. When assets change, map_path_to_op is updated.
    #[turbo_tasks::function(session_dependent)]
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

        self.update_output_operation_paths(
            assets_operation,
            entries.iter().flatten().map(|(path, _)| path),
        );

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

    #[turbo_tasks::function(session_dependent)]
    pub async fn keys_in_path(&self, root: FileSystemPath) -> Result<Vc<Vec<RcStr>>> {
        let keys = {
            let map = &self.map_path_to_op.get().0;
            map.keys().cloned().collect::<Vec<_>>()
        };
        let keys = keys
            .into_iter()
            .filter_map(|path| root.get_path_to(&path).map(RcStr::from))
            .collect();
        Ok(Vc::cell(keys))
    }

    #[turbo_tasks::function(session_dependent)]
    fn raw_get(&self, path: FileSystemPath) -> Vc<OptionMapEntry> {
        let assets = {
            let map = self.map_path_to_op.get();
            output_operation_for_path(&map, &path)
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

/// Returns whether the map changed. Because an emptied path key is always deleted here, the map
/// never holds a path with an empty operation set, which is what keeps renamed output paths from
/// accumulating for the lifetime of this non-evictable map.
fn update_output_operation_paths<'a>(
    map: &mut PathToOutputOperation,
    assets_operation: OperationVc<ExpandedOutputAssets>,
    paths: impl IntoIterator<Item = &'a FileSystemPath>,
) -> bool {
    let mut changed = false;

    // get current map's keys, subtract keys that don't exist in operation
    let mut stale_assets = map.0.keys().cloned().collect::<FxHashSet<_>>();

    for path in paths {
        let inserted = map
            .0
            .entry(path.clone())
            .or_default()
            .0
            .insert(assets_operation);
        stale_assets.remove(path);
        changed = changed || inserted;
    }

    // Make more efficient with reverse map
    for path in &stale_assets {
        let remove_path = {
            let operations = map
                .0
                .get_mut(path)
                // guaranteed
                .unwrap();
            let removed = operations.0.swap_remove(&assets_operation);
            changed = changed || removed;
            operations.0.is_empty()
        };
        if remove_path {
            map.0.remove(path);
            changed = true;
        }
    }
    changed
}

fn output_operation_for_path(
    map: &PathToOutputOperation,
    path: &FileSystemPath,
) -> Option<OperationVc<ExpandedOutputAssets>> {
    map.0
        .get(path)
        .and_then(|operations| operations.0.iter().next().copied())
}

type GetEntriesResultT = Vec<(FileSystemPath, ResolvedVc<Box<dyn OutputAsset>>)>;

#[turbo_tasks::value(transparent)]
struct GetEntriesResult(GetEntriesResultT);

#[turbo_tasks::function(operation, root)]
async fn get_entries(assets: OperationVc<ExpandedOutputAssets>) -> Result<Vc<GetEntriesResult>> {
    let assets_ref = assets.connect().await?;
    let entries = assets_ref
        .iter()
        .map(async |&asset| {
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

#[cfg(test)]
mod tests {
    use turbo_rcstr::rcstr;
    use turbo_tasks::{Vc, unmark_top_level_task_may_leak_eventually_consistent_state};
    use turbo_tasks_fs::{DiskFileSystem, FileSystem};
    use turbo_tasks_testing::{Registration, register, run_once};

    use super::*;

    static REGISTRATION: Registration = register!();

    // Distinct ids keep these operations distinct tasks; the operation-entry counts asserted below
    // would collapse to one otherwise.
    #[turbo_tasks::function(operation, root)]
    fn test_assets_operation(id: u32) -> Vc<ExpandedOutputAssets> {
        let _ = id;
        Vc::cell(Vec::new())
    }

    #[turbo_tasks::function(operation, root)]
    fn test_compute_entry_operation(id: u32) -> Vc<OptionMapEntry> {
        let _ = id;
        Vc::cell(None)
    }

    /// Drives the same entry point `compute_entry` uses, so these tests cover the production
    /// mutation including its lock boundary.
    fn set_paths(
        map: &VersionedContentMap,
        operation: OperationVc<ExpandedOutputAssets>,
        paths: &[FileSystemPath],
    ) {
        map.update_output_operation_paths(operation, paths);
    }

    fn stats(map: &VersionedContentMap) -> (usize, usize, usize, usize) {
        let path_map = map.map_path_to_op.get_untracked();
        let total = path_map.0.len();
        let stale = path_map
            .0
            .values()
            .filter(|operations| operations.0.is_empty())
            .count();
        let operations = map.map_op_to_compute_entry.get_untracked().len();
        (total, total - stale, stale, operations)
    }

    fn has_operation(
        map: &VersionedContentMap,
        path: &FileSystemPath,
        operation: OperationVc<ExpandedOutputAssets>,
    ) -> bool {
        let path_map = map.map_path_to_op.get_untracked();
        path_map
            .0
            .get(path)
            .is_some_and(|operations| operations.0.contains(&operation))
    }

    fn lookup_operation(
        map: &VersionedContentMap,
        path: &FileSystemPath,
    ) -> Option<OperationVc<ExpandedOutputAssets>> {
        output_operation_for_path(&map.map_path_to_op.get_untracked(), path)
    }

    fn map_with_operation(operation: OperationVc<ExpandedOutputAssets>) -> VersionedContentMap {
        let map = VersionedContentMap {
            map_path_to_op: State::new(PathToOutputOperation(FxHashMap::default())),
            map_op_to_compute_entry: State::new(FxHashMap::default()),
        };
        add_operation(&map, operation, 0);
        map
    }

    fn add_operation(
        map: &VersionedContentMap,
        operation: OperationVc<ExpandedOutputAssets>,
        id: u32,
    ) {
        map.map_op_to_compute_entry
            .update_conditionally(|operation_map| {
                operation_map.insert(operation, test_compute_entry_operation(id));
                true
            });
    }

    async fn paths() -> Result<(
        FileSystemPath,
        FileSystemPath,
        FileSystemPath,
        FileSystemPath,
    )> {
        let root = DiskFileSystem::new(rcstr!("versioned-content-map-test"), Vc::cell(rcstr!("/")))
            .root()
            .owned()
            .await?;
        Ok((
            root.join("a.js")?,
            root.join("b.js")?,
            root.join("c.js")?,
            root.join("d.js")?,
        ))
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn removes_renamed_output_paths() {
        run_once(&REGISTRATION, async || {
            unmark_top_level_task_may_leak_eventually_consistent_state();
            let operation = test_assets_operation(0);
            let map = map_with_operation(operation);
            let (a, b, _, _) = paths().await?;

            set_paths(&map, operation, std::slice::from_ref(&a));
            set_paths(&map, operation, std::slice::from_ref(&b));

            assert_eq!(lookup_operation(&map, &a), None);
            assert_eq!(lookup_operation(&map, &b), Some(operation));
            assert_eq!(stats(&map), (1, 1, 0, 1));
            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn preserves_shared_output_paths_until_last_owner_is_removed() {
        run_once(&REGISTRATION, async || {
            unmark_top_level_task_may_leak_eventually_consistent_state();
            let operation_x = test_assets_operation(0);
            let operation_y = test_assets_operation(1);
            let map = map_with_operation(operation_x);
            add_operation(&map, operation_y, 1);
            let (a, b, c, _) = paths().await?;

            set_paths(&map, operation_x, std::slice::from_ref(&a));
            set_paths(&map, operation_y, std::slice::from_ref(&a));
            set_paths(&map, operation_x, std::slice::from_ref(&b));
            assert!(has_operation(&map, &a, operation_y));
            assert!(!has_operation(&map, &a, operation_x));

            set_paths(&map, operation_y, std::slice::from_ref(&c));
            assert_eq!(lookup_operation(&map, &a), None);
            assert_eq!(stats(&map), (2, 2, 0, 2));
            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn bounds_repeated_output_path_churn() {
        run_once(&REGISTRATION, async || {
            unmark_top_level_task_may_leak_eventually_consistent_state();
            let operation = test_assets_operation(0);
            let map = map_with_operation(operation);
            let paths = paths().await?;

            let mut progression = Vec::new();
            for path in [&paths.0, &paths.1, &paths.2, &paths.3] {
                set_paths(&map, operation, std::slice::from_ref(path));
                progression.push(stats(&map));
            }
            // (total paths, live paths, stale paths, operation entries) after each rename.
            assert_eq!(progression, vec![(1, 1, 0, 1); 4]);
            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn readds_removed_output_paths() {
        run_once(&REGISTRATION, async || {
            unmark_top_level_task_may_leak_eventually_consistent_state();
            let operation_x = test_assets_operation(0);
            let operation_y = test_assets_operation(1);
            let map = map_with_operation(operation_x);
            let (a, _, _, _) = paths().await?;

            set_paths(&map, operation_x, std::slice::from_ref(&a));
            set_paths(&map, operation_x, &[]);
            set_paths(&map, operation_x, std::slice::from_ref(&a));
            assert_eq!(stats(&map), (1, 1, 0, 1));
            assert_eq!(lookup_operation(&map, &a), Some(operation_x));

            set_paths(&map, operation_y, std::slice::from_ref(&a));
            set_paths(&map, operation_x, &[]);
            assert!(has_operation(&map, &a, operation_y));
            set_paths(&map, operation_x, std::slice::from_ref(&a));
            assert!(has_operation(&map, &a, operation_x));
            assert!(has_operation(&map, &a, operation_y));
            anyhow::Ok(())
        })
        .await
        .unwrap();
    }
}
