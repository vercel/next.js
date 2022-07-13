use anyhow::Result;
use swc_common::DUMMY_SP;
use swc_ecma_ast::{Expr, Ident};
use swc_ecma_quote::quote;
use swc_ecma_visit::{swc_ecma_ast::ModuleItem, AstParentKind, VisitMut};
use turbo_tasks::primitives::{BoolVc, StringVc};
use turbopack_core::{
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

fn path_to(path: &[AstParentKind], f: impl FnMut(&AstParentKind) -> bool) -> Vec<AstParentKind> {
    let index = path.len() - path.iter().rev().position(f).unwrap() - 1;
    path[..index].to_vec()
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for EsmAssetReference {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        chunk_context: EcmascriptChunkContextVc,
        _context: ChunkingContextVc,
    ) -> Result<CodeGenerationVc> {
        let assets = esm_resolve(self.request, self.context).primary_assets();
        let mut visitors = Vec::new();
        for asset in assets.await?.iter() {
            if let Some(placeable) = EcmascriptChunkPlaceableVc::resolve_from(asset).await? {
                let id = chunk_context.id(placeable).await?;
                let path = asset.path().to_string().await?;

                visitors.push(create_visitor!((&self.path.await?), visit_mut_module_item(module_item: &mut ModuleItem) {
                    let stmt = quote!(
                        "var $name = __turbopack_import__($id);" as Stmt,
                        name = Ident::new(
                            magic_identifier::encode(&format!("imported module {}", path))
                                .into(),
                            DUMMY_SP
                        ),
                        id: Expr = Expr::Lit(match &*id {
                            ModuleId::String(s) => s.clone().into(),
                            ModuleId::Number(n) => (*n as f64).into(),
                        })
                    );
                    *module_item = ModuleItem::Stmt(stmt);
                }));
            }
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

#[turbo_tasks::value(CodeGenerateable)]
#[derive(Hash, Debug)]
pub struct EsmExport {
    pub name: Option<String>,
    pub path: AstPathVc,
}

#[turbo_tasks::value_impl]
impl EsmExportVc {
    #[turbo_tasks::function]
    pub fn new_default(path: AstPathVc) -> Self {
        Self::cell(EsmExport { name: None, path })
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
                let stmt = quote!(";" as Stmt);
                *module_item = ModuleItem::Stmt(stmt);
            }),
        );

        Ok(CodeGeneration { visitors }.into())
    }
}
