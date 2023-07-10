use crate::{
    asset::{Asset, AssetContentVc, AssetVc},
    ident::AssetIdentVc,
    module::{Module, ModuleVc},
};

/// A module where source code doesn't need to be parsed but can be usd as is.
/// This module has no references to other modules.
#[turbo_tasks::value]
pub struct RawModule {
    source: AssetVc,
}

#[turbo_tasks::value_impl]
impl Module for RawModule {}

#[turbo_tasks::value_impl]
impl Asset for RawModule {
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
impl RawModuleVc {
    #[turbo_tasks::function]
    pub fn new(source: AssetVc) -> RawModuleVc {
        RawModule { source }.cell()
    }
}
