use std::mem::replace;

use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{
        ClassDecl, Decl, DefaultDecl, ExportDecl, ExportDefaultDecl, ExportDefaultExpr, FnDecl,
        Ident, ModuleDecl, ModuleItem, Stmt, VarDecl, VarDeclarator,
    },
    quote,
};
use turbo_tasks::{NonLocalValue, Vc, debug::ValueDebugFormat, trace::TraceRawVcs};
use turbopack_core::chunk::ChunkingContext;

use crate::{
    code_gen::{CodeGen, CodeGeneration},
    create_visitor,
    magic_identifier::MAGIC_IDENTIFIER_DEFAULT_EXPORT_ATOM,
    references::AstPath,
};

/// Makes code changes to remove export/import declarations and places the
/// expr/decl in a normal statement. Unnamed expr/decl will be named with the
/// magic identifier "export default"
#[derive(
    PartialEq, Eq, TraceRawVcs, ValueDebugFormat, NonLocalValue, Debug, Hash, Encode, Decode,
)]
pub struct EsmModuleItem {
    pub path: AstPath,
    pub supports_block_scoping: bool,
}

impl EsmModuleItem {
    pub fn new(path: AstPath, supports_block_scoping: bool) -> Self {
        EsmModuleItem {
            path,
            supports_block_scoping,
        }
    }

    pub async fn code_generation(
        &self,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let mut visitors = Vec::new();
        let supports_block_scoping = self.supports_block_scoping;

        visitors.push(create_visitor!(
            self.path,
            visit_mut_module_item,
            |module_item: &mut ModuleItem| {
                let item = replace(module_item, ModuleItem::Stmt(quote!(";" as Stmt)));
                if let ModuleItem::ModuleDecl(module_decl) = item {
                    match module_decl {
                        ModuleDecl::ExportDefaultExpr(ExportDefaultExpr { box expr, .. }) => {
                            let decl = Decl::Var(Box::new(VarDecl {
                                span: DUMMY_SP,
                                ctxt: Default::default(),
                                kind: if supports_block_scoping {
                                    swc_core::ecma::ast::VarDeclKind::Const
                                } else {
                                    // This is not entirely correct: this hides TDZ errors with
                                    // circular imports, but there is no way to model this runtime
                                    // behavior well for older browsers.
                                    swc_core::ecma::ast::VarDeclKind::Var
                                },
                                declare: false,
                                decls: vec![VarDeclarator {
                                    span: DUMMY_SP,
                                    name: Ident::new(
                                        MAGIC_IDENTIFIER_DEFAULT_EXPORT_ATOM.clone(),
                                        DUMMY_SP,
                                        Default::default(),
                                    )
                                    .into(),
                                    init: Some(Box::new(expr)),
                                    definite: false,
                                }],
                            }));
                            *module_item = ModuleItem::Stmt(Stmt::Decl(decl));
                        }
                        ModuleDecl::ExportDefaultDecl(ExportDefaultDecl { decl, span }) => {
                            match decl {
                                DefaultDecl::Class(class) => {
                                    *module_item =
                                        ModuleItem::Stmt(Stmt::Decl(Decl::Class(ClassDecl {
                                            ident: class.ident.unwrap_or_else(|| {
                                                Ident::new(
                                                    MAGIC_IDENTIFIER_DEFAULT_EXPORT_ATOM.clone(),
                                                    DUMMY_SP,
                                                    Default::default(),
                                                )
                                            }),
                                            declare: false,
                                            class: class.class,
                                        })))
                                }
                                DefaultDecl::Fn(fn_expr) => {
                                    *module_item = ModuleItem::Stmt(Stmt::Decl(Decl::Fn(FnDecl {
                                        ident: fn_expr.ident.unwrap_or_else(|| {
                                            Ident::new(
                                                MAGIC_IDENTIFIER_DEFAULT_EXPORT_ATOM.clone(),
                                                DUMMY_SP,
                                                Default::default(),
                                            )
                                        }),
                                        declare: false,
                                        function: fn_expr.function,
                                    })))
                                }
                                DefaultDecl::TsInterfaceDecl(_) => {
                                    // not matching, might happen due to eventual consistency
                                    *module_item =
                                        ModuleItem::ModuleDecl(ModuleDecl::ExportDefaultDecl(
                                            ExportDefaultDecl { decl, span },
                                        ));
                                }
                            }
                        }
                        ModuleDecl::ExportDecl(ExportDecl { decl, .. }) => {
                            *module_item = ModuleItem::Stmt(Stmt::Decl(decl));
                        }
                        ModuleDecl::ExportNamed(_) => {
                            // already removed
                        }
                        ModuleDecl::ExportAll(_) => {
                            // already removed
                        }
                        ModuleDecl::Import(_) => {
                            // already removed
                        }
                        _ => {
                            // not matching, might happen due to eventual consistency
                            *module_item = ModuleItem::ModuleDecl(module_decl);
                        }
                    }
                } else {
                    // not matching, might happen due to eventual consistency
                    *module_item = item;
                }
            }
        ));

        Ok(CodeGeneration::visitors(visitors))
    }
}

impl From<EsmModuleItem> for CodeGen {
    fn from(val: EsmModuleItem) -> Self {
        CodeGen::EsmModuleItem(val)
    }
}
