//! Minimalize AST for webpack.
//!
//! This code lives at `napi` crate because it's not used by wasm.

use swc_ecmascript::{
    ast::*,
    utils::StmtOrModuleItem,
    visit::{noop_visit_mut_type, VisitMut, VisitMutWith},
};

pub fn ast_minimalizer() -> impl VisitMut {
    Minimalizer
}

struct Minimalizer;

impl Minimalizer {
    fn visit_mut_stmt_likes<T>(&mut self, stmts: &mut Vec<T>)
    where
        T: StmtOrModuleItem,
        Vec<T>: VisitMutWith<Self>,
    {
        stmts.visit_mut_children_with(self);
    }
}

impl VisitMut for Minimalizer {
    noop_visit_mut_type!();

    fn visit_mut_module_items(&mut self, stmts: &mut Vec<ModuleItem>) {
        self.visit_mut_stmt_likes(stmts);
    }

    fn visit_mut_stmts(&mut self, stmts: &mut Vec<Stmt>) {
        self.visit_mut_stmt_likes(stmts);
    }
}
