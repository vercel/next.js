use turbopack_core::environment::EnvironmentVc;
use turbopack_ecmascript::EcmascriptInputTransform;

use super::ModuleRule;

#[turbo_tasks::value(shared)]
#[derive(Default, Clone)]
pub struct ModuleOptionsContext {
    pub enable_emotion: bool,
    pub enable_react_refresh: bool,
    pub enable_styled_components: bool,
    pub enable_styled_jsx: bool,
    pub enable_typescript_transform: bool,
    pub preset_env_versions: Option<EnvironmentVc>,
    pub custom_ecmascript_app_transforms: Vec<EcmascriptInputTransform>,
    pub custom_ecmascript_transforms: Vec<EcmascriptInputTransform>,
    /// Custom rules to be applied after all default rules.
    pub custom_rules: Vec<ModuleRule>,
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
