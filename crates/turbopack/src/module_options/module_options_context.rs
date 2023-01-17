use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use turbo_tasks::{primitives::StringsVc, trace::TraceRawVcs};
use turbopack_core::{environment::EnvironmentVc, resolve::options::ImportMappingVc};
use turbopack_ecmascript::EcmascriptInputTransform;
use turbopack_node::execution_context::ExecutionContextVc;

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
    pub extension_to_loaders: IndexMap<String, StringsVc>,
    pub placeholder_for_future_extensions: (),
}

#[turbo_tasks::value(shared)]
#[derive(Default, Clone, Debug)]
pub struct ResolveAliasOptions {
    pub alias_map: IndexMap<String, StringsVc>,
    pub placeholder_for_future_extensions: (),
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

#[turbo_tasks::value(shared)]
#[derive(Default, Clone)]
pub struct ModuleOptionsContext {
    pub enable_jsx: bool,
    pub enable_emotion: bool,
    pub enable_react_refresh: bool,
    pub enable_styled_components: bool,
    pub enable_styled_jsx: bool,
    pub enable_postcss_transform: Option<PostCssTransformOptions>,
    pub enable_webpack_loaders: Option<WebpackLoadersOptions>,
    pub enable_types: bool,
    pub enable_typescript_transform: bool,
    pub enable_mdx: bool,
    pub preset_env_versions: Option<EnvironmentVc>,
    pub custom_ecmascript_app_transforms: Vec<EcmascriptInputTransform>,
    pub custom_ecmascript_transforms: Vec<EcmascriptInputTransform>,
    /// Custom rules to be applied after all default rules.
    pub custom_rules: Vec<ModuleRule>,
    pub execution_context: Option<ExecutionContextVc>,
    /// A list of rules to use a different module option context for certain
    /// context paths. The first matching is used.
    pub rules: Vec<(ContextCondition, ModuleOptionsContextVc)>,
    pub placeholder_for_future_extensions: (),
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
