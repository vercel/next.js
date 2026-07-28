use std::{
    fmt::{self, Debug},
    future::Future,
    hash::{Hash, Hasher},
    sync::Arc,
};

use anyhow::{Context, Result, bail};
use async_trait::async_trait;
use bincode::{
    BorrowDecode, Decode, Encode,
    de::{BorrowDecoder, Decoder},
    enc::Encoder,
    error::{DecodeError, EncodeError},
};
use tokio::sync::OnceCell;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    NonLocalValue, OperationValue, ReadRef, ResolvedVc, State, TraitRef, Vc,
    debug::ValueDebugFormat,
    trace::{TraceRawVcs, TraceRawVcsContext},
};
use turbo_tasks_hash::HashAlgorithm;

use crate::asset::{AssetContent, no_hash_salt};

#[turbo_tasks::value(transparent)]
pub struct OptionVersionedContent(Option<ResolvedVc<Box<dyn VersionedContent>>>);

/// The content of an [`Asset`] alongside its version, returned by [`Asset::versioned_content`].
///
/// [`Asset`]: crate::asset::Asset
/// [`Asset::versioned_content`]: crate::asset::Asset::versioned_content
#[turbo_tasks::value_trait]
pub trait VersionedContent {
    /// The content of the [`Asset`].
    ///
    /// [`Asset`]: crate::asset::Asset
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<AssetContent>;

    /// Get a [`Version`] implementor that contains enough information to
    /// identify and diff a future [`VersionedContent`] against it.
    #[turbo_tasks::function]
    fn version(self: Vc<Self>) -> Vc<Box<dyn Version>>;

