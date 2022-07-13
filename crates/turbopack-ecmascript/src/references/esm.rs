use std::sync::Arc;

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
    code_gen::{
        CodeGeneration, CodeGenerationReference, CodeGenerationReferenceVc, CodeGenerationVc,
        VisitorFactory,
    },
    magic_identifier,
    resolve::esm_resolve,
};

#[turbo_tasks::value(AssetReference, ChunkableAssetReference, CodeGenerationReference)]
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
impl CodeGenerationReference for EsmAssetReference {
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
                let id = chunk_context.id(placeable).await?.into_arc();
                let path = asset.path().to_string().await?;

                struct EsmAssetReferenceVistor {
                    id: Arc<ModuleId>,
                    path: String,
                }

                impl VisitorFactory for Box<EsmAssetReferenceVistor> {
                    fn create<'a>(&'a self) -> Box<dyn VisitMut + Send + Sync + 'a> {
                        box &**self
                    }
                }

                impl<'a> VisitMut for &'a EsmAssetReferenceVistor {
                    fn visit_mut_module_item(&mut self, module_item: &mut ModuleItem) {
                        // TODO use id to generation `__turbopack_import__(id)`
                        let stmt = quote!(
                            "var $name = __turbopack_import__($id);" as Stmt,
                            name = Ident::new(
                                magic_identifier::encode(&format!("imported module {}", self.path))
                                    .into(),
                                DUMMY_SP
                            ),
                            id: Expr = Expr::Lit(match &*self.id {
                                ModuleId::String(s) => s.clone().into(),
                                ModuleId::Number(n) => (*n as f64).into(),
                            })
                        );
                        *module_item = ModuleItem::Stmt(stmt);
                    }
                }

                visitors.push((
                    path_to(&self.path.await?, |n| {
                        matches!(n, AstParentKind::ModuleItem(_))
                    }),
                    box box EsmAssetReferenceVistor {
                        id,
                        path: path.clone(),
                    } as Box<dyn VisitorFactory>,
                ))
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
    pub span: AstPathVc,
}

#[turbo_tasks::value_impl]
impl EsmAsyncAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(context: AssetContextVc, request: RequestVc, span: AstPathVc) -> Self {
        Self::cell(EsmAsyncAssetReference {
            context,
            request,
            span,
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
impl CodeGenerationReference for EsmAsyncAssetReference {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        _chunk_context: EcmascriptChunkContextVc,
        _context: ChunkingContextVc,
    ) -> Result<CodeGenerationVc> {
        Ok(CodeGeneration { visitors: todo!() }.into())
    }
}
