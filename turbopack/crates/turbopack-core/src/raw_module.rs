use turbo_tasks::{ResolvedVc, Vc};

use crate::{
    asset::{Asset, AssetContent},
    ident::AssetIdent,
    module::Module,
    source::Source,
};

/// A module where source code doesn't need to be parsed but can be usd as is.
/// This module has no references to other modules.
#[turbo_tasks::value]
pub struct RawModule {
    source: ResolvedVc<Box<dyn Source>>,
}

#[turbo_tasks::value_impl]
impl Module for RawModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.source.ident()
    }
}

#[turbo_tasks::value_impl]
impl Asset for RawModule {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}

#[turbo_tasks::value_impl]
impl RawModule {
    #[turbo_tasks::function]
    pub fn new(source: ResolvedVc<Box<dyn Source>>) -> Vc<RawModule> {
        RawModule { source }.cell()
    }
}
