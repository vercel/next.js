use anyhow::Result;
use serde::{Deserialize, Serialize};
use swc_core::{
    common::{DUMMY_SP, util::take::Take},
    ecma::ast::{CallExpr, Callee, Expr, ExprOrSpread, Lit},
    quote_expr,
};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    NonLocalValue, ResolvedVc, ValueToString, Vc, debug::ValueDebugFormat, trace::TraceRawVcs,
};
use turbopack_core::{
    chunk::{ChunkableModuleReference, ChunkingContext, ChunkingType, ChunkingTypeOption},
    environment::ChunkLoading,
    issue::IssueSource,
    reference::ModuleReference,
    reference_type::EcmaScriptModulesReferenceSubType,
    resolve::{
        ModuleResolveResult,
        origin::{ResolveOrigin, ResolveOriginExt},
        parse::Request,
    },
};
use turbopack_resolve::ecmascript::esm_resolve;

use super::super::pattern_mapping::{PatternMapping, ResolveType};
use crate::{
    analyzer::imports::ImportAnnotations,
    code_gen::{CodeGen, CodeGeneration, IntoCodeGenReference},
    create_visitor,
    references::AstPath,
};

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct EsmAsyncAssetReference {
    pub origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    pub request: ResolvedVc<Request>,
    pub annotations: ImportAnnotations,
    pub issue_source: IssueSource,
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

impl EsmAsyncAssetReference {
    pub fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: ResolvedVc<Request>,
        issue_source: IssueSource,
        annotations: ImportAnnotations,
        in_try: bool,
        import_externals: bool,
    ) -> Self {
        EsmAsyncAssetReference {
            origin,
            request,
            issue_source,
            annotations,
            in_try,
            import_externals,
        }
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for EsmAsyncAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        esm_resolve(
            self.get_origin().resolve().await?,
            *self.request,
            EcmaScriptModulesReferenceSubType::DynamicImport,
            self.in_try,
            Some(self.issue_source),
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

impl IntoCodeGenReference for EsmAsyncAssetReference {
    fn into_code_gen_reference(
        self,
        path: AstPath,
    ) -> (ResolvedVc<Box<dyn ModuleReference>>, CodeGen) {
        let reference = self.resolved_cell();
        (
            ResolvedVc::upcast(reference),
            CodeGen::EsmAsyncAssetReferenceCodeGen(EsmAsyncAssetReferenceCodeGen {
                reference,
                path,
            }),
        )
    }
}

#[derive(PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat, NonLocalValue)]
pub struct EsmAsyncAssetReferenceCodeGen {
    path: AstPath,
    reference: ResolvedVc<EsmAsyncAssetReference>,
}

impl EsmAsyncAssetReferenceCodeGen {
    pub async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let reference = self.reference.await?;

        let pm = PatternMapping::resolve_request(
            *reference.request,
            *reference.origin,
            chunking_context,
            self.reference.resolve_reference(),
            if matches!(
                *chunking_context.environment().chunk_loading().await?,
                ChunkLoading::Edge
            ) {
                ResolveType::ChunkItem
            } else {
                ResolveType::AsyncChunkLoader
            },
        )
        .await?;

        let import_externals = reference.import_externals;

        let visitor = create_visitor!(self.path, visit_mut_expr, |expr: &mut Expr| {
            let old_expr = expr.take();
            let message = if let Expr::Call(CallExpr { args, .. }) = old_expr {
                match args.into_iter().next() {
                    Some(ExprOrSpread {
                        spread: None,
                        expr: key_expr,
                    }) => {
                        *expr = pm.create_import(*key_expr, import_externals);
                        return;
                    }
                    // These are SWC bugs: https://github.com/swc-project/swc/issues/5394
                    Some(ExprOrSpread {
                        spread: Some(_),
                        expr: _,
                    }) => "spread operator is illegal in import() expressions.",
                    _ => "import() expressions require at least 1 argument",
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
