use anyhow::Result;
use swc_core::{
    common::DUMMY_SP,
    css::ast::{Str, UrlValue},
};
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbopack_core::{
    asset::AssetVc,
    chunk::ChunkingContextVc,
    reference::{AssetReference, AssetReferenceVc},
    resolve::{origin::ResolveOriginVc, parse::RequestVc, ResolveResultVc},
};

use crate::{
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
    pub origin: ResolveOriginVc,
    pub request: RequestVc,
    pub path: AstPathVc,
}

#[turbo_tasks::value_impl]
impl UrlAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(origin: ResolveOriginVc, request: RequestVc, path: AstPathVc) -> Self {
        Self::cell(UrlAssetReference {
            origin,
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
        css_resolve(self.origin, self.request)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for UrlAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
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
        context: ChunkingContextVc,
    ) -> Result<CodeGenerationVc> {
        let this = self_vc.await?;
        let chunk_path = context.chunk_path(this.origin.origin_path(), ".css");
        let context_path = chunk_path.parent().await?;

        let mut visitors = Vec::new();

        if let ReferencedAsset::Some(asset) = &*self_vc.get_referenced_asset(context).await? {
            let path = asset.path().await?;
            let relative_path = context_path
                .get_relative_path_to(&path)
                .unwrap_or_else(|| format!("/{}", path.path));

            visitors.push(
                create_visitor!((&this.path.await?), visit_mut_url(u: &mut Url) {
                    u.value = Some(box UrlValue::Str(Str {
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
