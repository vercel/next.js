use anyhow::Result;
use turbo_tasks::Vc;
use turbopack_binding::turbopack::{
    ecmascript::OptionTransformPlugin,
    ecmascript_plugin::transform::styled_components::{
        StyledComponentsTransformConfig, StyledComponentsTransformer,
    },
};

use crate::next_config::{NextConfig, StyledComponentsTransformOptionsOrBoolean};

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
