use anyhow::{Result, bail};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{
    FileContent, FileJsonContent, FileLinesContent, FileSystemPath, LinkContent, LinkTarget,
};
use turbo_tasks_hash::{HashAlgorithm, deterministic_hash};

use crate::version::{VersionedAssetContent, VersionedContent};

/// Returns an empty salt `Vc<RcStr>` meaning "no salt applied to this hash".
///
/// Use this instead of `Vc::cell(RcStr::default())` at call sites that don't control the
/// hash salt — e.g. internal hashes not exposed to the user as filenames.
#[turbo_tasks::function]
pub fn no_hash_salt() -> Vc<RcStr> {
    Vc::cell(RcStr::default())
}

/// A file or intermediate result containing content as a [`Rope`] or a symlink.
///
/// This is a supertrait for [`Source`], [`OutputAsset`], and [`OutputChunk`].
///
/// [`Rope`]: turbo_tasks_fs::rope::Rope
/// [`Source`]: crate::source::Source
/// [`OutputAsset`]: crate::output::OutputAsset
/// [`OutputChunk`]: crate::chunk::OutputChunk
#[turbo_tasks::value_trait]
pub trait Asset {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<AssetContent>;

    /// The content of the `Asset` alongside its version.
    #[turbo_tasks::function]
    fn versioned_content(self: Vc<Self>) -> Result<Vc<Box<dyn VersionedContent>>> {
        Ok(Vc::upcast(VersionedAssetContent::new(self.content())))
    }

    /// Hash of the content of the `Asset`. If `salt` is non-empty it is mixed
    /// into the hash in a single pass before the file bytes.
    #[turbo_tasks::function]
    fn content_hash(
        self: Vc<Self>,
        salt: Vc<RcStr>,
        algorithm: HashAlgorithm,
    ) -> Vc<Option<RcStr>> {
        self.content().content_hash(salt, algorithm)
    }
}

#[turbo_tasks::value(shared)]
#[derive(Clone)]
pub enum AssetContent {
    File(ResolvedVc<FileContent>),
    // for the relative link, the target is raw value read from the link
    // for the absolute link, the target is stripped of the root path while reading
    // `is_directory` preserves the target type read from disk so file links cannot be silently
    // recreated as directory links.
    // See [LinkContent::Link] for more details.
    Redirect {
        target: LinkTarget,
        is_directory: bool,
    },
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
            AssetContent::Redirect {
                target,
                is_directory,
            } => {
                // This is slightly narrower than necessary: a junction can point to another
                // junction. In practice, we never write nested links, so requiring a directory
                // here is sufficient.
                if !is_directory {
                    bail!(
                        "cannot create file link to {target:?}: only directory links are \
                         supported, because Windows junction points have no file equivalent and \
                         file symlinks require elevated privileges"
                    );
                }
                path.write_dir_link(LinkContent::Link(target.clone()).cell())
                    .as_side_effect()
                    .await?;
            }
        }
        Ok(())
    }

    #[turbo_tasks::function]
    pub async fn hash(&self, salt: Vc<RcStr>, algorithm: HashAlgorithm) -> Result<Vc<RcStr>> {
        Ok(match self {
            AssetContent::File(content) => content.hash(salt, algorithm),
            AssetContent::Redirect {
                target,
                is_directory,
            } => Vc::cell(RcStr::from(
                // no_hash_salt
                deterministic_hash(&salt.await?, (target, is_directory), algorithm),
            )),
        })
    }

    /// Compared to [AssetContent::hash], this hashes only the bytes of the file content and
    /// nothing else, returning `None` for redirects or missing files.
    ///
    /// If `salt` is non-empty it is written into the hasher before the file bytes in a single
    /// pass. An empty salt produces the same result as hashing without a prefix.
    #[turbo_tasks::function]
    pub async fn content_hash(
        &self,
        salt: Vc<RcStr>,
        algorithm: HashAlgorithm,
    ) -> Result<Vc<Option<RcStr>>> {
        match self {
            AssetContent::File(content) => Ok(content.content_hash(salt, algorithm)),
            AssetContent::Redirect { .. } => Ok(Vc::cell(None)),
        }
    }
}
