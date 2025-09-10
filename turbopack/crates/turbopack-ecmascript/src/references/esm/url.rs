use anyhow::{Result, bail};
use serde::{Deserialize, Serialize};
use swc_core::{
    ecma::ast::{Expr, ExprOrSpread, NewExpr},
    quote,
};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    NonLocalValue, ResolvedVc, TaskInput, ValueToString, Vc, debug::ValueDebugFormat,
    trace::TraceRawVcs,
};
use turbopack_core::{
    chunk::{
        ChunkableModuleReference, ChunkingContext, ChunkingType, ChunkingTypeOption,
        ModuleChunkItemIdExt,
    },
    environment::Rendering,
    issue::IssueSource,
    reference::ModuleReference,
    reference_type::{ReferenceType, UrlReferenceSubType},
    resolve::{
        ExternalType, ModuleResolveResult, origin::ResolveOrigin, parse::Request, url_resolve,
    },
};

use super::base::ReferencedAsset;
use crate::{
    code_gen::{CodeGen, CodeGeneration, IntoCodeGenReference},
    create_visitor,
    references::AstPath,
    runtime_functions::{
        TURBOPACK_RELATIVE_URL, TURBOPACK_REQUIRE, TURBOPACK_RESOLVE_MODULE_ID_PATH,
    },
    utils::module_id_to_lit,
};

/// Determines how to treat `new URL(...)` rewrites.
/// This allows to construct url depends on the different building context,
/// e.g. SSR, CSR, or Node.js.
#[derive(
    Copy,
    Clone,
    Debug,
    Eq,
    PartialEq,
    Hash,
    Serialize,
    Deserialize,
    TraceRawVcs,
    TaskInput,
    NonLocalValue,
)]
pub enum UrlRewriteBehavior {
    /// Omits base, resulting in a relative URL.
    Relative,
    /// Uses the full URL, including the base.
    Full,
    /// Do not attempt to rewrite the URL.
    None,
}

/// URL Asset References are injected during code analysis when we find a
/// (statically analyzable) `new URL("path", import.meta.url)`.
///
/// It's responsible rewriting the `URL` constructor's arguments to allow the
/// referenced file to be imported/fetched/etc.
#[turbo_tasks::value]
pub struct UrlAssetReference {
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    request: ResolvedVc<Request>,
    rendering: Rendering,
    issue_source: IssueSource,
    in_try: bool,
    url_rewrite_behavior: UrlRewriteBehavior,
}

