use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::debug_instant_stack::DebugInstantStack;
use swc_core::ecma::ast::Program;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack::module_options::ModuleRule;
use turbopack_ecmascript::{CustomTransformer, TransformContext, TransformPlugin};

use super::{EcmascriptTransformStage, get_ecma_transform_rule};

turbo_tasks::dual_fn! {
pub fn get_next_debug_instant_stack_rule(
    enable_mdx_rs: bool,
    page_extensions: Vc<Vec<RcStr>>,
) -> Result<ModuleRule> {
    let transform = turbo_tasks::read!(next_debug_instant_stack_transform_plugin(page_extensions)
        .to_resolved())
        ?;

    Ok(get_ecma_transform_rule(
        transform,
        enable_mdx_rs,
        EcmascriptTransformStage::Postprocess,
    ))
}
}

#[turbo_tasks::function]
async fn next_debug_instant_stack_transform_plugin(
    page_extensions: ResolvedVc<Vec<RcStr>>,
) -> Result<Vc<TransformPlugin>> {
    Ok(Vc::cell(Box::new(NextDebugInstantStack {
        debug_instant_stack: DebugInstantStack::new(&*turbo_tasks::read!(page_extensions)?),
    }) as Box<dyn CustomTransformer + Send + Sync>))
}

#[derive(Debug)]
struct NextDebugInstantStack {
    debug_instant_stack: DebugInstantStack,
}

#[cfg(not(feature = "sync"))]
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

#[cfg(feature = "sync")]
impl CustomTransformer for NextDebugInstantStack {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "debug_instant_stack", skip_all)]
    fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        program.mutate(
            self.debug_instant_stack
                .get_pass(ctx.file_path_str.to_string()),
        );
        Ok(())
    }
}
