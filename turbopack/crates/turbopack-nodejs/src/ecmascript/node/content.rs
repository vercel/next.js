use std::io::Write;

use anyhow::Result;
use indoc::writedoc;
use turbo_tasks::{ReadRef, TryJoinIterExt, Vc};
use turbo_tasks_fs::File;
use turbopack_core::{
    asset::AssetContent,
    chunk::{ChunkItemExt, ChunkingContext, MinifyType, ModuleId},
    code_builder::{Code, CodeBuilder},
    output::OutputAsset,
    source_map::{GenerateSourceMap, OptionSourceMap},
    version::{Version, VersionedContent},
};
use turbopack_ecmascript::{
    chunk::{EcmascriptChunkContent, EcmascriptChunkItemExt},
    minify::minify,
    utils::StringifyJs,
};

use super::{chunk::EcmascriptBuildNodeChunk, version::EcmascriptBuildNodeChunkVersion};
use crate::NodeJsChunkingContext;

#[turbo_tasks::value]
pub(super) struct EcmascriptBuildNodeChunkContent {
    pub(super) content: Vc<EcmascriptChunkContent>,
    pub(super) chunking_context: Vc<NodeJsChunkingContext>,
    pub(super) chunk: Vc<EcmascriptBuildNodeChunk>,
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeChunkContent {
    #[turbo_tasks::function]
    pub(crate) async fn new(
        chunking_context: Vc<NodeJsChunkingContext>,
        chunk: Vc<EcmascriptBuildNodeChunk>,
        content: Vc<EcmascriptChunkContent>,
    ) -> Result<Vc<Self>> {
        Ok(EcmascriptBuildNodeChunkContent {
            content,
            chunking_context,
            chunk,
        }
        .cell())
    }
}

pub(super) async fn chunk_items(
    content: Vc<EcmascriptChunkContent>,
) -> Result<Vec<(ReadRef<ModuleId>, ReadRef<Code>)>> {
    content
        .await?
        .chunk_items
        .iter()
        .map(|&(chunk_item, async_module_info)| async move {
            Ok((
                chunk_item.id().await?,
                chunk_item.code(async_module_info).await?,
            ))
        })
        .try_join()
        .await
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeChunkContent {
    #[turbo_tasks::function]
    async fn code(self: Vc<Self>) -> Result<Vc<Code>> {
        let this = self.await?;
        let chunk_path_vc = this.chunk.ident().path();
        let chunk_path = chunk_path_vc.await?;

        let mut code = CodeBuilder::default();

        writedoc!(
            code,
            r#"
                module.exports = {{
    
            "#,
        )?;

        for (id, item_code) in chunk_items(this.content).await? {
            write!(code, "{}: ", StringifyJs(&id))?;
            code.push_code(&item_code);
            writeln!(code, ",")?;
        }

        write!(code, "\n}};")?;

        if code.has_source_map() {
            let filename = chunk_path.file_name();
            write!(
                code,
                "\n\n//# sourceMappingURL={}.map",
                urlencoding::encode(filename)
            )?;
        }

        let code = code.build().cell();
        if matches!(
            this.chunking_context.await?.minify_type(),
            MinifyType::Minify
        ) {
            return Ok(minify(chunk_path_vc, code));
        }

        Ok(code)
    }

    #[turbo_tasks::function]
    pub(crate) async fn own_version(self: Vc<Self>) -> Result<Vc<EcmascriptBuildNodeChunkVersion>> {
        let this = self.await?;
        Ok(EcmascriptBuildNodeChunkVersion::new(
            this.chunking_context.output_root(),
            this.chunk.ident().path(),
            this.content,
            this.chunking_context.await?.minify_type(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for EcmascriptBuildNodeChunkContent {
    #[turbo_tasks::function]
    fn generate_source_map(self: Vc<Self>) -> Vc<OptionSourceMap> {
        self.code().generate_source_map()
    }
}

#[turbo_tasks::value_impl]
impl VersionedContent for EcmascriptBuildNodeChunkContent {
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
