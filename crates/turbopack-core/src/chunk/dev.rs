use anyhow::Result;
use turbo_tasks::{
    primitives::{BoolVc, StringVc},
    ValueToString,
};
use turbo_tasks_fs::FileSystemPathVc;

use super::{ChunkingContext, ChunkingContextVc};
use crate::asset::AssetVc;

/// A chunking context for development mode.
/// It uses readable filenames and module ids to improve development.
/// It also uses a chunking heuristic that is incremental and cacheable.
/// It splits "node_modules" separately as these are less likely to change
/// during development
#[turbo_tasks::value]
pub struct DevChunkingContext {
    /// This path get striped off of path before creating a name out of it
    context_path: FileSystemPathVc,
    /// Chunks are placed at this path
    chunk_root_path: FileSystemPathVc,
    /// Static assets are placed at this path
    asset_root_path: FileSystemPathVc,
    /// Layer name within this context
    layer: StringVc,
    /// Enable HMR for this chunking
    enable_hot_module_replacement: bool,
}

impl DevChunkingContextVc {
    pub fn new(
        context_path: FileSystemPathVc,
        chunk_root_path: FileSystemPathVc,
        asset_root_path: FileSystemPathVc,
        enable_hot_module_replacement: bool,
    ) -> Self {
        DevChunkingContext {
            context_path,
            chunk_root_path,
            asset_root_path,
            layer: StringVc::empty(),
            enable_hot_module_replacement,
        }
        .cell()
    }

    pub fn new_with_layer(
        context_path: FileSystemPathVc,
        chunk_root_path: FileSystemPathVc,
        asset_root_path: FileSystemPathVc,
        enable_hot_module_replacement: bool,
        layer: &str,
    ) -> Self {
        DevChunkingContext {
            context_path,
            chunk_root_path,
            asset_root_path,
            layer: StringVc::cell(layer.to_string()),
            enable_hot_module_replacement,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkingContext for DevChunkingContext {
    #[turbo_tasks::function]
    async fn chunk_path(
        &self,
        path_vc: FileSystemPathVc,
        extension: &str,
    ) -> Result<FileSystemPathVc> {
        fn clean(s: &str) -> String {
            s.replace('/', "_")
        }
        // For clippy -- This explicit deref is necessary
        let path = &*path_vc.await?;
        let mut name = if let Some(inner) = self.context_path.await?.get_path_to(path) {
            clean(inner)
        } else {
            clean(&path_vc.to_string().await?)
        };
        if !name.ends_with(extension) {
            name += extension;
        }
        let layer = &*self.layer.await?;
        Ok(if layer.is_empty() {
            self.chunk_root_path
        } else {
            self.chunk_root_path.join(layer)
        }
        .join(&name))
    }

    #[turbo_tasks::function]
    async fn can_be_in_same_chunk(&self, asset_a: AssetVc, asset_b: AssetVc) -> Result<BoolVc> {
        let parent_dir = asset_a.path().parent().await?;

        let path = asset_b.path().await?;
        if let Some(rel_path) = parent_dir.get_path_to(&path) {
            if !rel_path.starts_with("node_modules/") && !rel_path.contains("/node_modules/") {
                return Ok(BoolVc::cell(true));
            }
        }

        Ok(BoolVc::cell(false))
    }

    #[turbo_tasks::function]
    fn asset_path(&self, content_hash: &str, extension: &str) -> FileSystemPathVc {
        self.asset_root_path
            .join(&format!("{content_hash}.{extension}"))
    }

    #[turbo_tasks::function]
    fn is_hot_module_replacement_enabled(&self) -> BoolVc {
        BoolVc::cell(self.enable_hot_module_replacement)
    }

    #[turbo_tasks::function]
    fn layer(&self) -> StringVc {
        self.layer
    }

    #[turbo_tasks::function]
    async fn with_layer(self_vc: DevChunkingContextVc, layer: &str) -> Result<ChunkingContextVc> {
        let DevChunkingContext {
            asset_root_path,
            chunk_root_path,
            context_path,
            enable_hot_module_replacement,
            layer: _,
        } = *self_vc.await?;
        Ok(DevChunkingContextVc::new_with_layer(
            asset_root_path,
            chunk_root_path,
            context_path,
            enable_hot_module_replacement,
            layer,
        )
        .into())
    }
}
