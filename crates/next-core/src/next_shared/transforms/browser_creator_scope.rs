//! Native-selected, source-admitted creator instrumentation for browser tests.
//! Resolved helper ingress is independently checked before chunk publication.
use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::browser_creator_scope::{
    browser_creator_scope, browser_promise_static_calls, preserve_browser_block_function_names,
};
use swc_core::{common::SyntaxContext, ecma::ast::Program};
use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;
use turbopack::module_options::{ModuleRule, ModuleRuleEffect, RuleCondition};
use turbopack_ecmascript::{
    CustomTransformer, EcmascriptInputTransform, EcmascriptInputTransforms, TransformContext,
    TransformPlugin,
};

pub async fn rule(project: FileSystemPath, framework: FileSystemPath) -> Result<ModuleRule> {
    let plugin = creator_plugin(project, framework).to_resolved().await?;
    Ok(ModuleRule::new_all(
        RuleCondition::any(
            [".js", ".mjs", ".jsx", ".ts", ".mts", ".tsx"]
                .into_iter()
                .map(|suffix| RuleCondition::ResourcePathEndsWith(suffix.to_owned()))
                .collect(),
        ),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            preprocess: Vc::<EcmascriptInputTransforms>::cell(Vec::new())
                .to_resolved()
                .await?,
            main: Vc::<EcmascriptInputTransforms>::cell(vec![EcmascriptInputTransform::Plugin(
                plugin,
            )])
            .to_resolved()
            .await?,
            postprocess: Vc::<EcmascriptInputTransforms>::cell(Vec::new())
                .to_resolved()
                .await?,
        }],
    ))
}
#[turbo_tasks::function]
fn creator_plugin(project: FileSystemPath, framework: FileSystemPath) -> Vc<TransformPlugin> {
    Vc::cell(Box::new(CreatorTransformer { project, framework })
        as Box<dyn CustomTransformer + Send + Sync>)
}
#[derive(Debug)]
struct CreatorTransformer {
    project: FileSystemPath,
    framework: FileSystemPath,
}
#[async_trait]
impl CustomTransformer for CreatorTransformer {
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        // Foreign library/framework callables receive no creator grant. Their
        // existing explicit continuation behavior and API guards remain intact.
        if self.project.get_path_to(&ctx.file_path).is_none()
            || self.framework.get_path_to(&ctx.file_path).is_some()
        {
            return Ok(());
        }
        browser_creator_scope(program)?;
        browser_promise_static_calls(
            program,
            SyntaxContext::empty().apply_mark(ctx.unresolved_mark),
        );
        preserve_browser_block_function_names(
            program,
            SyntaxContext::empty().apply_mark(ctx.unresolved_mark),
        );
        Ok(())
    }
}
