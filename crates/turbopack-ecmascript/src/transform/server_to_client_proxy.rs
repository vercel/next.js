use swc_core::{
    common::DUMMY_SP,
    ecma::{
        ast::{
            Expr, ExprStmt, Ident, ImportDecl, ImportDefaultSpecifier, ImportSpecifier,
            KeyValueProp, Lit, Module, ModuleDecl, ModuleItem, ObjectLit, Program, Prop, PropName,
            PropOrSpread, Stmt, Str,
        },
        utils::private_ident,
    },
    quote,
};

use crate::references::TURBOPACK_HELPER;

macro_rules! has_client_directive {
    ($stmts:expr) => {
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
            .any(|s| &*s.value == "use client")
    };
}

pub fn is_client_module(program: &Program) -> bool {
    match program {
        Program::Module(m) => has_client_directive!(m.body.iter().map(|item| item.as_stmt())),
        Program::Script(s) => has_client_directive!(s.body.iter().map(Some)),
    }
}

pub fn create_proxy_module(transition_name: &str, target_import: &str) -> Program {
    let ident = private_ident!("createProxy");
    Program::Module(Module {
        body: vec![
            ModuleItem::Stmt(Stmt::Expr(ExprStmt {
                expr: box Expr::Lit(Lit::Str(Str {
                    value: format!("TURBOPACK {{ transition: {transition_name} }}").into(),
                    raw: None,
                    span: DUMMY_SP,
                })),
                span: DUMMY_SP,
            })),
            ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                specifiers: vec![ImportSpecifier::Default(ImportDefaultSpecifier {
                    local: ident.clone(),
                    span: DUMMY_SP,
                })],
                src: box target_import.into(),
                type_only: false,
                asserts: Some(box ObjectLit {
                    span: DUMMY_SP,
                    props: vec![PropOrSpread::Prop(box Prop::KeyValue(KeyValueProp {
                        key: PropName::Ident(Ident::new(TURBOPACK_HELPER.into(), DUMMY_SP)),
                        value: box Expr::Lit(true.into()),
                    }))],
                }),
                span: DUMMY_SP,
            })),
            ModuleItem::Stmt(quote!(
                "__turbopack_export_value__($proxy);" as Stmt,
                proxy = ident,
            )),
        ],
        shebang: None,
        span: DUMMY_SP,
    })
}
