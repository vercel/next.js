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
use turbopack_core::{
    chunk::{ChunkableModule, ChunkableModuleReference, ChunkingContext},
    issue::{IssueExt, IssueSeverity, IssueSource, StyledString, code_gen::CodeGenerationIssue},
    reference::ModuleReference,
    reference_type::{ReferenceType, WorkerReferenceSubType},
    resolve::{
        ModuleResolveResult, ModuleResolveResultItem, origin::ResolveOrigin, parse::Request,
        url_resolve,
    },
};

use crate::{
    code_gen::{CodeGen, CodeGeneration, IntoCodeGenReference},
    create_visitor,
    references::{
        AstPath,
        pattern_mapping::{PatternMapping, ResolveType},
    },
    runtime_functions::TURBOPACK_REQUIRE,
    worker_chunk::module::WorkerLoaderModule,
};

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct WorkerAssetReference {
    pub origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    pub request: ResolvedVc<Request>,
    pub issue_source: IssueSource,
    pub in_try: bool,
}

impl WorkerAssetReference {
    pub fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: ResolvedVc<Request>,
        issue_source: IssueSource,
        in_try: bool,
    ) -> Self {
        WorkerAssetReference {
            origin,
            request,
            issue_source,
            in_try,
        }
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for WorkerAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        let result = url_resolve(
            *self.origin,
            *self.request,
            // TODO support more worker types
            ReferenceType::Worker(WorkerReferenceSubType::WebWorker),
            Some(self.issue_source),
            self.in_try,
        );

        // Wrap each resolved module in a WorkerLoaderModule
        // This loader module will export a blob URL for the bundled worker chunk
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

                    let loader = WorkerLoaderModule::new(*chunkable).to_resolved().await?;

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
            format!("new Worker {}", self.request.to_string().await?,).into(),
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
            let message = if let Expr::New(NewExpr { args, .. }) = expr {
                if let Some(args) = args {
                    match args.first_mut() {
                        Some(ExprOrSpread {
                            spread: None,
                            expr: key_expr,
                        }) => {
                            // Replace the first argument (the URL/path) with a turbopack_require
                            // call that uses the pattern mapping to
                            // resolve to the correct loader module,
                            // which then returns the blob URL for the worker
                            *key_expr = quote_expr!(
                                "$turbopack_require($id)",
                                turbopack_require: Expr = TURBOPACK_REQUIRE.into(),
                                id: Expr = pm.create_id(*key_expr.take())
                            );

                            if let Some(opts) = args.get_mut(1)
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
