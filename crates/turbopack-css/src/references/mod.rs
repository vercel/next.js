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
    context::AssetContextVc,
    reference::{AssetReferenceVc, AssetReferencesVc},
    resolve::{handle_resolve_error, parse::RequestVc, ResolveResultVc},
};

use crate::{
    parse::{parse, Buffer, ParseResult},
    references::{
        import::{ImportAssetReferenceVc, ImportAttributes},
        url::UrlAssetReferenceVc,
    },
};

pub(crate) mod import;
pub(crate) mod url;

#[turbo_tasks::function]
pub async fn analyze_css_stylesheet(
    source: AssetVc,
    context: AssetContextVc,
) -> Result<AssetReferencesVc> {
    analyze_css_stylesheet_(source, context).await
}

pub async fn analyze_css_stylesheet_(
    source: AssetVc,
    context: AssetContextVc,
) -> Result<AssetReferencesVc> {
    let mut references = Vec::new();

    let parsed = parse(source).await?;

    if let ParseResult::Ok {
        stylesheet,
        source_map,
        ..
    } = &*parsed
    {
        let buf = Buffer::new();
        let handler = Handler::with_emitter_writer(Box::new(buf.clone()), Some(source_map.clone()));
        let globals = Globals::new();
        HANDLER.set(&handler, || {
            GLOBALS.set(&globals, || {
                // TODO migrate to effects
                let mut visitor = AssetReferencesVisitor::new(context, &mut references);
                stylesheet.visit_with_path(&mut visitor, &mut Default::default());
            })
        });

        if !buf.is_empty() {
            // TODO report them in a stream
            println!("{}", buf);
        }
    }
    Ok(AssetReferencesVc::cell(references))
}

struct AssetReferencesVisitor<'a> {
    context: AssetContextVc,
    references: &'a mut Vec<AssetReferenceVc>,
    is_import: bool,
}

impl<'a> AssetReferencesVisitor<'a> {
    fn new(context: AssetContextVc, references: &'a mut Vec<AssetReferenceVc>) -> Self {
        Self {
            context,
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
        Some(UrlValue::Str(s)) => s.value.as_ref(),
        Some(UrlValue::Raw(r)) => r.value.as_ref(),
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
            ImportPreludeHref::Str(s) => s.value.as_ref(),
            // covered by `visit_url` below
            ImportPreludeHref::Url(u) => url_string(u),
        };

        self.references.push(
            ImportAssetReferenceVc::new(
                self.context,
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
                self.context,
                RequestVc::parse(Value::new(src.to_string().into())),
                AstPathVc::cell(as_parent_path(ast_path)),
            )
            .into(),
        );

        u.visit_children_with_path(self, ast_path);
    }
}

#[turbo_tasks::function]
pub async fn css_resolve(request: RequestVc, context: AssetContextVc) -> Result<ResolveResultVc> {
    let context_path = context.context_path();
    let options = context.resolve_options();
    let result = context.resolve_asset(context_path, request, options);

    handle_resolve_error(result, "css request", context_path, request, options).await
}

// TODO enable serialization
#[turbo_tasks::value(transparent, serialization = "none")]
pub struct AstPath(#[turbo_tasks(trace_ignore)] Vec<AstParentKind>);
