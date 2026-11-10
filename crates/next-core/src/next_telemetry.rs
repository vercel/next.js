use turbo_rcstr::RcStr;

/// Summary of Next.js feature usage for a project, reported as telemetry.
///
/// Produced by `next_api::project::Project::project_feature_usage`. Entries cover:
/// - Boolean build/config flags (`1` if enabled, `0` if disabled), mirroring webpack's
///   `TelemetryPlugin`.
/// - Module imports (e.g. `next/image`, `next/font/google`): one count per unique importing module,
///   computed by walking the whole-app module graph.
///
/// The vector is sorted by `feature_name` for determinism.
#[turbo_tasks::value(shared)]
pub struct ProjectFeatureUsageSummary {
    pub features: Vec<(RcStr, u32)>,
}
