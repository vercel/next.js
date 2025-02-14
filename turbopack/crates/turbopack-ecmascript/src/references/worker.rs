use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use swc_core::{
    common::util::take::Take,
    ecma::ast::{Expr, ExprOrSpread, Lit, NewExpr},
    quote_expr,
};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    debug::ValueDebugFormat, trace::TraceRawVcs, NonLocalValue, ResolvedVc, Value, ValueToString,
    Vc,
};
use turbopack_core::{
    chunk::{ChunkableModule, ChunkableModuleReference, ChunkingContext},
    issue::{code_gen::CodeGenerationIssue, IssueExt, IssueSeverity, IssueSource, StyledString},
    module::Module,
    module_graph::ModuleGraph,
    reference::ModuleReference,
    reference_type::{ReferenceType, WorkerReferenceSubType},
    resolve::{origin::ResolveOrigin, parse::Request, url_resolve, ModuleResolveResult},
};

use crate::{
    code_gen::{CodeGen, CodeGeneration, IntoCodeGenReference},
    create_visitor,
    references::AstPath,
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

impl WorkerAssetReference {
    async fn worker_loader_module(
        self: &WorkerAssetReference,
    ) -> Result<Option<Vc<WorkerLoaderModule>>> {
        let module = url_resolve(
            *self.origin,
            *self.request,
            // TODO support more worker types
            Value::new(ReferenceType::Worker(WorkerReferenceSubType::WebWorker)),
            Some(self.issue_source.clone()),
            self.in_try,
        );

        let Some(module) = *module.first_module().await? else {
            return Ok(None);
        };
        let Some(chunkable) = ResolvedVc::try_downcast::<Box<dyn ChunkableModule>>(module) else {
            CodeGenerationIssue {
                severity: IssueSeverity::Bug.resolved_cell(),
                title: StyledString::Text("non-ecmascript placeable asset".into()).resolved_cell(),
                message: StyledString::Text("asset is not placeable in ESM chunks".into())
                    .resolved_cell(),
                path: self.origin.origin_path().to_resolved().await?,
            }
            .resolved_cell()
            .emit();
            return Ok(None);
        };

        Ok(Some(WorkerLoaderModule::new(*chunkable)))
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for WorkerAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        if let Some(worker_loader_module) = self.worker_loader_module().await? {
            Ok(ModuleResolveResult::module(ResolvedVc::upcast(
                worker_loader_module.to_resolved().await?,
            ))
            .cell())
        } else {
            Ok(ModuleResolveResult::unresolvable().cell())
        }
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

#[derive(PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat, NonLocalValue)]
pub struct WorkerAssetReferenceCodeGen {
    reference: ResolvedVc<WorkerAssetReference>,
    path: AstPath,
}

impl WorkerAssetReferenceCodeGen {
    pub async fn code_generation(
        &self,
        _module_graph: Vc<ModuleGraph>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let Some(loader) = self.reference.await?.worker_loader_module().await? else {
            bail!("Worker loader could not be created");
        };

        let item_id = chunking_context
            .chunk_item_id_from_ident(loader.ident())
            .await?;

        let visitor = create_visitor!(self.path, visit_mut_expr(expr: &mut Expr) {
            let message = if let Expr::New(NewExpr { args, ..}) = expr {
                if let Some(args) = args {
                    match args.first_mut() {
                        Some(ExprOrSpread { spread: None, expr }) => {
                            let item_id = Expr::Lit(Lit::Str(item_id.to_string().into()));
                            *expr = quote_expr!(
                                "$turbopack_require($item_id)",
                                turbopack_require: Expr = TURBOPACK_REQUIRE.into(),
                                item_id: Expr = item_id
                            );

                            if let Some(opts) = args.get_mut(1) {
                                if opts.spread.is_none(){
                                    *opts.expr = *quote_expr!(
                                        "{...$opts, type: undefined}",
                                        opts: Expr = (*opts.expr).take()
                                    );
                                }

                            }
                            return;
                        }
                        // These are SWC bugs: https://github.com/swc-project/swc/issues/5394
                        Some(ExprOrSpread { spread: Some(_), expr: _ }) => {
                            "spread operator is illegal in new Worker() expressions."
                        }
                        _ => {
                            "new Worker() expressions require at least 1 argument"
                        }
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
