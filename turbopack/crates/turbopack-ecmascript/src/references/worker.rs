use anyhow::{bail, Result};
use swc_core::{
    common::util::take::Take,
    ecma::ast::{Expr, ExprOrSpread, Lit, NewExpr},
    quote_expr,
};
use turbo_tasks::{debug::ValueDebug, RcStr, Value, ValueToString, Vc};
use turbopack_core::{
    chunk::{
        ChunkableModule, ChunkableModuleReference, ChunkingContext, ChunkingType,
        ChunkingTypeOption,
    },
    issue::IssueSource,
    module::Module,
    reference::ModuleReference,
    reference_type::ReferenceType,
    resolve::{origin::ResolveOrigin, parse::Request, url_resolve, ModuleResolveResult},
};
use turbopack_resolve::ecmascript::try_to_severity;

use crate::{
    code_gen::{CodeGenerateable, CodeGeneration},
    create_visitor,
    isolated_chunk::module::IsolatedLoaderModule,
    references::AstPath,
};

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct WorkerAssetReference {
    pub origin: Vc<Box<dyn ResolveOrigin>>,
    pub request: Vc<Request>,
    pub path: Vc<AstPath>,
    pub issue_source: Vc<IssueSource>,
    pub in_try: bool,
    pub import_externals: bool,
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
        import_externals: bool,
    ) -> Vc<Self> {
        Self::cell(WorkerAssetReference {
            origin,
            request,
            path,
            issue_source,
            in_try,
            import_externals,
        })
    }
}

impl WorkerAssetReference {
    async fn worker_loader_module(self: &WorkerAssetReference) -> Result<Vc<IsolatedLoaderModule>> {
        let module = url_resolve(
            self.origin,
            self.request,
            Value::new(ReferenceType::Worker),
            Some(self.issue_source),
            try_to_severity(self.in_try),
        );

        // TODO unwrap
        let module = module.first_module().await?.unwrap();
        let Some(chunkable) = Vc::try_resolve_downcast::<Box<dyn ChunkableModule>>(module).await?
        else {
            bail!("x");
        };
        Ok(IsolatedLoaderModule::new(chunkable))
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for WorkerAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        Ok(ModuleResolveResult::module(Vc::upcast(self.worker_loader_module().await?)).cell())
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
impl ChunkableModuleReference for WorkerAssetReference {
    #[turbo_tasks::function]
    fn chunking_type(&self) -> Vc<ChunkingTypeOption> {
        Vc::cell(Some(ChunkingType::Parallel))
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for WorkerAssetReference {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<CodeGeneration>> {
        let loader = self.worker_loader_module().await?;

        let item_id = chunking_context
            .chunk_item_id_from_ident(loader.ident())
            .await?;

        let path = &self.path.await?;

        let visitor = create_visitor!(path, visit_mut_expr(expr: &mut Expr) {
            let old_expr = expr.take();
            let message = if let Expr::New(NewExpr { args, ..}) = old_expr {
                if let Some(args) = args {
                    match args.into_iter().next() {
                        Some(ExprOrSpread { spread: None, .. }) => {
                            let item_id = Expr::Lit(Lit::Str(item_id.to_string().into()));
                            *expr = *quote_expr!(
                                "new Worker(__turbopack_require__($item_id))",
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

        Ok(CodeGeneration {
            visitors: vec![visitor],
        }
        .into())
    }
}
