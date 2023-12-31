use anyhow::Result;
use turbo_tasks::Vc;
use turbopack_binding::turbopack::{
    ecmascript::OptionTransformPlugin,
    ecmascript_plugin::transform::emotion::{EmotionTransformConfig, EmotionTransformer},
};

use crate::next_config::{EmotionTransformOptionsOrBoolean, NextConfig};

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
