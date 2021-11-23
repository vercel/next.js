//! Minimalizer for AST.
//!
//! This code lives at `napi` crate because it depends on `rayon` and it's not
//! used by wasm.

use rayon::prelude::*;
use std::sync::Arc;
use swc_atoms::js_word;
use swc_common::{collections::AHashSet, util::take::Take, Mark, SyntaxContext, DUMMY_SP};
use swc_ecmascript::{
    ast::*,
    utils::{ident::IdentLike, Id, StmtLike, StmtOrModuleItem},
    visit::{VisitMut, VisitMutWith},
};

/// # Usage
///
/// This transform should be applied after applying resolver.
///
///
/// # Preserved nodes
///
///  - import
///  - export
///  - all imported identifiers
///  - `process.env.NODE_ENV`
///  - `require`
///  - `module`
///  - `__webpack_*`
///  - `import.meta`
///  - `import()`
///  - `define()`
///  - `require.ensure`
///
///
///
/// # Example
///
/// ## Input
///
///```js
/// import { a } from "x";
/// import b from "y";
///
/// function d() {
///   a.x.y(), console.log(b);
///   require("z");
///   module.hot.accept("x", x => { ... })
/// }
/// ```
///
/// ## Output
///
/// ```js
/// import { a } from "x";
/// import b from "y";
///
///             
/// a.x.y();             b;
/// require("z")
/// module.hot.accept("x", () => {     })
/// ```
pub fn ast_minimalizer(top_level_mark: Mark) -> impl VisitMut {
    Minimalizer {
        top_level_ctxt: SyntaxContext::empty().apply_mark(top_level_mark),
        ..Default::default()
    }
}

#[derive(Default)]
struct ScopeData {
    imported_ids: AHashSet<Id>,
}

impl ScopeData {
    fn analyze(items: &[ModuleItem]) -> Self {
        let mut imported_ids = AHashSet::default();

        for item in items {
            match item {
                ModuleItem::ModuleDecl(ModuleDecl::Import(i)) => {
                    for s in &i.specifiers {
                        match s {
                            ImportSpecifier::Named(s) => {
                                imported_ids.insert(s.local.to_id());
                            }
                            ImportSpecifier::Default(s) => {
                                imported_ids.insert(s.local.to_id());
                            }
                            ImportSpecifier::Namespace(s) => {
                                imported_ids.insert(s.local.to_id());
                            }
                        }
                    }
                }

                _ => {}
            }
        }

        ScopeData { imported_ids }
    }

    fn should_preserve(&self, i: &Ident) -> bool {
        if self.imported_ids.contains(&i.to_id()) {
            return true;
        }

        match &*i.sym {
            "module" | "import" | "define" | "require" => {
                return true;
            }

            _ => {
                if i.sym.starts_with("__webpack_") {
                    return true;
                }
            }
        }

        false
    }
}

#[derive(Clone, Default)]
struct Minimalizer {
    data: Arc<ScopeData>,
    top_level_ctxt: SyntaxContext,

    var_decl_kind: Option<VarDeclKind>,

    /// `true` if we should preserve literals.
    preserve_literals: bool,

    can_remove_pat: bool,
}

impl Minimalizer {
    fn flatten_stmt<T>(&mut self, to: &mut Vec<T>, item: &mut T)
    where
        T: StmtOrModuleItem + StmtLike + Take,
    {
        let item = item.take();

        match item.try_into_stmt() {
            Ok(stmt) => match stmt {
                Stmt::Block(b) => {
                    to.extend(b.stmts.into_iter().map(T::from_stmt));
                }
                Stmt::Decl(Decl::Fn(fn_decl)) => {
                    let Function {
                        params,
                        decorators,
                        body,
                        ..
                    } = fn_decl.function;

                    if !decorators.is_empty() {
                        let mut s = Stmt::Expr(ExprStmt {
                            span: DUMMY_SP,
                            expr: Box::new(Expr::Seq(SeqExpr {
                                span: DUMMY_SP,
                                exprs: decorators.into_iter().map(|d| d.expr).collect(),
                            })),
                        });
                        s.visit_mut_with(self);
                        to.push(T::from_stmt(s));
                    }

                    if !params.is_empty() {
                        let mut exprs = Vec::with_capacity(params.len());

                        for p in params {
                            exprs.extend(p.decorators.into_iter().map(|d| d.expr));

                            preserve_pat(&mut exprs, p.pat);
                        }

                        let mut s = Stmt::Expr(ExprStmt {
                            span: DUMMY_SP,
                            expr: Box::new(Expr::Seq(SeqExpr {
                                span: DUMMY_SP,
                                exprs,
                            })),
                        });
                        s.visit_mut_with(self);
                        to.push(T::from_stmt(s));
                    }

                    if let Some(body) = body {
                        to.extend(body.stmts.into_iter().map(T::from_stmt));
                    }
                }
                _ => {
                    to.push(T::from_stmt(stmt));
                }
            },
            Err(item) => {
                to.push(item);
            }
        }
    }

