use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexSet, ResolvedVc, Vc};
use turbo_tasks_fs::FileContent;

use super::{
    module::IntrospectableModule, output_asset::IntrospectableOutputAsset, IntrospectableChildren,
};
use crate::{
    asset::AssetContent,
    chunk::{ChunkableModuleReference, ChunkingType},
    output::OutputAssets,
    reference::{ModuleReference, ModuleReferences},
};

#[turbo_tasks::function]
fn reference_ty() -> Vc<RcStr> {
    Vc::cell("reference".into())
}

#[turbo_tasks::function]
fn parallel_reference_ty() -> Vc<RcStr> {
    Vc::cell("parallel reference".into())
}

#[turbo_tasks::function]
fn parallel_inherit_async_reference_ty() -> Vc<RcStr> {
    Vc::cell("parallel reference (inherit async module)".into())
}

#[turbo_tasks::function]
fn async_reference_ty() -> Vc<RcStr> {
    Vc::cell("async reference".into())
}

#[turbo_tasks::function]
fn passthrough_reference_ty() -> Vc<RcStr> {
    Vc::cell("passthrough reference".into())
}

#[turbo_tasks::function]
fn traced_reference_ty() -> Vc<RcStr> {
    Vc::cell("traced reference".into())
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
            FileContent::NotFound => Vc::cell("not found".into()),
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
        let mut key = key;
        if let Some(chunkable) =
            ResolvedVc::try_downcast::<Box<dyn ChunkableModuleReference>>(reference).await?
        {
            match &*chunkable.chunking_type().await? {
                None => {}
                Some(ChunkingType::Parallel) => key = parallel_reference_ty(),
                Some(ChunkingType::ParallelInheritAsync) => {
                    key = parallel_inherit_async_reference_ty()
                }
                Some(ChunkingType::Async) => key = async_reference_ty(),
                Some(ChunkingType::Passthrough) => key = passthrough_reference_ty(),
                Some(ChunkingType::Traced) => key = traced_reference_ty(),
            }
        }

        for &module in reference
            .resolve_reference()
            .resolve()
            .await?
            .primary_modules()
            .await?
            .iter()
        {
            children.insert((key.to_resolved().await?, IntrospectableModule::new(*module)));
        }
        for &output_asset in reference
            .resolve_reference()
            .primary_output_assets()
            .await?
            .iter()
        {
            children.insert((
                key.to_resolved().await?,
                IntrospectableOutputAsset::new(*output_asset),
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
            key.to_resolved().await?,
            IntrospectableOutputAsset::new(*ResolvedVc::upcast(reference)),
        ));
    }
    Ok(Vc::cell(children))
}
