use async_trait::async_trait;
use turbo_tasks::{Result, Vc};
use turbopack_binding::{
    swc::core::{
        common::{errors::HANDLER, SyntaxContext},
        ecma::{
            ast::*,
            utils::{ExprCtx, ExprExt},
            visit::{noop_visit_type, Visit, VisitWith},
        },
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

struct DynamicCodeLinter {
    expr_ctx: ExprCtx,
}

const MESSAGE: &str = "Dynamic Code Evaluation (e. g. 'eval', 'new Function', \
                       'WebAssembly.compile') not allowed in Edge Runtime";

impl Visit for DynamicCodeLinter {
    noop_visit_type!();

    fn visit_call_expr(&mut self, n: &CallExpr) {
        n.visit_children_with(self);

        if let Callee::Expr(expr) = &n.callee {
            if expr.is_global_ref_to(&self.expr_ctx, "eval") {
                HANDLER.with(|handler| {
                    handler.struct_span_err(n.span, MESSAGE).emit();
                });
            }
        }
    }
}
