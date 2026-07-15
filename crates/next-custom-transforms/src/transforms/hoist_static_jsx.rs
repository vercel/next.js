//! Caches the result of fully-static `jsx()`/`jsxs()` calls in lazily
//! initialized module-scope bindings.
//!
//! A call is fully static when every value it references is stable across
//! renders: literals, module-scope bindings that are never reassigned, member
//! chains rooted in such bindings (`styles.card`), and nested static jsx
//! calls. For such calls, every invocation produces an equivalent React
//! element, so the first result can be reused. Like React itself, this
//! assumes elements and props are immutable: components must not mutate the
//! props (or prop values) they receive.
//!
//! ```js
//! var _hoisted0;
//! function Page() {
//!     return _hoisted0 || (_hoisted0 = _jsx("div", { className: "hero" }));
//! }
//! ```
//!
//! Unlike `@babel/plugin-transform-react-constant-elements`, the jsx call is
//! not moved: only a cache variable is added at module scope, and the call
//! site is rewritten to lazily initialize it. This avoids both the module-init
//! cost of eager hoisting and the scope/TDZ hazards of relocating expressions.
//!
//! This transform must run after JSX is lowered to automatic-runtime calls.
//! It only matches production output: development builds lower JSX to
//! `jsxDEV()` from `react/jsx-dev-runtime`, which captures per-call-site
//! debug info and has a different call shape.

use rustc_hash::FxHashSet;
use swc_core::{
    common::{DUMMY_SP, Mark, SyntaxContext, util::take::Take},
    ecma::{
        ast::*,
        visit::{Visit, VisitMut, VisitMutWith, VisitWith, noop_visit_mut_type, noop_visit_type},
    },
};

use crate::transforms::import_analyzer::ImportMap;

const JSX_RUNTIME_MODULE: &str = "react/jsx-runtime";

pub fn hoist_static_jsx(unresolved_mark: Mark) -> HoistStaticJsx {
    HoistStaticJsx {
        unresolved_ctxt: SyntaxContext::empty().apply_mark(unresolved_mark),
        imports: Default::default(),
        module_constants: Default::default(),
        fn_depth: 0,
        hoisted: Default::default(),
    }
}

pub struct HoistStaticJsx {
    unresolved_ctxt: SyntaxContext,
    imports: ImportMap,
    /// Module-scope bindings that are never reassigned.
    module_constants: FxHashSet<Id>,
    fn_depth: u32,
    /// Cache variables to declare at module scope.
    hoisted: Vec<Ident>,
}

impl HoistStaticJsx {
    fn is_jsx_factory_callee(&self, callee: &Callee) -> bool {
        let Callee::Expr(e) = callee else {
            return false;
        };
        self.imports.is_import(e, JSX_RUNTIME_MODULE, "jsx")
            || self.imports.is_import(e, JSX_RUNTIME_MODULE, "jsxs")
    }

    /// Whether this is a `jsx(type, props, key?)` call whose result is
    /// equivalent on every invocation.
    fn is_hoistable_call(&self, call: &CallExpr) -> bool {
        if !self.is_jsx_factory_callee(&call.callee) {
            return false;
        }
        if call.args.len() < 2 || call.args.len() > 3 {
            return false;
        }
        if call.args.iter().any(|arg| arg.spread.is_some()) {
            return false;
        }
        if !self.is_static_expr(&call.args[0].expr) {
            return false;
        }
        let Expr::Object(props) = &*call.args[1].expr else {
            return false;
        };
        if !self.is_static_props(props) {
            return false;
        }
        if let Some(key) = call.args.get(2)
            && !self.is_static_expr(&key.expr)
        {
            return false;
        }
        true
    }

