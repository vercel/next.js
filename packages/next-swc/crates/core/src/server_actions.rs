use std::convert::{TryFrom, TryInto};

use hex::encode as hex_encode;
use next_binding::swc::core::{
    common::{
        comments::{Comment, CommentKind, Comments},
        errors::HANDLER,
        util::take::Take,
        BytePos, FileName, DUMMY_SP,
    },
    ecma::{
        ast::*,
        atoms::JsWord,
        utils::{private_ident, quote_ident, ExprFactory},
        visit::{as_folder, noop_visit_mut_type, Fold, VisitMut, VisitMutWith},
    },
};
use serde::Deserialize;
use sha1::{Digest, Sha1};

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Config {
    pub is_server: bool,
}

pub fn server_actions<C: Comments>(
    file_name: &FileName,
    config: Config,
    comments: C,
) -> impl VisitMut + Fold {
    as_folder(ServerActions {
        config,
        comments,
        file_name: file_name.clone(),
        start_pos: BytePos(0),
        in_action_file: false,
        in_export_decl: false,
        in_default_export_decl: false,
        has_action: false,
        top_level: false,

        ident_cnt: 0,
        in_module: true,
        in_action_fn: false,
        in_action_closure: false,
        closure_idents: Default::default(),
        action_idents: Default::default(),
        exported_idents: Default::default(),
        inlined_action_idents: Default::default(),

        annotations: Default::default(),
        extra_items: Default::default(),
        export_actions: Default::default(),
    })
}

struct ServerActions<C: Comments> {
    #[allow(unused)]
    config: Config,
    file_name: FileName,
    comments: C,

    start_pos: BytePos,
    in_action_file: bool,
    in_export_decl: bool,
    in_default_export_decl: bool,
    has_action: bool,
    top_level: bool,

    ident_cnt: u32,
    in_module: bool,
    in_action_fn: bool,
    in_action_closure: bool,
    closure_idents: Vec<Id>,
    action_idents: Vec<Name>,
    inlined_action_idents: Vec<(Id, Id)>,

    // (ident, export name)
    exported_idents: Vec<(Id, String)>,

    annotations: Vec<Stmt>,
    extra_items: Vec<ModuleItem>,
    export_actions: Vec<String>,
}

impl<C: Comments> ServerActions<C> {
    // Check if the function or arrow function is an action function
    fn get_action_info(
        &mut self,
        maybe_body: Option<&mut BlockStmt>,
        remove_directive: bool,
    ) -> bool {
        let mut is_action_fn = false;

        if self.in_action_file && self.in_export_decl {
            // All export functions in a server file are actions
            is_action_fn = true;
        } else {
            // Check if the function has `"use server"`
            if let Some(body) = maybe_body {
                remove_server_directive_index_in_fn(
                    &mut body.stmts,
                    remove_directive,
                    &mut is_action_fn,
                );

                if is_action_fn && !self.config.is_server {
                    HANDLER.with(|handler| {
                        handler
                            .struct_span_err(
                                body.span,
                                "\"use server\" functions are not allowed in client components. \
                                 You can import them from a \"use server\" file instead.",
                            )
                            .emit()
                    });
                }
            }
        }

        is_action_fn
    }

