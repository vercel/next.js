use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{
    ecma::ast::{Expr, ExprOrSpread, Lit},
    quote_expr,
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    NonLocalValue, ResolvedVc, ValueToString, Vc, debug::ValueDebugFormat, trace::TraceRawVcs,
    turbofmt,
};
use turbo_tasks_hash::{encode_hex, hash_xxh3_hash64};
use turbopack_core::{
    chunk::{AsyncModuleInfo, ChunkableModule, ChunkingContext, ChunkingType},
    ident::AssetIdent,
    issue::IssueSource,
    module::{Module, ModuleSideEffects},
    module_graph::ModuleGraph,
    reference::{ModuleReference, ModuleReferences},
    reference_type::{ReferenceType, WorkerReferenceSubType},
    resolve::{
        ModuleResolveResult, ModuleResolveResultItem, ResolveErrorMode, origin::ResolveOrigin,
        parse::Request, url_resolve,
    },
    source::OptionSource,
};

use crate::{
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkPlaceable, EcmascriptExports,
        ecmascript_chunk_item,
    },
    code_gen::{CodeGen, CodeGeneration, IntoCodeGenReference},
    create_visitor,
    references::AstPath,
};

/// The root-served file name for a service worker registered at `scope`. One worker is supported
/// **per scope**; the scope is encoded into the (flat, root-served) file name so distinct scopes
/// get distinct files.
///
/// The human-readable slug is lossy (e.g. `/foo/bar` and `/foo-bar` both slugify to `foo-bar`), so
/// a hash of the original scope is appended to guarantee distinct scopes get distinct file names.
pub fn service_worker_chunk_filename(scope: &str) -> RcStr {
    let trimmed = scope.trim_matches('/');
    if trimmed.is_empty() {
        return rcstr!("sw.js");
    }
    let slug: String = trimmed
        .chars()
        .map(|c| match c {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' => c,
            _ => '-',
        })
        .collect();
    let hash = encode_hex(hash_xxh3_hash64(trimmed));
    RcStr::from(format!("sw-{slug}-{hash}.js"))
}

/// A marker module that wraps a service-worker entry source plus its registration `scope`. It
/// carries the inner source so `next-api` can discover it in the module graph and compile it
/// standalone.
#[turbo_tasks::value(shared)]
pub struct ServiceWorkerEntryModule {
    pub inner: ResolvedVc<Box<dyn Module>>,
    pub scope: RcStr,
}

#[turbo_tasks::value_impl]
impl Module for ServiceWorkerEntryModule {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(self
            .inner
            .ident()
            .owned()
            .await?
            .with_modifier(format!("service worker entry [{}]", self.scope).into())
            .into_vc())
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionSource> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<ModuleReferences> {
        Vc::cell(vec![])
    }

    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        ModuleSideEffects::ModuleEvaluationIsSideEffectFree.cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for ServiceWorkerEntryModule {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        ecmascript_chunk_item(ResolvedVc::upcast(self), module_graph, chunking_context)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for ServiceWorkerEntryModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::None.cell()
    }

    #[turbo_tasks::function]
    fn chunk_item_content(
        &self,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
        _module_graph: Vc<ModuleGraph>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
        _estimated: bool,
    ) -> Vc<EcmascriptChunkItemContent> {
        // Marker module: contributes no code to the page bundle.
        EcmascriptChunkItemContent::default().cell()
    }
}

/// Reference created for `navigator.serviceWorker.register(new URL(...), { scope })`. It resolves
/// the URL to the service-worker source and wraps it in a [`ServiceWorkerEntryModule`] (carrying
/// the `scope`) so the source is discoverable in the page's module graph (but not bundled into it).
#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct ServiceWorkerAssetReference {
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    request: ResolvedVc<Request>,
    scope: RcStr,
    issue_source: IssueSource,
    error_mode: ResolveErrorMode,
}

