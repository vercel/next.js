pub(crate) mod chunk;
pub(crate) mod content;
pub(crate) mod evaluate;
pub mod list;
pub(crate) mod worker;

pub use chunk::EcmascriptBrowserChunk;
pub use content::EcmascriptBrowserChunkContent;
pub use evaluate::{
    runtime::EcmascriptBrowserRuntimeChunk, single_entry_chunk::EcmascriptBrowserSingleEntryChunk,
};
pub use worker::EcmascriptBrowserWorkerEntrypoint;

/// These bookkeeping assets contain no original module bodies. Their concrete
/// compiler types certify mapless browser registration code for downstream tools.
pub async fn is_ecmascript_bookkeeping_asset(
    asset: turbo_tasks::ResolvedVc<Box<dyn turbopack_core::output::OutputAsset>>,
) -> anyhow::Result<bool> {
    if turbo_tasks::ResolvedVc::try_downcast_type::<evaluate::chunk::EcmascriptBrowserEvaluateChunk>(
        asset,
    )
    .is_some()
        || turbo_tasks::ResolvedVc::try_downcast_type::<list::asset::EcmascriptDevChunkList>(asset)
            .is_some()
    {
        return Ok(true);
    }
    let Some(chunk) = turbo_tasks::ResolvedVc::try_downcast_type::<EcmascriptBrowserChunk>(asset)
    else {
        return Ok(false);
    };
    chunk.await?.is_async_loader_chunk().await
}