    fn add_action_annotations_and_maybe_hoist(
        &mut self,
        ident: &Ident,
        function: Option<&mut Box<Function>>,
        arrow: Option<&mut ArrowExpr>,
        call_expr_and_ident: Option<(&mut CallExpr, CallExpr, Ident)>,
        return_paren: bool,
    ) -> (Option<Box<ParenExpr>>, Option<Box<Function>>) {
        let action_name: JsWord = gen_ident(&mut self.ident_cnt);
        let action_ident = private_ident!(action_name.clone());

        if !self.in_action_file {
            self.inlined_action_idents
                .push((ident.to_id(), action_ident.to_id()));
        }

        let export_name: JsWord = if self.in_default_export_decl {
            "default".into()
        } else {
            action_name
        };

        self.has_action = true;
        self.export_actions.push(export_name.to_string());

        // If it's already a top level function, we don't need to hoist it.
        if self.top_level && arrow.is_none() && call_expr_and_ident.is_none() {
            annotate_ident_as_action(
                &mut self.annotations,
                ident.clone(),
                Vec::new(),
                self.file_name.to_string(),
                export_name.to_string(),
                false,
                None,
            );

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
                            name: action_ident.into(),
                            init: Some(ident.clone().into()),
                            definite: Default::default(),
                        }],
                    })),
                })));
        } else {
            // Hoist the function to the top level and export it. To hoist it, we need to
            // first Collect all the identifiers defined in the closure and used
            // in the action function. Dedup the identifiers.
            let mut added_ids = Vec::new();
            let mut ids_from_closure = self.action_idents.clone();
            ids_from_closure.retain(|id| {
                if added_ids.contains(id) {
                    false
                } else if self.closure_idents.contains(&id.0) {
                    added_ids.push(id.clone());
                    true
                } else {
                    false
                }
            });

            let closure_arg = private_ident!("closure");

            let call = CallExpr {
                span: DUMMY_SP,
                callee: action_ident.clone().as_callee(),
                args: vec![ident.clone().make_member(quote_ident!("$$bound")).as_arg()],
                type_args: Default::default(),
            };

            if let Some(a) = arrow {
                let mut arrow_annotations = Vec::new();
                annotate_ident_as_action(
                    &mut arrow_annotations,
                    ident.clone(),
                    ids_from_closure
                        .iter()
                        .cloned()
                        .map(|id| Some(id.as_arg()))
                        .collect(),
                    self.file_name.to_string(),
                    export_name.to_string(),
                    true,
                    None,
                );

                if let BlockStmtOrExpr::BlockStmt(block) = &mut *a.body {
                    block.visit_mut_with(&mut ClosureReplacer {
                        closure_arg: &closure_arg,
                        used_ids: &ids_from_closure,
                    });
                }

                let new_arrow = ArrowExpr {
                    span: DUMMY_SP,
                    params: a.params.clone(),
                    body: Box::new(BlockStmtOrExpr::Expr(Box::new(Expr::Call(call)))),
                    is_async: a.is_async,
                    is_generator: a.is_generator,
                    type_params: Default::default(),
                    return_type: Default::default(),
                };

                // export const $ACTION_myAction = async () => {}
                let mut new_params: Vec<Pat> = vec![closure_arg.clone().into()];
                for (i, p) in a.params.iter().enumerate() {
                    new_params.push(Pat::Assign(AssignPat {
                        span: DUMMY_SP,
                        left: Box::new(p.clone()),
                        right: Box::new(Expr::Member(MemberExpr {
                            span: DUMMY_SP,
                            obj: Box::new(Expr::Ident(closure_arg.clone())),
                            prop: MemberProp::Computed(ComputedPropName {
                                span: DUMMY_SP,
                                expr: Box::new(Expr::from(ids_from_closure.len() + i)),
                            }),
                        })),
                        type_ann: None,
                    }));
                }
                self.extra_items
                    .push(ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl {
                        span: DUMMY_SP,
                        decl: Decl::Var(Box::new(VarDecl {
                            span: DUMMY_SP,
                            kind: VarDeclKind::Const,
                            declare: Default::default(),
                            decls: vec![VarDeclarator {
                                span: DUMMY_SP,
                                name: action_ident.into(),
                                init: Some(Box::new(Expr::Arrow(ArrowExpr {
                                    params: new_params,
                                    ..a.clone()
                                }))),
                                definite: Default::default(),
                            }],
                        })),
                    })));

                // Create a paren expr to wrap all annotations:
                // ($ACTION = async () => {}, $ACTION.$$id = "..", ..,
                // $ACTION)
                let mut exprs = vec![Box::new(Expr::Assign(AssignExpr {
                    span: DUMMY_SP,
                    left: PatOrExpr::Pat(Box::new(Pat::Ident(ident.clone().into()))),
                    op: op!("="),
                    right: Box::new(Expr::Arrow(new_arrow)),
                }))];
                exprs.extend(arrow_annotations.into_iter().map(|a| {
                    if let Stmt::Expr(ExprStmt { expr, .. }) = a {
                        expr
                    } else {
                        unreachable!()
                    }
                }));
                exprs.push(Box::new(Expr::Ident(ident.clone())));

                let new_paren = ParenExpr {
                    span: DUMMY_SP,
                    expr: Box::new(Expr::Seq(SeqExpr {
                        span: DUMMY_SP,
                        exprs,
                    })),
                };

                return (Some(Box::new(new_paren)), None);
            } else if let Some(f) = function {
                let mut fn_annotations = Vec::new();
                annotate_ident_as_action(
                    if return_paren {
                        &mut fn_annotations
                    } else {
                        &mut self.annotations
                    },
                    ident.clone(),
                    ids_from_closure
                        .iter()
                        .cloned()
                        .map(|id| Some(id.as_arg()))
                        .collect(),
                    self.file_name.to_string(),
                    export_name.to_string(),
                    true,
                    None,
                );

                f.body.visit_mut_with(&mut ClosureReplacer {
                    closure_arg: &closure_arg,
                    used_ids: &ids_from_closure,
                });

                let new_fn = Function {
                    params: f.params.clone(),
                    decorators: f.decorators.take(),
                    span: f.span,
                    body: Some(BlockStmt {
                        span: DUMMY_SP,
                        stmts: vec![Stmt::Return(ReturnStmt {
                            span: DUMMY_SP,
                            arg: Some(call.into()),
                        })],
                    }),
                    is_generator: f.is_generator,
                    is_async: f.is_async,
                    type_params: Default::default(),
                    return_type: Default::default(),
                };

                // export async function $ACTION_myAction () {}
                let mut new_params: Vec<Param> = vec![closure_arg.clone().into()];
                for (i, p) in f.params.iter().enumerate() {
                    new_params.push(Param::from(Pat::Assign(AssignPat {
                        span: DUMMY_SP,
                        left: Box::new(p.pat.clone()),
                        right: Box::new(Expr::Member(MemberExpr {
                            span: DUMMY_SP,
                            obj: Box::new(Expr::Ident(closure_arg.clone())),
                            prop: MemberProp::Computed(ComputedPropName {
                                span: DUMMY_SP,
                                expr: Box::new(Expr::from(ids_from_closure.len() + i)),
                            }),
                        })),
                        type_ann: None,
                    })));
                }
                self.extra_items
                    .push(ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl {
                        span: DUMMY_SP,
                        decl: FnDecl {
                            ident: action_ident,
                            function: Box::new(Function {
                                params: new_params,
                                ..*f.take()
                            }),
                            declare: Default::default(),
                        }
                        .into(),
                    })));

                if return_paren {
                    // Create a paren expr to wrap all annotations:
                    // ($ACTION = async function () {}, $ACTION.$$id = "..", ..,
                    // $ACTION)
                    let mut exprs = vec![Box::new(Expr::Assign(AssignExpr {
                        span: DUMMY_SP,
                        left: PatOrExpr::Pat(Box::new(Pat::Ident(ident.clone().into()))),
                        op: op!("="),
                        right: Box::new(Expr::Fn(FnExpr {
                            ident: None,
                            function: Box::new(new_fn),
                        })),
                    }))];
                    fn_annotations.into_iter().for_each(|a| {
                        if let Stmt::Expr(ExprStmt { expr, .. }) = a {
                            exprs.push(expr);
                        }
                    });
                    exprs.push(Box::new(Expr::Ident(ident.clone())));

                    let new_paren = ParenExpr {
                        span: DUMMY_SP,
                        expr: Box::new(Expr::Seq(SeqExpr {
                            span: DUMMY_SP,
                            exprs,
                        })),
                    };

                    return (Some(Box::new(new_paren)), None);
                }

                return (None, Some(Box::new(new_fn)));
            } else if let Some((c, original_call, inner_action_ident)) = call_expr_and_ident {
                let mut arrow_annotations = Vec::new();
                annotate_ident_as_action(
                    &mut arrow_annotations,
                    ident.clone(),
                    vec![],
                    self.file_name.to_string(),
                    export_name.to_string(),
                    true,
                    Some(inner_action_ident),
                );

                self.extra_items
                    .push(ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl {
                        span: DUMMY_SP,
                        decl: Decl::Var(Box::new(VarDecl {
                            span: DUMMY_SP,
                            kind: VarDeclKind::Const,
                            declare: Default::default(),
                            decls: vec![VarDeclarator {
                                span: DUMMY_SP,
                                name: action_ident.into(),
                                init: Some(Box::new(Expr::Call(c.clone()))),
                                definite: Default::default(),
                            }],
                        })),
                    })));

                // Create a paren expr to wrap all annotations:
                // ($ACTION = hoc(...), $ACTION.$$id = "..", .., $ACTION)
                let mut exprs = vec![Box::new(Expr::Assign(AssignExpr {
                    span: DUMMY_SP,
                    left: PatOrExpr::Pat(Box::new(Pat::Ident(ident.clone().into()))),
                    op: op!("="),
                    right: Box::new(Expr::Call(original_call)),
                }))];
                exprs.extend(arrow_annotations.into_iter().map(|a| {
                    if let Stmt::Expr(ExprStmt { expr, .. }) = a {
                        expr
                    } else {
                        unreachable!()
                    }
                }));
                exprs.push(Box::new(Expr::Ident(ident.clone())));

                let new_paren = ParenExpr {
                    span: DUMMY_SP,
                    expr: Box::new(Expr::Seq(SeqExpr {
                        span: DUMMY_SP,
                        exprs,
                    })),
                };

                return (Some(Box::new(new_paren)), None);
            }
        }

        (None, None)
    }
}

