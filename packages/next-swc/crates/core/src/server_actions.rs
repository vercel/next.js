use std::convert::{TryFrom, TryInto};

use next_binding::swc::core::{
    common::{
        comments::{Comment, CommentKind, Comments},
        errors::HANDLER,
        util::take::Take,
        BytePos, FileName, DUMMY_SP,
    },
    ecma::{
        ast::{
            op, ArrayLit, AssignExpr, AssignPatProp, BlockStmt, CallExpr, ComputedPropName, Decl,
            DefaultDecl, ExportDecl, ExportDefaultDecl, Expr, ExprStmt, FnDecl, Function, Id,
            Ident, KeyValuePatProp, KeyValueProp, Lit, MemberExpr, MemberProp, Module, ModuleDecl,
            ModuleItem, ObjectPatProp, OptChainBase, OptChainExpr, Param, Pat, PatOrExpr, Prop,
            PropName, RestPat, ReturnStmt, Stmt, Str, VarDecl, VarDeclKind, VarDeclarator,
        },
        atoms::JsWord,
        utils::{private_ident, quote_ident, ExprFactory},
        visit::{as_folder, noop_visit_mut_type, Fold, VisitMut, VisitMutWith},
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

        in_module: true,
        in_action_fn: false,
        should_add_name: false,
        closure_idents: Default::default(),
        action_idents: Default::default(),

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

    in_module: bool,
    in_action_fn: bool,
    should_add_name: bool,
    closure_idents: Vec<Id>,
    action_idents: Vec<Name>,

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
        let mut in_action_fn = false;

        if self.in_action_file && self.in_export_decl {
            // All export functions in a server file are actions
            in_action_fn = true;
        } else {
            // Check if the function has `"use server"`
            if let Some(body) = &mut f.function.body {
                let directive_index = get_server_directive_index_in_fn(&body.stmts);
                if directive_index >= 0 {
                    in_action_fn = true;
                    body.stmts.remove(directive_index.try_into().unwrap());
                }
            }
        }

        {
            // Visit children
            let old_in_action_fn = self.in_action_fn;
            let old_in_module = self.in_module;
            let old_should_add_name = self.should_add_name;
            self.in_action_fn = in_action_fn;
            self.in_module = false;
            self.should_add_name = true;
            f.visit_mut_children_with(self);
            self.in_action_fn = old_in_action_fn;
            self.in_module = old_in_module;
            self.should_add_name = old_should_add_name;
        }

        if !in_action_fn {
            return;
        }

        if !f.function.is_async {
            HANDLER.with(|handler| {
                handler
                    .struct_span_err(f.ident.span, "Server actions must be async functions")
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

        // myAction.$$typeof = Symbol.for('react.server.reference');
        self.annotations.push(annotate(
            &f.ident,
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
            // myAction.$$bound = [];
            self.annotations.push(annotate(
                &f.ident,
                "$$bound",
                ArrayLit {
                    span: DUMMY_SP,
                    elems: Vec::new(),
                }
                .into(),
            ));

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

            let mut ids_from_closure = self.action_idents.clone();
            ids_from_closure.retain(|id| self.closure_idents.contains(&id.0));

            let closure_arg = private_ident!("closure");

            f.function.body.visit_mut_with(&mut ClosureReplacer {
                closure_arg: &closure_arg,
                used_ids: &ids_from_closure,
            });

            // myAction.$$bound = [id1, id2]
            self.annotations.push(annotate(
                &f.ident,
                "$$bound",
                ArrayLit {
                    span: DUMMY_SP,
                    elems: ids_from_closure
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
                    .make_member(quote_ident!("$$bound"))
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
        if self.in_action_fn && self.should_add_name {
            if let Ok(name) = Name::try_from(&*n) {
                self.should_add_name = false;
                self.action_idents.push(name);
                n.visit_mut_children_with(self);
                self.should_add_name = true;
                return;
            }
        }

        n.visit_mut_children_with(self);
    }

    fn visit_mut_module_items(&mut self, stmts: &mut Vec<ModuleItem>) {
        let directive_index = get_server_directive_index_in_module(stmts);
        if directive_index >= 0 {
            self.in_action_file = true;
            self.has_action = true;
            stmts.remove(directive_index.try_into().unwrap());
        }

        let old_annotations = self.annotations.take();

        let mut new = Vec::with_capacity(stmts.len());
        for mut stmt in stmts.take() {
            self.top_level = true;

            // For action file, it's not allowed to export things other than async
            // functions.
            if self.in_action_file {
                let mut disallowed_export_span = DUMMY_SP;
                match &mut stmt {
                    ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl { decl, span })) => {
                        match decl {
                            Decl::Fn(_f) => {}
                            _ => {
                                disallowed_export_span = *span;
                            }
                        }
                    }
                    ModuleItem::ModuleDecl(ModuleDecl::ExportDefaultDecl(ExportDefaultDecl {
                        decl,
                        span,
                        ..
                    })) => match decl {
                        DefaultDecl::Fn(_f) => {}
                        _ => {
                            disallowed_export_span = *span;
                        }
                    },
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

fn get_server_directive_index_in_module(stmts: &[ModuleItem]) -> i32 {
    for (i, stmt) in stmts.iter().enumerate() {
        if let ModuleItem::Stmt(Stmt::Expr(first)) = stmt {
            match &*first.expr {
                Expr::Lit(Lit::Str(Str { value, .. })) => {
                    if value == "use server" {
                        return i as i32;
                    }
                }
                _ => return -1,
            }
        } else {
            return -1;
        }
    }
    -1
}

fn get_server_directive_index_in_fn(stmts: &[Stmt]) -> i32 {
    for (i, stmt) in stmts.iter().enumerate() {
        if let Stmt::Expr(first) = stmt {
            match &*first.expr {
                Expr::Lit(Lit::Str(Str { value, .. })) => {
                    if value == "use server" {
                        return i as i32;
                    }
                }
                _ => return -1,
            }
        } else {
            return -1;
        }
    }
    -1
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
        match &value.base {
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
                    base: OptChainBase::Member(MemberExpr {
                        span: DUMMY_SP,
                        obj: expr.into(),
                        prop: MemberProp::Ident(Ident::new(prop, DUMMY_SP)),
                    }),
                });
            }
        }

        expr
    }
}
