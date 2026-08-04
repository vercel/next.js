use std::fmt::Write;

use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath, rope::RopeBuilder};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{Chunk, ChunkItem, ChunkingContext, MinifyType},
    code_builder::{Code, CodeBuilder},
    ident::AssetIdent,
    introspect::Introspectable,
    output::{OutputAsset, OutputAssetsReference, OutputAssetsWithReferenced},
    source_map::GenerateSourceMap,
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

        let this = turbo_tasks::read!(self)?;
        let source_maps = *turbo_tasks::read!(
            this.chunking_context
                .reference_chunk_source_maps(Vc::upcast(self))
        )?;
        // CSS chunks never have debug IDs
        let mut code = CodeBuilder::new(source_maps, false);

        if matches!(
            &*turbo_tasks::read!(this.chunking_context.minify_type())?,
            MinifyType::NoMinify
        ) {
            let id = turbo_tasks::read!(this.item.asset_ident().to_string())?;
            writeln!(code, "/* {id} */")?;
        }
        let content = turbo_tasks::read!(this.item.content())?;
        let close = turbo_tasks::read!(write_import_context(&mut code, content.import_context))?;

        code.push_source(
            &content.inner_code,
            turbo_tasks::read!(content.source_map)?
                .as_content()
                .map(|f| f.content().clone()),
        );
        write!(code, "{close}")?;

        let c = code.build().cell();
        Ok(c)
    }

    #[turbo_tasks::function]
    pub(super) async fn ident_for_path(&self) -> Result<Vc<AssetIdent>> {
        Ok(turbo_tasks::read!(self.item.asset_ident().owned())?
            .with_modifier(rcstr!("single item css chunk"))
            .into_vc())
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for SingleItemCssChunk {
    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<OutputAssetsWithReferenced>> {
        let this = turbo_tasks::read!(self)?;
        let mut references = Vec::new();
        if *turbo_tasks::read!(
            this.chunking_context
                .reference_chunk_source_maps(Vc::upcast(self))
        )? {
            references.push(ResolvedVc::upcast(turbo_tasks::read!(
                SingleItemCssChunkSourceMapAsset::new(self).to_resolved()
            )?));
        }
        Ok(OutputAssetsWithReferenced::from_assets(Vc::cell(
            references,
        )))
    }
}

#[turbo_tasks::value_impl]
impl Chunk for SingleItemCssChunk {
    #[turbo_tasks::function]
    async fn ident(self: Vc<Self>) -> Result<Vc<AssetIdent>> {
        let self_as_output_asset: Vc<Box<dyn OutputAsset>> = Vc::upcast(self);
        Ok(
            AssetIdent::from_path(turbo_tasks::read!(self_as_output_asset.path().owned())?)
                .into_vc(),
        )
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
        Ok(turbo_tasks::read!(self)?.chunking_context.chunk_path(
            Some(Vc::upcast(self)),
            self.ident_for_path(),
            None,
            rcstr!(".single.css"),
        ))
    }
}

#[turbo_tasks::value_impl]
impl Asset for SingleItemCssChunk {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        let code = turbo_tasks::read!(self.code())?;

        let rope = if code.has_source_map() {
            use std::io::Write;
            let mut rope_builder = RopeBuilder::default();
            rope_builder.concat(code.source_code());
            let source_map_path =
                turbo_tasks::read!(SingleItemCssChunkSourceMapAsset::new(self).path())?;
            write!(
                rope_builder,
                "\n/*# sourceMappingURL={}*/",
                urlencoding::encode(source_map_path.file_name())
            )?;
            rope_builder.build()
        } else {
            code.source_code().clone()
        };

        Ok(AssetContent::file(
            FileContent::Content(File::from(rope)).cell(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for SingleItemCssChunk {
    #[turbo_tasks::function]
    fn generate_source_map(self: Vc<Self>) -> Vc<FileContent> {
        self.code().generate_source_map()
    }
}

#[turbo_tasks::value_impl]
impl Introspectable for SingleItemCssChunk {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<RcStr> {
        Vc::cell(rcstr!("single asset css chunk"))
    }

    #[turbo_tasks::function]
    fn title(self: Vc<Self>) -> Vc<RcStr> {
        self.path().to_string()
    }

    #[turbo_tasks::function]
    async fn details(&self) -> Result<Vc<RcStr>> {
        let mut details = String::new();
        write!(
            details,
            "Chunk item: {}",
            turbo_tasks::read!(self.item.asset_ident().to_string())?
        )?;
        Ok(Vc::cell(details.into()))
    }
}
