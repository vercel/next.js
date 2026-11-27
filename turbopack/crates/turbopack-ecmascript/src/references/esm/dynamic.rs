use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{
    common::{DUMMY_SP, util::take::Take},
    ecma::ast::{CallExpr, Callee, Expr, ExprOrSpread, Lit},
    quote_expr,
};
use turbo_tasks::{NonLocalValue, ResolvedVc, ValueToString, Vc, debug::ValueDebugFormat};
use turbopack_core::{
    chunk::{ChunkableModule, ChunkingContext, ChunkingType, ModuleChunkItemIdExt},
    issue::IssueSource,
    module::Module,
    reference::ModuleReference,
    reference_type::EcmaScriptModulesReferenceSubType,
    resolve::{
        BindingUsage, ExportUsage, ModuleResolveResult, ResolveErrorMode,
        origin::{ResolveOrigin, ResolveOriginExt},
        parse::Request,
    },
};
use turbopack_resolve::ecmascript::esm_resolve;

use crate::{
    analyzer::imports::ImportAnnotations,
    ast_path_trie::{AstPathId, AstPathTrie, AstPathTrieBuilder},
    async_chunk::{
        async_flag::{AsyncModuleFlagModule, AsyncModuleFlagsReference},
        proxy::LazyCompilationProxyModule,
    },
    chunk::EcmascriptChunkPlaceable,
    code_gen::{CodeGen, CodeGeneration, IntoCodeGenReference},
    create_visitor,
    references::{
        esm::base::known_namespace_exports,
        pattern_mapping::{DeferTarget, DeferTargets, PatternMapping, ResolveType},
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
    /// The export usage extracted from the dynamic import usage pattern.
    /// Detected from destructured await, member access on await, .then()
    /// callback destructuring, or webpackExports/turbopackExports comments.
    pub export_usage: ExportUsage,
    pub resolve_override: Option<ResolvedVc<Box<dyn Module>>>,
    /// Whether the target is compiled only after its runtime proxy is activated.
    pub lazy_compilation: bool,
    /// `import.defer(...)`: the module is loaded, but only evaluated on first access of a
    /// property of the resolved namespace.
    pub deferred: bool,
}

impl EsmAsyncAssetReference {
    #[allow(clippy::too_many_arguments)]
    pub async fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: ResolvedVc<Request>,
        issue_source: IssueSource,
        annotations: ImportAnnotations,
        error_mode: ResolveErrorMode,
        export_usage: ExportUsage,
        resolve_override: Option<ResolvedVc<Box<dyn Module>>>,
        lazy_compilation: bool,
        deferred: bool,
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
            export_usage,
            resolve_override,
            lazy_compilation,
            deferred,
        })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for EsmAsyncAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        if let Some(resolved) = self.resolve_override {
            if self.lazy_compilation
                && let Some(module) =
                    ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(resolved)
            {
                let proxy = LazyCompilationProxyModule::new_direct(*module)
                    .to_resolved()
                    .await?;
                return Ok(*ModuleResolveResult::module(ResolvedVc::upcast(proxy)));
            }
            return Ok(*ModuleResolveResult::module(resolved));
        }

        esm_resolve(
            *self.origin,
            *self.request,
            if self.lazy_compilation {
                EcmaScriptModulesReferenceSubType::LazyDynamicImport
            } else {
                EcmaScriptModulesReferenceSubType::DynamicImport
            },
            self.error_mode,
            Some(self.issue_source),
        )
        .await
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
    fn into_reference(self) -> ResolvedVc<Box<dyn ModuleReference>> {
        ResolvedVc::upcast(self.resolved_cell())
    }

    fn into_code_gen_reference(
        self,
        _trie: &AstPathTrieBuilder,
        path: AstPathId,
    ) -> (ResolvedVc<Box<dyn ModuleReference>>, CodeGen) {
        let reference = self.resolved_cell();
        (
            ResolvedVc::upcast(reference),
            CodeGen::EsmAsyncAssetReferenceCodeGen(EsmAsyncAssetReferenceCodeGen {
                reference,
                path,
                async_flags: None,
            }),
        )
    }
}

