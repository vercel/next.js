use std::io::Write;

use anyhow::{bail, Result};
use indoc::writedoc;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::File;
use turbopack_core::{
    asset::AssetContent,
    chunk::{ChunkingContext, MinifyType, ModuleId},
    code_builder::{Code, CodeBuilder},
    output::OutputAsset,
    source_map::{GenerateSourceMap, OptionStringifiedSourceMap},
    version::{MergeableVersionedContent, Version, VersionedContent, VersionedContentMerger},
};
use turbopack_ecmascript::{chunk::EcmascriptChunkContent, minify::minify, utils::StringifyJs};

use super::{
    chunk::EcmascriptDevChunk, content_entry::EcmascriptDevChunkContentEntries,
    merged::merger::EcmascriptDevChunkContentMerger, version::EcmascriptDevChunkVersion,
};
use crate::BrowserChunkingContext;

#[turbo_tasks::value(serialization = "none")]
pub struct EcmascriptDevChunkContent {
    pub(super) entries: ResolvedVc<EcmascriptDevChunkContentEntries>,
    pub(super) chunking_context: ResolvedVc<BrowserChunkingContext>,
    pub(super) chunk: ResolvedVc<EcmascriptDevChunk>,
}

#[turbo_tasks::value_impl]
impl EcmascriptDevChunkContent {
    #[turbo_tasks::function]
    pub(crate) async fn new(
        chunking_context: ResolvedVc<BrowserChunkingContext>,
        chunk: ResolvedVc<EcmascriptDevChunk>,
        content: Vc<EcmascriptChunkContent>,
    ) -> Result<Vc<Self>> {
        let entries = EcmascriptDevChunkContentEntries::new(content)
            .to_resolved()
            .await?;
        Ok(EcmascriptDevChunkContent {
            entries,
            chunking_context,
            chunk,
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub fn entries(&self) -> Vc<EcmascriptDevChunkContentEntries> {
        *self.entries
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptDevChunkContent {
    #[turbo_tasks::function]
    pub(crate) fn own_version(&self) -> Vc<EcmascriptDevChunkVersion> {
        EcmascriptDevChunkVersion::new(
            self.chunking_context.output_root(),
            self.chunk.path(),
            *self.entries,
        )
    }

    #[turbo_tasks::function]
    async fn code(self: Vc<Self>) -> Result<Vc<Code>> {
        let this = self.await?;
        let output_root = this.chunking_context.output_root().await?;
        let source_maps = this
            .chunking_context
            .reference_chunk_source_maps(*ResolvedVc::upcast(this.chunk));
        let chunk_path_vc = this.chunk.path();
        let chunk_path = chunk_path_vc.await?;
        let chunk_server_path = if let Some(path) = output_root.get_path_to(&chunk_path) {
            path
        } else {
            bail!(
                "chunk path {} is not in output root {}",
                chunk_path.to_string(),
                output_root.to_string()
            );
        };
        let mut code = CodeBuilder::default();

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
                (globalThis.TURBOPACK = globalThis.TURBOPACK || []).push([{chunk_path}, {{
            "#,
            chunk_path = StringifyJs(chunk_server_path)
        )?;

        for (id, entry) in this.entries.await?.iter() {
            write!(code, "\n{}: ", StringifyJs(&id))?;
            code.push_code(&*entry.code.await?);
            write!(code, ",")?;
        }

        write!(code, "\n}}]);")?;

        if *source_maps.await? && code.has_source_map() {
            let filename = chunk_path.file_name();
            write!(
                code,
                // findSourceMapURL assumes this co-located sourceMappingURL,
                // and needs to be adjusted in case this is ever changed.
                "\n\n//# sourceMappingURL={}.map",
                urlencoding::encode(filename)
            )?;
        }

        let code = code.build().cell();

        if let MinifyType::Minify { mangle } = this.chunking_context.await?.minify_type() {
            return Ok(minify(chunk_path_vc, code, source_maps, mangle));
        }

        Ok(code)
    }
}

#[turbo_tasks::value_impl]
impl VersionedContent for EcmascriptDevChunkContent {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        let code = self.code().await?;
        Ok(AssetContent::file(
            File::from(code.source_code().clone()).into(),
        ))
    }

    #[turbo_tasks::function]
    fn version(self: Vc<Self>) -> Vc<Box<dyn Version>> {
        Vc::upcast(self.own_version())
    }
}

#[turbo_tasks::value_impl]
impl MergeableVersionedContent for EcmascriptDevChunkContent {
    #[turbo_tasks::function]
    fn get_merger(&self) -> Vc<Box<dyn VersionedContentMerger>> {
        Vc::upcast(EcmascriptDevChunkContentMerger::new())
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for EcmascriptDevChunkContent {
    #[turbo_tasks::function]
    fn generate_source_map(self: Vc<Self>) -> Vc<OptionStringifiedSourceMap> {
        self.code().generate_source_map()
    }

    #[turbo_tasks::function]
    async fn by_section(&self, section: RcStr) -> Result<Vc<OptionStringifiedSourceMap>> {
        // Weirdly, the ContentSource will have already URL decoded the ModuleId, and we
        // can't reparse that via serde.
        if let Ok(id) = ModuleId::parse(&section) {
            for (entry_id, entry) in self.entries.await?.iter() {
                if id == **entry_id {
                    let sm = entry.code.generate_source_map();
                    return Ok(sm);
                }
            }
        }

        Ok(Vc::cell(None))
    }
}
