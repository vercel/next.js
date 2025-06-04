use std::io::Write;

use anyhow::{Result, bail};
use either::Either;
use indoc::writedoc;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{File, rope::RopeBuilder};
use turbopack_core::{
    asset::AssetContent,
    chunk::{ChunkingContext, MinifyType, ModuleId},
    code_builder::{Code, CodeBuilder},
    output::OutputAsset,
    source_map::{GenerateSourceMap, OptionStringifiedSourceMap, SourceMapAsset},
    version::{MergeableVersionedContent, Version, VersionedContent, VersionedContentMerger},
};
use turbopack_ecmascript::{chunk::EcmascriptChunkContent, minify::minify, utils::StringifyJs};

use super::{
    chunk::EcmascriptBrowserChunk, content_entry::EcmascriptBrowserChunkContentEntries,
    merged::merger::EcmascriptBrowserChunkContentMerger, version::EcmascriptBrowserChunkVersion,
};
use crate::{
    BrowserChunkingContext,
    chunking_context::{CURRENT_CHUNK_METHOD_DOCUMENT_CURRENT_SCRIPT_EXPR, CurrentChunkMethod},
};

#[turbo_tasks::value(serialization = "none")]
pub struct EcmascriptBrowserChunkContent {
    pub(super) chunking_context: ResolvedVc<BrowserChunkingContext>,
    pub(super) chunk: ResolvedVc<EcmascriptBrowserChunk>,
    pub(super) content: ResolvedVc<EcmascriptChunkContent>,
    pub(super) source_map: ResolvedVc<SourceMapAsset>,
}

#[turbo_tasks::value_impl]
impl EcmascriptBrowserChunkContent {
    #[turbo_tasks::function]
    pub(crate) async fn new(
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
    pub fn entries(&self) -> Vc<EcmascriptBrowserChunkContentEntries> {
        EcmascriptBrowserChunkContentEntries::new(*self.content)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptBrowserChunkContent {
    #[turbo_tasks::function]
    pub(crate) fn own_version(&self) -> Vc<EcmascriptBrowserChunkVersion> {
        EcmascriptBrowserChunkVersion::new(
            self.chunking_context.output_root(),
            self.chunk.path(),
            *self.content,
        )
    }

    #[turbo_tasks::function]
    async fn code(self: Vc<Self>) -> Result<Vc<Code>> {
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
                    bail!(
                        "chunk path {} is not in output root {}",
                        chunk_path.to_string(),
                        output_root.to_string()
                    );
                };
                Either::Left(StringifyJs(chunk_server_path))
            }
            CurrentChunkMethod::DocumentCurrentScript => {
                Either::Right(CURRENT_CHUNK_METHOD_DOCUMENT_CURRENT_SCRIPT_EXPR)
            }
        };
        let mut code = CodeBuilder::new(source_maps);

        // When a chunk is executed, it will either register itself with the current
        // instance of the runtime, or it will push itself onto the list of pending
        // chunks (`self.TURBOPACK`).
        //
        // When the runtime executes (see the `evaluate` module), it will pick up and
        // register all pending chunks, and replace the list of pending chunks
        // with itself so later chunks can register directly with it.
        writedoc!(
            code,
            r#"
                (globalThis.TURBOPACK = globalThis.TURBOPACK || []).push([{script_or_path}, {{
            "#
        )?;

        let content = this.content.await?;
        let chunk_items = content.chunk_item_code_and_ids().await?;
        for item in chunk_items {
            for (id, item_code) in item {
                write!(code, "\n{}: ", StringifyJs(&id))?;
                code.push_code(item_code);
                write!(code, ",")?;
            }
        }

        write!(code, "\n}}]);")?;

        let mut code = code.build();

        if let MinifyType::Minify { mangle } = this.chunking_context.await?.minify_type() {
            code = minify(code, source_maps, mangle)?;
        }

        Ok(code.cell())
    }
}

#[turbo_tasks::value_impl]
impl VersionedContent for EcmascriptBrowserChunkContent {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        let this = self.await?;
        let code = self.code().await?;

        let rope = if code.has_source_map() {
            let mut rope_builder = RopeBuilder::default();
            rope_builder.concat(code.source_code());
            let source_map_path = this.source_map.path().await?;
            write!(
                rope_builder,
                "\n\n//# sourceMappingURL={}",
                urlencoding::encode(source_map_path.file_name())
            )?;
            rope_builder.build()
        } else {
            code.source_code().clone()
        };

        Ok(AssetContent::file(File::from(rope).into()))
    }

    #[turbo_tasks::function]
    fn version(self: Vc<Self>) -> Vc<Box<dyn Version>> {
        Vc::upcast(self.own_version())
    }
}

#[turbo_tasks::value_impl]
impl MergeableVersionedContent for EcmascriptBrowserChunkContent {
    #[turbo_tasks::function]
    fn get_merger(&self) -> Vc<Box<dyn VersionedContentMerger>> {
        Vc::upcast(EcmascriptBrowserChunkContentMerger::new())
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for EcmascriptBrowserChunkContent {
    #[turbo_tasks::function]
    fn generate_source_map(self: Vc<Self>) -> Vc<OptionStringifiedSourceMap> {
        self.code().generate_source_map()
    }

    #[turbo_tasks::function]
    async fn by_section(self: Vc<Self>, section: RcStr) -> Result<Vc<OptionStringifiedSourceMap>> {
        // Weirdly, the ContentSource will have already URL decoded the ModuleId, and we
        // can't reparse that via serde.
        if let Ok(id) = ModuleId::parse(&section) {
            let entries = self.entries().await?;
            for (entry_id, entry) in entries.iter() {
                if id == **entry_id {
                    let sm = entry.code.generate_source_map();
                    return Ok(sm);
                }
            }
        }

        Ok(Vc::cell(None))
    }
}
