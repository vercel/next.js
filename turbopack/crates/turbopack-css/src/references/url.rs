use std::convert::Infallible;

use anyhow::{bail, Result};
use lightningcss::{
    values::url::Url,
    visit_types,
    visitor::{Visit, Visitor},
};
use rustc_hash::FxHashMap;
use turbo_rcstr::RcStr;
use turbo_tasks::{debug::ValueDebug, ResolvedVc, Value, ValueToString, Vc};
use turbopack_core::{
    chunk::{
        ChunkableModule, ChunkableModuleReference, ChunkingContext, ChunkingType,
        ChunkingTypeOption,
    },
    ident::AssetIdent,
    issue::IssueSource,
    module_graph::ModuleGraph,
    output::OutputAsset,
    reference::ModuleReference,
    reference_type::{ReferenceType, UrlReferenceSubType},
    resolve::{origin::ResolveOrigin, parse::Request, url_resolve, ModuleResolveResult},
};

use crate::{embed::CssEmbed, StyleSheetLike};

#[turbo_tasks::value(into = "new")]
pub enum ReferencedAsset {
    Some(ResolvedVc<Box<dyn OutputAsset>>),
    None,
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
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
    async fn get_referenced_asset(
        self: Vc<Self>,
        module_graph: Vc<ModuleGraph>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<ReferencedAsset>> {
        if let Some(module) = *self.resolve_reference().first_module().await? {
            if let Some(chunkable) = ResolvedVc::try_downcast::<Box<dyn ChunkableModule>>(module) {
                let chunk_item = chunkable.as_chunk_item(module_graph, chunking_context);
                if let Some(embeddable) =
                    Vc::try_resolve_downcast::<Box<dyn CssEmbed>>(chunk_item).await?
                {
                    return Ok(ReferencedAsset::Some(
                        embeddable.embedded_asset().to_resolved().await?,
                    )
                    .into());
                }
            }
            bail!(
                "A module referenced by a url() reference must be chunkable and the chunk item \
                 must be css embeddable\nreferenced module: {:?}",
                module.dbg_depth(1).await?
            )
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
            Value::new(ReferenceType::Url(UrlReferenceSubType::CssUrl)),
            Some(self.issue_source.clone()),
            false,
        )
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for UrlAssetReference {
    #[turbo_tasks::function]
    fn chunking_type(self: Vc<Self>) -> Vc<ChunkingTypeOption> {
        // Since this chunk item is embedded, we don't want to put it in the chunk group
        Vc::cell(Some(ChunkingType::Passthrough))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for UrlAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("url {}", self.request.to_string().await?,).into(),
        ))
    }
}

#[turbo_tasks::function]
pub async fn resolve_url_reference(
    url: Vc<UrlAssetReference>,
    module_graph: Vc<ModuleGraph>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<Vc<Option<RcStr>>> {
    let this = url.await?;
    // TODO(WEB-662) This is not the correct way to get the current chunk path. It
    // currently works as all chunks are in the same directory.
    let chunk_path = chunking_context.chunk_path(
        AssetIdent::from_path(this.origin.origin_path()),
        ".css".into(),
    );
    let context_path = chunk_path.parent().await?;

    if let ReferencedAsset::Some(asset) = &*url
        .get_referenced_asset(module_graph, chunking_context)
        .await?
    {
        // TODO(WEB-662) This is not the correct way to get the path of the asset.
        // `asset` is on module-level, but we need the output-level asset instead.
        let path = asset.path().await?;
        let relative_path = context_path
            .get_relative_path_to(&path)
            .unwrap_or_else(|| format!("/{}", path.path).into());

        return Ok(Vc::cell(Some(relative_path)));
    }

    Ok(Vc::cell(None))
}

pub fn replace_url_references(
    ss: &mut StyleSheetLike<'static, 'static>,
    urls: &FxHashMap<RcStr, RcStr>,
) {
    let mut replacer = AssetReferenceReplacer { urls };
    ss.0.visit(&mut replacer).unwrap();
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
