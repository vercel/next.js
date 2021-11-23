//! Minimalize AST for webpack.
//!
//! This code lives at `napi` crate because it's not used by wasm.

use rayon::prelude::*;
use std::sync::Arc;
use swc_common::{util::take::Take, DUMMY_SP};
use swc_ecmascript::{
    ast::*,
    utils::StmtOrModuleItem,
    visit::{noop_visit_mut_type, VisitMut, VisitMutWith},
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
pub fn ast_minimalizer(data: Arc<ScopeData>) -> impl VisitMut {
    Minimalizer {
        data,
        preserve_literals: false,
        can_remove_pat: false,
    }
}

pub struct ScopeData {}

impl ScopeData {
    pub fn analyze(module: &Module) -> Self {
        ScopeData {}
    }
}

#[derive(Clone)]
struct Minimalizer {
    data: Arc<ScopeData>,
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
        self.visit_mut_stmt_likes(stmts);
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

            _ => {}
        }
    }

    fn visit_mut_stmts(&mut self, stmts: &mut Vec<Stmt>) {
        self.visit_mut_stmt_likes(stmts);
    }
}