impl<C: Comments> VisitMut for ServerActions<C> {
    fn visit_mut_export_decl(&mut self, decl: &mut ExportDecl) {
        let old = self.in_export_decl;
        self.in_export_decl = true;
        decl.decl.visit_mut_with(self);
        self.in_export_decl = old;
    }

    fn visit_mut_export_default_decl(&mut self, decl: &mut ExportDefaultDecl) {
        let old = self.in_export_decl;
        let old_default = self.in_default_export_decl;
        self.in_export_decl = true;
        self.in_default_export_decl = true;
        decl.decl.visit_mut_with(self);
        self.in_export_decl = old;
        self.in_default_export_decl = old_default;
    }

    fn visit_mut_export_default_expr(&mut self, expr: &mut ExportDefaultExpr) {
        let old = self.in_export_decl;
        let old_default = self.in_default_export_decl;
        self.in_export_decl = true;
        self.in_default_export_decl = true;
        expr.expr.visit_mut_with(self);
        self.in_export_decl = old;
        self.in_default_export_decl = old_default;
    }

    fn visit_mut_fn_expr(&mut self, f: &mut FnExpr) {
        let is_action_fn = self.get_action_info(f.function.body.as_mut(), false);

        {
            // Visit children
            let old_in_action_fn = self.in_action_fn;
            let old_in_module = self.in_module;
            let old_in_action_closure = self.in_action_closure;
            let old_in_export_decl = self.in_export_decl;
            let old_in_default_export_decl = self.in_default_export_decl;
            self.in_action_fn = is_action_fn;
            self.in_module = false;
            self.in_action_closure = true;
            self.in_export_decl = false;
            self.in_default_export_decl = false;
            f.visit_mut_children_with(self);
            self.in_action_fn = old_in_action_fn;
            self.in_module = old_in_module;
            self.in_action_closure = old_in_action_closure;
            self.in_export_decl = old_in_export_decl;
            self.in_default_export_decl = old_in_default_export_decl;
        }

        if !is_action_fn {
            return;
        }

        if !f.function.is_async {
            HANDLER.with(|handler| {
                handler
                    .struct_span_err(f.function.span, "Server actions must be async functions")
                    .emit();
            });
        }
    }

    fn visit_mut_fn_decl(&mut self, f: &mut FnDecl) {
        let is_action_fn = self.get_action_info(f.function.body.as_mut(), true);

        {
            // Visit children
            let old_in_action_fn = self.in_action_fn;
            let old_in_module = self.in_module;
            let old_in_action_closure = self.in_action_closure;
            let old_in_export_decl = self.in_export_decl;
            let old_in_default_export_decl = self.in_default_export_decl;
            self.in_action_fn = is_action_fn;
            self.in_module = false;
            self.in_action_closure = true;
            self.in_export_decl = false;
            self.in_default_export_decl = false;
            f.visit_mut_children_with(self);
            self.in_action_fn = old_in_action_fn;
            self.in_module = old_in_module;
            self.in_action_closure = old_in_action_closure;
            self.in_export_decl = old_in_export_decl;
            self.in_default_export_decl = old_in_default_export_decl;
        }

        if !is_action_fn {
            return;
        }

        if !f.function.is_async {
            HANDLER.with(|handler| {
                handler
                    .struct_span_err(f.ident.span, "Server actions must be async functions")
                    .emit();
            });
        } else if !self.in_action_file {
            let (_, maybe_new_fn) = self.add_action_annotations_and_maybe_hoist(
                &f.ident,
                Some(&mut f.function),
                None,
                None,
                false,
            );

            if let Some(new_fn) = maybe_new_fn {
                f.function = new_fn;
            }
        }
    }

