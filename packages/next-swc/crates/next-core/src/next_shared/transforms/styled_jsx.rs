use anyhow::Result;
use turbopack_binding::turbopack::{
    ecmascript::{OptionTransformPluginVc, TransformPluginVc},
    ecmascript_plugin::transform::styled_jsx::StyledJsxTransformer,
};

/// Returns a transform plugin for the relay graphql transform.
#[turbo_tasks::function]
pub async fn get_styled_jsx_transform_plugin() -> Result<OptionTransformPluginVc> {
    Ok(OptionTransformPluginVc::cell(Some(
        TransformPluginVc::cell(Box::new(StyledJsxTransformer::new())),
    )))
}
