use anyhow::{bail, Result};
use turbo_tasks::{ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    chunk::{EvaluatableAsset, EvaluatableAssetExt, EvaluatableAssets},
    context::AssetContext,
    issue::IssueSeverity,
    module::Module,
    resolve::{origin::PlainResolveOrigin, parse::Request},
    source::Source,
};
use turbopack_resolve::ecmascript::cjs_resolve;

#[turbo_tasks::value(shared)]
pub enum RuntimeEntry {
    Request(Vc<Request>, Vc<FileSystemPath>),
    Evaluatable(Vc<Box<dyn EvaluatableAsset>>),
    Source(Vc<Box<dyn Source>>),
}

#[turbo_tasks::value_impl]
impl RuntimeEntry {
    #[turbo_tasks::function]
    pub async fn resolve_entry(
        self: Vc<Self>,
        asset_context: Vc<Box<dyn AssetContext>>,
    ) -> Result<Vc<EvaluatableAssets>> {
        let (request, path) = match *self.await? {
            RuntimeEntry::Evaluatable(e) => return Ok(EvaluatableAssets::one(e)),
            RuntimeEntry::Source(source) => {
                return Ok(EvaluatableAssets::one(source.to_evaluatable(asset_context)));
            }
            RuntimeEntry::Request(r, path) => (r, path),
        };

        let modules = cjs_resolve(
            Vc::upcast(PlainResolveOrigin::new(asset_context, path)),
            request,
            None,
            IssueSeverity::Error.cell(),
        )
        .resolve()
        .await?
        .primary_modules()
        .await?;

        let mut runtime_entries = Vec::with_capacity(modules.len());
        for &module in &modules {
            if let Some(entry) =
                Vc::try_resolve_sidecast::<Box<dyn EvaluatableAsset>>(module).await?
            {
                runtime_entries.push(entry);
            } else {
                bail!(
                    "runtime reference resolved to an asset ({}) that cannot be evaluated",
                    module.ident().to_string().await?
                );
            }
        }

        Ok(Vc::cell(runtime_entries))
    }
}

#[turbo_tasks::value(transparent)]
pub struct RuntimeEntries(Vec<Vc<RuntimeEntry>>);

#[turbo_tasks::value_impl]
impl RuntimeEntries {
    #[turbo_tasks::function]
    pub async fn resolve_entries(
        self: Vc<Self>,
        asset_context: Vc<Box<dyn AssetContext>>,
    ) -> Result<Vc<EvaluatableAssets>> {
        let mut runtime_entries = Vec::new();

        for reference in &self.await? {
            let resolved_entries = reference.resolve_entry(asset_context).await?;
            runtime_entries.extend(&resolved_entries);
        }

        Ok(Vc::cell(runtime_entries))
    }
}
