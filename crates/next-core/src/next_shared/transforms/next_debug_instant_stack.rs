use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::debug_instant_stack::DebugInstantStack;
use swc_core::ecma::ast::Program;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack::module_options::{ModuleRule, ModuleRuleEffect};
use turbopack_ecmascript::{
    CustomTransformer, EcmascriptInputTransform, TransformContext, TransformPlugin,
};

use super::module_rule_match_js_no_url;

pub async fn get_next_debug_instant_stack_rule(
    enable_mdx_rs: bool,
    page_extensions: Vc<Vec<RcStr>>,
) -> Result<ModuleRule> {
    let transform: EcmascriptInputTransform = EcmascriptInputTransform::Plugin(
        next_debug_instant_stack_transform_plugin(page_extensions)
            .to_resolved()
            .await?,
    );

    // TODO: use get_ecma_transform_rule instead
    Ok(ModuleRule::new(
        module_rule_match_js_no_url(enable_mdx_rs),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            preprocess: ResolvedVc::cell(vec![]),
            main: ResolvedVc::cell(vec![]),
            postprocess: ResolvedVc::cell(vec![transform]),
        }],
    ))
}

#[turbo_tasks::function]
async fn next_debug_instant_stack_transform_plugin(
    page_extensions: ResolvedVc<Vec<RcStr>>,
) -> Result<Vc<TransformPlugin>> {
    Ok(Vc::cell(Box::new(NextDebugInstantStack {
        debug_instant_stack: DebugInstantStack::new(&*page_extensions.await?),
    }) as Box<dyn CustomTransformer + Send + Sync>))
}

#[derive(Debug)]
struct NextDebugInstantStack {
    debug_instant_stack: DebugInstantStack,
}

#[async_trait]
impl CustomTransformer for NextDebugInstantStack {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "debug_instant_stack", skip_all)]
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        program.mutate(
            self.debug_instant_stack
                .get_pass(ctx.file_path_str.to_string()),
        );
        Ok(())
    }
}
