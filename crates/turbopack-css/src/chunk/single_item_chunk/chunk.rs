use std::fmt::Write;

use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString};
use turbo_tasks_fs::File;
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{Chunk, ChunkItem, ChunkVc, ChunkingContext, ChunkingContextVc},
    code_builder::{CodeBuilder, CodeVc},
    ident::AssetIdentVc,
    introspect::{Introspectable, IntrospectableVc},
    reference::AssetReferencesVc,
    source_map::{GenerateSourceMap, GenerateSourceMapVc, OptionSourceMapVc},
};

use super::source_map::SingleItemCssChunkSourceMapAssetReferenceVc;
use crate::chunk::{CssChunkItem, CssChunkItemVc};

/// A CSS chunk that only contains a single item. This is used for selectively
/// loading CSS modules that are part of a larger chunk in development mode, and
/// avoiding rule duplication.
#[turbo_tasks::value]
pub struct SingleItemCssChunk {
    context: ChunkingContextVc,
    item: CssChunkItemVc,
}

#[turbo_tasks::value_impl]
impl SingleItemCssChunkVc {
    /// Creates a new [`SingleItemCssChunkVc`].
    #[turbo_tasks::function]
    pub fn new(context: ChunkingContextVc, item: CssChunkItemVc) -> Self {
        SingleItemCssChunk { context, item }.cell()
    }
}

#[turbo_tasks::value_impl]
impl SingleItemCssChunkVc {
    #[turbo_tasks::function]
    async fn code(self) -> Result<CodeVc> {
        use std::io::Write;

        let this = self.await?;
        let mut code = CodeBuilder::default();

        let id = &*this.item.id().await?;

        writeln!(code, "/* {} */", id)?;
        let content = this.item.content().await?;
        code.push_source(
            &content.inner_code,
            content.source_map.map(|sm| sm.as_generate_source_map()),
        );

        if *this
            .context
            .reference_chunk_source_maps(self.into())
            .await?
            && code.has_source_map()
        {
            let chunk_path = self.path().await?;
            write!(
                code,
                "\n/*# sourceMappingURL={}.map*/",
                chunk_path.file_name()
            )?;
        }

        let c = code.build().cell();
        Ok(c)
    }
}

#[turbo_tasks::value_impl]
impl Chunk for SingleItemCssChunk {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> ChunkingContextVc {
        self.context
    }
}

#[turbo_tasks::function]
fn single_item_modifier() -> StringVc {
    StringVc::cell("single item css chunk".to_string())
}

#[turbo_tasks::value_impl]
impl Asset for SingleItemCssChunk {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<AssetIdentVc> {
        Ok(AssetIdentVc::from_path(
            self.context.chunk_path(
                self.item
                    .asset_ident()
                    .with_modifier(single_item_modifier()),
                ".css",
            ),
        ))
    }

    #[turbo_tasks::function]
    async fn content(self_vc: SingleItemCssChunkVc) -> Result<AssetContentVc> {
        let code = self_vc.code().await?;
        Ok(File::from(code.source_code().clone()).into())
    }

    #[turbo_tasks::function]
    async fn references(self_vc: SingleItemCssChunkVc) -> Result<AssetReferencesVc> {
        let this = self_vc.await?;
        let mut references = Vec::new();
        if *this
            .context
            .reference_chunk_source_maps(self_vc.into())
            .await?
        {
            references.push(SingleItemCssChunkSourceMapAssetReferenceVc::new(self_vc).into());
        }
        Ok(AssetReferencesVc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for SingleItemCssChunk {
    #[turbo_tasks::function]
    fn generate_source_map(self_vc: SingleItemCssChunkVc) -> OptionSourceMapVc {
        self_vc.code().generate_source_map()
    }
}

#[turbo_tasks::function]
fn introspectable_type() -> StringVc {
    StringVc::cell("single asset css chunk".to_string())
}

#[turbo_tasks::function]
fn entry_module_key() -> StringVc {
    StringVc::cell("entry module".to_string())
}

#[turbo_tasks::value_impl]
impl Introspectable for SingleItemCssChunk {
    #[turbo_tasks::function]
    fn ty(&self) -> StringVc {
        introspectable_type()
    }

    #[turbo_tasks::function]
    fn title(self_vc: SingleItemCssChunkVc) -> StringVc {
        self_vc.path().to_string()
    }

    #[turbo_tasks::function]
    async fn details(self_vc: SingleItemCssChunkVc) -> Result<StringVc> {
        let this = self_vc.await?;
        let mut details = String::new();
        write!(
            details,
            "Chunk item: {}",
            this.item.asset_ident().to_string().await?
        )?;
        Ok(StringVc::cell(details))
    }
}
