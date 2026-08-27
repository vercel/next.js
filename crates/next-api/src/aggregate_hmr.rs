use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexMap, FxIndexSet, NonLocalValue, ReadRef, ResolvedVc, TraitRef, TryJoinIterExt, Vc,
    debug::ValueDebugFormat, trace::TraceRawVcs,
};
use turbo_tasks_fs::FileSystemPath;
use turbo_tasks_hash::{Xxh3Hash64Hasher, encode_base64};
use turbopack_browser::ecmascript::list::content::EcmascriptDevChunkListContent;
use turbopack_core::{
    update_instruction::UpdateInstruction,
    version::{PartialUpdate, Update, Version, VersionState, VersionedContent},
};
use turbopack_ecmascript::chunk_list::{
    merged_update::EcmascriptMergedUpdate,
    update::{ChunkListUpdate, ChunkUpdate, EcmascriptUpdateInstruction},
};
use turbopack_nodejs::ecmascript::node::entry::chunk_list_content::EcmascriptBuildNodeChunkListContent;

use crate::versioned_content_map::VersionedContentMap;

#[derive(TraceRawVcs, PartialEq, Eq, ValueDebugFormat, NonLocalValue)]
pub struct HmrChunkWithContent {
    pub path: RcStr,
    pub content: ResolvedVc<Box<dyn VersionedContent>>,
}

#[turbo_tasks::value(transparent, serialization = "skip")]
pub struct HmrChunksWithContent(Vec<HmrChunkWithContent>);

/// Whether `content` is a chunk list, i.e. an entry point of the chunk graph that
/// an HMR subscription can be anchored on.
///
/// Note this must enumerate every chunk list content type. A new chunking context
/// that introduces one has to be added here, otherwise its chunks silently drop
/// out of the HMR subscription.
pub fn is_entry_chunk_list_content(content: ResolvedVc<Box<dyn VersionedContent>>) -> bool {
    ResolvedVc::try_downcast_type::<EcmascriptBuildNodeChunkListContent>(content).is_some()
        || ResolvedVc::try_downcast_type::<EcmascriptDevChunkListContent>(content).is_some()
}

/// Per-chunk versions keyed by path
#[turbo_tasks::value(serialization = "skip", shared)]
pub struct AggregateHmrVersion {
    #[turbo_tasks(trace_ignore)]
    pub versions: FxIndexMap<RcStr, TraitRef<Box<dyn Version>>>,
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
                let version = TraitRef::cell(version.clone());
                async move {
                    let id = version.id().owned().await?;
                    anyhow::Ok((path, id))
                }
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
    pub async fn from_map(
        map: Vc<VersionedContentMap>,
        root: FileSystemPath,
    ) -> Result<Vc<Box<dyn Version>>> {
        // An empty `versions` map behaves the same as `NotFoundVersion` would in
        // `diff_chunks_against`, so no special case is needed here.
        let chunks = map.hmr_chunks_in_path(root).await?;
        Ok(Vc::upcast(Self::from_chunks(&chunks).await?))
    }

    pub async fn from_chunks(chunks: &[HmrChunkWithContent]) -> Result<Vc<Self>> {
        let versions = chunks
            .iter()
            .map(|HmrChunkWithContent { path, content }| {
                let path = path.clone();
                let content = *content;
                async move {
                    let version = content.version().into_trait_ref().await?;
                    anyhow::Ok((path, version))
                }
            })
            .try_join()
            .await?
            .into_iter()
            .collect();
        Ok(Self { versions }.cell())
    }
}

/// Aggregates per-entry HMR instructions into a single combined `ChunkListUpdate`.
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

    pub fn build(self, to: TraitRef<Box<dyn Version>>) -> Update {
        Update::Partial(PartialUpdate {
            to,
            instruction: ChunkListUpdate {
                chunks: self.chunks,
                merged: self.merged.into_iter().collect(),
            }
            .into_instruction(),
        })
    }
}

/// Per-chunk [`Update`]s computed against an `AggregateHmrVersion` snapshot.
/// `has_new_chunks` is true when the current snapshot contains chunks absent
/// from `from` (e.g. a new endpoint was written); callers decide whether that
/// affects the batch shape.
pub struct DiffResult {
    pub chunk_updates: Vec<(RcStr, ReadRef<Update>)>,
    pub has_new_chunks: bool,
}

/// Diffs each chunk against the [`AggregateHmrVersion`] held by `from`.
///
/// If `from` holds some other kind of `Version`, there's nothing meaningful to
/// diff against, so this returns no updates and leaves it to the caller to
/// decide what to do.
pub async fn diff_chunks_against(
    chunks: &[HmrChunkWithContent],
    from: Vc<VersionState>,
) -> Result<DiffResult> {
    if chunks.is_empty() {
        return Ok(DiffResult {
            chunk_updates: Vec::new(),
            has_new_chunks: false,
        });
    }
    let from_resolved = from.get().to_resolved().await?;
    let Some(from_aggregate) = ResolvedVc::try_downcast_type::<AggregateHmrVersion>(from_resolved)
    else {
        return Ok(DiffResult {
            chunk_updates: Vec::new(),
            has_new_chunks: false,
        });
    };
    let from_aggregate = from_aggregate.await?;

    let mut has_new_chunks = false;
    let chunk_updates = chunks
        .iter()
        .filter_map(|HmrChunkWithContent { path, content }| {
            let Some(prev) = from_aggregate.versions.get(path).cloned() else {
                has_new_chunks = true;
                return None;
            };
            Some((path.clone(), *content, TraitRef::cell(prev)))
        })
        .map(async |(path, content, prev)| {
            let update = content.update(prev).await?;
            anyhow::Ok((path, update))
        })
        .try_join()
        .await?;
    Ok(DiffResult {
        chunk_updates,
        has_new_chunks,
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
