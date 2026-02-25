use std::convert::Infallible;

use anyhow::Result;
use lightningcss::{
    stylesheet::StyleSheet,
    values::url::Url,
    visit_types,
    visitor::{Visit, Visitor},
};
use rustc_hash::FxHashMap;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbopack_core::{
    chunk::{ChunkingContext, ChunkingType, ChunkingTypeOption},
    issue::IssueSource,
    output::OutputAsset,
    reference::ModuleReference,
    reference_type::{ReferenceType, UrlReferenceSubType},
    resolve::{
        ModuleResolveResult, ResolveErrorMode, origin::ResolveOrigin, parse::Request, url_resolve,
    },
};

use crate::embed::CssEmbed;

#[turbo_tasks::value]
pub enum ReferencedAsset {
    Some(ResolvedVc<Box<dyn OutputAsset>>),
    None,
}

#[turbo_tasks::value]
#[derive(Hash, Debug, ValueToString)]
#[value_to_string("url {request}")]
pub struct UrlAssetReference {
    pub origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    pub request: ResolvedVc<Request>,
    pub issue_source: IssueSource,
}

#[turbo_tasks::value_impl]
impl UrlAssetReference {
    #[turbo_tasks::function]
    pub fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: ResolvedVc<Request>,
        issue_source: IssueSource,
    ) -> Vc<Self> {
        Self::cell(UrlAssetReference {
            origin,
            request,
            issue_source,
        })
    }

    #[turbo_tasks::function]
    pub async fn get_referenced_asset(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<ReferencedAsset>> {
        if let Some(module) = *self.resolve_reference().first_module().await?
            && let Some(embeddable) = ResolvedVc::try_downcast::<Box<dyn CssEmbed>>(module)
        {
            return Ok(ReferencedAsset::Some(
                embeddable
                    .embedded_asset(chunking_context)
                    .to_resolved()
                    .await?,
            )
            .cell());
        }
        Ok(ReferencedAsset::cell(ReferencedAsset::None))
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for UrlAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        url_resolve(
            *self.origin,
            *self.request,
            ReferenceType::Url(UrlReferenceSubType::CssUrl),
            Some(self.issue_source),
            ResolveErrorMode::Error,
        )
    }

    #[turbo_tasks::function]
    fn chunking_type(self: Vc<Self>) -> Vc<ChunkingTypeOption> {
        Vc::cell(Some(ChunkingType::Parallel {
            inherit_async: false,
            hoisted: false,
        }))
    }
}

#[turbo_tasks::function]
pub async fn resolve_url_reference(
    url: Vc<UrlAssetReference>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<Vc<Option<RcStr>>> {
    if let ReferencedAsset::Some(asset) = &*url.get_referenced_asset(chunking_context).await? {
        let path = asset.path().await?;

        let url_path: RcStr = if *chunking_context
            .should_use_absolute_url_references()
            .await?
        {
            format!("/{}", path.path).into()
        } else {
            let context_path = chunking_context.chunk_root_path().await?;
            context_path
                .get_relative_path_to(&path)
                .unwrap_or_else(|| format!("/{}", path.path).into())
        };

        // Append the static suffix from UrlBehavior if configured (e.g., ?dpl=<deployment_id>).
        let url_behavior = chunking_context.url_behavior(None).await?;
        let url_with_suffix = if let Some(ref suffix) = *url_behavior.static_suffix.await? {
            format!("{}{}", url_path, suffix).into()
        } else {
            url_path
        };

        return Ok(Vc::cell(Some(url_with_suffix)));
    }

    Ok(Vc::cell(None))
}

pub fn replace_url_references<'i, 'o>(ss: &mut StyleSheet<'i, 'o>, urls: &FxHashMap<RcStr, RcStr>) {
    let mut replacer = AssetReferenceReplacer { urls };
    ss.visit(&mut replacer).unwrap();
}

struct AssetReferenceReplacer<'a> {
    urls: &'a FxHashMap<RcStr, RcStr>,
}

impl Visitor<'_> for AssetReferenceReplacer<'_> {
    type Error = Infallible;

    fn visit_types(&self) -> lightningcss::visitor::VisitTypes {
        visit_types!(URLS)
    }

    fn visit_url(&mut self, u: &mut Url) -> std::result::Result<(), Self::Error> {
        u.visit_children(self)?;

        if let Some(new) = self.urls.get(&*u.url) {
            u.url = new.to_string().into();
        }

        Ok(())
    }
}
