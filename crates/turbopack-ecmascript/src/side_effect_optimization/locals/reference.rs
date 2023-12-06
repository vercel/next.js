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

use super::module::EcmascriptModuleLocalsModule;
use crate::{
    chunk::EcmascriptChunkingContext,
    code_gen::{CodeGenerateable, CodeGeneration},
    create_visitor,
    references::esm::base::{insert_hoisted_stmt, ReferencedAsset},
    EcmascriptModuleAsset,
};

/// A reference to the [EcmascriptModuleLocalsModule] variant of an original
/// [EcmascriptModuleAsset].
#[turbo_tasks::value]
pub struct EcmascriptModuleLocalsReference {
    pub module: Vc<EcmascriptModuleAsset>,
}

#[turbo_tasks::value_impl]
impl EcmascriptModuleLocalsReference {
    #[turbo_tasks::function]
    pub fn new(module: Vc<EcmascriptModuleAsset>) -> Vc<Self> {
        EcmascriptModuleLocalsReference { module }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptModuleLocalsReference {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<String> {
        Vc::cell("locals".to_string())
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for EcmascriptModuleLocalsReference {
    #[turbo_tasks::function]
    async fn resolve_reference(self: Vc<Self>) -> Result<Vc<ModuleResolveResult>> {
        let locals_module = EcmascriptModuleLocalsModule::new(self.await?.module);
        Ok(ModuleResolveResult::module(Vc::upcast(locals_module)).cell())
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for EcmascriptModuleLocalsReference {}

#[turbo_tasks::value_impl]
impl CodeGenerateable for EcmascriptModuleLocalsReference {
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
            .context("locals module reference should have an ident")?;

        let ReferencedAsset::Some(module) = *referenced_asset else {
            bail!("locals module reference should have an module reference");
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
