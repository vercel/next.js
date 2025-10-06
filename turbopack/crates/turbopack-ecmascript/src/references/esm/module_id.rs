use anyhow::Result;
use serde::{Deserialize, Serialize};
use swc_core::quote;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    NonLocalValue, ResolvedVc, ValueToString, Vc, debug::ValueDebugFormat, trace::TraceRawVcs,
};
use turbopack_core::{
    chunk::{ChunkableModuleReference, ChunkingContext, ChunkingTypeOption, ModuleChunkItemIdExt},
    reference::ModuleReference,
    resolve::ModuleResolveResult,
};

use super::{EsmAssetReference, base::ReferencedAsset};
use crate::{
    code_gen::{CodeGen, CodeGeneration, IntoCodeGenReference},
    create_visitor,
    references::AstPath,
    utils::module_id_to_lit,
};

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct EsmModuleIdAssetReference {
    inner: ResolvedVc<EsmAssetReference>,
}

impl EsmModuleIdAssetReference {
    pub fn new(inner: ResolvedVc<EsmAssetReference>) -> Self {
        EsmModuleIdAssetReference { inner }
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

impl IntoCodeGenReference for EsmModuleIdAssetReference {
    fn into_code_gen_reference(
        self,
        path: AstPath,
    ) -> (ResolvedVc<Box<dyn ModuleReference>>, CodeGen) {
        let reference = self.resolved_cell();
        (
            ResolvedVc::upcast(reference),
            CodeGen::EsmModuleIdAssetReferenceCodeGen(EsmModuleIdAssetReferenceCodeGen {
                reference,
                path,
            }),
        )
    }
}

#[derive(PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat, NonLocalValue)]
pub struct EsmModuleIdAssetReferenceCodeGen {
    path: AstPath,
    reference: ResolvedVc<EsmModuleIdAssetReference>,
}

impl EsmModuleIdAssetReferenceCodeGen {
    pub async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let mut visitors = Vec::new();

        if let ReferencedAsset::Some(asset) =
            &*self.reference.await?.inner.get_referenced_asset().await?
        {
            let id = asset.chunk_item_id(chunking_context).await?;
            let id = module_id_to_lit(&id);
            visitors.push(create_visitor!(
                self.path,
                visit_mut_expr,
                |expr: &mut Expr| {
                    *expr = id.clone();
                }
            ));
        } else {
            // If the referenced asset can't be found, replace the expression with null.
            // This can happen if the referenced asset is an external, or doesn't resolve
            // to anything.
            visitors.push(create_visitor!(
                self.path,
                visit_mut_expr,
                |expr: &mut Expr| {
                    *expr = quote!("null" as Expr);
                }
            ));
        }

        Ok(CodeGeneration::visitors(visitors))
    }
}
