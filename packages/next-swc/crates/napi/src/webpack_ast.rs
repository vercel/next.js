//! Minimalize AST for webpack.
//!
//! This code lives at `napi` crate because it's not used by wasm.

use rayon::prelude::*;
use swc_ecmascript::{
    ast::*,
    utils::StmtOrModuleItem,
    visit::{noop_visit_mut_type, VisitMut, VisitMutWith},
};

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
pub fn ast_minimalizer() -> impl VisitMut {
    Minimalizer::default()
}

#[derive(Default, Clone, Copy)]
struct Minimalizer {
    /// `true` if we should preserve all expressions.
    should_preserve_all_expr: bool,
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
                stmt.visit_mut_with(&mut Minimalizer::default());
            });
        } else {
            stmts.visit_mut_children_with(&mut Minimalizer::default());
        }
    }

    fn can_ignore_expr(&mut self, e: &mut Expr) {}
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