    /// Describes how to update the content from an earlier version to the
    /// latest available one.
    #[turbo_tasks::function]
    async fn update(self: Vc<Self>, from: Vc<Box<dyn Version>>) -> Result<Vc<Update>> {
        // By default, since we can't make any assumptions about the versioning
        // scheme of the content, we ask for a full invalidation, except in the
        // case where versions are the same.
        let to = self.version();
        let from_ref = from.into_trait_ref().await?;
        let to_ref = to.into_trait_ref().await?;

        // Fast path: versions are the same.
        if TraitRef::ptr_eq(&from_ref, &to_ref) {
            return Ok(Update::None.cell());
        }

        // The fast path might not always work since `self` might have been converted
        // from a `ReadRef` or a `ReadRef`, in which case `self.version()` would
        // return a new `Vc<Box<dyn Version>>`. In this case, we need to compare
        // version ids.
        let from_id = from_ref.id().await?;
        let to_id = to_ref.id().await?;
        Ok(if from_id == to_id {
            Update::None.cell()
        } else {
            Update::Total(TotalUpdate { to: to_ref }).cell()
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
    /// Creates a new instance from a [`Vc<AssetContent>`][AssetContent].
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

/// Describes the current version of an object, and how to update them from an earlier version.
///
/// **Important:** Implementations must not contain instances of [`Vc`]! This should describe a
/// specific version, and the value of a [`Vc`] can change due to invalidations or cache eviction.
#[async_trait]
#[turbo_tasks::value_trait]
pub trait Version {
    /// Get a unique identifier of the version as a string. There is no way
    /// to convert an id back to its original `Version`, so the original object
    /// needs to be stored somewhere.
    ///
    /// This is deliberately not a turbo-tasks function: a [`Version`] holds no [`Vc`]s, so
    /// computing an id is a pure function of data already in memory and doesn't need a cell to
    /// hold the result. Implementations that do non-trivial work here should memoize it in a
    /// [`VersionIdCache`] instead.
    ///
    /// It remains `async` only so that implementations composed of other [`Version`]s can await
    /// their ids.
    async fn id(&self) -> Result<RcStr>;
}

/// A memoized [`Version::id`].
///
/// [`Version::id`] is not a turbo-tasks function, so implementations that hash their contents
/// have no task cache to fall back on and would otherwise re-hash on every call. Embed one of
/// these in the version value and compute the id through it.
///
/// All instances compare equal and hash identically. The cached id is derived from the other
/// fields of the containing value, so it carries no information about that value's identity —
/// two otherwise-equal versions must stay equal regardless of whether either has been asked for
/// its id yet. The cache is likewise skipped when encoding, and decodes back to empty.
#[derive(Default, Clone)]
pub struct VersionIdCache(OnceCell<RcStr>);

impl VersionIdCache {
    /// Returns the cached id, computing it with `f` if this is the first call.
    ///
    /// Concurrent callers are serialized: only one of them runs `f`, and the rest await its
    /// result. If `f` fails the cache is left empty, so a later call retries rather than
    /// caching the error.
    ///
    /// `f` must not ask the *same* value for its id, which would deadlock. A composite version
    /// calling `id()` on the versions it contains is fine — those are separate caches, and the
    /// containment graph has no cycles.
    pub async fn get_or_init<F, Fut>(&self, f: F) -> Result<RcStr>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = Result<RcStr>>,
    {
        Ok(self.0.get_or_try_init(f).await?.clone())
    }
}

impl Debug for VersionIdCache {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_tuple("VersionIdCache")
            .field(&self.0.get())
            .finish()
    }
}

impl PartialEq for VersionIdCache {
    fn eq(&self, _other: &Self) -> bool {
        true
    }
}

impl Eq for VersionIdCache {}

impl Hash for VersionIdCache {
    fn hash<H: Hasher>(&self, _state: &mut H) {}
}

impl TraceRawVcs for VersionIdCache {
    fn trace_raw_vcs(&self, _trace_context: &mut TraceRawVcsContext) {}
}

impl ValueDebugFormat for VersionIdCache {
    #[cfg(debug_assertions)]
    fn value_debug_format(&self, _depth: usize) -> turbo_tasks::debug::ValueDebugFormatString<'_> {
        turbo_tasks::debug::ValueDebugFormatString::Sync(format!("{self:?}"))
    }
}

// SAFETY: `RcStr` is a plain string; a `VersionIdCache` cannot contain a `Vc`.
unsafe impl NonLocalValue for VersionIdCache {}
// SAFETY: as above.
unsafe impl OperationValue for VersionIdCache {}

impl Encode for VersionIdCache {
    fn encode<E: Encoder>(&self, _encoder: &mut E) -> Result<(), EncodeError> {
        Ok(())
    }
}

impl<Context> Decode<Context> for VersionIdCache {
    fn decode<D: Decoder<Context = Context>>(_decoder: &mut D) -> Result<Self, DecodeError> {
        Ok(Self::default())
    }
}

impl<'de, Context> BorrowDecode<'de, Context> for VersionIdCache {
    fn borrow_decode<D: BorrowDecoder<'de, Context = Context>>(
        _decoder: &mut D,
    ) -> Result<Self, DecodeError> {
        Ok(Self::default())
    }
}

/// This trait allows multiple `VersionedContent` to declare which
/// [`VersionedContentMerger`] implementation should be used for merging.
///
/// [`MergeableVersionedContent`] which return the same merger will be merged
/// together.
#[turbo_tasks::value_trait]
pub trait MergeableVersionedContent: VersionedContent {
    #[turbo_tasks::function]
    fn get_merger(self: Vc<Self>) -> Vc<Box<dyn VersionedContentMerger>>;
}

/// A [`VersionedContentMerger`] merges multiple [`VersionedContent`] into a
/// single one.
#[turbo_tasks::value_trait]
pub trait VersionedContentMerger {
    #[turbo_tasks::function]
    fn merge(self: Vc<Self>, contents: Vc<VersionedContents>) -> Vc<Box<dyn VersionedContent>>;
}

#[turbo_tasks::value(transparent)]
pub struct VersionedContents(Vec<ResolvedVc<Box<dyn VersionedContent>>>);

#[turbo_tasks::value(operation)]
pub struct NotFoundVersion;

#[turbo_tasks::value_impl]
impl NotFoundVersion {
    #[turbo_tasks::function]
    pub fn new() -> Vc<Self> {
        NotFoundVersion.cell()
    }
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Version for NotFoundVersion {
    async fn id(&self) -> Result<RcStr> {
        Ok(RcStr::default())
    }
}

/// Describes an update to a versioned object.
#[turbo_tasks::value(serialization = "skip", shared)]
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
#[derive(PartialEq, Eq, Debug, Clone, TraceRawVcs, ValueDebugFormat, NonLocalValue)]
pub struct TotalUpdate {
    /// The version this update will bring the object to.
    //
    // TODO: This trace_ignore is wrong, and could cause problems if/when we add a GC. While
    // `Version` assumes the implementation does not contain `Vc`, `EcmascriptDevChunkListVersion`
    // is broken and violates this assumption.
    #[turbo_tasks(trace_ignore)]
    pub to: TraitRef<Box<dyn Version>>,
}

/// A partial update to a versioned object.
#[derive(PartialEq, Eq, Debug, Clone, TraceRawVcs, ValueDebugFormat, NonLocalValue)]
pub struct PartialUpdate {
    /// The version this update will bring the object to.
    // TODO: This trace_ignore is *very* wrong, and could cause problems if/when we add a GC
    #[turbo_tasks(trace_ignore)]
    pub to: TraitRef<Box<dyn Version>>,
    /// The instructions to be passed to a remote system in order to update the
    /// versioned object.
    #[turbo_tasks(trace_ignore)]
    pub instruction: Arc<serde_json::Value>,
}

/// [`Version`] implementation that hashes a file at a given path and returns
/// the hex encoded hash as a version identifier.
#[turbo_tasks::value(operation)]
#[derive(Clone)]
pub struct FileHashVersion {
    hash: RcStr,
}

impl FileHashVersion {
    /// Computes a new [`Vc<FileHashVersion>`] from a path.
    pub async fn compute(asset_content: &AssetContent) -> Result<Vc<Self>> {
        match asset_content {
            AssetContent::File(file_vc) => {
                let hash = file_vc
                    .content_hash(no_hash_salt(), HashAlgorithm::Xxh3Hash128Base38)
                    .owned()
                    .await?
                    .context("file not found")?;
                Ok(Self::cell(FileHashVersion { hash }))
            }
            AssetContent::Redirect { .. } => bail!("not a file"),
        }
    }
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Version for FileHashVersion {
    async fn id(&self) -> Result<RcStr> {
        Ok(self.hash.clone())
    }
}

/// This is a dummy wrapper type to (incorrectly) implement [`OperationValue`] (required by
/// [`State`]), because the [`Version`] trait is not (yet?) a subtype of [`OperationValue`].
#[derive(Debug, Eq, PartialEq, TraceRawVcs, NonLocalValue, OperationValue)]
struct VersionRef(
    // TODO: This trace_ignore is *very* wrong, and could cause problems if/when we add a GC.
    // It also allows to `Version`s that don't implement `OperationValue`, which could lead to
    // incorrect results when attempting to strongly resolve Vcs.
    #[turbo_tasks(trace_ignore)] TraitRef<Box<dyn Version>>,
);

#[turbo_tasks::value(serialization = "skip", evict = "never")]
pub struct VersionState {
    version: State<VersionRef>,
}

#[turbo_tasks::value_impl]
impl VersionState {
    #[turbo_tasks::function]
    pub fn get(&self) -> Vc<Box<dyn Version>> {
        TraitRef::cell(self.version.get().0.clone())
    }
}

impl VersionState {
    pub async fn new(version: TraitRef<Box<dyn Version>>) -> Result<Vc<Self>> {
        Ok(Self::cell(VersionState {
            version: State::new(VersionRef(version)),
        }))
    }

    pub async fn set(self: Vc<Self>, new_version: TraitRef<Box<dyn Version>>) -> Result<()> {
        let this = self.await?;
        this.version.set(VersionRef(new_version));
        Ok(())
    }
}
