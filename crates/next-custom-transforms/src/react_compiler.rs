use swc_core::ecma::{
    ast::{
        Callee, ExportDefaultDecl, ExportDefaultExpr, Expr, FnDecl, FnExpr, Pat, Program, Stmt,
        VarDeclarator,
    },
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
        if self.is_interested
            && let Callee::Expr(e) = node
            && let Expr::Ident(c) = &**e
            && c.sym.starts_with("use")
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
        ecma::parser::{EsSyntax, TsSyntax, parse_file_as_program},
    };
    use testing::run_test2;

    use super::*;

    fn assert_required(code: &str, required: bool) {
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

            assert_eq!(is_required(&program), required);

            Ok(())
        })
        .unwrap();
    }

    /// Assert that a `.ts` file (TypeScript, no JSX) requires or does not require React Compiler.
    /// Uses `tsx: false` to correctly parse bare generics like `<T>` as type parameters.
    fn assert_required_ts(code: &str, required: bool) {
        run_test2(false, |cm, _| {
            let fm =
                cm.new_source_file(FileName::Custom("test.ts".into()).into(), code.to_string());

            let program = parse_file_as_program(
                &fm,
                swc_core::ecma::parser::Syntax::Typescript(TsSyntax {
                    tsx: false,
                    ..Default::default()
                }),
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

    // Tests for .ts files with bare generic arrow functions (issue #91795).
    // When tsx: true is used for .ts files, `<T>` is parsed as a JSX open tag and fails.
    // With tsx: false (correct for .ts), `<T>` is correctly parsed as a type parameter.

    #[test]
    fn ts_generic_arrow_function_with_hook() {
        // A generic arrow function in a .ts file that uses a hook — should be required.
        // Previously, tsx: true caused a parse error here and the file was silently skipped.
        assert_required_ts(
            "
            const useData = <T>(value: T) => {
                const [state, setState] = useState(value);
                return state;
            };
            ",
            true,
        );
    }

    #[test]
    fn ts_generic_arrow_function_component_with_hook() {
        // A generic component in a .ts file that uses a hook — should be required.
        assert_required_ts(
            "
            const Component = <T extends object>(props: T) => {
                const value = useMemo(() => props, [props]);
                return value;
            };
            ",
            true,
        );
    }

    #[test]
    fn ts_generic_arrow_function_no_hook() {
        // A generic arrow function in a .ts file with no hooks/JSX — should not be required.
        assert_required_ts(
            "
            const identity = <T>(value: T): T => {
                return value;
            };
            ",
            false,
        );
    }

    #[test]
    fn ts_generic_function_with_hook() {
        // A generic named function starting with capital letter using a hook — should be required.
        assert_required_ts(
            "
            function Fetch<T>(url: string) {
                const [data, setData] = useState<T | null>(null);
                return data;
            }
            ",
            true,
        );
    }
}
