use anyhow::{bail, Result};
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexSet, ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::{File, FileSystemPath};

use crate::{
    asset::{Asset, AssetContent},
    introspect::{Introspectable, IntrospectableChildren},
    output::OutputAsset,
    source_map::{GenerateSourceMap, SourceMap},
};

/// Represents the source map of an ecmascript asset.
#[turbo_tasks::value]
pub struct SourceMapAsset {
    asset: ResolvedVc<Box<dyn OutputAsset>>,
}

#[turbo_tasks::value_impl]
impl SourceMapAsset {
    #[turbo_tasks::function]
    pub fn new(asset: ResolvedVc<Box<dyn OutputAsset>>) -> Vc<Self> {
        SourceMapAsset { asset }.cell()
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for SourceMapAsset {
    #[turbo_tasks::function]
    fn path(&self) -> Vc<FileSystemPath> {
        // NOTE(alexkirsz) We used to include the asset's version id in the path,
        // but this caused `all_assets_map` to be recomputed on every change.
        self.asset.path().append(".map".into())
    }
}

#[turbo_tasks::value_impl]
impl Asset for SourceMapAsset {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        let Some(generate_source_map) =
            ResolvedVc::try_sidecast::<Box<dyn GenerateSourceMap>>(self.asset)
        else {
            bail!("asset does not support generating source maps")
        };
        if let Some(sm) = &*generate_source_map.generate_source_map().await? {
            Ok(AssetContent::file(File::from(sm.clone()).into()))
        } else {
            Ok(AssetContent::file(
                File::from(SourceMap::empty_rope()).into(),
            ))
        }
    }
}

#[turbo_tasks::function]
fn introspectable_type() -> Vc<RcStr> {
    Vc::cell("source map".into())
}

#[turbo_tasks::function]
fn introspectable_details() -> Vc<RcStr> {
    Vc::cell("source map of an asset".into())
}

#[turbo_tasks::value_impl]
impl Introspectable for SourceMapAsset {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<RcStr> {
        introspectable_type()
    }

    #[turbo_tasks::function]
    fn title(self: Vc<Self>) -> Vc<RcStr> {
        self.path().to_string()
    }

    #[turbo_tasks::function]
    fn details(&self) -> Vc<RcStr> {
        introspectable_details()
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<Vc<IntrospectableChildren>> {
        let mut children = FxIndexSet::default();
        if let Some(asset) = ResolvedVc::try_sidecast::<Box<dyn Introspectable>>(self.asset) {
            children.insert((ResolvedVc::cell("asset".into()), asset));
        }
        Ok(Vc::cell(children))
    }
}
