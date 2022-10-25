use anyhow::Result;
use indexmap::IndexSet;
use turbo_tasks::CompletionVc;
use turbo_tasks_fs::{
    File, FileContent, FileContentVc, FileJsonContent, FileJsonContentVc, FileLinesContent,
    FileLinesContentVc, FileSystemPathVc, LinkContent, LinkType,
};

use crate::{
    reference::AssetReferencesVc,
    version::{VersionedAssetContentVc, VersionedContentVc},
};

/// A list of [Asset]s
#[turbo_tasks::value(shared, transparent)]
#[derive(Hash)]
pub struct Assets(Vec<AssetVc>);

/// A set of [Asset]s
#[turbo_tasks::value(shared, transparent)]
pub struct AssetsSet(IndexSet<AssetVc>);

#[turbo_tasks::value_impl]
impl AssetsVc {
    /// Creates an empty list of [Asset]s
    #[turbo_tasks::function]
    pub fn empty() -> Self {
        Assets(Vec::new()).into()
    }
}

/// An asset. It also forms a graph when following [Asset::references].
#[turbo_tasks::value_trait]
pub trait Asset {
    /// The path of the [Asset]. It can potentially be a virtual path.
    /// It's not expected to be something you can read to or write from in
    /// general, only some [Asset] types have these property. It's more like
    /// a name/identifier of the [Asset].
    fn path(&self) -> FileSystemPathVc;

    /// The content of the [Asset].
    fn content(&self) -> AssetContentVc;

    /// Other things (most likely [Asset]s) referenced from this [Asset].
    fn references(&self) -> AssetReferencesVc;

    /// The content of the [Asset] alongside its version.
    async fn versioned_content(&self) -> Result<VersionedContentVc> {
        Ok(VersionedAssetContentVc::new(self.content()).into())
    }
}

/// An optional [Asset]
#[turbo_tasks::value(shared, transparent)]
pub struct AssetOption(Option<AssetVc>);

#[turbo_tasks::value(shared)]
#[derive(Clone)]
pub enum AssetContent {
    File(FileContentVc),
    // for the relative link, the target is raw value read from the link
    // for the absolute link, the target is stripped of the root path while reading
    // See [LinkContent::Link] for more details.
    Redirect { target: String, link_type: LinkType },
}

impl From<FileContentVc> for AssetContentVc {
    fn from(content: FileContentVc) -> Self {
        AssetContent::File(content).cell()
    }
}

impl From<FileContent> for AssetContentVc {
    fn from(content: FileContent) -> Self {
        AssetContent::File(content.cell()).cell()
    }
}

impl From<File> for AssetContentVc {
    fn from(file: File) -> Self {
        AssetContent::File(file.into()).cell()
    }
}

#[turbo_tasks::value_impl]
impl AssetContentVc {
    #[turbo_tasks::function]
    pub async fn parse_json(self) -> Result<FileJsonContentVc> {
        let this = self.await?;
        match &*this {
            AssetContent::File(content) => Ok(content.parse_json()),
            AssetContent::Redirect { .. } => Ok(FileJsonContent::Unparseable.cell()),
        }
    }

    #[turbo_tasks::function]
    pub async fn lines(self) -> Result<FileLinesContentVc> {
        let this = self.await?;
        match &*this {
            AssetContent::File(content) => Ok(content.lines()),
            AssetContent::Redirect { .. } => Ok(FileLinesContent::Unparseable.cell()),
        }
    }

    #[turbo_tasks::function]
    pub async fn parse_json_with_comments(self) -> Result<FileJsonContentVc> {
        let this = self.await?;
        match &*this {
            AssetContent::File(content) => Ok(content.parse_json_with_comments()),
            AssetContent::Redirect { .. } => Ok(FileJsonContent::Unparseable.cell()),
        }
    }

    #[turbo_tasks::function]
    pub async fn write(self, path: FileSystemPathVc) -> Result<CompletionVc> {
        let this = self.await?;
        Ok(match &*this {
            AssetContent::File(file) => path.write(*file),
            AssetContent::Redirect { target, link_type } => path.write_link(
                LinkContent::Link {
                    target: target.clone(),
                    link_type: *link_type,
                }
                .cell(),
            ),
        })
    }
}
