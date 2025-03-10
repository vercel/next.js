use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::lint_codemod_comments::lint_codemod_comments;
use swc_core::ecma::{ast::Program, visit::VisitWith};
use turbopack::module_options::ModuleRule;
use turbopack_ecmascript::{CustomTransformer, TransformContext};

use super::get_ecma_transform_rule;

pub fn get_next_lint_transform_rule(enable_mdx_rs: bool) -> ModuleRule {
    get_ecma_transform_rule(Box::new(LintTransformer {}), enable_mdx_rs, true)
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