impl ServiceWorkerAssetReference {
    pub fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: ResolvedVc<Request>,
        scope: RcStr,
        issue_source: IssueSource,
        error_mode: ResolveErrorMode,
    ) -> Self {
        ServiceWorkerAssetReference {
            origin,
            request,
            scope,
            issue_source,
            error_mode,
        }
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for ServiceWorkerAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        let result = url_resolve(
            *self.origin,
            *self.request,
            ReferenceType::Worker(WorkerReferenceSubType::ServiceWorker),
            Some(self.issue_source),
            self.error_mode,
        );

        let result_ref = result.await?;
        let mut primary = Vec::with_capacity(result_ref.primary.len());
        for (request_key, item) in result_ref.primary.iter() {
            match item {
                ModuleResolveResultItem::Module(module) => {
                    let marker = ServiceWorkerEntryModule {
                        inner: *module,
                        scope: self.scope.clone(),
                    }
                    .resolved_cell();
                    primary.push((
                        request_key.clone(),
                        ModuleResolveResultItem::Module(ResolvedVc::upcast(marker)),
                    ));
                }
                _ => primary.push((request_key.clone(), item.clone())),
            }
        }

        Ok(ModuleResolveResult {
            primary: primary.into_boxed_slice(),
            affecting_sources: result_ref.affecting_sources.clone(),
        }
        .cell())
    }

    fn chunking_type(&self) -> Option<ChunkingType> {
        // Keep the marker in the page graph (so it is discoverable) without making it
        // an async/isolated boundary. It emits no code, so it adds nothing to the bundle.
        Some(ChunkingType::Parallel {
            inherit_async: false,
            hoisted: false,
        })
    }

    fn source(&self) -> Option<IssueSource> {
        Some(self.issue_source)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for ServiceWorkerAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        let request = self.request.to_string();
        Ok(Vc::cell(turbofmt!("service worker {request}").await?))
    }
}

impl IntoCodeGenReference for ServiceWorkerAssetReference {
    fn into_code_gen_reference(
        self,
        path: AstPath,
    ) -> (ResolvedVc<Box<dyn ModuleReference>>, CodeGen) {
        let scope = self.scope.clone();
        let reference = self.resolved_cell();
        (
            ResolvedVc::upcast(reference),
            CodeGen::ServiceWorkerAssetReferenceCodeGen(ServiceWorkerAssetReferenceCodeGen {
                scope,
                path,
            }),
        )
    }
}

#[derive(
    PartialEq, Eq, TraceRawVcs, ValueDebugFormat, NonLocalValue, Hash, Debug, Encode, Decode,
)]
pub struct ServiceWorkerAssetReferenceCodeGen {
    scope: RcStr,
    path: AstPath,
}

impl ServiceWorkerAssetReferenceCodeGen {
    pub async fn code_generation(
        &self,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        // The worker is served at a fixed, root-scoped URL derived from its `scope`. Rewrite the
        // `new URL(...)` script argument to that URL string.
        let url = format!("/{}", service_worker_chunk_filename(&self.scope));

        let visitor = create_visitor!(self.path, visit_mut_expr, |expr: &mut Expr| {
            let message = if let Expr::Call(call_expr) = expr {
                match call_expr.args.first_mut() {
                    Some(ExprOrSpread {
                        spread: None,
                        expr: url_expr,
                    }) => {
                        **url_expr = Expr::Lit(Lit::Str(url.as_str().into()));
                        return;
                    }
                    Some(ExprOrSpread {
                        spread: Some(_), ..
                    }) => "spread operator is illegal in navigator.serviceWorker.register().",
                    None => "navigator.serviceWorker.register() requires at least 1 argument",
                }
            } else {
                "visitor must be executed on a CallExpr"
            };
            *expr = *quote_expr!(
                "(() => { throw new Error($message); })()",
                message: Expr = Expr::Lit(Lit::Str(message.into()))
            );
        });

        Ok(CodeGeneration::visitors(vec![visitor]))
    }
}

impl From<ServiceWorkerAssetReferenceCodeGen> for CodeGen {
    fn from(val: ServiceWorkerAssetReferenceCodeGen) -> Self {
        CodeGen::ServiceWorkerAssetReferenceCodeGen(val)
    }
}
