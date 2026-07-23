use std::sync::LazyLock;

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
    PROJECT_FILESYSTEM_NAME_STR, SOURCE_URL_PROTOCOL_STR,
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

#[turbo_tasks::value]
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

    /// The union of the first-party project source paths referenced by every live output-asset
    /// set's source maps. This is the admission set for the on-demand source-content dev endpoint:
    /// a file may be served only if some currently-emitted source map references it.
    ///
    /// Built lazily on demand and turbo-tasks cached; recomputation is localized to the asset sets
    /// whose maps actually changed (each set's `referenced_source_paths` is independently cached).
    #[turbo_tasks::function]
    pub async fn referenced_source_paths(&self) -> Result<Vc<ProjectSourcePaths>> {
        let operations = {
            let map = self.map_op_to_compute_entry.get();
            map.keys().copied().collect::<Vec<_>>()
        };
        let per_operation = operations
            .into_iter()
            .map(|assets_operation| async move {
                // Reconnect the operation so it stays live in this computation.
                referenced_source_paths(assets_operation.connect()).await
            })
            .try_join()
            .await?;

        let mut result = FxHashSet::default();
        for paths in per_operation {
            result.extend(paths.iter().cloned());
        }
        Ok(Vc::cell(result))
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

/// The set of project-relative source file paths referenced by an emitted source map, used to gate
/// the on-demand source-content dev endpoint (only referenced files may be served).
#[turbo_tasks::value(transparent)]
pub struct ProjectSourcePaths(FxHashSet<RcStr>);

/// Collects the set of project-relative source file paths referenced by the `sources` of every
/// source map among `assets`. Only first-party project sources are included (see
/// [`is_first_party_project_source`]); virtual (`[next]`/`[turbopack]`), `node_modules`, and
/// non-project sources are skipped since those keep their content inlined and are never fetched on
/// demand.
///
/// The result is turbo-tasks cached and invalidated with the underlying maps, so it is built lazily
/// on the first content request and only recomputed when a map actually changes. The napi content
/// endpoint reads it directly as its admission set — there is no separately-maintained filter.
#[turbo_tasks::function]
pub async fn referenced_source_paths(
    assets: Vc<ExpandedOutputAssets>,
) -> Result<Vc<ProjectSourcePaths>> {
    let assets_ref = assets.await?;
    let per_asset = assets_ref
        .iter()
        .map(|&asset| async move {
            let Some(generate_source_map) =
                ResolvedVc::try_sidecast::<Box<dyn GenerateSourceMap>>(asset)
            else {
                return Ok(Vec::new());
            };
            let map = generate_source_map.generate_source_map().await?;
            let Some(map) = map.as_content() else {
                return Ok(Vec::new());
            };
            let map = map.content().to_str()?;
            Ok(collect_project_sources(&map))
        })
        .try_join()
        .await?;

    let mut result = FxHashSet::default();
    for paths in per_asset {
        result.extend(paths);
    }
    Ok(Vc::cell(result))
}

/// The `turbopack:///[project]/` prefix that stage-1 (server chunk) maps use for first-party
/// sources.
static PROJECT_SOURCE_PREFIX: LazyLock<String> =
    LazyLock::new(|| format!("{SOURCE_URL_PROTOCOL_STR}///[{PROJECT_FILESYSTEM_NAME_STR}]/"));

/// Whether `rest` (a `[project]`-relative source path) is a first-party project file that is served
/// on demand — i.e. not inside `node_modules`. Keep in sync with the emitter predicate in
/// `turbopack-core`'s `source_map::utils::dev_server_source_map`.
fn is_first_party_project_source(rest: &str) -> bool {
    !rest.contains("node_modules/")
}

/// Percent-decode a source path to the on-disk (POSIX-like, unencoded) format used by the content
/// endpoint's filesystem-root join.
fn decode_source_path(rest: &str) -> RcStr {
    RcStr::from(
        urlencoding::decode(rest)
            .map(|c| c.into_owned())
            .unwrap_or_else(|_| rest.to_string()),
    )
}

/// Deserialization mirror capturing only the fields needed to enumerate sources. `mappings` and
/// `sourcesContent` (the large fields) are held as opaque [`RawValue`]s so serde never decodes
/// them — this is much cheaper than a full `serde_json::Value` DOM parse of the whole map.
#[derive(serde::Deserialize)]
struct SourcesOnlyMap<'a> {
    #[serde(borrow, default)]
    sources: Vec<Option<&'a str>>,
    #[serde(borrow, rename = "sourceRoot", default)]
    source_root: Option<&'a str>,
    #[serde(borrow, default)]
    sections: Vec<SourcesOnlySection<'a>>,
}

#[derive(serde::Deserialize)]
struct SourcesOnlySection<'a> {
    #[serde(borrow)]
    map: SourcesOnlyMap<'a>,
}

/// Parses a source map JSON string and returns the first-party project-relative source paths it
/// references (across the top-level map and any sections).
///
/// Handles both source map shapes the pipeline can produce:
/// - stage-1 form: `sources` are absolute `turbopack:///[project]/<rel>` URIs (stripped of the
///   project prefix).
/// - dev-server stage-2 form: `sources` are already `<rel>` and the map carries `sourceRoot ==
///   "/__nextjs_source-content/[project]/"` (the served browser chunk map). These relative sources
///   are exactly the project-relative paths to admit.
fn collect_project_sources(map: &str) -> Vec<RcStr> {
    fn collect_from_map(map: &SourcesOnlyMap<'_>, out: &mut Vec<RcStr>) {
        let is_dev_server_map = map.source_root == Some(SOURCE_CONTENT_SOURCE_ROOT);
        for src in map.sources.iter().flatten() {
            if let Some(rest) = src.strip_prefix(PROJECT_SOURCE_PREFIX.as_str()) {
                if is_first_party_project_source(rest) {
                    out.push(decode_source_path(rest));
                }
            } else if is_dev_server_map
                && !src.contains("://")
                && is_first_party_project_source(src)
            {
                // Relative project source resolved via the dev-server sourceRoot.
                out.push(decode_source_path(src));
            }
        }
        for section in &map.sections {
            collect_from_map(&section.map, out);
        }
    }

    let Ok(parsed) = serde_json::from_str::<SourcesOnlyMap<'_>>(map) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    collect_from_map(&parsed, &mut out);
    out
}

/// The `sourceRoot` emitted for dev-server on-demand source content. Must match the value produced
/// in `crates/next-core/src/next_client/context.rs` and consumed by the JS content middleware.
const SOURCE_CONTENT_SOURCE_ROOT: &str = "/__nextjs_source-content/[project]/";

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
