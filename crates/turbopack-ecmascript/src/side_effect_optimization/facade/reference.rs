use anyhow::{bail, Context, Result};
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{Expr, Ident},
    quote,
};
use turbo_tasks::{ValueToString, Vc};
use turbopack_core::{
    chunk::{ChunkItemExt, ChunkableModule, ChunkableModuleReference, ModuleId},
    reference::ModuleReference,
    resolve::ModuleResolveResult,
};

use super::module::{EcmascriptModuleFacadeModule, FacadeType};
use crate::{
    chunk::EcmascriptChunkingContext,
    code_gen::{CodeGenerateable, CodeGeneration},
    create_visitor,
    references::esm::base::{insert_hoisted_stmt, ReferencedAsset},
    EcmascriptModuleAsset,
};

/// A reference to the [EcmascriptModuleFacadeModule] variant of an original
/// [EcmascriptModuleAsset].
#[turbo_tasks::value]
pub struct EcmascriptModuleFacadeReference {
    pub module: Vc<EcmascriptModuleAsset>,
    pub ty: FacadeType,
}

#[turbo_tasks::value_impl]
impl EcmascriptModuleFacadeReference {
    #[turbo_tasks::function]
    pub fn new(module: Vc<EcmascriptModuleAsset>, ty: FacadeType) -> Vc<Self> {
        EcmascriptModuleFacadeReference { module, ty }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptModuleFacadeReference {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<String> {
        Vc::cell(
            match self.ty {
                FacadeType::Evaluation => "evaluation",
                FacadeType::Reexports => "reexports",
                FacadeType::Complete => "complete",
            }
            .to_string(),
        )
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for EcmascriptModuleFacadeReference {
    #[turbo_tasks::function]
    async fn resolve_reference(self: Vc<Self>) -> Result<Vc<ModuleResolveResult>> {
        let this = self.await?;
        let facade_module = EcmascriptModuleFacadeModule::new(this.module, this.ty);
        Ok(ModuleResolveResult::module(Vc::upcast(facade_module)).cell())
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for EcmascriptModuleFacadeReference {}

#[turbo_tasks::value_impl]
impl CodeGenerateable for EcmascriptModuleFacadeReference {
    #[turbo_tasks::function]
    async fn code_generation(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
    ) -> Result<Vc<CodeGeneration>> {
        let mut visitors = Vec::new();

        let referenced_asset = ReferencedAsset::from_resolve_result(self.resolve_reference());
        let referenced_asset = referenced_asset.await?;
        let ident = referenced_asset
            .get_ident()
            .await?
            .context("facade module reference should have an ident")?;

        let ReferencedAsset::Some(module) = *referenced_asset else {
            bail!("facade module reference should have an module reference");
        };
        let id = module
            .as_chunk_item(Vc::upcast(chunking_context))
            .id()
            .await?;

        visitors.push(create_visitor!(visit_mut_program(program: &mut Program) {
            let stmt = quote!(
                "var $name = __turbopack_import__($id);" as Stmt,
                name = Ident::new(ident.clone().into(), DUMMY_SP),
                id: Expr = Expr::Lit(match &*id {
                    ModuleId::String(s) => s.clone().into(),
                    ModuleId::Number(n) => (*n as f64).into(),
                })
            );
            insert_hoisted_stmt(program, stmt);
        }));

        Ok(CodeGeneration { visitors }.into())
    }
}
