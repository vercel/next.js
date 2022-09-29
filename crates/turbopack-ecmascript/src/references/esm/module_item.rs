use std::mem::replace;

use anyhow::Result;
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{
        ClassDecl, Decl, DefaultDecl, ExportDecl, ExportDefaultDecl, ExportDefaultExpr, FnDecl,
        Ident, ModuleDecl, ModuleItem, Stmt,
    },
    quote,
};
use turbopack_core::chunk::ChunkingContextVc;

use crate::{
    code_gen::{CodeGenerateable, CodeGenerateableVc, CodeGeneration, CodeGenerationVc},
    create_visitor, magic_identifier,
    references::AstPathVc,
};

/// Makes code changes to remove export/import declarations and places the
/// expr/decl in a normal statement. Unnamed expr/decl will be named with the
/// magic identifier "export default"
#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct EsmModuleItem {
    pub path: AstPathVc,
}

#[turbo_tasks::value_impl]
impl EsmModuleItemVc {
    #[turbo_tasks::function]
    pub fn new(path: AstPathVc) -> Self {
        Self::cell(EsmModuleItem { path })
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for EsmModuleItem {
    #[turbo_tasks::function]
    async fn code_generation(&self, _context: ChunkingContextVc) -> Result<CodeGenerationVc> {
        let mut visitors = Vec::new();

        let path = &self.path.await?;
        visitors.push(
            create_visitor!(path, visit_mut_module_item(module_item: &mut ModuleItem) {
                let item = replace(module_item, ModuleItem::Stmt(quote!(";" as Stmt)));
                if let ModuleItem::ModuleDecl(module_decl) = item {
                    match module_decl {
                        ModuleDecl::ExportDefaultExpr(ExportDefaultExpr { box expr, .. }) => {
                            let stmt = quote!("const $name = $expr;" as Stmt,
                                name = Ident::new(magic_identifier::encode("default export").into(), DUMMY_SP),
                                expr: Expr = expr
                            );
                            *module_item = ModuleItem::Stmt(stmt);
                        }
                        ModuleDecl::ExportDefaultDecl(ExportDefaultDecl { decl, ..}) => {
                            match decl {
                                DefaultDecl::Class(class) => {
                                    *module_item = ModuleItem::Stmt(Stmt::Decl(Decl::Class(ClassDecl {
                                        ident: class.ident.unwrap_or_else(|| Ident::new(magic_identifier::encode("default export").into(), DUMMY_SP)),
                                        declare: false,
                                        class: class.class
                                    })))
                                }
                                DefaultDecl::Fn(fn_expr) => {
                                    *module_item = ModuleItem::Stmt(Stmt::Decl(Decl::Fn(FnDecl {
                                        ident: fn_expr.ident.unwrap_or_else(|| Ident::new(magic_identifier::encode("default export").into(), DUMMY_SP)),
                                        declare: false,
                                        function: fn_expr.function
                                    })))
                                }
                                DefaultDecl::TsInterfaceDecl(_) => {
                                    panic!("typescript declarations are unexpected here");
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
                        other => {
                            panic!("EsmModuleItem was created with a path that points to a unexpected ModuleDecl {:?}", other);
                        }
                    }
                } else {
                    panic!("EsmModuleItem was created with a path that points to a unexpected ModuleItem {:?}", item);
                }
            }),
        );

        Ok(CodeGeneration { visitors }.into())
    }
}
