use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{
    common::{DUMMY_SP, util::take::Take},
    ecma::ast::{CallExpr, Callee, Expr, ExprOrSpread, Lit},
    quote_expr,
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    NonLocalValue, ResolvedVc, ValueToString, Vc, debug::ValueDebugFormat, trace::TraceRawVcs,
};
use turbopack_core::{
    chunk::{ChunkingContext, ChunkingType},
    ident::AssetIdent,
    issue::IssueSource,
    module::Module,
    reference::ModuleReference,
    reference_type::EcmaScriptModulesReferenceSubType,
    resolve::{
        BindingUsage, ExportUsage, ModuleResolveResult, ModuleResolveResultItem, ResolveErrorMode,
        origin::{ResolveOrigin, ResolveOriginExt},
        parse::Request,
    },
};
use turbopack_resolve::ecmascript::esm_resolve;

use crate::{
    analyzer::imports::ImportAnnotations,
    async_chunk::proxy::{LazyCompilationProxyModule, activation_key},
    chunk::EcmascriptChunkPlaceable,
    code_gen::{CodeGen, CodeGeneration, IntoCodeGenReference},
    create_visitor,
    references::{
        AstPath,
        pattern_mapping::{PatternMapping, ResolveType},
    },
};

#[turbo_tasks::value]
#[derive(Hash, Debug, ValueToString)]
#[value_to_string("dynamic import {request}")]
pub struct EsmAsyncAssetReference {
    pub origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    pub request: ResolvedVc<Request>,
    pub issue_source: IssueSource,
    pub error_mode: ResolveErrorMode,
    pub import_externals: bool,
    /// The export usage extracted from the dynamic import usage pattern.
    /// Detected from destructured await, member access on await, .then()
    /// callback destructuring, or webpackExports/turbopackExports comments.
    pub export_usage: ExportUsage,
    pub resolve_override: Option<ResolvedVc<Box<dyn Module>>>,
    pub request_string: Option<RcStr>,
    pub import_site: RcStr,
    /// Whether the target is compiled only after its runtime proxy is activated.
    pub lazy_compilation: bool,
}

impl EsmAsyncAssetReference {
    #[allow(clippy::too_many_arguments)]
    pub async fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: ResolvedVc<Request>,
        issue_source: IssueSource,
        annotations: ImportAnnotations,
        error_mode: ResolveErrorMode,
        import_externals: bool,
        export_usage: ExportUsage,
        resolve_override: Option<ResolvedVc<Box<dyn Module>>>,
        request_string: Option<RcStr>,
        import_site: RcStr,
        lazy_compilation: bool,
    ) -> Result<Self> {
        // Apply any annotation-driven transition eagerly so the stored origin is final and the
        // `annotations` don't need to be retained on the reference.
        let origin = if let Some(transition) = annotations.transition() {
            origin
                .with_transition(transition.into())
                .await?
                .to_resolved()
                .await?
        } else {
            origin
        };
        Ok(EsmAsyncAssetReference {
            origin,
            request,
            issue_source,
            error_mode,
            import_externals,
            export_usage,
            resolve_override,
            request_string,
            import_site,
            lazy_compilation,
        })
    }

    fn without_lazy_compilation(&self) -> Self {
        Self {
            origin: self.origin,
            request: self.request,
            issue_source: self.issue_source,
            error_mode: self.error_mode,
            import_externals: self.import_externals,
            export_usage: self.export_usage.clone(),
            resolve_override: self.resolve_override,
            request_string: self.request_string.clone(),
            import_site: self.import_site.clone(),
            lazy_compilation: false,
        }
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for EsmAsyncAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        if self.lazy_compilation && self.resolve_override.is_none() {
            let request = self.request.await?;
            // Pattern requests need their resolved result map for runtime dispatch. A constant
            // request can use one proxy and defer resolution and processing until activation.
            if let Some(request_string) = &self.request_string {
                let origin = self.origin.into_trait_ref().await?;
                let ident = AssetIdent::from_path(origin.origin_path())
                    .with_layer(origin.asset_context().into_trait_ref().await?.layer())
                    .with_modifier(
                        format!("lazy compilation proxy {request:?} at {}", self.import_site)
                            .into(),
                    )
                    .into_vc()
                    .to_resolved()
                    .await?;
                let target: ResolvedVc<Box<dyn ModuleReference>> =
                    ResolvedVc::upcast(self.without_lazy_compilation().resolved_cell());
                let key = activation_key(&ident.to_string().await?);
                let proxy = LazyCompilationProxyModule::new_unresolved(
                    *target,
                    *self.request,
                    request_string.clone(),
                    *self.origin,
                    self.import_externals,
                    *ident,
                    key,
                )
                .to_resolved()
                .await?;
                return Ok(*ModuleResolveResult::module(ResolvedVc::upcast(proxy)));
            }
        }

        let result = if let Some(resolved) = &self.resolve_override {
            *ModuleResolveResult::module(*resolved)
        } else {
            esm_resolve(
                *self.origin,
                *self.request,
                EcmaScriptModulesReferenceSubType::DynamicImport,
                self.error_mode,
                Some(self.issue_source),
            )
            .await?
        };

        if !self.lazy_compilation {
            return Ok(result);
        }

        let result = result.await?;
        let mut primary = Vec::with_capacity(result.primary.len());
        for (key, item) in result.primary.iter() {
            let item = if let ModuleResolveResultItem::Module(module) = item
                && let Some(target) =
                    ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(*module)
            {
                let proxy_ident = target
                    .ident()
                    .owned()
                    .await?
                    .with_modifier(rcstr!("lazy compilation proxy"))
                    .into_vc()
                    .to_resolved()
                    .await?;
                let ident = proxy_ident.to_string().await?;
                let proxy = LazyCompilationProxyModule::new_resolved(
                    *target,
                    *proxy_ident,
                    activation_key(&ident),
                )
                .to_resolved()
                .await?;
                ModuleResolveResultItem::Module(ResolvedVc::upcast(proxy))
            } else {
                item.clone()
            };
            primary.push((key.clone(), item));
        }

        Ok(ModuleResolveResult {
            primary: primary.into_boxed_slice(),
            affecting_sources: result.affecting_sources.clone(),
        }
        .cell())
    }

    fn chunking_type(&self) -> Option<ChunkingType> {
        Some(ChunkingType::Async)
    }

    fn binding_usage(&self) -> BindingUsage {
        BindingUsage {
            import: Default::default(),
            export: self.export_usage.clone(),
        }
    }

    fn source(&self) -> Option<IssueSource> {
        Some(self.issue_source)
    }
}

