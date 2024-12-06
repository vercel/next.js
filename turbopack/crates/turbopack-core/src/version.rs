use std::sync::Arc;

use anyhow::{anyhow, Result};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    debug::ValueDebugFormat, trace::TraceRawVcs, IntoTraitRef, ReadRef, ResolvedVc, State,
    TraitRef, Vc,
};
use turbo_tasks_fs::{FileContent, LinkType};
use turbo_tasks_hash::{encode_hex, hash_xxh3_hash64};

use crate::asset::AssetContent;

#[turbo_tasks::value(transparent)]
pub struct OptionVersionedContent(Option<ResolvedVc<Box<dyn VersionedContent>>>);

/// The content of an [Asset] alongside its version.
#[turbo_tasks::value_trait]
pub trait VersionedContent {
    /// The content of the [Asset].
    fn content(self: Vc<Self>) -> Vc<AssetContent>;

    /// Get a [`Version`] implementor that contains enough information to
    /// identify and diff a future [`VersionedContent`] against it.
    fn version(self: Vc<Self>) -> Vc<Box<dyn Version>>;

    /// Describes how to update the content from an earlier version to the
    /// latest available one.
    async fn update(self: Vc<Self>, from: Vc<Box<dyn Version>>) -> Result<Vc<Update>> {
        // By default, since we can't make any assumptions about the versioning
        // scheme of the content, we ask for a full invalidation, except in the
        // case where versions are the same.
        let to = self.version();
        let from_ref = from.into_trait_ref().await?;
        let to_ref = to.into_trait_ref().await?;

        // Fast path: versions are the same.
        if from_ref == to_ref {
            return Ok(Update::None.into());
        }

        // The fast path might not always work since `self` might have been converted
        // from a `ReadRef` or a `ReadRef`, in which case `self.version()` would
        // return a new `Vc<Box<dyn Version>>`. In this case, we need to compare
        // version ids.
        let from_id = from.id();
        let to_id = to.id();
        let from_id = from_id.await?;
        let to_id = to_id.await?;
        Ok(if *from_id == *to_id {
            Update::None.into()
        } else {
            Update::Total(TotalUpdate { to: to_ref }).into()
        })
    }
}

/// A versioned file content.
#[turbo_tasks::value]
pub struct VersionedAssetContent {
    // We can't store a `Vc<FileContent>` directly because we don't want
    // `Vc<VersionedAssetContent>` to invalidate when the content changes.
    // Otherwise, reading `content` and `version` at two different instants in
    // time might return inconsistent values.
    asset_content: ReadRef<AssetContent>,
}

#[turbo_tasks::value]
#[derive(Clone)]
enum AssetContentSnapshot {
    File(ReadRef<FileContent>),
    Redirect { target: String, link_type: LinkType },
}

#[turbo_tasks::value_impl]
impl VersionedContent for VersionedAssetContent {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        (*self.asset_content).clone().cell()
    }

    #[turbo_tasks::function]
    async fn version(&self) -> Result<Vc<Box<dyn Version>>> {
        Ok(Vc::upcast(
            FileHashVersion::compute(&self.asset_content).await?,
        ))
    }
}

#[turbo_tasks::value_impl]
impl VersionedAssetContent {
    #[turbo_tasks::function]
    /// Creates a new [Vc<VersionedAssetContent>] from a [Vc<FileContent>].
    pub async fn new(asset_content: Vc<AssetContent>) -> Result<Vc<Self>> {
        let asset_content = asset_content.await?;
        Ok(Self::cell(VersionedAssetContent { asset_content }))
    }
}

impl From<AssetContent> for Vc<VersionedAssetContent> {
    fn from(asset_content: AssetContent) -> Self {
        VersionedAssetContent::new(asset_content.cell())
    }
}

impl From<AssetContent> for Vc<Box<dyn VersionedContent>> {
    fn from(asset_content: AssetContent) -> Self {
        Vc::upcast(VersionedAssetContent::new(asset_content.cell()))
    }
}

pub trait VersionedContentExt: Send {
    fn versioned(self: Vc<Self>) -> Vc<Box<dyn VersionedContent>>;
}

impl VersionedContentExt for AssetContent {
    fn versioned(self: Vc<Self>) -> Vc<Box<dyn VersionedContent>> {
        Vc::upcast(VersionedAssetContent::new(self))
    }
}

/// Describes the current version of an object, and how to update them from an
/// earlier version.
#[turbo_tasks::value_trait]
pub trait Version {
    /// Get a unique identifier of the version as a string. There is no way
    /// to convert an id back to its original `Version`, so the original object
    /// needs to be stored somewhere.
    fn id(self: Vc<Self>) -> Vc<RcStr>;
}

