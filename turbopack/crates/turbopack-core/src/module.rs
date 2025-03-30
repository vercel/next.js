use serde::{Deserialize, Serialize};
use turbo_tasks::{trace::TraceRawVcs, NonLocalValue, ResolvedVc, Vc};

use crate::{asset::Asset, ident::AssetIdent, reference::ModuleReferences};

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, TraceRawVcs, NonLocalValue)]
pub enum StyleType {
    IsolatedStyle,
    GlobalStyle,
}

#[turbo_tasks::value(transparent)]
pub struct OptionStyleType(Option<StyleType>);

/// A module. This usually represents parsed source code, which has references
/// to other modules.
#[turbo_tasks::value_trait]
pub trait Module: Asset {
    /// The identifier of the [Module]. It's expected to be unique and capture
    /// all properties of the [Module].
    fn ident(&self) -> Vc<AssetIdent>;

    /// Other [Module]s or [OutputAsset]s referenced from this [Module].
    // TODO refactor to avoid returning [OutputAsset]s here
    fn references(self: Vc<Self>) -> Vc<ModuleReferences> {
        ModuleReferences::empty()
    }

    /// Signifies the module itself is async, e.g. it uses top-level await, is a wasm module, etc.
    fn is_self_async(self: Vc<Self>) -> Vc<bool> {
        Vc::cell(false)
    }

    /// The style type of the module.
    fn style_type(self: Vc<Self>) -> Vc<OptionStyleType> {
        Vc::cell(None)
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
