use std::{
    fmt::Display,
    sync::{Arc, LazyLock, RwLock},
};

use anyhow::{Context, Result};
use bincode::{Decode, Encode};
use serde::Serialize;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexMap, FxIndexSet, NonLocalValue, ReadRef, ResolvedVc, TaskInput, TryJoinIterExt, Vc,
    debug::ValueDebugFormat,
    message_queue::{CompilationEvent, Severity},
    trace::TraceRawVcs,
    turbo_tasks,
};
use turbo_tasks_fs::FileSystemPath;
use turbo_tasks_hash::{Xxh3Hash64Hasher, encode_base64};
use turbopack_core::{
    asset::Asset,
    output::OutputAsset,
    update_instruction::UpdateInstruction,
    version::{PartialUpdate, Update, Version},
};
use turbopack_ecmascript::chunk_list::{
    merged_update::EcmascriptMergedUpdate,
    update::{ChunkListUpdate, ChunkUpdate, EcmascriptUpdateInstruction},
    version::ChunkListVersion,
};
use turbopack_nodejs::ecmascript::node::entry::chunk_list_content::{
    EcmascriptBuildNodeChunkListContent, compute_update_from_version_operation,
};

/// Canonical JSON key identifying a Next.js entrypoint by router, side, and page.
#[derive(Clone, Debug, Decode, Encode, Eq, Hash, NonLocalValue, PartialEq, TraceRawVcs)]
pub struct ServerHmrEntryKey(RcStr);

impl TaskInput for ServerHmrEntryKey {
    fn is_transient(&self) -> bool {
        false
    }
}

impl ServerHmrEntryKey {
    pub fn new(value: RcStr) -> Self {
        Self(value)
    }
}

#[derive(Clone, TraceRawVcs, PartialEq, Eq, ValueDebugFormat, NonLocalValue)]
pub struct ServerHmrChunkList {
    pub relative_path: RcStr,
    pub versioned_content: ResolvedVc<EcmascriptBuildNodeChunkListContent>,
}

impl ServerHmrChunkList {
    /// `chunk_list` must be an `EcmascriptBuildNodeChunkList`; only its content type carries the
    /// per-chunk versions the aggregate diff needs.
    pub async fn from_chunk_list(
        root: &FileSystemPath,
        chunk_list: ResolvedVc<Box<dyn OutputAsset>>,
    ) -> Result<Self> {
        let path = chunk_list.path().await?;
        let relative_path: RcStr = root
            .get_path_to(&path)
            .context("server HMR entry must be inside the app server root")?
            .into();
        let content = chunk_list.versioned_content().to_resolved().await?;
        let versioned_content =
            ResolvedVc::try_downcast_type::<EcmascriptBuildNodeChunkListContent>(content)
                .with_context(|| {
                    format!("server HMR entry {relative_path} is not a Node.js chunk list")
                })?;
        Ok(Self {
            relative_path,
            versioned_content,
        })
    }
}

#[turbo_tasks::value(transparent, serialization = "skip")]
#[derive(Clone)]
pub struct ServerHmrChunkLists(Vec<ServerHmrChunkList>);

impl ServerHmrChunkLists {
    pub fn new(chunk_lists: Vec<ServerHmrChunkList>) -> Self {
        Self(chunk_lists)
    }

    pub fn as_slice(&self) -> &[ServerHmrChunkList] {
        &self.0
    }
}

#[derive(Debug, Default)]
pub struct ServerHmrEntryMap {
    entries: RwLock<FxIndexMap<ServerHmrEntryKey, ResolvedVc<ServerHmrChunkLists>>>,
}

impl PartialEq for ServerHmrEntryMap {
    fn eq(&self, other: &Self) -> bool {
        std::ptr::eq(self, other)
    }
}

impl Eq for ServerHmrEntryMap {}

