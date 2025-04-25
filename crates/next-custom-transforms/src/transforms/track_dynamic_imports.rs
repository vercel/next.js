use serde::Deserialize;
use swc_core::{
    common::{comments::Comments, util::take::Take, Span},
    ecma::{
        ast::*,
        utils::{prepend_stmt, private_ident},
        visit::{noop_visit_mut_type, visit_mut_pass, VisitMut, VisitMutWith},
    },
    quote,
};

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Config {}

pub fn track_dynamic_imports<C: Comments>(comments: C) -> impl VisitMut + Pass {
    visit_mut_pass(ImportReplacer::new(comments))
}

struct ImportReplacer<C> {
    comments: C,
    has_dynamic_import: bool,
    wrapper_function_local_ident: Ident,
}

impl<C> ImportReplacer<C>
where
    C: Comments,
{
    pub fn new(comments: C) -> Self {
        ImportReplacer {
            comments,
            has_dynamic_import: false,
            wrapper_function_local_ident: private_ident!("$$trackDynamicImport__"),
        }
    }
}

impl<C> VisitMut for ImportReplacer<C>
where
    C: Comments,
{
    noop_visit_mut_type!(); // TODO: what does this do?

    fn visit_mut_module_items(&mut self, stmts: &mut Vec<ModuleItem>) {
        stmts.visit_mut_children_with(self);

        if self.has_dynamic_import {
            // if we wrapped a dynamic import above, we need to import the wrapper
            prepend_stmt(
                stmts,
                quote!(
                    "import { trackDynamicImport as $wrapper_fn } from \
                     \"private-next-rsc-track-dynamic-import\"" as ModuleItem,
                    wrapper_fn = self.wrapper_function_local_ident.clone()
                ),
            );
        }
    }

    fn visit_mut_expr(&mut self, expr: &mut Expr) {
        expr.visit_mut_children_with(self);

        // before: `import(...)`
        // after:  `$$trackDynamicImport__(import(...))`

        if let Expr::Call(CallExpr {
            callee: Callee::Import(_),
            ..
        }) = expr
        {
            self.has_dynamic_import = true;
            let mut replacement_expr = quote!(
                "$wrapper_fn($expr)" as Expr,
                wrapper_fn = self.wrapper_function_local_ident.clone(),
                expr: Expr = expr.take()
            );
            // this call doesn't have any side effects, so add `/*#__PURE__*/`
            let replacement_expr_span = Span::dummy_with_cmt();
            replacement_expr.set_span(replacement_expr_span);
            self.comments.add_pure_comment(replacement_expr_span.lo);
            *expr = replacement_expr
        }
    }
}