    fn visit_mut_arrow_expr(&mut self, a: &mut ArrowExpr) {
        // Arrow expressions need to be visited in prepass to determine if it's
        // an action function or not.
        let is_action_fn = self.get_action_info(
            if let BlockStmtOrExpr::BlockStmt(block) = &mut *a.body {
                Some(block)
            } else {
                None
            },
            false,
        );

        {
            // Visit children
            let old_in_action_fn = self.in_action_fn;
            let old_in_module = self.in_module;
            let old_in_action_closure = self.in_action_closure;
            let old_in_export_decl = self.in_export_decl;
            let old_in_default_export_decl = self.in_default_export_decl;
            self.in_action_fn = is_action_fn;
            self.in_module = false;
            self.in_action_closure = true;
            self.in_export_decl = false;
            self.in_default_export_decl = false;
            a.visit_mut_children_with(self);
            self.in_action_fn = old_in_action_fn;
            self.in_module = old_in_module;
            self.in_action_closure = old_in_action_closure;
            self.in_export_decl = old_in_export_decl;
            self.in_default_export_decl = old_in_default_export_decl;
        }

        if !is_action_fn {
            return;
        }

        if !a.is_async && !self.in_action_file {
            HANDLER.with(|handler| {
                handler
                    .struct_span_err(a.span, "Server actions must be async functions")
                    .emit();
            });
        }
    }

    fn visit_mut_module(&mut self, m: &mut Module) {
        self.start_pos = m.span.lo;
        m.visit_mut_children_with(self);
    }

    fn visit_mut_stmt(&mut self, n: &mut Stmt) {
        n.visit_mut_children_with(self);

        if self.in_module {
            return;
        }

        let ids = collect_idents_in_stmt(n);
        if !self.in_action_fn && !self.in_action_file {
            self.closure_idents.extend(ids);
        }
    }

    fn visit_mut_param(&mut self, n: &mut Param) {
        n.visit_mut_children_with(self);

        if !self.in_action_fn && !self.in_action_file {
            match &n.pat {
                Pat::Ident(ident) => {
                    self.closure_idents.push(ident.id.to_id());
                }
                Pat::Array(array) => {
                    self.closure_idents
                        .extend(collect_idents_in_array_pat(&array.elems));
                }
                Pat::Object(object) => {
                    self.closure_idents
                        .extend(collect_idents_in_object_pat(&object.props));
                }
                Pat::Rest(rest) => {
                    if let Pat::Ident(ident) = &*rest.arg {
                        self.closure_idents.push(ident.id.to_id());
                    }
                }
                _ => {}
            }
        }
    }

    fn visit_mut_expr(&mut self, n: &mut Expr) {
        if self.in_action_fn && self.in_action_closure {
            if let Ok(name) = Name::try_from(&*n) {
                self.in_action_closure = false;
                self.action_idents.push(name);
                n.visit_mut_children_with(self);
                self.in_action_closure = true;
                return;
            }
        }

        n.visit_mut_children_with(self);

        if self.in_action_file {
            return;
        }

        match n {
            Expr::Arrow(a) => {
                let is_action_fn = self.get_action_info(
                    if let BlockStmtOrExpr::BlockStmt(block) = &mut *a.body {
                        Some(block)
                    } else {
                        None
                    },
                    true,
                );

                if !is_action_fn {
                    return;
                }

                // We need to give a name to the arrow function
                // action and hoist it to the top.
                let action_name = gen_ident(&mut self.ident_cnt);
                let ident = private_ident!(action_name);

                let (maybe_new_paren, _) =
                    self.add_action_annotations_and_maybe_hoist(&ident, None, Some(a), None, true);

                *n = attach_name_to_expr(
                    ident,
                    if let Some(new_paren) = maybe_new_paren {
                        Expr::Paren(*new_paren)
                    } else {
                        Expr::Arrow(a.clone())
                    },
                    &mut self.extra_items,
                );
            }
            Expr::Fn(f) => {
                let is_action_fn = self.get_action_info(f.function.body.as_mut(), true);

                if !is_action_fn {
                    return;
                }
                let ident = match f.ident.as_mut() {
                    None => {
                        let action_name = gen_ident(&mut self.ident_cnt);
                        let ident = Ident::new(action_name, DUMMY_SP);
                        f.ident.insert(ident)
                    }
                    Some(i) => i,
                };

                let (maybe_new_paren, _) = self.add_action_annotations_and_maybe_hoist(
                    ident,
                    Some(&mut f.function),
                    None,
                    None,
                    true,
                );

                if let Some(new_paren) = maybe_new_paren {
                    *n = attach_name_to_expr(
                        ident.clone(),
                        Expr::Paren(*new_paren),
                        &mut self.extra_items,
                    );
                }
            }
            Expr::Call(c) => {
                // Here we need to handle HOCs that wrap actions, e.g.:
                // withValidator(($ACTION = async function () { ... }, ...))

                // For now, we only handle the case where the HOC has a single argument:
                // the action function.
                if c.args.len() != 1 {
                    return;
                }

                if let Some(ExprOrSpread {
                    expr:
                        box Expr::Paren(ParenExpr {
                            expr: box Expr::Seq(seq_expr),
                            ..
                        }),
                    ..
                }) = c.args.first_mut()
                {
                    if let Some(box Expr::Assign(AssignExpr {
                        left: PatOrExpr::Pat(box Pat::Ident(pat_id)),
                        ..
                    })) = seq_expr.exprs.first_mut()
                    {
                        let maybe_action_ident = self
                            .inlined_action_idents
                            .iter()
                            .find(|id| id.0 == pat_id.id.to_id());
                        if let Some(action_ident) = maybe_action_ident {
                            // This is a HOC that wraps an
                            // action.
                            // We need to give a name to the result
                            // action and hoist it to the top.
                            let action_name = gen_ident(&mut self.ident_cnt);
                            let ident = private_ident!(action_name);

                            let mut new_call = CallExpr {
                                span: DUMMY_SP,
                                callee: c.callee.clone(),
                                args: vec![ExprOrSpread {
                                    spread: None,
                                    expr: Box::new(Expr::Ident(action_ident.1.clone().into())),
                                }],
                                type_args: Default::default(),
                            };

                            let (maybe_new_paren, _) = self.add_action_annotations_and_maybe_hoist(
                                &ident,
                                None,
                                None,
                                Some((&mut new_call, c.clone(), action_ident.0.clone().into())),
                                true,
                            );

                            *n = attach_name_to_expr(
                                ident,
                                if let Some(new_paren) = maybe_new_paren {
                                    // Keep the original $$bound value.
                                    Expr::Paren(*new_paren)
                                } else {
                                    Expr::Call(c.clone())
                                },
                                &mut self.extra_items,
                            );
                        }
                    }
                }
            }
            _ => {}
        }
    }

