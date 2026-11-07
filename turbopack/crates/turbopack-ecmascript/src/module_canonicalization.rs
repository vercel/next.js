use anyhow::{Result, bail};
use bincode::{Decode, Encode};
use turbo_tasks::{ResolvedVc, Vc};
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
#[derive(Clone, Debug, Hash, PartialEq, Eq, Encode, Decode)]
pub enum EcmascriptModuleCanonicalization {
    None,
    ModuleFragments(ModulePart),
    FollowReexports(Option<ModulePart>),
}

pub fn canonicalize_ecmascript_module(
    module: Vc<EcmascriptModuleAsset>,
    canonicalization: EcmascriptModuleCanonicalization,
) -> Vc<Box<dyn EcmascriptChunkPlaceable>> {
    match canonicalization {
        EcmascriptModuleCanonicalization::None => Vc::upcast(module),
        EcmascriptModuleCanonicalization::ModuleFragments(part) => {
            EcmascriptModulePartAsset::select_part(module, part)
        }
        EcmascriptModuleCanonicalization::FollowReexports(part) => {
            canonicalize_following_reexports(module, part)
        }
    }
}

/// Splits a module that has reexports into a facade and its locals. An export `part` is followed
/// through the reexports to the module that defines it. A module without reexports is returned
/// as is.
#[turbo_tasks::function]
async fn canonicalize_following_reexports(
    module: ResolvedVc<EcmascriptModuleAsset>,
    part: Option<ModulePart>,
) -> Result<Vc<Box<dyn EcmascriptChunkPlaceable>>> {
    let mangle_via_materialized_namespace_object = module
        .options()
        .await?
        .mangle_via_materialized_namespace_object;
    if !*module
        .get_exports()
        .split_locals_and_reexports(mangle_via_materialized_namespace_object)
        .await?
    {
        return Ok(Vc::upcast(*module));
    }
    Ok(match part {
        None => Vc::upcast(EcmascriptModuleFacadeModule::new(Vc::upcast(*module))),
        Some(ModulePart::Evaluation) => Vc::upcast(EcmascriptModuleLocalsModule::new(*module)),
        Some(part @ (ModulePart::Export(_) | ModulePart::PartialExport { .. })) => {
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
        Some(part) => bail!(
            "Invalid module part \"{}\" for reexports only tree shaking mode",
            part
        ),
    })
}

async fn apply_reexport_tree_shaking(
    module: Vc<Box<dyn EcmascriptChunkPlaceable>>,
    part: ModulePart,
) -> Result<Vc<Box<dyn EcmascriptChunkPlaceable>>> {
    // The namespace member is only applied if this export resolves to a namespace object.
    let (export, namespace_member) = match &part {
        ModulePart::Export(export) => (export, None),
        ModulePart::PartialExport { export, member } => (export, Some(member)),
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
                    ModulePart::renamed_partial_namespace(export.clone(), member.clone())
                }
                None => ModulePart::renamed_namespace(export.clone()),
            },
        ))
    })
}