impl ServerHmrEntryMap {
    pub fn set(&self, entry_key: ServerHmrEntryKey, chunk_lists: ResolvedVc<ServerHmrChunkLists>) {
        self.entries
            .write()
            .expect("server HMR entry map lock poisoned")
            .insert(entry_key, chunk_lists);
    }

    pub fn get(&self, entry_key: &ServerHmrEntryKey) -> Option<ResolvedVc<ServerHmrChunkLists>> {
        self.entries
            .read()
            .expect("server HMR entry map lock poisoned")
            .get(entry_key)
            .copied()
    }
}

#[turbo_tasks::value(serialization = "skip", shared)]
#[derive(Debug)]
pub struct ServerHmrChunkListVersion {
    #[turbo_tasks(trace_ignore)]
    pub versions_by_chunk_list_path: FxIndexMap<RcStr, ReadRef<ChunkListVersion>>,
}

#[turbo_tasks::value_impl]
impl Version for ServerHmrChunkListVersion {
    #[turbo_tasks::function]
    async fn id(&self) -> Result<Vc<RcStr>> {
        let mut hasher = Xxh3Hash64Hasher::new();
        hasher.write_value(self.versions_by_chunk_list_path.len());
        for (path, version) in &self.versions_by_chunk_list_path {
            hasher.write_value(path.as_str());
            hasher.write_value(version.id.as_str());
        }
        Ok(Vc::cell(encode_base64(hasher.finish()).into()))
    }
}

impl ServerHmrChunkListVersion {
    pub async fn from_chunk_lists(chunk_lists: &[ServerHmrChunkList]) -> Result<Self> {
        let versions_by_chunk_list_path = chunk_lists
            .iter()
            .map(|chunk_list| {
                let relative_path = chunk_list.relative_path.clone();
                let versioned_content = chunk_list.versioned_content;
                async move {
                    let version = versioned_content.version().await?;
                    anyhow::Ok((relative_path, version))
                }
            })
            .try_join()
            .await?
            .into_iter()
            .collect();
        Ok(Self {
            versions_by_chunk_list_path,
        })
    }
}

#[derive(Default)]
pub struct ChunkListUpdateBuilder {
    chunks: FxIndexMap<RcStr, ChunkUpdate>,
    merged: FxIndexSet<EcmascriptMergedUpdate>,
}

impl ChunkListUpdateBuilder {
    pub fn add_instruction(&mut self, instruction: &UpdateInstruction) {
        let instruction = instruction
            .downcast_ref::<EcmascriptUpdateInstruction>()
            .expect("aggregate HMR only accepts ECMAScript update instructions");

        match instruction {
            EcmascriptUpdateInstruction::ChunkList(update) => {
                for (chunk_path, update) in &update.chunks {
                    self.chunks.insert(chunk_path.clone(), update.clone());
                }
                for update in &update.merged {
                    self.push_merged(update);
                }
            }
            EcmascriptUpdateInstruction::Merged(update) => self.push_merged(update),
        }
    }

    fn push_merged(&mut self, update: &EcmascriptMergedUpdate) {
        self.merged.insert(update.clone());
    }

    pub fn is_empty(&self) -> bool {
        self.chunks.is_empty() && self.merged.is_empty()
    }

    pub fn build(self) -> UpdateInstruction {
        ChunkListUpdate {
            chunks: self.chunks,
            merged: self.merged.into_iter().collect(),
        }
        .into_instruction()
    }
}

/// An update plus the baseline for the next pull.
#[derive(Debug, TraceRawVcs)]
pub enum ServerHmrUpdate {
    /// No runtime update and the graph is equivalent. However, `to` may still advance the pull
    /// version.
    NoRuntimeUpdate {
        to: Option<ReadRef<ServerHmrChunkListVersion>>,
    },
    FullReevaluation {
        to: ReadRef<ServerHmrChunkListVersion>,
    },
    Partial {
        to: ReadRef<ServerHmrChunkListVersion>,
        instruction: UpdateInstruction,
    },
}

