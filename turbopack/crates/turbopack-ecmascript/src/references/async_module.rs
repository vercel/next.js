use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{
    common::DUMMY_SP,
    ecma::{
        ast::{
            ArrayLit, ArrayPat, ArrowExpr, AwaitExpr, BlockStmt, Bool, Expr, FnDecl, FnExpr, Ident,
            Invalid, Lit, Stmt, YieldExpr,
        },
        visit::{VisitMut, VisitMutWith},
    },
    quote,
};
use turbo_rcstr::rcstr;
use turbo_tasks::{
    FxIndexSet, NonLocalValue, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc,
    trace::TraceRawVcs,
};
use turbopack_core::{
    chunk::{AsyncModuleInfo, ChunkingContext, ChunkingType},
    reference::{ModuleReference, ModuleReferences},
    resolve::ExternalType,
};

use crate::{
    ScopeHoistingContext,
    code_gen::{BodyWrapperFn, CodeGeneration, CodeGenerationHoistedStmt},
    references::esm::base::ReferencedAsset,
    utils::AstSyntaxContext,
};

/// Information needed for generating the async module wrapper for
/// [EcmascriptChunkItem](crate::chunk::EcmascriptChunkItem)s.
#[derive(PartialEq, Eq, Default, Debug, Clone, TraceRawVcs, NonLocalValue, Encode, Decode)]
pub struct AsyncModuleOptions {
    pub has_top_level_await: bool,
}

/// Option<[AsyncModuleOptions]>.
#[turbo_tasks::value(transparent)]
pub struct OptionAsyncModuleOptions(Option<AsyncModuleOptions>);

#[turbo_tasks::value_impl]
impl OptionAsyncModuleOptions {
    #[turbo_tasks::function]
    pub(crate) fn none() -> Vc<Self> {
        Vc::cell(None)
    }
}

/// Contains the information necessary to decide if an ecmascript module is
/// async.
///
/// It will check if the current module or any of it's children contain a top
/// level await statement or is referencing an external ESM module.
#[turbo_tasks::value(shared)]
pub struct AsyncModule {
    pub has_top_level_await: bool,
    pub import_externals: bool,
}

/// Option<[AsyncModule]>.
#[turbo_tasks::value(transparent)]
pub struct OptionAsyncModule(Option<ResolvedVc<AsyncModule>>);

