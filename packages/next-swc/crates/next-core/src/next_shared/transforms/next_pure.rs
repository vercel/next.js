use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::pure::pure_magic;
use turbo_tasks::Vc;
use turbopack_binding::{
    swc::core::ecma::{ast::*, visit::VisitMutWith},
    turbopack::{
        ecmascript::{CustomTransformer, EcmascriptInputTransform, TransformContext},
        turbopack::module_options::{ModuleRule, ModuleRuleEffect},
    },
};

use super::module_rule_match_js_no_url;

pub fn get_next_pure_rule(enable_mdx_rs: bool) -> ModuleRule {
    let transformer = EcmascriptInputTransform::Plugin(Vc::cell(Box::new(NextPure {}) as _));
    ModuleRule::new(
        module_rule_match_js_no_url(enable_mdx_rs),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            prepend: Vc::cell(vec![]),
            append: Vc::cell(vec![transformer]),
        }],
    )
}

#[derive(Debug)]
struct NextPure {}

#[async_trait]
impl CustomTransformer for NextPure {
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        program.visit_mut_with(&mut pure_magic(ctx.comments.clone()));
        Ok(())
    }
}
