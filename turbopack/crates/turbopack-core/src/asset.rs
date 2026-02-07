use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{
    FileContent, FileJsonContent, FileLinesContent, FileSystemPath, LinkContent, LinkType,
};
use turbo_tasks_hash::Xxh3Hash64Hasher;

use crate::version::{VersionedAssetContent, VersionedContent};

/// An asset. It also forms a graph when following [Asset::references].
#[turbo_tasks::value_trait]
pub trait Asset {
    /// The content of the [Asset].
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<AssetContent>;

    /// The content of the [Asset] alongside its version.
    #[turbo_tasks::function]
    fn versioned_content(self: Vc<Self>) -> Result<Vc<Box<dyn VersionedContent>>> {
        Ok(Vc::upcast(VersionedAssetContent::new(self.content())))
    }
}

#[turbo_tasks::value(shared)]
#[derive(Clone)]
pub enum AssetContent {
    File(ResolvedVc<FileContent>),
    // for the relative link, the target is raw value read from the link
    // for the absolute link, the target is stripped of the root path while reading
    // See [LinkContent::Link] for more details.
    Redirect { target: RcStr, link_type: LinkType },
}

#[turbo_tasks::value_impl]
impl AssetContent {
    #[turbo_tasks::function]
    pub fn file(file: ResolvedVc<FileContent>) -> Result<Vc<Self>> {
        Ok(AssetContent::File(file).cell())
    }

    #[turbo_tasks::function]
    pub fn parse_json(&self) -> Vc<FileJsonContent> {
        match self {
            AssetContent::File(content) => content.parse_json(),
            AssetContent::Redirect { .. } => {
                FileJsonContent::unparsable(rcstr!("a redirect can't be parsed as json")).cell()
            }
        }
    }

    #[turbo_tasks::function]
    pub fn file_content(&self) -> Vc<FileContent> {
        match self {
            AssetContent::File(content) => **content,
            AssetContent::Redirect { .. } => FileContent::NotFound.cell(),
        }
    }

    #[turbo_tasks::function]
    pub fn lines(&self) -> Vc<FileLinesContent> {
        match self {
            AssetContent::File(content) => content.lines(),
            AssetContent::Redirect { .. } => FileLinesContent::Unparsable.cell(),
        }
    }

    #[turbo_tasks::function]
    pub fn len(&self) -> Vc<Option<u64>> {
        match self {
            AssetContent::File(content) => content.len(),
            AssetContent::Redirect { .. } => Vc::cell(None),
        }
    }

    #[turbo_tasks::function]
    pub fn parse_json_with_comments(&self) -> Vc<FileJsonContent> {
        match self {
            AssetContent::File(content) => content.parse_json_with_comments(),
            AssetContent::Redirect { .. } => {
                FileJsonContent::unparsable(rcstr!("a redirect can't be parsed as json")).cell()
            }
        }
    }

    #[turbo_tasks::function]
    pub async fn write(&self, path: FileSystemPath) -> Result<()> {
        match self {
            AssetContent::File(file) => {
                path.write(**file).as_side_effect().await?;
            }
            AssetContent::Redirect { target, link_type } => {
                path.write_symbolic_link_dir(
                    LinkContent::Link {
                        target: target.clone(),
                        link_type: *link_type,
                    }
                    .cell(),
                )
                .as_side_effect()
                .await?;
            }
        }
        Ok(())
    }

    #[turbo_tasks::function]
    pub async fn hash(&self) -> Result<Vc<u64>> {
        match self {
            AssetContent::File(content) => Ok(content.hash()),
            AssetContent::Redirect { target, link_type } => {
                use turbo_tasks_hash::DeterministicHash;
                let mut hasher = Xxh3Hash64Hasher::new();
                target.deterministic_hash(&mut hasher);
                link_type.deterministic_hash(&mut hasher);
                Ok(Vc::cell(hasher.finish()))
            }
        }
    }
}
