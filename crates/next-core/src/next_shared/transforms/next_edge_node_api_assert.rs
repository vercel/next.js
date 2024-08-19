use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::warn_for_edge_runtime::warn_for_edge_runtime;
use swc_core::{
    common::SyntaxContext,
    ecma::{ast::*, utils::ExprCtx, visit::VisitWith},
};
use turbo_tasks::Vc;
use turbopack::module_options::{ModuleRule, ModuleRuleEffect};
use turbopack_ecmascript::{CustomTransformer, EcmascriptInputTransform, TransformContext};

use super::module_rule_match_js_no_url;

pub fn next_edge_node_api_assert(enable_mdx_rs: bool) -> ModuleRule {
    let transformer =
        EcmascriptInputTransform::Plugin(Vc::cell(Box::new(NextEdgeNodeApiAssert {}) as _));
    ModuleRule::new(
        module_rule_match_js_no_url(enable_mdx_rs),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            prepend: Vc::cell(vec![]),
            append: Vc::cell(vec![transformer]),
        }],
    )
}

#[derive(Debug)]
struct NextEdgeNodeApiAssert {}

#[async_trait]
impl CustomTransformer for NextEdgeNodeApiAssert {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "next_edge_node_api_assert", skip_all)]
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        let mut visitor = warn_for_edge_runtime(
            ctx.source_map.clone(),
            ExprCtx {
                is_unresolved_ref_safe: false,
                unresolved_ctxt: SyntaxContext::empty().apply_mark(ctx.unresolved_mark),
            },
        );
        program.visit_with(&mut visitor);
        Ok(())
    }
}
