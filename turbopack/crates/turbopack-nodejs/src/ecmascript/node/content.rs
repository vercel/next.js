use std::{future::IntoFuture, io::Write};

use anyhow::Result;
use indoc::writedoc;
use rustc_hash::FxHashMap;
use smallvec::{smallvec, SmallVec};
use turbo_tasks::{ReadRef, ResolvedVc, TryJoinIterExt, Vc};
use turbo_tasks_fs::File;
use turbopack_core::{
    asset::AssetContent,
    chunk::{batch_info, ChunkItemExt, ChunkingContext, MinifyType, ModuleId},
    code_builder::{Code, CodeBuilder},
    output::OutputAsset,
    source_map::{GenerateSourceMap, OptionStringifiedSourceMap},
    version::{Version, VersionedContent},
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkContent, EcmascriptChunkItemBatchGroup, EcmascriptChunkItemExt,
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
) -> Result<Vec<ReadRef<CodeAndIds>>> {
    let content = content.await?;
    batch_info(
        &content.batch_groups,
        &content.chunk_items,
        |batch| batch_group_code_and_ids(batch).into_future(),
        |item| code_and_ids(item.clone()).into_future(),
    )
    .await
}

#[turbo_tasks::value(transparent, serialization = "none")]
pub struct CodeAndIds(SmallVec<[(ReadRef<ModuleId>, ReadRef<Code>); 1]>);

#[turbo_tasks::value(transparent, serialization = "none")]
struct BatchGroupCodeAndIds(
    FxHashMap<EcmascriptChunkItemOrBatchWithAsyncInfo, ReadRef<CodeAndIds>>,
);

#[turbo_tasks::function]
async fn batch_group_code_and_ids(
    batch_group: Vc<EcmascriptChunkItemBatchGroup>,
) -> Result<Vc<BatchGroupCodeAndIds>> {
    Ok(Vc::cell(
        batch_group
            .await?
            .items
            .iter()
            .map(async |item| Ok((item.clone(), code_and_ids(item.clone()).await?)))
            .try_join()
            .await?
            .into_iter()
            .collect(),
    ))
}

#[turbo_tasks::function]
async fn code_and_ids(item: EcmascriptChunkItemOrBatchWithAsyncInfo) -> Result<Vc<CodeAndIds>> {
    Ok(Vc::cell(match item {
        EcmascriptChunkItemOrBatchWithAsyncInfo::ChunkItem(EcmascriptChunkItemWithAsyncInfo {
            chunk_item,
            async_info,
            ..
        }) => {
            let id = chunk_item.id();
            let code = chunk_item.code(async_info.map(|info| *info));
            smallvec![(id.await?, code.await?)]
        }
        EcmascriptChunkItemOrBatchWithAsyncInfo::Batch(batch) => batch
            .await?
            .chunk_items
            .iter()
            .map(|item| async {
                Ok((
                    item.chunk_item.id().await?,
                    item.chunk_item
                        .code(item.async_info.map(|info| *info))
                        .await?,
                ))
            })
            .try_join()
            .await?
            .into(),
    }))
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

        let content = this.content.await?;
        let chunk_items = batch_info(
            &content.batch_groups,
            &content.chunk_items,
            |batch| batch_group_code_and_ids(batch).into_future(),
            |item| code_and_ids(item.clone()).into_future(),
        )
        .await?;
        for item in chunk_items {
            for (id, item_code) in item {
                write!(code, "{}: ", StringifyJs(&id))?;
                code.push_code(&item_code);
                writeln!(code, ",")?;
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
