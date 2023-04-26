use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use turbo_tasks::trace::TraceRawVcs;
use turbopack_core::{environment::EnvironmentVc, resolve::options::ImportMappingVc};
use turbopack_ecmascript::EcmascriptInputTransform;
use turbopack_ecmascript_plugins::transform::emotion::EmotionTransformConfigVc;
use turbopack_node::{
    execution_context::ExecutionContextVc, transforms::webpack::WebpackLoaderConfigItemsVc,
};

use super::ModuleRule;
use crate::condition::ContextCondition;

#[derive(Default, Clone, PartialEq, Eq, Debug, TraceRawVcs, Serialize, Deserialize)]
pub struct PostCssTransformOptions {
    pub postcss_package: Option<ImportMappingVc>,
    pub placeholder_for_future_extensions: (),
}

#[turbo_tasks::value(shared)]
#[derive(Default, Clone, Debug)]
pub struct WebpackLoadersOptions {
    pub extension_to_loaders: IndexMap<String, WebpackLoaderConfigItemsVc>,
    pub loader_runner_package: Option<ImportMappingVc>,
    pub placeholder_for_future_extensions: (),
}

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
impl DecoratorsOptionsVc {
    #[turbo_tasks::function]
    pub fn default() -> Self {
        Self::cell(Default::default())
    }
}

impl Default for DecoratorsOptionsVc {
    fn default() -> Self {
        Self::default()
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
impl TypescriptTransformOptionsVc {
    #[turbo_tasks::function]
    pub fn default() -> Self {
        Self::cell(Default::default())
    }
}

impl Default for TypescriptTransformOptionsVc {
    fn default() -> Self {
        Self::default()
    }
}

impl WebpackLoadersOptions {
    pub fn is_empty(&self) -> bool {
        self.extension_to_loaders.is_empty()
    }

    pub fn clone_if(&self) -> Option<WebpackLoadersOptions> {
        if self.is_empty() {
            None
        } else {
            Some(self.clone())
        }
    }
}

// [TODO]: should enabled_react_refresh belong to this options?
#[turbo_tasks::value(shared)]
#[derive(Default, Clone, Debug)]
pub struct JsxTransformOptions {
    pub import_source: Option<String>,
    pub runtime: Option<String>,
}

#[turbo_tasks::value(transparent)]
pub struct OptionStyledComponentsTransformConfig(Option<StyledComponentsTransformConfigVc>);

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StyledComponentsTransformConfig {
    pub display_name: bool,
    pub ssr: bool,
    pub file_name: bool,
    pub top_level_import_paths: Vec<String>,
    pub meaningless_file_names: Vec<String>,
    pub css_prop: bool,
    pub namespace: Option<String>,
}

impl Default for StyledComponentsTransformConfig {
    fn default() -> Self {
        StyledComponentsTransformConfig {
            display_name: true,
            ssr: true,
            file_name: true,
            top_level_import_paths: vec![],
            meaningless_file_names: vec!["index".to_string()],
            css_prop: true,
            namespace: None,
        }
    }
}

#[turbo_tasks::value_impl]
impl StyledComponentsTransformConfigVc {
    #[turbo_tasks::function]
    pub fn default() -> Self {
        Self::cell(Default::default())
    }
}

impl Default for StyledComponentsTransformConfigVc {
    fn default() -> Self {
        Self::default()
    }
}

#[turbo_tasks::value(shared)]
#[derive(Default, Clone)]
pub struct ModuleOptionsContext {
    #[serde(default)]
    pub enable_jsx: Option<JsxTransformOptionsVc>,
    #[serde(default)]
    pub enable_emotion: Option<EmotionTransformConfigVc>,
    #[serde(default)]
    pub enable_react_refresh: bool,
    #[serde(default)]
    pub enable_styled_components: Option<StyledComponentsTransformConfigVc>,
    #[serde(default)]
    pub enable_styled_jsx: bool,
    #[serde(default)]
    pub enable_postcss_transform: Option<PostCssTransformOptions>,
    #[serde(default)]
    pub enable_webpack_loaders: Option<WebpackLoadersOptions>,
    #[serde(default)]
    pub enable_types: bool,
    #[serde(default)]
    pub enable_typescript_transform: Option<TypescriptTransformOptionsVc>,
    #[serde(default)]
    pub decorators: Option<DecoratorsOptionsVc>,
    #[serde(default)]
    pub enable_mdx: bool,
    // [Note]: currently mdx, and mdx_rs have different configuration entrypoint from next.config.js,
    // however we might want to unify them in the future.
    #[serde(default)]
    pub enable_mdx_rs: bool,
    #[serde(default)]
    pub preset_env_versions: Option<EnvironmentVc>,
    #[serde(default)]
    pub custom_ecmascript_app_transforms: Vec<EcmascriptInputTransform>,
    #[serde(default)]
    pub custom_ecmascript_transforms: Vec<EcmascriptInputTransform>,
    #[serde(default)]
    /// Custom rules to be applied after all default rules.
    pub custom_rules: Vec<ModuleRule>,
    #[serde(default)]
    pub execution_context: Option<ExecutionContextVc>,
    #[serde(default)]
    /// A list of rules to use a different module option context for certain
    /// context paths. The first matching is used.
    pub rules: Vec<(ContextCondition, ModuleOptionsContextVc)>,
    #[serde(default)]
    pub placeholder_for_future_extensions: (),
    #[serde(default)]
    pub enable_tree_shaking: bool,
}

#[turbo_tasks::value_impl]
impl ModuleOptionsContextVc {
    #[turbo_tasks::function]
    pub fn default() -> Self {
        Self::cell(Default::default())
    }
}

impl Default for ModuleOptionsContextVc {
    fn default() -> Self {
        Self::default()
    }
}
