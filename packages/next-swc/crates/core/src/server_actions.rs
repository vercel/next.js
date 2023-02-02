use next_binding::swc::core::{
    common::{
        comments::{Comment, CommentKind, Comments},
        errors::HANDLER,
        util::take::Take,
        BytePos, FileName, DUMMY_SP,
    },
    ecma::{
        ast::{
            op, ArrayLit, AssignExpr, BlockStmt, CallExpr, ComputedPropName, Decl, ExportDecl,
            Expr, ExprStmt, FnDecl, Function, Id, Ident, KeyValueProp, Lit, MemberExpr, MemberProp,
            Module, ModuleDecl, ModuleItem, PatOrExpr, Prop, PropName, ReturnStmt, Stmt, Str,
            VarDecl, VarDeclKind, VarDeclarator,
        },
        atoms::JsWord,
        utils::{find_pat_ids, private_ident, quote_ident, ExprFactory},
        visit::{
            as_folder, noop_visit_mut_type, noop_visit_type, visit_obj_and_computed, Fold, Visit,
            VisitMut, VisitMutWith, VisitWith,
        },
    },
};
use serde::Deserialize;

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
        has_action: false,
        top_level: false,
        closure_candidates: Default::default(),
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
    has_action: bool,
    top_level: bool,

    closure_candidates: Vec<Id>,

    annotations: Vec<Stmt>,
    extra_items: Vec<ModuleItem>,
    export_actions: Vec<String>,
}

impl<C: Comments> VisitMut for ServerActions<C> {
    fn visit_mut_export_decl(&mut self, decl: &mut ExportDecl) {
        let old = self.in_export_decl;
        self.in_export_decl = true;
        decl.decl.visit_mut_with(self);
        self.in_export_decl = old;
    }

    fn visit_mut_fn_decl(&mut self, f: &mut FnDecl) {
        {
            let old_len = self.closure_candidates.len();
            self.closure_candidates
                .extend(find_pat_ids(&f.function.params));

            f.visit_mut_children_with(self);

            self.closure_candidates.truncate(old_len);
        }

        if !(self.in_action_file && self.in_export_decl) {
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
        }

        if !f.function.is_async {
            HANDLER.with(|handler| {
                handler
                    .struct_span_err(f.ident.span, "Server actions must be async")
                    .emit();
            });
        }

        let action_name: JsWord = if self.in_action_file && self.in_export_decl {
            f.ident.sym.clone()
        } else {
            format!("$ACTION_{}", f.ident.sym).into()
        };
        let action_ident = private_ident!(action_name.clone());

        self.has_action = true;
        self.export_actions.push(action_name.to_string());

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
            .push(annotate(&f.ident, "$$name", action_name.into()));

        if self.top_level {
            if !(self.in_action_file && self.in_export_decl) {
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
                                init: Some(f.ident.clone().into()),
                                definite: Default::default(),
                            }],
                        })),
                    })));
            }
        } else {
            // Hoist the function to the top level.

            let mut used_ids = idents_used_by(&f.function.body);

            used_ids.retain(|id| self.closure_candidates.contains(id));

            let closure_arg = private_ident!("closure");

            f.function.body.visit_mut_with(&mut ClosureReplacer {
                closure_arg: &closure_arg,
                used_ids: &used_ids,
            });

            // myAction.$$closure = [id1, id2]
            self.annotations.push(annotate(
                &f.ident,
                "$$closure",
                ArrayLit {
                    span: DUMMY_SP,
                    elems: used_ids
                        .iter()
                        .cloned()
                        .map(|id| Some(id.as_arg()))
                        .collect(),
                }
                .into(),
            ));

            let call = CallExpr {
                span: DUMMY_SP,
                callee: action_ident.clone().as_callee(),
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
                        ident: action_ident,
                        function: Box::new(Function {
                            params: vec![closure_arg.into()],
                            ..*f.function.take()
                        }),
                        declare: Default::default(),
                    }
                    .into(),
                })));

            f.function = new_fn;
        }
    }

    fn visit_mut_module(&mut self, m: &mut Module) {
        self.start_pos = m.span.lo;
        m.visit_mut_children_with(self);
    }

    fn visit_mut_module_items(&mut self, stmts: &mut Vec<ModuleItem>) {
        if let Some(ModuleItem::Stmt(Stmt::Expr(first))) = stmts.first() {
            match &*first.expr {
                Expr::Lit(Lit::Str(Str { value, .. })) if value == "use action" => {
                    self.in_action_file = true;
                    self.has_action = true;
                }
                _ => {}
            }
        }

        if self.in_action_file {
            stmts.remove(0);
        }

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
                        self.export_actions.join(",")
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

fn idents_used_by<N>(n: &N) -> Vec<Id>
where
    N: VisitWith<IdentUsageCollector>,
{
    let mut v = IdentUsageCollector {
        ..Default::default()
    };
    n.visit_with(&mut v);
    v.ids
}

#[derive(Default)]
pub(crate) struct IdentUsageCollector {
    ids: Vec<Id>,
}

impl Visit for IdentUsageCollector {
    noop_visit_type!();

    visit_obj_and_computed!();

    fn visit_ident(&mut self, n: &Ident) {
        if self.ids.contains(&n.to_id()) {
            return;
        }
        self.ids.push(n.to_id());
    }

    fn visit_member_prop(&mut self, n: &MemberProp) {
        if let MemberProp::Computed(..) = n {
            n.visit_children_with(self);
        }
    }

    fn visit_prop_name(&mut self, n: &PropName) {
        if let PropName::Computed(..) = n {
            n.visit_children_with(self);
        }
    }
}

pub(crate) struct ClosureReplacer<'a> {
    closure_arg: &'a Ident,
    used_ids: &'a [Id],
}

impl ClosureReplacer<'_> {
    fn index(&self, i: &Ident) -> Option<usize> {
        self.used_ids
            .iter()
            .position(|used_id| i.sym == used_id.0 && i.span.ctxt == used_id.1)
    }
}

impl VisitMut for ClosureReplacer<'_> {
    fn visit_mut_expr(&mut self, e: &mut Expr) {
        e.visit_mut_children_with(self);

        if let Expr::Ident(i) = e {
            if let Some(index) = self.index(i) {
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
    }

    fn visit_mut_prop(&mut self, p: &mut Prop) {
        p.visit_mut_children_with(self);

        if let Prop::Shorthand(i) = p {
            if let Some(index) = self.index(i) {
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
