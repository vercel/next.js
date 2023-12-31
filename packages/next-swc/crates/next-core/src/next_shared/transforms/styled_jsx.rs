use anyhow::Result;
use turbo_tasks::Vc;
use turbopack_binding::turbopack::{
    ecmascript::OptionTransformPlugin,
    ecmascript_plugin::transform::styled_jsx::StyledJsxTransformer,
};

/// Returns a transform plugin for the relay graphql transform.
#[turbo_tasks::function]
pub async fn get_styled_jsx_transform_plugin(
    use_lightningcss: bool,
) -> Result<Vc<OptionTransformPlugin>> {
    Ok(Vc::cell(Some(Vc::cell(
        Box::new(StyledJsxTransformer::new(use_lightningcss)) as _,
    ))))
}
