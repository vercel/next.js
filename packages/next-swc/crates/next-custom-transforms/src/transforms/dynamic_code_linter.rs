//! Finds for `eval` calls in the source code.
//!
//! This is a port of middleware plugin of next.js for webpack.
//! https://github.com/vercel/next.js/blob/39deaa5976100dee858cb250ae247a81cea407d2/packages/next/src/build/webpack/plugins/middleware-plugin.ts#L665-L676

use swc_core::ecma::visit::VisitMutWith;
use turbopack_binding::swc::core::{
    common::errors::HANDLER,
    ecma::{
        ast::*,
        utils::{ExprCtx, ExprExt},
        visit::{noop_visit_mut_type, VisitMut},
    },
};

pub struct DynamicCodeLinter {
    pub expr_ctx: ExprCtx,
}

const MESSAGE: &str = "Dynamic Code Evaluation (e. g. 'eval', 'new Function', \
                       'WebAssembly.compile') not allowed in Edge Runtime";

impl VisitMut for DynamicCodeLinter {
    noop_visit_mut_type!();

    fn visit_mut_call_expr(&mut self, n: &mut CallExpr) {
        n.visit_mut_children_with(self);

        if let Callee::Expr(expr) = &n.callee {
            if expr.is_global_ref_to(&self.expr_ctx, "eval") {
                HANDLER.with(|handler| {
                    handler.struct_span_err(n.span, MESSAGE).emit();
                });
            }
        }
    }
}
