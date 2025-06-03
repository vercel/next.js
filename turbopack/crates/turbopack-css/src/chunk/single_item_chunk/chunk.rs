use std::fmt::Write;

use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::{File, FileSystemPath, rope::RopeBuilder};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{Chunk, ChunkItem, ChunkingContext, MinifyType},
    code_builder::{Code, CodeBuilder},
    ident::AssetIdent,
    introspect::Introspectable,
    output::{OutputAsset, OutputAssets},
    source_map::{GenerateSourceMap, OptionStringifiedSourceMap},
};

use super::source_map::SingleItemCssChunkSourceMapAsset;
use crate::chunk::{CssChunkItem, write_import_context};

/// A CSS chunk that only contains a single item. This is used for selectively
/// loading CSS modules that are part of a larger chunk in development mode, and
/// avoiding rule duplication.
#[turbo_tasks::value]
pub struct SingleItemCssChunk {
    pub(super) chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    item: ResolvedVc<Box<dyn CssChunkItem>>,
}

#[turbo_tasks::value_impl]
impl SingleItemCssChunk {
    /// Creates a new [`Vc<SingleItemCssChunk>`].
    #[turbo_tasks::function]
    pub fn new(
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        item: ResolvedVc<Box<dyn CssChunkItem>>,
    ) -> Vc<Self> {
        SingleItemCssChunk {
            chunking_context,
            item,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl SingleItemCssChunk {
    #[turbo_tasks::function]
    async fn code(self: Vc<Self>) -> Result<Vc<Code>> {
        use std::io::Write;

        let this = self.await?;
        let source_maps = *this
            .chunking_context
            .reference_chunk_source_maps(Vc::upcast(self))
            .await?;
        let mut code = CodeBuilder::new(source_maps);

        if matches!(
            &*this.chunking_context.minify_type().await?,
            MinifyType::NoMinify
        ) {
            let id = this.item.asset_ident().to_string().await?;
            writeln!(code, "/* {id} */")?;
        }
        let content = this.item.content().await?;
        let close = write_import_context(&mut code, content.import_context).await?;

        code.push_source(&content.inner_code, content.source_map.clone());
        write!(code, "{close}")?;

        let c = code.build().cell();
        Ok(c)
    }

    #[turbo_tasks::function]
    pub(super) async fn ident_for_path(&self) -> Result<Vc<AssetIdent>> {
        let item = self.item.asset_ident();
        Ok(item.with_modifier(rcstr!("single item css chunk")))
    }
}

#[turbo_tasks::value_impl]
impl Chunk for SingleItemCssChunk {
    #[turbo_tasks::function]
    fn ident(self: Vc<Self>) -> Vc<AssetIdent> {
        let self_as_output_asset: Vc<Box<dyn OutputAsset>> = Vc::upcast(self);
        AssetIdent::from_path(self_as_output_asset.path())
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for SingleItemCssChunk {
    #[turbo_tasks::function]
    async fn path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        Ok(self.await?.chunking_context.chunk_path(
            Some(Vc::upcast(self)),
            self.ident_for_path(),
            ".single.css".into(),
        ))
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;
        let mut references = Vec::new();
        if *this
            .chunking_context
            .reference_chunk_source_maps(Vc::upcast(self))
            .await?
        {
            references.push(ResolvedVc::upcast(
                SingleItemCssChunkSourceMapAsset::new(self)
                    .to_resolved()
                    .await?,
            ));
        }
        Ok(Vc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl Asset for SingleItemCssChunk {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        let code = self.code().await?;

        let rope = if code.has_source_map() {
            use std::io::Write;
            let mut rope_builder = RopeBuilder::default();
            rope_builder.concat(code.source_code());
            let source_map_path = SingleItemCssChunkSourceMapAsset::new(self).path().await?;
            write!(
                rope_builder,
                "\n/*# sourceMappingURL={}*/",
                urlencoding::encode(source_map_path.file_name())
            )?;
            rope_builder.build()
        } else {
            code.source_code().clone()
        };

        Ok(AssetContent::file(File::from(rope).into()))
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for SingleItemCssChunk {
    #[turbo_tasks::function]
    fn generate_source_map(self: Vc<Self>) -> Vc<OptionStringifiedSourceMap> {
        self.code().generate_source_map()
    }
}

#[turbo_tasks::function]
fn introspectable_type() -> Vc<RcStr> {
    Vc::cell("single asset css chunk".into())
}

#[turbo_tasks::function]
fn entry_module_key() -> Vc<RcStr> {
    Vc::cell("entry module".into())
}

#[turbo_tasks::value_impl]
impl Introspectable for SingleItemCssChunk {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<RcStr> {
        introspectable_type()
    }

    #[turbo_tasks::function]
    fn title(self: Vc<Self>) -> Vc<RcStr> {
        self.path().to_string()
    }

    #[turbo_tasks::function]
    async fn details(self: Vc<Self>) -> Result<Vc<RcStr>> {
        let this = self.await?;
        let mut details = String::new();
        write!(
            details,
            "Chunk item: {}",
            this.item.asset_ident().to_string().await?
        )?;
        Ok(Vc::cell(details.into()))
    }
}
