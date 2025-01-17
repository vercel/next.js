use anyhow::{bail, Result};
use turbo_tasks::{ResolvedVc, Upcast, Value, ValueToString, Vc};

use super::ChunkableModule;
use crate::{
    asset::Asset,
    context::AssetContext,
    module::Module,
    reference_type::{EntryReferenceSubType, ReferenceType},
    source::Source,
};

/// Marker trait for the chunking context to accept evaluated entries.
///
/// The chunking context implementation will resolve the dynamic entry to a
/// well-known value or trait object.
#[turbo_tasks::value_trait]
pub trait EvaluatableAsset: Asset + Module + ChunkableModule {}

pub trait EvaluatableAssetExt {
    fn to_evaluatable(
        self: Vc<Self>,
        asset_context: Vc<Box<dyn AssetContext>>,
    ) -> Vc<Box<dyn EvaluatableAsset>>;
}

impl<T> EvaluatableAssetExt for T
where
    T: Upcast<Box<dyn Source>>,
{
    fn to_evaluatable(
        self: Vc<Self>,
        asset_context: Vc<Box<dyn AssetContext>>,
    ) -> Vc<Box<dyn EvaluatableAsset>> {
        to_evaluatable(Vc::upcast(self), asset_context)
    }
}

#[turbo_tasks::function]
async fn to_evaluatable(
    asset: Vc<Box<dyn Source>>,
    asset_context: Vc<Box<dyn AssetContext>>,
) -> Result<Vc<Box<dyn EvaluatableAsset>>> {
    let module = asset_context
        .process(
            asset,
            Value::new(ReferenceType::Entry(EntryReferenceSubType::Runtime)),
        )
        .module();
    let Some(entry) = Vc::try_resolve_downcast::<Box<dyn EvaluatableAsset>>(module).await? else {
        bail!(
            "{} is not a valid evaluated entry",
            module.ident().to_string().await?
        )
    };
    Ok(entry)
}

#[turbo_tasks::value(transparent)]
pub struct EvaluatableAssets(Vec<ResolvedVc<Box<dyn EvaluatableAsset>>>);

#[turbo_tasks::value_impl]
impl EvaluatableAssets {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<EvaluatableAssets> {
        EvaluatableAssets(vec![]).cell()
    }

    #[turbo_tasks::function]
    pub fn one(entry: ResolvedVc<Box<dyn EvaluatableAsset>>) -> Vc<EvaluatableAssets> {
        EvaluatableAssets(vec![entry]).cell()
    }

    #[turbo_tasks::function]
    pub fn many(assets: Vec<ResolvedVc<Box<dyn EvaluatableAsset>>>) -> Vc<EvaluatableAssets> {
        EvaluatableAssets(assets).cell()
    }

    #[turbo_tasks::function]
    pub async fn with_entry(
        self: Vc<Self>,
        entry: ResolvedVc<Box<dyn EvaluatableAsset>>,
    ) -> Result<Vc<EvaluatableAssets>> {
        let mut entries = self.await?.clone_value();
        entries.push(entry);
        Ok(EvaluatableAssets(entries).cell())
    }
}
