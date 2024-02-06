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
        .as_ref()
        .and_then(|value| value.emotion.as_ref())
        .and_then(|config| match config {
            EmotionTransformOptionsOrBoolean::Boolean(true) => {
                EmotionTransformer::new(&EmotionTransformConfig {
                    ..Default::default()
                })
            }
            EmotionTransformOptionsOrBoolean::Boolean(false) => None,

            EmotionTransformOptionsOrBoolean::Options(value) => EmotionTransformer::new(value),
        })
        .map(|transformer| Vc::cell(Box::new(transformer) as _));

    Ok(Vc::cell(transform_plugin))
}
