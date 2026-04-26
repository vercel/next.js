use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::lint_codemod_comments::lint_codemod_comments;
use swc_core::ecma::{ast::Program, visit::VisitWith};
use turbo_tasks::Vc;
use turbopack::module_options::ModuleRule;
use turbopack_ecmascript::{CustomTransformer, TransformContext, TransformPlugin};

use super::get_ecma_transform_rule;
use crate::next_shared::transforms::EcmascriptTransformStage;

pub async fn get_next_lint_transform_rule(enable_mdx_rs: bool) -> Result<ModuleRule> {
    Ok(get_ecma_transform_rule(
        lint_transform_plugin().to_resolved().await?,
        enable_mdx_rs,
        EcmascriptTransformStage::Preprocess,
    ))
}

#[turbo_tasks::function]
fn lint_transform_plugin() -> Vc<TransformPlugin> {
    Vc::cell(Box::new(LintTransformer {}) as Box<dyn CustomTransformer + Send + Sync>)
}

#[derive(Debug)]
struct LintTransformer {}

#[async_trait]
impl CustomTransformer for LintTransformer {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "next_custom_lint", skip_all)]
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        program.visit_with(&mut lint_codemod_comments(ctx.comments));
        Ok(())
    }
}
