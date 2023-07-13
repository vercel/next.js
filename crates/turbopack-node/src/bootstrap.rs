use std::fmt::Write;

use anyhow::Result;
use turbo_tasks::primitives::StringVc;
use turbo_tasks_fs::{File, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{ChunkVc, ChunkingContext, ChunkingContextVc, EvaluatableAssetsVc},
    ident::AssetIdentVc,
    output::OutputAssetsVc,
    reference::{AssetReferencesVc, SingleAssetReferenceVc},
};
use turbopack_ecmascript::utils::StringifyJs;

#[turbo_tasks::value(shared)]
pub(super) struct NodeJsBootstrapAsset {
    pub(super) path: FileSystemPathVc,
    pub(super) chunking_context: ChunkingContextVc,
    pub(super) entry: ChunkVc,
    pub(super) evaluatable_assets: EvaluatableAssetsVc,
}

#[turbo_tasks::function]
fn node_js_bootstrap_chunk_reference_description() -> StringVc {
    StringVc::cell("node.js bootstrap chunk".to_string())
}

impl NodeJsBootstrapAsset {
    fn chunks(&self) -> OutputAssetsVc {
        self.chunking_context
            .evaluated_chunk_group(self.entry, self.evaluatable_assets)
    }
}

#[turbo_tasks::value_impl]
impl Asset for NodeJsBootstrapAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> AssetIdentVc {
        AssetIdentVc::from_path(self.path)
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<AssetContentVc> {
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

        Ok(File::from(output).into())
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        let chunks = self.chunks().await?;
        let mut references = Vec::new();
        for &chunk in chunks.iter() {
            references.push(
                SingleAssetReferenceVc::new(
                    chunk.into(),
                    node_js_bootstrap_chunk_reference_description(),
                )
                .into(),
            );
        }
        Ok(AssetReferencesVc::cell(references))
    }
}
