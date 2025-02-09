use anyhow::{bail, Context, Result};
use swc_core::{common::DUMMY_SP, ecma::ast::Ident, quote};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbopack_core::{
    chunk::{
        ChunkItemExt, ChunkableModule, ChunkableModuleReference, ChunkingContext, ChunkingType,
        ChunkingTypeOption,
    },
    module::Module,
    module_graph::ModuleGraph,
    reference::ModuleReference,
    resolve::{ModulePart, ModuleResolveResult},
};

use super::{
    facade::module::EcmascriptModuleFacadeModule, locals::module::EcmascriptModuleLocalsModule,
};
use crate::{
    chunk::EcmascriptChunkPlaceable,
    code_gen::{CodeGenerateable, CodeGeneration},
    references::esm::base::ReferencedAsset,
    runtime_functions::TURBOPACK_IMPORT,
    utils::module_id_to_lit,
};

/// A reference to the [EcmascriptModuleLocalsModule] variant of an original
/// module.
#[turbo_tasks::value]
pub struct EcmascriptModulePartReference {
    pub module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    pub part: Option<ModulePart>,
}

#[turbo_tasks::value_impl]
impl EcmascriptModulePartReference {
    #[turbo_tasks::function]
    pub fn new_part(
        module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
        part: ModulePart,
    ) -> Vc<Self> {
        EcmascriptModulePartReference {
            module,
            part: Some(part),
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub fn new(module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>) -> Vc<Self> {
        EcmascriptModulePartReference { module, part: None }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptModulePartReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(match &self.part {
            Some(part) => Vc::cell(part.to_string().into()),
            None => Vc::cell("module".into()),
        })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for EcmascriptModulePartReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        let module = if let Some(part) = &self.part {
            match part {
                ModulePart::Locals => {
                    let Some(module) = ResolvedVc::try_downcast_type(self.module) else {
                        bail!(
                            "Expected EcmascriptModuleAsset for a EcmascriptModulePartReference \
                             with ModulePart::Locals"
                        );
                    };
                    Vc::upcast::<Box<dyn Module>>(EcmascriptModuleLocalsModule::new(*module))
                }
                ModulePart::Exports
                | ModulePart::Evaluation
                | ModulePart::Facade
                | ModulePart::RenamedExport { .. }
                | ModulePart::RenamedNamespace { .. } => Vc::upcast(
                    EcmascriptModuleFacadeModule::new(*self.module, part.clone()),
                ),
                ModulePart::Export(..)
                | ModulePart::Internal(..)
                | ModulePart::InternalEvaluation(..) => {
                    bail!(
                        "Unexpected ModulePart \"{}\" for EcmascriptModulePartReference",
                        part
                    );
                }
            }
            .to_resolved()
            .await?
        } else {
            ResolvedVc::upcast(self.module)
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
        module_graph: Vc<ModuleGraph>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<CodeGeneration>> {
        let referenced_asset = ReferencedAsset::from_resolve_result(self.resolve_reference());
        let referenced_asset = referenced_asset.await?;
        let ident = referenced_asset
            .get_ident(module_graph, chunking_context)
            .await?
            .context("part module reference should have an ident")?;

        let ReferencedAsset::Some(module) = *referenced_asset else {
            bail!("part module reference should have an module reference");
        };
        let id = module
            .as_chunk_item(module_graph, Vc::upcast(chunking_context))
            .id()
            .await?;

        Ok(CodeGeneration::hoisted_stmt(
            ident.clone().into(),
            quote!(
                "var $name = $turbopack_import($id);" as Stmt,
                name = Ident::new(ident.clone().into(), DUMMY_SP, Default::default()),
                turbopack_import: Expr = TURBOPACK_IMPORT.into(),
                id: Expr = module_id_to_lit(&id),
            ),
        )
        .cell())
    }
}
