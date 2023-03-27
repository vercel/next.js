use std::io::Write as _;

use anyhow::Result;
use indexmap::IndexMap;
use turbo_tasks::{
    primitives::{StringVc, U64Vc},
    TryJoinIterExt, Value, ValueToString,
};
use turbopack_core::{
    chunk::{availability_info::AvailabilityInfo, ChunkItem, ModuleIdReadRef},
    code_builder::{CodeBuilder, CodeVc},
    issue::{code_gen::CodeGenerationIssue, IssueSeverity},
};
use turbopack_ecmascript::chunk::{
    EcmascriptChunkContentVc, EcmascriptChunkItem, EcmascriptChunkItemVc,
};

use crate::ecmascript::module_factory::module_factory;

/// A chunk item's content entry.
///
/// Instead of storing the [`EcmascriptChunkItemVc`] itself from which `code`
/// and `hash` are derived, we store `Vc`s directly. This avoids creating tasks
/// in a hot loop when iterating over thousands of entries when computing
/// updates.
#[turbo_tasks::value]
#[derive(Debug)]
pub(super) struct EcmascriptDevChunkContentEntry {
    pub code: CodeVc,
    pub hash: U64Vc,
}

impl EcmascriptDevChunkContentEntry {
    pub async fn new(
        chunk_item: EcmascriptChunkItemVc,
        availability_info: AvailabilityInfo,
    ) -> Result<Self> {
        let code = item_code(chunk_item, Value::new(availability_info))
            .resolve()
            .await?;
        Ok(EcmascriptDevChunkContentEntry {
            code,
            hash: code.source_code_hash().resolve().await?,
        })
    }
}

#[turbo_tasks::value(transparent)]
pub(super) struct EcmascriptDevChunkContentEntries(
    IndexMap<ModuleIdReadRef, EcmascriptDevChunkContentEntry>,
);

#[turbo_tasks::value_impl]
impl EcmascriptDevChunkContentEntriesVc {
    #[turbo_tasks::function]
    pub async fn new(
        chunk_content: EcmascriptChunkContentVc,
    ) -> Result<EcmascriptDevChunkContentEntriesVc> {
        let chunk_content = chunk_content.await?;
        let availability_info = chunk_content.availability_info;

        let entries: IndexMap<_, _> = chunk_content
            .chunk_items
            .iter()
            .map(|chunk_item| async move {
                Ok((
                    chunk_item.id().await?,
                    EcmascriptDevChunkContentEntry::new(*chunk_item, availability_info).await?,
                ))
            })
            .try_join()
            .await?
            .into_iter()
            .collect();

        Ok(EcmascriptDevChunkContentEntriesVc::cell(entries))
    }
}

#[turbo_tasks::function]
async fn item_code(
    item: EcmascriptChunkItemVc,
    availability_info: Value<AvailabilityInfo>,
) -> Result<CodeVc> {
    use std::fmt::Write;

    Ok(
        match module_factory(item.content_with_availability_info(availability_info))
            .resolve()
            .await
        {
            Ok(factory) => factory,
            Err(error) => {
                let id = item.id().to_string().await;
                let id = id.as_ref().map_or_else(|_| "unknown", |id| &**id);
                let mut error_message =
                    format!("An error occurred while generating the chunk item {}", id);
                for err in error.chain() {
                    write!(error_message, "\n  at {}", err)?;
                }
                let js_error_message = serde_json::to_string(&error_message)?;
                let issue = CodeGenerationIssue {
                    severity: IssueSeverity::Error.cell(),
                    path: item.asset_ident().path(),
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
        },
    )
}