/// This trait allows multiple `VersionedContent` to declare which
/// [`VersionedContentMerger`] implementation should be used for merging.
///
/// [`MergeableVersionedContent`] which return the same merger will be merged
/// together.
#[turbo_tasks::value_trait]
pub trait MergeableVersionedContent: VersionedContent {
    fn get_merger(self: Vc<Self>) -> Vc<Box<dyn VersionedContentMerger>>;
}

/// A [`VersionedContentMerger`] merges multiple [`VersionedContent`] into a
/// single one.
#[turbo_tasks::value_trait]
pub trait VersionedContentMerger {
    fn merge(self: Vc<Self>, contents: Vc<VersionedContents>) -> Vc<Box<dyn VersionedContent>>;
}

#[turbo_tasks::value(transparent)]
pub struct VersionedContents(Vec<ResolvedVc<Box<dyn VersionedContent>>>);

#[turbo_tasks::value]
pub struct NotFoundVersion;

#[turbo_tasks::value_impl]
impl NotFoundVersion {
    #[turbo_tasks::function]
    pub fn new() -> Vc<Self> {
        NotFoundVersion.cell()
    }
}

#[turbo_tasks::value_impl]
impl Version for NotFoundVersion {
    #[turbo_tasks::function]
    fn id(&self) -> Vc<RcStr> {
        Vc::cell(Default::default())
    }
}

/// Describes an update to a versioned object.
#[turbo_tasks::value(serialization = "none", shared)]
#[derive(Debug)]
pub enum Update {
    /// The asset can't be meaningfully updated while the app is running, so the
    /// whole thing needs to be replaced.
    Total(TotalUpdate),

    /// The asset can (potentially) be updated to a new version by applying a
    /// specific set of instructions.
    Partial(PartialUpdate),

    // The asset is now missing, so it can't be updated. A full reload is required.
    Missing,

    /// No update required.
    None,
}

/// A total update to a versioned object.
#[derive(PartialEq, Eq, Debug, Clone, TraceRawVcs, ValueDebugFormat)]
pub struct TotalUpdate {
    /// The version this update will bring the object to.
    #[turbo_tasks(trace_ignore)]
    pub to: TraitRef<Box<dyn Version>>,
}

/// A partial update to a versioned object.
#[derive(PartialEq, Eq, Debug, Clone, TraceRawVcs, ValueDebugFormat)]
pub struct PartialUpdate {
    /// The version this update will bring the object to.
    #[turbo_tasks(trace_ignore)]
    pub to: TraitRef<Box<dyn Version>>,
    /// The instructions to be passed to a remote system in order to update the
    /// versioned object.
    #[turbo_tasks(trace_ignore)]
    pub instruction: Arc<serde_json::Value>,
}

/// [`Version`] implementation that hashes a file at a given path and returns
/// the hex encoded hash as a version identifier.
#[turbo_tasks::value]
#[derive(Clone)]
pub struct FileHashVersion {
    hash: RcStr,
}

impl FileHashVersion {
    /// Computes a new [`Vc<FileHashVersion>`] from a path.
    pub async fn compute(asset_content: &AssetContent) -> Result<Vc<Self>> {
        match asset_content {
            AssetContent::File(file_vc) => match &*file_vc.await? {
                FileContent::Content(file) => {
                    let hash = hash_xxh3_hash64(file.content());
                    let hex_hash = encode_hex(hash);
                    Ok(Self::cell(FileHashVersion {
                        hash: hex_hash.into(),
                    }))
                }
                FileContent::NotFound => Err(anyhow!("file not found")),
            },
            AssetContent::Redirect { .. } => Err(anyhow!("not a file")),
        }
    }
}

#[turbo_tasks::value_impl]
impl Version for FileHashVersion {
    #[turbo_tasks::function]
    fn id(&self) -> Vc<RcStr> {
        Vc::cell(self.hash.clone())
    }
}

#[turbo_tasks::value(serialization = "none")]
pub struct VersionState {
    #[turbo_tasks(trace_ignore)]
    version: State<TraitRef<Box<dyn Version>>>,
}

#[turbo_tasks::value_impl]
impl VersionState {
    #[turbo_tasks::function]
    pub fn get(&self) -> Vc<Box<dyn Version>> {
        let version = TraitRef::cell(self.version.get().clone());
        version
    }
}

impl VersionState {
    pub async fn new(version: TraitRef<Box<dyn Version>>) -> Result<Vc<Self>> {
        Ok(Self::cell(VersionState {
            version: State::new(version),
        }))
    }

    pub async fn set(self: Vc<Self>, new_version: TraitRef<Box<dyn Version>>) -> Result<()> {
        let this = self.await?;
        this.version.set(new_version);
        Ok(())
    }
}
