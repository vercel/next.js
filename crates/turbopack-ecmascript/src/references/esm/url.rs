use anyhow::Result;
use swc_core::{
    ecma::ast::{Expr, ExprOrSpread, NewExpr},
    quote,
};
use turbo_tasks::{Value, ValueToString, Vc};
use turbopack_core::{
    chunk::{ChunkableModuleReference, ChunkingType, ChunkingTypeOption},
    environment::Rendering,
    issue::{code_gen::CodeGenerationIssue, IssueExt, IssueSeverity, IssueSource},
    reference::AssetReference,
    reference_type::UrlReferenceSubType,
    resolve::{origin::ResolveOrigin, parse::Request, ResolveResult},
};

use super::base::ReferencedAsset;
use crate::{
    chunk::{item::EcmascriptChunkItemExt, EcmascriptChunkPlaceable, EcmascriptChunkingContext},
    code_gen::{CodeGenerateable, CodeGeneration},
    create_visitor,
    references::AstPath,
    resolve::{try_to_severity, url_resolve},
    utils::module_id_to_lit,
};

/// URL Asset References are injected during code analysis when we find a
/// (staticly analyzable) `new URL("path", import.meta.url)`.
///
/// It's responsible rewriting the `URL` constructor's arguments to allow the
/// referenced file to be imported/fetched/etc.
#[turbo_tasks::value]
pub struct UrlAssetReference {
    origin: Vc<Box<dyn ResolveOrigin>>,
    request: Vc<Request>,
    rendering: Vc<Rendering>,
    ast_path: Vc<AstPath>,
    issue_source: Vc<IssueSource>,
    in_try: bool,
}

#[turbo_tasks::value_impl]
impl UrlAssetReference {
    #[turbo_tasks::function]
    pub fn new(
        origin: Vc<Box<dyn ResolveOrigin>>,
        request: Vc<Request>,
        rendering: Vc<Rendering>,
        ast_path: Vc<AstPath>,
        issue_source: Vc<IssueSource>,
        in_try: bool,
    ) -> Vc<Self> {
        UrlAssetReference {
            origin,
            request,
            rendering,
            ast_path,
            issue_source,
            in_try,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub(super) async fn get_referenced_asset(self: Vc<Self>) -> Result<Vc<ReferencedAsset>> {
        let this = self.await?;
        Ok(ReferencedAsset::from_resolve_result(
            self.resolve_reference(),
            this.request,
        ))
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for UrlAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Vc<ResolveResult> {
        url_resolve(
            self.origin,
            self.request,
            Value::new(UrlReferenceSubType::EcmaScriptNewUrl),
            self.issue_source,
            try_to_severity(self.in_try),
        )
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for UrlAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<String>> {
        Ok(Vc::cell(format!(
            "new URL({})",
            self.request.to_string().await?,
        )))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for UrlAssetReference {
    #[turbo_tasks::function]
    fn chunking_type(&self) -> Vc<ChunkingTypeOption> {
        Vc::cell(Some(ChunkingType::PlacedOrParallel))
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for UrlAssetReference {
    #[turbo_tasks::function]
    async fn code_generation(
        self: Vc<Self>,
        context: Vc<Box<dyn EcmascriptChunkingContext>>,
    ) -> Result<Vc<CodeGeneration>> {
        let this = self.await?;
        let mut visitors = vec![];

        let referenced_asset = self.get_referenced_asset().await?;

        // For rendering environments (CSR and SSR), we rewrite the `import.meta.url` to
        // be a location.origin because it allows us to access files from the root of
        // the dev server. It's important that this be rewritten for SSR as well, so
        // that the client's hydration matches exactly.
        //
        // In a non-rendering env, the `import.meta.url` is already the correct `file://` URL
        // to load files.
        let rewrite = match &*this.rendering.await? {
            Rendering::None => {
                CodeGenerationIssue {
                    severity: IssueSeverity::Error.into(),
                    title: Vc::cell("new URL(…) not implemented for this environment".to_string()),
                    message: Vc::cell(
                        "new URL(…) is only currently supported for rendering environments like \
                         Client-Side or Server-Side Rendering."
                            .to_string(),
                    ),
                    path: this.origin.origin_path(),
                }
                .cell()
                .emit();
                None
            }
            Rendering::Client => Some(quote!("location.origin" as Expr)),
            Rendering::Server(server_addr) => {
                let location = server_addr.await?.to_string()?;
                Some(location.into())
            }
        };

        let ast_path = this.ast_path.await?;

        match &*referenced_asset {
            ReferencedAsset::Some(asset) => {
                // We rewrite the first `new URL()` arguments to be a require() of the chunk
                // item, which exports the static asset path to the linked file.
                let id = asset.as_chunk_item(context).id().await?;

                visitors.push(
                    create_visitor!(ast_path, visit_mut_expr(new_expr: &mut Expr) {
                        if let Expr::New(NewExpr { args: Some(args), .. }) = new_expr {
                            if let Some(ExprOrSpread { box expr, spread: None }) = args.get_mut(0) {
                                *expr = quote!(
                                    "__turbopack_require__($id)" as Expr,
                                    id: Expr = module_id_to_lit(&id),
                                );
                            }

                            if let Some(rewrite) = &rewrite {
                                if let Some(ExprOrSpread { box expr, spread: None }) = args.get_mut(1) {
                                    *expr = rewrite.clone();
                                }
                            }
                        }
                    }),
                );
            }
            ReferencedAsset::OriginalReferenceTypeExternal(request) => {
                let request = request.to_string();
                visitors.push(
                    create_visitor!(ast_path, visit_mut_expr(new_expr: &mut Expr) {
                        if let Expr::New(NewExpr { args: Some(args), .. }) = new_expr {
                            if let Some(ExprOrSpread { box expr, spread: None }) = args.get_mut(0) {
                                *expr = request.as_str().into()
                            }

                            if let Some(rewrite) = &rewrite {
                                if let Some(ExprOrSpread { box expr, spread: None }) = args.get_mut(1) {
                                    *expr = rewrite.clone();
                                }
                            }
                        }
                    }),
                );
            }
            ReferencedAsset::None => {}
        }

        Ok(CodeGeneration { visitors }.into())
    }
}