struct DiffResult {
    chunk_updates: Vec<ReadRef<Update>>,
    membership: ChunkListMembershipChange,
}

/// Chunk lists that appeared or vanished relative to the pull baseline.
#[derive(Default, Clone, Copy)]
struct ChunkListMembershipChange {
    has_new: bool,
    has_removed: bool,
}

static TRACE_DIFFING: LazyLock<bool> = LazyLock::new(|| {
    cfg!(debug_assertions) && std::env::var_os("NEXT_TEST_SERVER_HMR_DIFFING").is_some()
});

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ServerHmrChunkListDiffEvent {
    #[serde(rename = "entryPath")]
    chunk_list_path: RcStr,
}

impl Display for ServerHmrChunkListDiffEvent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Diffing server HMR entry {}", self.chunk_list_path)
    }
}

impl CompilationEvent for ServerHmrChunkListDiffEvent {
    fn type_name(&self) -> &'static str {
        "ServerHmrEntryDiffEvent"
    }

    fn severity(&self) -> Severity {
        Severity::Trace
    }

    fn message(&self) -> String {
        self.to_string()
    }

    fn to_json(&self) -> String {
        serde_json::to_string(self).expect("server HMR entry diff event serializes")
    }
}

async fn diff_chunks_against(
    chunk_lists: &[ServerHmrChunkList],
    from: &ServerHmrChunkListVersion,
) -> Result<DiffResult> {
    let current_chunk_list_paths = chunk_lists
        .iter()
        .map(|chunk_list| &chunk_list.relative_path)
        .collect::<FxIndexSet<_>>();
    let has_removed_chunk_lists = from
        .versions_by_chunk_list_path
        .keys()
        .any(|path| !current_chunk_list_paths.contains(path));
    let mut has_new_chunk_lists = false;
    let chunk_updates = chunk_lists
        .iter()
        .filter_map(
            |ServerHmrChunkList {
                 relative_path,
                 versioned_content,
             }| {
                if *TRACE_DIFFING {
                    turbo_tasks().send_compilation_event(Arc::new(ServerHmrChunkListDiffEvent {
                        chunk_list_path: relative_path.clone(),
                    }));
                }
                let Some(prev) = from.versions_by_chunk_list_path.get(relative_path).cloned()
                else {
                    has_new_chunk_lists = true;
                    return None;
                };
                Some((*versioned_content, prev))
            },
        )
        .map(|(content, prev)| async move {
            compute_update_from_version_operation(
                content,
                turbo_tasks::TransientInstance::new(prev),
            )
            .read_strongly_consistent()
            .await
        })
        .try_join()
        .await?;
    Ok(DiffResult {
        chunk_updates,
        membership: ChunkListMembershipChange {
            has_new: has_new_chunk_lists,
            has_removed: has_removed_chunk_lists,
        },
    })
}

enum ServerHmrChunkUpdate<'a> {
    None,
    Missing,
    Total,
    Partial(&'a UpdateInstruction),
}

impl<'a> From<&'a Update> for ServerHmrChunkUpdate<'a> {
    fn from(update: &'a Update) -> Self {
        match update {
            Update::None => Self::None,
            Update::Missing => Self::Missing,
            Update::Total(_) => Self::Total,
            Update::Partial(PartialUpdate { instruction, .. }) => Self::Partial(instruction),
        }
    }
}

