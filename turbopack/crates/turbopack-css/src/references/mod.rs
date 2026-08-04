use std::convert::Infallible;

use anyhow::Result;
use lightningcss::{
    rules::CssRule,
    stylesheet::StyleSheet,
    traits::IntoOwned,
    values::url::Url,
    visitor::{Visit, Visitor},
};
use turbo_rcstr::RcStr;
#[cfg(not(feature = "sync"))]
use turbo_tasks::TryJoinIterExt;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{
    issue::IssueSource,
    reference::ModuleReference,
    reference_type::{CssReferenceSubType, ImportContext, ReferenceType},
    resolve::{
        ModuleResolveResult, ResolveErrorMode, origin::ResolveOrigin, parse::Request, url_resolve,
    },
    source::Source,
    source_pos::SourcePos,
};

use crate::references::{
    import::{ImportAssetReference, ImportAttributes},
    url::UrlAssetReference,
};

pub(crate) mod compose;
pub(crate) mod import;
pub(crate) mod internal;
pub(crate) mod url;

pub type AnalyzedRefs = (
    Vec<ResolvedVc<Box<dyn ModuleReference>>>,
    Vec<(String, ResolvedVc<UrlAssetReference>)>,
);

turbo_tasks::dual_fn! {
    /// Returns `(all_references, urls)`.
    pub fn analyze_references(
        stylesheet: &mut StyleSheet<'static, 'static>,
        source: ResolvedVc<Box<dyn Source>>,
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        import_context: Option<ResolvedVc<ImportContext>>,
    ) -> Result<AnalyzedRefs> {
        let mut references = Vec::new();
        let mut urls = Vec::new();

        let mut visitor =
            ModuleReferencesVisitor::new(source, origin, import_context, &mut references, &mut urls);
        stylesheet.visit(&mut visitor).unwrap();

        // `.to_resolved()` futures cannot fan out through the sync `parallel!`; keep
        // the async build concurrent and resolve sequentially under `sync`.
        #[cfg(not(feature = "sync"))]
        {
            Ok((
                references.into_iter().map(|v| v.to_resolved()).try_join().await?,
                urls.into_iter()
                    .map(|(k, v)| async move { Ok((k, turbo_tasks::read!(v.to_resolved())?)) })
                    .try_join()
                    .await?,
            ))
        }
        #[cfg(feature = "sync")]
        {
            let mut resolved_references = Vec::with_capacity(references.len());
            for v in references {
                resolved_references.push(turbo_tasks::read!(v.to_resolved())?);
            }
            let mut resolved_urls = Vec::with_capacity(urls.len());
            for (k, v) in urls {
                resolved_urls.push((k, turbo_tasks::read!(v.to_resolved())?));
            }
            Ok((resolved_references, resolved_urls))
        }
    }
}

struct ModuleReferencesVisitor<'a> {
    source: ResolvedVc<Box<dyn Source>>,
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    import_context: Option<ResolvedVc<ImportContext>>,
    // `references` and `urls` must be resolved later (in `analyze_references`), as they're
    // collected inside of a synchronous visitor
    references: &'a mut Vec<Vc<Box<dyn ModuleReference>>>,
    urls: &'a mut Vec<(String, Vc<UrlAssetReference>)>,
}

impl<'a> ModuleReferencesVisitor<'a> {
    fn new(
        source: ResolvedVc<Box<dyn Source>>,
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        import_context: Option<ResolvedVc<ImportContext>>,
        references: &'a mut Vec<Vc<Box<dyn ModuleReference>>>,
        urls: &'a mut Vec<(String, Vc<UrlAssetReference>)>,
    ) -> Self {
        Self {
            source,
            origin,
            import_context,
            references,
            urls,
        }
    }
}

impl Visitor<'_> for ModuleReferencesVisitor<'_> {
    type Error = Infallible;

    fn visit_types(&self) -> lightningcss::visitor::VisitTypes {
        lightningcss::visitor::VisitTypes::all()
    }

    fn visit_rule(&mut self, rule: &mut CssRule) -> std::result::Result<(), Self::Error> {
        match rule {
            CssRule::Import(i) => {
                let src = &*i.url;

                let issue_span = i.loc;

                self.references.push(Vc::upcast(ImportAssetReference::new(
                    *self.origin,
                    Request::parse(RcStr::from(src).into()),
                    ImportAttributes::new_from_lightningcss(&i.clone().into_owned()).cell(),
                    self.import_context.map(|ctx| *ctx),
                    IssueSource::from_single_line_col(
                        self.source,
                        SourcePos {
                            // lightningcss::rules::Location is 1-based for column only
                            line: issue_span.line,
                            column: issue_span.column - 1,
                        },
                    ),
                )));

                *rule = CssRule::Ignored;

                // This node type has no children worth visiting.
                // i.visit_children(self)
                Ok(())
            }

            _ => rule.visit_children(self),
        }
    }

    fn visit_url(&mut self, u: &mut Url) -> std::result::Result<(), Self::Error> {
        let src = &*u.url;

        // ignore internal urls like `url(#noiseFilter)`
        // ignore server-relative urls like `url(/foo)`
        if !matches!(src.bytes().next(), Some(b'#') | Some(b'/')) {
            let issue_span = u.loc;

            let vc = UrlAssetReference::new(
                *self.origin,
                Request::parse(RcStr::from(src).into()),
                IssueSource::from_single_line_col(
                    self.source,
                    SourcePos {
                        // lightningcss::dependencies::Location is 1-based for both line and column
                        line: issue_span.line - 1,
                        column: issue_span.column - 1,
                    },
                ),
            );

            self.references.push(Vc::upcast(vc));
            self.urls.push((u.url.to_string(), vc));
        }

        // This node type has no children worth visiting.
        // u.visit_children(self)?;
        Ok(())
    }

    /// Noop. Urls in `@supports` are not used.
    ///
    /// See https://github.com/vercel/next.js/issues/63102
    fn visit_supports_condition(
        &mut self,
        _: &mut lightningcss::rules::supports::SupportsCondition<'_>,
    ) -> Result<(), Self::Error> {
        Ok(())
    }
}

#[turbo_tasks::function]
pub fn css_resolve(
    origin: Vc<Box<dyn ResolveOrigin>>,
    request: Vc<Request>,
    ty: CssReferenceSubType,
    issue_source: Option<IssueSource>,
) -> Vc<ModuleResolveResult> {
    url_resolve(
        origin,
        request,
        ReferenceType::Css(ty),
        issue_source,
        ResolveErrorMode::Error,
    )
}
