use anyhow::{bail, Result};
use turbo_tasks::ValueToString;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::{Asset, AssetVc},
    chunk::{EvaluatableAssetVc, EvaluatableAssetsVc},
    context::AssetContextVc,
    issue::{IssueSeverity, OptionIssueSourceVc},
    resolve::{origin::PlainResolveOriginVc, parse::RequestVc},
};
use turbopack_ecmascript::resolve::cjs_resolve;

#[turbo_tasks::value(shared)]
pub enum RuntimeEntry {
    Request(RequestVc, FileSystemPathVc),
    Evaluatable(EvaluatableAssetVc),
    Source(AssetVc),
}

#[turbo_tasks::value_impl]
impl RuntimeEntryVc {
    #[turbo_tasks::function]
    pub async fn resolve_entry(self, context: AssetContextVc) -> Result<EvaluatableAssetsVc> {
        let (request, path) = match *self.await? {
            RuntimeEntry::Evaluatable(e) => return Ok(EvaluatableAssetsVc::one(e)),
            RuntimeEntry::Source(source) => {
                return Ok(EvaluatableAssetsVc::one(EvaluatableAssetVc::from_asset(
                    source, context,
                )));
            }
            RuntimeEntry::Request(r, path) => (r, path),
        };

        let assets = cjs_resolve(
            PlainResolveOriginVc::new(context, path).into(),
            request,
            OptionIssueSourceVc::none(),
            IssueSeverity::Error.cell(),
        )
        .primary_assets()
        .await?;

        let mut runtime_entries = Vec::with_capacity(assets.len());
        for asset in &assets {
            if let Some(entry) = EvaluatableAssetVc::resolve_from(asset).await? {
                runtime_entries.push(entry);
            } else {
                bail!(
                    "runtime reference resolved to an asset ({}) that cannot be evaluated",
                    asset.ident().to_string().await?
                );
            }
        }

        Ok(EvaluatableAssetsVc::cell(runtime_entries))
    }
}

#[turbo_tasks::value(transparent)]
pub struct RuntimeEntries(Vec<RuntimeEntryVc>);

#[turbo_tasks::value_impl]
impl RuntimeEntriesVc {
    #[turbo_tasks::function]
    pub async fn resolve_entries(self, context: AssetContextVc) -> Result<EvaluatableAssetsVc> {
        let mut runtime_entries = Vec::new();

        for reference in &self.await? {
            let resolved_entries = reference.resolve_entry(context).await?;
            runtime_entries.extend(resolved_entries.into_iter());
        }

        Ok(EvaluatableAssetsVc::cell(runtime_entries))
    }
}
