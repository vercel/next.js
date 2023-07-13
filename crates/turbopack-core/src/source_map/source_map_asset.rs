use anyhow::{bail, Result};
use indexmap::IndexSet;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbo_tasks_fs::File;

use crate::{
    asset::{Asset, AssetContentVc, AssetVc},
    ident::AssetIdentVc,
    introspect::{Introspectable, IntrospectableChildrenVc, IntrospectableVc},
    output::{OutputAsset, OutputAssetVc},
    reference::{AssetReference, AssetReferenceVc},
    resolve::{ResolveResult, ResolveResultVc},
    source_map::{GenerateSourceMap, GenerateSourceMapVc, SourceMapVc},
};

/// Represents the source map of an ecmascript asset.
#[turbo_tasks::value]
pub struct SourceMapAsset {
    asset: AssetVc,
}

#[turbo_tasks::value_impl]
impl SourceMapAssetVc {
    #[turbo_tasks::function]
    pub fn new(asset: AssetVc) -> Self {
        SourceMapAsset { asset }.cell()
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for SourceMapAsset {}

#[turbo_tasks::value_impl]
impl Asset for SourceMapAsset {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<AssetIdentVc> {
        // NOTE(alexkirsz) We used to include the asset's version id in the path,
        // but this caused `all_assets_map` to be recomputed on every change.
        Ok(AssetIdentVc::from_path(
            self.asset.ident().path().append(".map"),
        ))
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<AssetContentVc> {
        let Some(generate_source_map) = GenerateSourceMapVc::resolve_from(&self.asset).await?
        else {
            bail!("asset does not support generating source maps")
        };
        let sm = if let Some(sm) = &*generate_source_map.generate_source_map().await? {
            *sm
        } else {
            SourceMapVc::empty()
        };
        let sm = sm.to_rope().await?;
        Ok(File::from(sm).into())
    }
}

#[turbo_tasks::function]
fn introspectable_type() -> StringVc {
    StringVc::cell("source map".to_string())
}

#[turbo_tasks::function]
fn introspectable_details() -> StringVc {
    StringVc::cell("source map of an asset".to_string())
}

#[turbo_tasks::value_impl]
impl Introspectable for SourceMapAsset {
    #[turbo_tasks::function]
    fn ty(&self) -> StringVc {
        introspectable_type()
    }

    #[turbo_tasks::function]
    fn title(self_vc: SourceMapAssetVc) -> StringVc {
        self_vc.ident().to_string()
    }

    #[turbo_tasks::function]
    fn details(&self) -> StringVc {
        introspectable_details()
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<IntrospectableChildrenVc> {
        let mut children = IndexSet::new();
        if let Some(asset) = IntrospectableVc::resolve_from(self.asset).await? {
            children.insert((StringVc::cell("asset".to_string()), asset));
        }
        Ok(IntrospectableChildrenVc::cell(children))
    }
}

/// A reference to a [`SourceMapAsset`], used to inform the dev
/// server/build system of the presence of the source map
#[turbo_tasks::value]
pub struct SourceMapAssetReference {
    asset: AssetVc,
}

#[turbo_tasks::value_impl]
impl SourceMapAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(asset: AssetVc) -> Self {
        SourceMapAssetReference { asset }.cell()
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for SourceMapAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<ResolveResultVc> {
        let asset = SourceMapAssetVc::new(self.asset).into();
        Ok(ResolveResult::asset(asset).cell())
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for SourceMapAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "source map for {}",
            self.asset.ident().path().to_string().await?
        )))
    }
}
