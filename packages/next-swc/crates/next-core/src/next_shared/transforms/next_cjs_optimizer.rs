use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::cjs_optimizer::{cjs_optimizer, Config};
use turbo_tasks::Vc;
use turbopack_binding::{
    swc::core::{
        common::SyntaxContext,
        ecma::{ast::*, visit::VisitMutWith},
    },
    turbopack::{
        ecmascript::{CustomTransformer, EcmascriptInputTransform, TransformContext},
        turbopack::module_options::{ModuleRule, ModuleRuleEffect},
    },
};

use super::module_rule_match_js_no_url;

pub fn get_next_cjs_optimizer_rule(enable_mdx_rs: bool, config: Config) -> ModuleRule {
    let transformer =
        EcmascriptInputTransform::Plugin(Vc::cell(Box::new(NextCjsOptimizer { config }) as _));
    ModuleRule::new(
        module_rule_match_js_no_url(enable_mdx_rs),
        vec![ModuleRuleEffect::AddEcmascriptTransforms(Vc::cell(vec![
            transformer,
        ]))],
    )
}

#[derive(Debug)]
struct NextCjsOptimizer {
    config: Config,
}

#[async_trait]
impl CustomTransformer for NextCjsOptimizer {
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        let mut visitor = cjs_optimizer(
            self.config.clone(),
            SyntaxContext::empty().apply_mark(ctx.unresolved_mark),
        );

        program.visit_mut_with(&mut visitor);
        Ok(())
    }
}
