use swc_core::{
    common::{comments::Comments, errors::HANDLER, util::take::Take, Span, Spanned, DUMMY_SP},
    ecma::{
        ast::{CallExpr, Callee, EmptyStmt, Expr, Module, ModuleDecl, ModuleItem, Stmt},
        visit::{noop_visit_mut_type, VisitMut, VisitMutWith},
    },
};

use crate::transforms::import_analyzer::ImportMap;

pub fn pure_magic<C>(comments: C) -> PureTransform<C>
where
    C: Comments,
{
    PureTransform {
        imports: Default::default(),
        comments,
    }
}

pub struct PureTransform<C>
where
    C: Comments,
{
    imports: ImportMap,
    comments: C,
}

const MODULE: &str = "next/dist/build/swc/helpers";
const FN_NAME: &str = "__nextjs_pure";

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
            if !self.imports.is_import(callee, MODULE, FN_NAME) {
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

            let mut lo = e.span().lo;
            if lo.is_dummy() {
                lo = Span::dummy_with_cmt().lo;
            }

            self.comments.add_pure_comment(lo);
        }
    }

    fn visit_mut_module(&mut self, m: &mut Module) {
        self.imports = ImportMap::analyze(m);

        m.visit_mut_children_with(self);
    }

    fn visit_mut_module_item(&mut self, m: &mut ModuleItem) {
        if let ModuleItem::ModuleDecl(ModuleDecl::Import(import)) = m {
            if import.src.value == MODULE {
                *m = ModuleItem::Stmt(Stmt::Empty(EmptyStmt { span: DUMMY_SP }));
                return;
            }
        }

        m.visit_mut_children_with(self);
    }

    noop_visit_mut_type!();
}
