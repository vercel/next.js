use std::io::Write;

use anyhow::{Result, bail};
use serde::{Deserialize, Serialize};
use smallvec::SmallVec;
use turbo_rcstr::rcstr;
use turbo_tasks::{
    NonLocalValue, ResolvedVc, TaskInput, TryJoinIterExt, Upcast, ValueToString, Vc,
    trace::TraceRawVcs,
};
use turbo_tasks_fs::{FileSystemPath, rope::Rope};
use turbopack_core::{
    chunk::{AsyncModuleInfo, ChunkItem, ChunkItemWithAsyncModuleInfo, ChunkingContext, ModuleId},
    code_builder::{Code, CodeBuilder},
    error::PrettyPrintError,
    issue::{IssueExt, IssueSeverity, StyledString, code_gen::CodeGenerationIssue},
    source_map::utils::fileify_source_map,
};

use crate::{
    EcmascriptModuleContent,
    references::async_module::{AsyncModuleOptions, OptionAsyncModuleOptions},
    runtime_functions::TURBOPACK_ASYNC_MODULE,
    utils::StringifyJs,
};

#[turbo_tasks::value(shared)]
#[derive(Default, Clone)]
pub struct EcmascriptChunkItemContent {
    pub inner_code: Rope,
    pub source_map: Option<Rope>,
    pub additional_ids: SmallVec<[ResolvedVc<ModuleId>; 1]>,
    pub options: EcmascriptChunkItemOptions,
    pub rewrite_source_path: Option<FileSystemPath>,
    pub placeholder_for_future_extensions: (),
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItemContent {
    #[turbo_tasks::function]
    pub async fn new(
        content: Vc<EcmascriptModuleContent>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        async_module_options: Vc<OptionAsyncModuleOptions>,
    ) -> Result<Vc<Self>> {
        let externals = *chunking_context
            .environment()
            .supports_commonjs_externals()
            .await?;

        let content = content.await?;
        let async_module = async_module_options.owned().await?;
        let strict = content.strict;

        Ok(EcmascriptChunkItemContent {
            rewrite_source_path: if *chunking_context.should_use_file_source_map_uris().await? {
                Some(chunking_context.root_path().owned().await?)
            } else {
                None
            },
            inner_code: content.inner_code.clone(),
            source_map: content.source_map.clone(),
            additional_ids: content.additional_ids.clone(),
            options: if content.is_esm {
                EcmascriptChunkItemOptions {
                    strict: true,
                    externals,
                    async_module,
                    ..Default::default()
                }
            } else {
                if async_module.is_some() {
                    bail!("CJS module can't be async.");
                }

                EcmascriptChunkItemOptions {
                    strict,
                    externals,
                    // These things are not available in ESM
                    module_and_exports: true,
                    ..Default::default()
                }
            },
            ..Default::default()
        }
        .cell())
    }
}

impl EcmascriptChunkItemContent {
    async fn module_factory(&self) -> Result<ResolvedVc<Code>> {
        let mut code = CodeBuilder::default();
        for additional_id in self.additional_ids.iter().try_join().await? {
            writeln!(code, "{}, ", StringifyJs(&*additional_id))?;
        }
        if self.options.module_and_exports {
            code += "((__turbopack_context__, module, exports) => {\n";
        } else {
            code += "((__turbopack_context__) => {\n";
        }
        if self.options.strict {
            code += "\"use strict\";\n\n";
        } else {
            code += "\n";
        }

        if self.options.async_module.is_some() {
            writeln!(
                code,
                "return {TURBOPACK_ASYNC_MODULE}(async (__turbopack_handle_async_dependencies__, \
                 __turbopack_async_result__) => {{ try {{\n"
            )?;
        }

        let source_map = if let Some(rewrite_source_path) = &self.rewrite_source_path {
            fileify_source_map(self.source_map.as_ref(), rewrite_source_path.clone()).await?
        } else {
            self.source_map.clone()
        };

        code.push_source(&self.inner_code, source_map);

        if let Some(opts) = &self.options.async_module {
            write!(
                code,
                "__turbopack_async_result__();\n}} catch(e) {{ __turbopack_async_result__(e); }} \
                 }}, {});",
                opts.has_top_level_await
            )?;
        }

        code += "})";

        Ok(code.build().resolved_cell())
    }
}

#[derive(
    PartialEq, Eq, Default, Debug, Clone, Serialize, Deserialize, TraceRawVcs, NonLocalValue,
)]
pub struct EcmascriptChunkItemOptions {
    /// Whether this chunk item should be in "use strict" mode.
    pub strict: bool,
    /// Whether this chunk item's module factory should include a `module` and
    /// `exports` argument.
    pub module_and_exports: bool,
    /// Whether this chunk item's module factory should include a
    /// `__turbopack_external_require__` argument.
    pub externals: bool,
    /// Whether this chunk item's module is async (either has a top level await
    /// or is importing async modules).
    pub async_module: Option<AsyncModuleOptions>,
    pub placeholder_for_future_extensions: (),
}

