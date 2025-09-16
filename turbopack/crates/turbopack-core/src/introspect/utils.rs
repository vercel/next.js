use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexSet, ResolvedVc, Vc};
use turbo_tasks_fs::FileContent;

use super::{
    IntrospectableChildren, module::IntrospectableModule, output_asset::IntrospectableOutputAsset,
};
use crate::{
    asset::AssetContent,
    chunk::{ChunkableModuleReference, ChunkingType},
    output::OutputAssets,
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
    Ok(match &*content.await? {
        AssetContent::File(file_content) => match &*file_content.await? {
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
    let references = references.await?;
    for &reference in &*references {
        let key = if let Some(chunkable) =
            ResolvedVc::try_downcast::<Box<dyn ChunkableModuleReference>>(reference)
        {
            match &*chunkable.chunking_type().await? {
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
                Some(ChunkingType::Traced) => traced_reference_ty(),
            }
        } else {
            key.clone()
        };

        for &module in reference
            .resolve_reference()
            .resolve()
            .await?
            .primary_modules()
            .await?
            .iter()
        {
            children.insert((
                key.clone(),
                IntrospectableModule::new(*module).to_resolved().await?,
            ));
        }
        for &output_asset in reference
            .resolve_reference()
            .primary_output_assets()
            .await?
            .iter()
        {
            children.insert((
                key.clone(),
                IntrospectableOutputAsset::new(*output_asset)
                    .to_resolved()
                    .await?,
            ));
        }
    }
    Ok(Vc::cell(children))
}

#[turbo_tasks::function]
pub async fn children_from_output_assets(
    references: Vc<OutputAssets>,
) -> Result<Vc<IntrospectableChildren>> {
    let key = reference_ty();
    let mut children = FxIndexSet::default();
    let references = references.await?;
    for &reference in &*references {
        children.insert((
            key.clone(),
            IntrospectableOutputAsset::new(*reference)
                .to_resolved()
                .await?,
        ));
    }
    Ok(Vc::cell(children))
}