    fn visit_mut_stmt_likes<T>(&mut self, stmts: &mut Vec<T>)
    where
        T: StmtOrModuleItem + StmtLike + VisitMutWith<Self> + Take,
        Vec<T>: VisitMutWith<Self>,
    {
        // Process in parallel, if required
        if stmts.len() >= 8 {
            stmts.par_iter_mut().for_each(|stmt| {
                stmt.visit_mut_with(&mut self.clone());
            });
        } else {
            stmts.visit_mut_children_with(&mut self.clone());
        }

        let mut new = Vec::with_capacity(stmts.len());
        for stmt in stmts.iter_mut() {
            self.flatten_stmt(&mut new, stmt);
        }

        // Remove empty statements
        new.retain(|stmt| match StmtOrModuleItem::as_stmt(stmt) {
            Ok(Stmt::Empty(..)) => return false,
            _ => true,
        });

        *stmts = new;
    }

    fn ignore_expr(&mut self, e: &mut Expr) {
        match e {
            Expr::Lit(..)
            | Expr::This(..)
            | Expr::Member(MemberExpr {
                obj: ExprOrSuper::Super(..),
                computed: false,
                ..
            })
            | Expr::Yield(YieldExpr { arg: None, .. }) => {
                e.take();
                return;
            }

            Expr::Ident(i) => {
                if !self.data.should_preserve(&*i) {
                    e.take();
                }
                return;
            }

            Expr::Member(MemberExpr {
                obj: ExprOrSuper::Expr(obj),
                prop,
                computed,
                ..
            }) => {
                self.ignore_expr(obj);
                if *computed {
                    self.ignore_expr(prop);
                }

                match (obj.is_invalid(), prop.is_invalid()) {
                    (true, true) => {
                        e.take();
                        return;
                    }
                    (true, false) => {
                        if *computed {
                            *e = *prop.take();
                        } else {
                            e.take();
                            return;
                        }
                    }
                    (false, true) => {
                        *e = *obj.take();
                    }
                    (false, false) => {}
                }
            }

            Expr::Array(a) => {
                if a.elems.is_empty() {
                    e.take();
                    return;
                }
            }

            Expr::Object(obj) => {
                if obj.props.is_empty() {
                    e.take();
                    return;
                }
            }

            Expr::Seq(seq) => {
                for e in &mut seq.exprs {
                    self.ignore_expr(e);
                }
                seq.exprs.retain(|e| !e.is_invalid());
                if seq.exprs.is_empty() {
                    e.take();
                    return;
                }
                if seq.exprs.len() == 1 {
                    *e = *seq.exprs.pop().unwrap();
                    return;
                }
            }

            _ => {}
        }
    }
}

impl VisitMut for Minimalizer {
    fn visit_mut_arrow_expr(&mut self, e: &mut ArrowExpr) {
        let old_can_remove_pat = self.can_remove_pat;
        self.can_remove_pat = true;
        e.params.visit_mut_with(self);
        self.can_remove_pat = old_can_remove_pat;

        e.body.visit_mut_with(self);

        e.type_params.visit_mut_with(self);

        e.return_type.visit_mut_with(self);
    }

    fn visit_mut_assign_pat_prop(&mut self, p: &mut AssignPatProp) {
        p.visit_mut_children_with(self);

        if let Some(v) = &mut p.value {
            self.ignore_expr(&mut **v);
            if v.is_invalid() {
                p.value = None;
            }
        }
    }

