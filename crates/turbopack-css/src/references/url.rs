use anyhow::Result;
use swc_core::{
    common::DUMMY_SP,
    css::ast::{Str, UrlValue},
};
use turbo_tasks::{Value, ValueToString, Vc};
use turbopack_core::{
    asset::Asset,
    chunk::ChunkingContext,
    ident::AssetIdent,
    issue::{IssueSeverity, IssueSource},
    reference::AssetReference,
    reference_type::UrlReferenceSubType,
    resolve::{origin::ResolveOrigin, parse::Request, PrimaryResolveResult, ResolveResult},
};
use turbopack_ecmascript::resolve::url_resolve;

use crate::{
    code_gen::{CodeGenerateable, CodeGeneration},
    create_visitor,
    embed::{CssEmbed, CssEmbeddable},
    references::AstPath,
};

#[turbo_tasks::value(into = "new")]
pub enum ReferencedAsset {
    Some(Vc<Box<dyn Asset>>),
    None,
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct UrlAssetReference {
    pub origin: Vc<Box<dyn ResolveOrigin>>,
    pub request: Vc<Request>,
    pub path: Vc<AstPath>,
    pub issue_source: Vc<IssueSource>,
}

#[turbo_tasks::value_impl]
impl UrlAssetReference {
    #[turbo_tasks::function]
    pub fn new(
        origin: Vc<Box<dyn ResolveOrigin>>,
        request: Vc<Request>,
        path: Vc<AstPath>,
        issue_source: Vc<IssueSource>,
    ) -> Vc<Self> {
        Self::cell(UrlAssetReference {
            origin,
            request,
            path,
            issue_source,
        })
    }

    #[turbo_tasks::function]
    async fn get_referenced_asset(
        self: Vc<Self>,
        context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<ReferencedAsset>> {
        for result in self.resolve_reference().await?.primary.iter() {
            if let PrimaryResolveResult::Asset(asset) = result {
                if let Some(embeddable) =
                    Vc::try_resolve_sidecast::<Box<dyn CssEmbeddable>>(*asset).await?
                {
                    return Ok(ReferencedAsset::Some(
                        embeddable.as_css_embed(context).embeddable_asset(),
                    )
                    .into());
                }
            }
        }
        Ok(ReferencedAsset::cell(ReferencedAsset::None))
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for UrlAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ResolveResult> {
        url_resolve(
            self.origin,
            self.request,
            Value::new(UrlReferenceSubType::CssUrl),
            self.issue_source,
            IssueSeverity::Error.cell(),
        )
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for UrlAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<String>> {
        Ok(Vc::cell(
            format!("url {}", self.request.to_string().await?,),
        ))
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for UrlAssetReference {
    #[turbo_tasks::function]
    async fn code_generation(
        self: Vc<Self>,
        context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<CodeGeneration>> {
        let this = self.await?;
        // TODO(WEB-662) This is not the correct way to get the current chunk path. It
        // currently works as all chunks are in the same directory.
        let chunk_path = context.chunk_path(
            AssetIdent::from_path(this.origin.origin_path()),
            ".css".to_string(),
        );
        let context_path = chunk_path.parent().await?;

        let mut visitors = Vec::new();

        if let ReferencedAsset::Some(asset) = &*self.get_referenced_asset(context).await? {
            // TODO(WEB-662) This is not the correct way to get the path of the asset.
            // `asset` is on module-level, but we need the output-level asset instead.
            let path = asset.ident().path().await?;
            let relative_path = context_path
                .get_relative_path_to(&path)
                .unwrap_or_else(|| format!("/{}", path.path));

            visitors.push(
                create_visitor!((&this.path.await?), visit_mut_url(u: &mut Url) {
                    u.value = Some(Box::new(UrlValue::Str(Str {
                        span: DUMMY_SP,
                        value: relative_path.as_str().into(),
                        raw: None,
                    })))
                }),
            );
        }

        Ok(CodeGeneration {
            visitors,
            imports: vec![],
        }
        .into())
    }
}
