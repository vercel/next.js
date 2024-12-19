use core::option::Option::None;

use serde::Deserialize;
use swc_core::{
    common::DUMMY_SP,
    ecma::{
        ast::*,
        utils::{private_ident, quote_ident, ExprFactory},
        visit::{noop_visit_mut_type, visit_mut_pass, VisitMut, VisitMutWith},
    },
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
            //
            // import {
            //   trackDynamicImport as $$trackDynamicImport__
            // } from 'private-next-rsc-track-dynamic-import'

            stmts.insert(
                0,
                ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                    span: DUMMY_SP,
                    specifiers: vec![ImportSpecifier::Named(ImportNamedSpecifier {
                        span: DUMMY_SP,
                        imported: Some(quote_ident!("trackDynamicImport").into()),
                        local: self.wrapper_function_local_ident.clone(),
                        is_type_only: false,
                    })],
                    src: Box::new(Str {
                        span: DUMMY_SP,
                        value: "private-next-rsc-track-dynamic-import".into(),
                        raw: None,
                    }),
                    type_only: false,
                    with: None,
                    phase: Default::default(),
                })),
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
            *expr = Expr::Call(CallExpr {
                span: DUMMY_SP,
                callee: Callee::Expr(self.wrapper_function_local_ident.clone().into()),
                args: vec![expr.clone().as_arg()],
                ..Default::default()
            })
        }
    }
}
