use std::io::Write;

use anyhow::Result;
use either::Either;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc, turbobail};
use turbo_tasks_fs::FileContent;
use turbopack_core::{
    asset::AssetContent,
    chunk::{ChunkingContext, ModuleId},
    code_builder::{Code, ComposedCode, ComposedCodeBuilder},
    output::OutputAsset,
    source_map::{GenerateSourceMap, SourceMapAsset},
    version::{MergeableVersionedContent, Version, VersionedContent, VersionedContentMerger},
};
use turbopack_ecmascript::{
    chunk::{
        ChunkMinification, EcmascriptChunkContent, EcmascriptChunkContentEntries,
        strict_chunk_prefix, strict_factory_mode, write_module_factories,
    },
    hmr::{
        EcmascriptHmrChunkContent, merger::EcmascriptChunkContentMerger,
        version::EcmascriptChunkVersion,
    },
    utils::{PropertyAccessJs, StringifyJs},
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
        Ok(self.composed_code().await?.code())
    }

    /// The chunk's code, composed from its chunk items' cells (see [`ComposedCode`]).
    #[turbo_tasks::function]
    async fn composed_code(self: Vc<Self>) -> Result<Vc<ComposedCode>> {
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
        let mut code = ComposedCodeBuilder::new(
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
        let minification =
            ChunkMinification::for_chunking_context(Vc::upcast(*this.chunking_context)).await?;
        let chunk_items = content
            .chunk_item_code_module_ids_and_paths(minification, source_maps)
            .await?;
        let strict_factory_mode = strict_factory_mode(
            &chunk_items,
            minification.factories_have_strict_directives(),
        );
        if let Some(prefix) = strict_chunk_prefix(strict_factory_mode) {
            code += prefix;
        }

        // When a chunk is executed, it will either register itself with the current
        // instance of the runtime, or it will push itself onto the list of pending
        // chunks (using the configured chunk loading global variable).
        //
        // When the runtime executes (see the `evaluate` module), it will pick up and
        // register all pending chunks, and replace the list of pending chunks
        // with itself so later chunks can register directly with it.
        //
        // The scaffolding is written in minified form, so it needs no minification pass of its
        // own when the factories are minified individually.
        let chunk_loading_global = this.chunking_context.chunk_loading_global().await?;
        let global = PropertyAccessJs("globalThis", &chunk_loading_global);
        write!(
            code,
            // `||=` would be better but we need to be es2020 compatible
            //`x || (x = default)` is better than `x = x || default` simply because we avoid _writing_ the property in the common case.
            "({global}||({global}=[])).push([{script_or_path}",
        )?;
        if !chunk_items.is_empty() {
            code += ",";
        }
        write_module_factories(
            &mut code,
            &chunk_items,
            strict_factory_mode,
            supports_arrow_functions,
        )?;
        code += "]);";

        let (code, parts) = code.build();
        Ok(minification
            .finish_composed_chunk(code, parts, source_maps)?
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
        let file = self
            .composed_code()
            .await?
            .to_file_with_magic_comments(|| *this.source_map)
            .await?;
        Ok(AssetContent::file(FileContent::Content(file).cell()))
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
    async fn generate_source_map(self: Vc<Self>) -> Result<Vc<FileContent>> {
        self.composed_code().await?.source_map_file_content().await
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
