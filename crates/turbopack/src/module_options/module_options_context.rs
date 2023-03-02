use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use turbo_tasks::trace::TraceRawVcs;
use turbopack_core::{environment::EnvironmentVc, resolve::options::ImportMappingVc};
use turbopack_ecmascript::EcmascriptInputTransform;
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
    #[serde(default)]
    pub enable_jsx: bool,
    #[serde(default)]
    pub enable_emotion: bool,
    #[serde(default)]
    pub enable_react_refresh: bool,
    #[serde(default)]
    pub enable_styled_components: bool,
    #[serde(default)]
    pub enable_styled_jsx: bool,
    #[serde(default)]
    pub enable_postcss_transform: Option<PostCssTransformOptions>,
    #[serde(default)]
    pub enable_webpack_loaders: Option<WebpackLoadersOptions>,
    #[serde(default)]
    pub enable_types: bool,
    #[serde(default)]
    pub enable_typescript_transform: bool,
    #[serde(default)]
    pub enable_mdx: bool,
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
