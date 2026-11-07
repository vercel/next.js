use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::middleware_dynamic::next_middleware_dynamic;
use swc_core::ecma::{ast::*, visit::VisitMutWith};
use turbo_tasks::Vc;
use turbopack::module_options::ModuleRule;
use turbopack_ecmascript::{CustomTransformer, TransformContext, TransformPlugin};

use super::{EcmascriptTransformStage, get_ecma_transform_rule};

pub async fn get_middleware_dynamic_assert_rule(enable_mdx_rs: bool) -> Result<ModuleRule> {
    let transformer = next_middleware_dynamic_assert_transform_plugin()
        .to_resolved()
        .await?;
    Ok(get_ecma_transform_rule(
        transformer,
        enable_mdx_rs,
        EcmascriptTransformStage::Postprocess,
    ))
}

#[turbo_tasks::function]
fn next_middleware_dynamic_assert_transform_plugin() -> Vc<TransformPlugin> {
    Vc::cell(Box::new(NextMiddlewareDynamicAssert {}) as Box<dyn CustomTransformer + Send + Sync>)
}

#[derive(Debug)]
struct NextMiddlewareDynamicAssert {}

#[async_trait]
impl CustomTransformer for NextMiddlewareDynamicAssert {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "next_middleware_dynamic_assert", skip_all)]
    async fn transform(&self, program: &mut Program, _ctx: &TransformContext<'_>) -> Result<()> {
        let mut visitor = next_middleware_dynamic();
        program.visit_mut_with(&mut visitor);
        Ok(())
    }
}