#[turbo_tasks::value_impl]
impl OptionAsyncModule {
    /// Create an empty [OptionAsyncModule].
    #[turbo_tasks::function]
    pub fn none() -> Vc<Self> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    pub fn module_options(
        &self,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Vc<OptionAsyncModuleOptions> {
        if let Some(async_module) = &self.0 {
            return async_module.module_options(async_module_info);
        }

        OptionAsyncModuleOptions::none()
    }
}

/// The identifiers (and their corresponding syntax context) of all async modules referenced by the
/// current module.
#[turbo_tasks::value(transparent)]
struct AsyncModuleIdents(
    #[bincode(with = "turbo_bincode::indexset")] FxIndexSet<(String, AstSyntaxContext)>,
);

async fn get_inherit_async_referenced_asset(
    r: ResolvedVc<Box<dyn ModuleReference>>,
) -> Result<Option<ReferencedAsset>> {
    let trait_ref = r.into_trait_ref().await?;
    let Some(ty) = &trait_ref.chunking_type() else {
        return Ok(None);
    };
    if !matches!(
        ty,
        ChunkingType::Parallel {
            inherit_async: true,
            ..
        }
    ) {
        return Ok(None);
    };
    let referenced_asset: ReferencedAsset =
        ReferencedAsset::from_resolve_result(r.resolve_reference()).await?;
    Ok(Some(referenced_asset))
}

#[turbo_tasks::value_impl]
impl AsyncModule {
    #[turbo_tasks::function]
    async fn get_async_idents(
        &self,
        async_module_info: Vc<AsyncModuleInfo>,
        references: Vc<ModuleReferences>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<AsyncModuleIdents>> {
        let async_module_info = async_module_info.await?;

        let reference_idents = references
            .await?
            .iter()
            .map(|r| async {
                let Some(referenced_asset) = get_inherit_async_referenced_asset(*r).await? else {
                    return Ok(None);
                };
                Ok(match &referenced_asset {
                    ReferencedAsset::External(_, ExternalType::EcmaScriptModule) => {
                        if self.import_externals {
                            referenced_asset
                                .get_ident(chunking_context, None, ScopeHoistingContext::None)
                                .await?
                                .map(|i| i.into_module_namespace_ident().unwrap())
                                .map(|(i, ctx)| (i, ctx.unwrap_or_default().into()))
                        } else {
                            None
                        }
                    }
                    ReferencedAsset::Some(placeable) => {
                        if async_module_info
                            .referenced_async_modules
                            .contains(&ResolvedVc::upcast(*placeable))
                        {
                            referenced_asset
                                .get_ident(chunking_context, None, ScopeHoistingContext::None)
                                .await?
                                .map(|i| i.into_module_namespace_ident().unwrap())
                                .map(|(i, ctx)| (i, ctx.unwrap_or_default().into()))
                        } else {
                            None
                        }
                    }
                    ReferencedAsset::External(..) => None,
                    ReferencedAsset::None | ReferencedAsset::Unresolvable => None,
                })
            })
            .try_flat_join()
            .await?;

        Ok(Vc::cell(FxIndexSet::from_iter(reference_idents)))
    }

    #[turbo_tasks::function]
    pub(crate) async fn is_self_async(&self, references: Vc<ModuleReferences>) -> Result<Vc<bool>> {
        if self.has_top_level_await {
            return Ok(Vc::cell(true));
        }

        Ok(Vc::cell(
            self.import_externals
                && references
                    .await?
                    .iter()
                    .map(|r| async {
                        let Some(referenced_asset) = get_inherit_async_referenced_asset(*r).await?
                        else {
                            return Ok(false);
                        };
                        Ok(matches!(
                            &referenced_asset,
                            ReferencedAsset::External(_, ExternalType::EcmaScriptModule)
                        ))
                    })
                    .try_join()
                    .await?
                    .iter()
                    .any(|&b| b),
        ))
    }

    /// Returns
    #[turbo_tasks::function]
    pub fn module_options(
        &self,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Vc<OptionAsyncModuleOptions> {
        if async_module_info.is_none() {
            return Vc::cell(None);
        }

        Vc::cell(Some(AsyncModuleOptions {
            has_top_level_await: self.has_top_level_await,
        }))
    }
}

impl AsyncModule {
    pub async fn code_generation(
        self: Vc<Self>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
        references: Vc<ModuleReferences>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let this = self.await?;

        let supports_async_await = *chunking_context
            .environment()
            .runtime_versions()
            .supports_async_await()
            .await?;

        if let Some(async_module_info) = async_module_info {
            let async_idents = self
                .get_async_idents(async_module_info, references, chunking_context)
                .await?;

            let has_top_level_await = this.has_top_level_await;
            let body_wrapper: Option<BodyWrapperFn> = Some(Box::new(move |body_stmts| {
                wrap_body_in_async_module(body_stmts, has_top_level_await, supports_async_await)
            }));

            if !async_idents.is_empty() {
                let idents = async_idents
                    .iter()
                    .map(|(ident, ctxt)| Ident::new(ident.clone().into(), DUMMY_SP, **ctxt))
                    .collect::<Vec<_>>();

                return Ok(CodeGeneration {
                    hoisted_stmts: [
                        CodeGenerationHoistedStmt::new(rcstr!("__turbopack_async_dependencies__"),
                            quote!(
                                "var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__($deps);"
                                    as Stmt,
                                deps: Expr = Expr::Array(ArrayLit {
                                    span: DUMMY_SP,
                                    elems: idents
                                        .iter()
                                        .map(|ident| { Some(Expr::Ident(ident.clone()).into()) })
                                        .collect(),
                                })
                            )
                        ),
                        CodeGenerationHoistedStmt::new(rcstr!("__turbopack_async_dependencies__ await"), {
                            let mut stmt = quote!(
                                "($deps = __turbopack_async_dependencies__.then ? (await \
                                __turbopack_async_dependencies__)() : __turbopack_async_dependencies__);" as Stmt,
                                deps: AssignTarget = ArrayPat {
                                    span: DUMMY_SP,
                                    elems: idents
                                        .into_iter()
                                        .map(|ident| { Some(ident.into()) })
                                        .collect(),
                                    optional: false,
                                    type_ann: None,
                                }.into(),
                            );
                            if !supports_async_await {
                                replace_await_with_yield(&mut stmt);
                            }
                            stmt
                        }),
                    ].to_vec(),
                    body_wrapper,
                    ..Default::default()
                });
            }

            return Ok(CodeGeneration {
                body_wrapper,
                ..Default::default()
            });
        }

        Ok(CodeGeneration::empty())
    }
}

/// Wraps a list of module body statements in the Turbopack async module closure:
///
/// ```js
/// return __turbopack_context__.a(
///   async function(__turbopack_handle_async_dependencies__, __turbopack_async_result__) {
///     try {
///       ...body_stmts...
///       __turbopack_async_result__();
///     } catch(e) {
///       __turbopack_async_result__(e);
///     }
///   },
///   has_top_level_await
/// );
/// ```
pub(crate) fn wrap_body_in_async_module(
    body_stmts: Vec<Stmt>,
    has_top_level_await: bool,
    supports_async_await: bool,
) -> Vec<Stmt> {
    let mut try_body = body_stmts;
    try_body.push(quote!("__turbopack_async_result__();" as Stmt));

    // For generator-based wrapping, convert all await expressions in the body to yield
    if !supports_async_await {
        for stmt in &mut try_body {
            replace_await_with_yield(stmt);
        }
    }

    let mut try_catch = quote!("try {} catch(e) { __turbopack_async_result__(e); }" as Stmt);
    if let Stmt::Try(try_stmt) = &mut try_catch {
        try_stmt.block.stmts = try_body;
    } else {
        unreachable!("quote! should produce a TryStmt");
    }

    // Use async function or generator function depending on environment support
    let handler = if supports_async_await {
        let mut handler = quote!(
            "async function(__turbopack_handle_async_dependencies__, __turbopack_async_result__) {}"
                as Expr
        );
        if let Expr::Fn(fn_expr) = &mut handler {
            fn_expr.function.body = Some(BlockStmt {
                span: DUMMY_SP,
                stmts: vec![try_catch],
                ctxt: Default::default(),
            });
        } else {
            unreachable!("quote! should produce a FnExpr");
        }
        handler
    } else {
        // Legacy: wrap a generator IIFE inside a regular function with an inline
        // driver.  The generator is created and stepped through immediately,
        // resolving yielded promises.  This keeps the generator-driving logic
        // out of the shared runtime so modern environments pay zero cost.
        let mut gen_fn = quote!("function*() {}" as Expr);
        if let Expr::Fn(fn_expr) = &mut gen_fn {
            fn_expr.function.body = Some(BlockStmt {
                span: DUMMY_SP,
                stmts: vec![try_catch],
                ctxt: Default::default(),
            });
        } else {
            unreachable!("quote! should produce a FnExpr");
        }

        let gen_init = quote!("var __gen = $gen_fn();" as Stmt, gen_fn: Expr = gen_fn);

        let step_call = quote!(
            "(function __step(k, a) { try { var r = __gen[k](a); } catch(e) { \
             __turbopack_async_result__(e); return; } if (!r.done) \
             Promise.resolve(r.value).then(function(v) { __step('next', v); }, function(e) { \
             __step('throw', e); }); })('next');" as Stmt
        );

        let mut handler = quote!(
            "function(__turbopack_handle_async_dependencies__, __turbopack_async_result__) {}"
                as Expr
        );
        if let Expr::Fn(fn_expr) = &mut handler {
            fn_expr.function.body = Some(BlockStmt {
                span: DUMMY_SP,
                stmts: vec![gen_init, step_call],
                ctxt: Default::default(),
            });
        } else {
            unreachable!("quote! should produce a FnExpr");
        }
        handler
    };

    vec![quote!(
        "return __turbopack_context__.a($handler, $tla);" as Stmt,
        handler: Expr = handler,
        tla: Expr = Expr::Lit(Lit::Bool(Bool { span: DUMMY_SP, value: has_top_level_await })),
    )]
}

/// Replaces `AwaitExpr` nodes with `YieldExpr` in the given statement,
/// stopping at function boundaries (nested async functions are already
/// downleveled by SWC's preset-env before this runs).
fn replace_await_with_yield(stmt: &mut Stmt) {
    struct AwaitToYield;
    impl VisitMut for AwaitToYield {
        fn visit_mut_expr(&mut self, expr: &mut Expr) {
            expr.visit_mut_children_with(self);
            if let Expr::Await(_) = expr {
                let old_expr = std::mem::replace(expr, Expr::Invalid(Invalid { span: DUMMY_SP }));
                if let Expr::Await(AwaitExpr { span, arg }) = old_expr {
                    *expr = Expr::Yield(YieldExpr {
                        span,
                        delegate: false,
                        arg: Some(arg),
                    });
                } else {
                    unreachable!();
                }
            }
        }

        // Stop at function boundaries — only transform top-level awaits,
        // not awaits inside nested functions.
        fn visit_mut_fn_expr(&mut self, _: &mut FnExpr) {}
        fn visit_mut_fn_decl(&mut self, _: &mut FnDecl) {}
        fn visit_mut_arrow_expr(&mut self, _: &mut ArrowExpr) {}
    }
    stmt.visit_mut_with(&mut AwaitToYield);
}
