use anyhow::Result;
use async_trait::async_trait;
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
    /// "use turbopack: no side effects"
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
#[async_trait]
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

    /// Hints that the module won't be code generated (e.g. because tree shaking removed it), so
    /// data that it only keeps in memory for code generation (e.g. its parsed AST) can be dropped
    /// to free memory.
    ///
    /// Implementations must not compute that data if it isn't in memory, and must stay correct if
    /// the module is code generated nevertheless (e.g. by recomputing the data). This is not a
    /// turbo-tasks function, so calling it doesn't create a task. The default does nothing.
    async fn drop_code_gen_data_hint(&self) -> Result<()> {
        Ok(())
    }
}

#[turbo_tasks::value_trait]
pub trait StyleModule: Module {
    /// The style type of the module.
    #[turbo_tasks::function]
    fn style_type(&self) -> Vc<StyleType>;
}

/// A module whose references can appear later without its sources changing, e.g. a module that is
/// compiled on demand and only gets its references once it is activated.
///
/// Names derived from the availability its async loader is created with have to stay the same
/// when it activates. So the availability of its async loader is not canonicalized, and the
/// canonicalization of other async loaders stops at it (see
/// [`crate::chunk::availability_info::AvailabilityInfo::canonicalize_for_async_loader`]).
///
/// The references it gets on activation must start their own chunk groups (e.g.
/// [`crate::chunk::ChunkingType::Async`]), never add modules to the chunk group of this module
/// itself (like [`crate::chunk::ChunkingType::Parallel`]).
#[turbo_tasks::value_trait]
pub trait ActivatableModule: Module {}

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
