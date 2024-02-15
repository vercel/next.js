use async_trait::async_trait;
use next_custom_transforms::transforms::dynamic_code_linter::DynamicCodeLinter;
use turbo_tasks::{Result, Vc};
use turbopack_binding::{
    swc::core::{
        common::SyntaxContext,
        ecma::{ast::Program, utils::ExprCtx, visit::VisitWith},
    },
    turbopack::{
        ecmascript::{CustomTransformer, EcmascriptInputTransform, TransformContext},
        turbopack::module_options::{ModuleRule, ModuleRuleEffect},
    },
};

use super::module_rule_match_js_no_url;

pub fn get_dynamic_code_linter_rule(enable_mdx_rs: bool) -> ModuleRule {
    let transformer =
        EcmascriptInputTransform::Plugin(Vc::cell(Box::new(DynamicCodeLinterTransform {}) as _));

    ModuleRule::new(
        module_rule_match_js_no_url(enable_mdx_rs),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            prepend: Vc::cell(vec![]),
            append: Vc::cell(vec![transformer]),
        }],
    )
}

#[derive(Debug)]
struct DynamicCodeLinterTransform {}

#[async_trait]
impl CustomTransformer for DynamicCodeLinterTransform {
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        let expr_ctx = ExprCtx {
            unresolved_ctxt: SyntaxContext::empty().apply_mark(ctx.unresolved_mark),
            is_unresolved_ref_safe: false,
        };

        let mut linter = DynamicCodeLinter { expr_ctx };

        program.visit_with(&mut linter);

        Ok(())
    }
}