    /// Normalize expressions.
    ///
    ///  - empty [Expr::Seq] => [Expr::Invalid]
    fn visit_mut_expr(&mut self, e: &mut Expr) {
        e.visit_mut_children_with(self);

        match e {
            Expr::Seq(seq) => {
                if seq.exprs.len() == 1 {
                    *e = *seq.exprs.pop().unwrap();
                }
            }
            _ => {}
        }

        match e {
            Expr::Await(expr) => {
                *e = *expr.arg.take();
            }

            Expr::Yield(expr) => {
                if let Some(arg) = expr.arg.take() {
                    *e = *arg;
                }
            }

            Expr::Unary(expr) => {
                *e = *expr.arg.take();
            }

            Expr::Update(expr) => {
                *e = *expr.arg.take();
            }

            Expr::TsAs(expr) => {
                *e = *expr.expr.take();
            }

            Expr::TsConstAssertion(expr) => {
                *e = *expr.expr.take();
            }

            Expr::TsTypeAssertion(expr) => {
                *e = *expr.expr.take();
            }

            Expr::TsNonNull(expr) => {
                *e = *expr.expr.take();
            }

            Expr::TaggedTpl(expr) => {
                let mut exprs = Vec::with_capacity(expr.tpl.exprs.len() + 1);
                exprs.push(expr.tag.take());
                exprs.extend(expr.tpl.exprs.take());

                let mut seq = Expr::Seq(SeqExpr {
                    span: DUMMY_SP,
                    exprs,
                });

                seq.visit_mut_with(self);

                *e = seq;
            }

            Expr::Tpl(expr) => {
                let mut seq = Expr::Seq(SeqExpr {
                    span: DUMMY_SP,
                    exprs: expr.exprs.take(),
                });

                seq.visit_mut_with(self);

                *e = seq;
            }

            Expr::Assign(expr) => {
                let mut exprs = Vec::with_capacity(2);
                preserve_pat_or_expr(&mut exprs, expr.left.take());
                exprs.push(expr.right.take());
                let mut seq = Expr::Seq(SeqExpr {
                    span: DUMMY_SP,
                    exprs,
                });

                seq.visit_mut_with(self);

                *e = seq;
            }

            Expr::Seq(seq) => {
                if seq.exprs.is_empty() {
                    *e = Expr::Invalid(Invalid { span: DUMMY_SP });
                    return;
                }
            }

            Expr::Bin(expr) => {
                let mut exprs = Vec::with_capacity(2);

                exprs.push(expr.left.take());
                exprs.push(expr.right.take());

                let mut seq = Expr::Seq(SeqExpr {
                    span: DUMMY_SP,
                    exprs,
                });

                seq.visit_mut_with(self);

                *e = seq;
            }

            Expr::Cond(expr) => {
                let mut exprs = Vec::with_capacity(3);

                exprs.push(expr.test.take());
                exprs.push(expr.cons.take());
                exprs.push(expr.alt.take());

                let mut seq = Expr::Seq(SeqExpr {
                    span: DUMMY_SP,
                    exprs,
                });

                seq.visit_mut_with(self);

                *e = seq;
            }

            Expr::Array(arr) => {
                let mut seq = Expr::Seq(SeqExpr {
                    span: DUMMY_SP,
                    exprs: arr
                        .elems
                        .take()
                        .into_iter()
                        .flatten()
                        .map(|elem| elem.expr)
                        .collect(),
                });

                seq.visit_mut_with(self);

                *e = seq;
            }

            Expr::Call(CallExpr {
                callee: ExprOrSuper::Expr(callee),
                args,
                ..
            }) => {
                self.ignore_expr(callee);

                if callee.is_invalid() {
                    let mut seq = Expr::Seq(SeqExpr {
                        span: DUMMY_SP,
                        exprs: args.take().into_iter().map(|arg| arg.expr).collect(),
                    });

                    seq.visit_mut_with(self);

                    *e = seq;
                }
            }

            // TODO:
            // Expr::Object(_) => todo!(),
            // Expr::Fn(_) => todo!(),
            // Expr::Member(_) => todo!(),
            // Expr::New(_) => todo!(),
            // Expr::Arrow(_) => todo!(),
            // Expr::Class(_) => todo!(),
            // Expr::MetaProp(_) => todo!(),
            // Expr::JSXMember(_) => todo!(),
            // Expr::JSXNamespacedName(_) => todo!(),
            // Expr::JSXEmpty(_) => todo!(),
            // Expr::JSXElement(_) => todo!(),
            // Expr::JSXFragment(_) => todo!(),
            // Expr::OptChain(_) => todo!(),
            _ => {}
        }
    }

    fn visit_mut_expr_or_spread(&mut self, expr: &mut ExprOrSpread) {
        expr.spread = None;
        expr.expr.visit_mut_with(self);
    }

    fn visit_mut_expr_or_spreads(&mut self, elems: &mut Vec<ExprOrSpread>) {
        elems.visit_mut_children_with(self);

        elems.retain(|e| !e.expr.is_invalid());
    }

    fn visit_mut_expr_stmt(&mut self, s: &mut ExprStmt) {
        s.visit_mut_children_with(self);

        self.ignore_expr(&mut s.expr);
    }