impl IntoCodeGenReference for EsmAsyncAssetReference {
    fn into_code_gen_reference(
        self,
        path: AstPath,
    ) -> (ResolvedVc<Box<dyn ModuleReference>>, CodeGen) {
        let reference = self.resolved_cell();
        (
            ResolvedVc::upcast(reference),
            CodeGen::EsmAsyncAssetReferenceCodeGen(EsmAsyncAssetReferenceCodeGen {
                reference,
                path,
            }),
        )
    }
}

#[derive(
    PartialEq, Eq, TraceRawVcs, ValueDebugFormat, NonLocalValue, Hash, Debug, Encode, Decode,
)]
pub struct EsmAsyncAssetReferenceCodeGen {
    path: AstPath,
    reference: ResolvedVc<EsmAsyncAssetReference>,
}

impl EsmAsyncAssetReferenceCodeGen {
    pub async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let reference = self.reference.await?;

        let pm = PatternMapping::resolve_request(
            *reference.request,
            *reference.origin,
            chunking_context,
            self.reference.resolve_reference(),
            if chunking_context.chunk_loading().await?.can_split_async() {
                ResolveType::AsyncChunkLoader
            } else {
                ResolveType::ChunkItem
            },
            Some(Vc::upcast(*self.reference)),
        )
        .await?;

        let import_externals = reference.import_externals;

        let visitor = create_visitor!(self.path, visit_mut_expr, |expr: &mut Expr| {
            let old_expr = expr.take();
            let message = if let Expr::Call(CallExpr { args, .. }) = old_expr {
                match args.into_iter().next() {
                    Some(ExprOrSpread {
                        spread: None,
                        expr: key_expr,
                    }) => {
                        *expr = pm.create_import(*key_expr, import_externals);
                        return;
                    }
                    // These are SWC bugs: https://github.com/swc-project/swc/issues/5394
                    Some(ExprOrSpread {
                        spread: Some(_),
                        expr: _,
                    }) => "spread operator is illegal in import() expressions.",
                    _ => "import() expressions require at least 1 argument",
                }
            } else {
                "visitor must be executed on a CallExpr"
            };
            let error = quote_expr!(
                "() => { throw new Error($message); }",
                message: Expr = Expr::Lit(Lit::Str(message.into()))
            );
            *expr = Expr::Call(CallExpr {
                callee: Callee::Expr(quote_expr!("Promise.resolve().then")),
                args: vec![ExprOrSpread {
                    spread: None,
                    expr: error,
                }],
                span: DUMMY_SP,
                ..Default::default()
            });
        });

        Ok(CodeGeneration::visitors(vec![visitor]))
    }
}
