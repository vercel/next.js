use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{
    ecma::ast::{Expr, ExprOrSpread, Lit, NewExpr},
    quote_expr,
};
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    NonLocalValue, ResolvedVc, ValueToString, Vc, debug::ValueDebugFormat, trace::TraceRawVcs,
};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    chunk::{
        ChunkableModule, ChunkableModuleReference, ChunkingContext, ChunkingType,
        ChunkingTypeOption,
    },
    context::AssetContext,
    file_source::FileSource,
    issue::{IssueExt, IssueSeverity, IssueSource, StyledString, code_gen::CodeGenerationIssue},
    module::Module,
    raw_module::RawModule,
    reference::ModuleReference,
    reference_type::{ReferenceType, WorkerReferenceSubType},
    resolve::{
        ModuleResolveResult, handle_resolve_error, origin::ResolveOrigin, parse::Request,
        pattern::Pattern, resolve_raw,
    },
};

use crate::{
    code_gen::{CodeGen, CodeGeneration, IntoCodeGenReference},
    create_visitor,
    node_worker_chunk::module::NodeWorkerLoaderModule,
    references::{AstPath, util::check_and_emit_too_many_matches_warning},
    runtime_functions::TURBOPACK_REQUIRE,
    utils::module_id_to_lit,
};

#[turbo_tasks::value]
#[derive(Hash, Clone, Debug)]
pub struct PackageJsonReference {
    pub package_json: FileSystemPath,
}

#[turbo_tasks::value_impl]
impl PackageJsonReference {
    #[turbo_tasks::function]
    pub fn new(package_json: FileSystemPath) -> Vc<Self> {
        Self::cell(PackageJsonReference { package_json })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for PackageJsonReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        Ok(*ModuleResolveResult::module(ResolvedVc::upcast(
            RawModule::new(Vc::upcast(FileSource::new(self.package_json.clone())))
                .to_resolved()
                .await?,
        )))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for PackageJsonReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!(
                "package.json {}",
                self.package_json.value_to_string().await?
            )
            .into(),
        ))
    }
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct FilePathModuleReference {
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
    context_dir: FileSystemPath,
    path: ResolvedVc<Pattern>,
    collect_affecting_sources: bool,
    issue_source: IssueSource,
}

#[turbo_tasks::value_impl]
impl FilePathModuleReference {
    #[turbo_tasks::function]
    pub fn new(
        asset_context: ResolvedVc<Box<dyn AssetContext>>,
        context_dir: FileSystemPath,
        path: ResolvedVc<Pattern>,
        collect_affecting_sources: bool,
        issue_source: IssueSource,
    ) -> Vc<Self> {
        Self {
            asset_context,
            context_dir,
            path,
            collect_affecting_sources,
            issue_source,
        }
        .cell()
    }
}

// A reference to an module by absolute or cwd-relative file path (e.g. for the
// worker-threads `new Worker` which has the resolving behavior of `fs.readFile` but should treat
// the resolve result as an module instead of a raw source).
#[turbo_tasks::value_impl]
impl ModuleReference for FilePathModuleReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        let span = tracing::info_span!(
            "trace module",
            pattern = display(self.path.to_string().await?)
        );
        async {
            let result = resolve_raw(
                self.context_dir.clone(),
                *self.path,
                self.collect_affecting_sources,
                /* force_in_lookup_dir */ false,
            );
            let result = self.asset_context.process_resolve_result(
                result,
                ReferenceType::Worker(WorkerReferenceSubType::NodeWorker),
            );

            check_and_emit_too_many_matches_warning(
                result,
                self.issue_source,
                self.context_dir.clone(),
                self.path,
            )
            .await?;

            Ok(result)
        }
        .instrument(span)
        .await
    }
}
#[turbo_tasks::value_impl]
impl ChunkableModuleReference for FilePathModuleReference {
    #[turbo_tasks::function]
    fn chunking_type(&self) -> Vc<ChunkingTypeOption> {
        Vc::cell(Some(ChunkingType::Traced))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for FilePathModuleReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("raw asset {}", self.path.to_string().await?,).into(),
        ))
    }
}

/// A reference to a Node.js Worker that creates an isolated chunk group for the worker module.
/// This reference uses ChunkingType::Isolated to ensure proper worker entry point generation
/// with fresh runtime context, avoiding the dual reference problem where builtins leak into
/// TracedAssets.
#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct NodeWorkerAssetReference {
    pub origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    pub context_dir: FileSystemPath,
    pub path: ResolvedVc<Pattern>,
    pub issue_source: IssueSource,
    pub in_try: bool,
}

