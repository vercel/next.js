use std::io::Write;

use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use turbo_tasks::{trace::TraceRawVcs, ResolvedVc, Upcast, ValueToString, Vc};
use turbo_tasks_fs::{rope::Rope, FileSystemPath};
use turbopack_core::{
    chunk::{AsyncModuleInfo, ChunkItem, ChunkItemExt, ChunkingContext},
    code_builder::{fileify_source_map, Code, CodeBuilder},
    error::PrettyPrintError,
    issue::{code_gen::CodeGenerationIssue, IssueExt, IssueSeverity, StyledString},
    source_map::GenerateSourceMap,
};

use crate::{
    references::async_module::{AsyncModuleOptions, OptionAsyncModuleOptions},
    utils::FormatIter,
    EcmascriptModuleContent, EcmascriptOptions,
};

#[turbo_tasks::value(shared)]
#[derive(Default, Clone)]
pub struct EcmascriptChunkItemContent {
    pub inner_code: Rope,
    pub source_map: Option<Vc<Box<dyn GenerateSourceMap>>>,
    pub options: EcmascriptChunkItemOptions,
    pub rewrite_source_path: Option<ResolvedVc<FileSystemPath>>,
    pub placeholder_for_future_extensions: (),
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItemContent {
    #[turbo_tasks::function]
    pub async fn new(
        content: Vc<EcmascriptModuleContent>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        options: Vc<EcmascriptOptions>,
        async_module_options: Vc<OptionAsyncModuleOptions>,
    ) -> Result<Vc<Self>> {
        let refresh = options.await?.refresh;
        let externals = *chunking_context
            .environment()
            .supports_commonjs_externals()
            .await?;

        let content = content.await?;
        let async_module = async_module_options.await?.clone_value();

        Ok(EcmascriptChunkItemContent {
            rewrite_source_path: if *chunking_context.should_use_file_source_map_uris().await? {
                Some(chunking_context.context_path().to_resolved().await?)
            } else {
                None
            },
            inner_code: content.inner_code.clone(),
            source_map: content.source_map,
            options: if content.is_esm {
                EcmascriptChunkItemOptions {
                    strict: true,
                    refresh,
                    externals,
                    async_module,
                    stub_require: true,
                    ..Default::default()
                }
            } else {
                if async_module.is_some() {
                    bail!("CJS module can't be async.");
                }

                EcmascriptChunkItemOptions {
                    refresh,
                    externals,
                    // These things are not available in ESM
                    module: true,
                    exports: true,
                    this: true,
                    ..Default::default()
                }
            },
            ..Default::default()
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub async fn module_factory(&self) -> Result<Vc<Code>> {
        let mut args = vec![
            "r: __turbopack_require__",
            "f: __turbopack_module_context__",
            "i: __turbopack_import__",
            "s: __turbopack_esm__",
            "v: __turbopack_export_value__",
            "n: __turbopack_export_namespace__",
            "c: __turbopack_cache__",
            "M: __turbopack_modules__",
            "l: __turbopack_load__",
            "j: __turbopack_dynamic__",
            "P: __turbopack_resolve_absolute_path__",
            "U: __turbopack_relative_url__",
            "R: __turbopack_resolve_module_id_path__",
            "b: __turbopack_worker_blob_url__",
            "g: global",
            // HACK
            "__dirname",
        ];
        if self.options.async_module.is_some() {
            args.push("a: __turbopack_async_module__");
        }
        if self.options.externals {
            args.push("x: __turbopack_external_require__");
            args.push("y: __turbopack_external_import__");
        }
        if self.options.refresh {
            args.push("k: __turbopack_refresh__");
        }
        if self.options.module || self.options.refresh {
            args.push("m: module");
        }
        if self.options.exports {
            args.push("e: exports");
        }
        if self.options.stub_require {
            args.push("z: __turbopack_require_stub__");
        } else {
            args.push("t: __turbopack_require_real__");
        }
        if self.options.wasm {
            args.push("w: __turbopack_wasm__");
            args.push("u: __turbopack_wasm_module__");
        }
        let mut code = CodeBuilder::default();
        let args = FormatIter(|| args.iter().copied().intersperse(", "));
        if self.options.this {
            code += "(function(__turbopack_context__) {\n";
        } else {
            code += "((__turbopack_context__) => {\n";
        }
        if self.options.strict {
            code += "\"use strict\";\n\n";
        } else {
            code += "\n";
        }
        writeln!(code, "var {{ {} }} = __turbopack_context__;", args)?;

        if self.options.async_module.is_some() {
            code += "__turbopack_async_module__(async (__turbopack_handle_async_dependencies__, \
                     __turbopack_async_result__) => { try {\n";
        } else {
            code += "{\n";
        }

        let source_map = if let Some(rewrite_source_path) = self.rewrite_source_path {
            let source_map = self.source_map.map(|m| m.generate_source_map());
            match source_map {
                Some(map) => fileify_source_map(map, *rewrite_source_path)
                    .await?
                    .map(|v| *v)
                    .map(Vc::upcast),
                None => None,
            }
        } else {
            self.source_map
        };

        code.push_source(&self.inner_code, source_map);

        if let Some(opts) = &self.options.async_module {
            write!(
                code,
                "__turbopack_async_result__();\n}} catch(e) {{ __turbopack_async_result__(e); }} \
                 }}, {});",
                opts.has_top_level_await
            )?;
        } else {
            code += "}";
        }

        code += "})";
        Ok(code.build().cell())
    }
}

#[derive(PartialEq, Eq, Default, Debug, Clone, Serialize, Deserialize, TraceRawVcs)]
pub struct EcmascriptChunkItemOptions {
    /// Whether this chunk item should be in "use strict" mode.
    pub strict: bool,
    /// Whether this chunk item's module factory should include a
    /// `__turbopack_refresh__` argument.
    pub refresh: bool,
    /// Whether this chunk item's module factory should include a `module`
    /// argument.
    pub module: bool,
    /// Whether this chunk item's module factory should include an `exports`
    /// argument.
    pub exports: bool,
    /// Whether this chunk item's module factory should include an argument for a throwing require
    /// stub (for ESM)
    pub stub_require: bool,
    /// Whether this chunk item's module factory should include a
    /// `__turbopack_external_require__` argument.
    pub externals: bool,
    /// Whether this chunk item's module is async (either has a top level await
    /// or is importing async modules).
    pub async_module: Option<AsyncModuleOptions>,
    pub this: bool,
    /// Whether this chunk item's module factory should include
    /// `__turbopack_wasm__` to load WebAssembly.
    pub wasm: bool,
    pub placeholder_for_future_extensions: (),
}

#[turbo_tasks::value_trait]
pub trait EcmascriptChunkItem: ChunkItem {
    fn content(self: Vc<Self>) -> Vc<EcmascriptChunkItemContent>;
    fn content_with_async_module_info(
        self: Vc<Self>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Vc<EcmascriptChunkItemContent> {
        self.content()
    }
    fn chunking_context(self: Vc<Self>) -> Vc<Box<dyn ChunkingContext>>;

    /// Specifies which availablility information the chunk item needs for code
    /// generation
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
        module_factory_with_code_generation_issue(Vc::upcast(self), async_module_info)
    }
}

#[turbo_tasks::function]
async fn module_factory_with_code_generation_issue(
    chunk_item: Vc<Box<dyn EcmascriptChunkItem>>,
    async_module_info: Option<Vc<AsyncModuleInfo>>,
) -> Result<Vc<Code>> {
    Ok(
        match chunk_item
            .content_with_async_module_info(async_module_info)
            .module_factory()
            .resolve()
            .await
        {
            Ok(factory) => factory,
            Err(error) => {
                let id = chunk_item.id().to_string().await;
                let id = id.as_ref().map_or_else(|_| "unknown", |id| &**id);
                let error = error.context(format!(
                    "An error occurred while generating the chunk item {}",
                    id
                ));
                let error_message = format!("{}", PrettyPrintError(&error)).into();
                let js_error_message = serde_json::to_string(&error_message)?;
                CodeGenerationIssue {
                    severity: IssueSeverity::Error.resolved_cell(),
                    path: chunk_item.asset_ident().path().to_resolved().await?,
                    title: StyledString::Text("Code generation for chunk item errored".into())
                        .resolved_cell(),
                    message: StyledString::Text(error_message).resolved_cell(),
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
