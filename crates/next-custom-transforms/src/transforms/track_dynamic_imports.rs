use serde::Deserialize;
use swc_core::{
    common::util::take::Take,
    ecma::{
        ast::*,
        utils::private_ident,
        visit::{noop_visit_mut_type, visit_mut_pass, VisitMut, VisitMutWith},
    },
    quote,
};

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Config {}

pub fn track_dynamic_imports() -> impl VisitMut + Pass {
    visit_mut_pass(ImportReplacer::new())
}

struct ImportReplacer {
    has_dynamic_import: bool,
    wrapper_function_local_ident: Ident,
}

impl ImportReplacer {
    pub fn new() -> Self {
        ImportReplacer {
            has_dynamic_import: false,
            wrapper_function_local_ident: private_ident!("$$trackDynamicImport__"),
        }
    }
}

impl VisitMut for ImportReplacer {
    noop_visit_mut_type!(); // TODO: what does this do?

    fn visit_mut_module_items(&mut self, stmts: &mut Vec<ModuleItem>) {
        stmts.visit_mut_children_with(self);

        if self.has_dynamic_import {
            // if we wrapped a dynamic import above, we need to import the wrapper
            stmts.insert(
                0,
                quote!(
                    "import { trackDynamicImport as $wrapper_fn } from \
                     'private-next-rsc-track-dynamic-import'" as ModuleItem,
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
            *expr = quote!(
                "$wrapper_fn($expr)" as Expr,
                wrapper_fn = self.wrapper_function_local_ident.clone().into(),
                expr: Expr = expr.take()
            )
        }
    }
}
