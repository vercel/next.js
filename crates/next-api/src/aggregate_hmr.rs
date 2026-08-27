use std::{fmt::Display, sync::Arc};

use anyhow::Result;
use serde::Serialize;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexMap, FxIndexSet, NonLocalValue, ReadRef, ResolvedVc, TryJoinIterExt, Vc,
    debug::ValueDebugFormat,
    message_queue::{CompilationEvent, Severity},
    trace::TraceRawVcs,
    turbo_tasks,
};
use turbo_tasks_hash::{Xxh3Hash64Hasher, encode_base64};
use turbopack_browser::ecmascript::list::content::EcmascriptDevChunkListContent;
use turbopack_core::{
    update_instruction::UpdateInstruction,
    version::{PartialUpdate, Update, Version, VersionedContent},
};
use turbopack_ecmascript::chunk_list::{
    merged_update::EcmascriptMergedUpdate,
    update::{ChunkListUpdate, ChunkUpdate, EcmascriptUpdateInstruction},
    version::ChunkListVersion,
};
use turbopack_nodejs::ecmascript::node::entry::chunk_list_content::{
    EcmascriptBuildNodeChunkListContent, compute_update_from_version_operation,
};

#[derive(Clone, TraceRawVcs, PartialEq, Eq, ValueDebugFormat, NonLocalValue)]
pub struct HmrChunkWithContent {
    pub path: RcStr,
    pub content: ResolvedVc<Box<dyn VersionedContent>>,
}

#[turbo_tasks::value(transparent, serialization = "skip")]
#[derive(Clone)]
pub struct HmrChunksWithContent(Vec<HmrChunkWithContent>);

impl HmrChunksWithContent {
    pub fn from_inner(chunks: Vec<HmrChunkWithContent>) -> Self {
        Self(chunks)
    }

    pub fn retain_entry_paths(&mut self, entry_paths: &FxIndexSet<RcStr>) {
        self.0.retain(|chunk| entry_paths.contains(&chunk.path));
    }
}

/// Keep this exhaustive: omitted chunk-list types receive no aggregate updates.
pub fn is_entry_chunk_list_content(content: ResolvedVc<Box<dyn VersionedContent>>) -> bool {
    ResolvedVc::try_downcast_type::<EcmascriptBuildNodeChunkListContent>(content).is_some()
        || ResolvedVc::try_downcast_type::<EcmascriptDevChunkListContent>(content).is_some()
}

#[turbo_tasks::value(serialization = "skip", shared)]
#[derive(Debug)]
pub struct AggregateHmrVersion {
    #[turbo_tasks(trace_ignore)]
    pub versions: FxIndexMap<RcStr, ReadRef<ChunkListVersion>>,
}

#[turbo_tasks::value_impl]
impl Version for AggregateHmrVersion {
    #[turbo_tasks::function]
    async fn id(&self) -> Result<Vc<RcStr>> {
        let entries = self
            .versions
            .iter()
            .map(|(path, version)| {
                let path = path.clone();
                let id = version.id.clone();
                async move { Ok::<_, anyhow::Error>((path, id)) }
            })
            .try_join()
            .await?;

        let mut hasher = Xxh3Hash64Hasher::new();
        hasher.write_value(entries.len());
        for (path, id) in entries {
            hasher.write_value(path.as_str());
            hasher.write_value(id.as_str());
        }
        Ok(Vc::cell(encode_base64(hasher.finish()).into()))
    }
}

impl AggregateHmrVersion {
    pub async fn from_chunks(chunks: &[HmrChunkWithContent]) -> Result<Self> {
        let versions = chunks
            .iter()
            .map(|HmrChunkWithContent { path, content }| {
                let path = path.clone();
                let content = *content;
                async move {
                    let version = ResolvedVc::try_downcast_type::<ChunkListVersion>(
                        content.version().to_resolved().await?,
                    )
                    .expect("server HMR entry chunks use chunk-list versions")
                    .await?;
                    Ok::<_, anyhow::Error>((path, version))
                }
            })
            .try_join()
            .await?
            .into_iter()
            .collect();
        Ok(Self { versions })
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

    fn is_empty(&self) -> bool {
        self.chunks.is_empty() && self.merged.is_empty()
    }

    fn build(self) -> UpdateInstruction {
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
    None {
        to: Option<ReadRef<AggregateHmrVersion>>,
    },
    Restart {
        to: ReadRef<AggregateHmrVersion>,
    },
    Partial {
        to: ReadRef<AggregateHmrVersion>,
        instruction: UpdateInstruction,
    },
}

struct DiffResult {
    chunk_updates: Vec<ReadRef<Update>>,
    has_new_chunks: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ServerHmrEntryDiffEvent {
    entry_path: RcStr,
}

impl Display for ServerHmrEntryDiffEvent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Diffing server HMR entry {}", self.entry_path)
    }
}

impl CompilationEvent for ServerHmrEntryDiffEvent {
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
    chunks: &[HmrChunkWithContent],
    from: &AggregateHmrVersion,
) -> Result<DiffResult> {
    let mut has_new_chunks = false;
    let chunk_updates = chunks
        .iter()
        .filter_map(|HmrChunkWithContent { path, content }| {
            turbo_tasks().send_compilation_event(Arc::new(ServerHmrEntryDiffEvent {
                entry_path: path.clone(),
            }));
            let Some(prev) = from.versions.get(path).cloned() else {
                has_new_chunks = true;
                return None;
            };
            Some((*content, prev))
        })
        .map(|(content, prev)| async move {
            let Some(content) =
                ResolvedVc::try_downcast_type::<EcmascriptBuildNodeChunkListContent>(content)
            else {
                unreachable!("server HMR only collects Node.js entry chunk lists")
            };
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
        has_new_chunks,
    })
}

/// Kept outside Turbo Tasks so old pull baselines cannot reactivate.
pub async fn compute_server_hmr_update(
    chunks: &[HmrChunkWithContent],
    from: Option<&AggregateHmrVersion>,
    to: ReadRef<AggregateHmrVersion>,
) -> Result<ServerHmrUpdate> {
    if chunks.is_empty() {
        return Ok(ServerHmrUpdate::None { to: None });
    }

    let Some(from) = from else {
        return Ok(ServerHmrUpdate::None { to: Some(to) });
    };

    let DiffResult {
        chunk_updates,
        has_new_chunks,
    } = diff_chunks_against(chunks, from).await?;

    let mut builder = ChunkListUpdateBuilder::default();
    for update in chunk_updates {
        match &*update {
            Update::None => {}
            Update::Missing | Update::Total(_) => {
                return Ok(ServerHmrUpdate::Restart { to });
            }
            Update::Partial(PartialUpdate { instruction, .. }) => {
                builder.add_instruction(instruction);
            }
        }
    }

    // New chunks load on demand but must advance the baseline.
    if builder.is_empty() {
        return Ok(ServerHmrUpdate::None {
            to: has_new_chunks.then_some(to),
        });
    }

    Ok(ServerHmrUpdate::Partial {
        to,
        instruction: builder.build(),
    })
}

#[cfg(test)]
mod tests {
    use turbo_tasks::{FxIndexMap, FxIndexSet};
    use turbopack_core::update_instruction::UpdateInstruction;
    use turbopack_ecmascript::chunk_list::{
        merged_update::{
            EcmascriptMergedChunkDeleted, EcmascriptMergedChunkUpdate, EcmascriptMergedUpdate,
        },
        update::{ChunkListUpdate, ChunkUpdate, EcmascriptUpdateInstruction},
    };

    use super::ChunkListUpdateBuilder;

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
