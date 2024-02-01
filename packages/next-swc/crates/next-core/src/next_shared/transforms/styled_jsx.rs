use anyhow::Result;
use turbo_tasks::Vc;
use turbopack_binding::turbopack::{
    core::environment::RuntimeVersions, ecmascript::OptionTransformPlugin,
    ecmascript_plugin::transform::styled_jsx::StyledJsxTransformer,
    turbopack::module_options::ModuleRule,
};

use super::get_ecma_transform_rule;
use crate::next_config::NextConfig;

/// Returns a transform plugin for the relay graphql transform.
#[turbo_tasks::function]
pub async fn get_styled_jsx_transform_plugin(
    use_lightningcss: bool,
    target_browsers: Vc<RuntimeVersions>,
) -> Result<Vc<OptionTransformPlugin>> {
    let versions = *target_browsers.await?;

    Ok(Vc::cell(Some(Vc::cell(
        Box::new(StyledJsxTransformer::new(use_lightningcss, versions)) as _,
    ))))
}

pub async fn get_styled_jsx_transform_rule(
    next_config: Vc<NextConfig>,
    target_browsers: Vc<RuntimeVersions>,
) -> Result<Option<ModuleRule>> {
    let enable_mdx_rs = *next_config.mdx_rs().await?;
    let use_lightningcss = *next_config.use_lightningcss().await?;
    let versions = *target_browsers.await?;

    let transformer = StyledJsxTransformer::new(use_lightningcss, versions);
    Ok(Some(get_ecma_transform_rule(
        Box::new(transformer),
        enable_mdx_rs,
        true,
    )))
}
