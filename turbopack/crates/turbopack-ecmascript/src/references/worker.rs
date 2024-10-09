use anyhow::{bail, Result};
use swc_core::{
    ecma::ast::{Expr, ExprOrSpread, Lit, NewExpr},
    quote_expr,
};
use turbo_tasks::{RcStr, Value, ValueToString, Vc};
use turbopack_core::{
    chunk::{ChunkableModule, ChunkableModuleReference, ChunkingContext},
    issue::{code_gen::CodeGenerationIssue, IssueExt, IssueSeverity, IssueSource, StyledString},
    module::Module,
    reference::ModuleReference,
    reference_type::{ReferenceType, WorkerReferenceSubType},
    resolve::{origin::ResolveOrigin, parse::Request, url_resolve, ModuleResolveResult},
};
use turbopack_resolve::ecmascript::try_to_severity;

use crate::{
    code_gen::{CodeGenerateable, CodeGeneration},
    create_visitor,
    references::AstPath,
    worker_chunk::module::WorkerLoaderModule,
};

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct WorkerAssetReference {
    pub origin: Vc<Box<dyn ResolveOrigin>>,
    pub request: Vc<Request>,
    pub path: Vc<AstPath>,
    pub issue_source: Vc<IssueSource>,
    pub in_try: bool,
}

#[turbo_tasks::value_impl]
impl WorkerAssetReference {
    #[turbo_tasks::function]
    pub fn new(
        origin: Vc<Box<dyn ResolveOrigin>>,
        request: Vc<Request>,
        path: Vc<AstPath>,
        issue_source: Vc<IssueSource>,
        in_try: bool,
    ) -> Vc<Self> {
        Self::cell(WorkerAssetReference {
            origin,
            request,
            path,
            issue_source,
            in_try,
        })
    }
}

impl WorkerAssetReference {
    async fn worker_loader_module(
        self: &WorkerAssetReference,
    ) -> Result<Option<Vc<WorkerLoaderModule>>> {
        let module = url_resolve(
            self.origin,
            self.request,
            // TODO support more worker types
            Value::new(ReferenceType::Worker(WorkerReferenceSubType::WebWorker)),
            Some(self.issue_source),
            try_to_severity(self.in_try),
        );

        let Some(module) = *module.first_module().await? else {
            bail!("Expected worker to resolve to a module");
        };
        let Some(chunkable) = Vc::try_resolve_downcast::<Box<dyn ChunkableModule>>(module).await?
        else {
            CodeGenerationIssue {
                severity: IssueSeverity::Bug.into(),
                title: StyledString::Text("non-ecmascript placeable asset".into()).cell(),
                message: StyledString::Text("asset is not placeable in ESM chunks".into()).cell(),
                path: self.origin.origin_path(),
            }
            .cell()
            .emit();
            return Ok(None);
        };

        Ok(Some(WorkerLoaderModule::new(chunkable)))
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for WorkerAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        if let Some(worker_loader_module) = self.worker_loader_module().await? {
            Ok(ModuleResolveResult::module(Vc::upcast(worker_loader_module)).cell())
        } else {
            Ok(ModuleResolveResult::unresolveable().cell())
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

#[turbo_tasks::value_impl]
impl CodeGenerateable for WorkerAssetReference {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<CodeGeneration>> {
        let Some(loader) = self.worker_loader_module().await? else {
            bail!("Worker loader could not be created");
        };

        let item_id = chunking_context
            .chunk_item_id_from_ident(loader.ident())
            .await?;

        let path = &self.path.await?;

        let visitor = create_visitor!(path, visit_mut_expr(expr: &mut Expr) {
            let message = if let Expr::New(NewExpr { args, ..}) = expr {
                if let Some(args) = args {
                    match args.iter_mut().next() {
                        Some(ExprOrSpread { spread: None, expr }) => {
                            let item_id = Expr::Lit(Lit::Str(item_id.to_string().into()));
                            *expr = quote_expr!(
                                "__turbopack_require__($item_id)",
                                item_id: Expr = item_id
                            );
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
