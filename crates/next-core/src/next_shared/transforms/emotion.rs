use anyhow::Result;
use turbo_tasks::Vc;
use turbopack::module_options::ModuleRule;
use turbopack_ecmascript::{CustomTransformer, TransformPlugin};
use turbopack_ecmascript_plugins::transform::emotion::EmotionTransformer;

use super::get_ecma_transform_rule;
use crate::{
    next_config::{EmotionTransformOptionsOrBoolean, NextConfig},
    next_shared::transforms::EcmascriptTransformStage,
};

turbo_tasks::dual_fn! {
pub fn get_emotion_transform_rule(next_config: Vc<NextConfig>) -> Result<Option<ModuleRule>> {
    let enable_mdx_rs = turbo_tasks::read!(next_config.mdx_rs())?.is_some();

    let has_config = turbo_tasks::read!(next_config
        .compiler())
        ?
        .emotion
        .as_ref()
        .is_some_and(|config| {
            matches!(
                config,
                EmotionTransformOptionsOrBoolean::Boolean(true)
                    | EmotionTransformOptionsOrBoolean::Options(_)
            )
        });

    if has_config {
        let plugin = turbo_tasks::read!(emotion_transform_plugin(next_config).to_resolved())?;
        Ok(Some(get_ecma_transform_rule(
            plugin,
            enable_mdx_rs,
            EcmascriptTransformStage::Main,
        )))
    } else {
        Ok(None)
    }
}
}

#[turbo_tasks::function]
async fn emotion_transform_plugin(next_config: Vc<NextConfig>) -> Result<Vc<TransformPlugin>> {
    use anyhow::Context as _;
    let compiler = turbo_tasks::read!(next_config.compiler())?;
    let transformer = compiler
        .emotion
        .as_ref()
        .and_then(|config| match config {
            EmotionTransformOptionsOrBoolean::Boolean(true) => {
                EmotionTransformer::new(&Default::default())
            }
            EmotionTransformOptionsOrBoolean::Options(value) => EmotionTransformer::new(value),
            _ => None,
        })
        .context("emotion config must exist")?;
    Ok(Vc::cell(
        Box::new(transformer) as Box<dyn CustomTransformer + Send + Sync>
    ))
}