    /// The props object of a hoistable element. Stricter than a general
    /// static object: a `ref` prop opts out, since sharing one element between
    /// trees would share its ref.
    fn is_static_props(&self, obj: &ObjectLit) -> bool {
        obj.props.iter().all(|prop| {
            let PropOrSpread::Prop(prop) = prop else {
                return false;
            };
            match &**prop {
                Prop::KeyValue(kv) => {
                    let is_ref = match &kv.key {
                        PropName::Ident(ident) => ident.sym == "ref",
                        PropName::Str(str) => str.value == "ref",
                        _ => return false,
                    };
                    !is_ref && self.is_static_expr(&kv.value)
                }
                Prop::Shorthand(ident) => {
                    ident.sym != "ref" && self.module_constants.contains(&ident.to_id())
                }
                _ => false,
            }
        })
    }

    /// A member chain like `styles.card` or `Icons["check"].small`, rooted at
    /// a module constant, with statically known property names.
    fn is_static_member(&self, member: &MemberExpr) -> bool {
        match &member.prop {
            MemberProp::Ident(..) => {}
            MemberProp::Computed(computed) => {
                if !matches!(&*computed.expr, Expr::Lit(Lit::Str(..) | Lit::Num(..))) {
                    return false;
                }
            }
            MemberProp::PrivateName(..) => return false,
        }
        match &*member.obj {
            Expr::Ident(ident) => self.module_constants.contains(&ident.to_id()),
            Expr::Member(inner) => self.is_static_member(inner),
            _ => false,
        }
    }

    fn is_static_expr(&self, expr: &Expr) -> bool {
        match expr {
            Expr::Lit(
                Lit::Str(..) | Lit::Num(..) | Lit::Bool(..) | Lit::Null(..) | Lit::BigInt(..),
            ) => true,
            // Regexes are stateful (lastIndex); JSXText should not appear here.
            Expr::Lit(_) => false,
            Expr::Tpl(tpl) => tpl.exprs.is_empty(),
            Expr::Ident(ident) => {
                (ident.ctxt == self.unresolved_ctxt && ident.sym == "undefined")
                    || self.module_constants.contains(&ident.to_id())
            }
            Expr::Member(member) => self.is_static_member(member),
            Expr::Unary(unary) => {
                matches!(
                    unary.op,
                    UnaryOp::Minus | UnaryOp::Plus | UnaryOp::Bang | UnaryOp::Void
                ) && self.is_static_expr(&unary.arg)
            }
            Expr::Paren(paren) => self.is_static_expr(&paren.expr),
            Expr::Array(array) => array.elems.iter().all(|elem| match elem {
                None => true,
                Some(ExprOrSpread {
                    spread: Some(_), ..
                }) => false,
                Some(ExprOrSpread { expr, .. }) => self.is_static_expr(expr),
            }),
            Expr::Object(obj) => obj.props.iter().all(|prop| match prop {
                PropOrSpread::Prop(prop) => match &**prop {
                    Prop::KeyValue(kv) => {
                        matches!(kv.key, PropName::Ident(..) | PropName::Str(..))
                            && self.is_static_expr(&kv.value)
                    }
                    Prop::Shorthand(ident) => self.module_constants.contains(&ident.to_id()),
                    _ => false,
                },
                PropOrSpread::Spread(..) => false,
            }),
            // A nested static element.
            Expr::Call(call) => self.is_hoistable_call(call),
            _ => false,
        }
    }
}

impl VisitMut for HoistStaticJsx {
    noop_visit_mut_type!();

    fn visit_mut_module(&mut self, module: &mut Module) {
        self.imports = ImportMap::analyze(module);

        let mut bindings = collect_module_scope_bindings(module);
        let mut reassigned = ReassignmentCollector::default();
        module.visit_with(&mut reassigned);
        for id in &reassigned.reassigned {
            bindings.remove(id);
        }
        self.module_constants = bindings;

        module.visit_mut_children_with(self);

        if self.hoisted.is_empty() {
            return;
        }
        let decl = ModuleItem::Stmt(Stmt::Decl(Decl::Var(Box::new(VarDecl {
            span: DUMMY_SP,
            ctxt: SyntaxContext::empty(),
            kind: VarDeclKind::Var,
            declare: false,
            decls: self
                .hoisted
                .drain(..)
                .map(|ident| VarDeclarator {
                    span: DUMMY_SP,
                    name: ident.into(),
                    init: None,
                    definite: false,
                })
                .collect(),
        }))));
        // Insert after the last import for readability; `var` has no TDZ so
        // the position is not semantically significant.
        let pos = module
            .body
            .iter()
            .rposition(|item| matches!(item, ModuleItem::ModuleDecl(ModuleDecl::Import(..))))
            .map_or(0, |pos| pos + 1);
        module.body.insert(pos, decl);
    }

