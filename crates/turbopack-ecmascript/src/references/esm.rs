use std::{collections::BTreeMap, mem::replace};

use anyhow::Result;
use swc_common::DUMMY_SP;
use swc_ecma_ast::{
    ClassDecl, ComputedPropName, Decl, DefaultDecl, ExportDecl, ExportDefaultDecl,
    ExportDefaultExpr, Expr, FnDecl, Ident, KeyValueProp, Lit, MemberExpr, MemberProp, Module,
    ModuleDecl, ModuleItem, ObjectLit, Program, Prop, PropName, PropOrSpread, Script, Stmt, Str,
};
use swc_ecma_quote::quote;
use swc_ecma_visit::{
    fields::{ExprField, PropField},
    VisitMut,
};
use turbo_tasks::primitives::{BoolVc, StringVc};
use turbopack_core::{
    asset::Asset,
    chunk::{
        AsyncLoadableReference, AsyncLoadableReferenceVc, ChunkableAssetReference,
        ChunkableAssetReferenceVc, ChunkingContextVc, ModuleId,
    },
    context::AssetContextVc,
    reference::{AssetReference, AssetReferenceVc},
    resolve::{parse::RequestVc, ResolveResultVc},
};

use super::AstPathVc;
use crate::{
    chunk::{EcmascriptChunkContextVc, EcmascriptChunkPlaceableVc},
    code_gen::{CodeGenerateable, CodeGenerateableVc, CodeGeneration, CodeGenerationVc},
    create_visitor, magic_identifier,
    resolve::esm_resolve,
};
#[turbo_tasks::value]
pub enum ReferencedAsset {
    Some(EcmascriptChunkPlaceableVc),
    None,
}

async fn get_ident(asset: EcmascriptChunkPlaceableVc) -> Result<String> {
    let path = asset.path().to_string().await?;
    Ok(magic_identifier::encode(&format!(
        "imported module {}",
        path
    )))
}

#[turbo_tasks::value(AssetReference, ChunkableAssetReference, CodeGenerateable)]
#[derive(Hash, Debug)]
pub struct EsmAssetReference {
    pub context: AssetContextVc,
    pub request: RequestVc,
    pub path: AstPathVc,
}

#[turbo_tasks::value_impl]
impl EsmAssetReferenceVc {
    #[turbo_tasks::function]
    async fn get_referenced_asset(self) -> Result<ReferencedAssetVc> {
        let this = self.await?;
        let assets = esm_resolve(this.request, this.context).primary_assets();
        for asset in assets.await?.iter() {
            if let Some(placeable) = EcmascriptChunkPlaceableVc::resolve_from(asset).await? {
                return Ok(ReferencedAssetVc::cell(ReferencedAsset::Some(placeable)));
            }
        }
        Ok(ReferencedAssetVc::cell(ReferencedAsset::None))
    }

    #[turbo_tasks::function]
    pub fn new(context: AssetContextVc, request: RequestVc, path: AstPathVc) -> Self {
        Self::cell(EsmAssetReference {
            context,
            request,
            path,
        })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for EsmAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        esm_resolve(self.request, self.context)
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "import {}",
            self.request.to_string().await?,
        )))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAssetReference for EsmAssetReference {
    #[turbo_tasks::function]
    fn is_chunkable(&self) -> BoolVc {
        BoolVc::cell(true)
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for EsmAssetReference {
    #[turbo_tasks::function]
    async fn code_generation(
        self_vc: EsmAssetReferenceVc,
        chunk_context: EcmascriptChunkContextVc,
        _context: ChunkingContextVc,
    ) -> Result<CodeGenerationVc> {
        let this = self_vc.await?;
        let mut visitors = Vec::new();

        if let ReferencedAsset::Some(asset) = &*self_vc.get_referenced_asset().await? {
            let ident = get_ident(*asset).await?;
            let id = chunk_context.id(*asset).await?;
            visitors.push(create_visitor!((&this.path.await?), visit_mut_module_item(module_item: &mut ModuleItem) {
                let stmt = quote!(
                    "var $name = __turbopack_import__($id);" as Stmt,
                    name = Ident::new(ident.clone().into(), DUMMY_SP),
                    id: Expr = Expr::Lit(match &*id {
                        ModuleId::String(s) => s.clone().into(),
                        ModuleId::Number(n) => (*n as f64).into(),
                    })
                );
                *module_item = ModuleItem::Stmt(stmt);
            }));
        } else {
            visitors.push(create_visitor!((&this.path.await?), visit_mut_module_item(module_item: &mut ModuleItem) {
                let stmt = quote!(";" as Stmt);
                *module_item = ModuleItem::Stmt(stmt);
            }));
        }

        Ok(CodeGeneration { visitors }.into())
    }
}

#[turbo_tasks::value(AssetReference, ChunkableAssetReference, AsyncLoadableReference)]
#[derive(Hash, Debug)]
pub struct EsmAsyncAssetReference {
    pub context: AssetContextVc,
    pub request: RequestVc,
    pub path: AstPathVc,
}

#[turbo_tasks::value_impl]
impl EsmAsyncAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(context: AssetContextVc, request: RequestVc, path: AstPathVc) -> Self {
        Self::cell(EsmAsyncAssetReference {
            context,
            request,
            path,
        })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for EsmAsyncAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        esm_resolve(self.request, self.context)
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "dynamic import {}",
            self.request.to_string().await?,
        )))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAssetReference for EsmAsyncAssetReference {
    #[turbo_tasks::function]
    fn is_chunkable(&self) -> BoolVc {
        BoolVc::cell(true)
    }
}

