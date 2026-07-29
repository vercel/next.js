use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{FileContent, FileSystemPath};

use crate::{
    asset::{Asset, AssetContent},
    chunk::{OutputChunk, OutputChunkRuntimeInfo},
    output::{OutputAsset, OutputAssetsReference, OutputAssetsWithReferenced},
    source_map::GenerateSourceMap,
    version::VersionedContent,
};

/// An [`OutputAsset`] that is registered by path, but whose content and references are not
/// generated while the owning endpoint is emitted.
///
/// Emitting skips lazy assets, and output asset expansion stops at them instead of walking their
/// references. Serving the path materializes the boundary: [`Self::references`] yields the wrapped
/// asset *and* everything it references, so a single expansion registers both the requested path
/// and every sibling it pulls in.
///
/// Everything else is forwarded, so a materialized lazy asset behaves exactly like the asset it
/// wraps.
#[turbo_tasks::value]
pub struct LazyOutputAsset {
    inner: ResolvedVc<Box<dyn OutputAsset>>,
}

#[turbo_tasks::value_impl]
impl LazyOutputAsset {
    #[turbo_tasks::function]
    pub fn new(inner: ResolvedVc<Box<dyn OutputAsset>>) -> Vc<Self> {
        LazyOutputAsset { inner }.cell()
    }
}

impl LazyOutputAsset {
    /// Whether `asset` is a lazy output boundary.
    ///
    /// A local type check rather than a method on [`OutputAsset`], so that the callers that ask
    /// this of every asset they walk — expansion and emitting — don't pay a turbo-tasks call
    /// per asset.
    pub fn is_lazy(asset: ResolvedVc<Box<dyn OutputAsset>>) -> bool {
        ResolvedVc::try_downcast_type::<LazyOutputAsset>(asset).is_some()
    }
}

#[turbo_tasks::value_impl]
impl Asset for LazyOutputAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.inner.content()
    }

    #[turbo_tasks::function]
    fn versioned_content(&self) -> Vc<Box<dyn VersionedContent>> {
        self.inner.versioned_content()
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for LazyOutputAsset {
    #[turbo_tasks::function]
    fn references(&self) -> Vc<OutputAssetsWithReferenced> {
        self.inner.references().concatenate_asset(*self.inner)
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for LazyOutputAsset {
    #[turbo_tasks::function]
    fn path(&self) -> Vc<FileSystemPath> {
        self.inner.path()
    }
}

// The wrapped asset is typically a chunk, and callers reach for these two traits by sidecasting the
// asset they were handed. Without forwarding, the sidecasts fail on the wrapper and degrade
// silently: source map lookups for the path stop resolving, and `ChunkData` loses the chunk's
// `included` module ids.

#[turbo_tasks::value_impl]
impl GenerateSourceMap for LazyOutputAsset {
    #[turbo_tasks::function]
    fn generate_source_map(&self) -> Vc<FileContent> {
        match ResolvedVc::try_sidecast::<Box<dyn GenerateSourceMap>>(self.inner) {
            Some(inner) => inner.generate_source_map(),
            None => FileContent::NotFound.cell(),
        }
    }

    #[turbo_tasks::function]
    fn by_section(&self, section: RcStr) -> Vc<FileContent> {
        match ResolvedVc::try_sidecast::<Box<dyn GenerateSourceMap>>(self.inner) {
            Some(inner) => inner.by_section(section),
            None => FileContent::NotFound.cell(),
        }
    }
}

#[turbo_tasks::value_impl]
impl OutputChunk for LazyOutputAsset {
    #[turbo_tasks::function]
    fn runtime_info(&self) -> Vc<OutputChunkRuntimeInfo> {
        match ResolvedVc::try_sidecast::<Box<dyn OutputChunk>>(self.inner) {
            Some(inner) => inner.runtime_info(),
            None => OutputChunkRuntimeInfo::empty(),
        }
    }
}
