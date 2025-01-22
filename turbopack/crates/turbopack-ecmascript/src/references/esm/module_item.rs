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
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{chunk::ChunkingContext, module_graph::ModuleGraph};

use crate::{
    code_gen::{CodeGenerateable, CodeGeneration},
    create_visitor, magic_identifier,
    references::AstPath,
};

/// Makes code changes to remove export/import declarations and places the
/// expr/decl in a normal statement. Unnamed expr/decl will be named with the
/// magic identifier "export default"
#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct EsmModuleItem {
    pub path: ResolvedVc<AstPath>,
}

impl EsmModuleItem {
    pub fn new(path: ResolvedVc<AstPath>) -> Vc<Self> {
        Self::cell(EsmModuleItem { path })
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for EsmModuleItem {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        _module_graph: Vc<ModuleGraph>,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<CodeGeneration>> {
        let mut visitors = Vec::new();

        let path = &self.path.await?;
        visitors.push(
            create_visitor!(path, visit_mut_module_item(module_item: &mut ModuleItem) {
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