    fn visit_mut_module_items(&mut self, stmts: &mut Vec<ModuleItem>) {
        remove_server_directive_index_in_module(
            stmts,
            &mut self.in_action_file,
            &mut self.has_action,
        );

        let old_annotations = self.annotations.take();
        let mut new = Vec::with_capacity(stmts.len());

        for mut stmt in stmts.take() {
            self.top_level = true;

            // For action file, it's not allowed to export things other than async
            // functions.
            if self.in_action_file {
                let mut disallowed_export_span = DUMMY_SP;

                // Currrently only function exports are allowed.
                match &mut stmt {
                    ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl { decl, span })) => {
                        match decl {
                            Decl::Fn(f) => {
                                // export function foo() {}
                                self.exported_idents
                                    .push((f.ident.to_id(), f.ident.sym.to_string()));
                            }
                            Decl::Var(var) => {
                                // export const foo = 1
                                let ids: Vec<Id> = collect_idents_in_var_decls(&var.decls);
                                self.exported_idents.extend(
                                    ids.into_iter().map(|id| (id.clone(), id.0.to_string())),
                                );

                                for decl in &mut var.decls {
                                    if let Some(init) = &decl.init {
                                        match &**init {
                                            Expr::Fn(_f) => {}
                                            Expr::Arrow(_a) => {}
                                            Expr::Call(_c) => {}
                                            _ => {
                                                disallowed_export_span = *span;
                                            }
                                        }
                                    }
                                }
                            }
                            _ => {
                                disallowed_export_span = *span;
                            }
                        }
                    }
                    ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(named)) => {
                        if named.src.is_some() {
                            disallowed_export_span = named.span;
                        } else {
                            for spec in &mut named.specifiers {
                                if let ExportSpecifier::Named(ExportNamedSpecifier {
                                    orig: ModuleExportName::Ident(ident),
                                    exported,
                                    ..
                                }) = spec
                                {
                                    if let Some(export_name) = exported {
                                        if let ModuleExportName::Ident(Ident { sym, .. }) =
                                            export_name
                                        {
                                            // export { foo as bar }
                                            self.exported_idents
                                                .push((ident.to_id(), sym.to_string()));
                                        } else if let ModuleExportName::Str(str) = export_name {
                                            // export { foo as "bar" }
                                            self.exported_idents
                                                .push((ident.to_id(), str.value.to_string()));
                                        }
                                    } else {
                                        // export { foo }
                                        self.exported_idents
                                            .push((ident.to_id(), ident.sym.to_string()));
                                    }
                                } else {
                                    disallowed_export_span = named.span;
                                }
                            }
                        }
                    }
                    ModuleItem::ModuleDecl(ModuleDecl::ExportDefaultDecl(ExportDefaultDecl {
                        decl,
                        span,
                        ..
                    })) => match decl {
                        DefaultDecl::Fn(f) => {
                            if let Some(ident) = &f.ident {
                                // export default function foo() {}
                                self.exported_idents.push((ident.to_id(), "default".into()));
                            } else {
                                // export default function() {}
                                let new_ident =
                                    Ident::new(gen_ident(&mut self.ident_cnt), DUMMY_SP);
                                f.ident = Some(new_ident.clone());
                                self.exported_idents
                                    .push((new_ident.to_id(), "default".into()));
                            }
                        }
                        _ => {
                            disallowed_export_span = *span;
                        }
                    },
                    ModuleItem::ModuleDecl(ModuleDecl::ExportDefaultExpr(default_expr)) => {
                        match &mut *default_expr.expr {
                            Expr::Fn(_f) => {}
                            Expr::Arrow(arrow) => {
                                if !arrow.is_async {
                                    disallowed_export_span = default_expr.span;
                                } else {
                                    // export default async () => {}
                                    let new_ident =
                                        Ident::new(gen_ident(&mut self.ident_cnt), DUMMY_SP);

                                    self.exported_idents
                                        .push((new_ident.to_id(), "default".into()));

                                    *default_expr.expr = attach_name_to_expr(
                                        new_ident,
                                        Expr::Arrow(arrow.clone()),
                                        &mut self.extra_items,
                                    );
                                }
                            }
                            Expr::Ident(ident) => {
                                // export default foo
                                self.exported_idents.push((ident.to_id(), "default".into()));
                            }
                            Expr::Call(call) => {
                                // export default fn()
                                let new_ident =
                                    Ident::new(gen_ident(&mut self.ident_cnt), DUMMY_SP);

                                self.exported_idents
                                    .push((new_ident.to_id(), "default".into()));

                                *default_expr.expr = attach_name_to_expr(
                                    new_ident,
                                    Expr::Call(call.clone()),
                                    &mut self.extra_items,
                                );
                            }
                            _ => {
                                disallowed_export_span = default_expr.span;
                            }
                        }
                    }
                    ModuleItem::ModuleDecl(ModuleDecl::ExportAll(ExportAll { span, .. })) => {
                        disallowed_export_span = *span;
                    }
                    _ => {}
                }

