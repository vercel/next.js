use anyhow::Result;
use turbo_tasks::Vc;
use turbopack::module_options::ModuleRule;
use turbopack_ecmascript_plugins::transform::styled_components::StyledComponentsTransformer;

use crate::{
    next_config::{NextConfig, StyledComponentsTransformOptionsOrBoolean},
    next_shared::transforms::get_ecma_transform_rule,
};

pub async fn get_styled_components_transform_rule(
    next_config: Vc<NextConfig>,
) -> Result<Option<ModuleRule>> {
    let enable_mdx_rs = next_config.mdx_rs().await?.is_some();

    let module_rule = next_config
        .compiler()
        .await?
        .styled_components
        .as_ref()
        .and_then(|config| match config {
            StyledComponentsTransformOptionsOrBoolean::Boolean(true) => {
                Some(StyledComponentsTransformer::new(&Default::default()))
            }
            StyledComponentsTransformOptionsOrBoolean::Options(value) => {
                Some(StyledComponentsTransformer::new(value))
            }
            _ => None,
        })
        .map(|transformer| get_ecma_transform_rule(Box::new(transformer), enable_mdx_rs, true));

    Ok(module_rule)
}
