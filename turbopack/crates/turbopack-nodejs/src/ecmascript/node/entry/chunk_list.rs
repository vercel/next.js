use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    output::{OutputAsset, OutputAssets, OutputAssetsReference, OutputAssetsWithReferenced},
    version::VersionedContent,
};

use super::chunk_list_content::EcmascriptBuildNodeChunkListContent;
use crate::NodeJsChunkingContext;

/// A server-side HMR tracking anchor for a set of chunks built outside any
/// entry's own module graph (e.g. client-component SSR chunks produced via
/// separate `chunk_group(IsolatedMerged)` calls).
///
/// It is never `require()`d at runtime — it exists only so the aggregate
/// server-HMR subscription has a *stable-ident* [`VersionedContent`]
/// ([`EcmascriptBuildNodeChunkListContent`], whose version is a
/// `ChunkListVersion`) covering these chunks. The stable ident means adding,
/// removing, or renaming a covered chunk doesn't force a `TotalUpdate`
/// (restart); edits ride the merged `ChunkListUpdate` just like the entry's own
/// chunk list.
#[turbo_tasks::value(shared)]
#[derive(ValueToString)]
#[value_to_string("Ecmascript Build Node Chunk List")]
pub(crate) struct EcmascriptBuildNodeChunkList {
    pub(super) chunking_context: ResolvedVc<NodeJsChunkingContext>,
    /// Explicit output path for this tracking anchor. The caller controls
    /// placement so the anchor can live alongside the entries it belongs to
    /// (e.g. under `server/app/`), which is how the aggregate server-HMR
    /// subscription scopes what it tracks.
    pub(super) path: FileSystemPath,
    pub(super) chunks: ResolvedVc<OutputAssets>,
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeChunkList {
    #[turbo_tasks::function]
    pub fn new(
        chunking_context: ResolvedVc<NodeJsChunkingContext>,
        path: FileSystemPath,
        chunks: ResolvedVc<OutputAssets>,
    ) -> Vc<Self> {
        EcmascriptBuildNodeChunkList {
            chunking_context,
            path,
            chunks,
        }
        .cell()
    }

    #[turbo_tasks::function]
    fn own_content(&self) -> Vc<EcmascriptBuildNodeChunkListContent> {
        EcmascriptBuildNodeChunkListContent::new_from_chunks(*self.chunking_context, *self.chunks)
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for EcmascriptBuildNodeChunkList {
    #[turbo_tasks::function]
    fn references(&self) -> Vc<OutputAssetsWithReferenced> {
        OutputAssetsWithReferenced::from_assets(*self.chunks)
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for EcmascriptBuildNodeChunkList {
    #[turbo_tasks::function]
    fn path(&self) -> Vc<FileSystemPath> {
        // Use the explicit path from the caller. The path deliberately does not
        // encode the covered chunks' idents, so it stays stable when a chunk is
        // added/removed/renamed (which is what insulates the aggregate HMR
        // version from `TotalUpdate`s).
        self.path.clone().cell()
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptBuildNodeChunkList {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<AssetContent> {
        // Never loaded at runtime, but this can't `bail!`: as a real
        // `OutputAsset` in `server_assets` it flows through `all_asset_paths`,
        // which hashes every asset's content to build the server paths list.
        // Erroring here fails the whole endpoint write. Emit an empty stub
        // instead.
        AssetContent::file(FileContent::Content(File::from(rcstr!(""))).cell())
    }

    #[turbo_tasks::function]
    fn versioned_content(self: Vc<Self>) -> Vc<Box<dyn VersionedContent>> {
        Vc::upcast(self.own_content())
    }
}