                if disallowed_export_span != DUMMY_SP {
                    HANDLER.with(|handler| {
                        handler
                            .struct_span_err(
                                disallowed_export_span,
                                "Only async functions are allowed to be exported in a \"use \
                                 server\" file.",
                            )
                            .emit();
                    });
                }
            }

            stmt.visit_mut_with(self);

            if self.config.is_server || !self.in_action_file {
                new.push(stmt);
                new.extend(self.annotations.drain(..).map(ModuleItem::Stmt));
                new.append(&mut self.extra_items);
            }
        }

        // If it's a "use server" file, all exports need to be annotated as actions.
        if self.in_action_file {
            for (id, export_name) in self.exported_idents.iter() {
                let ident = Ident::new(id.0.clone(), DUMMY_SP.with_ctxt(id.1));
                annotate_ident_as_action(
                    &mut self.annotations,
                    ident.clone(),
                    Vec::new(),
                    self.file_name.to_string(),
                    export_name.to_string(),
                    false,
                    None,
                );
                if !self.config.is_server {
                    let params_ident = private_ident!("args");
                    let noop_fn = Box::new(Function {
                        params: vec![Param {
                            span: DUMMY_SP,
                            decorators: Default::default(),
                            pat: Pat::Rest(RestPat {
                                span: DUMMY_SP,
                                dot3_token: DUMMY_SP,
                                arg: Box::new(Pat::Ident(params_ident.clone().into())),
                                type_ann: None,
                            }),
                        }],
                        decorators: Vec::new(),
                        span: DUMMY_SP,
                        body: Some(BlockStmt {
                            span: DUMMY_SP,
                            stmts: vec![Stmt::Return(ReturnStmt {
                                span: DUMMY_SP,
                                arg: Some(Box::new(Expr::Call(CallExpr {
                                    span: DUMMY_SP,
                                    callee: Callee::Expr(Box::new(Expr::Ident(private_ident!(
                                        "__build_action__"
                                    )))),
                                    args: vec![ident.clone().as_arg(), params_ident.as_arg()],
                                    type_args: None,
                                }))),
                            })],
                        }),
                        is_generator: false,
                        is_async: true,
                        type_params: None,
                        return_type: None,
                    });

                    if export_name == "default" {
                        let export_expr = ModuleItem::ModuleDecl(ModuleDecl::ExportDefaultExpr(
                            ExportDefaultExpr {
                                span: DUMMY_SP,
                                expr: Box::new(Expr::Fn(FnExpr {
                                    ident: Some(ident),
                                    function: noop_fn,
                                })),
                            },
                        ));
                        new.push(export_expr);
                    } else {
                        let export_expr =
                            ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl {
                                span: DUMMY_SP,
                                decl: Decl::Fn(FnDecl {
                                    ident,
                                    declare: false,
                                    function: noop_fn,
                                }),
                            }));
                        new.push(export_expr);
                    }
                }
            }
            new.append(&mut self.extra_items);

            // Ensure that the exports are valid by appending a check
            // import { ensureServerEntryExports } from 'private-next-rsc-action-proxy'
            // ensureServerEntryExports([action1, action2, ...])
            let ensure_ident = private_ident!("ensureServerEntryExports");
            new.push(ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                span: DUMMY_SP,
                specifiers: vec![ImportSpecifier::Default(ImportDefaultSpecifier {
                    span: DUMMY_SP,
                    local: ensure_ident.clone(),
                })],
                src: Box::new(Str {
                    span: DUMMY_SP,
                    value: "private-next-rsc-action-proxy".into(),
                    raw: None,
                }),
                type_only: false,
                asserts: None,
            })));
            new.push(ModuleItem::Stmt(Stmt::Expr(ExprStmt {
                span: DUMMY_SP,
                expr: Box::new(Expr::Call(CallExpr {
                    span: DUMMY_SP,
                    callee: Callee::Expr(Box::new(Expr::Ident(ensure_ident))),
                    args: vec![ExprOrSpread {
                        spread: None,
                        expr: Box::new(Expr::Array(ArrayLit {
                            span: DUMMY_SP,
                            elems: self
                                .exported_idents
                                .iter()
                                .map(|e| {
                                    Some(ExprOrSpread {
                                        spread: None,
                                        expr: Box::new(Expr::Ident(Ident::new(
                                            e.0 .0.clone(),
                                            DUMMY_SP.with_ctxt(e.0 .1),
                                        ))),
                                    })
                                })
                                .collect(),
                        })),
                    }],
                    type_args: None,
                })),
            })));

            // Append annotations to the end of the file.
            new.extend(self.annotations.drain(..).map(ModuleItem::Stmt));
        }

        *stmts = new;

        self.annotations = old_annotations;

        if self.has_action {
            // Prepend a special comment to the top of the file.
            self.comments.add_leading(
                self.start_pos,
                Comment {
                    span: DUMMY_SP,
                    kind: CommentKind::Block,
                    // Append a list of exported actions.
                    text: format!(
                        " __next_internal_action_entry_do_not_use__ {} ",
                        if self.in_action_file {
                            self.exported_idents
                                .iter()
                                .map(|e| e.1.to_string())
                                .collect::<Vec<_>>()
                                .join(",")
                        } else {
                            self.export_actions.join(",")
                        }
                    )
                    .into(),
                },
            );
        }
    }

    fn visit_mut_stmts(&mut self, stmts: &mut Vec<Stmt>) {
        let old_top_level = self.top_level;
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
        self.top_level = old_top_level;
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

fn gen_ident(cnt: &mut u32) -> JsWord {
    let id: JsWord = format!("$$ACTION_{}", cnt).into();
    *cnt += 1;
    id
}

fn attach_name_to_expr(ident: Ident, expr: Expr, extra_items: &mut Vec<ModuleItem>) -> Expr {
    // Create the variable `var $$ACTION_0;`
    extra_items.push(ModuleItem::Stmt(Stmt::Decl(Decl::Var(Box::new(VarDecl {
        span: DUMMY_SP,
        kind: VarDeclKind::Var,
        declare: Default::default(),
        decls: vec![VarDeclarator {
            span: DUMMY_SP,
            name: ident.clone().into(),
            init: None,
            definite: Default::default(),
        }],
    })))));

    if let Expr::Paren(_paren) = &expr {
        expr
    } else {
        // Create the assignment `($$ACTION_0 = arrow)`
        Expr::Paren(ParenExpr {
            span: DUMMY_SP,
            expr: Box::new(Expr::Assign(AssignExpr {
                span: DUMMY_SP,
                left: PatOrExpr::Pat(Box::new(Pat::Ident(ident.into()))),
                op: op!("="),
                right: Box::new(expr),
            })),
        })
    }
}

fn annotate_ident_as_action(
    annotations: &mut Vec<Stmt>,
    ident: Ident,
    bound: Vec<Option<ExprOrSpread>>,
    file_name: String,
    export_name: String,
    has_bound: bool,
    re_annotate_action: Option<Ident>,
) {
    // myAction.$$typeof = Symbol.for('react.server.reference');
    annotations.push(annotate(
        &ident,
        "$$typeof",
        CallExpr {
            span: DUMMY_SP,
            callee: quote_ident!("Symbol")
                .make_member(quote_ident!("for"))
                .as_callee(),
            args: vec!["react.server.reference".as_arg()],
            type_args: Default::default(),
        }
        .into(),
    ));

    // Attach a checksum to the action using sha1:
    // myAction.$$id = sha1('file_name' + ':' + 'export_name');
    let mut hasher = Sha1::new();
    hasher.update(file_name.as_bytes());
    hasher.update(b":");
    hasher.update(export_name.as_bytes());
    let result = hasher.finalize();

    // Convert result to hex string
    annotations.push(annotate(&ident, "$$id", hex_encode(result).into()));

    // myAction.$$bound = [];
    annotations.push(annotate(
        &ident,
        "$$bound",
        if let Some(re_annotate_ident) = re_annotate_action {
            Box::new(Expr::Member(MemberExpr {
                span: DUMMY_SP,
                obj: Box::new(Expr::Ident(re_annotate_ident)),
                prop: MemberProp::Ident(Ident {
                    sym: "$$bound".into(),
                    span: DUMMY_SP,
                    optional: false,
                }),
            }))
        } else {
            ArrayLit {
                span: DUMMY_SP,
                elems: bound,
            }
            .into()
        },
    ));

    // If an action doesn't have any bound values, we add a special property
    // to mark that all parameters are just passed through.
    if !has_bound {
        annotations.push(annotate(&ident, "$$with_bound", Lit::from(false).into()));
    }
}

const DIRECTIVE_TYPOS: &[&str] = &[
    "use servers",
    "use-server",
    "use sevrer",
    "use srever",
    "use servre",
    "user server",
];

fn remove_server_directive_index_in_module(
    stmts: &mut Vec<ModuleItem>,
    in_action_file: &mut bool,
    has_action: &mut bool,
) {
    let mut is_directive = true;

    stmts.retain(|stmt| {
        match stmt {
            ModuleItem::Stmt(Stmt::Expr(ExprStmt {
                expr: box Expr::Lit(Lit::Str(Str { value, span, .. })),
                ..
            })) => {
                if value == "use server" {
                    if is_directive {
                        *in_action_file = true;
                        *has_action = true;
                        return false;
                    } else {
                        HANDLER.with(|handler| {
                            handler
                                .struct_span_err(
                                    *span,
                                    "The \"use server\" directive must be at the top of the file.",
                                )
                                .emit();
                        });
                    }
                } else {
                    // Detect typo of "use server"
                    if DIRECTIVE_TYPOS.iter().any(|&s| s == value) {
                        HANDLER.with(|handler| {
                            handler
                                .struct_span_err(
                                    *span,
                                    format!(
                                        "Did you mean \"use server\"? \"{}\" is not a supported \
                                         directive name.",
                                        value
                                    )
                                    .as_str(),
                                )
                                .emit();
                        });
                    }
                }
            }
            ModuleItem::Stmt(Stmt::Expr(ExprStmt {
                expr:
                    box Expr::Paren(ParenExpr {
                        expr: box Expr::Lit(Lit::Str(Str { value, .. })),
                        ..
                    }),
                span,
                ..
            })) => {
                // Match `("use server")`.
                if value == "use server" || DIRECTIVE_TYPOS.iter().any(|&s| s == value) {
                    if is_directive {
                        HANDLER.with(|handler| {
                            handler
                                .struct_span_err(
                                    *span,
                                    "The \"use server\" directive cannot be wrapped in \
                                     parentheses.",
                                )
                                .emit();
                        })
                    } else {
                        HANDLER.with(|handler| {
                            handler
                                .struct_span_err(
                                    *span,
                                    "The \"use server\" directive must be at the top of the file, \
                                     and cannot be wrapped in parentheses.",
                                )
                                .emit();
                        })
                    }
                }
            }
            _ => {
                is_directive = false;
            }
        }
        true
    });
}

fn remove_server_directive_index_in_fn(
    stmts: &mut Vec<Stmt>,
    remove_directive: bool,
    is_action_fn: &mut bool,
) {
    let mut is_directive = true;

    stmts.retain(|stmt| {
        if let Stmt::Expr(ExprStmt {
            expr: box Expr::Lit(Lit::Str(Str { value, span, .. })),
            ..
        }) = stmt
        {
            if value == "use server" {
                if is_directive {
                    *is_action_fn = true;
                    if remove_directive {
                        return false;
                    }
                } else {
                    HANDLER.with(|handler| {
                        handler
                            .struct_span_err(
                                *span,
                                "The \"use server\" directive must be at the top of the function \
                                 body.",
                            )
                            .emit();
                    });
                }
            } else {
                // Detect typo of "use server"
                if DIRECTIVE_TYPOS.iter().any(|&s| s == value) {
                    HANDLER.with(|handler| {
                        handler
                            .struct_span_err(
                                *span,
                                format!(
                                    "Did you mean \"use server\"? \"{}\" is not a supported \
                                     directive name.",
                                    value
                                )
                                .as_str(),
                            )
                            .emit();
                    });
                }
            }
        } else {
            is_directive = false;
        }
        true
    });
}

fn collect_idents_in_array_pat(elems: &[Option<Pat>]) -> Vec<Id> {
    let mut ids = Vec::new();

    for elem in elems.iter().flatten() {
        match elem {
            Pat::Ident(ident) => {
                ids.push(ident.id.to_id());
            }
            Pat::Array(array) => {
                ids.extend(collect_idents_in_array_pat(&array.elems));
            }
            Pat::Object(object) => {
                ids.extend(collect_idents_in_object_pat(&object.props));
            }
            Pat::Rest(rest) => {
                if let Pat::Ident(ident) = &*rest.arg {
                    ids.push(ident.id.to_id());
                }
            }
            _ => {}
        }
    }

    ids
}

fn collect_idents_in_object_pat(props: &[ObjectPatProp]) -> Vec<Id> {
    let mut ids = Vec::new();

    for prop in props {
        match prop {
            ObjectPatProp::KeyValue(KeyValuePatProp { key, value }) => {
                if let PropName::Ident(ident) = key {
                    ids.push(ident.to_id());
                }

                match &**value {
                    Pat::Ident(ident) => {
                        ids.push(ident.id.to_id());
                    }
                    Pat::Array(array) => {
                        ids.extend(collect_idents_in_array_pat(&array.elems));
                    }
                    Pat::Object(object) => {
                        ids.extend(collect_idents_in_object_pat(&object.props));
                    }
                    _ => {}
                }
            }
            ObjectPatProp::Assign(AssignPatProp { key, .. }) => {
                ids.push(key.to_id());
            }
            ObjectPatProp::Rest(RestPat { arg, .. }) => {
                if let Pat::Ident(ident) = &**arg {
                    ids.push(ident.id.to_id());
                }
            }
        }
    }

    ids
}

fn collect_idents_in_var_decls(decls: &[VarDeclarator]) -> Vec<Id> {
    let mut ids = Vec::new();

    for decl in decls {
        match &decl.name {
            Pat::Ident(ident) => {
                ids.push(ident.id.to_id());
            }
            Pat::Array(array) => {
                ids.extend(collect_idents_in_array_pat(&array.elems));
            }
            Pat::Object(object) => {
                ids.extend(collect_idents_in_object_pat(&object.props));
            }
            _ => {}
        }
    }

    ids
}

fn collect_idents_in_stmt(stmt: &Stmt) -> Vec<Id> {
    let mut ids = Vec::new();

    if let Stmt::Decl(Decl::Var(var)) = &stmt {
        ids.extend(collect_idents_in_var_decls(&var.decls));
    }

    ids
}

pub(crate) struct ClosureReplacer<'a> {
    closure_arg: &'a Ident,
    used_ids: &'a [Name],
}

