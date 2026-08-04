use ast_facade_core::{Backend, ExprRef, LitRef, ProgramItemRef, ProgramRef};
use ast_facade_swc::Swc;
use swc_core::ecma::ast::Program;

pub mod client;
pub mod client_disallowed;
mod server_to_client_proxy;

fn has_directive<B: Backend>(program: ProgramRef<'_, '_, B>, name: &str) -> bool {
    program
        .items()
        .map_while(|item| {
            let ProgramItemRef::ExprStmt(ExprRef::Lit(LitRef::String(value))) = item else {
                return None;
            };
            value.value_utf8()
        })
        .any(|value| value == name)
}

fn is_client_module(program: &Program) -> bool {
    has_directive(ProgramRef::<Swc>::new(program), "use client")
}

#[cfg(test)]
mod tests {
    use swc_core::{
        common::DUMMY_SP,
        ecma::ast::{EmptyStmt, Expr, ExprStmt, Lit, Script, Stmt, Str},
    };

    use super::is_client_module;

    fn string_statement(value: &str) -> Stmt {
        Stmt::Expr(ExprStmt {
            span: DUMMY_SP,
            expr: Box::new(Expr::Lit(Lit::Str(Str {
                span: DUMMY_SP,
                value: value.into(),
                raw: None,
            }))),
        })
    }

    #[test]
    fn finds_client_directive_in_directive_prologue() {
        let program = Script {
            span: DUMMY_SP,
            body: vec![
                string_statement("use strict"),
                string_statement("use client"),
            ],
            shebang: None,
        }
        .into();

        assert!(is_client_module(&program));
    }

    #[test]
    fn ignores_client_string_after_directive_prologue() {
        let program = Script {
            span: DUMMY_SP,
            body: vec![
                Stmt::Empty(EmptyStmt { span: DUMMY_SP }),
                string_statement("use client"),
            ],
            shebang: None,
        }
        .into();

        assert!(!is_client_module(&program));
    }
}
