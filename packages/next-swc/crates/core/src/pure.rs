use turbopack_binding::swc::core::{
    common::{errors::HANDLER, util::take::Take},
    ecma::{
        ast::{CallExpr, Callee, Expr, Module},
        visit::{noop_visit_mut_type, VisitMut, VisitMutWith},
    },
};

use crate::import_analyzer::ImportMap;

pub struct PureTransform {
    imports: ImportMap,
}

impl VisitMut for PureTransform {
    fn visit_mut_expr(&mut self, e: &mut Expr) {
        e.visit_mut_children_with(self);

        if let Expr::Call(CallExpr {
            span,
            callee: Callee::Expr(callee),
            args,
            ..
        }) = e
        {
            if !self.imports.is_import(callee, "@next/magic", "markAsPure") {
                return;
            }

            if args.len() != 1 {
                HANDLER.with(|handler| {
                    handler
                        .struct_span_err(*span, "markAsPure() does not support multiple arguments")
                        .emit();
                });
                return;
            }

            *e = *args[0].expr.take();
        }
    }

    fn visit_mut_module(&mut self, m: &mut Module) {
        self.imports = ImportMap::analyze(m);

        m.visit_mut_children_with(self);
    }

    noop_visit_mut_type!();
}
