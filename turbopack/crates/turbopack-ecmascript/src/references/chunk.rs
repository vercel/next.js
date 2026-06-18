use anyhow::Result;
use bincode::{Decode, Encode};
use indoc::formatdoc;
use swc_core::{
    common::util::take::Take,
    ecma::ast::{CallExpr, Expr, ExprOrSpread, Lit},
    quote,
};
use turbo_rcstr::rcstr;
use turbo_tasks::{
    NonLocalValue, ResolvedVc, TryJoinIterExt, ValueToString, Vc, debug::ValueDebugFormat,
    trace::TraceRawVcs,
};
use turbopack_core::{
    chunk::{
        AsyncModuleInfo, ChunkData, ChunkGroupType, ChunkableModule, ChunkingContext,
        ChunkingContextExt, ChunkingType, ChunksData, availability_info::AvailabilityInfo,
    },
    context::AssetContext,
    ident::AssetIdent,
    issue::IssueSource,
    module::{Module, ModuleSideEffects},
    module_graph::{ModuleGraph, chunk_group_info::ChunkGroup},
    output::{OutputAssets, OutputAssetsWithReferenced},
    reference::{ModuleReference, ModuleReferences},
    reference_type::EcmaScriptModulesReferenceSubType,
    resolve::{
        ModuleResolveResult, ResolveErrorMode,
        origin::{ResolveOrigin, ResolveOriginExt},
        parse::Request,
    },
};
use turbopack_resolve::ecmascript::esm_resolve;

use crate::{
    analyzer::imports::ImportAnnotations,
    chunk::{
        EcmascriptChunkData, EcmascriptChunkItemContent, EcmascriptChunkItemOptions,
        EcmascriptChunkPlaceable, EcmascriptExports, ecmascript_chunk_item,
    },
    code_gen::{CodeGen, CodeGeneration, IntoCodeGenReference},
    create_visitor,
    references::{
        AstPath,
        pattern_mapping::{PatternMapping, ResolveType},
    },
    runtime_functions::{TURBOPACK_EXPORT_VALUE, TURBOPACK_RUNTIME_ROOT},
    utils::StringifyJs,
};

#[turbo_tasks::value]
#[derive(Hash, Debug, ValueToString)]
#[value_to_string("__turbopack_chunks__ {request}")]
pub struct TurbopackChunksAssetReference {
    pub origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    pub request: ResolvedVc<Request>,
    pub issue_source: IssueSource,
    pub error_mode: ResolveErrorMode,
}

impl TurbopackChunksAssetReference {
    pub async fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: ResolvedVc<Request>,
        issue_source: IssueSource,
        annotations: ImportAnnotations,
        error_mode: ResolveErrorMode,
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
        Ok(TurbopackChunksAssetReference {
            origin,
            request,
            issue_source,
            error_mode,
        })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for TurbopackChunksAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        let result = esm_resolve(
            *self.origin,
            *self.request,
            EcmaScriptModulesReferenceSubType::DynamicImport,
            self.error_mode,
            Some(self.issue_source),
        )
        .await?
        .await?;

        let module = result.first_module().await?.unwrap();
        let module = ResolvedVc::try_downcast::<Box<dyn ChunkableModule>>(module).unwrap();

        Ok(*ModuleResolveResult::module(ResolvedVc::upcast(
            ChunkModule::new(
                *module,
                *self.origin.into_trait_ref().await?.asset_context(),
            )
            .to_resolved()
            .await?,
        )))
    }

    fn chunking_type(&self) -> Option<ChunkingType> {
        Some(ChunkingType::Parallel {
            inherit_async: false,
            hoisted: false,
        })
    }

    fn source(&self) -> Option<IssueSource> {
        Some(self.issue_source)
    }
}

impl IntoCodeGenReference for TurbopackChunksAssetReference {
    fn into_code_gen_reference(
        self,
        path: AstPath,
    ) -> (ResolvedVc<Box<dyn ModuleReference>>, CodeGen) {
        let reference = self.resolved_cell();
        (
            ResolvedVc::upcast(reference),
            CodeGen::TurbopackChunksAssetReferenceCodeGen(TurbopackChunksAssetReferenceCodeGen {
                reference,
                path,
            }),
        )
    }
}

#[derive(
    PartialEq, Eq, TraceRawVcs, ValueDebugFormat, NonLocalValue, Hash, Debug, Encode, Decode,
)]
pub struct TurbopackChunksAssetReferenceCodeGen {
    reference: ResolvedVc<TurbopackChunksAssetReference>,
    path: AstPath,
}

impl TurbopackChunksAssetReferenceCodeGen {
    pub async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let reference = self.reference.await?;

        // Use PatternMapping to handle both single and multiple (dynamic) worker results
        let pm = PatternMapping::resolve_request(
            *reference.request,
            *reference.origin,
            chunking_context,
            self.reference.resolve_reference(),
            ResolveType::ChunkItem,
        )
        .await?;

