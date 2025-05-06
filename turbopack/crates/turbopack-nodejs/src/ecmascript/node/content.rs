use anyhow::Result;
use indoc::writedoc;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{File, rope::RopeBuilder};
use turbopack_core::{
    asset::AssetContent,
    chunk::{ChunkingContext, MinifyType},
    code_builder::{Code, CodeBuilder},
    output::OutputAsset,
    source_map::{GenerateSourceMap, OptionStringifiedSourceMap, SourceMapAsset},
    version::{Version, VersionedContent},
};
use turbopack_ecmascript::{chunk::EcmascriptChunkContent, minify::minify, utils::StringifyJs};

use super::{chunk::EcmascriptBuildNodeChunk, version::EcmascriptBuildNodeChunkVersion};
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
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeChunkContent {
    #[turbo_tasks::function]
    async fn code(self: Vc<Self>) -> Result<Vc<Code>> {
        use std::io::Write;
        let this = self.await?;
        let source_maps = *this
            .chunking_context
            .reference_chunk_source_maps(*ResolvedVc::upcast(this.chunk))
            .await?;

        let mut code = CodeBuilder::default();

        writedoc!(
            code,
            r#"
                module.exports = {{

            "#,
        )?;

        let content = this.content.await?;
        let chunk_items = content.chunk_item_code_and_ids().await?;
        for item in chunk_items {
            for (id, item_code) in item {
                write!(code, "{}: ", StringifyJs(&id))?;
                code.push_code(item_code);
                writeln!(code, ",")?;
            }
        }

        write!(code, "\n}};")?;

        let mut code = code.build();

        if let MinifyType::Minify { mangle } = this.chunking_context.await?.minify_type() {
            code = minify(&code, source_maps, mangle)?;
        }

        Ok(code.cell())
    }

    #[turbo_tasks::function]
    pub(crate) async fn own_version(&self) -> Result<Vc<EcmascriptBuildNodeChunkVersion>> {
        Ok(EcmascriptBuildNodeChunkVersion::new(
            (*self.chunking_context.output_root().await?).clone(),
            (*self.chunk.path().await?).clone(),
            *self.content,
            self.chunking_context.await?.minify_type(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for EcmascriptBuildNodeChunkContent {
    #[turbo_tasks::function]
    fn generate_source_map(self: Vc<Self>) -> Vc<OptionStringifiedSourceMap> {
        self.code().generate_source_map()
    }
}

#[turbo_tasks::value_impl]
impl VersionedContent for EcmascriptBuildNodeChunkContent {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        let this = self.await?;
        let code = self.code().await?;

        let rope = if code.has_source_map() {
            use std::io::Write;
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
