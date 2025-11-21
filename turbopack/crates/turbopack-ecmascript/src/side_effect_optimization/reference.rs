use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{Ident, Lit},
    quote,
};
use turbo_rcstr::RcStr;
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
    ScopeHoistingContext,
    chunk::EcmascriptChunkPlaceable,
    code_gen::{CodeGeneration, CodeGenerationHoistedStmt},
    references::esm::base::{ReferencedAsset, ReferencedAssetIdent},
    runtime_functions::TURBOPACK_IMPORT,
    utils::module_id_to_lit,
};

#[derive(Debug, Clone, Eq, PartialEq, Hash, Serialize, Deserialize, NonLocalValue, TraceRawVcs)]
enum EcmascriptModulePartReferenceMode {
    Synthesize,
    Normal,
}

/// A reference to the [EcmascriptModuleLocalsModule] variant of an original
/// module.
#[turbo_tasks::value]
pub struct EcmascriptModulePartReference {
    module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    part: ModulePart,
    export_usage: ResolvedVc<ExportUsage>,
    mode: EcmascriptModulePartReferenceMode,
}

#[turbo_tasks::value_impl]
impl EcmascriptModulePartReference {
    // Create new [EcmascriptModuleFacadeModule]s as necessary
    #[turbo_tasks::function]
    pub fn new_part(
        module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
        part: ModulePart,
        export_usage: ResolvedVc<ExportUsage>,
    ) -> Vc<Self> {
        debug_assert!(matches!(
            part,
            ModulePart::Locals
                | ModulePart::Facade
                | ModulePart::RenamedExport { .. }
                | ModulePart::RenamedNamespace { .. }
        ));
        EcmascriptModulePartReference {
            module,
            part,
            export_usage,
            mode: EcmascriptModulePartReferenceMode::Synthesize,
        }
        .cell()
    }

    // A reference to the given module, without any intermediary synthesized modules.
    #[turbo_tasks::function]
    pub fn new_normal(
        module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
        part: ModulePart,
        export_usage: ResolvedVc<ExportUsage>,
    ) -> Vc<Self> {
        EcmascriptModulePartReference {
            module,
            part,
            export_usage,
            mode: EcmascriptModulePartReferenceMode::Normal,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptModulePartReference {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(self.part.to_string().into())
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for EcmascriptModulePartReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        let module = match self.mode {
            EcmascriptModulePartReferenceMode::Synthesize => {
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
                    ModulePart::Facade
                    | ModulePart::RenamedExport { .. }
                    | ModulePart::RenamedNamespace { .. } => Vc::upcast(
                        EcmascriptModuleFacadeModule::new(*self.module, self.part.clone()),
                    ),
                    _ => {
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
        *self.export_usage
    }
}

impl EcmascriptModulePartReference {
    pub async fn code_generation(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        scope_hoisting_context: ScopeHoistingContext<'_>,
    ) -> Result<CodeGeneration> {
        let this = self.await?;
        let referenced_asset = ReferencedAsset::from_resolve_result(self.resolve_reference());
        let referenced_asset = referenced_asset.await?;

        let ReferencedAsset::Some(module) = *referenced_asset else {
            bail!("part module reference should have an module reference");
        };

        let mut result = vec![];

        let merged_index = scope_hoisting_context.get_module_index(module);
        if let Some(merged_index) = merged_index {
            // Insert a placeholder to inline the merged module at the right place
            // relative to the other references (so to keep reference order).
            result.push(CodeGenerationHoistedStmt::new(
                format!("hoisted {merged_index}").into(),
                quote!(
                    "__turbopack_merged_esm__($id);" as Stmt,
                    id: Expr = Lit::Num(merged_index.into()).into(),
                ),
            ));
        }

        let export_usage = this.export_usage.await?;
        if merged_index.is_some() && matches!(*export_usage, ExportUsage::Evaluation) {
            // No need to import, the module was already executed and is available in the same scope
            // hoisting group (unless it's a namespace import)
        } else {
            let ident = referenced_asset
                .get_ident(
                    chunking_context,
                    match &*export_usage {
                        ExportUsage::Named(export) => Some(export.clone()),
                        ExportUsage::All | ExportUsage::Evaluation => None,
                    },
                    scope_hoisting_context,
                )
                .await?
                .context("part module reference should have an ident")?;

            match ident {
                ReferencedAssetIdent::LocalBinding { .. } => {
                    // no need to import
                }
                ReferencedAssetIdent::Module { .. } => {
                    let (sym, ctxt) = ident.into_module_namespace_ident().unwrap();
                    let key = sym.as_str().into();
                    let name = Ident::new(sym.into(), DUMMY_SP, ctxt.unwrap_or_default());

                    let id = module.chunk_item_id(chunking_context).await?;

                    result.push(CodeGenerationHoistedStmt::new(
                        key,
                        quote!(
                            "var $name = $turbopack_import($id);" as Stmt,
                            name = name,
                            turbopack_import: Expr = TURBOPACK_IMPORT.into(),
                            id: Expr = module_id_to_lit(&id),
                        ),
                    ));
                }
            }
        }

        Ok(CodeGeneration::hoisted_stmts(result))
    }
}
