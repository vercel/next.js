use std::io::Write;

use anyhow::Result;
use indoc::writedoc;
use turbo_tasks::{TryJoinIterExt, Value, Vc};
use turbo_tasks_fs::File;
use turbopack_core::{
    asset::{Asset, AssetContent},
    code_builder::{Code, CodeBuilder},
    source_map::{GenerateSourceMap, OptionSourceMap},
};
use turbopack_ecmascript::{
    chunk::{EcmascriptChunkContent, EcmascriptChunkItemExt},
    utils::StringifyJs,
};

use super::chunk::EcmascriptBuildNodeChunk;
use crate::BuildChunkingContext;

#[turbo_tasks::value]
pub(super) struct EcmascriptBuildNodeChunkContent {
    pub(super) content: Vc<EcmascriptChunkContent>,
    pub(super) chunking_context: Vc<BuildChunkingContext>,
    pub(super) chunk: Vc<EcmascriptBuildNodeChunk>,
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeChunkContent {
    #[turbo_tasks::function]
    pub(crate) async fn new(
        chunking_context: Vc<BuildChunkingContext>,
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

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeChunkContent {
    #[turbo_tasks::function]
    async fn code(self: Vc<Self>) -> Result<Vc<Code>> {
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
            code.push_code(&item_code);
            writeln!(code, ",")?;
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
    pub async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        let code = self.code().await?;
        Ok(AssetContent::file(
            File::from(code.source_code().clone()).into(),
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
