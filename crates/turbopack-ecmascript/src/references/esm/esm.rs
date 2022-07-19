use anyhow::Result;
use swc_common::DUMMY_SP;
use swc_ecma_ast::{Expr, Ident, ModuleItem};
use swc_ecma_quote::quote;
use turbo_tasks::primitives::{BoolVc, StringVc};
use turbopack_core::{
    asset::Asset,
    chunk::{ChunkableAssetReference, ChunkableAssetReferenceVc, ChunkingContextVc, ModuleId},
    context::AssetContextVc,
    reference::{AssetReference, AssetReferenceVc},
    resolve::{parse::RequestVc, ResolveResultVc},
};

use crate::{
    chunk::{EcmascriptChunkContextVc, EcmascriptChunkPlaceableVc},
    code_gen::{CodeGenerateable, CodeGenerateableVc, CodeGeneration, CodeGenerationVc},
    create_visitor, magic_identifier,
    references::AstPathVc,
    resolve::esm_resolve,
};

#[turbo_tasks::value]
pub enum ReferencedAsset {
    Some(EcmascriptChunkPlaceableVc),
    None,
}

pub(super) async fn get_ident(asset: EcmascriptChunkPlaceableVc) -> Result<String> {
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
    pub(super) async fn get_referenced_asset(self) -> Result<ReferencedAssetVc> {
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