impl ClosureReplacer<'_> {
    fn index_of_id(&self, i: &Ident) -> Option<usize> {
        let name = Name(i.to_id(), vec![]);
        self.used_ids.iter().position(|used_id| *used_id == name)
    }

    fn index(&self, e: &Expr) -> Option<usize> {
        let name = Name::try_from(e).ok()?;
        self.used_ids.iter().position(|used_id| *used_id == name)
    }
}

impl VisitMut for ClosureReplacer<'_> {
    fn visit_mut_expr(&mut self, e: &mut Expr) {
        e.visit_mut_children_with(self);

        if let Some(index) = self.index(e) {
            *e = Expr::Member(MemberExpr {
                span: DUMMY_SP,
                obj: self.closure_arg.clone().into(),
                prop: MemberProp::Computed(ComputedPropName {
                    span: DUMMY_SP,
                    expr: index.into(),
                }),
            });
        }
    }

    fn visit_mut_prop(&mut self, p: &mut Prop) {
        p.visit_mut_children_with(self);

        if let Prop::Shorthand(i) = p {
            if let Some(index) = self.index_of_id(i) {
                *p = Prop::KeyValue(KeyValueProp {
                    key: PropName::Ident(i.clone()),
                    value: MemberExpr {
                        span: DUMMY_SP,
                        obj: self.closure_arg.clone().into(),
                        prop: MemberProp::Computed(ComputedPropName {
                            span: DUMMY_SP,
                            expr: index.into(),
                        }),
                    }
                    .into(),
                });
            }
        }
    }

    noop_visit_mut_type!();
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Name(Id, Vec<(JsWord, bool)>);

