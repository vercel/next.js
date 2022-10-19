use anyhow::{anyhow, Result};
use mime_guess::mime::TEXT_HTML_UTF_8;
use turbo_tasks::{debug::ValueDebug, primitives::StringVc};
use turbo_tasks_fs::{File, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{ChunkGroupVc, ChunkReferenceVc},
    reference::AssetReferencesVc,
    version::{Update, UpdateVc, Version, VersionVc, VersionedContent, VersionedContentVc},
};
use turbopack_hash::{encode_hex, Xxh3Hash64Hasher};

/// The HTML entry point of the dev server.
///
/// Generates an HTML page that includes the ES and CSS chunks.
#[turbo_tasks::value(shared)]
pub struct DevHtmlAsset {
    path: FileSystemPathVc,
    chunk_groups: Vec<ChunkGroupVc>,
}

#[turbo_tasks::value_impl]
impl Asset for DevHtmlAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.path
    }

    #[turbo_tasks::function]
    fn content(self_vc: DevHtmlAssetVc) -> AssetContentVc {
        self_vc.html_content().content()
    }

    #[turbo_tasks::function]
    async fn references(self_vc: DevHtmlAssetVc) -> Result<AssetReferencesVc> {
        let this = self_vc.await?;
        let mut references = Vec::new();
        for chunk_group in &this.chunk_groups {
            let chunks = chunk_group.chunks().await?;
            for chunk in chunks.iter() {
                references.push(ChunkReferenceVc::new(*chunk).into());
            }
        }
        Ok(AssetReferencesVc::cell(references))
    }

    #[turbo_tasks::function]
    fn versioned_content(self_vc: DevHtmlAssetVc) -> VersionedContentVc {
        self_vc.html_content().into()
    }
}

impl DevHtmlAsset {
    /// Create a new dev HTML asset.
    pub fn new(path: FileSystemPathVc, chunk_groups: Vec<ChunkGroupVc>) -> Self {
        DevHtmlAsset { path, chunk_groups }
    }
}

#[turbo_tasks::value_impl]
impl DevHtmlAssetVc {
    #[turbo_tasks::function]
    async fn html_content(self) -> Result<DevHtmlAssetContentVc> {
        let this = self.await?;
        let context_path = this.path.parent().await?;

        let mut chunk_paths = vec![];
        for chunk_group in &this.chunk_groups {
            for chunk in chunk_group.chunks().await?.iter() {
                let chunk_path = &*chunk.path().await?;
                if let Some(relative_path) = context_path.get_relative_path_to(chunk_path) {
                    chunk_paths.push(relative_path);
                }
            }
        }

        Ok(DevHtmlAssetContentVc::new(chunk_paths))
    }
}

#[turbo_tasks::value]
struct DevHtmlAssetContent {
    chunk_paths: Vec<String>,
}

impl DevHtmlAssetContentVc {
    pub fn new(chunk_paths: Vec<String>) -> Self {
        DevHtmlAssetContent { chunk_paths }.cell()
    }
}

#[turbo_tasks::value_impl]
impl DevHtmlAssetContentVc {
    #[turbo_tasks::function]
    async fn content(self) -> Result<AssetContentVc> {
        let this = self.await?;

        let mut scripts = Vec::new();
        let mut stylesheets = Vec::new();

        for relative_path in &*this.chunk_paths {
            if relative_path.ends_with(".js") {
                scripts.push(format!("<script src=\"{}\"></script>", relative_path));
            } else if relative_path.ends_with(".css") {
                stylesheets.push(format!(
                    "<link data-turbopack rel=\"stylesheet\" href=\"{}\">",
                    relative_path
                ));
            } else {
                return Err(anyhow!("chunk with unknown asset type: {}", relative_path));
            }
        }

        let html = format!(
            "<!DOCTYPE html>\n<html>\n<head>\n{}\n</head>\n<body>\n<div \
             id=root></div>\n{}\n</body>\n</html>",
            stylesheets.join("\n"),
            scripts.join("\n"),
        );

        Ok(File::from(html).with_content_type(TEXT_HTML_UTF_8).into())
    }

    #[turbo_tasks::function]
    async fn version(self) -> Result<DevHtmlAssetVersionVc> {
        let this = self.await?;
        Ok(DevHtmlAssetVersion { content: this }.cell())
    }
}

#[turbo_tasks::value_impl]
impl VersionedContent for DevHtmlAssetContent {
    #[turbo_tasks::function]
    fn content(self_vc: DevHtmlAssetContentVc) -> AssetContentVc {
        self_vc.content()
    }

    #[turbo_tasks::function]
    fn version(self_vc: DevHtmlAssetContentVc) -> VersionVc {
        self_vc.version().into()
    }

    #[turbo_tasks::function]
    async fn update(self_vc: DevHtmlAssetContentVc, from_version: VersionVc) -> Result<UpdateVc> {
        let from_version = DevHtmlAssetVersionVc::resolve_from(from_version)
            .await?
            .expect("version must be an `DevHtmlAssetVersionVc`");
        let to_version = self_vc.version();

        let to = to_version.await?;
        let from = from_version.await?;

        if to.content.chunk_paths == from.content.chunk_paths {
            return Ok(Update::None.into());
        }

        Err(anyhow!(
            "cannot update `DevHtmlAssetContentVc` from version {:?} to version {:?}: the \
             versions contain different chunks, which is not yet supported",
            from_version.dbg().await?,
            to_version.dbg().await?,
        ))
    }
}

#[turbo_tasks::value]
struct DevHtmlAssetVersion {
    content: DevHtmlAssetContentReadRef,
}

#[turbo_tasks::value_impl]
impl Version for DevHtmlAssetVersion {
    #[turbo_tasks::function]
    async fn id(&self) -> Result<StringVc> {
        let mut hasher = Xxh3Hash64Hasher::new();
        for relative_path in &*self.content.chunk_paths {
            hasher.write(relative_path.as_bytes());
        }
        let hash = hasher.finish();
        let hex_hash = encode_hex(hash);
        Ok(StringVc::cell(hex_hash))
    }
}
