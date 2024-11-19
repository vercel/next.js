use anyhow::Result;
use swc_core::quote;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbopack_core::{
    chunk::{
        ChunkItemExt, ChunkableModule, ChunkableModuleReference, ChunkingContext,
        ChunkingTypeOption,
    },
    reference::ModuleReference,
    resolve::ModuleResolveResult,
};

use super::{base::ReferencedAsset, EsmAssetReference};
use crate::{
    code_gen::{CodeGenerateable, CodeGeneration},
    create_visitor,
    references::AstPath,
    utils::module_id_to_lit,
};

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct EsmModuleIdAssetReference {
    inner: ResolvedVc<EsmAssetReference>,
    ast_path: ResolvedVc<AstPath>,
}

#[turbo_tasks::value_impl]
impl EsmModuleIdAssetReference {
    #[turbo_tasks::function]
    pub fn new(inner: ResolvedVc<EsmAssetReference>, ast_path: ResolvedVc<AstPath>) -> Vc<Self> {
        Self::cell(EsmModuleIdAssetReference { inner, ast_path })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for EsmModuleIdAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        self.inner.resolve_reference()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EsmModuleIdAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("module id of {}", self.inner.to_string().await?,).into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for EsmModuleIdAssetReference {
    #[turbo_tasks::function]
    fn chunking_type(&self) -> Vc<ChunkingTypeOption> {
        self.inner.chunking_type()
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for EsmModuleIdAssetReference {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<CodeGeneration>> {
        let mut visitors = Vec::new();

        if let ReferencedAsset::Some(asset) = &*self.inner.get_referenced_asset().await? {
            let id = asset
                .as_chunk_item(Vc::upcast(chunking_context))
                .id()
                .await?;
            let id = module_id_to_lit(&id);
            visitors.push(
                create_visitor!(self.ast_path.await?, visit_mut_expr(expr: &mut Expr) {
                    *expr = id.clone()
                }),
            );
        } else {
            // If the referenced asset can't be found, replace the expression with null.
            // This can happen if the referenced asset is an external, or doesn't resolve
            // to anything.
            visitors.push(
                create_visitor!(self.ast_path.await?, visit_mut_expr(expr: &mut Expr) {
                    *expr = quote!("null" as Expr);
                }),
            );
        }

        Ok(CodeGeneration::visitors(visitors))
    }
}
