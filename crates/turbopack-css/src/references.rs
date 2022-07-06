use anyhow::Result;
use swc_common::{
    errors::{Handler, HANDLER},
    Globals, GLOBALS,
};
use swc_css::{
    ast::{ImportPrelude, ImportPreludeHref, Url, UrlValue},
    visit::{self, Visit, VisitWith},
};
use turbo_tasks::{
    primitives::{BoolVc, StringVc},
    Value,
};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::AssetVc,
    chunk::{ChunkableAssetReference, ChunkableAssetReferenceVc},
    context::AssetContextVc,
    reference::{AssetReference, AssetReferenceVc, AssetReferencesVc},
    resolve::{parse::RequestVc, ResolveResult, ResolveResultVc},
};

use super::parse::{parse, ParseResult};
use crate::parse::Buffer;

#[turbo_tasks::function]
pub async fn module_references(
    source: AssetVc,
    context: AssetContextVc,
) -> Result<AssetReferencesVc> {
    module_references_(source, context).await
}

pub async fn module_references_(
    source: AssetVc,
    context: AssetContextVc,
) -> Result<AssetReferencesVc> {
    let mut references = Vec::new();

    let parsed = parse(source).await?;

    match &*parsed {
        ParseResult::Ok {
            stylesheet,
            source_map,
            ..
        } => {
            let buf = Buffer::new();
            let handler =
                Handler::with_emitter_writer(Box::new(buf.clone()), Some(source_map.clone()));
            let globals = Globals::new();
            HANDLER.set(&handler, || {
                GLOBALS.set(&globals, || {
                    // TODO migrate to effects
                    let mut visitor = AssetReferencesVisitor::new(context, &mut references);
                    stylesheet.visit_with(&mut visitor);
                })
            });

            if !buf.is_empty() {
                // TODO report them in a stream
                println!("{}", buf);
            }
        }
        ParseResult::Unparseable | ParseResult::NotFound => {}
    };
    Ok(AssetReferencesVc::cell(references))
}

struct AssetReferencesVisitor<'a> {
    context: AssetContextVc,
    references: &'a mut Vec<AssetReferenceVc>,
}

impl<'a> AssetReferencesVisitor<'a> {
    fn new(context: AssetContextVc, references: &'a mut Vec<AssetReferenceVc>) -> Self {
        Self {
            context,
            references,
        }
    }
}

impl<'a> Visit for AssetReferencesVisitor<'a> {
    fn visit_import_prelude(&mut self, i: &ImportPrelude) {
        let src = match &i.href {
            ImportPreludeHref::Str(s) => Some(s.value.to_string()),
            // covered by `visit_url` below
            ImportPreludeHref::Url(_) => None,
        };

        if let Some(src) = src {
            self.references.push(
                UrlAssetReferenceVc::new(self.context, RequestVc::parse(Value::new(src.into())))
                    .into(),
            );
        }

        visit::visit_import_prelude(self, i)
    }

    fn visit_url(&mut self, u: &Url) {
        let src = match &u.value {
            None => None,
            Some(UrlValue::Str(s)) => Some(s.value.to_string()),
            Some(UrlValue::Raw(r)) => Some(r.value.to_string()),
        };

        if let Some(src) = src {
            self.references.push(
                UrlAssetReferenceVc::new(self.context, RequestVc::parse(Value::new(src.into())))
                    .into(),
            );
        }

        visit::visit_url(self, u)
    }
}

#[turbo_tasks::function]
pub async fn url_resolve(request: RequestVc, context: AssetContextVc) -> Result<ResolveResultVc> {
    let context_path = context.context_path();
    let options = context.resolve_options();
    let result = context.resolve_asset(context_path, request, options);

    handle_resolve_error(result, context_path, request).await
}

pub async fn handle_resolve_error(
    result: ResolveResultVc,
    context_path: FileSystemPathVc,
    request: RequestVc,
) -> Result<ResolveResultVc> {
    Ok(match result.is_unresolveable().await {
        Ok(unresolveable) => {
            if *unresolveable {
                // TODO report this to stream
                println!(
                    "unable to resolve {} in {}",
                    request.to_string().await?,
                    context_path.to_string().await?
                );
            }
            result
        }
        Err(err) => {
            // TODO report this to stream
            println!(
                "fatal error during resolving request {} in {}: {}",
                request.to_string().await?,
                context_path.to_string().await?,
                err
            );
            ResolveResult::unresolveable().into()
        }
    })
}

#[turbo_tasks::value(AssetReference, ChunkableAssetReference)]
#[derive(Hash, Debug)]
pub struct UrlAssetReference {
    pub context: AssetContextVc,
    pub request: RequestVc,
}

#[turbo_tasks::value_impl]
impl UrlAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(context: AssetContextVc, request: RequestVc) -> Self {
        Self::cell(UrlAssetReference { context, request })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for UrlAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        url_resolve(self.request, self.context)
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "url {}",
            self.request.to_string().await?,
        )))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAssetReference for UrlAssetReference {
    #[turbo_tasks::function]
    fn is_chunkable(&self) -> BoolVc {
        BoolVc::cell(true)
    }
}
