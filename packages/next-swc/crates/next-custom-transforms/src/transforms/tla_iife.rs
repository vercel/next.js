use std::mem::take;

use swc_core::ecma::{
    ast::{ArrowExpr, BlockStmt, Function, Module, ModuleItem, Program, Script},
    visit::{noop_visit_mut_type, Fold, VisitMut, VisitMutWith},
};

/// Compiles top-level await into an async IIFE.
pub fn tla_iife() -> impl VisitMut + Fold {}

#[derive(Default)]
struct TlaIife {
    /// Indicates whether we found a top-level await.
    found: bool,
}

impl VisitMut for TlaIife {
    noop_visit_mut_type!();

    /// `await`s in an arrow function is not a top-level await.
    fn visit_mut_arrow_expr(&mut self, n: &mut ArrowExpr) {
        n.params.visit_mut_with(self);
    }

    /// `await`s in a function is not a top-level await.
    fn visit_mut_function(&mut self, n: &mut Function) {
        n.params.visit_mut_with(self);
    }

    fn visit_mut_module(&mut self, n: &mut Module) {
        n.visit_mut_children_with(self);

        // Ignore module as module supports top-level await natively.
        if n.body.iter().any(|stmt| stmt.is_module_decl()) {
            return;
        }

        if self.found {
            let body = take(&mut n.body)
                .into_iter()
                .map(ModuleItem::expect_stmt)
                .collect();
            let iife = create_iife(body);

            n.body.push(ModuleItem::Stmt(iife.into()));
        }
    }

    fn visit_mut_script(&mut self, n: &mut Script) {
        n.visit_mut_children_with(self);

        if self.found {
            let iife = create_iife(take(&mut n.body));

            n.body = iife.body.unwrap().stmts;
        }
    }
}

fn create_iife(body: Vec<Stmt>) -> Box<Function> {
    Box::new(Function {
        params: vec![],
        decorators: vec![],
        span: Default::default(),
        body: Some(BlockStmt {
            stmts: body,
            span: Default::default(),
        }),
        is_async: true,
        is_generator: false,
        return_type: None,
        type_params: None,
    })
}
