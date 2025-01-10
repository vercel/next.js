use turbo_tasks::{ResolvedVc, Vc};

use crate::{asset::Asset, ident::AssetIdent, reference::ModuleReferences};

/// A module. This usually represents parsed source code, which has references
/// to other modules.
#[turbo_tasks::value_trait(local)]
pub trait Module: Asset {
    /// The identifier of the [Module]. It's expected to be unique and capture
    /// all properties of the [Module].
    fn ident(&self) -> Vc<AssetIdent>;

    /// Other [Module]s or [OutputAsset]s referenced from this [Module].
    // TODO refactor to avoid returning [OutputAsset]s here
    fn references(self: Vc<Self>) -> Vc<ModuleReferences> {
        ModuleReferences::empty()
    }

    fn additional_layers_modules(self: Vc<Self>) -> Vc<Modules> {
        Vc::cell(vec![])
    }
}

#[turbo_tasks::value(transparent)]
pub struct OptionModule(Option<ResolvedVc<Box<dyn Module>>>);

#[turbo_tasks::value(transparent)]
pub struct Modules(Vec<ResolvedVc<Box<dyn Module>>>);

#[turbo_tasks::value_impl]
impl Modules {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Vc::cell(Vec::new())
    }
}
