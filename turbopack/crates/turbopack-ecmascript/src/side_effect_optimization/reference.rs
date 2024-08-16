use anyhow::{bail, Context, Result};
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{Expr, Ident},
    quote,
};
use turbo_tasks::{RcStr, ValueToString, Vc};
use turbopack_core::{
    chunk::{
        ChunkItemExt, ChunkableModule, ChunkableModuleReference, ChunkingContext, ChunkingType,
        ChunkingTypeOption, ModuleId,
    },
    reference::ModuleReference,
    resolve::{ModulePart, ModuleResolveResult},
};

use super::{
    facade::module::EcmascriptModuleFacadeModule, locals::module::EcmascriptModuleLocalsModule,
};
use crate::{
    chunk::EcmascriptChunkPlaceable,
    code_gen::{CodeGenerateable, CodeGeneration},
    create_visitor,
    references::esm::base::{insert_hoisted_stmt, ReferencedAsset},
};

/// A reference to the [EcmascriptModuleLocalsModule] variant of an original
/// module.
#[turbo_tasks::value]
pub struct EcmascriptModulePartReference {
    pub module: Vc<Box<dyn EcmascriptChunkPlaceable>>,
    pub part: Option<Vc<ModulePart>>,
}

#[turbo_tasks::value_impl]
impl EcmascriptModulePartReference {
    #[turbo_tasks::function]
    pub fn new_part(
        module: Vc<Box<dyn EcmascriptChunkPlaceable>>,
        part: Vc<ModulePart>,
    ) -> Vc<Self> {
        EcmascriptModulePartReference {
            module,
            part: Some(part),
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub fn new(module: Vc<Box<dyn EcmascriptChunkPlaceable>>) -> Vc<Self> {
        EcmascriptModulePartReference { module, part: None }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptModulePartReference {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        self.part
            .map_or_else(|| Vc::cell("module".into()), |part| part.to_string())
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for EcmascriptModulePartReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        let module = if let Some(part) = self.part {
            match *part.await? {
                ModulePart::Locals => {
                    let Some(module) = Vc::try_resolve_downcast_type(self.module).await? else {
                        bail!(
                            "Expected EcmascriptModuleAsset for a EcmascriptModulePartReference \
                             with ModulePart::Locals"
                        );
                    };
                    Vc::upcast(EcmascriptModuleLocalsModule::new(module))
                }
                ModulePart::Exports
                | ModulePart::Evaluation
                | ModulePart::Facade
                | ModulePart::RenamedExport { .. }
                | ModulePart::RenamedNamespace { .. } => {
                    Vc::upcast(EcmascriptModuleFacadeModule::new(self.module, part))
                }
                ModulePart::Export(..) | ModulePart::Internal(..) => {
                    bail!(
                        "Unexpected ModulePart {} for EcmascriptModulePartReference",
                        part.to_string().await?
                    );
                }
            }
        } else {
            Vc::upcast(self.module)
        };
        Ok(ModuleResolveResult::module(module).cell())
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for EcmascriptModulePartReference {
    #[turbo_tasks::function]
    fn chunking_type(self: Vc<Self>) -> Vc<ChunkingTypeOption> {
        Vc::cell(Some(ChunkingType::ParallelInheritAsync))
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for EcmascriptModulePartReference {
    #[turbo_tasks::function]
    async fn code_generation(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<CodeGeneration>> {
        let mut visitors = Vec::new();

        let referenced_asset = ReferencedAsset::from_resolve_result(self.resolve_reference());
        let referenced_asset = referenced_asset.await?;
        let ident = referenced_asset
            .get_ident()
            .await?
            .context("part module reference should have an ident")?;

        let ReferencedAsset::Some(module) = *referenced_asset else {
            bail!("part module reference should have an module reference");
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
                    ModuleId::String(s) => s.as_str().into(),
                    ModuleId::Number(n) => (*n as f64).into(),
                })
            );
            insert_hoisted_stmt(program, stmt);
        }));

        Ok(CodeGeneration { visitors }.into())
    }
}
