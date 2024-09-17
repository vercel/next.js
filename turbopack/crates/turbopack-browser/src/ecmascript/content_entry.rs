use std::io::Write as _;

use anyhow::Result;
use indexmap::IndexMap;
use tracing::{info_span, Instrument};
use turbo_tasks::{ReadRef, TryJoinIterExt, ValueToString, Vc};
use turbopack_core::{
    chunk::{AsyncModuleInfo, ChunkItem, ChunkItemExt, ModuleId},
    code_builder::{Code, CodeBuilder},
    error::PrettyPrintError,
    issue::{code_gen::CodeGenerationIssue, IssueExt, IssueSeverity, StyledString},
};
use turbopack_ecmascript::chunk::{
    EcmascriptChunkContent, EcmascriptChunkItem, EcmascriptChunkItemExt,
};

/// A chunk item's content entry.
///
/// Instead of storing the [`Vc<Box<dyn EcmascriptChunkItem>>`] itself from
/// which `code` and `hash` are derived, we store `Vc`s directly. This avoids
/// creating tasks in a hot loop when iterating over thousands of entries when
/// computing updates.
#[turbo_tasks::value]
#[derive(Debug)]
pub struct EcmascriptDevChunkContentEntry {
    pub code: Vc<Code>,
    pub hash: Vc<u64>,
}

impl EcmascriptDevChunkContentEntry {
    pub async fn new(
        chunk_item: Vc<Box<dyn EcmascriptChunkItem>>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Self> {
        let code = chunk_item.code(async_module_info).resolve().await?;
        Ok(EcmascriptDevChunkContentEntry {
            code,
            hash: code.source_code_hash().resolve().await?,
        })
    }
}

#[turbo_tasks::value(transparent)]
pub struct EcmascriptDevChunkContentEntries(
    IndexMap<ReadRef<ModuleId>, EcmascriptDevChunkContentEntry>,
);

#[turbo_tasks::value_impl]
impl EcmascriptDevChunkContentEntries {
    #[turbo_tasks::function]
    pub async fn new(
        chunk_content: Vc<EcmascriptChunkContent>,
    ) -> Result<Vc<EcmascriptDevChunkContentEntries>> {
        let chunk_content = chunk_content.await?;

        let entries: IndexMap<_, _> = chunk_content
            .chunk_items
            .iter()
            .map(|&(chunk_item, async_module_info)| async move {
                async move {
                    Ok((
                        chunk_item.id().await?,
                        EcmascriptDevChunkContentEntry::new(chunk_item, async_module_info).await?,
                    ))
                }
                .instrument(info_span!(
                    "chunk item",
                    name = display(chunk_item.asset_ident().to_string().await?)
                ))
                .await
            })
            .try_join()
            .await?
            .into_iter()
            .collect();

        Ok(Vc::cell(entries))
    }
}

#[turbo_tasks::function]
async fn item_code(
    item: Vc<Box<dyn EcmascriptChunkItem>>,
    async_module_info: Option<Vc<AsyncModuleInfo>>,
) -> Result<Vc<Code>> {
    Ok(
        match item
            .content_with_async_module_info(async_module_info)
            .module_factory()
            .resolve()
            .await
        {
            Ok(factory) => factory,
            Err(error) => {
                let id = item.id().to_string().await;
                let id = id.as_ref().map_or_else(|_| "unknown", |id| &**id);
                let error = error.context(format!(
                    "An error occurred while generating the chunk item {}",
                    id
                ));
                let error_message = format!("{}", PrettyPrintError(&error));
                let js_error_message = serde_json::to_string(&error_message)?;
                CodeGenerationIssue {
                    severity: IssueSeverity::Error.cell(),
                    path: item.asset_ident().path(),
                    title: StyledString::Text("Code generation for chunk item errored".into())
                        .cell(),
                    message: StyledString::Text(error_message.into()).cell(),
                }
                .cell()
                .emit();
                let mut code = CodeBuilder::default();
                code += "(() => {{\n\n";
                writeln!(code, "throw new Error({error});", error = &js_error_message)?;
                code += "\n}})";
                code.build().cell()
            }
        },
    )
}