impl TryFrom<&'_ Expr> for Name {
    type Error = ();

    fn try_from(value: &Expr) -> Result<Self, Self::Error> {
        match value {
            Expr::Ident(i) => Ok(Name(i.to_id(), vec![])),
            Expr::Member(e) => e.try_into(),
            Expr::OptChain(e) => e.try_into(),
            _ => Err(()),
        }
    }
}

impl TryFrom<&'_ MemberExpr> for Name {
    type Error = ();

    fn try_from(value: &MemberExpr) -> Result<Self, Self::Error> {
        match &value.prop {
            MemberProp::Ident(prop) => {
                let mut obj: Name = value.obj.as_ref().try_into()?;
                obj.1.push((prop.sym.clone(), true));
                Ok(obj)
            }
            _ => Err(()),
        }
    }
}

impl TryFrom<&'_ OptChainExpr> for Name {
    type Error = ();

    fn try_from(value: &OptChainExpr) -> Result<Self, Self::Error> {
        match &*value.base {
            OptChainBase::Member(value) => match &value.prop {
                MemberProp::Ident(prop) => {
                    let mut obj: Name = value.obj.as_ref().try_into()?;
                    obj.1.push((prop.sym.clone(), false));
                    Ok(obj)
                }
                _ => Err(()),
            },
            OptChainBase::Call(_) => Err(()),
        }
    }
}

impl From<Name> for Expr {
    fn from(value: Name) -> Self {
        let mut expr = Expr::Ident(value.0.into());

        for (prop, is_member) in value.1.into_iter() {
            if is_member {
                expr = Expr::Member(MemberExpr {
                    span: DUMMY_SP,
                    obj: expr.into(),
                    prop: MemberProp::Ident(Ident::new(prop, DUMMY_SP)),
                });
            } else {
                expr = Expr::OptChain(OptChainExpr {
                    span: DUMMY_SP,
                    question_dot_token: DUMMY_SP,
                    base: Box::new(OptChainBase::Member(MemberExpr {
                        span: DUMMY_SP,
                        obj: expr.into(),
                        prop: MemberProp::Ident(Ident::new(prop, DUMMY_SP)),
                    })),
                });
            }
        }

        expr
    }
}
