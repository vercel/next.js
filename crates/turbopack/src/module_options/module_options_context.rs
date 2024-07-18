use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use turbo_tasks::{trace::TraceRawVcs, RcStr, ValueDefault, Vc};
use turbopack_core::{
    condition::ContextCondition, environment::Environment, resolve::options::ImportMapping,
};
use turbopack_ecmascript::{references::esm::UrlRewriteBehavior, TreeShakingMode};
pub use turbopack_mdx::MdxTransformOptions;
use turbopack_node::{
    execution_context::ExecutionContext,
    transforms::{postcss::PostCssTransformOptions, webpack::WebpackLoaderItems},
};

use super::ModuleRule;

#[derive(Clone, PartialEq, Eq, Debug, TraceRawVcs, Serialize, Deserialize)]
pub struct LoaderRuleItem {
    pub loaders: Vc<WebpackLoaderItems>,
    pub rename_as: Option<RcStr>,
}

#[derive(Default)]
#[turbo_tasks::value(transparent)]
pub struct WebpackRules(IndexMap<RcStr, LoaderRuleItem>);

#[derive(Default)]
#[turbo_tasks::value(transparent)]
pub struct OptionWebpackRules(Option<Vc<WebpackRules>>);

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub struct WebpackLoadersOptions {
    pub rules: Vc<WebpackRules>,
    pub loader_runner_package: Option<Vc<ImportMapping>>,
}

#[derive(Default)]
#[turbo_tasks::value(transparent)]
pub struct OptionWebpackLoadersOptions(Option<Vc<WebpackLoadersOptions>>);

/// The kind of decorators transform to use.
/// [TODO]: might need bikeshed for the name (Ecma)
#[derive(Clone, PartialEq, Eq, Debug, TraceRawVcs, Serialize, Deserialize)]
pub enum DecoratorsKind {
    Legacy,
    Ecma,
}

/// The types when replacing `typeof window` with a constant.
#[derive(Clone, PartialEq, Eq, Debug, TraceRawVcs, Serialize, Deserialize)]
pub enum TypeofWindow {
    Object,
    Undefined,
}

/// Configuration options for the decorators transform.
/// This is not part of Typescript transform: while there are typescript
/// specific transforms (legay decorators), there is an ecma decorator transform
/// as well for the JS.
#[turbo_tasks::value(shared)]
#[derive(Default, Clone, Debug)]
pub struct DecoratorsOptions {
    pub decorators_kind: Option<DecoratorsKind>,
    /// Option to control whether to emit decorator metadata.
    /// (https://www.typescriptlang.org/tsconfig#emitDecoratorMetadata)
    /// This'll be applied only if `decorators_type` and
    /// `enable_typescript_transform` is enabled.
    pub emit_decorators_metadata: bool,
    /// Mimic babel's `decorators.decoratorsBeforeExport` option.
    /// This'll be applied only if `decorators_type` is enabled.
    /// ref: https://github.com/swc-project/swc/blob/d4ebb5e6efbed0758f25e46e8f74d7c47ec6cb8f/crates/swc_ecma_parser/src/lib.rs#L327
    /// [TODO]: this option is not actively being used currently.
    pub decorators_before_export: bool,
    pub use_define_for_class_fields: bool,
}

#[turbo_tasks::value_impl]
impl ValueDefault for DecoratorsOptions {
    #[turbo_tasks::function]
    fn value_default() -> Vc<Self> {
        Self::default().cell()
    }
}

/// Subset of Typescript options configured via tsconfig.json or jsconfig.json,
/// which affects the runtime transform output.
#[turbo_tasks::value(shared)]
#[derive(Default, Clone, Debug)]
pub struct TypescriptTransformOptions {
    pub use_define_for_class_fields: bool,
}

#[turbo_tasks::value_impl]
impl ValueDefault for TypescriptTransformOptions {
    #[turbo_tasks::function]
    fn value_default() -> Vc<Self> {
        Self::default().cell()
    }
}

// [TODO]: should enabled_react_refresh belong to this options?
#[turbo_tasks::value(shared)]
#[derive(Default, Clone, Debug)]
pub struct JsxTransformOptions {
    pub development: bool,
    pub react_refresh: bool,
    pub import_source: Option<RcStr>,
    pub runtime: Option<RcStr>,
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Default)]
#[serde(default)]
pub struct ModuleOptionsContext {
    pub enable_typeof_window_inlining: Option<TypeofWindow>,
    pub enable_jsx: Option<Vc<JsxTransformOptions>>,
    pub enable_postcss_transform: Option<Vc<PostCssTransformOptions>>,
    pub enable_webpack_loaders: Option<Vc<WebpackLoadersOptions>>,
    /// Follow type references and resolve declaration files in additional to
    /// normal resolution.
    pub enable_types: bool,
    pub enable_typescript_transform: Option<Vc<TypescriptTransformOptions>>,
    pub decorators: Option<Vc<DecoratorsOptions>>,
    pub enable_mdx: bool,
    /// This skips `GlobalCss` and `ModuleCss` module assets from being
    /// generated in the module graph, generating only `Css` module assets.
    ///
    /// This is useful for node-file-trace, which tries to emit all assets in
    /// the module graph, but neither asset types can be emitted directly.
    pub enable_raw_css: bool,
    // [Note]: currently mdx, and mdx_rs have different configuration entrypoint from next.config.js,
    // however we might want to unify them in the future.
    pub enable_mdx_rs: Option<Vc<MdxTransformOptions>>,
    pub preset_env_versions: Option<Vc<Environment>>,
    /// Custom rules to be applied after all default rules.
    pub custom_rules: Vec<ModuleRule>,
    pub execution_context: Option<Vc<ExecutionContext>>,
    /// A list of rules to use a different module option context for certain
    /// context paths. The first matching is used.
    pub rules: Vec<(ContextCondition, Vc<ModuleOptionsContext>)>,
    pub placeholder_for_future_extensions: (),
    pub tree_shaking_mode: Option<TreeShakingMode>,
    pub esm_url_rewrite_behavior: Option<UrlRewriteBehavior>,
    /// References to externals from ESM imports should use `import()` and make
    /// async modules.
    pub import_externals: bool,
    /// Ignore very dynamic requests which doesn't have any static known part.
    /// If false, they will reference the whole directory. If true, they won't
    /// reference anything and lead to an runtime error instead.
    pub ignore_dynamic_requests: bool,

    pub use_swc_css: bool,

    pub side_effect_free_packages: Vec<RcStr>,
}

#[turbo_tasks::value_impl]
impl ValueDefault for ModuleOptionsContext {
    #[turbo_tasks::function]
    fn value_default() -> Vc<Self> {
        Self::cell(Default::default())
    }
}
