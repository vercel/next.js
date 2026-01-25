use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::debug_fn_name::debug_fn_name;
use swc_core::ecma::{ast::Program, visit::VisitMutWith};
use turbo_tasks::ResolvedVc;
use turbopack::module_options::{ModuleRule, ModuleRuleEffect};
use turbopack_ecmascript::{CustomTransformer, EcmascriptInputTransform, TransformContext};

use super::module_rule_match_js_no_url;

pub fn get_debug_fn_name_rule(enable_mdx_rs: bool) -> ModuleRule {
    let debug_fn_name_transform = EcmascriptInputTransform::Plugin(ResolvedVc::cell(Box::new(
        DebugFnNameTransformer {},
    ) as _));

    ModuleRule::new(
        module_rule_match_js_no_url(enable_mdx_rs),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            preprocess: ResolvedVc::cell(vec![]),
            main: ResolvedVc::cell(vec![]),
            postprocess: ResolvedVc::cell(vec![debug_fn_name_transform]),
        }],
    )
}

#[derive(Debug)]
struct DebugFnNameTransformer {}

#[async_trait]
impl CustomTransformer for DebugFnNameTransformer {
    #[tracing::instrument(level = tracing::Level::TRACE, name = "debug_fn_name", skip_all)]
    async fn transform(&self, program: &mut Program, _ctx: &TransformContext<'_>) -> Result<()> {
        program.visit_mut_with(&mut debug_fn_name());
        Ok(())
    }
}
