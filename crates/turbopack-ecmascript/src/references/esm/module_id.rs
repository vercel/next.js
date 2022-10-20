use anyhow::Result;
use swc_core::ecma::ast::Expr;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbopack_core::{
    chunk::{
        ChunkableAssetReference, ChunkableAssetReferenceVc, ChunkingContextVc,
        ChunkingTypeOptionVc, ModuleId,
    },
    reference::{AssetReference, AssetReferenceVc},
    resolve::ResolveResultVc,
};

use super::{base::ReferencedAsset, EsmAssetReferenceVc};
use crate::{
    code_gen::{CodeGenerateable, CodeGenerateableVc, CodeGeneration, CodeGenerationVc},
    create_visitor,
    references::AstPathVc,
};

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct EsmModuleIdAssetReference {
    inner: EsmAssetReferenceVc,
    ast_path: AstPathVc,
}

#[turbo_tasks::value_impl]
impl EsmModuleIdAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(inner: EsmAssetReferenceVc, ast_path: AstPathVc) -> Self {
        Self::cell(EsmModuleIdAssetReference { inner, ast_path })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for EsmModuleIdAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        self.inner.resolve_reference()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EsmModuleIdAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "module id of {}",
            self.inner.to_string().await?,
        )))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAssetReference for EsmModuleIdAssetReference {
    #[turbo_tasks::function]
    fn chunking_type(&self, context: ChunkingContextVc) -> ChunkingTypeOptionVc {
        self.inner.chunking_type(context)
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for EsmModuleIdAssetReference {
    #[turbo_tasks::function]
    async fn code_generation(&self, context: ChunkingContextVc) -> Result<CodeGenerationVc> {
        let mut visitors = Vec::new();

        if let ReferencedAsset::Some(asset) = &*self.inner.get_referenced_asset().await? {
            let id = asset.as_chunk_item(context).id().await?;
            visitors.push(
                create_visitor!(self.ast_path.await?, visit_mut_expr(expr: &mut Expr) {
                    *expr = Expr::Lit(match &*id {
                        ModuleId::String(s) => s.clone().into(),
                        ModuleId::Number(n) => (*n as f64).into(),
                    })
                }),
            );
        }

        Ok(CodeGeneration { visitors }.into())
    }
}
