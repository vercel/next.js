use std::sync::Arc;

use anyhow::Result;
use swc_core::common::{BytePos, FileName, LineCol, SourceMap};
use tokio::io::AsyncReadExt;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{FileContent, FileSystemPath, rope::Rope};
use turbopack_core::{
    asset::{Asset, AssetContent},
    output::{OutputAsset, OutputAssetsReference},
    source::Source,
    source_map::{GenerateSourceMap, OptionStringifiedSourceMap},
};

use crate::parse::generate_js_source_map;

/// An EcmaScript OutputAsset composed of one file, no parsing and no references. Includes a source
/// map to the original file.
#[turbo_tasks::value]
pub struct SingleFileEcmascriptOutput {
    output_path: FileSystemPath,
    source_path: FileSystemPath,
    source: ResolvedVc<Box<dyn Source>>,
}

#[turbo_tasks::value_impl]
impl OutputAsset for SingleFileEcmascriptOutput {
    #[turbo_tasks::function]
    fn path(&self) -> Vc<FileSystemPath> {
        self.output_path.clone().cell()
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for SingleFileEcmascriptOutput {}

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
        output_path: FileSystemPath,
        source_path: FileSystemPath,
        source: ResolvedVc<Box<dyn Source>>,
    ) -> Vc<SingleFileEcmascriptOutput> {
        SingleFileEcmascriptOutput {
            output_path,
            source_path,
            source,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for SingleFileEcmascriptOutput {
    #[turbo_tasks::function]
    pub async fn generate_source_map(&self) -> Result<Vc<OptionStringifiedSourceMap>> {
        let FileContent::Content(file) = &*self.source.content().file_content().await? else {
            return Ok(Vc::cell(None));
        };

        let file_source = {
            let mut s = String::new();
            file.read().read_to_string(&mut s).await?;
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

        let sm: Arc<SourceMap> = Default::default();
        sm.new_source_file(
            FileName::Custom(self.source_path.to_string()).into(),
            file_source,
        );

        let map = generate_js_source_map(&*sm, mappings, None::<&Rope>, true, true)?;
        Ok(Vc::cell(Some(map)))
    }
}
