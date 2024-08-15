use std::convert::Infallible;

use anyhow::Result;
use lightningcss::{
    rules::CssRule,
    traits::IntoOwned,
    values::url::Url,
    visitor::{Visit, Visitor},
};
use swc_core::css::{
    ast::UrlValue,
    visit::{VisitMut, VisitMutWith},
};
use turbo_tasks::{RcStr, Value, Vc};
use turbopack_core::{
    issue::{IssueSeverity, IssueSource},
    reference::ModuleReference,
    reference_type::{CssReferenceSubType, ImportContext, ReferenceType},
    resolve::{origin::ResolveOrigin, parse::Request, url_resolve, ModuleResolveResult},
    source::Source,
    source_pos::SourcePos,
};

use crate::{
    references::{
        import::{ImportAssetReference, ImportAttributes},
        url::UrlAssetReference,
    },
    StyleSheetLike,
};

pub(crate) mod compose;
pub(crate) mod import;
pub(crate) mod internal;
pub(crate) mod url;

pub type AnalyzedRefs = (
    Vec<Vc<Box<dyn ModuleReference>>>,
    Vec<(String, Vc<UrlAssetReference>)>,
);

/// Returns `(all_references, urls)`.
pub fn analyze_references(
    stylesheet: &mut StyleSheetLike<'static, 'static>,
    source: Vc<Box<dyn Source>>,
    origin: Vc<Box<dyn ResolveOrigin>>,
    import_context: Vc<ImportContext>,
) -> Result<AnalyzedRefs> {
    let mut references = Vec::new();
    let mut urls = Vec::new();

    let mut visitor =
        ModuleReferencesVisitor::new(source, origin, import_context, &mut references, &mut urls);
    match stylesheet {
        StyleSheetLike::LightningCss(ss) => {
            ss.visit(&mut visitor).unwrap();
        }
        StyleSheetLike::Swc { stylesheet, .. } => {
            stylesheet.visit_mut_with(&mut visitor);
        }
    }

    Ok((references, urls))
}

struct ModuleReferencesVisitor<'a> {
    source: Vc<Box<dyn Source>>,
    origin: Vc<Box<dyn ResolveOrigin>>,
    import_context: Vc<ImportContext>,
    references: &'a mut Vec<Vc<Box<dyn ModuleReference>>>,
    urls: &'a mut Vec<(String, Vc<UrlAssetReference>)>,
}

impl<'a> ModuleReferencesVisitor<'a> {
    fn new(
        source: Vc<Box<dyn Source>>,
        origin: Vc<Box<dyn ResolveOrigin>>,
        import_context: Vc<ImportContext>,
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

impl VisitMut for ModuleReferencesVisitor<'_> {
    fn visit_mut_import_prelude(&mut self, i: &mut swc_core::css::ast::ImportPrelude) {
        let src = match &*i.href {
            swc_core::css::ast::ImportHref::Url(v) => match v.value.as_deref().unwrap() {
                UrlValue::Str(v) => v.value.clone(),
                UrlValue::Raw(v) => v.value.clone(),
            },
            swc_core::css::ast::ImportHref::Str(v) => v.value.clone(),
        };

        let issue_span = i.span;

        self.references.push(Vc::upcast(ImportAssetReference::new(
            self.origin,
            Request::parse(Value::new(RcStr::from(src.as_str()).into())),
            ImportAttributes::new_from_swc(&i.clone()).into(),
            self.import_context,
            IssueSource::from_swc_offsets(
                Vc::upcast(self.source),
                issue_span.lo.0 as _,
                issue_span.hi.0 as _,
            ),
        )));

        // let res = i.visit_children(self);
        // res
    }

    /// Noop. Urls in `@supports` are not used.
    ///
    /// See https://github.com/vercel/next.js/issues/63102
    fn visit_mut_supports_condition(&mut self, _: &mut swc_core::css::ast::SupportsCondition) {}

    fn visit_mut_url(&mut self, u: &mut swc_core::css::ast::Url) {
        u.visit_mut_children_with(self);

        let src = match u.value.as_deref().unwrap() {
            UrlValue::Str(v) => v.value.clone(),
            UrlValue::Raw(v) => v.value.clone(),
        };

        // ignore internal urls like `url(#noiseFilter)`
        // ignore server-relative urls like `url(/foo)`
        if !matches!(src.bytes().next(), Some(b'#') | Some(b'/')) {
            let issue_span = u.span;

            let vc = UrlAssetReference::new(
                self.origin,
                Request::parse(Value::new(RcStr::from(src.as_str()).into())),
                IssueSource::from_swc_offsets(
                    Vc::upcast(self.source),
                    issue_span.lo.0 as _,
                    issue_span.hi.0 as _,
                ),
            );

            self.references.push(Vc::upcast(vc));
            self.urls.push((src.to_string(), vc));
        }
    }
}

impl<'a> Visitor<'_> for ModuleReferencesVisitor<'a> {
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
                    self.origin,
                    Request::parse(Value::new(RcStr::from(src).into())),
                    ImportAttributes::new_from_lightningcss(&i.clone().into_owned()).into(),
                    self.import_context,
                    IssueSource::from_line_col(
                        Vc::upcast(self.source),
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

                // let res = i.visit_children(self);
                // res
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
                self.origin,
                Request::parse(Value::new(RcStr::from(src).into())),
                IssueSource::from_line_col(
                    Vc::upcast(self.source),
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
pub async fn css_resolve(
    origin: Vc<Box<dyn ResolveOrigin>>,
    request: Vc<Request>,
    ty: Value<CssReferenceSubType>,
    issue_source: Option<Vc<IssueSource>>,
) -> Vc<ModuleResolveResult> {
    url_resolve(
        origin,
        request,
        Value::new(ReferenceType::Css(ty.into_value())),
        issue_source,
        IssueSeverity::Error.cell(),
    )
}
