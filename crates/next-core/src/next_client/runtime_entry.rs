use anyhow::{bail, Result};
use turbo_tasks::ValueToString;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    context::AssetContextVc,
    resolve::{origin::PlainResolveOriginVc, parse::RequestVc},
};
use turbopack_ecmascript::{
    chunk::{EcmascriptChunkPlaceableVc, EcmascriptChunkPlaceablesVc},
    resolve::cjs_resolve,
};

#[turbo_tasks::value(shared)]
pub enum RuntimeEntry {
    Request(RequestVc, FileSystemPathVc),
    Ecmascript(EcmascriptChunkPlaceableVc),
}

#[turbo_tasks::value_impl]
impl RuntimeEntryVc {
    #[turbo_tasks::function]
    pub async fn resolve_entry(
        self,
        context: AssetContextVc,
    ) -> Result<EcmascriptChunkPlaceablesVc> {
        let (request, path) = match *self.await? {
            RuntimeEntry::Ecmascript(e) => return Ok(EcmascriptChunkPlaceablesVc::cell(vec![e])),
            RuntimeEntry::Request(r, path) => (r, path),
        };

        let assets = cjs_resolve(PlainResolveOriginVc::new(context, path).into(), request)
            .primary_assets()
            .await?;

        let mut runtime_entries = Vec::with_capacity(assets.len());
        for asset in &assets {
            if let Some(placeable) = EcmascriptChunkPlaceableVc::resolve_from(asset).await? {
                runtime_entries.push(placeable);
            } else {
                bail!(
                    "runtime reference resolved to an asset ({}) that is not placeable into an \
                     ecmascript chunk",
                    asset.path().to_string().await?
                );
            }
        }

        Ok(EcmascriptChunkPlaceablesVc::cell(runtime_entries))
    }
}

#[turbo_tasks::value(transparent)]
pub struct RuntimeEntries(Vec<RuntimeEntryVc>);

#[turbo_tasks::value_impl]
impl RuntimeEntriesVc {
    #[turbo_tasks::function]
    pub async fn resolve_entries(
        self,
        context: AssetContextVc,
    ) -> Result<EcmascriptChunkPlaceablesVc> {
        let mut runtime_entries = Vec::new();

        for reference in &self.await? {
            let resolved_entries = reference.resolve_entry(context).await?;
            runtime_entries.extend(resolved_entries.into_iter());
        }

        Ok(EcmascriptChunkPlaceablesVc::cell(runtime_entries))
    }
}
