use anyhow::Result;
use turbo_tasks::Vc;
use turbopack::module_options::ModuleRule;
use turbopack_core::environment::RuntimeVersions;
use turbopack_ecmascript::{CustomTransformer, TransformPlugin};
use turbopack_ecmascript_plugins::transform::styled_jsx::StyledJsxTransformer;

use super::get_ecma_transform_rule;
use crate::{next_config::NextConfig, next_shared::transforms::EcmascriptTransformStage};

/// Returns a transform rule for the styled jsx transform.
pub async fn get_styled_jsx_transform_rule(
    next_config: Vc<NextConfig>,
    target_browsers: Vc<RuntimeVersions>,
) -> Result<Option<ModuleRule>> {
    let enable_mdx_rs = next_config.mdx_rs().await?.is_some();
    let plugin = styled_jsx_transform_plugin(target_browsers)
        .to_resolved()
        .await?;
    Ok(Some(get_ecma_transform_rule(
        plugin,
        enable_mdx_rs,
        EcmascriptTransformStage::Main,
    )))
}

#[turbo_tasks::function]
async fn styled_jsx_transform_plugin(
    target_browsers: Vc<RuntimeVersions>,
) -> Result<Vc<TransformPlugin>> {
    let versions = *target_browsers.await?;
    Ok(Vc::cell(
        Box::new(StyledJsxTransformer::new(versions)) as Box<dyn CustomTransformer + Send + Sync>
    ))
}
