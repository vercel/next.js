use std::path::PathBuf;

use anyhow::Result;
use async_trait::async_trait;
use swc_core::{
    common::{util::take::Take, FileName},
    ecma::{
        ast::{Module, Program},
        visit::FoldWith,
    },
};
use swc_relay::RelayLanguageConfig;
use turbo_binding::{
    turbo::tasks_fs::FileSystem,
    turbopack::ecmascript::{
        CustomTransformer, OptionTransformPluginVc, TransformContext, TransformPluginVc,
    },
};

use crate::next_config::{NextConfigVc, RelayConfig, RelayLanguage};

#[derive(Debug)]
pub struct RelayTransformer {
    config: swc_relay::Config,
}

impl RelayTransformer {
    pub fn new(config: &RelayConfig) -> Self {
        // [TODO]: There are config mismatches between RelayConfig to swc_relay::Config
        let swc_relay_config = swc_relay::Config {
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

        Self {
            config: swc_relay_config,
        }
    }
}

#[async_trait]
impl CustomTransformer for RelayTransformer {
    async fn transform(
        &self,
        program: &mut Program,
        ctx: &TransformContext<'_>,
    ) -> Option<Program> {
        let p = std::mem::replace(program, Program::Module(Module::dummy()));
        let root = if let Ok(file_path) = ctx.file_path.await {
            file_path
                .fs
                .root()
                .await
                .map_or(PathBuf::new(), |v| PathBuf::from(v.path.to_string()))
        } else {
            PathBuf::new()
        };

        *program = p.fold_with(&mut swc_relay::relay(
            &self.config,
            FileName::Real(PathBuf::from(ctx.file_name_str)),
            root,
            // [TODO]: pages_dir comes through next-swc-loader
            // https://github.com/vercel/next.js/blob/ea472e8058faea8ebdab2ef6d3aab257a1f0d11c/packages/next/src/build/webpack-config.ts#L792
            None,
        ));

        None
    }
}

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
                .map(|value| {
                    OptionTransformPluginVc::cell(Some(TransformPluginVc::cell(Box::new(
                        RelayTransformer::new(value),
                    ))))
                })
                .unwrap_or(Default::default())
        })
        .unwrap_or(Default::default());

    Ok(transform_plugin)
}
