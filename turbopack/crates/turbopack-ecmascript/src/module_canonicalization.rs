use anyhow::{Result, bail};
use bincode::{Decode, Encode};
use turbo_tasks::{ResolvedVc, Vc, trace::TraceRawVcs};
use turbopack_core::resolve::ModulePart;

use crate::{
    EcmascriptModuleAsset,
    chunk::EcmascriptChunkPlaceable,
    module_fragments::part::module::EcmascriptModulePartAsset,
    references::{FollowExportsResult, follow_reexports},
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
                if let Some(part) = part {
                    match part {
                        ModulePart::Evaluation => {
                            Vc::upcast(EcmascriptModuleLocalsModule::new(*module))
                        }
                        ModulePart::Export(_) | ModulePart::ExportedNamespaceMember { .. } => {
                            apply_reexport_tree_shaking(
                                Vc::upcast(
                                    *EcmascriptModuleFacadeModule::new(Vc::upcast(*module))
                                        .to_resolved()
                                        .await?,
                                ),
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
                    Vc::upcast(EcmascriptModuleFacadeModule::new(Vc::upcast(*module)))
                }
            } else {
                Vc::upcast(*module)
            }
        }
    })
}

async fn apply_reexport_tree_shaking(
    module: Vc<Box<dyn EcmascriptChunkPlaceable>>,
    part: ModulePart,
) -> Result<Vc<Box<dyn EcmascriptChunkPlaceable>>> {
    // The namespace member is only applied if this export resolves to a namespace object.
    let (export, namespace_member) = match &part {
        ModulePart::Export(export) => (export, None),
        ModulePart::ExportedNamespaceMember { export, member } => (export, Some(member)),
        _ => return Ok(module),
    };

    let FollowExportsResult {
        module: final_module,
        export_name: new_export,
        ..
    } = &*follow_reexports(module, export.clone(), true).await?;
    Ok(if let Some(new_export) = new_export {
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
            match namespace_member {
                Some(member) => {
                    ModulePart::renamed_namespace_member(export.clone(), member.clone())
                }
                None => ModulePart::renamed_namespace(export.clone()),
            },
        ))
    })
}
