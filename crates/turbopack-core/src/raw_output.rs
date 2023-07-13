use crate::{
    asset::{Asset, AssetContentVc, AssetVc},
    ident::AssetIdentVc,
    output::{OutputAsset, OutputAssetVc},
    source::SourceVc,
};

/// A module where source code doesn't need to be parsed but can be used as is.
/// This module has no references to other modules.
#[turbo_tasks::value]
pub struct RawOutput {
    source: SourceVc,
}

#[turbo_tasks::value_impl]
impl OutputAsset for RawOutput {}

#[turbo_tasks::value_impl]
impl Asset for RawOutput {
    #[turbo_tasks::function]
    fn ident(&self) -> AssetIdentVc {
        self.source.ident()
    }

    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        self.source.content()
    }
}

#[turbo_tasks::value_impl]
impl RawOutputVc {
    #[turbo_tasks::function]
    pub fn new(source: SourceVc) -> RawOutputVc {
        RawOutput { source }.cell()
    }
}
