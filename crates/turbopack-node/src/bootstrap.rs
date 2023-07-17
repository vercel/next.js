use std::fmt::Write;

use anyhow::Result;
use turbo_tasks::Vc;
use turbo_tasks_fs::{File, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{Chunk, ChunkingContext, EvaluatableAssets},
    ident::AssetIdent,
    output::{OutputAsset, OutputAssets},
    reference::{AssetReferences, SingleAssetReference},
};
use turbopack_ecmascript::utils::StringifyJs;

#[turbo_tasks::value(shared)]
pub(super) struct NodeJsBootstrapAsset {
    pub(super) path: Vc<FileSystemPath>,
    pub(super) chunking_context: Vc<Box<dyn ChunkingContext>>,
    pub(super) entry: Vc<Box<dyn Chunk>>,
    pub(super) evaluatable_assets: Vc<EvaluatableAssets>,
}

#[turbo_tasks::function]
fn node_js_bootstrap_chunk_reference_description() -> Vc<String> {
    Vc::cell("node.js bootstrap chunk".to_string())
}

impl NodeJsBootstrapAsset {
    fn chunks(&self) -> Vc<OutputAssets> {
        self.chunking_context
            .evaluated_chunk_group(self.entry, self.evaluatable_assets)
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for NodeJsBootstrapAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        AssetIdent::from_path(self.path)
    }
}

#[turbo_tasks::value_impl]
impl Asset for NodeJsBootstrapAsset {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        let context_path = self.path.parent().await?;

        // TODO(sokra) We need to have a chunk format for node.js
        // but until then this is a simple hack to make it work for now
        let mut output = "Error.stackTraceLimit = 100;\nglobal.self = global;\n".to_string();

        for chunk in self.chunks().await?.iter() {
            let path = &*chunk.ident().path().await?;
            if let Some(p) = context_path.get_relative_path_to(path) {
                if p.ends_with(".js") {
                    writeln!(&mut output, "require({});", StringifyJs(&p))?;
                }
            }
        }

        Ok(AssetContent::file(File::from(output).into()))
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<AssetReferences>> {
        let chunks = self.chunks().await?;
        let mut references = Vec::new();
        for &chunk in chunks.iter() {
            references.push(Vc::upcast(SingleAssetReference::new(
                Vc::upcast(chunk),
                node_js_bootstrap_chunk_reference_description(),
            )));
        }
        Ok(Vc::cell(references))
    }
}
