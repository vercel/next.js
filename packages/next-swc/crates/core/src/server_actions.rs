use next_binding::swc::core::{
    common::errors::HANDLER,
    ecma::{
        ast::{Expr, FnDecl, Lit, Stmt, Str},
        visit::{as_folder, noop_visit_mut_type, Fold, VisitMut, VisitMutWith},
    },
};
use serde::Deserialize;

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Config {}

pub fn server_actions(config: Config) -> impl VisitMut + Fold {
    as_folder(ServerActions { config })
}

struct ServerActions {
    config: Config,
}

impl VisitMut for ServerActions {
    noop_visit_mut_type!();

    fn visit_mut_fn_decl(&mut self, f: &mut FnDecl) {
        f.visit_mut_children_with(self);

        // Check if the first item is `"use action"`;
        if let Some(body) = &f.function.body {
            if let Some(Stmt::Expr(first)) = body.stmts.first() {
                match &*first.expr {
                    Expr::Lit(Lit::Str(Str { value, .. })) if value == "use action" => {}
                    _ => return,
                }
            }
        }

        if !f.function.is_async {
            HANDLER.with(|handler| {
                handler
                    .struct_span_err(f.ident.span, "Server actions must be async")
                    .emit();
            });
        }
    }
}