fn classify_server_hmr_update<'a>(
    chunk_updates: impl IntoIterator<Item = ServerHmrChunkUpdate<'a>>,
    membership: ChunkListMembershipChange,
    to: ReadRef<ServerHmrChunkListVersion>,
) -> ServerHmrUpdate {
    if membership.has_removed {
        return ServerHmrUpdate::FullReevaluation { to };
    }

    let mut builder = ChunkListUpdateBuilder::default();
    for update in chunk_updates {
        match update {
            ServerHmrChunkUpdate::None => {}
            ServerHmrChunkUpdate::Missing | ServerHmrChunkUpdate::Total => {
                return ServerHmrUpdate::FullReevaluation { to };
            }
            ServerHmrChunkUpdate::Partial(instruction) => builder.add_instruction(instruction),
        }
    }

    // New chunks load on demand but must advance the baseline.
    if builder.is_empty() {
        return ServerHmrUpdate::NoRuntimeUpdate {
            to: membership.has_new.then_some(to),
        };
    }

    ServerHmrUpdate::Partial {
        to,
        instruction: builder.build(),
    }
}

/// Kept outside Turbo Tasks so old pull baselines cannot reactivate.
pub async fn compute_server_hmr_update(
    chunk_lists: &[ServerHmrChunkList],
    from: Option<&ServerHmrChunkListVersion>,
    to: ReadRef<ServerHmrChunkListVersion>,
) -> Result<ServerHmrUpdate> {
    if chunk_lists.is_empty() {
        return Ok(ServerHmrUpdate::NoRuntimeUpdate { to: None });
    }

    let Some(from) = from else {
        return Ok(ServerHmrUpdate::NoRuntimeUpdate { to: Some(to) });
    };

    let DiffResult {
        chunk_updates,
        membership,
    } = diff_chunks_against(chunk_lists, from).await?;

    Ok(classify_server_hmr_update(
        chunk_updates
            .iter()
            .map(|update| ServerHmrChunkUpdate::from(&**update)),
        membership,
        to,
    ))
}

#[cfg(test)]
mod tests {
    use turbo_tasks::{FxIndexMap, FxIndexSet, ReadRef};
    use turbopack_core::update_instruction::UpdateInstruction;
    use turbopack_ecmascript::chunk_list::{
        merged_update::{
            EcmascriptMergedChunkDeleted, EcmascriptMergedChunkUpdate, EcmascriptMergedUpdate,
        },
        update::{ChunkListUpdate, ChunkUpdate, EcmascriptUpdateInstruction},
    };

    use super::{
        ChunkListMembershipChange, ChunkListUpdateBuilder, ServerHmrChunkListVersion,
        ServerHmrChunkUpdate, ServerHmrUpdate, classify_server_hmr_update,
    };

    fn version() -> ReadRef<ServerHmrChunkListVersion> {
        ReadRef::new_owned(ServerHmrChunkListVersion {
            versions_by_chunk_list_path: Default::default(),
        })
    }

    fn unchanged_membership() -> ChunkListMembershipChange {
        ChunkListMembershipChange::default()
    }

    fn added_chunk_lists() -> ChunkListMembershipChange {
        ChunkListMembershipChange {
            has_new: true,
            has_removed: false,
        }
    }

    fn removed_chunk_lists() -> ChunkListMembershipChange {
        ChunkListMembershipChange {
            has_new: false,
            has_removed: true,
        }
    }

    fn merged(chunk_path: &str) -> EcmascriptMergedUpdate {
        EcmascriptMergedUpdate {
            entries: Default::default(),
            chunks: [(
                chunk_path.into(),
                EcmascriptMergedChunkUpdate::Deleted(EcmascriptMergedChunkDeleted {
                    modules: Default::default(),
                }),
            )]
            .into_iter()
            .collect(),
        }
    }

    #[test]
    fn unchanged_chunks_produce_no_runtime_update() {
        assert!(matches!(
            classify_server_hmr_update(
                [ServerHmrChunkUpdate::None],
                unchanged_membership(),
                version()
            ),
            ServerHmrUpdate::NoRuntimeUpdate { to: None }
        ));
    }

    #[test]
    fn missing_chunk_produces_full_reevaluation() {
        assert!(matches!(
            classify_server_hmr_update(
                [ServerHmrChunkUpdate::Missing],
                unchanged_membership(),
                version()
            ),
            ServerHmrUpdate::FullReevaluation { .. }
        ));
    }

