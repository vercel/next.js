use anyhow::Result;
use turbo_tasks::Vc;
use turbopack_binding::turbopack::{
    core::environment::RuntimeVersions,
    ecmascript_plugin::transform::styled_jsx::StyledJsxTransformer,
    turbopack::module_options::ModuleRule,
};

use super::get_ecma_transform_rule;
use crate::next_config::NextConfig;

/// Returns a transform rule for the styled jsx transform.
pub async fn get_styled_jsx_transform_rule(
    next_config: Vc<NextConfig>,
    target_browsers: Vc<RuntimeVersions>,
) -> Result<Option<ModuleRule>> {
    let enable_mdx_rs = next_config.mdx_rs().await?.is_some();
    let use_swc_css = *next_config.use_swc_css().await?;
    let versions = *target_browsers.await?;

    let transformer = StyledJsxTransformer::new(!use_swc_css, versions);
    Ok(Some(get_ecma_transform_rule(
        Box::new(transformer),
        enable_mdx_rs,
        true,
    )))
}
