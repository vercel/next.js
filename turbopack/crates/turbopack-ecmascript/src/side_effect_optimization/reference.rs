use anyhow::{Context, Result, bail};
use swc_core::{common::DUMMY_SP, quote};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbopack_core::{
    chunk::{
        ChunkableModuleReference, ChunkingContext, ChunkingType, ChunkingTypeOption,
        ModuleChunkItemIdExt,
    },
    module::Module,
    reference::ModuleReference,
    resolve::{ExportUsage, ModulePart, ModuleResolveResult},
};

use super::{
    facade::module::EcmascriptModuleFacadeModule, locals::module::EcmascriptModuleLocalsModule,
};
use crate::{
    chunk::EcmascriptChunkPlaceable, code_gen::CodeGeneration,
    references::esm::base::ReferencedAsset, runtime_functions::TURBOPACK_IMPORT,
    utils::module_id_to_lit,
};

/// A reference to the [EcmascriptModuleLocalsModule] variant of an original
/// module.
#[turbo_tasks::value]
pub struct EcmascriptModulePartReference {
    pub module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    pub part: Option<ModulePart>,
    pub remove_unused_exports: bool,
}

#[turbo_tasks::value_impl]
impl EcmascriptModulePartReference {
    #[turbo_tasks::function]
    pub fn new_part(
        module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
        part: ModulePart,
        remove_unused_exports: bool,
    ) -> Vc<Self> {
        EcmascriptModulePartReference {
            module,
            part: Some(part),
            remove_unused_exports,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub fn new(
        module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
        remove_unused_exports: bool,
    ) -> Vc<Self> {
        EcmascriptModulePartReference {
            module,
            part: None,
            remove_unused_exports,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptModulePartReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(match &self.part {
            Some(part) => Vc::cell(part.to_string().into()),
            None => Vc::cell(rcstr!("module")),
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
                | ModulePart::RenamedNamespace { .. } => {
                    Vc::upcast(EcmascriptModuleFacadeModule::new(
                        *self.module,
                        part.clone(),
                        self.remove_unused_exports,
                    ))
                }
                ModulePart::Export(..) | ModulePart::Internal(..) => {
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

        Ok(*ModuleResolveResult::module(module))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for EcmascriptModulePartReference {
    #[turbo_tasks::function]
    fn chunking_type(self: Vc<Self>) -> Vc<ChunkingTypeOption> {
        Vc::cell(Some(ChunkingType::Parallel {
            inherit_async: true,
            hoisted: true,
        }))
    }

    #[turbo_tasks::function]
    fn export_usage(&self) -> Vc<ExportUsage> {
        match &self.part {
            Some(ModulePart::Export(export)) => ExportUsage::named(export.clone()),
            Some(ModulePart::Evaluation) => ExportUsage::evaluation(),
            _ => ExportUsage::all(),
        }
    }
}

impl EcmascriptModulePartReference {
    pub async fn code_generation(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let referenced_asset = ReferencedAsset::from_resolve_result(self.resolve_reference());
        let referenced_asset = referenced_asset.await?;
        let ident = referenced_asset
            .get_ident(chunking_context, None, None)
            .await?
            .context("part module reference should have an ident")?
            .as_expr_individual(DUMMY_SP)
            .unwrap_left();

        let ReferencedAsset::Some(module) = *referenced_asset else {
            bail!("part module reference should have an module reference");
        };
        let id = module.chunk_item_id(Vc::upcast(chunking_context)).await?;

        Ok(CodeGeneration::hoisted_stmt(
            ident.sym.as_str().into(),
            quote!(
                "var $name = $turbopack_import($id);" as Stmt,
                name = ident,
                turbopack_import: Expr = TURBOPACK_IMPORT.into(),
                id: Expr = module_id_to_lit(&id),
            ),
        ))
    }
}
