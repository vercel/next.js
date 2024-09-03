use anyhow::{bail, Result};
use swc_core::{
    common::util::take::Take,
    ecma::ast::{Expr, ExprOrSpread, Lit, NewExpr},
    quote_expr,
};
use turbo_tasks::{debug::ValueDebug, RcStr, Value, ValueToString, Vc};
use turbopack_core::{
    chunk::{
        availability_info::AvailabilityInfo, ChunkData, ChunkableModuleReference, ChunkingContext,
        ChunkingType, ChunkingTypeOption, EntryChunkGroupResult, EvaluatableAsset,
        EvaluatableAssets,
    },
    environment::ChunkLoading,
    issue::IssueSource,
    module::Module,
    output::OutputAsset,
    reference::ModuleReference,
    reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType, UrlReferenceSubType},
    resolve::{
        origin::ResolveOrigin, parse::Request, url_resolve, ModuleResolveResult,
        ModuleResolveResultItem,
    },
};
use turbopack_resolve::ecmascript::{esm_resolve, try_to_severity};

use crate::{
    chunk::EcmascriptChunkData,
    code_gen::{CodeGenerateable, CodeGeneration},
    create_visitor,
    references::AstPath,
    utils::StringifyJs,
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

fn worker_resolve_reference_inline(reference: &WorkerAssetReference) -> Vc<ModuleResolveResult> {
    url_resolve(
        reference.origin,
        reference.request,
        Value::new(ReferenceType::Worker),
        Some(reference.issue_source),
        try_to_severity(reference.in_try),
    )
}

#[turbo_tasks::value_impl]
impl ModuleReference for WorkerAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        worker_resolve_reference_inline(self)
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
        Vc::cell(Some(ChunkingType::Isolated))
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for WorkerAssetReference {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<CodeGeneration>> {
        let resolve_result = worker_resolve_reference_inline(self);
        let result = resolve_result.await?;

        // TODO unwrap
        let resolve_item = result.primary.first().unwrap().1;

        let ModuleResolveResultItem::Module(module) = *resolve_item else {
            // TODO bail
            bail!("b");
        };

        let Some(evaluatable) =
            Vc::try_resolve_downcast::<Box<dyn EvaluatableAsset>>(module).await?
        else {
            // TODO bail
            bail!("a");
        };

        let EntryChunkGroupResult { asset, .. } = &*chunking_context
            .entry_chunk_group(
                chunking_context.chunk_path(module.ident(), ".js".into()),
                module,
                EvaluatableAssets::one(evaluatable),
                Value::new(AvailabilityInfo::Root),
            )
            .await?;
        let chunk_data = ChunkData::from_asset(chunking_context.output_root(), *asset)
            .await?
            .as_ref()
            // TODO unwrap
            .unwrap()
            .await?;

        // CodeGenerationIssue {
        //     severity: IssueSeverity::Bug.into(),
        //     title: StyledString::Text("non-ecmascript placeable asset".into()).cell(),
        //     message: StyledString::Text(
        //         "asset is not placeable in ESM chunks, so it doesn't have a module id".into(),
        //     )
        //     .cell(),
        //     path: origin.origin_path(),
        // }
        // .cell()
        // .emit();

        let path = &self.path.await?;

        let visitor = create_visitor!(path, visit_mut_expr(expr: &mut Expr) {
            let old_expr = expr.take();
            let message = if let Expr::New(NewExpr { args, ..}) = old_expr {
                if let Some(args) = args {
                    match args.into_iter().next() {
                        Some(ExprOrSpread { spread: None, expr: key_expr }) => {
                            // TODO ensure that this is EcmascriptChunkData::Simple?
                            // TODO relative?
                            // let url_str = StringifyJs(&EcmascriptChunkData::new(&chunk_data)).to_string();
                            let url_str = format!("./{}", chunk_data.path);

                            let url = Expr::Lit(Lit::Str(url_str.clone().into()));
                            *expr = *quote_expr!(
                                "new Worker($url)",
                                url: Expr = url
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
