use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexSet, Vc};
use turbo_tasks_fs::FileContent;

use super::{
    IntrospectableChildren, module::IntrospectableModule, output_asset::IntrospectableOutputAsset,
};
use crate::{
    asset::AssetContent,
    chunk::ChunkingType,
    output::OutputAssetsWithReferenced,
    reference::{ModuleReference, ModuleReferences},
};

fn reference_ty() -> RcStr {
    rcstr!("reference")
}

fn parallel_reference_ty() -> RcStr {
    rcstr!("parallel reference")
}

fn parallel_inherit_async_reference_ty() -> RcStr {
    rcstr!("parallel reference (inherit async module)")
}

fn async_reference_ty() -> RcStr {
    rcstr!("async reference")
}

fn isolated_reference_ty() -> RcStr {
    rcstr!("isolated reference")
}

fn shared_reference_ty() -> RcStr {
    rcstr!("shared reference")
}

fn traced_reference_ty() -> RcStr {
    rcstr!("traced reference")
}

#[turbo_tasks::function]
pub async fn content_to_details(content: Vc<AssetContent>) -> Result<Vc<RcStr>> {
    Ok(match &*turbo_tasks::read!(content)? {
        AssetContent::File(file_content) => match &*turbo_tasks::read!(file_content)? {
            FileContent::Content(file) => {
                let content = file.content();
                match content.to_str() {
                    Ok(str) => Vc::cell(str.into()),
                    Err(_) => Vc::cell(format!("{} binary bytes", content.len()).into()),
                }
            }
            FileContent::NotFound => Vc::cell(rcstr!("not found")),
        },
        AssetContent::Redirect { target, link_type } => {
            Vc::cell(format!("redirect to {target} with type {link_type:?}").into())
        }
    })
}

#[turbo_tasks::function]
pub async fn children_from_module_references(
    references: Vc<ModuleReferences>,
) -> Result<Vc<IntrospectableChildren>> {
    let key = reference_ty();
    let mut children = FxIndexSet::default();
    let references = turbo_tasks::read!(references)?;
    for &reference in &*references {
        let trait_ref = turbo_tasks::read!(reference.into_trait_ref())?;
        let key = match &trait_ref.chunking_type() {
            None => key.clone(),
            Some(ChunkingType::Parallel { inherit_async, .. }) => {
                if *inherit_async {
                    parallel_inherit_async_reference_ty()
                } else {
                    parallel_reference_ty()
                }
            }
            Some(ChunkingType::Async) => async_reference_ty(),
            Some(ChunkingType::Isolated { .. }) => isolated_reference_ty(),
            Some(ChunkingType::Shared { .. }) => shared_reference_ty(),
            Some(ChunkingType::Traced { .. }) => traced_reference_ty(),
        };

        for &module in turbo_tasks::read!(
            turbo_tasks::read!(reference.resolve_reference())?.primary_modules()
        )?
        .iter()
        {
            children.insert((
                key.clone(),
                turbo_tasks::read!(IntrospectableModule::new(*module).to_resolved())?,
            ));
        }
    }
    Ok(Vc::cell(children))
}

#[turbo_tasks::function]
pub async fn children_from_output_assets(
    references: Vc<OutputAssetsWithReferenced>,
) -> Result<Vc<IntrospectableChildren>> {
    let key = reference_ty();
    let mut children = FxIndexSet::default();
    let references = turbo_tasks::read!(references.expand_all_assets())?;
    for &reference in &*references {
        children.insert((
            key.clone(),
            turbo_tasks::read!(IntrospectableOutputAsset::new(*reference).to_resolved())?,
        ));
    }
    Ok(Vc::cell(children))
}
