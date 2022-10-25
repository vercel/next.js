use anyhow::Result;
use swc_core::{
    common::{
        errors::{Handler, HANDLER},
        Globals, GLOBALS,
    },
    css::{
        ast::{ImportPrelude, ImportPreludeHref, Url, UrlValue},
        visit::{AstNodePath, AstParentKind, VisitAstPath, VisitWithPath},
    },
};
use turbo_tasks::Value;
use turbopack_core::{
    asset::AssetVc,
    reference::{AssetReferenceVc, AssetReferencesVc},
    resolve::{handle_resolve_error, origin::ResolveOriginVc, parse::RequestVc, ResolveResultVc},
};
use turbopack_swc_utils::emitter::IssueEmitter;

use crate::{
    parse::{parse, ParseResult},
    references::{
        import::{ImportAssetReferenceVc, ImportAttributes},
        url::UrlAssetReferenceVc,
    },
    CssInputTransformsVc, CssModuleAssetType,
};

pub(crate) mod import;
pub(crate) mod url;

#[turbo_tasks::function]
pub async fn analyze_css_stylesheet(
    source: AssetVc,
    origin: ResolveOriginVc,
    ty: Value<CssModuleAssetType>,
    transforms: CssInputTransformsVc,
) -> Result<AssetReferencesVc> {
    let mut references = Vec::new();

    let parsed = parse(source, ty, transforms).await?;

    if let ParseResult::Ok {
        stylesheet,
        source_map,
        ..
    } = &*parsed
    {
        let handler = Handler::with_emitter(
            true,
            false,
            box IssueEmitter {
                source,
                source_map: source_map.clone(),
                title: None,
            },
        );
        let globals = Globals::new();
        HANDLER.set(&handler, || {
            GLOBALS.set(&globals, || {
                // TODO migrate to effects
                let mut visitor = AssetReferencesVisitor::new(origin, &mut references);
                stylesheet.visit_with_path(&mut visitor, &mut Default::default());
            })
        });
    }
    Ok(AssetReferencesVc::cell(references))
}

struct AssetReferencesVisitor<'a> {
    origin: ResolveOriginVc,
    references: &'a mut Vec<AssetReferenceVc>,
    is_import: bool,
}

impl<'a> AssetReferencesVisitor<'a> {
    fn new(origin: ResolveOriginVc, references: &'a mut Vec<AssetReferenceVc>) -> Self {
        Self {
            origin,
            references,
            is_import: false,
        }
    }
}

fn url_string(u: &Url) -> &str {
    match &u.value {
        None => {
            println!("invalid css url: no value");
            ""
        }
        Some(box UrlValue::Str(s)) => s.value.as_ref(),
        Some(box UrlValue::Raw(r)) => r.value.as_ref(),
    }
}

pub fn as_parent_path(ast_path: &AstNodePath<'_>) -> Vec<AstParentKind> {
    ast_path.iter().map(|n| n.kind()).collect()
}

impl<'a> VisitAstPath for AssetReferencesVisitor<'a> {
    fn visit_import_prelude<'ast: 'r, 'r>(
        &mut self,
        i: &'ast ImportPrelude,
        ast_path: &mut AstNodePath<'r>,
    ) {
        let src = match &i.href {
            box ImportPreludeHref::Str(s) => s.value.as_ref(),
            // covered by `visit_url` below
            box ImportPreludeHref::Url(ref u) => url_string(u),
        };

        self.references.push(
            ImportAssetReferenceVc::new(
                self.origin,
                RequestVc::parse(Value::new(src.to_string().into())),
                AstPathVc::cell(as_parent_path(ast_path)),
                ImportAttributes::new_from_prelude(i).into(),
            )
            .into(),
        );

        self.is_import = true;
        i.visit_children_with_path(self, ast_path);
        self.is_import = false;
    }

    fn visit_url<'ast: 'r, 'r>(&mut self, u: &'ast Url, ast_path: &mut AstNodePath<'r>) {
        if self.is_import {
            return u.visit_children_with_path(self, ast_path);
        }

        let src = url_string(u);

        self.references.push(
            UrlAssetReferenceVc::new(
                self.origin,
                RequestVc::parse(Value::new(src.to_string().into())),
                AstPathVc::cell(as_parent_path(ast_path)),
            )
            .into(),
        );

        u.visit_children_with_path(self, ast_path);
    }
}

#[turbo_tasks::function]
pub async fn css_resolve(origin: ResolveOriginVc, request: RequestVc) -> Result<ResolveResultVc> {
    let options = origin.resolve_options();
    let result = origin.resolve_asset(request, options);

    handle_resolve_error(result, "css request", origin, request, options).await
}

// TODO enable serialization
#[turbo_tasks::value(transparent, serialization = "none")]
pub struct AstPath(#[turbo_tasks(trace_ignore)] Vec<AstParentKind>);
