use std::{collections::BTreeMap, mem::replace};

use anyhow::Result;
use swc_common::DUMMY_SP;
use swc_ecma_ast::{
    ClassDecl, Decl, DefaultDecl, ExportDecl, ExportDefaultDecl, ExportDefaultExpr, Expr, FnDecl,
    Ident, KeyValueProp, Module, ModuleDecl, ModuleItem, ObjectLit, Program, Prop, PropName,
    PropOrSpread, Script, Stmt, Str,
};
use swc_ecma_quote::quote;
use swc_ecma_visit::VisitMut;
use turbopack_core::chunk::ChunkingContextVc;

use crate::{
    chunk::EcmascriptChunkContextVc,
    code_gen::{CodeGenerateable, CodeGenerateableVc, CodeGeneration, CodeGenerationVc},
    create_visitor, magic_identifier,
    references::AstPathVc,
};

#[turbo_tasks::value(shared, CodeGenerateable)]
#[derive(Hash, Debug)]
pub struct EsmExports {
    pub exports: BTreeMap<String, String>,
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for EsmExports {
    #[turbo_tasks::function]
    async fn code_generation(
        self_vc: EsmExportsVc,
        _chunk_context: EcmascriptChunkContextVc,
        _context: ChunkingContextVc,
    ) -> Result<CodeGenerationVc> {
        let this = self_vc.await?;
        let mut visitors = Vec::new();

        visitors.push(create_visitor!(visit_mut_program(program: &mut Program) {
            let getters = Expr::Object(ObjectLit {
                span: DUMMY_SP,
                props: this.exports.iter().map(|(exported, local)| {
                    PropOrSpread::Prop(box Prop::KeyValue(KeyValueProp {
                        key: PropName::Str(Str {
                            span: DUMMY_SP,
                            value: (exported as &str).into(),
                            raw: None
                        }),
                        value: box quote!("(() => $local)" as Expr, local = Ident::new((local as &str).into(), DUMMY_SP))
                    }))
                }).collect()
            });
            let stmt = quote!("__turbopack_esm__($getters);" as Stmt,
                getters: Expr = getters
            );
            match program {
                Program::Module(Module { body, .. }) => {
                    body.insert(0, ModuleItem::Stmt(stmt));
                }
                Program::Script(Script { body, .. }) => {
                    body.insert(0, stmt);
                }
            }
        }));

        Ok(CodeGeneration { visitors }.into())
    }
}

/// Makes code changes to remove export declarations and places the expr/decl in
/// a normal statement. Unnamed expr/decl will be named with the magic
/// identifier "export default"
#[turbo_tasks::value(CodeGenerateable)]
#[derive(Hash, Debug)]
pub struct EsmExport {
    pub path: AstPathVc,
}

#[turbo_tasks::value_impl]
impl EsmExportVc {
    #[turbo_tasks::function]
    pub fn new(path: AstPathVc) -> Self {
        Self::cell(EsmExport { path })
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for EsmExport {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        _chunk_context: EcmascriptChunkContextVc,
        _context: ChunkingContextVc,
    ) -> Result<CodeGenerationVc> {
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
                        other => {
                            panic!("EsmExport was created with a path that points to a unexpected ModuleDecl {:?}", other);
                        }
                    }
                } else {
                    panic!("EsmExport was created with a path that points to a unexpected ModuleItem {:?}", item);
                }
            }),
        );

        Ok(CodeGeneration { visitors }.into())
    }
}
