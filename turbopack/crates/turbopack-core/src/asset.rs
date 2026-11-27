use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{
    ComposedFile, FileContent, FileJsonContent, FileLinesContent, FileSystemPath, WriteLinkContent,
    rope::Rope,
};
use turbo_tasks_hash::HashAlgorithm;

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

    /// The size of the content of the `Asset` in bytes, or `None` for redirects or missing files.
    #[turbo_tasks::function]
    fn size(self: Vc<Self>) -> Vc<Option<u64>> {
        self.content().len()
    }
}

/// The bytes of an [`AssetContent`], see [`AssetContent::as_rope`]. `None` for a redirect or a
/// missing file.
///
/// Only hashed in the persistent cache, like [`FileContent`]: the bytes are already persisted (or
/// re-read) by whatever produced the content, so storing another copy would only grow the cache.
/// After a restore, the bytes are recomputed when the cell is read.
#[turbo_tasks::value(transparent, serialization = "hash")]
pub struct OptionRope(Option<Rope>);

#[turbo_tasks::value(shared)]
#[derive(Clone)]
pub enum AssetContent {
    File(ResolvedVc<FileContent>),
    /// A file composed from other tasks' cells. It behaves like a [`AssetContent::File`] with the
    /// same bytes, but creating it doesn't read them, and writing it persists only references to
    /// the cells (see [`FileSystemPath::write_composed`]).
    Composed(ResolvedVc<ComposedFile>),
    /// A symbolic link. See [`WriteLinkContent`] for how it is written.
    Redirect(WriteLinkContent),
}

impl AssetContent {
    /// The content of a file (flat or composed), without reading it. `None` for a redirect.
    pub fn as_file_content(&self) -> Option<Vc<FileContent>> {
        match self {
            AssetContent::File(content) => Some(**content),
            AssetContent::Composed(composed) => Some(composed.content()),
            AssetContent::Redirect(..) => None,
        }
    }
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
            AssetContent::Composed(composed) => composed.content().parse_json(),
            AssetContent::Redirect(..) => {
                FileJsonContent::unparsable(rcstr!("a redirect can't be parsed as json")).cell()
            }
        }
    }

    /// The content's bytes (of a flat or composed file), or `None` for a redirect or a missing
    /// file. Use [`AssetContent::as_file_content`] when the file's [`FileMeta`] is needed.
    ///
    /// [`FileMeta`]: turbo_tasks_fs::FileMeta
    #[turbo_tasks::function]
    pub async fn as_rope(&self) -> Result<Vc<OptionRope>> {
        Ok(Vc::cell(match self {
            AssetContent::File(content) => match &*content.await? {
                FileContent::Content(file) => Some(file.content().clone()),
                FileContent::NotFound => None,
            },
            // Reads the rope directly (tracked, like `ComposedFile::content`), without a
            // `FileContent` holding the same bytes.
            AssetContent::Composed(composed) => Some(composed.await?.rope().await?.read().await?),
            AssetContent::Redirect(..) => None,
        }))
    }

    #[turbo_tasks::function]
    pub fn lines(&self) -> Vc<FileLinesContent> {
        match self {
            AssetContent::File(content) => content.lines(),
            AssetContent::Composed(composed) => composed.content().lines(),
            AssetContent::Redirect(..) => FileLinesContent::Unparsable.cell(),
        }
    }

    #[turbo_tasks::function]
    pub fn len(&self) -> Vc<Option<u64>> {
        match self {
            AssetContent::File(content) => content.len(),
            AssetContent::Composed(composed) => composed.content().len(),
            AssetContent::Redirect(..) => Vc::cell(None),
        }
    }

    #[turbo_tasks::function]
    pub fn parse_json_with_comments(&self) -> Vc<FileJsonContent> {
        match self {
            AssetContent::File(content) => content.parse_json_with_comments(),
            AssetContent::Composed(composed) => composed.content().parse_json_with_comments(),
            AssetContent::Redirect(..) => {
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
            AssetContent::Composed(composed) => {
                path.write_composed(**composed).as_side_effect().await?;
            }
            AssetContent::Redirect(content) => {
                path.write_link(content.clone().cell())
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
            AssetContent::Composed(composed) => composed.content().hash(salt, algorithm),
            AssetContent::Redirect(content) => {
                Vc::cell(content.hash(&*salt.await?, algorithm).await?)
            }
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
            AssetContent::Composed(composed) => {
                Ok(composed.content().content_hash(salt, algorithm))
            }
            AssetContent::Redirect(..) => Ok(Vc::cell(None)),
        }
    }
}

#[cfg(test)]
mod tests {
    use anyhow::Result;
    use turbo_tasks::{ValueTypePersistence, Vc, VcValueType, registry};
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
    use turbo_tasks_fs::{CellRopeBuilder, ComposedFile, File, FileContent, FileMeta};

    use super::{AssetContent, OptionRope};

    #[turbo_tasks::value(transparent)]
    struct Bytes(Vec<Option<String>>);

    /// The bytes of a flat file, a missing file and a composed file.
    #[turbo_tasks::function(operation, root)]
    async fn as_rope_operation() -> Result<Vc<Bytes>> {
        let flat = AssetContent::file(FileContent::Content(File::from("flat")).cell());
        let missing = AssetContent::file(FileContent::NotFound.cell());
        let mut builder = CellRopeBuilder::default();
        builder += "composed";
        let composed = AssetContent::Composed(
            ComposedFile::new(builder.build_resolved_cell(), FileMeta::default()).resolved_cell(),
        )
        .cell();
        let mut bytes = Vec::new();
        for content in [flat, missing, composed] {
            bytes.push(
                content
                    .as_rope()
                    .await?
                    .as_ref()
                    .map(|rope| rope.to_str().map(|s| s.into_owned()))
                    .transpose()?,
            );
        }
        Ok(Vc::cell(bytes))
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn as_rope_reads_flat_and_composed_bytes() {
        turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ))
        .run_once(async {
            let bytes = as_rope_operation().read_strongly_consistent().await?;
            assert_eq!(
                *bytes,
                [Some("flat".to_string()), None, Some("composed".to_string())]
            );
            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    /// The bytes are persisted by whatever produced the content; `OptionRope` keeps only a hash.
    #[test]
    fn option_rope_is_only_hashed_in_the_persistent_cache() {
        let value_type = registry::get_value_type(OptionRope::get_value_type_id());
        assert!(matches!(
            value_type.persistence,
            ValueTypePersistence::HashOnly
        ));
    }
}
