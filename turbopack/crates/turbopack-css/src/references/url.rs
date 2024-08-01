use std::{collections::HashMap, convert::Infallible};

use anyhow::{bail, Result};
use lightningcss::{
    values::url::Url,
    visit_types,
    visitor::{Visit, Visitor},
};
use swc_core::css::{
    ast::UrlValue,
    visit::{VisitMut, VisitMutWith},
};
use turbo_tasks::{debug::ValueDebug, RcStr, Value, ValueToString, Vc};
use turbopack_core::{
    chunk::{
        ChunkableModule, ChunkableModuleReference, ChunkingContext, ChunkingType,
        ChunkingTypeOption,
    },
    ident::AssetIdent,
    issue::{IssueSeverity, IssueSource},
    output::OutputAsset,
    reference::ModuleReference,
    reference_type::{ReferenceType, UrlReferenceSubType},
    resolve::{origin::ResolveOrigin, parse::Request, url_resolve, ModuleResolveResult},
};

use crate::{embed::CssEmbed, StyleSheetLike};

#[turbo_tasks::value(into = "new")]
pub enum ReferencedAsset {
    Some(Vc<Box<dyn OutputAsset>>),
    None,
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct UrlAssetReference {
    pub origin: Vc<Box<dyn ResolveOrigin>>,
    pub request: Vc<Request>,
    pub issue_source: Vc<IssueSource>,
}

#[turbo_tasks::value_impl]
impl UrlAssetReference {
    #[turbo_tasks::function]
    pub fn new(
        origin: Vc<Box<dyn ResolveOrigin>>,
        request: Vc<Request>,
        issue_source: Vc<IssueSource>,
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
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<ReferencedAsset>> {
        if let Some(module) = *self.resolve_reference().first_module().await? {
            if let Some(chunkable) =
                Vc::try_resolve_downcast::<Box<dyn ChunkableModule>>(module).await?
            {
                let chunk_item = chunkable.as_chunk_item(chunking_context);
                if let Some(embeddable) =
                    Vc::try_resolve_downcast::<Box<dyn CssEmbed>>(chunk_item).await?
                {
                    return Ok(ReferencedAsset::Some(embeddable.embedded_asset()).into());
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
            self.origin,
            self.request,
            Value::new(ReferenceType::Url(UrlReferenceSubType::CssUrl)),
            Some(self.issue_source),
            IssueSeverity::Error.cell(),
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

    if let ReferencedAsset::Some(asset) = &*url.get_referenced_asset(chunking_context).await? {
        // TODO(WEB-662) This is not the correct way to get the path of the asset.
        // `asset` is on module-level, but we need the output-level asset instead.
        let path = asset.ident().path().await?;
        let relative_path = context_path
            .get_relative_path_to(&path)
            .unwrap_or_else(|| format!("/{}", path.path).into());

        return Ok(Vc::cell(Some(relative_path)));
    }

    Ok(Vc::cell(None))
}

pub fn replace_url_references(
    ss: &mut StyleSheetLike<'static, 'static>,
    urls: &HashMap<RcStr, RcStr>,
) {
    let mut replacer = AssetReferenceReplacer { urls };
    match ss {
        StyleSheetLike::LightningCss(ss) => {
            ss.visit(&mut replacer).unwrap();
        }
        StyleSheetLike::Swc { stylesheet, .. } => {
            stylesheet.visit_mut_with(&mut replacer);
        }
    }
}

struct AssetReferenceReplacer<'a> {
    urls: &'a HashMap<RcStr, RcStr>,
}

impl VisitMut for AssetReferenceReplacer<'_> {
    fn visit_mut_url_value(&mut self, u: &mut UrlValue) {
        u.visit_mut_children_with(self);

        match u {
            UrlValue::Str(v) => {
                if let Some(new) = self.urls.get(&*v.value) {
                    v.value = (&**new).into();
                    v.raw = None;
                }
            }
            UrlValue::Raw(v) => {
                if let Some(new) = self.urls.get(&*v.value) {
                    v.value = (&**new).into();
                    v.raw = None;
                }
            }
        }
    }
}

impl<'i> Visitor<'i> for AssetReferenceReplacer<'_> {
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
