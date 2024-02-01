use anyhow::Result;
use turbo_tasks::Vc;
use turbopack_binding::turbopack::{
    ecmascript::OptionTransformPlugin,
    ecmascript_plugin::transform::emotion::{EmotionTransformConfig, EmotionTransformer},
    turbopack::module_options::ModuleRule,
};

use super::get_ecma_transform_rule;
use crate::next_config::{EmotionTransformOptionsOrBoolean, NextConfig};

pub async fn get_emotion_transform_rule(next_config: Vc<NextConfig>) -> Result<Option<ModuleRule>> {
    let enable_mdx_rs = *next_config.mdx_rs().await?;
    let module_rule = next_config
        .await?
        .compiler
        .as_ref()
        .map(|value| value.emotion.as_ref())
        .flatten()
        .map(|config| match config {
            EmotionTransformOptionsOrBoolean::Boolean(true) => {
                EmotionTransformer::new(&Default::default())
            }
            EmotionTransformOptionsOrBoolean::Options(value) => EmotionTransformer::new(value),
            _ => None,
        })
        .flatten()
        .map(|transformer| get_ecma_transform_rule(Box::new(transformer), enable_mdx_rs));

    Ok(module_rule)
}

#[turbo_tasks::function]
pub async fn get_emotion_transform_plugin(
    next_config: Vc<NextConfig>,
) -> Result<Vc<OptionTransformPlugin>> {
    let transform_plugin = next_config
        .await?
        .compiler
        .as_ref()
        .map(|value| {
            value
                .emotion
                .as_ref()
                .map(|value| {
                    let transformer = match value {
                        EmotionTransformOptionsOrBoolean::Boolean(true) => {
                            EmotionTransformer::new(&EmotionTransformConfig {
                                ..Default::default()
                            })
                        }
                        EmotionTransformOptionsOrBoolean::Boolean(false) => None,

                        EmotionTransformOptionsOrBoolean::Options(value) => {
                            EmotionTransformer::new(value)
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
