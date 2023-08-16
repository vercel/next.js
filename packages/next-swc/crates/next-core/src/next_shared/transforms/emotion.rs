use anyhow::Result;
use turbopack_binding::turbopack::{
    ecmascript::{OptionTransformPluginVc, TransformPluginVc},
    ecmascript_plugin::transform::emotion::{EmotionTransformConfig, EmotionTransformer},
};

use crate::next_config::{EmotionTransformOptionsOrBoolean, NextConfigVc};

#[turbo_tasks::function]
pub async fn get_emotion_transform_plugin(
    next_config: NextConfigVc,
) -> Result<OptionTransformPluginVc> {
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
                        || OptionTransformPluginVc::cell(None),
                        |v| {
                            OptionTransformPluginVc::cell(Some(TransformPluginVc::cell(Box::new(
                                v,
                            ))))
                        },
                    )
                })
                .unwrap_or_default()
        })
        .unwrap_or_default();

    Ok(transform_plugin)
}
