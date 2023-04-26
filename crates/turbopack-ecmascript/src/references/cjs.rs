use anyhow::Result;
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{Callee, Expr, ExprOrSpread, Ident, ObjectLit},
};
use turbo_tasks::{primitives::StringVc, Value, ValueToString, ValueToStringVc};
use turbopack_core::{
    chunk::{ChunkableAssetReference, ChunkableAssetReferenceVc},
    issue::{IssueSourceVc, OptionIssueSourceVc},
    reference::{AssetReference, AssetReferenceVc},
    resolve::{origin::ResolveOriginVc, parse::RequestVc, ResolveResultVc},
};

use super::pattern_mapping::{PatternMapping, PatternMappingVc, ResolveType::Cjs};
use crate::{
    chunk::EcmascriptChunkingContextVc,
    code_gen::{CodeGenerateable, CodeGenerateableVc, CodeGeneration, CodeGenerationVc},
    create_visitor,
    references::{util::throw_module_not_found_expr, AstPathVc},
    resolve::{cjs_resolve, try_to_severity},
};

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct CjsAssetReference {
    pub origin: ResolveOriginVc,
    pub request: RequestVc,
    pub issue_source: IssueSourceVc,
    pub in_try: bool,
}

#[turbo_tasks::value_impl]
impl CjsAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(
        origin: ResolveOriginVc,
        request: RequestVc,
        issue_source: IssueSourceVc,
        in_try: bool,
    ) -> Self {
        Self::cell(CjsAssetReference {
            origin,
            request,
            issue_source,
            in_try,
        })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for CjsAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        cjs_resolve(
            self.origin,
            self.request,
            OptionIssueSourceVc::some(self.issue_source),
            try_to_severity(self.in_try),
        )
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for CjsAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "generic commonjs {}",
            self.request.to_string().await?,
        )))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAssetReference for CjsAssetReference {}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct CjsRequireAssetReference {
    pub origin: ResolveOriginVc,
    pub request: RequestVc,
    pub path: AstPathVc,
    pub issue_source: IssueSourceVc,
    pub in_try: bool,
}

#[turbo_tasks::value_impl]
impl CjsRequireAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(
        origin: ResolveOriginVc,
        request: RequestVc,
        path: AstPathVc,
        issue_source: IssueSourceVc,
        in_try: bool,
    ) -> Self {
        Self::cell(CjsRequireAssetReference {
            origin,
            request,
            path,
            issue_source,
            in_try,
        })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for CjsRequireAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        cjs_resolve(
            self.origin,
            self.request,
            OptionIssueSourceVc::some(self.issue_source),
            try_to_severity(self.in_try),
        )
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for CjsRequireAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "require {}",
            self.request.to_string().await?,
        )))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAssetReference for CjsRequireAssetReference {}

#[turbo_tasks::value_impl]
impl CodeGenerateable for CjsRequireAssetReference {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        context: EcmascriptChunkingContextVc,
    ) -> Result<CodeGenerationVc> {
        let pm = PatternMappingVc::resolve_request(
            self.request,
            self.origin,
            context.into(),
            cjs_resolve(
                self.origin,
                self.request,
                OptionIssueSourceVc::some(self.issue_source),
                try_to_severity(self.in_try),
            ),
            Value::new(Cjs),
        )
        .await?;
        let mut visitors = Vec::new();

        let path = &self.path.await?;
        match &*pm {
            PatternMapping::Invalid => {
                let request_string = self.request.to_string().await?;
                visitors.push(create_visitor!(path, visit_mut_expr(expr: &mut Expr) {
                    // In Node.js, a require call that cannot be resolved will throw an error.
                    *expr = throw_module_not_found_expr(&request_string);
                }));
            }
            PatternMapping::Ignored => {
                visitors.push(create_visitor!(path, visit_mut_expr(expr: &mut Expr) {
                    // Ignored modules behave as if they have no code nor exports.
                    *expr = Expr::Object(ObjectLit {
                        span: DUMMY_SP,
                        props: vec![],
                    });
                }));
            }
            _ => {
                visitors.push(
                    create_visitor!(exact path, visit_mut_call_expr(call_expr: &mut CallExpr) {
                        call_expr.callee = Callee::Expr(
                            Box::new(Expr::Ident(Ident::new(
                                if pm.is_internal_import() {
                                    "__turbopack_require__"
                                } else {
                                    "__turbopack_external_require__"
                                }.into(), DUMMY_SP
                            )))
                        );
                        let old_args = std::mem::take(&mut call_expr.args);
                        let expr = match old_args.into_iter().next() {
                            Some(ExprOrSpread { expr, spread: None }) => pm.apply(*expr),
                            _ => pm.create(),
                        };
                        call_expr.args.push(ExprOrSpread { spread: None, expr: Box::new(expr) });
                    }),
                );
            }
        }

        Ok(CodeGeneration { visitors }.into())
    }
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct CjsRequireResolveAssetReference {
    pub origin: ResolveOriginVc,
    pub request: RequestVc,
    pub path: AstPathVc,
    pub issue_source: IssueSourceVc,
    pub in_try: bool,
}