impl UrlAssetReference {
    pub fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: ResolvedVc<Request>,
        rendering: Rendering,
        issue_source: IssueSource,
        in_try: bool,
        url_rewrite_behavior: UrlRewriteBehavior,
    ) -> Self {
        UrlAssetReference {
            origin,
            request,
            rendering,
            issue_source,
            in_try,
            url_rewrite_behavior,
        }
    }

    pub(crate) fn get_referenced_asset(self: Vc<Self>) -> Vc<ReferencedAsset> {
        ReferencedAsset::from_resolve_result(self.resolve_reference())
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for UrlAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        url_resolve(
            *self.origin,
            *self.request,
            ReferenceType::Url(UrlReferenceSubType::EcmaScriptNewUrl),
            Some(self.issue_source),
            self.in_try,
        )
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for UrlAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("new URL({})", self.request.to_string().await?,).into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for UrlAssetReference {
    #[turbo_tasks::function]
    fn chunking_type(&self) -> Vc<ChunkingTypeOption> {
        Vc::cell(Some(ChunkingType::Parallel {
            inherit_async: false,
            hoisted: false,
        }))
    }
}

impl IntoCodeGenReference for UrlAssetReference {
    fn into_code_gen_reference(
        self,
        path: AstPath,
    ) -> (ResolvedVc<Box<dyn ModuleReference>>, CodeGen) {
        let reference = self.resolved_cell();
        (
            ResolvedVc::upcast(reference),
            CodeGen::UrlAssetReferenceCodeGen(UrlAssetReferenceCodeGen { reference, path }),
        )
    }
}

#[derive(PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat, NonLocalValue)]
pub struct UrlAssetReferenceCodeGen {
    reference: ResolvedVc<UrlAssetReference>,
    path: AstPath,
}

impl UrlAssetReferenceCodeGen {
    /// Rewrites call to the `new URL()` ctor depends on the current
    /// conditions. Generated code will point to the output path of the asset,
    /// as similar to the webpack's behavior. This is based on the
    /// configuration (UrlRewriteBehavior), and the current context
    /// (rendering), lastly the asset's condition (if it's referenced /
    /// external). The following table shows the behavior:
    /*
     * original call: `new URL(url, base);`
    ┌───────────────────────────────┬─────────────────────────────────────────────────────────────────────────┬────────────────────────────────────────────────┬───────────────────────┐
    │  UrlRewriteBehavior\RefAsset  │                         ReferencedAsset::Some()                         │           ReferencedAsset::External            │ ReferencedAsset::None │
    ├───────────────────────────────┼─────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────┼───────────────────────┤
    │ Relative                      │ __turbopack_relative_url__(__turbopack_require__(urlId))                │ __turbopack_relative_url__(url)                │ new URL(url, base)    │
    │ Full(RenderingClient::Client) │ new URL(__turbopack_require__(urlId), location.origin)                  │ new URL(url, location.origin)                  │ new URL(url, base)    │
    │ Full(RenderingClient::..)     │ new URL(__turbopack_resolve_module_id_path__(urlId))                    │ new URL(url, base)                             │ new URL(url, base)    │
    │ None                          │ new URL(url, base)                                                      │ new URL(url, base)                             │ new URL(url, base)    │
    └───────────────────────────────┴─────────────────────────────────────────────────────────────────────────┴────────────────────────────────────────────────┴───────────────────────┘
    */
    pub async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let mut visitors = vec![];

        let reference = self.reference.await?;

        match reference.url_rewrite_behavior {
            UrlRewriteBehavior::Relative => {
                let referenced_asset = self.reference.get_referenced_asset().await?;

                // if the referenced url is in the module graph of turbopack, replace it into
                // the chunk item will be emitted into output path to point the
                // static asset path. for the `new URL()` call, replace it into
                // pseudo url object `__turbopack_relative_url__`
                // which is injected by turbopack's runtime to resolve into the relative path
                // omitting the base.
                match &*referenced_asset {
                    ReferencedAsset::Some(asset) => {
                        // We rewrite the first `new URL()` arguments to be a require() of the chunk
                        // item, which exports the static asset path to the linked file.
                        let id = asset.chunk_item_id(chunking_context).await?;

                        visitors.push(create_visitor!(self.path, visit_mut_expr, |new_expr: &mut Expr| {
                            let should_rewrite_to_relative = if let Expr::New(NewExpr { args: Some(args), .. }) = new_expr {
                                matches!(args.first(), Some(ExprOrSpread { .. }))
                            } else {
                                false
                            };

                            if should_rewrite_to_relative {
                                *new_expr = quote!(
                                    "new $turbopack_relative_url($turbopack_require($id))" as Expr,
                                    turbopack_relative_url: Expr = TURBOPACK_RELATIVE_URL.into(),
                                    turbopack_require: Expr = TURBOPACK_REQUIRE.into(),
                                    id: Expr = module_id_to_lit(&id),
                                );
                            }
                        }));
                    }
                    ReferencedAsset::External(request, ExternalType::Url) => {
                        let request = request.to_string();
                        visitors.push(create_visitor!(self.path, visit_mut_expr, |new_expr: &mut Expr| {
                            let should_rewrite_to_relative = if let Expr::New(NewExpr { args: Some(args), .. }) = new_expr {
                                matches!(args.first(), Some(ExprOrSpread { .. }))
                            } else {
                                false
                            };

                            if should_rewrite_to_relative {
                                *new_expr = quote!(
                                    "new $turbopack_relative_url($id)" as Expr,
                                    turbopack_relative_url: Expr = TURBOPACK_RELATIVE_URL.into(),
                                    id: Expr = request.as_str().into(),
                                );
                            }
                        }));
                    }
                    ReferencedAsset::External(request, ty) => {
                        bail!(
                            "Unsupported external type {:?} for URL reference with request: {:?}",
                            ty,
                            request
                        )
                    }
                    ReferencedAsset::None | ReferencedAsset::Unresolvable => {}
                }
            }
            UrlRewriteBehavior::Full => {
                let referenced_asset = self.reference.get_referenced_asset().await?;

                // For rendering environments (CSR), we rewrite the `import.meta.url` to
                // be a location.origin because it allows us to access files from the root of
                // the dev server.
                //
                // By default for the remaining environments, turbopack's runtime have overridden
                // `import.meta.url`.
                let rewrite_url_base = match reference.rendering {
                    Rendering::Client => Some(quote!("location.origin" as Expr)),
                    Rendering::None | Rendering::Server => None,
                };

                match &*referenced_asset {
                    ReferencedAsset::Some(asset) => {
                        // We rewrite the first `new URL()` arguments to be a require() of the
                        // chunk item, which returns the asset path as its exports.
                        let id = asset.chunk_item_id(chunking_context).await?;

                        // If there's a rewrite to the base url, then the current rendering
                        // environment should able to resolve the asset path
                        // (asset_url) from the base. Wrap the module id
                        // with __turbopack_require__ which returns the asset_url.
                        //
                        // Otherwise, the environment should provide an absolute path to the actual
                        // output asset; delegate those calculation to the
                        // runtime fn __turbopack_resolve_module_id_path__.
                        let url_segment_resolver = if rewrite_url_base.is_some() {
                            quote!(
                                "$turbopack_require($id)" as Expr,
                                turbopack_require: Expr = TURBOPACK_REQUIRE.into(),
                                id: Expr = module_id_to_lit(&id),
                            )
                        } else {
                            quote!(
                                "$turbopack_resolve_module_id_path($id)" as Expr,
                                turbopack_resolve_module_id_path: Expr = TURBOPACK_RESOLVE_MODULE_ID_PATH.into(),
                                id: Expr = module_id_to_lit(&id),
                            )
                        };

                        visitors.push(create_visitor!(
                            self.path,
                            visit_mut_expr,
                            |new_expr: &mut Expr| {
                                if let Expr::New(NewExpr {
                                    args: Some(args), ..
                                }) = new_expr
                                {
                                    if let Some(ExprOrSpread {
                                        box expr,
                                        spread: None,
                                    }) = args.get_mut(0)
                                    {
                                        *expr = url_segment_resolver.clone();
                                    }

                                    if let Some(ExprOrSpread {
                                        box expr,
                                        spread: None,
                                    }) = args.get_mut(1)
                                    {
                                        if let Some(rewrite) = &rewrite_url_base {
                                            *expr = rewrite.clone();
                                        } else {
                                            // If rewrite for the base doesn't exists, means
                                            // __turbopack_resolve_module_id_path__
                                            // should resolve the full path correctly and there
                                            // shouldn't be a base.
                                            args.remove(1);
                                        }
                                    }
                                }
                            }
                        ));
                    }
                    ReferencedAsset::External(request, ExternalType::Url) => {
                        let request = request.to_string();
                        visitors.push(create_visitor!(
                            self.path,
                            visit_mut_expr,
                            |new_expr: &mut Expr| {
                                if let Expr::New(NewExpr {
                                    args: Some(args), ..
                                }) = new_expr
                                {
                                    if let Some(ExprOrSpread {
                                        box expr,
                                        spread: None,
                                    }) = args.get_mut(0)
                                    {
                                        *expr = request.as_str().into()
                                    }

                                    if let Some(rewrite) = &rewrite_url_base
                                        && let Some(ExprOrSpread {
                                            box expr,
                                            spread: None,
                                        }) = args.get_mut(1)
                                    {
                                        *expr = rewrite.clone();
                                    }
                                }
                            }
                        ));
                    }
                    ReferencedAsset::External(request, ty) => {
                        bail!(
                            "Unsupported external type {:?} for URL reference with request: {:?}",
                            ty,
                            request
                        )
                    }
                    ReferencedAsset::None | ReferencedAsset::Unresolvable => {}
                }
            }
            UrlRewriteBehavior::None => {
                // Asked to not rewrite the URL, so we don't do anything.
            }
        };

        Ok(CodeGeneration::visitors(visitors))
    }
}
