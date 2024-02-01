use anyhow::Result;
use turbo_tasks::Vc;
use turbopack_binding::turbopack::{
    ecmascript::OptionTransformPlugin,
    ecmascript_plugin::transform::styled_components::{
        StyledComponentsTransformConfig, StyledComponentsTransformer,
    },
    turbopack::module_options::ModuleRule,
};

use crate::{
    next_config::{NextConfig, StyledComponentsTransformOptionsOrBoolean},
    next_shared::transforms::get_ecma_transform_rule,
};

#[turbo_tasks::function]
pub async fn get_styled_components_transform_plugin(
    next_config: Vc<NextConfig>,
) -> Result<Vc<OptionTransformPlugin>> {
    let transform_plugin = next_config
        .await?
        .compiler
        .as_ref()
        .map(|value| {
            value
                .styled_components
                .as_ref()
                .map(|value| {
                    let transformer = match value {
                        StyledComponentsTransformOptionsOrBoolean::Boolean(true) => Some(
                            StyledComponentsTransformer::new(&StyledComponentsTransformConfig {
                                ..Default::default()
                            }),
                        ),
                        StyledComponentsTransformOptionsOrBoolean::Boolean(false) => None,
                        StyledComponentsTransformOptionsOrBoolean::Options(value) => {
                            Some(StyledComponentsTransformer::new(value))
                        }
                    };

                    transformer.map_or_else(
                        || Vc::cell(None),
                        |v| Vc::cell(Some(Vc::cell(Box::new(v) as _))),
                    )
                })
                .unwrap_or_default()
        })
        .unwrap_or_default();

    Ok(transform_plugin)
}

pub async fn get_styled_components_transform_rule(
    next_config: Vc<NextConfig>,
) -> Result<Option<ModuleRule>> {
    let enable_mdx_rs = *next_config.mdx_rs().await?;

    let module_rule = next_config
        .await?
        .compiler
        .as_ref()
        .map(|value| value.styled_components.as_ref())
        .flatten()
        .map(|config| match config {
            StyledComponentsTransformOptionsOrBoolean::Boolean(true) => {
                Some(StyledComponentsTransformer::new(&Default::default()))
            }
            StyledComponentsTransformOptionsOrBoolean::Options(value) => {
                Some(StyledComponentsTransformer::new(value))
            }
            _ => None,
        })
        .flatten()
        .map(|transformer| get_ecma_transform_rule(Box::new(transformer), enable_mdx_rs));

    Ok(module_rule)
}
