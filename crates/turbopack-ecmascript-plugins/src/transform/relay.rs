use std::path::PathBuf;

use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use swc_core::{
    common::{util::take::Take, FileName},
    ecma::{
        ast::{Module, Program},
        visit::FoldWith,
    },
};
use swc_relay::RelayLanguageConfig;
use turbo_tasks::trace::TraceRawVcs;
use turbopack_ecmascript::{CustomTransformer, TransformContext};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(rename_all = "camelCase")]
pub struct RelayConfig {
    pub src: String,
    pub artifact_directory: Option<String>,
    pub language: Option<RelayLanguage>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(rename_all = "lowercase")]
pub enum RelayLanguage {
    TypeScript,
    Flow,
    JavaScript,
}

#[derive(Debug)]
pub struct RelayTransformer {
    config: swc_relay::Config,
}

impl RelayTransformer {
    pub fn new(config: &RelayConfig) -> Self {
        let options = swc_relay::Config {
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
        Self { config: options }
    }
}

#[async_trait]
impl CustomTransformer for RelayTransformer {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "relay", skip_all)]
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        // If user supplied artifact_directory, it should be resolvable already.
        // Otherwise, supply default relative path (./__generated__)
        let (root, config) = if self.config.artifact_directory.is_some() {
            (PathBuf::new(), None)
        } else {
            let config = swc_relay::Config {
                artifact_directory: Some(PathBuf::from("__generated__")),
                ..self.config
            };
            (PathBuf::from("."), Some(config))
        };

        let p = std::mem::replace(program, Program::Module(Module::dummy()));
        *program = p.fold_with(&mut swc_relay::relay(
            config.as_ref().unwrap_or(&self.config),
            FileName::Real(PathBuf::from(ctx.file_name_str)),
            root,
            // [TODO]: pages_dir comes through next-swc-loader
            // https://github.com/vercel/next.js/blob/ea472e8058faea8ebdab2ef6d3aab257a1f0d11c/packages/next/src/build/webpack-config.ts#L792
            None,
            Some(ctx.unresolved_mark),
        ));

        Ok(())
    }
}
