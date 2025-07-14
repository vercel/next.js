use std::mem::replace;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{
        ClassDecl, Decl, DefaultDecl, ExportDecl, ExportDefaultDecl, ExportDefaultExpr, FnDecl,
        Ident, ModuleDecl, ModuleItem, Stmt,
    },
    quote,
};
use turbo_tasks::{NonLocalValue, Vc, debug::ValueDebugFormat, trace::TraceRawVcs};
use turbopack_core::chunk::ChunkingContext;

use crate::{
    code_gen::{CodeGen, CodeGeneration},
    create_visitor, magic_identifier,
    references::AstPath,
};

/// Makes code changes to remove export/import declarations and places the
/// expr/decl in a normal statement. Unnamed expr/decl will be named with the
/// magic identifier "export default"
#[derive(PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat, NonLocalValue)]
pub struct EsmModuleItem {
    pub path: AstPath,
}

impl EsmModuleItem {
    pub fn new(path: AstPath) -> Self {
        EsmModuleItem { path }
    }

    pub async fn code_generation(
        &self,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let mut visitors = Vec::new();

        visitors.push(
            create_visitor!(self.path, visit_mut_module_item, |module_item: &mut ModuleItem| {
                let item = replace(module_item, ModuleItem::Stmt(quote!(";" as Stmt)));
                if let ModuleItem::ModuleDecl(module_decl) = item {
                    match module_decl {
                        ModuleDecl::ExportDefaultExpr(ExportDefaultExpr { box expr, .. }) => {
                            let stmt = quote!("const $name = $expr;" as Stmt,
                                name = Ident::new(magic_identifier::mangle("default export").into(), DUMMY_SP, Default::default()),
                                expr: Expr = expr
                            );
                            *module_item = ModuleItem::Stmt(stmt);
                        }
                        ModuleDecl::ExportDefaultDecl(ExportDefaultDecl { decl, span }) => {
                            match decl {
                                DefaultDecl::Class(class) => {
                                    *module_item = ModuleItem::Stmt(Stmt::Decl(Decl::Class(ClassDecl {
                                        ident: class.ident.unwrap_or_else(|| Ident::new(magic_identifier::mangle("default export").into(), DUMMY_SP, Default::default())),
                                        declare: false,
                                        class: class.class
                                    })))
                                }
                                DefaultDecl::Fn(fn_expr) => {
                                    *module_item = ModuleItem::Stmt(Stmt::Decl(Decl::Fn(FnDecl {
                                        ident: fn_expr.ident.unwrap_or_else(|| Ident::new(magic_identifier::mangle("default export").into(), DUMMY_SP, Default::default())),
                                        declare: false,
                                        function: fn_expr.function
                                    })))
                                }
                                DefaultDecl::TsInterfaceDecl(_) => {
                                    // not matching, might happen due to eventual consistency
                                    *module_item = ModuleItem::ModuleDecl(ModuleDecl::ExportDefaultDecl(ExportDefaultDecl { decl, span }));
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
            }),
        );

        Ok(CodeGeneration::visitors(visitors))
    }
}

impl From<EsmModuleItem> for CodeGen {
    fn from(val: EsmModuleItem) -> Self {
        CodeGen::EsmModuleItem(val)
    }
}
