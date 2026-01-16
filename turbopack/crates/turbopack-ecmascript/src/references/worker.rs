use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{
    common::util::take::Take,
    ecma::ast::{Expr, ExprOrSpread, Lit, NewExpr},
    quote_expr,
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    NonLocalValue, ResolvedVc, ValueToString, Vc, debug::ValueDebugFormat, trace::TraceRawVcs,
};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    chunk::{ChunkableModule, ChunkableModuleReference, ChunkingContext, EvaluatableAsset},
    context::AssetContext,
    issue::{IssueExt, IssueSeverity, IssueSource, StyledString, code_gen::CodeGenerationIssue},
    reference::ModuleReference,
    reference_type::{ReferenceType, WorkerReferenceSubType},
    resolve::{
        ModuleResolveResult, ModuleResolveResultItem, handle_resolve_error, origin::ResolveOrigin,
        parse::Request, pattern::Pattern, resolve_raw, url_resolve,
    },
};

use crate::{
    code_gen::{CodeGen, CodeGeneration, IntoCodeGenReference},
    create_visitor,
    references::{
        AstPath,
        pattern_mapping::{PatternMapping, ResolveType},
    },
    worker_chunk::{WorkerType, module::WorkerLoaderModule},
};

/// A unified reference to a Worker (web or Node.js) that creates an isolated chunk group
/// for the worker module.
#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct WorkerAssetReference {
    pub worker_type: WorkerType,
    pub origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    pub request: WorkerRequest,
    pub issue_source: IssueSource,
    pub in_try: bool,
}

/// The request type varies between web and Node.js workers
#[turbo_tasks::value]
#[derive(Hash, Debug, Clone)]
pub enum WorkerRequest {
    /// Web workers use Request (URLs)
    Url(ResolvedVc<Request>),
    /// Node.js workers use Pattern (file paths) with a context directory that should be the server
    /// working directory
    Pattern {
        context_dir: FileSystemPath,
        path: ResolvedVc<Pattern>,
        collect_affecting_sources: bool,
    },
}

impl WorkerAssetReference {
    pub fn new_web_worker(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: ResolvedVc<Request>,
        issue_source: IssueSource,
        in_try: bool,
    ) -> Self {
        WorkerAssetReference {
            worker_type: WorkerType::WebWorker,
            origin,
            request: WorkerRequest::Url(request),
            issue_source,
            in_try,
        }
    }

