use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};

use crate::{
    asset::{Asset, AssetContent},
    ident::AssetIdent,
    source::Source,
};

/// A source wrapping another source but stripping source map support.
/// Used to display generated code in error messages without triggering
/// source map remapping (since this type does NOT implement
/// `GenerateSourceMap`).
#[turbo_tasks::value]
pub struct GeneratedCodeSource {
    source: ResolvedVc<Box<dyn Source>>,
}

#[turbo_tasks::value_impl]
impl GeneratedCodeSource {
    #[turbo_tasks::function]
    pub fn new(source: ResolvedVc<Box<dyn Source>>) -> Vc<Self> {
        Self { source }.cell()
    }
}

#[turbo_tasks::value_impl]
impl Source for GeneratedCodeSource {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.source.ident()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<RcStr> {
        self.source.description()
    }
}

#[turbo_tasks::value_impl]
impl Asset for GeneratedCodeSource {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}
