use anyhow::Result;
use turbo_tasks::Vc;
use turbopack_binding::turbopack::{
    ecmascript_plugin::transform::emotion::EmotionTransformer,
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
        .and_then(|value| value.emotion.as_ref())
        .and_then(|config| match config {
            EmotionTransformOptionsOrBoolean::Boolean(true) => {
                EmotionTransformer::new(&Default::default())
            }
            EmotionTransformOptionsOrBoolean::Options(value) => EmotionTransformer::new(value),
            _ => None,
        })
        .map(|transformer| get_ecma_transform_rule(Box::new(transformer), enable_mdx_rs, true));

    Ok(module_rule)
}
