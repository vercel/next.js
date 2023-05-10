use std::path::PathBuf;

use anyhow::Result;
use turbo_binding::{
    swc::custom_transform::relay::{Config, RelayLanguageConfig},
    turbopack::{
        ecmascript::{OptionTransformPluginVc, TransformPluginVc},
        ecmascript_plugin::transform::relay::RelayTransformer,
    },
};

use crate::next_config::{NextConfigVc, RelayLanguage};

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
                    // [TODO]: There are config mismatches between RelayConfig to swc_relay::Config
                    let swc_relay_config = Config {
                        artifact_directory: config.artifact_directory.as_ref().map(PathBuf::from),
                        language: config.language.as_ref().map_or(
                            RelayLanguageConfig::TypeScript,
                            |v| match v {
                                RelayLanguage::JavaScript => RelayLanguageConfig::JavaScript,
                                RelayLanguage::TypeScript => RelayLanguageConfig::TypeScript,
                                RelayLanguage::Flow => RelayLanguageConfig::Flow,
                            },
                        ),
                        ..Default::default()
                    };
                    OptionTransformPluginVc::cell(Some(TransformPluginVc::cell(Box::new(
                        RelayTransformer::new(swc_relay_config),
                    ))))
                })
                .unwrap_or(Default::default())
        })
        .unwrap_or(Default::default());

    Ok(transform_plugin)
}
