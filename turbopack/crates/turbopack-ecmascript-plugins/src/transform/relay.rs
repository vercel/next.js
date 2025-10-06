use std::{path::PathBuf, sync::Arc};

use anyhow::{Context, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use swc_core::{common::FileName, ecma::ast::Program};
use swc_relay::RelayLanguageConfig;
use turbo_tasks::{NonLocalValue, OperationValue, trace::TraceRawVcs};
use turbo_tasks_fs::FileSystemPath;
use turbopack_ecmascript::{CustomTransformer, TransformContext};

#[derive(
    Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(rename_all = "camelCase")]
pub struct RelayConfig {
    pub src: String,
    pub artifact_directory: Option<String>,
    pub language: Option<RelayLanguage>,
}

#[derive(
    Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(rename_all = "lowercase")]
pub enum RelayLanguage {
    TypeScript,
    Flow,
    JavaScript,
}

#[derive(Debug)]
pub struct RelayTransformer {
    config: Arc<swc_relay::Config>,
    project_path: FileSystemPath,
}

impl RelayTransformer {
    pub fn new(config: &RelayConfig, project_path: &FileSystemPath) -> Self {
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

        Self {
            config: options.into(),
            project_path: project_path.clone(),
        }
    }
}

#[async_trait]
impl CustomTransformer for RelayTransformer {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "relay", skip_all)]
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        // If user supplied artifact_directory, it should be resolvable already.
        // Otherwise, supply default relative path (./__generated__)
        let path_to_proj = PathBuf::from(
            ctx.file_path
                .parent()
                .get_relative_path_to(&self.project_path)
                .context("Expected relative path to relay artifact")?,
        );

        program.mutate(swc_relay::relay(
            self.config.clone(),
            FileName::Real(PathBuf::from(ctx.file_name_str)),
            path_to_proj,
            // [TODO]: pages_dir comes through next-swc-loader
            // https://github.com/vercel/next.js/blob/ea472e8058faea8ebdab2ef6d3aab257a1f0d11c/packages/next/src/build/webpack-config.ts#L792
            None,
            Some(ctx.unresolved_mark),
        ));

        Ok(())
    }
}
