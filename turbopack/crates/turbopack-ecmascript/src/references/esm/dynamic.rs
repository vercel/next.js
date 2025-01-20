use anyhow::Result;
use swc_core::{
    common::{util::take::Take, DUMMY_SP},
    ecma::ast::{CallExpr, Callee, Expr, ExprOrSpread, Lit},
    quote_expr,
};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Value, ValueToString, Vc};
use turbopack_core::{
    chunk::{ChunkableModuleReference, ChunkingContext, ChunkingType, ChunkingTypeOption},
    environment::ChunkLoading,
    issue::IssueSource,
    module_graph::ModuleGraph,
    reference::ModuleReference,
    reference_type::EcmaScriptModulesReferenceSubType,
    resolve::{
        origin::{ResolveOrigin, ResolveOriginExt},
        parse::Request,
        ModuleResolveResult,
    },
};
use turbopack_resolve::ecmascript::esm_resolve;

use super::super::pattern_mapping::{PatternMapping, ResolveType};
use crate::{
    analyzer::imports::ImportAnnotations,
    code_gen::{CodeGenerateable, CodeGeneration},
    create_visitor,
    references::AstPath,
};

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct EsmAsyncAssetReference {
    pub origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    pub request: ResolvedVc<Request>,
    pub path: ResolvedVc<AstPath>,
    pub annotations: ImportAnnotations,
    pub issue_source: ResolvedVc<IssueSource>,
    pub in_try: bool,
    pub import_externals: bool,
}

impl EsmAsyncAssetReference {
    fn get_origin(&self) -> Vc<Box<dyn ResolveOrigin>> {
        if let Some(transition) = self.annotations.transition() {
            self.origin.with_transition(transition.into())
        } else {
            *self.origin
        }
    }
}

#[turbo_tasks::value_impl]
impl EsmAsyncAssetReference {
    #[turbo_tasks::function]
    pub fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: ResolvedVc<Request>,
        path: ResolvedVc<AstPath>,
        issue_source: ResolvedVc<IssueSource>,
        annotations: Value<ImportAnnotations>,
        in_try: bool,
        import_externals: bool,
    ) -> Vc<Self> {
        Self::cell(EsmAsyncAssetReference {
            origin,
            request,
            path,
            issue_source,
            annotations: annotations.into_value(),
            in_try,
            import_externals,
        })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for EsmAsyncAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        esm_resolve(
            self.get_origin().resolve().await?,
            *self.request,
            Value::new(EcmaScriptModulesReferenceSubType::DynamicImport),
            self.in_try,
            Some(*self.issue_source),
        )
        .await
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EsmAsyncAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("dynamic import {}", self.request.to_string().await?,).into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for EsmAsyncAssetReference {
    #[turbo_tasks::function]
    fn chunking_type(&self) -> Vc<ChunkingTypeOption> {
        Vc::cell(Some(ChunkingType::Async))
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for EsmAsyncAssetReference {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        module_graph: Vc<ModuleGraph>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<CodeGeneration>> {
        let pm = PatternMapping::resolve_request(
            *self.request,
            *self.origin,
            module_graph,
            Vc::upcast(chunking_context),
            esm_resolve(
                self.get_origin().resolve().await?,
                *self.request,
                Value::new(EcmaScriptModulesReferenceSubType::DynamicImport),
                self.in_try,
                Some(*self.issue_source),
            )
            .await?,
            if matches!(
                *chunking_context.environment().chunk_loading().await?,
                ChunkLoading::Edge
            ) {
                Value::new(ResolveType::ChunkItem)
            } else {
                Value::new(ResolveType::AsyncChunkLoader)
            },
        )
        .await?;

        let path = &self.path.await?;
        let import_externals = self.import_externals;

        let visitor = create_visitor!(path, visit_mut_expr(expr: &mut Expr) {
            let old_expr = expr.take();
            let message = if let Expr::Call(CallExpr { args, ..}) = old_expr {
                match args.into_iter().next() {
                    Some(ExprOrSpread { spread: None, expr: key_expr }) => {
                        *expr = pm.create_import(*key_expr, import_externals);
                        return;
                    }
                    // These are SWC bugs: https://github.com/swc-project/swc/issues/5394
                    Some(ExprOrSpread { spread: Some(_), expr: _ }) => {
                        "spread operator is illegal in import() expressions."
                    }
                    _ => {
                        "import() expressions require at least 1 argument"
                    }
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