    fn visit_mut_function(&mut self, function: &mut Function) {
        self.fn_depth += 1;
        function.visit_mut_children_with(self);
        self.fn_depth -= 1;
    }

    fn visit_mut_arrow_expr(&mut self, arrow: &mut ArrowExpr) {
        self.fn_depth += 1;
        arrow.visit_mut_children_with(self);
        self.fn_depth -= 1;
    }

    fn visit_mut_expr(&mut self, expr: &mut Expr) {
        // Only cache calls inside functions; top-level calls already run once.
        if self.fn_depth > 0
            && let Expr::Call(call) = expr
            && self.is_hoistable_call(call)
        {
            let cache_ident = Ident::new(
                format!("_hoisted{}", self.hoisted.len()).into(),
                DUMMY_SP,
                SyntaxContext::empty().apply_mark(Mark::new()),
            );
            self.hoisted.push(cache_ident.clone());
            let call = expr.take();
            *expr = Expr::Bin(BinExpr {
                span: DUMMY_SP,
                op: BinaryOp::LogicalOr,
                left: Box::new(Expr::Ident(cache_ident.clone())),
                right: Box::new(Expr::Paren(ParenExpr {
                    span: DUMMY_SP,
                    expr: Box::new(Expr::Assign(AssignExpr {
                        span: DUMMY_SP,
                        op: AssignOp::Assign,
                        left: AssignTarget::Simple(SimpleAssignTarget::Ident(
                            cache_ident.clone().into(),
                        )),
                        right: Box::new(call),
                    })),
                })),
            });
            // Everything inside the cached call is static; nested calls are
            // covered by this cache entry.
            return;
        }
        expr.visit_mut_children_with(self);
    }
}

fn collect_module_scope_bindings(module: &Module) -> FxHashSet<Id> {
    let mut bindings = FxHashSet::default();
    for item in &module.body {
        match item {
            ModuleItem::ModuleDecl(decl) => match decl {
                ModuleDecl::Import(import) => {
                    for specifier in &import.specifiers {
                        let local = match specifier {
                            ImportSpecifier::Named(s) => &s.local,
                            ImportSpecifier::Default(s) => &s.local,
                            ImportSpecifier::Namespace(s) => &s.local,
                        };
                        bindings.insert(local.to_id());
                    }
                }
                ModuleDecl::ExportDecl(export) => {
                    collect_decl_bindings(&export.decl, &mut bindings);
                }
                ModuleDecl::ExportDefaultDecl(export) => match &export.decl {
                    DefaultDecl::Fn(f) => {
                        if let Some(ident) = &f.ident {
                            bindings.insert(ident.to_id());
                        }
                    }
                    DefaultDecl::Class(c) => {
                        if let Some(ident) = &c.ident {
                            bindings.insert(ident.to_id());
                        }
                    }
                    DefaultDecl::TsInterfaceDecl(..) => {}
                },
                _ => {}
            },
            ModuleItem::Stmt(Stmt::Decl(decl)) => collect_decl_bindings(decl, &mut bindings),
            _ => {}
        }
    }
    bindings
}

fn collect_decl_bindings(decl: &Decl, bindings: &mut FxHashSet<Id>) {
    match decl {
        Decl::Var(var) => {
            for declarator in &var.decls {
                collect_pat_bindings(&declarator.name, bindings);
            }
        }
        Decl::Fn(f) => {
            bindings.insert(f.ident.to_id());
        }
        Decl::Class(c) => {
            bindings.insert(c.ident.to_id());
        }
        _ => {}
    }
}

