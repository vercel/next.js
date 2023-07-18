use anyhow::{bail, Result};
use indexmap::IndexSet;
use turbo_tasks::Vc;

use crate::{
    asset::Asset, ident::AssetIdent, raw_module::RawModule, reference::AssetReferences,
    source::Source,
};

/// A module. This usually represents parsed source code, which has references
/// to other modules.
#[turbo_tasks::value_trait]
pub trait Module: Asset {
    /// The identifier of the [Module]. It's expected to be unique and capture
    /// all properties of the [Module].
    fn ident(&self) -> Vc<AssetIdent>;

    /// Other things (most likely [Asset]s) referenced from this [Module].
    // TODO refactor this to ensure that only [Module]s can be referenced
    fn references(self: Vc<Self>) -> Vc<AssetReferences> {
        AssetReferences::empty()
    }
}

#[turbo_tasks::value(transparent)]
pub struct OptionModule(Option<Vc<Box<dyn Module>>>);

#[turbo_tasks::value(transparent)]
pub struct Modules(Vec<Vc<Box<dyn Module>>>);

#[turbo_tasks::value_impl]
impl Modules {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Vc::cell(Vec::new())
    }
}

/// A set of [Module]s
#[turbo_tasks::value(transparent)]
pub struct ModulesSet(IndexSet<Vc<Box<dyn Module>>>);

/// This is a temporary function that should be removed once the [Module]
/// trait completely replaces the [Asset] trait.
/// It converts an [Asset] into a [Module], but either casting it or wrapping it
/// in a [RawModule].
// TODO make this function unnecessary, it should never be a Source
#[turbo_tasks::function]
pub async fn convert_asset_to_module(asset: Vc<Box<dyn Asset>>) -> Result<Vc<Box<dyn Module>>> {
    if let Some(module) = Vc::try_resolve_downcast::<Box<dyn Module>>(asset).await? {
        Ok(module)
    } else if let Some(source) = Vc::try_resolve_downcast::<Box<dyn Source>>(asset).await? {
        Ok(Vc::upcast(RawModule::new(source)))
    } else {
        bail!("Asset must be a Module or a Source")
    }
}

// TODO All Vc::try_resolve_downcast::<Box<dyn Module>> calls should be removed
