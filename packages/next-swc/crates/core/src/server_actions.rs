use next_binding::swc::core::{
    common::{errors::HANDLER, DUMMY_SP},
    ecma::{
        ast::{op, AssignExpr, CallExpr, Expr, ExprStmt, FnDecl, Ident, Lit, PatOrExpr, Stmt, Str},
        utils::{quote_ident, ExprFactory},
        visit::{as_folder, noop_visit_mut_type, Fold, VisitMut, VisitMutWith},
    },
};
use serde::Deserialize;

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Config {}

pub fn server_actions(config: Config) -> impl VisitMut + Fold {
    as_folder(ServerActions {
        config,
        annotations: Default::default(),
    })
}

struct ServerActions {
    config: Config,

    annotations: Vec<Stmt>,
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

        // myAction.$$typeof = Symbol.for('react.action.reference');
        self.annotations.push(annotate(
            &f.ident,
            "$$typeof",
            CallExpr {
                span: DUMMY_SP,
                callee: quote_ident!("Symbol")
                    .make_member(quote_ident!("for"))
                    .as_callee(),
                args: vec!["react.action.reference".as_arg()],
                type_args: Default::default(),
            }
            .into(),
        ));

        // myAction.$$filepath = '/app/page.tsx';
        self.annotations
            .push(annotate(&f.ident, "$$filepath", "".into()));

        // myAction.$$name = '$ACTION_myAction';
        self.annotations.push(annotate(
            &f.ident,
            "$$name",
            format!("$ACTION_{}", f.ident.sym).into(),
        ));
    }
}

fn annotate(fn_name: &Ident, field_name: &str, value: Box<Expr>) -> Stmt {
    Stmt::Expr(ExprStmt {
        span: DUMMY_SP,
        expr: AssignExpr {
            span: DUMMY_SP,
            op: op!("="),
            left: PatOrExpr::Expr(fn_name.clone().make_member(quote_ident!(field_name)).into()),
            right: value,
        }
        .into(),
    })
}