    pub fn new_node_worker_thread(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        context_dir: FileSystemPath,
        path: ResolvedVc<Pattern>,
        collect_affecting_sources: bool,
        issue_source: IssueSource,
        in_try: bool,
    ) -> Self {
        WorkerAssetReference {
            worker_type: WorkerType::NodeWorkerThread,
            origin,
            request: WorkerRequest::Pattern {
                context_dir,
                path,
                collect_affecting_sources,
            },
            issue_source,
            in_try,
        }
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for WorkerAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        let result = match (&self.worker_type, &self.request) {
            (WorkerType::WebWorker, WorkerRequest::Url(request)) => {
                // Web worker resolution uses url_resolve
                url_resolve(
                    *self.origin,
                    **request,
                    ReferenceType::Worker(WorkerReferenceSubType::WebWorker),
                    Some(self.issue_source),
                    self.in_try,
                )
            }
            (
                WorkerType::NodeWorkerThread,
                WorkerRequest::Pattern {
                    context_dir,
                    path,
                    collect_affecting_sources,
                },
            ) => {
                let asset_context = self.origin.asset_context();

                // Node.js worker resolution uses resolve_raw
                let result = resolve_raw(
                    context_dir.clone(),
                    **path,
                    *collect_affecting_sources,
                    /* force_in_lookup_dir */ false,
                );
                let reference_type = ReferenceType::Worker(WorkerReferenceSubType::NodeWorker);
                let result = asset_context.process_resolve_result(result, reference_type.clone());

                // Report an error if we cannot resolve
                handle_resolve_error(
                    result,
                    reference_type.clone(),
                    *self.origin,
                    Request::parse(path.owned().await?),
                    self.origin.resolve_options(reference_type),
                    self.in_try,
                    Some(self.issue_source),
                )
                .await?
            }
            _ => {
                // This should never happen due to our constructor functions
                unreachable!("WorkerType and WorkerRequest mismatch");
            }
        };

        // Wrap each resolved module in a WorkerLoaderModule
        let result_ref = result.await?;
        let mut primary = Vec::new();

        for (request_key, resolve_item) in result_ref.primary.iter() {
            match resolve_item {
                ModuleResolveResultItem::Module(module) => {
                    let Some(chunkable) =
                        ResolvedVc::try_downcast::<Box<dyn ChunkableModule>>(*module)
                    else {
                        CodeGenerationIssue {
                            severity: IssueSeverity::Bug,
                            title: StyledString::Text(rcstr!("non-chunkable module"))
                                .resolved_cell(),
                            message: StyledString::Text(rcstr!("asset is not chunkable"))
                                .resolved_cell(),
                            path: self.origin.origin_path().owned().await?,
                        }
                        .resolved_cell()
                        .emit();
                        continue;
                    };

                    // For Node.js worker threads, the module must also be evaluatable since
                    // it becomes an entry point
                    if matches!(self.worker_type, WorkerType::NodeWorkerThread)
                        && ResolvedVc::try_sidecast::<Box<dyn EvaluatableAsset>>(chunkable)
                            .is_none()
                    {
                        CodeGenerationIssue {
                            severity: IssueSeverity::Bug,
                            title: StyledString::Text(rcstr!("non-evaluatable module"))
                                .resolved_cell(),
                            message: StyledString::Text(rcstr!(
                                "Worker thread module must be evaluatable"
                            ))
                            .resolved_cell(),
                            path: self.origin.origin_path().owned().await?,
                        }
                        .resolved_cell()
                        .emit();
                        continue;
                    }

                    let loader = WorkerLoaderModule::new(*chunkable, self.worker_type)
                        .to_resolved()
                        .await?;

                    primary.push((
                        request_key.clone(),
                        ModuleResolveResultItem::Module(ResolvedVc::upcast(loader)),
                    ));
                }
                // Pass through other result types (External, Ignore, etc.)
                _ => {
                    primary.push((request_key.clone(), resolve_item.clone()));
                }
            }
        }

        Ok(ModuleResolveResult {
            primary: primary.into_boxed_slice(),
            affecting_sources: result_ref.affecting_sources.clone(),
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for WorkerAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!(
                "new {}({})",
                match self.worker_type {
                    WorkerType::WebWorker => "WebWorker",
                    WorkerType::NodeWorkerThread => "NodeWorkerThread",
                },
                match &self.request {
                    WorkerRequest::Url(request) => request.to_string().await?,
                    WorkerRequest::Pattern { path, .. } => path.to_string().await?,
                }
            )
            .into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for WorkerAssetReference {}

impl IntoCodeGenReference for WorkerAssetReference {
    fn into_code_gen_reference(
        self,
        path: AstPath,
    ) -> (ResolvedVc<Box<dyn ModuleReference>>, CodeGen) {
        let reference = self.resolved_cell();
        (
            ResolvedVc::upcast(reference),
            CodeGen::WorkerAssetReferenceCodeGen(WorkerAssetReferenceCodeGen { reference, path }),
        )
    }
}

#[derive(
    PartialEq, Eq, TraceRawVcs, ValueDebugFormat, NonLocalValue, Hash, Debug, Encode, Decode,
)]
pub struct WorkerAssetReferenceCodeGen {
    reference: ResolvedVc<WorkerAssetReference>,
    path: AstPath,
}

impl WorkerAssetReferenceCodeGen {
    pub async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let reference = self.reference.await?;

        // Build the request for PatternMapping
        let request = match &reference.request {
            WorkerRequest::Url(request) => **request,
            WorkerRequest::Pattern { path, .. } => Request::parse(path.owned().await?),
        };

        // Use PatternMapping to handle both single and multiple (dynamic) worker results
        let pm = PatternMapping::resolve_request(
            request,
            *reference.origin,
            chunking_context,
            self.reference.resolve_reference(),
            ResolveType::ChunkItem,
        )
        .await?;

        let visitor = create_visitor!(self.path, visit_mut_expr, |expr: &mut Expr| {
            let message = if let Expr::New(NewExpr { args, .. }) = expr {
                if let Some(args) = args {
                    match args.first_mut() {
                        Some(ExprOrSpread {
                            spread: None,
                            expr: key_expr,
                        }) => {
                            // Replace the first argument (the URL/path) with a turbopack_require
                            // call that uses the pattern mapping to resolve to the correct loader
                            // module
                            *key_expr = quote_expr!(
                                "$require",
                                require: Expr = pm.create_require(*key_expr.take())
                            );

                            // For web workers, modify the options to set type: undefined
                            if reference.worker_type == WorkerType::WebWorker
                                && let Some(opts) = args.get_mut(1)
                                && opts.spread.is_none()
                            {
                                *opts.expr = *quote_expr!(
                                    "{...$opts, type: undefined}",
                                    opts: Expr = (*opts.expr).take()
                                );
                            }
                            return;
                        }
                        // These are SWC bugs: https://github.com/swc-project/swc/issues/5394
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
