// RopeReader is in-memory and implements std::io::Read; the async read here was
// gratuitous, so use the synchronous Read in both modes (no tokio needed).
use std::{io::Read as _, sync::Arc};

use anyhow::Result;
use swc_core::common::{BytePos, FileName, LineCol, SourceMap};
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, ValueToStringRef, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath, rope::Rope};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::ChunkingContext,
    output::{OutputAsset, OutputAssets, OutputAssetsReference, OutputAssetsWithReferenced},
    source::Source,
    source_map::{GenerateSourceMap, SourceMapAsset},
};

use crate::parse::generate_js_source_map;

/// An EcmaScript OutputAsset composed of one file, no parsing and no references. Includes a source
/// map to the original file.
#[turbo_tasks::value]
pub struct SingleFileEcmascriptOutput {
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    source: ResolvedVc<Box<dyn Source>>,
}

#[turbo_tasks::value_impl]
impl SingleFileEcmascriptOutput {
    #[turbo_tasks::function]
    async fn source_map(self: Vc<Self>) -> Result<Vc<SourceMapAsset>> {
        let this = turbo_tasks::read!(self)?;
        Ok(SourceMapAsset::new(
            *this.chunking_context,
            this.source.ident(),
            Vc::upcast(self),
        ))
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for SingleFileEcmascriptOutput {
    #[turbo_tasks::function]
    fn path(&self) -> Vc<FileSystemPath> {
        self.chunking_context.chunk_path(
            Some(Vc::upcast(*self.source)),
            self.source.ident(),
            None,
            rcstr!(".js"),
        )
    }
}

#[turbo_tasks::value_impl]
impl Asset for SingleFileEcmascriptOutput {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}

#[turbo_tasks::value_impl]
impl SingleFileEcmascriptOutput {
    #[turbo_tasks::function]
    pub fn new(
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        source: ResolvedVc<Box<dyn Source>>,
    ) -> Vc<SingleFileEcmascriptOutput> {
        SingleFileEcmascriptOutput {
            source,
            chunking_context,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for SingleFileEcmascriptOutput {
    #[turbo_tasks::function]
    pub async fn generate_source_map(&self) -> Result<Vc<FileContent>> {
        let FileContent::Content(file) =
            &*turbo_tasks::read!(self.source.content().file_content())?
        else {
            return Ok(FileContent::NotFound.cell());
        };

        let file_source = {
            let mut s = String::new();
            file.read().read_to_string(&mut s)?;
            s
        };

        let mut mappings = vec![];
        // Start from 1 because 0 is reserved for dummy spans in SWC.
        let mut pos: u32 = 1;
        for (index, line) in file_source.split_inclusive('\n').enumerate() {
            mappings.push((
                BytePos(pos),
                LineCol {
                    line: index as u32,
                    col: 0,
                },
            ));
            pos += line.len() as u32;
        }

        let source_path = turbo_tasks::read!(
            turbo_tasks::read!(self.source.ident())?
                .path
                .to_string_ref()
        )?
        .to_string();

        let sm: Arc<SourceMap> = Default::default();
        sm.new_source_file(FileName::Custom(source_path).into(), file_source);

        let map = generate_js_source_map(
            &*sm,
            mappings,
            None::<&Rope>,
            true,
            true,
            Default::default(),
        )?;
        Ok(FileContent::Content(File::from(map)).cell())
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for SingleFileEcmascriptOutput {
    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<OutputAssetsWithReferenced>> {
        let this = turbo_tasks::read!(self)?;

        let include_source_map = *turbo_tasks::read!(
            this.chunking_context
                .reference_chunk_source_maps(Vc::upcast(self))
        )?;

        let references = if include_source_map {
            Vc::cell(vec![ResolvedVc::upcast(turbo_tasks::read!(
                self.source_map().to_resolved()
            )?)])
        } else {
            OutputAssets::empty()
        };

        Ok(OutputAssetsWithReferenced::from_assets(references))
    }
}
