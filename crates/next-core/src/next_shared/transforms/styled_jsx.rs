use anyhow::Result;
use turbo_tasks::Vc;
use turbopack::module_options::ModuleRule;
use turbopack_core::environment::RuntimeVersions;
use turbopack_ecmascript::{CustomTransformer, TransformPlugin};
use turbopack_ecmascript_plugins::transform::styled_jsx::StyledJsxTransformer;

use super::get_ecma_transform_rule;
use crate::{next_config::NextConfig, next_shared::transforms::EcmascriptTransformStage};

turbo_tasks::dual_fn! {
/// Returns a transform rule for the styled jsx transform.
pub fn get_styled_jsx_transform_rule(
    next_config: Vc<NextConfig>,
    target_browsers: Vc<RuntimeVersions>,
) -> Result<Option<ModuleRule>> {
    let enable_mdx_rs = turbo_tasks::read!(next_config.mdx_rs())?.is_some();
    let plugin = turbo_tasks::read!(styled_jsx_transform_plugin(target_browsers)
        .to_resolved())
        ?;
    Ok(Some(get_ecma_transform_rule(
        plugin,
        enable_mdx_rs,
        EcmascriptTransformStage::Main,
    )))
}
}

#[turbo_tasks::function]
async fn styled_jsx_transform_plugin(
    target_browsers: Vc<RuntimeVersions>,
) -> Result<Vc<TransformPlugin>> {
    let versions = *turbo_tasks::read!(target_browsers)?;
    Ok(Vc::cell(
        Box::new(StyledJsxTransformer::new(versions)) as Box<dyn CustomTransformer + Send + Sync>
    ))
}
