use swc_core::{
    common::DUMMY_SP,
    ecma::{
        ast::{
            ImportDecl, ImportDefaultSpecifier, ImportSpecifier, ImportStarAsSpecifier, Module,
            ModuleDecl, ModuleItem, Program,
        },
        utils::private_ident,
    },
    quote,
};
use turbopack_ecmascript::{
    annotations::{with_clause, ANNOTATION_TRANSITION},
    TURBOPACK_HELPER,
};

pub fn create_proxy_module(transition_name: &str, target_import: &str) -> Program {
    let ident = private_ident!("clientProxy");
    Program::Module(Module {
        body: vec![
            ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                specifiers: vec![ImportSpecifier::Namespace(ImportStarAsSpecifier {
                    local: ident.clone(),
                    span: DUMMY_SP,
                })],
                src: Box::new(target_import.into()),
                type_only: false,
                with: Some(with_clause(&[
                    (TURBOPACK_HELPER.as_str(), "true"),
                    (ANNOTATION_TRANSITION, transition_name),
                ])),
                span: DUMMY_SP,
                phase: Default::default(),
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

pub fn create_error_proxy_module(error_proxy_module: &str) -> Program {
    let ident = private_ident!("errorProxy");
    Program::Module(Module {
        body: vec![
            ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                specifiers: vec![ImportSpecifier::Default(ImportDefaultSpecifier {
                    local: ident.clone(),
                    span: DUMMY_SP,
                })],
                src: Box::new(error_proxy_module.into()),
                type_only: false,
                with: Some(with_clause(&[(TURBOPACK_HELPER.as_str(), "true")])),
                span: DUMMY_SP,
                phase: Default::default(),
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
