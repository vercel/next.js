use either::Either;
use swc_core::ecma::{
    ast::{Expr, Lit, ModuleItem, Program, Stmt, Str},
    utils::IsDirective,
};

#[derive(Default, Debug)]
pub struct TurbopackDirectives {
    pub no_side_effects: bool,
    pub constants_module: bool,
}

pub fn parse_module_turbopack_directives(program: &Program) -> TurbopackDirectives {
    let mut result = TurbopackDirectives::default();

    let directives = match program {
        Program::Module(module) => Either::Left(
            module
                .body
                .iter()
                .take_while(|i| match i {
                    ModuleItem::Stmt(stmt) => stmt.directive_continue(),
                    ModuleItem::ModuleDecl(_) => false,
                })
                .filter_map(|i| i.as_stmt()),
        ),
        Program::Script(script) => Either::Right(
            script
                .body
                .iter()
                .take_while(|stmt| stmt.directive_continue()),
        ),
    };

    for directive in directives {
        if let Stmt::Expr(expr) = directive
            && let Expr::Lit(Lit::Str(Str { value, .. })) = &*expr.expr
        {
            match &*value.to_string_lossy() {
                "use turbopack: no side effects" => result.no_side_effects = true,
                "use turbopack: constants" => result.constants_module = true,
                v if v.starts_with("use turbopack ") => {
                    // TODO error for unknown directive
                }
                _ => {}
            }
        }
    }

    result
}
