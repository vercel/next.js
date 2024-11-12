use anyhow::Result;
use turbo_tasks::Vc;
use turbopack::module_options::ModuleRule;
use turbopack_core::environment::RuntimeVersions;
use turbopack_ecmascript_plugins::transform::styled_jsx::StyledJsxTransformer;

use super::get_ecma_transform_rule;
use crate::next_config::NextConfig;

/// Returns a transform rule for the styled jsx transform.
pub async fn get_styled_jsx_transform_rule(
    next_config: Vc<NextConfig>,
    target_browsers: Vc<RuntimeVersions>,
) -> Result<Option<ModuleRule>> {
    let enable_mdx_rs = next_config.mdx_rs().await?.is_some();
    let versions = *target_browsers.await?;

    let transformer = StyledJsxTransformer::new(versions);
    Ok(Some(get_ecma_transform_rule(
        Box::new(transformer),
        enable_mdx_rs,
        true,
    )))
}
