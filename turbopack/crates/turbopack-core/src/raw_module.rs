use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};

use crate::{
    ident::AssetIdent,
    module::{Module, ModuleSideEffects},
    source::{OptionSource, Source},
};

/// A module where source code doesn't need to be parsed but can be used as is.
/// This module has no references to other modules.
#[turbo_tasks::value]
pub struct RawModule {
    source: ResolvedVc<Box<dyn Source>>,
    modifier: Option<RcStr>,
}

#[turbo_tasks::value_impl]
impl Module for RawModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        match &self.modifier {
            Some(modifier) => self.source.ident().with_modifier(modifier.clone()),
            None => self.source.ident(),
        }
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionSource> {
        Vc::cell(Some(self.source))
    }
    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        ModuleSideEffects::SideEffectful.cell()
    }
}

impl RawModule {
    pub fn new(source: Vc<Box<dyn Source>>) -> Vc<RawModule> {
        Self::new_inner(source, None)
    }

    pub fn new_with_modifier(source: Vc<Box<dyn Source>>, modifier: RcStr) -> Vc<RawModule> {
        Self::new_inner(source, Some(modifier))
    }
}

#[turbo_tasks::value_impl]
impl RawModule {
    #[turbo_tasks::function]
    fn new_inner(source: ResolvedVc<Box<dyn Source>>, modifier: Option<RcStr>) -> Vc<RawModule> {
        RawModule { source, modifier }.cell()
    }
}
