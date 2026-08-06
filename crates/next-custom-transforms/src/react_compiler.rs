use swc_core::ecma::{
    ast::{
        Callee, ExportDefaultDecl, ExportDefaultExpr, Expr, FnDecl, FnExpr, Lit, MemberProp, Pat,
        Program, Stmt, VarDeclarator,
    },
    visit::{Visit, VisitWith},
};

pub fn is_required(program: &Program) -> bool {
    let mut finder = Finder::default();
    finder.visit_program(program);
    finder.found
}

/// Conservatively determines whether infer mode could transform anything in a module.
///
/// False positives only add compiler work. False negatives would change output, so this
/// deliberately scans every function context for JSX, hook calls, and opt-in directives.
pub fn may_require(program: &Program) -> bool {
    let mut finder = PotentialFinder::default();
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

#[derive(Default)]
struct PotentialFinder {
    found: bool,
}

fn is_hook_callee(expr: &Expr) -> bool {
    match expr {
        Expr::Ident(ident) => ident.sym.starts_with("use"),
        Expr::Member(member) => {
            let Expr::Ident(object) = &*member.obj else {
                return false;
            };
            let MemberProp::Ident(property) = &member.prop else {
                return false;
            };

            object.sym.starts_with(|c: char| c.is_ascii_uppercase())
                && property.sym.starts_with("use")
        }
        _ => false,
    }
}

impl Visit for PotentialFinder {
    fn visit_callee(&mut self, node: &Callee) {
        if let Callee::Expr(expr) = node
            && is_hook_callee(expr)
        {
            self.found = true;
            return;
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
        ) || matches!(
            node,
            Expr::Lit(Lit::Str(value))
                if value
                    .value
                    .as_str()
                    .is_some_and(|value| matches!(value, "use memo" | "use forget"))
        ) {
            self.found = true;
            return;
        }

        node.visit_children_with(self);
    }

    fn visit_stmt(&mut self, node: &Stmt) {
        if self.found {
            return;
        }
        node.visit_children_with(self);
    }
}

impl Visit for Finder {
    fn visit_callee(&mut self, node: &Callee) {
        if self.is_interested
            && let Callee::Expr(expr) = node
            && let Expr::Ident(callee) = &**expr
            && callee.sym.starts_with("use")
        {
            self.found = true;
            return;
        }

        node.visit_children_with(self);
    }

    fn visit_export_default_decl(&mut self, node: &ExportDefaultDecl) {
        let old = self.is_interested;

        self.is_interested = true;

        node.visit_children_with(self);

        self.is_interested = old;
    }

    fn visit_export_default_expr(&mut self, node: &ExportDefaultExpr) {
        let old = self.is_interested;

        self.is_interested = true;

        node.visit_children_with(self);

        self.is_interested = old;
    }

    fn visit_expr(&mut self, node: &Expr) {
        if self.found {
            return;
        }
        if self.is_interested
            && matches!(
                node,
                Expr::JSXMember(..)
                    | Expr::JSXNamespacedName(..)
                    | Expr::JSXEmpty(..)
                    | Expr::JSXElement(..)
                    | Expr::JSXFragment(..)
            )
        {
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

        if matches!(node.init.as_deref(), Some(Expr::Fn(..) | Expr::Arrow(..))) {
            if let Pat::Ident(ident) = &node.name {
                self.is_interested = ident.sym.starts_with("use")
                    || ident.sym.starts_with(|c: char| c.is_ascii_uppercase());
            } else {
                self.is_interested = false;
            }
        }

        node.visit_children_with(self);

        self.is_interested = old;
    }
}

#[cfg(test)]
mod tests {
    use swc_core::{
        common::FileName,
        ecma::parser::{EsSyntax, parse_file_as_program},
    };
    use testing::run_test2;

    use super::*;

    fn assert_required(code: &str, required: bool) {
        assert_detection(code, required, is_required);
    }

    fn assert_may_require(code: &str, required: bool) {
        assert_detection(code, required, may_require);
    }

    fn assert_detection(code: &str, required: bool, detector: impl FnOnce(&Program) -> bool) {
        run_test2(false, |cm, _| {
            let fm =
                cm.new_source_file(FileName::Custom("test.tsx".into()).into(), code.to_string());

            let program = parse_file_as_program(
                &fm,
                swc_core::ecma::parser::Syntax::Es(EsSyntax {
                    jsx: true,
                    ..Default::default()
                }),
                Default::default(),
                Default::default(),
                &mut vec![],
            )
            .unwrap();

            assert_eq!(detector(&program), required);

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

                return props.children;
            }
            ",
            true,
        );
    }

    #[test]
    fn arrow_function() {
        assert_required(
            "
            const Foo = () => <div>Hello</div>;
            ",
            true,
        );

        assert_required(
            "
            const Foo = () => {
                return <div>Hello</div>;
            };
            ",
            true,
        );
    }

    #[test]
    fn export_const_arrow_function() {
        assert_required(
            "
            export const Foo = () => <div>Hello</div>;
            ",
            true,
        );

        assert_required(
            "
            export const Foo = () => {
                return <div>Hello</div>;
            };
            ",
            true,
        );
    }

    #[test]
    fn normal_arrow_function() {
        assert_required(
            "
            const Foo = () => {
                const a = 1;
                console.log(a);
            };
            ",
            false,
        );
    }

    #[test]
    fn export_default_arrow_function() {
        assert_required(
            "
            export default () => <div>Hello</div>;
            ",
            true,
        );
    }

    #[test]
    fn not_required_arrow_function() {
        assert_required(
            "
            export default () => {
                const a = 1;
                console.log(a);
            };
            ",
            false,
        );
    }

    #[test]
    fn conservative_scan_covers_wrapped_callbacks() {
        assert_may_require("export const Foo = memo(() => <div />);", true);
        assert_may_require(
            "export const Foo = React.forwardRef((props, ref) => <div ref={ref} />);",
            true,
        );
    }

    #[test]
    fn conservative_scan_covers_member_expression_hooks() {
        assert_may_require("function Foo() { React.useState(0); return null; }", true);
    }

    #[test]
    fn conservative_scan_covers_opt_in_directives() {
        assert_may_require(
            r#"function compute(a, b) { "use memo"; return a + b; }"#,
            true,
        );
        assert_may_require(
            r#"function compute(a, b) { "use forget"; return a + b; }"#,
            true,
        );
    }

    #[test]
    fn conservative_scan_still_skips_plain_modules() {
        assert_may_require("export const answer = 42;", false);
    }
}
