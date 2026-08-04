use anyhow::Result;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{File, FileContent};
use turbopack_core::{
    asset::AssetContent,
    chunk::{ChunkingContext, MinifyType},
    code_builder::{Code, CodeBuilder},
    output::OutputAsset,
    source_map::{GenerateSourceMap, SourceMapAsset},
    version::{Update, Version, VersionedContent},
};
use turbopack_ecmascript::{
    chunk::{EcmascriptChunkContent, EcmascriptChunkContentEntries},
    minify::minify,
    utils::StringifyJs,
};

use super::{
    chunk::EcmascriptBuildNodeChunk, update::update_node_chunk,
    version::EcmascriptBuildNodeChunkVersion,
};
use crate::NodeJsChunkingContext;

#[turbo_tasks::value]
pub(super) struct EcmascriptBuildNodeChunkContent {
    pub(super) content: ResolvedVc<EcmascriptChunkContent>,
    pub(super) chunking_context: ResolvedVc<NodeJsChunkingContext>,
    pub(super) chunk: ResolvedVc<EcmascriptBuildNodeChunk>,
    pub(super) source_map: ResolvedVc<SourceMapAsset>,
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeChunkContent {
    #[turbo_tasks::function]
    pub(crate) fn new(
        chunking_context: ResolvedVc<NodeJsChunkingContext>,
        chunk: ResolvedVc<EcmascriptBuildNodeChunk>,
        content: ResolvedVc<EcmascriptChunkContent>,
        source_map: ResolvedVc<SourceMapAsset>,
    ) -> Vc<Self> {
        EcmascriptBuildNodeChunkContent {
            content,
            chunking_context,
            chunk,
            source_map,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub(crate) fn entries(&self) -> Vc<EcmascriptChunkContentEntries> {
        EcmascriptChunkContentEntries::new(*self.content)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeChunkContent {
    #[turbo_tasks::function]
    async fn code(&self) -> Result<Vc<Code>> {
        use std::io::Write;
        let source_maps = *turbo_tasks::read!(
            self.chunking_context
                .reference_chunk_source_maps(*ResolvedVc::upcast(self.chunk))
        )?;

        let mut code = CodeBuilder::new(
            true,
            *turbo_tasks::read!(self.chunking_context.debug_ids_enabled())?,
        );

        write!(code, "module.exports = [")?;

        let content = turbo_tasks::read!(self.content)?;
        let mut chunk_items = turbo_tasks::read!(content.chunk_item_code_module_ids_and_paths())?;
        chunk_items.sort_by(|a, b| {
            a.first()
                .map(|(id, _, path)| (path, id))
                .cmp(&b.first().map(|(id, _, path)| (path, id)))
        });
        for item in &chunk_items {
            for (id, item_code, _) in &**item {
                write!(code, "\n{}, ", StringifyJs(id))?;
                code.push_code(item_code);
                write!(code, ",")?;
            }
        }

        write!(code, "\n];")?;

        let mut code = code.build();

        if let MinifyType::Minify { mangle } =
            *turbo_tasks::read!(self.chunking_context.minify_type())?
        {
            code = minify(code, source_maps, mangle)?;
        }

        Ok(code.cell())
    }

    #[turbo_tasks::function]
    pub(crate) async fn own_version(&self) -> Result<Vc<EcmascriptBuildNodeChunkVersion>> {
        Ok(EcmascriptBuildNodeChunkVersion::new(
            turbo_tasks::read!(self.chunking_context.output_root().owned())?,
            turbo_tasks::read!(self.chunk.path().owned())?,
            *self.content,
            *turbo_tasks::read!(self.chunking_context.minify_type())?,
        ))
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for EcmascriptBuildNodeChunkContent {
    #[turbo_tasks::function]
    fn generate_source_map(self: Vc<Self>) -> Vc<FileContent> {
        self.code().generate_source_map()
    }
}

#[turbo_tasks::value_impl]
impl VersionedContent for EcmascriptBuildNodeChunkContent {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        let this = turbo_tasks::read!(self)?;
        Ok(AssetContent::file(
            FileContent::Content(File::from(turbo_tasks::read!(
                self.code().to_rope_with_magic_comments(|| *this.source_map)
            )?))
            .cell(),
        ))
    }

    #[turbo_tasks::function]
    fn version(self: Vc<Self>) -> Vc<Box<dyn Version>> {
        Vc::upcast(self.own_version())
    }

    #[turbo_tasks::function]
    async fn update(
        self: Vc<Self>,
        from_version: ResolvedVc<Box<dyn Version>>,
    ) -> Result<Vc<Update>> {
        Ok(turbo_tasks::read!(update_node_chunk(self, from_version))?.cell())
    }
}