impl NodeWorkerAssetReference {
    pub fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        context_dir: FileSystemPath,
        path: ResolvedVc<Pattern>,
        issue_source: IssueSource,
        in_try: bool,
    ) -> Self {
        NodeWorkerAssetReference {
            origin,
            context_dir,
            path,
            issue_source,
            in_try,
        }
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for NodeWorkerAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        let asset_context = self.origin.asset_context();

        // Use resolve_raw since we are looking for a filename not a module specifier.
        let result = resolve_raw(
            self.context_dir.clone(),
            *self.path,
            /* collect_affecting_sources */ false,
            /* force_in_lookup_dir */ false,
        );
        let reference_type = ReferenceType::Worker(WorkerReferenceSubType::NodeWorker);
        let mut result = asset_context.process_resolve_result(result, reference_type.clone());

        // report an error if we cannot resolve
        result = handle_resolve_error(
            result,
            reference_type.clone(),
            *self.origin,
            Request::parse(self.path.owned().await?),
            self.origin.resolve_options(reference_type),
            self.in_try,
            Some(self.issue_source),
        )
        .await?;

        let Some(module) = *result.first_module().await? else {
            return Ok(*ModuleResolveResult::unresolvable());
        };

        let Some(chunkable) = ResolvedVc::try_downcast::<Box<dyn ChunkableModule>>(module) else {
            CodeGenerationIssue {
                severity: IssueSeverity::Bug,
                title: StyledString::Text(rcstr!("non-chunkable module")).resolved_cell(),
                message: StyledString::Text(rcstr!("asset is not chunkable")).resolved_cell(),
                path: self.origin.origin_path().owned().await?,
            }
            .resolved_cell()
            .emit();
            return Ok(*ModuleResolveResult::unresolvable());
        };

        Ok(*ModuleResolveResult::module(ResolvedVc::upcast(
            NodeWorkerLoaderModule::new(*chunkable)
                .to_resolved()
                .await?,
        )))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for NodeWorkerAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("new Worker {}", self.path.to_string().await?).into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for NodeWorkerAssetReference {}

impl IntoCodeGenReference for NodeWorkerAssetReference {
    fn into_code_gen_reference(
        self,
        path: AstPath,
    ) -> (ResolvedVc<Box<dyn ModuleReference>>, CodeGen) {
        let reference = self.resolved_cell();
        (
            ResolvedVc::upcast(reference),
            CodeGen::NodeWorkerAssetReferenceCodeGen(NodeWorkerAssetReferenceCodeGen {
                reference,
                path,
            }),
        )
    }
}

#[derive(
    PartialEq, Eq, TraceRawVcs, ValueDebugFormat, NonLocalValue, Hash, Debug, Encode, Decode,
)]
pub struct NodeWorkerAssetReferenceCodeGen {
    reference: ResolvedVc<NodeWorkerAssetReference>,
    path: AstPath,
}

impl NodeWorkerAssetReferenceCodeGen {
    pub async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let Some(loader_module) = *self.reference.resolve_reference().first_module().await? else {
            // If we can't create the loader, generate an error expression
            let visitor = create_visitor!(self.path, visit_mut_expr, |expr: &mut Expr| {
                *expr = *quote_expr!(
                    "(() => { throw new Error($message); })()",
                    message: Expr = Expr::Lit(Lit::Str("Worker loader could not be created".into()))
                );
            });
            return Ok(CodeGeneration::visitors(vec![visitor]));
        };

        let item_id = chunking_context
            .chunk_item_id_from_ident(loader_module.ident())
            .await?;

        let visitor = create_visitor!(self.path, visit_mut_expr, |expr: &mut Expr| {
            let message = if let Expr::New(NewExpr { args, .. }) = expr {
                if let Some(args) = args {
                    match args.first_mut() {
                        Some(ExprOrSpread { spread: None, expr }) => {
                            let item_id = module_id_to_lit(&item_id);
                            // Replace the first argument (the path) with a turbopack_require call
                            // that returns the actual file path to the worker entry chunk
                            *expr = quote_expr!(
                                "$turbopack_require($item_id)",
                                turbopack_require: Expr = TURBOPACK_REQUIRE.into(),
                                item_id: Expr = item_id
                            );
                            return;
                        }
                        Some(ExprOrSpread {
                            spread: Some(_),
                            expr: _,
                        }) => "spread operator is illegal in new Worker() expressions.",
                        _ => "new Worker() expressions require at least 1 argument",
                    }
                } else {
                    "new Worker() expressions require at least 1 argument"
                }
            } else {
                "visitor must be executed on a NewExpr"
            };
            *expr = *quote_expr!(
                "(() => { throw new Error($message); })()",
                message: Expr = Expr::Lit(Lit::Str(message.into()))
            );
        });

        Ok(CodeGeneration::visitors(vec![visitor]))
    }
}
