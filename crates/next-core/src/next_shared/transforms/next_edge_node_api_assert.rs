use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::warn_for_edge_runtime::warn_for_edge_runtime;
use swc_core::{
    common::SyntaxContext,
    ecma::{ast::*, utils::ExprCtx, visit::VisitWith},
};
use turbo_tasks::ResolvedVc;
use turbopack::module_options::{ModuleRule, ModuleRuleEffect};
use turbopack_ecmascript::{CustomTransformer, EcmascriptInputTransform, TransformContext};

use super::module_rule_match_js_no_url;

pub fn next_edge_node_api_assert(
    enable_mdx_rs: bool,
    should_error_for_node_apis: bool,
    is_production: bool,
) -> ModuleRule {
    let transformer =
        EcmascriptInputTransform::Plugin(ResolvedVc::cell(Box::new(NextEdgeNodeApiAssert {
            should_error_for_node_apis,
            is_production,
        }) as _));
    ModuleRule::new(
        module_rule_match_js_no_url(enable_mdx_rs),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            preprocess: ResolvedVc::cell(vec![]),
            main: ResolvedVc::cell(vec![]),
            postprocess: ResolvedVc::cell(vec![transformer]),
        }],
    )
}

#[derive(Debug)]
struct NextEdgeNodeApiAssert {
    should_error_for_node_apis: bool,
    is_production: bool,
}

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
