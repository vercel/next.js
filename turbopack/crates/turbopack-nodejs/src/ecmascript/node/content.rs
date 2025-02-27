use std::io::Write;

use anyhow::Result;
use either::Either;
use indoc::writedoc;
use turbo_tasks::{ReadRef, ResolvedVc, TryFlatJoinIterExt, Vc};
use turbo_tasks_fs::File;
use turbopack_core::{
    asset::AssetContent,
    chunk::{ChunkItemExt, ChunkingContext, MinifyType, ModuleId},
    code_builder::{Code, CodeBuilder},
    output::OutputAsset,
    source_map::{GenerateSourceMap, OptionStringifiedSourceMap},
    version::{Version, VersionedContent},
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkBatchWithAsyncInfo, EcmascriptChunkContent, EcmascriptChunkItemExt,
        EcmascriptChunkItemOrBatchWithAsyncInfo, EcmascriptChunkItemWithAsyncInfo,
    },
    minify::minify,
    utils::StringifyJs,
};

use super::{chunk::EcmascriptBuildNodeChunk, version::EcmascriptBuildNodeChunkVersion};
use crate::NodeJsChunkingContext;

#[turbo_tasks::value]
pub(super) struct EcmascriptBuildNodeChunkContent {
    pub(super) content: ResolvedVc<EcmascriptChunkContent>,
    pub(super) chunking_context: ResolvedVc<NodeJsChunkingContext>,
    pub(super) chunk: ResolvedVc<EcmascriptBuildNodeChunk>,
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeChunkContent {
    #[turbo_tasks::function]
    pub(crate) fn new(
        chunking_context: ResolvedVc<NodeJsChunkingContext>,
        chunk: ResolvedVc<EcmascriptBuildNodeChunk>,
        content: ResolvedVc<EcmascriptChunkContent>,
    ) -> Vc<Self> {
        EcmascriptBuildNodeChunkContent {
            content,
            chunking_context,
            chunk,
        }
        .cell()
    }
}

pub(super) async fn chunk_items(
    content: Vc<EcmascriptChunkContent>,
) -> Result<Vec<(ReadRef<ModuleId>, ReadRef<Code>)>> {
    content
        .await?
        .chunk_items
        .iter()
        .map(async |item| match *item {
            EcmascriptChunkItemOrBatchWithAsyncInfo::ChunkItem(
                EcmascriptChunkItemWithAsyncInfo {
                    chunk_item,
                    async_info,
                    ..
                },
            ) => Ok(Either::Left(std::iter::once((
                chunk_item.id().await?,
                chunk_item.code(async_info.map(|info| *info)).await?,
            )))),
            EcmascriptChunkItemOrBatchWithAsyncInfo::Batch(batch) => Ok(Either::Right(
                batch_id_and_code(*batch)
                    .await?
                    .into_iter()
                    .map(|(id, code)| (id.clone(), code.clone())),
            )),
        })
        .try_flat_join()
        .await
}

#[turbo_tasks::value(transparent, serialization = "none")]
struct CodeAndIds(Vec<(ReadRef<ModuleId>, ReadRef<Code>)>);

#[turbo_tasks::function]
async fn batch_id_and_code(batch: Vc<EcmascriptChunkBatchWithAsyncInfo>) -> Result<Vc<CodeAndIds>> {
    let mut code_and_ids = Vec::new();
    for item in batch.await?.chunk_items.iter() {
        let &EcmascriptChunkItemWithAsyncInfo {
            chunk_item,
            async_info,
            ..
        } = item;
        code_and_ids.push((
            chunk_item.id().await?,
            chunk_item.code(async_info.map(|info| *info)).await?,
        ));
    }
    Ok(Vc::cell(code_and_ids))
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeChunkContent {
    #[turbo_tasks::function]
    async fn code(self: Vc<Self>) -> Result<Vc<Code>> {
        let this = self.await?;
        let source_maps = this
            .chunking_context
            .reference_chunk_source_maps(*ResolvedVc::upcast(this.chunk));
        let chunk_path_vc = this.chunk.path();
        let chunk_path = chunk_path_vc.await?;

        let mut code = CodeBuilder::default();

        writedoc!(
            code,
            r#"
                module.exports = {{

            "#,
        )?;

        for item in this.content.await?.chunk_items.iter() {
            match item {
                EcmascriptChunkItemOrBatchWithAsyncInfo::ChunkItem(chunk_item) => {
                    let &EcmascriptChunkItemWithAsyncInfo {
                        chunk_item,
                        async_info,
                        ..
                    } = chunk_item;
                    let id = chunk_item.id().await?;
                    let item_code = chunk_item.code(async_info.map(|info| *info)).await?;
                    write!(code, "{}: ", StringifyJs(&id))?;
                    code.push_code(&item_code);
                    writeln!(code, ",")?;
                }
                &EcmascriptChunkItemOrBatchWithAsyncInfo::Batch(batch) => {
                    for (id, item_code) in batch_id_and_code(*batch).await? {
                        write!(code, "{}: ", StringifyJs(&id))?;
                        code.push_code(&item_code);
                        writeln!(code, ",")?;
                    }
                }
            }
        }

        write!(code, "\n}};")?;

        if *source_maps.await? && code.has_source_map() {
            let filename = chunk_path.file_name();
            write!(
                code,
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

    #[turbo_tasks::function]
    pub(crate) async fn own_version(&self) -> Result<Vc<EcmascriptBuildNodeChunkVersion>> {
        Ok(EcmascriptBuildNodeChunkVersion::new(
            self.chunking_context.output_root(),
            self.chunk.path(),
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
