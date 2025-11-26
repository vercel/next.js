use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::middleware_dynamic::next_middleware_dynamic;
use swc_core::ecma::{ast::*, visit::VisitMutWith};
use turbo_tasks::ResolvedVc;
use turbopack::module_options::{ModuleRule, ModuleRuleEffect};
use turbopack_ecmascript::{CustomTransformer, EcmascriptInputTransform, TransformContext};

use super::module_rule_match_js_no_url;

pub fn get_middleware_dynamic_assert_rule(enable_mdx_rs: bool) -> ModuleRule {
    let transformer = EcmascriptInputTransform::Plugin(ResolvedVc::cell(Box::new(
        NextMiddlewareDynamicAssert {},
    ) as _));
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
