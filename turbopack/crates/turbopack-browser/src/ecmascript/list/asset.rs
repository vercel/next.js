use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{NonLocalValue, ResolvedVc, TaskInput, ValueToString, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkingContext, EvaluatableAssets},
    ident::AssetIdent,
    output::{OutputAsset, OutputAssets},
    version::VersionedContent,
};

use super::content::EcmascriptDevChunkListContent;
use crate::BrowserChunkingContext;

/// An asset that represents a list of chunks that exist together in a chunk
/// group, and should be *updated* together.
///
/// The chunk list's content registers itself as a Turbopack chunk and a chunk
/// list.
///
/// Then, on updates, it merges updates from its chunks into a single update
/// when possible. This is useful for keeping track of changes that affect more
/// than one chunk, or affect the chunk group, e.g.:
/// * moving a module from one chunk to another;
/// * changing a chunk's path.
#[turbo_tasks::value(shared)]
pub(crate) struct EcmascriptDevChunkList {
    pub(super) chunking_context: ResolvedVc<BrowserChunkingContext>,
    pub(super) ident: ResolvedVc<AssetIdent>,
    pub(super) evaluatable_assets: ResolvedVc<EvaluatableAssets>,
    pub(super) chunks: ResolvedVc<OutputAssets>,
    pub(super) source: EcmascriptDevChunkListSource,
}

#[turbo_tasks::value_impl]
impl EcmascriptDevChunkList {
    /// Creates a new [`Vc<EcmascriptDevChunkList>`].
    #[turbo_tasks::function]
    pub fn new(
        chunking_context: ResolvedVc<BrowserChunkingContext>,
        ident: ResolvedVc<AssetIdent>,
        evaluatable_assets: ResolvedVc<EvaluatableAssets>,
        chunks: ResolvedVc<OutputAssets>,
        source: EcmascriptDevChunkListSource,
    ) -> Vc<Self> {
        EcmascriptDevChunkList {
            chunking_context,
            ident,
            evaluatable_assets,
            chunks,
            source,
        }
        .cell()
    }

    #[turbo_tasks::function]
    fn own_content(self: Vc<Self>) -> Vc<EcmascriptDevChunkListContent> {
        EcmascriptDevChunkListContent::new(self)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptDevChunkList {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(rcstr!("Ecmascript Dev Chunk List"))
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for EcmascriptDevChunkList {
    #[turbo_tasks::function]
    async fn path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        let this = self.await?;
        let mut ident = this.ident.owned().await?;
        ident.add_modifier(rcstr!("ecmascript dev chunk list"));

        match this.source {
            EcmascriptDevChunkListSource::Entry => {}
            EcmascriptDevChunkListSource::Dynamic => {
                ident.add_modifier(rcstr!("dynamic"));
            }
        }

        // We must not include the actual chunks idents as part of the chunk list's
        // ident, because it must remain stable whenever a chunk is added or
        // removed from the list.

        let ident = AssetIdent::new(ident);
        Ok(this
            .chunking_context
            .chunk_path(Some(Vc::upcast(self)), ident, None, rcstr!(".js")))
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<OutputAssets> {
        *self.chunks
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptDevChunkList {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<AssetContent> {
        self.own_content().content()
    }

    #[turbo_tasks::function]
    fn versioned_content(self: Vc<Self>) -> Vc<Box<dyn VersionedContent>> {
        Vc::upcast(self.own_content())
    }
}

#[derive(
    Eq,
    PartialEq,
    Debug,
    Clone,
    Copy,
    Hash,
    TaskInput,
    NonLocalValue,
    TraceRawVcs,
    Serialize,
    Deserialize,
)]
#[serde(rename_all = "camelCase")]
pub enum EcmascriptDevChunkListSource {
    /// The chunk list is from a runtime entry.
    Entry,
    /// The chunk list is from a dynamic import.
    Dynamic,
}