#[turbo_tasks::value_impl]
impl CjsRequireResolveAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(
        origin: ResolveOriginVc,
        request: RequestVc,
        path: AstPathVc,
        issue_source: IssueSourceVc,
        in_try: bool,
    ) -> Self {
        Self::cell(CjsRequireResolveAssetReference {
            origin,
            request,
            path,
            issue_source,
            in_try,
        })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for CjsRequireResolveAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        cjs_resolve(
            self.origin,
            self.request,
            OptionIssueSourceVc::some(self.issue_source),
            try_to_severity(self.in_try),
        )
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for CjsRequireResolveAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "require.resolve {}",
            self.request.to_string().await?,
        )))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAssetReference for CjsRequireResolveAssetReference {}

#[turbo_tasks::value_impl]
impl CodeGenerateable for CjsRequireResolveAssetReference {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        context: EcmascriptChunkingContextVc,
    ) -> Result<CodeGenerationVc> {
        let pm = PatternMappingVc::resolve_request(
            self.request,
            self.origin,
            context.into(),
            cjs_resolve(
                self.origin,
                self.request,
                OptionIssueSourceVc::some(self.issue_source),
                try_to_severity(self.in_try),
            ),
            Value::new(Cjs),
        )
        .await?;
        let mut visitors = Vec::new();

        let path = &self.path.await?;
        if let PatternMapping::Invalid = &*pm {
            let request_string = self.request.to_string().await?;
            visitors.push(create_visitor!(path, visit_mut_expr(expr: &mut Expr) {
                // In Node.js, a require.resolve call that cannot be resolved will throw an error.
                *expr = throw_module_not_found_expr(&request_string);
            }));
        } else {
            // Inline the result of the `require.resolve` call as a string literal.
            visitors.push(create_visitor!(path, visit_mut_expr(expr: &mut Expr) {
                if let Expr::Call(call_expr) = expr {
                    let args = std::mem::take(&mut call_expr.args);
                    *expr = match args.into_iter().next() {
                        Some(ExprOrSpread { expr, spread: None }) => pm.apply(*expr),
                        _ => pm.create(),
                    };
                }
                // CjsRequireResolveAssetReference will only be used for Expr::Call.
                // Due to eventual consistency the path might match something else,
                // but we can ignore that as it will be recomputed anyway.
            }));
        }

        Ok(CodeGeneration { visitors }.into())
    }
}

#[turbo_tasks::value(shared)]
#[derive(Hash, Debug)]
pub struct CjsRequireCacheAccess {
    pub path: AstPathVc,
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for CjsRequireCacheAccess {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        _context: EcmascriptChunkingContextVc,
    ) -> Result<CodeGenerationVc> {
        let mut visitors = Vec::new();

        let path = &self.path.await?;
        visitors.push(create_visitor!(path, visit_mut_expr(expr: &mut Expr) {
            if let Expr::Member(_) = expr {
                *expr = Expr::Ident(Ident::new("__turbopack_cache__".into(), DUMMY_SP));
            } else {
                unreachable!("`CjsRequireCacheAccess` is only created from `MemberExpr`");
            }
        }));

        Ok(CodeGeneration { visitors }.into())
    }
}
