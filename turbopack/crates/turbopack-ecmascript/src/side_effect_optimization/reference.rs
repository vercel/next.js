use anyhow::{Context, Result, bail};
use bincode::{Decode, Encode};
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{Ident, Lit},
    quote,
};
use turbo_tasks::{NonLocalValue, ResolvedVc, ValueToString, Vc, trace::TraceRawVcs};
use turbopack_core::{
    chunk::{ChunkingContext, ChunkingType, ModuleChunkItemIdExt},
    module::Module,
    reference::ModuleReference,
    resolve::{BindingUsage, ExportUsage, ImportUsage, ModulePart, ModuleResolveResult},
};

use crate::{
    ScopeHoistingContext,
    chunk::EcmascriptChunkPlaceable,
    code_gen::{CodeGeneration, CodeGenerationHoistedStmt},
    references::esm::base::{ReferencedAsset, ReferencedAssetIdent},
    rename::module::EcmascriptModuleRenameModule,
    runtime_functions::TURBOPACK_IMPORT,
    side_effect_optimization::{
        facade::module::EcmascriptModuleFacadeModule, locals::module::EcmascriptModuleLocalsModule,
    },
    utils::module_id_to_lit,
};

#[derive(Debug, Clone, Eq, PartialEq, Hash, NonLocalValue, TraceRawVcs, Encode, Decode)]
enum EcmascriptModulePartReferenceMode {
    Synthesize,
    Normal,
}

/// A reference to the [EcmascriptModuleLocalsModule] variant of an original
/// module.
#[turbo_tasks::value]
#[derive(ValueToString)]
#[value_to_string(self.part)]
pub struct EcmascriptModulePartReference {
    module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    part: ModulePart,
    export_usage: ExportUsage,
    mode: EcmascriptModulePartReferenceMode,
}

#[turbo_tasks::value_impl]
impl EcmascriptModulePartReference {
    // Create new [EcmascriptModuleFacadeModule]s as necessary
    #[turbo_tasks::function]
    pub async fn new_part(
        module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
        part: ModulePart,
        export_usage: Vc<ExportUsage>,
    ) -> Result<Vc<Self>> {
        debug_assert!(matches!(
            part,
            ModulePart::Locals
                | ModulePart::Facade
                | ModulePart::RenamedExport { .. }
                | ModulePart::RenamedNamespace { .. }
        ));
        Ok(EcmascriptModulePartReference {
            module,
            part,
            export_usage: export_usage.owned().await?,
            mode: EcmascriptModulePartReferenceMode::Synthesize,
        }
        .cell())
    }

    // A reference to the given module, without any intermediary synthesized modules.
    #[turbo_tasks::function]
    pub async fn new_normal(
        module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
        part: ModulePart,
        export_usage: Vc<ExportUsage>,
    ) -> Result<Vc<Self>> {
        Ok(EcmascriptModulePartReference {
            module,
            part,
            export_usage: export_usage.owned().await?,
            mode: EcmascriptModulePartReferenceMode::Normal,
        }
        .cell())
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
                    ModulePart::Facade => {
                        Vc::upcast(EcmascriptModuleFacadeModule::new(*self.module))
                    }
                    ModulePart::RenamedExport { .. } | ModulePart::RenamedNamespace { .. } => {
                        Vc::upcast(EcmascriptModuleRenameModule::new(
                            *self.module,
                            self.part.clone(),
                        ))
                    }
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

    fn chunking_type(&self) -> Option<ChunkingType> {
        Some(ChunkingType::Parallel {
            inherit_async: true,
            hoisted: true,
        })
    }

    fn binding_usage(&self) -> BindingUsage {
        BindingUsage {
            // A synthesized named facade -> locals edge implements the facade export of the same
            // name. It is only needed when that facade export is used; telling the graph this lets
            // it propagate the facade's per-name usage into locals instead of keeping every local
            // export alive. Normal (non-synthesized) references and structural evaluation edges
            // are top-level dependencies.
            import: match (&self.mode, &self.export_usage) {
                (EcmascriptModulePartReferenceMode::Synthesize, ExportUsage::Named(export)) => {
                    ImportUsage::Exports(std::iter::once(export.clone()).collect())
                }
                _ => ImportUsage::TopLevel,
            },
            export: self.export_usage.clone(),
        }
    }
}

impl EcmascriptModulePartReference {
    pub async fn code_generation(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        scope_hoisting_context: ScopeHoistingContext<'_>,
    ) -> Result<CodeGeneration> {
        let this = self.await?;

        // Mirrors the same check in `EsmAssetReference::code_generation`. The module graph's
        // usage-pruning pass can decide this reference is unused (an `Evaluation` edge to a
        // side-effect-free target — see `BindingUsageInfo::add`) and skip traversing through it,
        // which can drop the target from the chunk entirely. Emitting the import unconditionally
        // here would then reference a module that was never chunked, so this has to agree with
        // that decision rather than assume the target is always present.
        if chunking_context
            .unused_references()
            .contains_key(&ResolvedVc::upcast(self.to_resolved().await?))
            .await?
        {
            return Ok(CodeGeneration::empty());
        }

        let referenced_asset = ReferencedAsset::from_resolve_result(self.resolve_reference());
        let referenced_asset = referenced_asset.await?;

        let ReferencedAsset::Some(module) = referenced_asset else {
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

        let export_usage = &this.export_usage;
        if merged_index.is_some() && matches!(export_usage, ExportUsage::Evaluation) {
            // No need to import, the module was already executed and is available in the same scope
            // hoisting group (unless it's a namespace import)
        } else {
            let ident = referenced_asset
                .get_ident(
                    chunking_context,
                    match export_usage {
                        ExportUsage::Named(export) => Some(export.clone()),
                        ExportUsage::PartialNamespaceObject(_)
                        | ExportUsage::All
                        | ExportUsage::Evaluation => None,
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
