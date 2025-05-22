use swc_core::ecma::{
    ast::{Callee, Expr, FnDecl, FnExpr, Pat, Program, Stmt, VarDeclarator},
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

#[cfg(test)]
mod tests {
    use swc_core::{common::FileName, ecma::parser::parse_file_as_program};
    use testing::run_test2;

    use super::*;

    fn assert_required(code: &str, required: bool) {
        run_test2(false, |cm, _| {
            let fm = cm.new_source_file(FileName::Custom("test.tsx".into()).into(), code.into());

            let program = parse_file_as_program(
                &fm,
                Default::default(),
                Default::default(),
                Default::default(),
                &mut vec![],
            )
            .unwrap();

            assert_eq!(is_required(&program), required);

            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn lazy_return() {
        assert_required(
            "
            function Foo() {
                const a = <div>Hello</div>;

                return a
            }
            ",
            true,
        );

        assert_required(
            "
            function Foo() {
            ",
            false,
        );
    }

    #[test]
    fn return_jsx() {
        assert_required(
            "
            function Foo() {
                return <div>Hello</div>;
            }
            ",
            true,
        );
    }

    #[test]
    fn use_hooks() {
        assert_required(
            "
            function Foo(props) {
                const [a, b] = useState(0);

                return {props.children};
            }
            ",
            true,
        );
    }
}