fn collect_pat_bindings(pat: &Pat, bindings: &mut FxHashSet<Id>) {
    match pat {
        Pat::Ident(ident) => {
            bindings.insert(ident.to_id());
        }
        Pat::Array(array) => {
            for elem in array.elems.iter().flatten() {
                collect_pat_bindings(elem, bindings);
            }
        }
        Pat::Object(obj) => {
            for prop in &obj.props {
                match prop {
                    ObjectPatProp::KeyValue(kv) => collect_pat_bindings(&kv.value, bindings),
                    ObjectPatProp::Assign(assign) => {
                        bindings.insert(assign.key.to_id());
                    }
                    ObjectPatProp::Rest(rest) => collect_pat_bindings(&rest.arg, bindings),
                }
            }
        }
        Pat::Assign(assign) => collect_pat_bindings(&assign.left, bindings),
        Pat::Rest(rest) => collect_pat_bindings(&rest.arg, bindings),
        Pat::Expr(..) | Pat::Invalid(..) => {}
    }
}

/// Collects bindings that are written to anywhere in the module. Member
/// expression writes (`obj.prop = x`) are not counted: like Babel's
/// constant-elements transform, constness is tracked at the binding level.
#[derive(Default)]
struct ReassignmentCollector {
    reassigned: FxHashSet<Id>,
}

impl ReassignmentCollector {
    fn visit_assign_target_pat(&mut self, pat: &Pat) {
        match pat {
            Pat::Ident(ident) => {
                self.reassigned.insert(ident.to_id());
            }
            Pat::Array(array) => {
                for elem in array.elems.iter().flatten() {
                    self.visit_assign_target_pat(elem);
                }
            }
            Pat::Object(obj) => {
                for prop in &obj.props {
                    match prop {
                        ObjectPatProp::KeyValue(kv) => self.visit_assign_target_pat(&kv.value),
                        ObjectPatProp::Assign(assign) => {
                            self.reassigned.insert(assign.key.to_id());
                        }
                        ObjectPatProp::Rest(rest) => self.visit_assign_target_pat(&rest.arg),
                    }
                }
            }
            Pat::Assign(assign) => self.visit_assign_target_pat(&assign.left),
            Pat::Rest(rest) => self.visit_assign_target_pat(&rest.arg),
            Pat::Expr(..) | Pat::Invalid(..) => {}
        }
    }
}

impl Visit for ReassignmentCollector {
    noop_visit_type!();

    fn visit_assign_expr(&mut self, assign: &AssignExpr) {
        assign.visit_children_with(self);
        match &assign.left {
            AssignTarget::Simple(SimpleAssignTarget::Ident(ident)) => {
                self.reassigned.insert(ident.to_id());
            }
            AssignTarget::Simple(..) => {}
            AssignTarget::Pat(pat) => match pat {
                AssignTargetPat::Array(array) => {
                    self.visit_assign_target_pat(&Pat::Array(array.clone()))
                }
                AssignTargetPat::Object(obj) => {
                    self.visit_assign_target_pat(&Pat::Object(obj.clone()))
                }
                AssignTargetPat::Invalid(..) => {}
            },
        }
    }

    fn visit_update_expr(&mut self, update: &UpdateExpr) {
        update.visit_children_with(self);
        if let Expr::Ident(ident) = &*update.arg {
            self.reassigned.insert(ident.to_id());
        }
    }

    fn visit_for_in_stmt(&mut self, stmt: &ForInStmt) {
        stmt.visit_children_with(self);
        self.visit_for_head(&stmt.left);
    }

    fn visit_for_of_stmt(&mut self, stmt: &ForOfStmt) {
        stmt.visit_children_with(self);
        self.visit_for_head(&stmt.left);
    }
}

impl ReassignmentCollector {
    fn visit_for_head(&mut self, head: &ForHead) {
        match head {
            ForHead::VarDecl(var) => {
                for declarator in &var.decls {
                    self.visit_assign_target_pat(&declarator.name);
                }
            }
            ForHead::Pat(pat) => self.visit_assign_target_pat(pat),
            ForHead::UsingDecl(..) => {}
        }
    }
}