#[derive(PartialEq, Eq, ValueDebugFormat, NonLocalValue, Hash, Debug, Encode, Decode)]
pub struct EsmAsyncAssetReferenceCodeGen {
    path: AstPathId,
    reference: ResolvedVc<EsmAsyncAssetReference>,
    /// For `import.defer()`: the reference to the async module flags of the targets, needed
    /// without async chunk loading (see [`AsyncModuleFlagModule`]).
    async_flags: Option<ResolvedVc<AsyncModuleFlagsReference>>,
}

impl EsmAsyncAssetReferenceCodeGen {
    /// For `import.defer()`: creates the reference, the reference to the async module flags of
    /// its targets (to know whether they have to be evaluated eagerly in environments without
    /// async chunk loading), and the code generation.
    pub async fn new_deferred(
        reference: EsmAsyncAssetReference,
        path: AstPathId,
    ) -> Result<(
        ResolvedVc<Box<dyn ModuleReference>>,
        ResolvedVc<Box<dyn ModuleReference>>,
        CodeGen,
    )> {
        let reference = reference.resolved_cell();
        let async_flags = AsyncModuleFlagsReference::new(Vc::upcast(*reference))
            .to_resolved()
            .await?;
        Ok((
            ResolvedVc::upcast(reference),
            ResolvedVc::upcast(async_flags),
            CodeGen::EsmAsyncAssetReferenceCodeGen(EsmAsyncAssetReferenceCodeGen {
                path,
                reference,
                async_flags: Some(async_flags),
            }),
        ))
    }

    /// The possible target modules of an `import.defer()`, see [`DeferTargets`].
    async fn defer_targets(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        can_split_async: bool,
    ) -> Result<DeferTargets> {
        let mut targets = DeferTargets::default();
        let modules = self
            .reference
            .resolve_reference()
            .await?
            .primary_modules()
            .await?;
        for module in modules {
            let Some(chunkable) = ResolvedVc::try_downcast::<Box<dyn ChunkableModule>>(module)
            else {
                continue;
            };
            let exports = if let Some(placeable) =
                ResolvedVc::try_downcast::<Box<dyn EcmascriptChunkPlaceable>>(module)
            {
                known_namespace_exports(placeable).await?
            } else {
                None
            };
            if can_split_async {
                let ident = chunking_context.async_loader_chunk_item_ident(*chunkable);
                let loader_id = chunking_context
                    .chunk_item_id_strategy()
                    .await?
                    .get_id_from_ident(ident)
                    .await?;
                targets.insert(
                    loader_id,
                    DeferTarget {
                        exports,
                        async_flag: None,
                    },
                );
            } else {
                let async_flag = if self.async_flags.is_some() {
                    let flag_module = AsyncModuleFlagModule::new(*module).to_resolved().await?;
                    Some(
                        ResolvedVc::upcast::<Box<dyn ChunkableModule>>(flag_module)
                            .chunk_item_id(chunking_context)
                            .await?,
                    )
                } else {
                    None
                };
                targets.insert(
                    chunkable.chunk_item_id(chunking_context).await?,
                    DeferTarget {
                        exports,
                        async_flag,
                    },
                );
            }
        }
        Ok(targets)
    }
    pub async fn code_generation(
        &self,
        trie: &AstPathTrie,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let reference = self.reference.await?;
        let can_split_async = chunking_context.chunk_loading().await?.can_split_async();

        let pm = PatternMapping::resolve_request(
            *reference.request,
            *reference.origin,
            chunking_context,
            self.reference.resolve_reference(),
            if can_split_async {
                ResolveType::AsyncChunkLoader
            } else {
                ResolveType::ChunkItem
            },
            Some(Vc::upcast(*self.reference)),
        )
        .await?;

        let deferred = reference.deferred;
        let defer_targets = if deferred {
            self.defer_targets(chunking_context, can_split_async)
                .await?
        } else {
            DeferTargets::default()
        };
        let visitor = create_visitor!(trie, self.path, visit_mut_expr, |expr: &mut Expr| {
            let old_expr = expr.take();
            let message = if let Expr::Call(CallExpr { args, .. }) = old_expr {
                match args.into_iter().next() {
                    Some(ExprOrSpread {
                        spread: None,
                        expr: key_expr,
                    }) => {
                        *expr = if deferred {
                            pm.create_import_defer(*key_expr, &defer_targets)
                        } else {
                            pm.create_import(*key_expr)
                        };
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
