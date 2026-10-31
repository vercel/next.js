use std::io::Write;

use anyhow::Result;
use either::Either;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc, turbobail};
use turbo_tasks_fs::{File, FileContent};
use turbopack_core::{
    asset::AssetContent,
    chunk::{ChunkingContext, MinifyType, ModuleId},
    code_builder::{Code, CodeBuilder},
    output::OutputAsset,
    source_map::{GenerateSourceMap, SourceMapAsset},
    version::{MergeableVersionedContent, Version, VersionedContent, VersionedContentMerger},
};
use turbopack_ecmascript::{
    chunk::{
        CodeModuleIdAndPath, EcmascriptChunkContent, EcmascriptChunkContentEntries,
        StrictFactoryMode, strict_chunk_wrapper, strict_factory_mode, write_module_factories,
    },
    hmr::{
        EcmascriptHmrChunkContent, merger::EcmascriptChunkContentMerger,
        version::EcmascriptChunkVersion,
    },
    minify::minify,
    utils::StringifyJs,
};

use super::chunk::EcmascriptBrowserChunk;
use crate::{
    BrowserChunkingContext,
    chunking_context::{CURRENT_CHUNK_METHOD_DOCUMENT_CURRENT_SCRIPT_EXPR, CurrentChunkMethod},
};

#[turbo_tasks::value(serialization = "skip")]
pub struct EcmascriptBrowserChunkContent {
    pub(super) chunking_context: ResolvedVc<BrowserChunkingContext>,
    pub(super) chunk: ResolvedVc<EcmascriptBrowserChunk>,
    pub(super) content: ResolvedVc<EcmascriptChunkContent>,
    pub(super) source_map: ResolvedVc<SourceMapAsset>,
}

