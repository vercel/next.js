use std::{path::PathBuf, sync::Arc};

use anyhow::{Context, Result};
use async_trait::async_trait;
use bincode::{Decode, Encode};
use serde::Deserialize;
use swc_core::{
    common::FileName,
    ecma::{
        ast::{Expr, Program},
        visit::{Visit, VisitWith},
    },
};
use swc_relay::RelayLanguageConfig;
use turbo_tasks::{NonLocalValue, OperationValue};
use turbo_tasks_fs::FileSystemPath;
use turbopack_ecmascript::{CustomTransformer, TransformContext};

#[derive(Clone, Debug, PartialEq, Deserialize, NonLocalValue, OperationValue, Encode, Decode)]
#[serde(rename_all = "camelCase")]
pub struct RelayConfig {
    pub src: String,
    pub artifact_directory: Option<String>,
    pub language: Option<RelayLanguage>,
}

#[derive(Clone, Debug, PartialEq, Deserialize, NonLocalValue, OperationValue, Encode, Decode)]
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
        let path_to_proj = ctx
            .file_path
            .parent()
            .get_relative_path_to(&self.project_path);
        if path_to_proj.is_none() {
            // Modules in another filesystem need no artifact path unless they contain a Relay tag.
            let mut finder = RelayTagFinder::default();
            program.visit_with(&mut finder);
            if !finder.found {
                return Ok(());
            }
        }
        let path_to_proj =
            PathBuf::from(path_to_proj.context("Expected relative path to relay artifact")?);

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

#[derive(Default)]
struct RelayTagFinder {
    found: bool,
}

impl Visit for RelayTagFinder {
    fn visit_expr(&mut self, expression: &Expr) {
        if self.found {
            return;
        }
        // swc_relay also accepts non-identifier tags.
        match expression {
            Expr::TaggedTpl(template) if !matches!(&*template.tag, Expr::Ident(tag) if tag.sym != "graphql") =>
            {
                self.found = true;
            }
            _ => expression.visit_children_with(self),
        }
    }
}
