use turbopack_binding::swc::core::{
    common::{comments::Comments, errors::HANDLER, util::take::Take, Spanned},
    ecma::{
        ast::{CallExpr, Callee, Expr, Module},
        visit::{as_folder, noop_visit_mut_type, Fold, VisitMut, VisitMutWith},
    },
};

use crate::import_analyzer::ImportMap;

pub fn pure_magic<C>(comments: C) -> impl VisitMut + Fold
where
    C: Comments,
{
    as_folder(PureTransform {
        imports: Default::default(),
        comments,
    })
}

struct PureTransform<C>
where
    C: Comments,
{
    imports: ImportMap,
    comments: C,
}

impl<C> VisitMut for PureTransform<C>
where
    C: Comments,
{
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

            self.comments.add_pure_comment(e.span().lo);
        }
    }

    fn visit_mut_module(&mut self, m: &mut Module) {
        self.imports = ImportMap::analyze(m);

        m.visit_mut_children_with(self);
    }

    noop_visit_mut_type!();
}
