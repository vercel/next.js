use anyhow::Result;
use serde::{Deserialize, Serialize};
use swc_core::{
    common::util::take::Take,
    ecma::ast::{CallExpr, Expr, ExprOrSpread, Lit},
    quote,
};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    debug::ValueDebugFormat, trace::TraceRawVcs, NonLocalValue, ResolvedVc, ValueToString, Vc,
};
use turbopack_core::{
    chunk::{ChunkableModuleReference, ChunkingContext},
    issue::IssueSource,
    module_graph::ModuleGraph,
    reference::ModuleReference,
    resolve::{origin::ResolveOrigin, parse::Request, ModuleResolveResult},
};
use turbopack_resolve::ecmascript::cjs_resolve;

use crate::{
    code_gen::{CodeGen, CodeGeneration, IntoCodeGenReference},
    create_visitor,
    references::{
        pattern_mapping::{PatternMapping, ResolveType},
        AstPath,
    },
    runtime_functions::TURBOPACK_CACHE,
};

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct CjsAssetReference {
    pub origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    pub request: ResolvedVc<Request>,
    pub issue_source: IssueSource,
    pub in_try: bool,
}

#[turbo_tasks::value_impl]
impl CjsAssetReference {
    #[turbo_tasks::function]
    pub async fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: ResolvedVc<Request>,
        issue_source: IssueSource,
        in_try: bool,
    ) -> Result<Vc<Self>> {
        Ok(Self::cell(CjsAssetReference {
            origin,
            request,
            issue_source,
            in_try,
        }))
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for CjsAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        cjs_resolve(
            *self.origin,
            *self.request,
            Some(self.issue_source.clone()),
            self.in_try,
        )
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for CjsAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("generic commonjs {}", self.request.to_string().await?,).into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for CjsAssetReference {}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct CjsRequireAssetReference {
    pub origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    pub request: ResolvedVc<Request>,
    pub issue_source: IssueSource,
    pub in_try: bool,
}

impl CjsRequireAssetReference {
    pub fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: ResolvedVc<Request>,
        issue_source: IssueSource,
        in_try: bool,
    ) -> Self {
        CjsRequireAssetReference {
            origin,
            request,
            issue_source,
            in_try,
        }
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for CjsRequireAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        cjs_resolve(
            *self.origin,
            *self.request,
            Some(self.issue_source.clone()),
            self.in_try,
        )
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for CjsRequireAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("require {}", self.request.to_string().await?,).into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for CjsRequireAssetReference {}

impl IntoCodeGenReference for CjsRequireAssetReference {
    fn into_code_gen_reference(
        self,
        path: AstPath,
    ) -> (ResolvedVc<Box<dyn ModuleReference>>, CodeGen) {
        let reference = self.resolved_cell();
        (
            ResolvedVc::upcast(reference),
            CodeGen::CjsRequireAssetReferenceCodeGen(CjsRequireAssetReferenceCodeGen {
                reference,
                path,
            }),
        )
    }
}

#[derive(PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat, NonLocalValue)]
pub struct CjsRequireAssetReferenceCodeGen {
    reference: ResolvedVc<CjsRequireAssetReference>,
    path: AstPath,
}

impl CjsRequireAssetReferenceCodeGen {
    pub async fn code_generation(
        &self,
        module_graph: Vc<ModuleGraph>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let reference = self.reference.await?;

        let pm = PatternMapping::resolve_request(
            *reference.request,
            *reference.origin,
            module_graph,
            Vc::upcast(chunking_context),
            self.reference.resolve_reference(),
            ResolveType::ChunkItem,
        )
        .await?;
        let mut visitors = Vec::new();

        visitors.push(create_visitor!(self.path, visit_mut_expr(expr: &mut Expr) {
            let old_expr = expr.take();
            let message = if let Expr::Call(CallExpr { args, ..}) = old_expr {
                match args.into_iter().next() {
                    Some(ExprOrSpread { spread: None, expr: key_expr }) => {
                        *expr = pm.create_require(*key_expr);
                        return;
                    }
                    Some(ExprOrSpread { spread: Some(_), expr: _ }) => {
                        "spread operator is not analyse-able in require() expressions."
                    }
                    _ => {
                        "require() expressions require at least 1 argument"
                    }
                }
            } else {
                "visitor must be executed on a CallExpr"
            };
            *expr = quote!(
                "(() => { throw new Error($message); })()" as Expr,
                message: Expr = Expr::Lit(Lit::Str(message.into()))
            );
        }));

        Ok(CodeGeneration::visitors(visitors))
    }
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct CjsRequireResolveAssetReference {
    pub origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    pub request: ResolvedVc<Request>,
    pub issue_source: IssueSource,
    pub in_try: bool,
}

impl CjsRequireResolveAssetReference {
    pub fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: ResolvedVc<Request>,
        issue_source: IssueSource,
        in_try: bool,
    ) -> Self {
        CjsRequireResolveAssetReference {
            origin,
            request,
            issue_source,
            in_try,
        }
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for CjsRequireResolveAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        cjs_resolve(
            *self.origin,
            *self.request,
            Some(self.issue_source.clone()),
            self.in_try,
        )
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for CjsRequireResolveAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("require.resolve {}", self.request.to_string().await?,).into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for CjsRequireResolveAssetReference {}

impl IntoCodeGenReference for CjsRequireResolveAssetReference {
    fn into_code_gen_reference(
        self,
        path: AstPath,
    ) -> (ResolvedVc<Box<dyn ModuleReference>>, CodeGen) {
        let reference = self.resolved_cell();
        (
            ResolvedVc::upcast(reference),
            CodeGen::CjsRequireResolveAssetReferenceCodeGen(
                CjsRequireResolveAssetReferenceCodeGen { reference, path },
            ),
        )
    }
}

#[derive(PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat, NonLocalValue)]
pub struct CjsRequireResolveAssetReferenceCodeGen {
    reference: ResolvedVc<CjsRequireResolveAssetReference>,
    path: AstPath,
}

impl CjsRequireResolveAssetReferenceCodeGen {
    pub async fn code_generation(
        &self,
        module_graph: Vc<ModuleGraph>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let reference = self.reference.await?;

        let pm = PatternMapping::resolve_request(
            *reference.request,
            *reference.origin,
            module_graph,
            Vc::upcast(chunking_context),
            self.reference.resolve_reference(),
            ResolveType::ChunkItem,
        )
        .await?;
        let mut visitors = Vec::new();

        // Inline the result of the `require.resolve` call as a literal.
        visitors.push(create_visitor!(self.path, visit_mut_expr(expr: &mut Expr) {
            if let Expr::Call(call_expr) = expr {
                let args = std::mem::take(&mut call_expr.args);
                *expr = match args.into_iter().next() {
                    Some(ExprOrSpread { expr, spread: None }) => pm.create_id(*expr),
                    other => {
                        let message = match other {
                            // These are SWC bugs: https://github.com/swc-project/swc/issues/5394
                            Some(ExprOrSpread { spread: Some(_), expr: _ }) => {
                                "spread operator is not analyse-able in require() expressions."
                            }
                            _ => {
                                "require() expressions require at least 1 argument"
                            }
                        };
                        quote!(
                            "(() => { throw new Error($message); })()" as Expr,
                            message: Expr = Expr::Lit(Lit::Str(message.into()))
                        )
                    },
                };
            }
            // CjsRequireResolveAssetReference will only be used for Expr::Call.
            // Due to eventual consistency the path might match something else,
            // but we can ignore that as it will be recomputed anyway.
        }));

        Ok(CodeGeneration::visitors(visitors))
    }
}

#[derive(PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat, NonLocalValue)]
pub struct CjsRequireCacheAccess {
    pub path: AstPath,
}
impl CjsRequireCacheAccess {
    pub fn new(path: AstPath) -> Self {
        CjsRequireCacheAccess { path }
    }

    pub async fn code_generation(
        &self,
        _module_graph: Vc<ModuleGraph>,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let mut visitors = Vec::new();

        visitors.push(create_visitor!(self.path, visit_mut_expr(expr: &mut Expr) {
            if let Expr::Member(_) = expr {
                *expr = TURBOPACK_CACHE.into();
            } else {
                unreachable!("`CjsRequireCacheAccess` is only created from `MemberExpr`");
            }
        }));

        Ok(CodeGeneration::visitors(visitors))
    }
}

impl From<CjsRequireCacheAccess> for CodeGen {
    fn from(val: CjsRequireCacheAccess) -> Self {
        CodeGen::CjsRequireCacheAccess(val)
    }
}