    fn visit_mut_exprs(&mut self, exprs: &mut Vec<Box<Expr>>) {
        exprs.visit_mut_children_with(self);

        exprs.retain(|e| !e.is_invalid());
    }

    fn visit_mut_function(&mut self, f: &mut Function) {
        f.decorators.visit_mut_with(self);

        let old_can_remove_pat = self.can_remove_pat;
        self.can_remove_pat = true;
        f.params.visit_mut_with(self);
        self.can_remove_pat = old_can_remove_pat;

        f.body.visit_mut_with(self);

        f.type_params.visit_mut_with(self);

        f.return_type.visit_mut_with(self);
    }

    fn visit_mut_member_expr(&mut self, e: &mut MemberExpr) {
        e.obj.visit_mut_with(self);

        if e.computed {
            e.prop.visit_mut_with(self);
        }
    }

    fn visit_mut_module_items(&mut self, stmts: &mut Vec<ModuleItem>) {
        self.data = Arc::new(ScopeData::analyze(&stmts));

        self.visit_mut_stmt_likes(stmts);
    }

    fn visit_mut_object_pat_props(&mut self, props: &mut Vec<ObjectPatProp>) {
        props.visit_mut_children_with(self);

        props.retain(|prop| match prop {
            ObjectPatProp::Rest(p) => {
                if p.arg.is_invalid() {
                    return false;
                }

                true
            }
            ObjectPatProp::Assign(p) => {
                if self.can_remove_pat {
                    if p.value.is_none() {
                        return false;
                    }
                }

                true
            }

            ObjectPatProp::KeyValue(p) => {
                if p.value.is_invalid() {
                    return false;
                }

                true
            }
        });
    }

    fn visit_mut_opt_expr(&mut self, e: &mut Option<Box<Expr>>) {
        e.visit_mut_children_with(self);

        if let Some(Expr::Invalid(..)) = e.as_deref() {
            e.take();
        }
    }

    fn visit_mut_opt_expr_or_spread(&mut self, e: &mut Option<ExprOrSpread>) {
        e.visit_mut_children_with(self);

        if let Some(elem) = e {
            if elem.expr.is_invalid() {
                *e = None;
            }
        }
    }

    fn visit_mut_pat(&mut self, pat: &mut Pat) {
        // We don't need rest pattern.
        match pat {
            Pat::Rest(rest) => {
                *pat = *rest.arg.take();
            }
            _ => {}
        }

        pat.visit_mut_children_with(self);

        if !self.can_remove_pat {
            return;
        }

        match pat {
            Pat::Ident(p) => {
                if p.id.span.ctxt != self.top_level_ctxt {
                    pat.take();
                    return;
                }
            }

            Pat::Array(arr) => {
                if arr.elems.is_empty() {
                    pat.take();
                    return;
                }
            }

            Pat::Object(obj) => {
                if obj.props.is_empty() {
                    pat.take();
                    return;
                }
            }

            _ => {}
        }
    }

    fn visit_mut_pats(&mut self, pats: &mut Vec<Pat>) {
        pats.visit_mut_children_with(self);

        pats.retain(|pat| !pat.is_invalid());
    }

    fn visit_mut_prop(&mut self, p: &mut Prop) {
        p.visit_mut_children_with(self);

        match p {
            Prop::Shorthand(i) => {
                if !self.data.should_preserve(&*i) {
                    i.take();
                    return;
                }
            }
            _ => {}
        }
    }

    fn visit_mut_prop_or_spreads(&mut self, props: &mut Vec<PropOrSpread>) {
        props.visit_mut_children_with(self);

        props.retain(|p| match p {
            PropOrSpread::Spread(..) => true,
            PropOrSpread::Prop(p) => match &**p {
                Prop::Shorthand(p) => {
                    if p.sym == js_word!("") {
                        return false;
                    }

                    true
                }
                _ => true,
            },
        })
    }

    fn visit_mut_seq_expr(&mut self, e: &mut SeqExpr) {
        e.visit_mut_children_with(self);

        let cnt = e.exprs.len();

        for (idx, elem) in e.exprs.iter_mut().enumerate() {
            if idx == cnt - 1 {
                continue;
            }

            self.ignore_expr(&mut **elem);
        }

        e.exprs.retain(|e| !e.is_invalid());
    }

