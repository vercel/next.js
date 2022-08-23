use anyhow::Result;
use swc_common::DUMMY_SP;
use swc_css_ast::{Str, UrlValue};
use turbo_tasks::{primitives::StringVc, ValueToString};
use turbopack_core::{
    asset::AssetVc,
    chunk::ChunkingContextVc,
    context::AssetContextVc,
    reference::{AssetReference, AssetReferenceVc},
    resolve::{parse::RequestVc, ResolveResultVc},
};

use crate::{
    chunk::CssChunkContextVc,
    code_gen::{CodeGenerateable, CodeGenerateableVc, CodeGeneration, CodeGenerationVc},
    create_visitor,
    embed::CssEmbeddableVc,
    references::{css_resolve, AstPathVc},
};

#[turbo_tasks::value(into = "new")]
pub enum ReferencedAsset {
    Some(AssetVc),
    None,
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct UrlAssetReference {
    pub context: AssetContextVc,
    pub request: RequestVc,
    pub path: AstPathVc,
}

#[turbo_tasks::value_impl]
impl UrlAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(context: AssetContextVc, request: RequestVc, path: AstPathVc) -> Self {
        Self::cell(UrlAssetReference {
            context,
            request,
            path,
        })
    }

    #[turbo_tasks::function]
    async fn get_referenced_asset(self, context: ChunkingContextVc) -> Result<ReferencedAssetVc> {
        let assets = self.resolve_reference().primary_assets();
        for asset in assets.await?.iter() {
            if let Some(embeddable) = CssEmbeddableVc::resolve_from(asset).await? {
                return Ok(ReferencedAsset::Some(
                    embeddable.as_css_embed(context).embeddable_asset(),
                )
                .into());
            }
        }
        Ok(ReferencedAssetVc::cell(ReferencedAsset::None))
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for UrlAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        css_resolve(self.request, self.context)
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "url {}",
            self.request.to_string().await?,
        )))
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for UrlAssetReference {
    #[turbo_tasks::function]
    async fn code_generation(
        self_vc: UrlAssetReferenceVc,
        _chunk_context: CssChunkContextVc,
        context: ChunkingContextVc,
    ) -> Result<CodeGenerationVc> {
        let this = self_vc.await?;
        let chunk_path = context.chunk_path(this.context.context_path(), ".css");
        let context_path = chunk_path.parent().await?;

        let mut visitors = Vec::new();

        if let ReferencedAsset::Some(asset) = &*self_vc.get_referenced_asset(context).await? {
            let path = asset.path().await?;
            let relative_path = context_path
                .get_relative_path_to(&path)
                .unwrap_or_else(|| format!("/{}", path.path));

            visitors.push(
                create_visitor!((&this.path.await?), visit_mut_url(u: &mut Url) {
                    u.value = Some(UrlValue::Str(Str {
                        span: DUMMY_SP,
                        value: relative_path.as_str().into(),
                        raw: None,
                    }))
                }),
            );
        }

        Ok(CodeGeneration { visitors }.into())
    }
}
