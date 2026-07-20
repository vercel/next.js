use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};

use crate::{ident::AssetIdent, reference::ModuleReferences, source::OptionSource};

#[derive(Clone, Copy, Debug, Hash)]
#[turbo_tasks::value(shared)]
pub enum StyleType {
    IsolatedStyle,
    GlobalStyle,
}

#[derive(Hash, Debug, Copy, Clone)]
#[turbo_tasks::value(shared)]
pub enum ModuleSideEffects {
    /// Analysis determined that the module evaluation is free of side effects. The module may still
    /// have side effects based on its imports.
    ///
    /// This module might not be chunked after Turbopack performed a global analysis on the module
    /// graph.
    ModuleEvaluationIsSideEffectFree,
    /// Is known to be free of side effects either due to static analysis or some kind of
    /// configuration.
    ///
    /// ```js
    /// "use turbopack no side effects"
    /// ```
    ///
    /// This module might not even be parsed (and thus chunked) if no other module depends on any of
    /// its exports.
    SideEffectFree,
    // Neither of the above, so we should assume it has side effects.
    SideEffectful,
}

/// A module. This usually represents parsed source code, which has references to other modules.
///
/// For documentation about where this is used and how it fits into the rest of Turbopack, see
/// [`crate::_layers`].
#[turbo_tasks::value_trait]
pub trait Module {
    /// The identifier of the [`Module`]. It's expected to be unique and capture all properties of
    /// the [`Module`].
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent>;

    /// The identifier of the [`Module`] as string. It's expected to be unique and capture all
    /// properties of the [`Module`].
    #[turbo_tasks::function]
    fn ident_string(self: Vc<Self>) -> Vc<RcStr> {
        self.ident().to_string()
    }

    /// The source of the [`Module`].
    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionSource>;

    /// Other [`Module`]s or [`OutputAsset`]s referenced from this [`Module`].
    ///
    /// [`OutputAsset`]: crate::output::OutputAsset
    //
    // TODO: refactor to avoid returning OutputAssets here
    #[turbo_tasks::function]
    fn references(self: Vc<Self>) -> Vc<ModuleReferences> {
        ModuleReferences::empty()
    }

    /// Signifies the module itself is async, e.g. it uses top-level await, is a wasm module, etc.
    #[turbo_tasks::function]
    fn is_self_async(self: Vc<Self>) -> Vc<bool> {
        Vc::cell(false)
    }

    /// Returns `true` if the module is marked as [free of side effects in
    /// `package.json`][packagejson] or by other means.
    ///
    /// [packagejson]: https://webpack.js.org/guides/tree-shaking/#mark-the-file-as-side-effect-free
    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects>;
}

#[turbo_tasks::value_trait]
pub trait StyleModule: Module {
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
