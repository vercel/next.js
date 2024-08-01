use swc_core::ecma::ast::{Lit, Program};

pub mod client;
pub mod client_disallowed;
pub mod server;
mod server_to_client_proxy;

macro_rules! has_directive {
    ($stmts:expr, $name:literal) => {
        $stmts
            .map(|item| {
                if let Lit::Str(str) = item?.as_expr()?.expr.as_lit()? {
                    Some(str)
                } else {
                    None
                }
            })
            .take_while(Option::is_some)
            .map(Option::unwrap)
            .any(|s| &*s.value == $name)
    };
}

fn is_client_module(program: &Program) -> bool {
    match program {
        Program::Module(m) => {
            has_directive!(m.body.iter().map(|item| item.as_stmt()), "use client")
        }
        Program::Script(s) => has_directive!(s.body.iter().map(Some), "use client"),
    }
}

fn is_server_module(program: &Program) -> bool {
    match program {
        Program::Module(m) => {
            has_directive!(m.body.iter().map(|item| item.as_stmt()), "use server")
        }
        Program::Script(s) => has_directive!(s.body.iter().map(Some), "use server"),
    }
}
