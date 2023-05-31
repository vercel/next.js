use anyhow::Result;
use turbopack_binding::turbopack::{
    ecmascript::{OptionTransformPluginVc, TransformPluginVc},
    ecmascript_plugin::transform::relay::RelayTransformer,
};

use crate::next_config::NextConfigVc;

/// Returns a transform plugin for the relay graphql transform.
#[turbo_tasks::function]
pub async fn get_relay_transform_plugin(
    next_config: NextConfigVc,
) -> Result<OptionTransformPluginVc> {
    let transform_plugin = next_config
        .await?
        .compiler
        .as_ref()
        .map(|value| {
            value
                .relay
                .as_ref()
                .map(|config| {
                    OptionTransformPluginVc::cell(Some(TransformPluginVc::cell(Box::new(
                        RelayTransformer::new(config),
                    ))))
                })
                .unwrap_or_default()
        })
        .unwrap_or_default();

    Ok(transform_plugin)
}
