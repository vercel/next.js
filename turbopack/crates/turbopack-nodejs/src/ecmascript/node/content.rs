use anyhow::Result;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{File, FileContent};
use turbopack_core::{
    asset::AssetContent,
    chunk::{ChunkingContext, MinifyType},
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
};

use super::chunk::EcmascriptBuildNodeChunk;
use crate::NodeJsChunkingContext;

#[turbo_tasks::value]
pub(super) struct EcmascriptNodeChunkContent {
    pub(super) content: ResolvedVc<EcmascriptChunkContent>,
    pub(super) chunking_context: ResolvedVc<NodeJsChunkingContext>,
    pub(super) chunk: ResolvedVc<EcmascriptBuildNodeChunk>,
    pub(super) source_map: ResolvedVc<SourceMapAsset>,
}

#[turbo_tasks::value_impl]
impl EcmascriptNodeChunkContent {
    #[turbo_tasks::function]
    pub(crate) fn new(
        chunking_context: ResolvedVc<NodeJsChunkingContext>,
        chunk: ResolvedVc<EcmascriptBuildNodeChunk>,
        content: ResolvedVc<EcmascriptChunkContent>,
        source_map: ResolvedVc<SourceMapAsset>,
    ) -> Vc<Self> {
        EcmascriptNodeChunkContent {
            content,
            chunking_context,
            chunk,
            source_map,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptNodeChunkContent {
    #[turbo_tasks::function]
    async fn code(&self) -> Result<Vc<Code>> {
        let source_maps = *self
            .chunking_context
            .reference_chunk_source_maps(*ResolvedVc::upcast(self.chunk))
            .await?;

        let code = CodeBuilder::new(true, *self.chunking_context.debug_ids_enabled().await?);
        let supports_arrow_functions = *self
            .chunking_context
            .environment()
            .runtime_versions()
            .supports_arrow_functions()
            .await?;
        let content = self.content.await?;
        let chunk_items = content.chunk_item_code_module_ids_and_paths().await?;
        let code = node_chunk_code(
            code,
            &chunk_items,
            supports_arrow_functions,
            *self.chunking_context.minify_type().await?,
            source_maps,
        )?;

        Ok(code.cell())
    }
}

fn node_chunk_code(
    mut code: CodeBuilder,
    chunk_items: &[CodeModuleIdAndPath],
    supports_arrow_functions: bool,
    minify_type: MinifyType,
    source_maps: bool,
) -> Result<Code> {
    use std::io::Write;
    // The minifier can inline the mixed strict IIFE and remove its directive. Keep each
    // factory's own strictness when the resulting chunk will be minified as a script.
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
    write!(code, "module.exports = [")?;
    write_module_factories(
        &mut code,
        chunk_items,
        strict_factory_mode,
        supports_arrow_functions,
    )?;
    write!(code, "\n];")?;
    if let Some((_, suffix)) = strict_chunk_wrapper {
        code += suffix;
    }

    let mut code = code.build();

    if let MinifyType::Minify { mangle } = minify_type {
        code = minify(code, source_maps, mangle)?;
    }
    Ok(code)
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for EcmascriptNodeChunkContent {
    #[turbo_tasks::function]
    fn native_test_import_coverage_roles(self: Vc<Self>) -> Vc<FileContent> {
        self.code().native_test_import_coverage_roles()
    }

    #[turbo_tasks::function]
    fn generate_source_map(self: Vc<Self>) -> Vc<FileContent> {
        self.code().generate_source_map()
    }
}

#[turbo_tasks::value_impl]
impl VersionedContent for EcmascriptNodeChunkContent {
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
impl EcmascriptHmrChunkContent for EcmascriptNodeChunkContent {
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
impl MergeableVersionedContent for EcmascriptNodeChunkContent {
    #[turbo_tasks::function]
    fn get_merger(&self) -> Vc<Box<dyn VersionedContentMerger>> {
        Vc::upcast(EcmascriptChunkContentMerger::new())
    }
}

#[cfg(test)]
mod strict_node_writer_tests {
    use std::io::Write;

    use turbo_tasks::ReadRef;
    use turbopack_core::{
        chunk::{MangleType, MinifyType, ModuleId},
        code_builder::CodeBuilder,
    };
    use turbopack_ecmascript::chunk::CodeModuleIdAndPath;

    use crate::ecmascript::node::content::node_chunk_code;

    fn factories(
        strict_count: usize,
        sloppy_count: usize,
        arrows: bool,
    ) -> Vec<CodeModuleIdAndPath> {
        (0..strict_count + sloppy_count)
            .map(|index| {
                let strict = index < strict_count;
                let mut code = CodeBuilder::new(true, false);
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
                    path: format!("owned-factory-{index}").into(),
                    strict,
                    code: ReadRef::new_owned(code.build()),
                }
            })
            .collect()
    }

    fn check(name: &str, strict_count: usize, sloppy_count: usize, arrows: bool, expected: usize) {
        let items = factories(strict_count, sloppy_count, arrows);
        let mut observations = Vec::new();
        for (mangle_name, mangle) in [
            ("none", None),
            ("optimal", Some(MangleType::OptimalSize)),
            ("deterministic", Some(MangleType::Deterministic)),
        ] {
            let code = node_chunk_code(
                CodeBuilder::new(true, false),
                &items,
                arrows,
                MinifyType::Minify { mangle },
                false,
            )
            .expect("actual Node chunk writer and minifier");
            let text = String::from_utf8(code.into_source_code().into_bytes().to_vec())
                .expect("emitted JavaScript");
            if let Some(directory) = std::env::var_os("NEXT_TEST_NODE_WRITER_DIAGNOSTIC_OUT") {
                std::fs::create_dir_all(&directory).expect("diagnostic directory");
                std::fs::write(
                    std::path::Path::new(&directory).join(format!("{name}-{mangle_name}.js")),
                    &text,
                )
                .expect("actual emitted writer output");
            }
            observations.push((mangle_name, text.matches("use strict").count(), text));
        }
        for (mangle, count, text) in observations {
            assert_eq!(count, expected, "{name}/{mangle}: {text}");
            if sloppy_count > 0 {
                assert!(
                    text.starts_with("module.exports="),
                    "{name}/{mangle}: {text}"
                );
            }
        }
    }

    #[test]
    fn flat_strict_arrow_factory() {
        check("flat-strict-arrow", 1, 0, true, 1);
    }

    #[test]
    fn flat_strict_function_factory() {
        check("flat-strict-function", 1, 0, false, 1);
    }

    #[test]
    fn ordinary_sloppy_factory() {
        check("ordinary-sloppy", 0, 1, true, 0);
    }

    #[test]
    fn all_strict_arrow_factories() {
        check("all-strict-arrow", 2, 0, true, 1);
    }

    #[test]
    fn all_strict_function_factories() {
        check("all-strict-function", 3, 0, false, 1);
    }

    #[test]
    fn mixed_strict_and_sloppy_arrow_factories() {
        check("mixed-arrow", 3, 1, true, 3);
    }

    #[test]
    fn mixed_strict_and_sloppy_function_factories() {
        check("mixed-function", 3, 1, false, 3);
    }

    #[test]
    fn unminified_mixed_writer_retains_its_original_group() {
        let items = factories(3, 1, true);
        let code = node_chunk_code(
            CodeBuilder::new(true, false),
            &items,
            true,
            MinifyType::NoMinify,
            false,
        )
        .expect("unminified Node writer");
        let text = String::from_utf8(code.into_source_code().into_bytes().to_vec())
            .expect("emitted JavaScript");
        assert!(text.starts_with("module.exports = [\n(()=>{\"use strict\";return["));
        assert_eq!(text.matches("use strict").count(), 4);
    }
}
