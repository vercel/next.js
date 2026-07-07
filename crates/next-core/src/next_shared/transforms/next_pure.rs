use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::pure::pure_magic;
use swc_core::ecma::{ast::*, visit::VisitMutWith};
use turbo_tasks::Vc;
use turbopack::module_options::ModuleRule;
use turbopack_ecmascript::{CustomTransformer, TransformContext, TransformPlugin};

use super::{EcmascriptTransformStage, get_ecma_transform_rule};

pub async fn get_next_pure_rule(enable_mdx_rs: bool) -> Result<ModuleRule> {
    let transformer = next_pure_transform_plugin().to_resolved().await?;
    Ok(get_ecma_transform_rule(
        transformer,
        enable_mdx_rs,
        EcmascriptTransformStage::Postprocess,
    ))
}

#[turbo_tasks::function]
fn next_pure_transform_plugin() -> Vc<TransformPlugin> {
    Vc::cell(Box::new(NextPure {}) as Box<dyn CustomTransformer + Send + Sync>)
}

#[derive(Debug)]
struct NextPure {}

#[async_trait]
impl CustomTransformer for NextPure {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "next_pure", skip_all)]
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        program.visit_mut_with(&mut pure_magic(ctx.comments.clone()));
        Ok(())
    }
}
