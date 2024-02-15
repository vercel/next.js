//! Finds for `eval` calls in the source code.
//!
//! This is a port of middleware plugin of next.js for webpack.
//! https://github.com/vercel/next.js/blob/39deaa5976100dee858cb250ae247a81cea407d2/packages/next/src/build/webpack/plugins/middleware-plugin.ts#L665-L676

use turbopack_binding::swc::core::{
    common::errors::HANDLER,
    ecma::{
        ast::*,
        utils::{ExprCtx, ExprExt},
        visit::{noop_visit_type, Visit, VisitWith},
    },
};

pub struct DynamicCodeLinter {
    pub expr_ctx: ExprCtx,
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
