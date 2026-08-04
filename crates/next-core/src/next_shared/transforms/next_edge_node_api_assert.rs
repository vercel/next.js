use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::warn_for_edge_runtime::warn_for_edge_runtime;
use swc_core::{
    common::SyntaxContext,
    ecma::{ast::*, utils::ExprCtx, visit::VisitWith},
};
use turbo_tasks::Vc;
use turbopack::module_options::ModuleRule;
use turbopack_ecmascript::{CustomTransformer, TransformContext, TransformPlugin};

use super::{EcmascriptTransformStage, get_ecma_transform_rule};

turbo_tasks::dual_fn! {
pub fn next_edge_node_api_assert(
    enable_mdx_rs: bool,
    should_error_for_node_apis: bool,
    is_production: bool,
) -> Result<ModuleRule> {
    let transformer =
        turbo_tasks::read!(next_edge_node_api_assert_transform_plugin(should_error_for_node_apis, is_production)
            .to_resolved())
            ?;
    Ok(get_ecma_transform_rule(
        transformer,
        enable_mdx_rs,
        EcmascriptTransformStage::Postprocess,
    ))
}
}

#[turbo_tasks::function]
fn next_edge_node_api_assert_transform_plugin(
    should_error_for_node_apis: bool,
    is_production: bool,
) -> Vc<TransformPlugin> {
    Vc::cell(Box::new(NextEdgeNodeApiAssert {
        should_error_for_node_apis,
        is_production,
    }) as Box<dyn CustomTransformer + Send + Sync>)
}

#[derive(Debug)]
struct NextEdgeNodeApiAssert {
    should_error_for_node_apis: bool,
    is_production: bool,
}

#[cfg(not(feature = "sync"))]
#[async_trait]
impl CustomTransformer for NextEdgeNodeApiAssert {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "next_edge_node_api_assert", skip_all)]
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        let mut visitor = warn_for_edge_runtime(
            ctx.source_map.clone(),
            ExprCtx {
                is_unresolved_ref_safe: false,
                unresolved_ctxt: SyntaxContext::empty().apply_mark(ctx.unresolved_mark),
                in_strict: false,
                remaining_depth: 4,
            },
            self.should_error_for_node_apis,
            self.is_production,
        );
        program.visit_with(&mut visitor);
        Ok(())
    }
}

#[cfg(feature = "sync")]
impl CustomTransformer for NextEdgeNodeApiAssert {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "next_edge_node_api_assert", skip_all)]
    fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        let mut visitor = warn_for_edge_runtime(
            ctx.source_map.clone(),
            ExprCtx {
                is_unresolved_ref_safe: false,
                unresolved_ctxt: SyntaxContext::empty().apply_mark(ctx.unresolved_mark),
                in_strict: false,
                remaining_depth: 4,
            },
            self.should_error_for_node_apis,
            self.is_production,
        );
        program.visit_with(&mut visitor);
        Ok(())
    }
}
