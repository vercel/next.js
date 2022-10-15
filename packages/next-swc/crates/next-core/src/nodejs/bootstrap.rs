use std::fmt::Write;

use anyhow::Result;
use turbo_tasks_fs::{File, FileSystemPathVc};
use turbopack::ecmascript::utils::stringify_str;
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{ChunkGroupVc, ChunkReferenceVc},
    reference::AssetReferencesVc,
};

#[turbo_tasks::value(shared)]
pub(super) struct NodeJsBootstrapAsset {
    pub(super) path: FileSystemPathVc,
    pub(super) chunk_group: ChunkGroupVc,
}

#[turbo_tasks::value_impl]
impl Asset for NodeJsBootstrapAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.path
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<AssetContentVc> {
        let context_path = self.path.parent().await?;

        // TODO(sokra) We need to have a chunk format for node.js
        // but until then this is a simple hack to make it work for now
        let mut output = "Error.stackTraceLimit = 100;\nglobal.self = global;\n".to_string();

        for chunk in self.chunk_group.chunks().await?.iter() {
            let path = &*chunk.path().await?;
            if let Some(p) = context_path.get_relative_path_to(path) {
                if p.ends_with(".js") {
                    writeln!(&mut output, "require({});", stringify_str(&p))?;
                }
            }
        }

        Ok(File::from(output).into())
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        let chunks = self.chunk_group.chunks().await?;
        let mut references = Vec::new();
        for chunk in chunks.iter() {
            references.push(ChunkReferenceVc::new(*chunk).into());
        }
        Ok(AssetReferencesVc::cell(references))
    }
}