    #[test]
    fn total_update_produces_full_reevaluation() {
        assert!(matches!(
            classify_server_hmr_update(
                [ServerHmrChunkUpdate::Total],
                unchanged_membership(),
                version()
            ),
            ServerHmrUpdate::FullReevaluation { .. }
        ));
    }

    #[test]
    fn partial_instructions_are_combined() {
        let chunk_list = ChunkListUpdate {
            chunks: FxIndexMap::from_iter([("a.js".into(), ChunkUpdate::Added)]),
            merged: vec![],
        }
        .into_instruction();
        let merged_instruction =
            UpdateInstruction::new(EcmascriptUpdateInstruction::Merged(merged("b.js")));

        let ServerHmrUpdate::Partial { instruction, .. } = classify_server_hmr_update(
            [
                ServerHmrChunkUpdate::Partial(&chunk_list),
                ServerHmrChunkUpdate::Partial(&merged_instruction),
            ],
            unchanged_membership(),
            version(),
        ) else {
            panic!("partial instructions should produce a partial aggregate update");
        };
        let instruction = instruction
            .downcast_ref::<EcmascriptUpdateInstruction>()
            .expect("aggregate instruction is ECMAScript");
        let EcmascriptUpdateInstruction::ChunkList(update) = instruction else {
            panic!("aggregate instruction should be a chunk-list update");
        };
        assert_eq!(update.chunks["a.js"], ChunkUpdate::Added);
        assert_eq!(update.merged, [merged("b.js")]);
    }

    #[test]
    fn new_chunk_lists_advance_baseline_without_runtime_update() {
        assert!(matches!(
            classify_server_hmr_update([], added_chunk_lists(), version()),
            ServerHmrUpdate::NoRuntimeUpdate { to: Some(_) }
        ));
    }

    #[test]
    fn removed_chunk_lists_produce_full_reevaluation() {
        assert!(matches!(
            classify_server_hmr_update([], removed_chunk_lists(), version()),
            ServerHmrUpdate::FullReevaluation { .. }
        ));
    }

    #[test]
    fn deduplicates_merged_updates_in_first_seen_order() {
        let first = merged("first.js");
        let second = merged("second.js");
        let mut builder = ChunkListUpdateBuilder::default();

        builder.add_instruction(&UpdateInstruction::new(
            EcmascriptUpdateInstruction::Merged(first.clone()),
        ));
        builder.add_instruction(&UpdateInstruction::new(
            EcmascriptUpdateInstruction::Merged(second.clone()),
        ));
        builder.add_instruction(&UpdateInstruction::new(
            EcmascriptUpdateInstruction::Merged(first.clone()),
        ));

        assert_eq!(builder.merged, FxIndexSet::from_iter([first, second]));
    }

    #[test]
    fn chunk_updates_use_last_writer_and_stable_order() {
        let mut builder = ChunkListUpdateBuilder::default();
        let first = ChunkListUpdate {
            chunks: FxIndexMap::from_iter([
                ("a.js".into(), ChunkUpdate::Total),
                ("b.js".into(), ChunkUpdate::Added),
            ]),
            merged: vec![],
        };
        let second = ChunkListUpdate {
            chunks: FxIndexMap::from_iter([
                ("a.js".into(), ChunkUpdate::Deleted),
                ("c.js".into(), ChunkUpdate::Total),
            ]),
            merged: vec![],
        };

        builder.add_instruction(&first.into_instruction());
        builder.add_instruction(&second.into_instruction());

        assert_eq!(
            builder
                .chunks
                .keys()
                .map(|path| path.as_str())
                .collect::<Vec<_>>(),
            ["a.js", "b.js", "c.js"]
        );
        assert_eq!(builder.chunks["a.js"], ChunkUpdate::Deleted);
    }
}
