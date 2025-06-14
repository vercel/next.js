use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{Ident, Lit},
    quote,
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{NonLocalValue, ResolvedVc, ValueToString, Vc, trace::TraceRawVcs};
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
    ScopeHoistingContext, chunk::EcmascriptChunkPlaceable, code_gen::CodeGeneration,
    references::esm::base::ReferencedAsset, runtime_functions::TURBOPACK_IMPORT,
    utils::module_id_to_lit,
};

#[derive(Debug, Clone, Eq, PartialEq, Hash, Serialize, Deserialize, NonLocalValue, TraceRawVcs)]
enum EcmascriptModulePartReferenceMode {
    Synthesize { remove_unused_exports: bool },
    Normal,
}

/// A reference to the [EcmascriptModuleLocalsModule] variant of an original
/// module.
#[turbo_tasks::value]
pub struct EcmascriptModulePartReference {
    module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    part: ModulePart,
    mode: EcmascriptModulePartReferenceMode,
}

#[turbo_tasks::value_impl]
impl EcmascriptModulePartReference {
    // Create new [EcmascriptModuleFacadeModule]s as necessary
    #[turbo_tasks::function]
    pub fn new_part(
        module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
        part: ModulePart,
        remove_unused_exports: bool,
    ) -> Vc<Self> {
        EcmascriptModulePartReference {
            module,
            part,
            mode: EcmascriptModulePartReferenceMode::Synthesize {
                remove_unused_exports,
            },
        }
        .cell()
    }

    // A reference to the given module, without any intermediary synthesized modules.
    #[turbo_tasks::function]
    pub fn new_normal(
        module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
        part: ModulePart,
    ) -> Vc<Self> {
        EcmascriptModulePartReference {
            module,
            part,
            mode: EcmascriptModulePartReferenceMode::Normal,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptModulePartReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(self.part.to_string().into())
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for EcmascriptModulePartReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        let module = match self.mode {
            EcmascriptModulePartReferenceMode::Synthesize {
                remove_unused_exports,
            } => {
                match &self.part {
                    ModulePart::Locals => {
                        let Some(module) = ResolvedVc::try_downcast_type(self.module) else {
                            bail!(
                                "Expected EcmascriptModuleAsset for a \
                                 EcmascriptModulePartReference with ModulePart::Locals"
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
                            self.part.clone(),
                            remove_unused_exports,
                        ))
                    }
                    ModulePart::Export(..) | ModulePart::Internal(..) => {
                        bail!(
                            "Unexpected ModulePart \"{}\" for EcmascriptModulePartReference",
                            self.part
                        );
                    }
                }
                .to_resolved()
                .await?
            }
            EcmascriptModulePartReferenceMode::Normal => ResolvedVc::upcast(self.module),
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
            ModulePart::Export(export) => ExportUsage::named(export.clone()),
            ModulePart::RenamedExport {
                original_export, ..
            } => ExportUsage::named(original_export.clone()),
            ModulePart::Evaluation => ExportUsage::evaluation(),
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
            .get_ident(chunking_context, None, ScopeHoistingContext::None)
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
