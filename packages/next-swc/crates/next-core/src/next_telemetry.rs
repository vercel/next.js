use std::collections::HashMap;

use turbopack_binding::{
    turbo::tasks::Vc,
    turbopack::core::diagnostics::{Diagnostic, DiagnosticPayload},
};

/// A struct represent telemetry event for the feature usage,
/// referred as `importing` a certain module. (i.e importing @next/image)
#[turbo_tasks::value(shared)]
pub struct ModuleFeatureTelemetry {
    pub event_name: String,
    pub feature_name: String,
    pub invocation_count: usize,
}

impl ModuleFeatureTelemetry {
    pub fn new(feature_name: String, invocation_count: usize) -> Self {
        ModuleFeatureTelemetry {
            event_name: "EVENT_BUILD_FEATURE_USAGE".to_string(),
            feature_name,
            invocation_count,
        }
    }
}

#[turbo_tasks::value_impl]
impl Diagnostic for ModuleFeatureTelemetry {
    #[turbo_tasks::function]
    fn category(&self) -> Vc<String> {
        Vc::cell("ModuleFeatureTelemetry_category_tbd".to_string())
    }

    #[turbo_tasks::function]
    fn name(&self) -> Vc<String> {
        Vc::cell(self.event_name.clone())
    }

    #[turbo_tasks::function]
    fn payload(&self) -> Vc<DiagnosticPayload> {
        Vc::cell(HashMap::from([(
            self.feature_name.clone(),
            self.invocation_count.to_string(),
        )]))
    }
}
