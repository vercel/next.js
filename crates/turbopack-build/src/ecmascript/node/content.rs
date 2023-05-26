use std::io::Write;

use anyhow::Result;
use indoc::writedoc;
use turbo_tasks::{TryJoinIterExt, Value};
use turbo_tasks_fs::File;
use turbopack_core::{
    asset::{Asset, AssetContentVc},
    code_builder::{CodeBuilder, CodeVc},
    source_map::{GenerateSourceMap, GenerateSourceMapVc, OptionSourceMapVc},
};
use turbopack_ecmascript::{chunk::EcmascriptChunkContentVc, utils::StringifyJs};

use super::chunk::EcmascriptBuildNodeChunkVc;
use crate::BuildChunkingContextVc;

#[turbo_tasks::value]
pub(super) struct EcmascriptBuildNodeChunkContent {
    pub(super) content: EcmascriptChunkContentVc,
    pub(super) chunking_context: BuildChunkingContextVc,
    pub(super) chunk: EcmascriptBuildNodeChunkVc,
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeChunkContentVc {
    #[turbo_tasks::function]
    pub(crate) async fn new(
        chunking_context: BuildChunkingContextVc,
        chunk: EcmascriptBuildNodeChunkVc,
        content: EcmascriptChunkContentVc,
    ) -> Result<Self> {
        Ok(EcmascriptBuildNodeChunkContent {
            content,
            chunking_context,
            chunk,
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeChunkContentVc {
    #[turbo_tasks::function]
    async fn code(self) -> Result<CodeVc> {
        let this = self.await?;
        let chunk_path = this.chunk.ident().path().await?;

        let mut code = CodeBuilder::default();

        writedoc!(
            code,
            r#"
                module.exports = {{

            "#,
        )?;

        let content = this.content.await?;
        let availability_info = Value::new(content.availability_info);
        for (id, item_code) in content
            .chunk_items
            .iter()
            .map(|chunk_item| async move {
                Ok((
                    chunk_item.id().await?,
                    chunk_item.code(availability_info).await?,
                ))
            })
            .try_join()
            .await?
        {
            write!(code, "{}: ", StringifyJs(&id))?;
            code.push_code(&*item_code);
            write!(code, ",\n")?;
        }

        write!(code, "\n}};")?;

        if code.has_source_map() {
            let filename = chunk_path.file_name();
            write!(code, "\n\n//# sourceMappingURL={}.map", filename)?;
        }

        let code = code.build();
        Ok(code.cell())
    }

    #[turbo_tasks::function]
    pub async fn content(self_vc: EcmascriptBuildNodeChunkContentVc) -> Result<AssetContentVc> {
        let code = self_vc.code().await?;
        Ok(File::from(code.source_code().clone()).into())
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for EcmascriptBuildNodeChunkContent {
    #[turbo_tasks::function]
    fn generate_source_map(self_vc: EcmascriptBuildNodeChunkContentVc) -> OptionSourceMapVc {
        self_vc.code().generate_source_map()
    }
}