#[derive(
    Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Hash, TraceRawVcs, TaskInput, NonLocalValue,
)]
pub struct EcmascriptChunkItemWithAsyncInfo {
    pub chunk_item: ResolvedVc<Box<dyn EcmascriptChunkItem>>,
    pub async_info: Option<ResolvedVc<AsyncModuleInfo>>,
}

impl EcmascriptChunkItemWithAsyncInfo {
    pub fn from_chunk_item(
        chunk_item: &ChunkItemWithAsyncModuleInfo,
    ) -> Result<EcmascriptChunkItemWithAsyncInfo> {
        let ChunkItemWithAsyncModuleInfo {
            chunk_item,
            module: _,
            async_info,
        } = chunk_item;
        let Some(chunk_item) =
            ResolvedVc::try_downcast::<Box<dyn EcmascriptChunkItem>>(*chunk_item)
        else {
            bail!("Chunk item is not an ecmascript chunk item but reporting chunk type ecmascript");
        };
        Ok(EcmascriptChunkItemWithAsyncInfo {
            chunk_item,
            async_info: *async_info,
        })
    }
}

#[turbo_tasks::value_trait]
pub trait EcmascriptChunkItem: ChunkItem {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<EcmascriptChunkItemContent>;
    #[turbo_tasks::function]
    fn content_with_async_module_info(
        self: Vc<Self>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Vc<EcmascriptChunkItemContent> {
        self.content()
    }

    /// Specifies which availability information the chunk item needs for code
    /// generation
    #[turbo_tasks::function]
    fn need_async_module_info(self: Vc<Self>) -> Vc<bool> {
        Vc::cell(false)
    }
}

pub trait EcmascriptChunkItemExt {
    /// Generates the module factory for this chunk item.
    fn code(self: Vc<Self>, async_module_info: Option<Vc<AsyncModuleInfo>>) -> Vc<Code>;
}

impl<T> EcmascriptChunkItemExt for T
where
    T: Upcast<Box<dyn EcmascriptChunkItem>>,
{
    /// Generates the module factory for this chunk item.
    fn code(self: Vc<Self>, async_module_info: Option<Vc<AsyncModuleInfo>>) -> Vc<Code> {
        module_factory_with_code_generation_issue(Vc::upcast_non_strict(self), async_module_info)
    }
}

#[turbo_tasks::function]
async fn module_factory_with_code_generation_issue(
    chunk_item: Vc<Box<dyn EcmascriptChunkItem>>,
    async_module_info: Option<Vc<AsyncModuleInfo>>,
) -> Result<Vc<Code>> {
    let content = match chunk_item
        .content_with_async_module_info(async_module_info)
        .await
    {
        Ok(item) => item.module_factory().await,
        Err(err) => Err(err),
    };
    Ok(match content {
        Ok(factory) => *factory,
        Err(error) => {
            let id = chunk_item.asset_ident().to_string().await;
            let id = id.as_ref().map_or_else(|_| "unknown", |id| &**id);
            let error = error.context(format!(
                "An error occurred while generating the chunk item {id}"
            ));
            let error_message = format!("{}", PrettyPrintError(&error)).into();
            let js_error_message = serde_json::to_string(&error_message)?;
            CodeGenerationIssue {
                severity: IssueSeverity::Error,
                path: chunk_item.asset_ident().path().owned().await?,
                title: StyledString::Text(rcstr!("Code generation for chunk item errored"))
                    .resolved_cell(),
                message: StyledString::Text(error_message).resolved_cell(),
            }
            .resolved_cell()
            .emit();
            let mut code = CodeBuilder::default();
            code += "(() => {{\n\n";
            writeln!(code, "throw new Error({error});", error = &js_error_message)?;
            code += "\n}})";
            code.build().cell()
        }
    })
}
