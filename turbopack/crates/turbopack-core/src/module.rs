use bincode::{Decode, Encode};
use turbo_frozenmap::FrozenMap;
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, ResolvedVc, ValueToString, Vc};

use crate::{
    ident::AssetIdent,
    reference::{ModuleReference, ModuleReferences},
    source::OptionSource,
};

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
    /// "use turbopack: no side effects"
    /// ```
    ///
    /// This module might not even be parsed (and thus chunked) if no other module depends on any of
    /// its exports.
    SideEffectFree,
    // Neither of the above, so we should assume it has side effects.
    SideEffectful,
}

/// Where one export of a module gets its value, see [`Module::export_bindings`].
#[derive(Clone, Hash, Debug, PartialEq, Eq, NonLocalValue, Encode, Decode)]
pub enum ExportBinding {
    /// A binding declared by the module itself.
    Local {
        /// Whether the binding holds the same value from module evaluation on, so it can be read
        /// once instead of at every use.
        is_constant: bool,
        /// Whether calling the value could observe the receiver it is called with. Conservatively
        /// true.
        maybe_uses_this: bool,
    },
    /// Forwards export `name` of the module behind `reference`.
    Reexport {
        reference: ResolvedVc<Box<dyn ModuleReference>>,
        name: RcStr,
    },
    /// Anything a reader cannot see through, such as a re-exported namespace.
    Opaque,
}

/// How a module's exports get their values, see [`Module::export_bindings`].
///
/// The default describes nothing, which leaves every export opaque.
#[turbo_tasks::value(shared)]
#[derive(Debug, Default)]
pub struct ExportBindings {
    /// The exports the module declares.
    pub exports: FrozenMap<RcStr, ExportBinding>,
    /// The `export * from` references, in declaration order. Of two that export the same name,
    /// the first wins, and neither forwards `default`.
    pub star_reexports: Vec<ResolvedVc<Box<dyn ModuleReference>>>,
}

#[turbo_tasks::value_impl]
impl ExportBindings {
    /// Nothing is known about the module's exports, so none of them can be seen through.
    #[turbo_tasks::function]
    pub fn unknown() -> Vc<Self> {
        ExportBindings::default().cell()
    }
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

    /// Where the module's exports get their values.
    ///
    /// This only describes the module itself: a re-export names the reference it forwards through,
    /// not where that leads. [`compute_binding_usage_info`] follows those across the whole graph.
    /// Modules that don't describe their exports leave all of them opaque.
    ///
    /// [`compute_binding_usage_info`]: crate::module_graph::binding_usage_info::compute_binding_usage_info
    #[turbo_tasks::function]
    fn export_bindings(self: Vc<Self>) -> Vc<ExportBindings> {
        ExportBindings::unknown()
    }
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
