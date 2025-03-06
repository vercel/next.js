use turbo_rcstr::RcStr;
use turbo_tasks::{fxindexmap, Vc};
use turbopack_core::diagnostics::{Diagnostic, DiagnosticPayload};

/// A structure that keeps track of whether a particular Next.js feature is
/// enabled for the telemetry.
///
/// The original implementation code can be found
/// [here](https://github.com/vercel/next.js/blob/9da305fe320b89ee2f8c3cfb7ecbf48856368913/packages/next/src/build/webpack-config.ts#L2516).
#[turbo_tasks::value(shared)]
pub struct NextFeatureTelemetry {
    pub event_name: RcStr,
    pub feature_name: RcStr,
    pub enabled: bool,
}

impl NextFeatureTelemetry {
    pub fn new(feature_name: RcStr, enabled: bool) -> Self {
        NextFeatureTelemetry {
            event_name: "EVENT_BUILD_FEATURE_USAGE".into(),
            feature_name,
            enabled,
        }
    }
}

#[turbo_tasks::value_impl]
impl Diagnostic for NextFeatureTelemetry {
    #[turbo_tasks::function]
    fn category(&self) -> Vc<RcStr> {
        Vc::cell("NextFeatureTelemetry_category_tbd".into())
    }

    #[turbo_tasks::function]
    fn name(&self) -> Vc<RcStr> {
        Vc::cell(self.event_name.clone())
    }

    #[turbo_tasks::function]
    fn payload(&self) -> Vc<DiagnosticPayload> {
        Vc::cell(fxindexmap! {
            self.feature_name.clone() =>
            self.enabled.to_string().into(),
        })
    }
}

/// A struct represent telemetry event for the feature usage,
/// referred as `importing` a certain module. (i.e importing @next/image)
#[turbo_tasks::value(shared)]
pub struct ModuleFeatureTelemetry {
    pub event_name: RcStr,
    pub feature_name: RcStr,
    pub invocation_count: usize,
}

impl ModuleFeatureTelemetry {
    pub fn new(feature_name: RcStr, invocation_count: usize) -> Self {
        ModuleFeatureTelemetry {
            event_name: "EVENT_BUILD_FEATURE_USAGE".into(),
            feature_name,
            invocation_count,
        }
    }
}

#[turbo_tasks::value_impl]
impl Diagnostic for ModuleFeatureTelemetry {
    #[turbo_tasks::function]
    fn category(&self) -> Vc<RcStr> {
        Vc::cell("ModuleFeatureTelemetry_category_tbd".into())
    }

    #[turbo_tasks::function]
    fn name(&self) -> Vc<RcStr> {
        Vc::cell(self.event_name.clone())
    }

    #[turbo_tasks::function]
    fn payload(&self) -> Vc<DiagnosticPayload> {
        Vc::cell(fxindexmap! {
            self.feature_name.clone() =>
            self.invocation_count.to_string().into(),
        })
    }
}
