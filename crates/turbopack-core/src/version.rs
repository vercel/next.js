use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use turbo_tasks::{debug::ValueDebugFormat, primitives::StringVc, trace::TraceRawVcs};
use turbo_tasks_fs::{FileContent, FileContentVc};
use turbopack_hash::{encode_hex, hash_xxh3_hash64};

/// The content of an [Asset] alongside its version.
#[turbo_tasks::value_trait]
pub trait VersionedContent {
    /// The content of the [Asset].
    fn content(&self) -> FileContentVc;

    /// Get a unique identifier of the version as a string. There is no way
    /// to convert a version identifier back to the original `VersionedContent`,
    /// so the original object needs to be stored somewhere.
    fn version(&self) -> VersionVc;

    /// Describes how to update the content from an earlier version to the
    /// latest available one.
    async fn update(self_vc: VersionedContentVc, from: VersionVc) -> Result<UpdateVc> {
        // By default, since we can't make any assumptions about the versioning
        // scheme of the content, we ask for a full invalidation, except in the
        // case where versions are the same. And we can't compare `VersionVc`s
        // directly since `.cell_local()` breaks referential equality checks.
        let from_id = from.id();
        let to = self_vc.version();
        let to_id = to.id();
        Ok(if *from_id.await? == *to_id.await? {
            Update::None.into()
        } else {
            Update::Total(TotalUpdate { to }).into()
        })
    }
}

/// A versioned file content.
#[turbo_tasks::value]
pub struct VersionedFileContent {
    // We can't store a `FileContentVc` directly because we don't want
    // `VersionedFileContentVc` to invalidate when the content changes.
    // Otherwise, reading `content` and `version` at two different instants in
    // time might return inconsistent values.
    file_content: FileContent,
}

#[turbo_tasks::value_impl]
impl VersionedContent for VersionedFileContent {
    #[turbo_tasks::function]
    fn content(&self) -> FileContentVc {
        FileContentVc::cell(self.file_content.clone())
    }

    #[turbo_tasks::function]
    async fn version(&self) -> Result<VersionVc> {
        Ok(FileHashVersionVc::compute(&self.file_content).await?.into())
    }
}

impl VersionedFileContentVc {
    /// Creates a new [VersionedFileContentVc] from a [FileContentVc].
    pub async fn new(file_content: FileContentVc) -> Result<Self> {
        let file_content = (*file_content.strongly_consistent().await?).clone();
        Ok(Self::cell(VersionedFileContent { file_content }))
    }
}

impl From<FileContent> for VersionedFileContentVc {
    fn from(file_content: FileContent) -> Self {
        VersionedFileContent { file_content }.cell()
    }
}

impl From<FileContent> for VersionedContentVc {
    fn from(file_content: FileContent) -> Self {
        VersionedFileContent { file_content }.cell().into()
    }
}

/// Describes the current version of an object, and how to update them from an
/// earlier version.
#[turbo_tasks::value_trait]
pub trait Version {
    /// Get a unique identifier of the version as a string. There is no way
    /// to convert an id back to its original `Version`, so the original object
    /// needs to be stored somewhere.
    fn id(&self) -> StringVc;
}

/// Describes an update to a versioned object.
#[turbo_tasks::value(shared)]
#[derive(Debug)]
pub enum Update {
    /// The asset can't be meaningfully updated while the app is running, so the
    /// whole thing needs to be replaced.
    Total(TotalUpdate),

    /// The asset can (potentially) be updated to a new version by applying a
    /// specific set of instructions.
    Partial(PartialUpdate),

    /// No update required.
    None,
}

/// A total update to a versioned object.
#[derive(PartialEq, Eq, Debug, Clone, TraceRawVcs, ValueDebugFormat, Serialize, Deserialize)]
pub struct TotalUpdate {
    /// The version this update will bring the object to.
    pub to: VersionVc,
}

/// A partial update to a versioned object.
#[derive(PartialEq, Eq, Debug, Clone, TraceRawVcs, ValueDebugFormat, Serialize, Deserialize)]
pub struct PartialUpdate {
    /// The version this update will bring the object to.
    pub to: VersionVc,
    /// The instructions to be passed to a remote system in order to update the
    /// versioned object.
    // TODO(alexkirsz) Should this be a serde_json::Value?
    pub instruction: StringVc,
}

/// [`Version`] implementation that hashes a file at a given path and returns
/// the hex encoded hash as a version identifier.
#[turbo_tasks::value]
#[derive(Clone)]
pub struct FileHashVersion {
    hash: String,
}

impl FileHashVersionVc {
    /// Computes a new [`FileHashVersionVc`] from a path.
    pub async fn compute(file_content: &FileContent) -> Result<Self> {
        match file_content {
            FileContent::Content(file) => {
                let hash = hash_xxh3_hash64(file.content());
                let hex_hash = encode_hex(hash);
                Ok(Self::cell(FileHashVersion { hash: hex_hash }))
            }
            FileContent::NotFound => Err(anyhow!("file not found")),
        }
    }
}

#[turbo_tasks::value_impl]
impl Version for FileHashVersion {
    #[turbo_tasks::function]
    async fn id(&self) -> Result<StringVc> {
        Ok(StringVc::cell(self.hash.clone()))
    }
}
