use swc_core::ecma::{
    ast::{Callee, Expr, FnDecl, FnExpr, Pat, Program, ReturnStmt, Stmt, VarDeclarator},
    visit::{Visit, VisitWith},
};

pub fn is_required(program: &Program) -> bool {
    let mut finder = Finder::default();
    finder.visit_program(program);
    finder.found
}

#[derive(Default)]
struct Finder {
    found: bool,

    /// We are in a function that starts with a capital letter or it's a function that starts with
    /// `use`
    is_interested: bool,
}

impl Visit for Finder {
    fn visit_callee(&mut self, node: &Callee) {
        if self.is_interested {
            if let Callee::Expr(e) = node {
                if let Expr::Ident(c) = &**e {
                    if c.sym.starts_with("use") {
                        self.found = true;
                        return;
                    }
                }
            }
        }

        node.visit_children_with(self);
    }

    fn visit_expr(&mut self, node: &Expr) {
        if self.found {
            return;
        }
        if matches!(
            node,
            Expr::JSXMember(..)
                | Expr::JSXNamespacedName(..)
                | Expr::JSXEmpty(..)
                | Expr::JSXElement(..)
                | Expr::JSXFragment(..)
        ) {
            self.found = true;
            return;
        }

        node.visit_children_with(self);
    }

    fn visit_fn_decl(&mut self, node: &FnDecl) {
        let old = self.is_interested;
        self.is_interested = node.ident.sym.starts_with("use")
            || node.ident.sym.starts_with(|c: char| c.is_ascii_uppercase());

        node.visit_children_with(self);

        self.is_interested = old;
    }

    fn visit_fn_expr(&mut self, node: &FnExpr) {
        let old = self.is_interested;

        self.is_interested |= node.ident.as_ref().is_some_and(|ident| {
            ident.sym.starts_with("use") || ident.sym.starts_with(|c: char| c.is_ascii_uppercase())
        });

        node.visit_children_with(self);

        self.is_interested = old;
    }

    fn visit_return_stmt(&mut self, node: &ReturnStmt) {
        if self.is_interested {
            if let Some(Expr::JSXElement(..) | Expr::JSXEmpty(..) | Expr::JSXFragment(..)) =
                node.arg.as_deref()
            {
                self.found = true;
                return;
            }
        }

        node.visit_children_with(self);
    }

    fn visit_stmt(&mut self, node: &Stmt) {
        if self.found {
            return;
        }
        node.visit_children_with(self);
    }

    fn visit_var_declarator(&mut self, node: &VarDeclarator) {
        let old = self.is_interested;

        if let Pat::Ident(ident) = &node.name {
            self.is_interested = ident.sym.starts_with("use")
                || ident.sym.starts_with(|c: char| c.is_ascii_uppercase());
        } else {
            self.is_interested = false;
        }

        node.visit_children_with(self);

        self.is_interested = old;
    }
}
