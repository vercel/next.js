use anyhow::Result;
use turbo_tasks::Vc;
use turbopack_binding::turbopack::{
    ecmascript::{OptionTransformPlugin, TransformPlugin},
    ecmascript_plugin::transform::relay::RelayTransformer,
};

use crate::next_config::NextConfig;

/// Returns a transform plugin for the relay graphql transform.
#[turbo_tasks::function]
pub async fn get_relay_transform_plugin(
    next_config: Vc<NextConfig>,
) -> Result<Vc<OptionTransformPlugin>> {
    let transform_plugin = next_config
        .await?
        .compiler
        .as_ref()
        .map(|value| {
            value
                .relay
                .as_ref()
                .map(|config| {
                    Vc::cell(Some(TransformPlugin::cell(Box::new(
                        RelayTransformer::new(config),
                    ))))
                })
                .unwrap_or_default()
        })
        .unwrap_or_default();

    Ok(transform_plugin)
}
