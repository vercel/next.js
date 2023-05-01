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

pub fn create_proxy_module(transition_name: &str, target_import: &str) -> Program {
    let ident = private_ident!("createProxy");
    Program::Module(Module {
        body: vec![
            ModuleItem::Stmt(Stmt::Expr(ExprStmt {
                expr: Box::new(Expr::Lit(Lit::Str(Str {
                    value: format!("TURBOPACK {{ transition: {transition_name} }}").into(),
                    raw: None,
                    span: DUMMY_SP,
                }))),
                span: DUMMY_SP,
            })),
            ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                specifiers: vec![ImportSpecifier::Default(ImportDefaultSpecifier {
                    local: ident.clone(),
                    span: DUMMY_SP,
                })],
                src: Box::new(target_import.into()),
                type_only: false,
                asserts: Some(Box::new(ObjectLit {
                    span: DUMMY_SP,
                    props: vec![PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                        key: PropName::Ident(Ident::new(TURBOPACK_HELPER.into(), DUMMY_SP)),
                        value: Box::new(Expr::Lit(true.into())),
                    })))],
                })),
                span: DUMMY_SP,
            })),
            ModuleItem::Stmt(quote!(
                "__turbopack_export_namespace__($proxy);" as Stmt,
                proxy = ident,
            )),
        ],
        shebang: None,
        span: DUMMY_SP,
    })
}
