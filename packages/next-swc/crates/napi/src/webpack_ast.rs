//! Minimalizer for AST.
//!
//! This code lives at `napi` crate because it depends on `rayon` and it's not
//! used by wasm.

use rayon::prelude::*;
use std::sync::Arc;
use swc_common::{util::take::Take, Mark, SyntaxContext, DUMMY_SP};
use swc_ecmascript::{
    ast::*,
    utils::StmtOrModuleItem,
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
struct ScopeData {}

impl ScopeData {
    fn analyze(module: &[ModuleItem]) -> Self {
        ScopeData {}
    }
}

#[derive(Clone, Default)]
struct Minimalizer {
    data: Arc<ScopeData>,
    top_level_ctxt: SyntaxContext,
    /// `true` if we should preserve literals.
    preserve_literals: bool,

    can_remove_pat: bool,
}

impl Minimalizer {
    fn visit_mut_stmt_likes<T>(&mut self, stmts: &mut Vec<T>)
    where
        T: StmtOrModuleItem + VisitMutWith<Self>,
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

        // Remove empty statements
        stmts.retain(|stmt| match stmt.as_stmt() {
            Ok(Stmt::Empty(..)) => return false,
            _ => true,
        });
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

    /// Normalize expressions.
    ///
    ///  - empty [Expr::Seq] => [Expr::Invalid]
    fn visit_mut_expr(&mut self, e: &mut Expr) {
        e.visit_mut_children_with(self);

        match e {
            Expr::Seq(seq) => {
                if seq.exprs.is_empty() {
                    *e = Expr::Invalid(Invalid { span: DUMMY_SP });
                    return;
                }
            }
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

    fn visit_mut_exprs(&mut self, exprs: &mut Vec<Box<Expr>>) {
        exprs.visit_mut_children_with(self);

        exprs.retain(|e| !e.is_invalid());
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

    /// Normalize statements.
    ///
    ///  - Invalid [Stmt::Expr] => [Stmt::Empty]
    ///  - Empty [Stmt::Block] => [Stmt::Empty]
    ///  - Single-item [Stmt::Block] => the item
    ///  - Invalid [Stmt::Decl] => [Stmt::Empty]
    fn visit_mut_stmt(&mut self, stmt: &mut Stmt) {
        stmt.visit_mut_children_with(self);

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

            _ => {}
        }
    }

    fn visit_mut_stmts(&mut self, stmts: &mut Vec<Stmt>) {
        self.visit_mut_stmt_likes(stmts);
    }
}