        let visitor = create_visitor!(self.path, visit_mut_expr, |expr: &mut Expr| {
            let old_expr = expr.take();
            let message = if let Expr::Call(CallExpr { args, .. }) = old_expr {
                match args.into_iter().next() {
                    Some(ExprOrSpread {
                        spread: None,
                        expr: key_expr,
                    }) => {
                        *expr = pm.create_require(*key_expr);
                        return;
                    }
                    Some(ExprOrSpread {
                        spread: Some(_),
                        expr: _,
                    }) => "spread operator is not analyze-able in require() expressions.",
                    _ => "require() expressions require at least 1 argument",
                }
            } else {
                "visitor must be executed on a CallExpr"
            };
            *expr = quote!(
                "(() => { throw new Error($message); })()" as Expr,
                message: Expr = Expr::Lit(Lit::Str(message.into()))
            );
        });
        Ok(CodeGeneration::visitors(vec![visitor]))
    }
}

/// The ChunkModule is a module that creates a separate root chunk group for the given module
/// and exports a URL (for web workers) or file path (for Node.js workers) to pass to the worker
/// constructor.
#[turbo_tasks::value]
struct ChunkModule {
    pub inner: ResolvedVc<Box<dyn ChunkableModule>>,
    pub asset_context: ResolvedVc<Box<dyn AssetContext>>,
}

#[turbo_tasks::value_impl]
impl ChunkModule {
    #[turbo_tasks::function]
    pub fn new(
        module: ResolvedVc<Box<dyn ChunkableModule>>,
        asset_context: ResolvedVc<Box<dyn AssetContext>>,
    ) -> Vc<Self> {
        Self::cell(ChunkModule {
            inner: module,
            asset_context,
        })
    }

    #[turbo_tasks::function]
    async fn chunk_group(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
    ) -> Result<Vc<OutputAssetsWithReferenced>> {
        let this = self.await?;
        let ident = this
            .inner
            .ident()
            .owned()
            .await?
            .with_modifier(rcstr!("__turbopack_chunks__"))
            .into_vc();
        Ok(chunking_context.evaluated_chunk_group_assets(
            ident,
            ChunkGroup::Isolated(ResolvedVc::upcast(this.inner)),
            module_graph,
            OutputAssets::empty(),
            AvailabilityInfo::root(),
        ))
    }

    #[turbo_tasks::function]
    async fn chunks_data(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
    ) -> Result<Vc<ChunksData>> {
        Ok(ChunkData::from_assets(
            chunking_context.output_root().owned().await?,
            *self
                .chunk_group(chunking_context, module_graph)
                .await?
                .assets,
        ))
    }
}

#[turbo_tasks::value_impl]
impl Module for ChunkModule {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(self
            .inner
            .ident()
            .owned()
            .await?
            .with_modifier(rcstr!("__turbopack_chunks__"))
            .into_vc())
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<turbopack_core::source::OptionSource> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        let this = self.await?;
        Ok(Vc::cell(vec![ResolvedVc::upcast(
            ChunkModuleReference::new(*ResolvedVc::upcast(this.inner))
                .to_resolved()
                .await?,
        )]))
    }

    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        ModuleSideEffects::SideEffectFree.cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for ChunkModule {
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
impl EcmascriptChunkPlaceable for ChunkModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::Value.cell()
    }

    #[turbo_tasks::function]
    async fn chunk_item_content(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
        estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let options = EcmascriptChunkItemOptions {
            supports_arrow_functions: *chunking_context
                .environment()
                .runtime_versions()
                .supports_arrow_functions()
                .await?,
            ..Default::default()
        };

        if estimated {
            // In estimation mode we cannot call into chunking context APIs
            // otherwise we will induce a turbo tasks cycle. But we only need an
            // approximate solution. We'll use the same estimate for both web
            // and Node.js workers.
            return Ok(EcmascriptChunkItemContent {
                inner_code: formatdoc! {
                    r#"
                        {worker_path:#}
                    "#,
                    worker_path = StringifyJs(&"a_fake_path_for_size_estimation"),
                }
                .into(),
                options,
                ..Default::default()
            }
            .cell());
        }

        let chunks_data = self.chunks_data(chunking_context, module_graph).await?;
        let chunks_data = chunks_data.iter().try_join().await?;
        let chunks_data: Vec<_> = chunks_data
            .iter()
            .map(|chunk_data| EcmascriptChunkData::new(chunk_data))
            .collect();

        let code = formatdoc! {
            r#"
                {TURBOPACK_EXPORT_VALUE}({chunks}.map(c => {TURBOPACK_RUNTIME_ROOT} +"/" + c));
            "#,
            chunks = StringifyJs(&chunks_data),
        };

        Ok(EcmascriptChunkItemContent {
            inner_code: code.into(),
            options,
            ..Default::default()
        }
        .cell())
    }

    #[turbo_tasks::function]
    fn chunk_item_output_assets(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
    ) -> Vc<OutputAssetsWithReferenced> {
        self.chunk_group(chunking_context, module_graph)
    }
}

#[turbo_tasks::value]
#[derive(ValueToString)]
#[value_to_string("chunk")]
struct ChunkModuleReference {
    module: ResolvedVc<Box<dyn Module>>,
}

#[turbo_tasks::value_impl]
impl ChunkModuleReference {
    #[turbo_tasks::function]
    pub fn new(module: ResolvedVc<Box<dyn Module>>) -> Vc<Self> {
        Self::cell(ChunkModuleReference { module })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for ChunkModuleReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        *ModuleResolveResult::module(self.module)
    }

    fn chunking_type(&self) -> Option<ChunkingType> {
        Some(ChunkingType::Isolated {
            _ty: ChunkGroupType::Evaluated,
            merge_tag: None,
        })
    }
}