#[turbo_tasks::value_impl]
impl EcmascriptBrowserChunkContent {
    #[turbo_tasks::function]
    pub(crate) fn new(
        chunking_context: ResolvedVc<BrowserChunkingContext>,
        chunk: ResolvedVc<EcmascriptBrowserChunk>,
        content: ResolvedVc<EcmascriptChunkContent>,
        source_map: ResolvedVc<SourceMapAsset>,
    ) -> Result<Vc<Self>> {
        Ok(EcmascriptBrowserChunkContent {
            chunking_context,
            chunk,
            content,
            source_map,
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub(crate) async fn code(self: Vc<Self>) -> Result<Vc<Code>> {
        let this = self.await?;
        let source_maps = *this
            .chunking_context
            .reference_chunk_source_maps(*ResolvedVc::upcast(this.chunk))
            .await?;
        // Lifetime hack to pull out the var into this scope
        let chunk_path;
        let script_or_path = match *this.chunking_context.current_chunk_method().await? {
            CurrentChunkMethod::StringLiteral => {
                let output_root = this.chunking_context.output_root().await?;
                let chunk_path_vc = this.chunk.path();
                chunk_path = chunk_path_vc.await?;
                let chunk_server_path = if let Some(path) = output_root.get_path_to(&chunk_path) {
                    path
                } else {
                    turbobail!("chunk path {chunk_path} is not in output root {output_root}");
                };
                Either::Left(StringifyJs(chunk_server_path))
            }
            CurrentChunkMethod::DocumentCurrentScript => {
                Either::Right(CURRENT_CHUNK_METHOD_DOCUMENT_CURRENT_SCRIPT_EXPR)
            }
        };
        let code = CodeBuilder::new(
            source_maps,
            *this.chunking_context.debug_ids_enabled().await?,
        );

        let supports_arrow_functions = *this
            .chunking_context
            .environment()
            .runtime_versions()
            .supports_arrow_functions()
            .await?;
        let content = this.content.await?;
        let chunk_items = content.chunk_item_code_module_ids_and_paths().await?;
        let chunk_loading_global = this.chunking_context.chunk_loading_global().await?;
        Ok(browser_chunk_code(
            code,
            &chunk_items,
            supports_arrow_functions,
            *this.chunking_context.minify_type().await?,
            source_maps,
            &chunk_loading_global,
            script_or_path,
        )?
        .cell())
    }

    #[turbo_tasks::function]
    pub(crate) async fn has_source_map(self: Vc<Self>) -> Result<Vc<bool>> {
        Ok(Vc::cell(self.code().await?.has_source_map()))
    }
}

#[turbo_tasks::value_impl]
impl VersionedContent for EcmascriptBrowserChunkContent {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        let this = self.await?;

        Ok(AssetContent::file(
            FileContent::Content(File::from(
                self.code()
                    .to_rope_with_magic_comments(|| *this.source_map)
                    .await?,
            ))
            .cell(),
        ))
    }

    #[turbo_tasks::function]
    fn version(self: Vc<Self>) -> Vc<Box<dyn Version>> {
        Vc::upcast(self.ecmascript_chunk_version())
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptHmrChunkContent for EcmascriptBrowserChunkContent {
    #[turbo_tasks::function]
    fn entries(&self) -> Vc<EcmascriptChunkContentEntries> {
        EcmascriptChunkContentEntries::new(*self.content)
    }

    #[turbo_tasks::function]
    async fn ecmascript_chunk_version(&self) -> Result<Vc<EcmascriptChunkVersion>> {
        Ok(EcmascriptChunkVersion::new(
            self.chunking_context.output_root().owned().await?,
            self.chunk.path().owned().await?,
            *self.content,
            *self.chunking_context.minify_type().await?,
        ))
    }
}

#[turbo_tasks::value_impl]
impl MergeableVersionedContent for EcmascriptBrowserChunkContent {
    #[turbo_tasks::function]
    fn get_merger(&self) -> Vc<Box<dyn VersionedContentMerger>> {
        Vc::upcast(EcmascriptChunkContentMerger::new())
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for EcmascriptBrowserChunkContent {
    #[turbo_tasks::function]
    fn generate_source_map(self: Vc<Self>) -> Vc<FileContent> {
        self.code().generate_source_map()
    }

    #[turbo_tasks::function]
    fn native_test_import_coverage_roles(self: Vc<Self>) -> Vc<FileContent> {
        self.code().native_test_import_coverage_roles()
    }

    #[turbo_tasks::function]
    async fn by_section(self: Vc<Self>, section: RcStr) -> Result<Vc<FileContent>> {
        // Weirdly, the ContentSource will have already URL decoded the ModuleId, and we
        // can't reparse that via serde.
        if let Ok(id) = ModuleId::parse(&section) {
            let entries = self.entries().await?;
            for (entry_id, entry) in entries.iter() {
                if id == *entry_id {
                    let sm = entry.code.generate_source_map();
                    return Ok(sm);
                }
            }
        }

        Ok(FileContent::NotFound.cell())
    }
}

fn browser_chunk_code(
    mut code: CodeBuilder,
    chunk_items: &[CodeModuleIdAndPath],
    supports_arrow_functions: bool,
    minify_type: MinifyType,
    source_maps: bool,
    chunk_loading_global: &str,
    script_or_path: impl std::fmt::Display,
) -> Result<Code> {
    // As in the Node writer, keep each factory's strictness when minifying a
    // mixed script: the optimizer can inline the strict IIFE and lose its mode.
    let strict_factory_mode = match (
        strict_factory_mode(chunk_items, supports_arrow_functions),
        minify_type,
    ) {
        (StrictFactoryMode::Mixed, MinifyType::Minify { .. }) => StrictFactoryMode::Flat,
        (mode, _) => mode,
    };
    let strict_chunk_wrapper = strict_chunk_wrapper(strict_factory_mode, supports_arrow_functions);
    if let Some((prefix, _)) = strict_chunk_wrapper {
        code += prefix;
    }
    // Keep the same classic-script registration shape as the Browser chunk loader.
    write!(
        code,
        r#"(globalThis[{chunk_loading_global}] || (globalThis[{chunk_loading_global}] = [])).push([{script_or_path},"#,
        chunk_loading_global = StringifyJs(chunk_loading_global),
    )?;
    write_module_factories(
        &mut code,
        chunk_items,
        strict_factory_mode,
        supports_arrow_functions,
    )?;
    write!(code, "\n]);")?;
    if let Some((_, suffix)) = strict_chunk_wrapper {
        code += suffix;
    }
    let mut code = code.build();
    if let MinifyType::Minify { mangle } = minify_type {
        code = minify(code, source_maps, mangle)?;
    }
    Ok(code)
}

#[cfg(test)]
mod strict_browser_writer_tests {
    use std::io::Write;

    use turbo_tasks::ReadRef;
    use turbopack_core::{
        chunk::{MangleType, MinifyType, ModuleId},
        code_builder::CodeBuilder,
    };
    use turbopack_ecmascript::chunk::CodeModuleIdAndPath;

    use crate::ecmascript::content::browser_chunk_code;

    fn factories(
        strict_count: usize,
        sloppy_count: usize,
        arrows: bool,
    ) -> Vec<CodeModuleIdAndPath> {
        (0..strict_count + sloppy_count)
            .map(|index| {
                let strict = index < strict_count;
                let mut code = CodeBuilder::new(false, false);
                let prefix = if arrows {
                    "(emit)=>{"
                } else {
                    "function(emit){"
                };
                write!(code, "{prefix}").expect("factory prefix");
                if strict {
                    write!(code, "\"use strict\";").expect("factory directive");
                }
                write!(
                    code,
                    "emit(function(...args){{return [this,args.length]}})}}"
                )
                .expect("authored callable");
                CodeModuleIdAndPath {
                    id: ModuleId::Number(index as u64 + 1),
                    path: format!("browser-factory-{index}").into(),
                    strict,
                    code: ReadRef::new_owned(code.build()),
                }
            })
            .collect()
    }

    fn assert_runtime(text: &str, strict_count: usize, sloppy_count: usize) {
        let script = format!(
            r#"
const vm = require('node:vm');
const context = vm.createContext({{}});
vm.runInContext({}, context);
const rows = vm.runInContext(`(() => {{
  const rows = [];
  function register(values) {{
    for (let index = 0; index < values.length;) {{
      if (Array.isArray(values[index])) {{ register(values[index++]); continue; }}
      const id = values[index++], factory = values[index++];
      factory(fn => {{
        const value = Reflect.apply(fn, undefined, [7, 9]);
        rows[id - 1] = [value[0] === undefined, value[0] === globalThis, value[1]];
      }});
    }}
  }}
  register(TURBOPACK[0].slice(1));
  return rows;
}})()`, context);
process.stdout.write(JSON.stringify(rows));
"#,
            serde_json::to_string(text).expect("actual Browser script")
        );
        let output = std::process::Command::new("node")
            .args(["-e", &script])
            .output()
            .expect("execute actual emitted Browser factories");
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        let actual: serde_json::Value =
            serde_json::from_slice(&output.stdout).expect("actual receiver rows");
        let expected = (0..strict_count + sloppy_count)
            .map(|index| serde_json::json!([index < strict_count, index >= strict_count, 2]))
            .collect::<Vec<_>>();
        assert_eq!(
            actual,
            serde_json::json!(expected),
            "actual Browser writer/minifier lost strictness: {text}"
        );
    }

    fn check(strict_count: usize, sloppy_count: usize, arrows: bool, expected_directives: usize) {
        let items = factories(strict_count, sloppy_count, arrows);
        for mangle in [
            None,
            Some(MangleType::OptimalSize),
            Some(MangleType::Deterministic),
        ] {
            let code = browser_chunk_code(
                CodeBuilder::new(false, false),
                &items,
                arrows,
                MinifyType::Minify { mangle },
                false,
                "TURBOPACK",
                "\"browser-writer.js\"",
            )
            .expect("actual Browser chunk writer and minifier");
            let text = String::from_utf8(code.into_source_code().into_bytes().to_vec())
                .expect("actual emitted JavaScript");
            assert_runtime(&text, strict_count, sloppy_count);
            assert_eq!(
                text.matches("use strict").count(),
                expected_directives,
                "{text}"
            );
        }
    }

    #[test]
    fn flat_strict_arrow_factory() {
        check(1, 0, true, 1);
    }
    #[test]
    fn flat_strict_function_factory() {
        check(1, 0, false, 1);
    }
    #[test]
    fn ordinary_sloppy_factory() {
        check(0, 1, true, 0);
    }
    #[test]
    fn all_strict_arrow_factories() {
        check(2, 0, true, 1);
    }
    #[test]
    fn all_strict_function_factories() {
        check(3, 0, false, 1);
    }
    #[test]
    fn mixed_strict_and_sloppy_arrow_factories() {
        check(3, 1, true, 3);
    }
    #[test]
    fn mixed_strict_and_sloppy_function_factories() {
        check(3, 1, false, 3);
    }
    #[test]
    fn unminified_mixed_writer_retains_original_group_and_receivers() {
        let items = factories(3, 1, true);
        let code = browser_chunk_code(
            CodeBuilder::new(false, false),
            &items,
            true,
            MinifyType::NoMinify,
            false,
            "TURBOPACK",
            "\"browser-writer.js\"",
        )
        .expect("unminified Browser writer");
        let text = String::from_utf8(code.into_source_code().into_bytes().to_vec())
            .expect("actual emitted JavaScript");
        assert!(text.contains("(()=>{\"use strict\";return["));
        assert_eq!(text.matches("use strict").count(), 4);
        assert_runtime(&text, 3, 1);
    }
}
