use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, TaskInput, ValueToString, Vc};

use crate::{asset::Asset, ident::AssetIdent, reference::ModuleReferences};

#[derive(Clone, Copy, Debug, TaskInput, Hash)]
#[turbo_tasks::value(shared)]
pub enum StyleType {
    IsolatedStyle,
    GlobalStyle,
}

/// A module. This usually represents parsed source code, which has references
/// to other modules.
#[turbo_tasks::value_trait]
pub trait Module: Asset {
    /// The identifier of the [Module]. It's expected to be unique and capture
    /// all properties of the [Module].
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent>;

    /// The identifier of the [Module] as string. It's expected to be unique and capture
    /// all properties of the [Module].
    #[turbo_tasks::function]
    fn ident_string(self: Vc<Self>) -> Vc<RcStr> {
        self.ident().to_string()
    }

    /// Other [Module]s or [OutputAsset]s referenced from this [Module].
    // TODO refactor to avoid returning [OutputAsset]s here
    #[turbo_tasks::function]
    fn references(self: Vc<Self>) -> Vc<ModuleReferences> {
        ModuleReferences::empty()
    }

    /// Signifies the module itself is async, e.g. it uses top-level await, is a wasm module, etc.
    #[turbo_tasks::function]
    fn is_self_async(self: Vc<Self>) -> Vc<bool> {
        Vc::cell(false)
    }
}

#[turbo_tasks::value_trait]
pub trait StyleModule: Module + Asset {
    /// The style type of the module.
    #[turbo_tasks::function]
    fn style_type(&self) -> Vc<StyleType>;
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
