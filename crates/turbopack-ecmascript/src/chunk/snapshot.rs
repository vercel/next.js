use std::{fmt::Write, io::Write as _, slice::Iter};

use anyhow::Result;
use turbo_tasks::{primitives::StringVc, TryJoinIterExt, ValueToString};
use turbo_tasks_fs::rope::Rope;
use turbo_tasks_hash::hash_xxh3_hash64;
use turbopack_core::{
    chunk::{ChunkItem, ModuleId, ModuleIdReadRef},
    code_builder::{Code, CodeBuilder, CodeReadRef, CodeVc},
    issue::{code_gen::CodeGenerationIssue, IssueSeverity},
};

use super::{item::EcmascriptChunkItemVc, module_factory::module_factory, EcmascriptChunkItem};

#[turbo_tasks::value(transparent)]
pub(super) struct EcmascriptChunkContentEntries(pub(super) Vec<EcmascriptChunkContentEntryVc>);

#[turbo_tasks::value_impl]
impl EcmascriptChunkContentEntriesVc {
    #[turbo_tasks::function]
    pub async fn snapshot(self) -> Result<EcmascriptChunkContentEntriesSnapshotVc> {
        Ok(EcmascriptChunkContentEntriesSnapshot::List(
            self.await?.iter().copied().try_join().await?,
        )
        .cell())
    }
}

/// This is a snapshot of a list of EcmascriptChunkContentEntry represented as
/// tree of ReadRefs.
///
/// A tree is used instead of a plain Vec to allow to reused cached parts of the
/// list when it only a few elements have changed
#[turbo_tasks::value(serialization = "none", shared)]
pub(super) enum EcmascriptChunkContentEntriesSnapshot {
    List(Vec<EcmascriptChunkContentEntryReadRef>),
    Nested(Vec<EcmascriptChunkContentEntriesSnapshotReadRef>),
}

impl EcmascriptChunkContentEntriesSnapshot {
    pub(super) fn iter(&self) -> EcmascriptChunkContentEntriesSnapshotIterator {
        match self {
            EcmascriptChunkContentEntriesSnapshot::List(l) => {
                EcmascriptChunkContentEntriesSnapshotIterator::List(l.iter())
            }
            EcmascriptChunkContentEntriesSnapshot::Nested(n) => {
                let mut it = n.iter();
                if let Some(inner) = it.next() {
                    EcmascriptChunkContentEntriesSnapshotIterator::Nested(
                        Box::new(inner.iter()),
                        it,
                    )
                } else {
                    EcmascriptChunkContentEntriesSnapshotIterator::Empty
                }
            }
        }
    }
}

impl<'a> IntoIterator for &'a EcmascriptChunkContentEntriesSnapshot {
    type Item = &'a EcmascriptChunkContentEntryReadRef;

    type IntoIter = EcmascriptChunkContentEntriesSnapshotIterator<'a>;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

pub(super) enum EcmascriptChunkContentEntriesSnapshotIterator<'a> {
    Empty,
    List(Iter<'a, EcmascriptChunkContentEntryReadRef>),
    Nested(
        Box<EcmascriptChunkContentEntriesSnapshotIterator<'a>>,
        Iter<'a, EcmascriptChunkContentEntriesSnapshotReadRef>,
    ),
}

impl<'a> Iterator for EcmascriptChunkContentEntriesSnapshotIterator<'a> {
    type Item = &'a EcmascriptChunkContentEntryReadRef;

    fn next(&mut self) -> Option<Self::Item> {
        match self {
            EcmascriptChunkContentEntriesSnapshotIterator::Empty => None,
            EcmascriptChunkContentEntriesSnapshotIterator::List(i) => i.next(),
            EcmascriptChunkContentEntriesSnapshotIterator::Nested(inner, i) => loop {
                if let Some(r) = inner.next() {
                    return Some(r);
                }
                if let Some(new) = i.next() {
                    **inner = new.iter();
                } else {
                    return None;
                }
            },
        }
    }
}

#[turbo_tasks::value(serialization = "none")]
pub(super) struct EcmascriptChunkContentEntry {
    pub chunk_item: EcmascriptChunkItemVc,
    pub id: ModuleIdReadRef,
    pub code: CodeReadRef,
    pub code_vc: CodeVc,
    pub hash: u64,
}

impl EcmascriptChunkContentEntry {
    pub fn id(&self) -> &ModuleId {
        &self.id
    }

    pub fn code(&self) -> &Code {
        &self.code
    }

    pub fn source_code(&self) -> &Rope {
        self.code.source_code()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkContentEntryVc {
    #[turbo_tasks::function]
    pub async fn new(chunk_item: EcmascriptChunkItemVc) -> Result<Self> {
        let content = chunk_item.content();
        let factory = match module_factory(content).resolve().await {
            Ok(factory) => factory,
            Err(error) => {
                let id = chunk_item.id().to_string().await;
                let id = id.as_ref().map_or_else(|_| "unknown", |id| &**id);
                let mut error_message =
                    format!("An error occurred while generating the chunk item {}", id);
                for err in error.chain() {
                    write!(error_message, "\n  at {}", err)?;
                }
                let js_error_message = serde_json::to_string(&error_message)?;
                let issue = CodeGenerationIssue {
                    severity: IssueSeverity::Error.cell(),
                    path: chunk_item.asset_ident().path(),
                    title: StringVc::cell("Code generation for chunk item errored".to_string()),
                    message: StringVc::cell(error_message),
                }
                .cell();
                issue.as_issue().emit();
                let mut code = CodeBuilder::default();
                code += "(() => {{\n\n";
                writeln!(code, "throw new Error({error});", error = &js_error_message)?;
                code += "\n}})";
                code.build().cell()
            }
        };
        let id = chunk_item.id().await?;
        let code = factory.await?;
        let hash = hash_xxh3_hash64(code.source_code());
        Ok(EcmascriptChunkContentEntry {
            chunk_item,
            id,
            code,
            code_vc: factory,
            hash,
        }
        .cell())
    }
}
