use std::path::PathBuf;

use anyhow::Result;
use async_trait::async_trait;
use swc_core::{
    common::FileName,
    ecma::{ast::Program, visit::VisitMutWith},
};
use turbopack_ecmascript::{CustomTransformer, TransformContext};

#[derive(Debug)]
pub struct StyledComponentsTransformer {
    config: styled_components::Config,
}

impl StyledComponentsTransformer {
    pub fn new(config: styled_components::Config) -> Self {
        Self { config }
    }
}

#[async_trait]
impl CustomTransformer for StyledComponentsTransformer {
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        program.visit_mut_with(&mut styled_components::styled_components(
            FileName::Real(PathBuf::from(ctx.file_path_str)),
            ctx.file_name_hash,
            self.config.clone(),
        ));

        Ok(())
    }
}