#[turbo_tasks::value_impl]
impl AsyncLoadableReference for EsmAsyncAssetReference {
    #[turbo_tasks::function]
    fn is_loaded_async(&self) -> BoolVc {
        BoolVc::cell(true)
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for EsmAsyncAssetReference {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        _chunk_context: EcmascriptChunkContextVc,
        _context: ChunkingContextVc,
    ) -> Result<CodeGenerationVc> {
        Ok(CodeGeneration { visitors: todo!() }.into())
    }
}

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

#[turbo_tasks::value(shared, CodeGenerateable)]
#[derive(Hash, Debug)]
pub struct EsmBinding {
    pub reference: EsmAssetReferenceVc,
    pub export: Option<String>,
    pub ast_path: AstPathVc,
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for EsmBinding {
    #[turbo_tasks::function]
    async fn code_generation(
        self_vc: EsmBindingVc,
        chunk_context: EcmascriptChunkContextVc,
        _context: ChunkingContextVc,
    ) -> Result<CodeGenerationVc> {
        let this = self_vc.await?;
        let mut visitors = Vec::new();
        let imported_module = this.reference.get_referenced_asset();

        fn make_expr(imported_module: Option<&str>, export: Option<&str>) -> Expr {
            if let Some(imported_module) = imported_module {
                if let Some(export) = export {
                    Expr::Member(MemberExpr {
                        span: DUMMY_SP,
                        obj: box Expr::Ident(Ident::new(imported_module.into(), DUMMY_SP)),
                        prop: MemberProp::Computed(ComputedPropName {
                            span: DUMMY_SP,
                            expr: box Expr::Lit(Lit::Str(Str {
                                span: DUMMY_SP,
                                value: export.into(),
                                raw: None,
                            })),
                        }),
                    })
                } else {
                    Expr::Ident(Ident::new(imported_module.into(), DUMMY_SP))
                }
            } else {
                Expr::Ident(Ident::new("undefined".into(), DUMMY_SP))
            }
        }

        let mut ast_path = this.ast_path.await?.clone();
        let imported_module =
            if let ReferencedAsset::Some(imported_module) = &*imported_module.await? {
                Some(get_ident(*imported_module).await?)
            } else {
                None
            };

        loop {
            match ast_path.last() {
                Some(swc_ecma_visit::AstParentKind::Expr(ExprField::Ident)) => {
                    ast_path.pop();
                    visitors.push(
                        create_visitor!(exact ast_path, visit_mut_expr(expr: &mut Expr) {
                            *expr = make_expr(imported_module.as_deref(), this.export.as_deref());
                        }),
                    );
                    break;
                }
                Some(swc_ecma_visit::AstParentKind::Prop(PropField::Shorthand)) => {
                    ast_path.pop();
                    visitors.push(
                        create_visitor!(ast_path, visit_mut_prop(prop: &mut Prop) {
                            if let Prop::Shorthand(ident) = prop {
                                *prop = Prop::KeyValue(KeyValueProp { key: PropName::Ident(ident.clone()), value: box make_expr(imported_module.as_deref(), this.export.as_deref())});
                            }
                        }),
                    );
                    break;
                }
                Some(_) => {
                    ast_path.pop();
                }
                None => break,
            }
        }

        Ok(CodeGeneration { visitors }.into())
    }
}
