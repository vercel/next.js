use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use turbo_tasks::{trace::TraceRawVcs, ValueDefault, Vc};
use turbopack_core::{environment::Environment, resolve::options::ImportMapping};
use turbopack_ecmascript::{references::esm::UrlRewriteBehavior, TreeShakingMode};
use turbopack_node::{
    execution_context::ExecutionContext,
    transforms::{postcss::PostCssTransformOptions, webpack::WebpackLoaderItems},
};

use super::ModuleRule;
use crate::condition::ContextCondition;

#[derive(Clone, PartialEq, Eq, Debug, TraceRawVcs, Serialize, Deserialize)]
pub struct LoaderRuleItem {
    pub loaders: Vc<WebpackLoaderItems>,
    pub rename_as: Option<String>,
}

#[derive(Default)]
#[turbo_tasks::value(transparent)]
pub struct WebpackRules(IndexMap<String, LoaderRuleItem>);

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
    pub import_source: Option<String>,
    pub runtime: Option<String>,
}

#[turbo_tasks::value(shared)]
#[derive(Default, Clone)]
#[serde(default)]
pub struct MdxTransformModuleOptions {
    /// The path to a module providing Components to mdx modules.
    /// The provider must export a useMDXComponents, which is called to access
    /// an object of components.
    pub provider_import_source: Option<String>,
}

#[turbo_tasks::value_impl]
impl MdxTransformModuleOptions {
    #[turbo_tasks::function]
    pub fn default() -> Vc<Self> {
        Self::cell(Default::default())
    }
}

#[turbo_tasks::value(shared)]
#[derive(Default, Clone)]
#[serde(default)]
pub struct ModuleOptionsContext {
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
    pub enable_mdx_rs: Option<Vc<MdxTransformModuleOptions>>,
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

    pub use_lightningcss: bool,
}

#[turbo_tasks::value_impl]
impl ValueDefault for ModuleOptionsContext {
    #[turbo_tasks::function]
    fn value_default() -> Vc<Self> {
        Self::cell(Default::default())
    }
}
