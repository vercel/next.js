use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::hoist_static_jsx::hoist_static_jsx;
use swc_core::ecma::{ast::*, visit::VisitMutWith};
use turbo_tasks::Vc;
use turbopack::module_options::ModuleRule;
use turbopack_ecmascript::{CustomTransformer, TransformContext, TransformPlugin};

use super::{EcmascriptTransformStage, get_ecma_transform_rule};

pub async fn get_next_hoist_static_jsx_rule(enable_mdx_rs: bool) -> Result<ModuleRule> {
    let transformer = next_hoist_static_jsx_transform_plugin()
        .to_resolved()
        .await?;
    Ok(get_ecma_transform_rule(
        transformer,
        enable_mdx_rs,
        // Must run after JSX is lowered to automatic-runtime jsx() calls.
        EcmascriptTransformStage::Postprocess,
    ))
}

#[turbo_tasks::function]
fn next_hoist_static_jsx_transform_plugin() -> Vc<TransformPlugin> {
    Vc::cell(Box::new(NextHoistStaticJsx {}) as Box<dyn CustomTransformer + Send + Sync>)
}

#[derive(Debug)]
struct NextHoistStaticJsx {}

#[async_trait]
impl CustomTransformer for NextHoistStaticJsx {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "next_hoist_static_jsx", skip_all)]
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        program.visit_mut_with(&mut hoist_static_jsx(ctx.unresolved_mark));
        Ok(())
    }
}
