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

static REFERENCE_TY: RcStr = rcstr!("reference");

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
        AssetContent::Redirect(content) => Vc::cell(format!("redirect to {content:?}").into()),
    })
}

#[turbo_tasks::function]
pub async fn children_from_module_references(
    references: Vc<ModuleReferences>,
) -> Result<Vc<IntrospectableChildren>> {
    let key = REFERENCE_TY.clone();
    let mut children = FxIndexSet::default();
    let references = references.await?;
    for &reference in &*references {
        let trait_ref = reference.into_trait_ref().await?;
        let key = match &trait_ref.chunking_type() {
            None => key.clone(),
            Some(ChunkingType::Parallel { inherit_async, .. }) => {
                if *inherit_async {
                    rcstr!("parallel reference (inherit async module)")
                } else {
                    rcstr!("parallel reference")
                }
            }
            Some(ChunkingType::Async) => rcstr!("async reference"),
            Some(ChunkingType::Isolated { .. }) => rcstr!("isolated reference"),
            Some(ChunkingType::Shared { .. }) => rcstr!("shared reference"),
            Some(ChunkingType::Traced { .. }) => rcstr!("traced reference"),
            Some(ChunkingType::Emitted { .. }) => rcstr!("emitted reference"),
            Some(ChunkingType::Collected { .. }) => rcstr!("collected reference"),
            Some(ChunkingType::PerEntry) => rcstr!("per entry reference"),
        };

        for &module in reference
            .resolve_reference()
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
    }
    Ok(Vc::cell(children))
}

#[turbo_tasks::function]
pub async fn children_from_output_assets(
    references: Vc<OutputAssetsWithReferenced>,
) -> Result<Vc<IntrospectableChildren>> {
    let key = REFERENCE_TY.clone();
    let mut children = FxIndexSet::default();
    let references = references.expand_all_assets().await?;
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
