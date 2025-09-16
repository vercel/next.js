use std::convert::Infallible;

use anyhow::Result;
use lightningcss::{
    rules::CssRule,
    traits::IntoOwned,
    values::url::Url,
    visitor::{Visit, Visitor},
};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbopack_core::{
    issue::IssueSource,
    reference::ModuleReference,
    reference_type::{CssReferenceSubType, ImportContext, ReferenceType},
    resolve::{ModuleResolveResult, origin::ResolveOrigin, parse::Request, url_resolve},
    source::Source,
    source_pos::SourcePos,
};

use crate::{
    StyleSheetLike,
    references::{
        import::{ImportAssetReference, ImportAttributes},
        url::UrlAssetReference,
    },
};

pub(crate) mod compose;
pub(crate) mod import;
pub(crate) mod internal;
pub(crate) mod url;

pub type AnalyzedRefs = (
    Vec<ResolvedVc<Box<dyn ModuleReference>>>,
    Vec<(String, ResolvedVc<UrlAssetReference>)>,
);

/// Returns `(all_references, urls)`.
pub async fn analyze_references(
    stylesheet: &mut StyleSheetLike<'static, 'static>,
    source: ResolvedVc<Box<dyn Source>>,
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    import_context: Option<ResolvedVc<ImportContext>>,
) -> Result<AnalyzedRefs> {
    let mut references = Vec::new();
    let mut urls = Vec::new();

    let mut visitor =
        ModuleReferencesVisitor::new(source, origin, import_context, &mut references, &mut urls);
    stylesheet.0.visit(&mut visitor).unwrap();

    tokio::try_join!(
        references.into_iter().map(|v| v.to_resolved()).try_join(),
        urls.into_iter()
            .map(|(k, v)| async move { Ok((k, v.to_resolved().await?)) })
            .try_join(),
    )
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
                    ImportAttributes::new_from_lightningcss(&i.clone().into_owned()).into(),
                    self.import_context.map(|ctx| *ctx),
                    IssueSource::from_line_col(
                        self.source,
                        SourcePos {
                            line: issue_span.line as _,
                            column: issue_span.column as _,
                        },
                        SourcePos {
                            line: issue_span.line as _,
                            column: issue_span.column as _,
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
                IssueSource::from_line_col(
                    self.source,
                    SourcePos {
                        line: issue_span.line as _,
                        column: issue_span.column as _,
                    },
                    SourcePos {
                        line: issue_span.line as _,
                        column: issue_span.column as _,
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
    url_resolve(origin, request, ReferenceType::Css(ty), issue_source, false)
}
