use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{
    common::util::take::Take,
    ecma::ast::{CallExpr, Callee, Expr, ExprOrSpread, Lit},
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
    module::Module,
    reference::ModuleReference,
    reference_type::{ReferenceType, WorkerReferenceSubType},
    resolve::{
        ModuleResolveResult, ModuleResolveResultItem, ResolveErrorMode, handle_resolve_error,
        origin::ResolveOrigin, parse::Request, pattern::Pattern, resolve_raw, url_resolve,
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
    pub error_mode: ResolveErrorMode,
    /// When true, skip creating WorkerLoaderModule and return the inner module directly.
    /// This is used when we're only tracing dependencies, not generating code.
    pub tracing_only: bool,
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
        error_mode: ResolveErrorMode,
        tracing_only: bool,
        is_shared: bool,
    ) -> Self {
        WorkerAssetReference {
            worker_type: if is_shared {
                WorkerType::SharedWebWorker
            } else {
                WorkerType::WebWorker
            },
            origin,
            request: WorkerRequest::Url(request),
            issue_source,
            error_mode,
            tracing_only,
        }
    }

    pub fn new_node_worker_thread(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        context_dir: FileSystemPath,
        path: ResolvedVc<Pattern>,
        collect_affecting_sources: bool,
        issue_source: IssueSource,
        error_mode: ResolveErrorMode,
        tracing_only: bool,
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
            error_mode,
            tracing_only,
        }
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for WorkerAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        let asset_context = self.origin.asset_context().to_resolved().await?;

        let result = match (&self.worker_type, &self.request) {
            (WorkerType::WebWorker | WorkerType::SharedWebWorker, WorkerRequest::Url(request)) => {
                // Web worker resolution uses url_resolve
                url_resolve(
                    *self.origin,
                    **request,
                    self.worker_type.reference_type(),
                    Some(self.issue_source),
                    self.error_mode,
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
                    self.origin.resolve_options(),
                    self.error_mode,
                    Some(self.issue_source),
                )
                .await?
            }
            _ => {
                // This should never happen due to our constructor functions
                unreachable!("WorkerType and WorkerRequest mismatch");
            }
        };

        // When tracing only (no code generation), return the resolved modules directly
        // without wrapping them in WorkerLoaderModule
        if self.tracing_only {
            return Ok(result);
        }

        // Wrap each resolved module in a WorkerLoaderModule
        let result_ref = result.await?;
        let mut primary = Vec::with_capacity(result_ref.primary.len());

        for (request_key, resolve_item) in result_ref.primary.iter() {
            match resolve_item {
                ModuleResolveResultItem::Module(module) => {
                    let module_ident = module.ident().to_string().await?;

                    let Some(chunkable) =
                        ResolvedVc::try_downcast::<Box<dyn ChunkableModule>>(*module)
                    else {
                        CodeGenerationIssue {
                            severity: self.get_module_type_issue_severity().await?,
                            title: StyledString::Text(rcstr!("non-chunkable module"))
                                .resolved_cell(),
                            message: StyledString::Text(
                                format!(
                                    "Worker entry point module '{}' is not chunkable and cannot \
                                     be used as a worker module. This may happen if the module \
                                     type doesn't support bundling.",
                                    module_ident
                                )
                                .into(),
                            )
                            .resolved_cell(),
                            path: self.origin.origin_path().owned().await?,
                            source: Some(self.issue_source),
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
                            severity: self.get_module_type_issue_severity().await?,
                            title: StyledString::Text(rcstr!("non-evaluatable module"))
                                .resolved_cell(),
                            message: StyledString::Text(
                                format!(
                                    "Worker thread entry point module '{}' must be evaluatable to \
                                     serve as an entry point. This module cannot be used as a \
                                     Node.js worker_threads Worker entry point because it doesn't \
                                     support direct evaluation.",
                                    module_ident
                                )
                                .into(),
                            )
                            .resolved_cell(),
                            path: self.origin.origin_path().owned().await?,
                            source: Some(self.issue_source),
                        }
                        .resolved_cell()
                        .emit();
                        continue;
                    }

                    let loader =
                        WorkerLoaderModule::new(*chunkable, self.worker_type, *asset_context)
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

impl WorkerAssetReference {
    /// Downgrade errors to warnings if we are not in Error mode or if loose errors is enabled
    async fn get_module_type_issue_severity(&self) -> Result<IssueSeverity> {
        Ok(
            if self.error_mode != ResolveErrorMode::Error
                || self.origin.resolve_options().await?.loose_errors
            {
                IssueSeverity::Warning
            } else {
                IssueSeverity::Error
            },
        )
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
                    WorkerType::SharedWebWorker => "SharedWorker",
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

        // Transform `new Worker(url, opts)` into `require(id)(Worker, opts)`
        // The loader module exports a function that creates the worker with all necessary
        // configuration (entrypoint, chunks, forwarded globals, etc.)
        let visitor = create_visitor!(self.path, visit_mut_expr, |expr: &mut Expr| {
            let message = if let Expr::New(new_expr) = expr {
                if let Some(args) = &mut new_expr.args {
                    match args.first_mut() {
                        Some(ExprOrSpread {
                            spread: None,
                            expr: url_expr,
                        }) => {
                            // Get the Worker constructor (callee)
                            let constructor = new_expr.callee.take();

                            // Build the require call for the loader module
                            let require_call = pm.create_require(*url_expr.take());

                            // Build the arguments: (WorkerConstructor, ...rest_args)
                            let mut call_args = vec![ExprOrSpread {
                                spread: None,
                                expr: constructor,
                            }];
                            // Add any remaining arguments (e.g., worker options)
                            call_args.extend(args.drain(1..));

                            // Transform to: require(id)(Worker, opts)
                            *expr = Expr::Call(CallExpr {
                                span: new_expr.span,
                                callee: Callee::Expr(Box::new(require_call)),
                                args: call_args,
                                ..Default::default()
                            });
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
