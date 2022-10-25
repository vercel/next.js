use anyhow::Result;
use turbo_tasks::{
    primitives::{BoolVc, StringVc},
    Value, ValueToString,
};
use turbo_tasks_fs::FileSystemPathVc;
use turbo_tasks_hash::{encode_hex, hash_xxh3_hash64};

use super::{ChunkingContext, ChunkingContextVc};
use crate::asset::AssetVc;

pub struct DevChunkingContextBuilder {
    context: DevChunkingContext,
}

impl DevChunkingContextBuilder {
    pub fn hot_module_replacment(mut self) -> Self {
        self.context.enable_hot_module_replacement = true;
        self
    }

    pub fn layer(mut self, layer: &str) -> Self {
        self.context.layer = (!layer.is_empty()).then(|| layer.to_string());
        self
    }

    pub fn css_chunk_root_path(mut self, path: FileSystemPathVc) -> Self {
        self.context.css_chunk_root_path = Some(path);
        self
    }

    pub fn build(self) -> ChunkingContextVc {
        DevChunkingContextVc::new(Value::new(self.context)).into()
    }
}

/// A chunking context for development mode.
/// It uses readable filenames and module ids to improve development.
/// It also uses a chunking heuristic that is incremental and cacheable.
/// It splits "node_modules" separately as these are less likely to change
/// during development
#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Clone, Hash, PartialOrd, Ord)]
pub struct DevChunkingContext {
    /// This path get striped off of path before creating a name out of it
    context_path: FileSystemPathVc,
    /// This path is used to compute the url to request chunks or assets from
    output_root_path: FileSystemPathVc,
    /// Chunks are placed at this path
    chunk_root_path: FileSystemPathVc,
    /// Css Chunks are placed at this path
    css_chunk_root_path: Option<FileSystemPathVc>,
    /// Static assets are placed at this path
    asset_root_path: FileSystemPathVc,
    /// Layer name within this context
    layer: Option<String>,
    /// Enable HMR for this chunking
    enable_hot_module_replacement: bool,
}

impl DevChunkingContextVc {
    pub fn builder(
        context_path: FileSystemPathVc,
        output_root_path: FileSystemPathVc,
        chunk_root_path: FileSystemPathVc,
        asset_root_path: FileSystemPathVc,
    ) -> DevChunkingContextBuilder {
        DevChunkingContextBuilder {
            context: DevChunkingContext {
                context_path,
                output_root_path,
                chunk_root_path,
                css_chunk_root_path: None,
                asset_root_path,
                layer: None,
                enable_hot_module_replacement: false,
            },
        }
    }
}

#[turbo_tasks::value_impl]
impl DevChunkingContextVc {
    #[turbo_tasks::function]
    fn new(this: Value<DevChunkingContext>) -> Self {
        this.into_value().cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkingContext for DevChunkingContext {
    #[turbo_tasks::function]
    fn output_root(&self) -> FileSystemPathVc {
        self.output_root_path
    }

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
        if name.ends_with(extension) {
            name.truncate(name.len() - extension.len());
        }

        // Location in "path" where hashed and named parts are split.
        // Everything before i is hashed and after i named.
        let mut i = 0;
        static NODE_MODULES: &str = "_node_modules_";
        if let Some(j) = name.rfind(NODE_MODULES) {
            i = j + NODE_MODULES.len();
        }
        const MAX_FILENAME: usize = 80;
        if name.len() - i > MAX_FILENAME {
            i = name.len() - MAX_FILENAME;
            if let Some(j) = name[i..].find('_') {
                if j < 20 {
                    i += j + 1;
                }
            }
        }
        if i > 0 {
            let hash = encode_hex(hash_xxh3_hash64(name[..i].as_bytes()));
            let truncated_hash = &hash[..5];
            name = format!("{}_{}", truncated_hash, &name[i..]);
        }
        if !name.ends_with(extension) {
            name += extension;
        }
        let mut root_path = self.chunk_root_path;
        #[allow(clippy::single_match, reason = "future extensions")]
        match extension {
            ".css" => {
                if let Some(path) = self.css_chunk_root_path {
                    root_path = path;
                }
            }
            _ => {}
        }
        let root_path = if let Some(layer) = self.layer.as_deref() {
            root_path.join(layer)
        } else {
            root_path
        };
        Ok(root_path.join(&name))
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
        StringVc::cell(self.layer.clone().unwrap_or_default())
    }

    #[turbo_tasks::function]
    async fn with_layer(self_vc: DevChunkingContextVc, layer: &str) -> Result<ChunkingContextVc> {
        let mut context = self_vc.await?.clone_value();
        context.layer = (!layer.is_empty()).then(|| layer.to_string());
        Ok(DevChunkingContextVc::new(Value::new(context)).into())
    }
}
