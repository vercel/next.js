use anyhow::{Result, bail};
use bincode::{Decode, Encode};
use turbo_tasks::{ResolvedVc, Vc, trace::TraceRawVcs};
use turbopack_core::resolve::ModulePart;

use crate::{
    EcmascriptModuleAsset,
    chunk::{EcmascriptChunkPlaceable, placeable::SideEffectsDeclaration},
    module_fragments::{
        part::module::{
            EcmascriptModulePartAsset, FollowExportsWithSideEffectsResult,
            follow_reexports_with_side_effects, side_effects_declaration_for_reexport,
        },
        side_effects::module::SideEffectsModule,
    },
    references::{FollowExportsResult, esm::FoundExportType, follow_reexports},
    rename::module::EcmascriptModuleRenameModule,
    side_effect_optimization::{
        facade::module::EcmascriptModuleFacadeModule, locals::module::EcmascriptModuleLocalsModule,
    },
};

#[turbo_tasks::task_input]
#[derive(Clone, Debug, Hash, PartialEq, Eq, TraceRawVcs, Encode, Decode)]
pub enum EcmascriptModuleCanonicalization {
    None,
    ModuleFragments(ModulePart),
    FollowReexports(Option<ModulePart>),
}

#[turbo_tasks::function]
pub async fn canonicalize_ecmascript_module(
    module: ResolvedVc<EcmascriptModuleAsset>,
    canonicalization: EcmascriptModuleCanonicalization,
) -> Result<Vc<Box<dyn EcmascriptChunkPlaceable>>> {
    Ok(match canonicalization {
        EcmascriptModuleCanonicalization::None => Vc::upcast(*module),
        EcmascriptModuleCanonicalization::ModuleFragments(part) => {
            EcmascriptModulePartAsset::select_part(*module, part)
        }
        EcmascriptModuleCanonicalization::FollowReexports(part) => {
            if *module.get_exports().split_locals_and_reexports().await? {
                let facade = EcmascriptModuleFacadeModule::new(Vc::upcast(*module));

                if let Some(part) = part {
                    match part {
                        ModulePart::Evaluation => {
                            Vc::upcast(EcmascriptModuleLocalsModule::new(*module))
                        }
                        ModulePart::Export(_) => {
                            apply_reexport_tree_shaking(
                                module,
                                Vc::upcast(*facade.to_resolved().await?),
                                part,
                            )
                            .await?
                        }
                        _ => bail!(
                            "Invalid module part \"{}\" for reexports only tree shaking mode",
                            part
                        ),
                    }
                } else {
                    Vc::upcast(facade)
                }
            } else {
                Vc::upcast(*module)
            }
        }
    })
}

async fn apply_reexport_tree_shaking(
    source_module: ResolvedVc<EcmascriptModuleAsset>,
    module: Vc<Box<dyn EcmascriptChunkPlaceable>>,
    part: ModulePart,
) -> Result<Vc<Box<dyn EcmascriptChunkPlaceable>>> {
    let ModulePart::Export(export) = &part else {
        return Ok(module);
    };

    let declaration =
        side_effects_declaration_for_reexport(ResolvedVc::upcast(source_module)).await?;
    let (mut side_effects, result) = if matches!(declaration, SideEffectsDeclaration::None) {
        (
            Vec::new(),
            follow_reexports(module, export.clone(), true, false)
                .to_resolved()
                .await?,
        )
    } else {
        let FollowExportsWithSideEffectsResult {
            side_effects,
            result,
        } = &*follow_reexports_with_side_effects(
            module,
            export.clone(),
            true,
            matches!(declaration, SideEffectsDeclaration::SideEffectful),
        )
        .await?;
        (side_effects.clone(), *result)
    };
    let FollowExportsResult {
        module: final_module,
        export_name: new_export,
        ty,
    } = &*result.await?;
    if matches!(
        ty,
        FoundExportType::Dynamic | FoundExportType::Unknown | FoundExportType::NotFound
    ) {
        // Dynamic and unknown targets need the original reexport module's runtime machinery. The
        // statically composed side-effect wrapper only applies when a concrete binding was found.
        side_effects.clear();
    }
    let final_module = if let Some(new_export) = new_export {
        if *new_export == *export {
            **final_module
        } else {
            Vc::upcast(EcmascriptModuleRenameModule::new(
                **final_module,
                ModulePart::renamed_export(new_export.clone(), export.clone()),
            ))
        }
    } else {
        Vc::upcast(EcmascriptModuleRenameModule::new(
            **final_module,
            ModulePart::renamed_namespace(export.clone()),
        ))
    };

    if side_effects.is_empty() {
        return Ok(final_module);
    }

    Ok(Vc::upcast(SideEffectsModule::new(
        *source_module,
        part,
        final_module,
        side_effects
            .iter()
            .map(|side_effect| **side_effect)
            .collect(),
    )))
}
