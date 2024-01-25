use anyhow::Result;
use turbo_tasks::Vc;
use turbopack_binding::turbopack::{
    core::environment::RuntimeVersions, ecmascript::OptionTransformPlugin,
    ecmascript_plugin::transform::styled_jsx::StyledJsxTransformer,
};

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
