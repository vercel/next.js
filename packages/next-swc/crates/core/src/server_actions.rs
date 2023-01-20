use next_binding::swc::core::{
    common::{errors::HANDLER, util::take::Take, FileName, DUMMY_SP},
    ecma::{
        ast::{
            op, AssignExpr, BlockStmt, CallExpr, Decl, ExportDecl, Expr, ExprStmt, FnDecl,
            Function, Ident, Lit, ModuleDecl, ModuleItem, PatOrExpr, ReturnStmt, Stmt, Str,
            VarDecl, VarDeclKind, VarDeclarator,
        },
        atoms::JsWord,
        utils::{quote_ident, ExprFactory},
        visit::{as_folder, noop_visit_mut_type, Fold, VisitMut, VisitMutWith},
    },
};
use serde::Deserialize;

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Config {}

pub fn server_actions(file_name: &FileName, config: Config) -> impl VisitMut + Fold {
    as_folder(ServerActions {
        config,
        file_name: file_name.clone(),
        top_level: false,
        extra_items: Default::default(),
        annotations: Default::default(),
    })
}

struct ServerActions {
    config: Config,
    file_name: FileName,

    top_level: bool,

    annotations: Vec<Stmt>,
    extra_items: Vec<ModuleItem>,
}

impl VisitMut for ServerActions {
    fn visit_mut_fn_decl(&mut self, f: &mut FnDecl) {
        f.visit_mut_children_with(self);

        // Check if the first item is `"use action"`;
        if let Some(body) = &mut f.function.body {
            if let Some(Stmt::Expr(first)) = body.stmts.first() {
                match &*first.expr {
                    Expr::Lit(Lit::Str(Str { value, .. })) if value == "use action" => {}
                    _ => return,
                }
            } else {
                return;
            }

            body.stmts.remove(0);
        } else {
            return;
        }

        if !f.function.is_async {
            HANDLER.with(|handler| {
                handler
                    .struct_span_err(f.ident.span, "Server actions must be async")
                    .emit();
            });
        }

        let action_name: JsWord = format!("$ACTION_{}", f.ident.sym).into();

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
        self.annotations.push(annotate(
            &f.ident,
            "$$filepath",
            self.file_name.to_string().into(),
        ));

        // myAction.$$name = '$ACTION_myAction';
        self.annotations
            .push(annotate(&f.ident, "$$name", action_name.clone().into()));

        if self.top_level {
            // export const $ACTION_myAction = myAction;
            self.extra_items
                .push(ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl {
                    span: DUMMY_SP,
                    decl: Decl::Var(Box::new(VarDecl {
                        span: DUMMY_SP,
                        kind: VarDeclKind::Const,
                        declare: Default::default(),
                        decls: vec![VarDeclarator {
                            span: DUMMY_SP,
                            name: Ident::new(action_name, f.ident.span).into(),
                            init: Some(f.ident.clone().into()),
                            definite: Default::default(),
                        }],
                    })),
                })));
        } else {
            // Hoist the function to the top level.

            let call = CallExpr {
                span: DUMMY_SP,
                callee: quote_ident!(action_name.clone()).as_callee(),
                args: vec![f
                    .ident
                    .clone()
                    .make_member(quote_ident!("$$closure"))
                    .as_arg()],
                type_args: Default::default(),
            };

            let new_fn = Box::new(Function {
                params: f.function.params.clone(),
                decorators: f.function.decorators.take(),
                span: f.function.span,
                body: Some(BlockStmt {
                    span: DUMMY_SP,
                    stmts: vec![Stmt::Return(ReturnStmt {
                        span: DUMMY_SP,
                        arg: Some(call.into()),
                    })],
                }),
                is_generator: f.function.is_generator,
                is_async: f.function.is_async,
                type_params: Default::default(),
                return_type: Default::default(),
            });

            self.extra_items
                .push(ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl {
                    span: DUMMY_SP,
                    decl: FnDecl {
                        ident: Ident::new(action_name, f.ident.span),
                        function: f.function.take(),
                        declare: Default::default(),
                    }
                    .into(),
                })));

            f.function = new_fn;
        }
    }

    fn visit_mut_module_items(&mut self, stmts: &mut Vec<ModuleItem>) {
        let old_annotations = self.annotations.take();

        let mut new = Vec::with_capacity(stmts.len());
        for mut stmt in stmts.take() {
            self.top_level = true;
            stmt.visit_mut_with(self);

            new.push(stmt);
            new.extend(self.annotations.drain(..).map(ModuleItem::Stmt));
            new.append(&mut self.extra_items);
        }

        *stmts = new;

        self.annotations = old_annotations;
    }

    fn visit_mut_stmts(&mut self, stmts: &mut Vec<Stmt>) {
        let old_annotations = self.annotations.take();

        let mut new = Vec::with_capacity(stmts.len());
        for mut stmt in stmts.take() {
            self.top_level = false;
            stmt.visit_mut_with(self);

            new.push(stmt);
            new.append(&mut self.annotations);
        }

        *stmts = new;

        self.annotations = old_annotations;
    }

    noop_visit_mut_type!();
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
