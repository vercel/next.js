use anyhow::Result;
use turbo_tasks::Vc;
use turbopack_binding::turbopack::{
    ecmascript::OptionTransformPlugin, ecmascript_plugin::transform::relay::RelayTransformer,
    turbopack::module_options::ModuleRule,
};

use super::get_ecma_transform_rule;
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
                    Vc::cell(Some(Vc::cell(Box::new(RelayTransformer::new(config)) as _)))
                })
                .unwrap_or_default()
        })
        .unwrap_or_default();

    Ok(transform_plugin)
}

pub async fn get_relay_transform_rule(next_config: Vc<NextConfig>) -> Result<Option<ModuleRule>> {
    let enable_mdx_rs = *next_config.mdx_rs().await?;
    let module_rule = next_config
        .await?
        .compiler
        .as_ref()
        .map(|value| {
            value.relay.as_ref().map(|config| {
                get_ecma_transform_rule(Box::new(RelayTransformer::new(config)), enable_mdx_rs)
            })
        })
        .flatten();

    Ok(module_rule)
}