    /// Normalize statements.
    ///
    ///  - Invalid [Stmt::Expr] => [Stmt::Empty]
    ///  - Empty [Stmt::Block] => [Stmt::Empty]
    ///  - Single-item [Stmt::Block] => the item
    ///  - Invalid [Stmt::Decl] => [Stmt::Empty]
    ///  - Useless stmt => [Stmt::Empty]
    fn visit_mut_stmt(&mut self, stmt: &mut Stmt) {
        stmt.visit_mut_children_with(self);

        match stmt {
            Stmt::Return(s) => {
                if let Some(arg) = s.arg.take() {
                    *stmt = Stmt::Expr(ExprStmt {
                        span: DUMMY_SP,
                        expr: arg,
                    });
                } else {
                    *stmt = Stmt::Empty(EmptyStmt { span: DUMMY_SP });
                    return;
                }
            }
            Stmt::Throw(s) => {
                *stmt = Stmt::Expr(ExprStmt {
                    span: DUMMY_SP,
                    expr: s.arg.take(),
                });
            }

            Stmt::Debugger(_) | Stmt::Break(_) | Stmt::Continue(_) => {
                *stmt = Stmt::Empty(EmptyStmt { span: DUMMY_SP });
                return;
            }

            Stmt::Labeled(l) => {
                *stmt = *l.body.take();
            }

            _ => {}
        }

        match stmt {
            Stmt::Expr(e) => {
                if e.expr.is_invalid() {
                    *stmt = Stmt::Empty(EmptyStmt { span: DUMMY_SP });
                    return;
                }
            }

            Stmt::Block(block) => {
                if block.stmts.is_empty() {
                    *stmt = Stmt::Empty(EmptyStmt { span: DUMMY_SP });
                    return;
                }
                if block.stmts.len() == 1 {
                    *stmt = block.stmts.take().into_iter().next().unwrap();
                    return;
                }
            }

            Stmt::Decl(Decl::Var(var)) => {
                if var.decls.is_empty() {
                    *stmt = Stmt::Empty(EmptyStmt { span: DUMMY_SP });
                    return;
                }
            }

            // TODO: Flatten loops
            // TODO: Flatten try catch
            _ => {}
        }
    }

    fn visit_mut_stmts(&mut self, stmts: &mut Vec<Stmt>) {
        self.visit_mut_stmt_likes(stmts);
    }

    fn visit_mut_var_decl(&mut self, var: &mut VarDecl) {
        let old_var_decl_kind = self.var_decl_kind;
        self.var_decl_kind = Some(var.kind);
        var.visit_mut_children_with(self);
        self.var_decl_kind = old_var_decl_kind;
    }

    fn visit_mut_var_declarator(&mut self, v: &mut VarDeclarator) {
        v.visit_mut_children_with(self);

        if !matches!(self.var_decl_kind, Some(VarDeclKind::Const)) {
            if let Some(e) = &mut v.init {
                self.ignore_expr(&mut **e);

                if e.is_invalid() {
                    v.init = None;
                }
            }
        }
    }
}

fn preserve_pat_or_expr(exprs: &mut Vec<Box<Expr>>, p: PatOrExpr) {
    match p {
        PatOrExpr::Expr(e) => {
            exprs.push(e);
        }
        PatOrExpr::Pat(p) => preserve_pat(exprs, *p),
    }
}

fn preserve_pat(exprs: &mut Vec<Box<Expr>>, p: Pat) {
    match p {
        Pat::Ident(..) => {}
        Pat::Array(p) => {
            p.elems
                .into_iter()
                .flatten()
                .for_each(|elem| preserve_pat(exprs, elem));
        }
        Pat::Rest(p) => preserve_pat(exprs, *p.arg),
        Pat::Object(p) => p.props.into_iter().for_each(|p| {
            preserve_obj_pat(exprs, p);
        }),
        Pat::Assign(p) => {
            preserve_pat(exprs, *p.left);
            exprs.push(p.right)
        }
        Pat::Invalid(_) => {}
        Pat::Expr(e) => {
            exprs.push(e);
        }
    }
}

fn preserve_obj_pat(exprs: &mut Vec<Box<Expr>>, p: ObjectPatProp) {
    match p {
        ObjectPatProp::KeyValue(p) => {
            preserve_prop_name(exprs, p.key);
            preserve_pat(exprs, *p.value);
        }
        ObjectPatProp::Assign(p) => {
            exprs.extend(p.value);
        }
        ObjectPatProp::Rest(p) => preserve_pat(exprs, *p.arg),
    }
}

fn preserve_prop_name(exprs: &mut Vec<Box<Expr>>, p: PropName) {
    match p {
        PropName::Computed(e) => {
            exprs.push(e.expr);
        }
        _ => {}
    }
}
