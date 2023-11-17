use anyhow::Result;
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{Callee, Expr, ExprOrSpread, Ident, ObjectLit},
};
use turbo_tasks::{Value, ValueToString, Vc};
use turbopack_core::{
    chunk::ChunkableModuleReference,
    issue::IssueSource,
    reference::ModuleReference,
    resolve::{origin::ResolveOrigin, parse::Request, ModuleResolveResult},
};

use super::pattern_mapping::{PatternMapping, ResolveType::ChunkItem};
use crate::{
    chunk::EcmascriptChunkingContext,
    code_gen::{CodeGenerateable, CodeGeneration},
    create_visitor,
    references::{util::throw_module_not_found_expr, AstPath},
    resolve::{cjs_resolve, try_to_severity},
};

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct CjsAssetReference {
    pub origin: Vc<Box<dyn ResolveOrigin>>,
    pub request: Vc<Request>,
    pub issue_source: Vc<IssueSource>,
    pub in_try: bool,
}

#[turbo_tasks::value_impl]
impl CjsAssetReference {
    #[turbo_tasks::function]
    pub fn new(
        origin: Vc<Box<dyn ResolveOrigin>>,
        request: Vc<Request>,
        issue_source: Vc<IssueSource>,
        in_try: bool,
    ) -> Vc<Self> {
        Self::cell(CjsAssetReference {
            origin,
            request,
            issue_source,
            in_try,
        })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for CjsAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        cjs_resolve(
            self.origin,
            self.request,
            Some(self.issue_source),
            try_to_severity(self.in_try),
        )
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for CjsAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<String>> {
        Ok(Vc::cell(format!(
            "generic commonjs {}",
            self.request.to_string().await?,
        )))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for CjsAssetReference {}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct CjsRequireAssetReference {
    pub origin: Vc<Box<dyn ResolveOrigin>>,
    pub request: Vc<Request>,
    pub path: Vc<AstPath>,
    pub issue_source: Vc<IssueSource>,
    pub in_try: bool,
}

#[turbo_tasks::value_impl]
impl CjsRequireAssetReference {
    #[turbo_tasks::function]
    pub fn new(
        origin: Vc<Box<dyn ResolveOrigin>>,
        request: Vc<Request>,
        path: Vc<AstPath>,
        issue_source: Vc<IssueSource>,
        in_try: bool,
    ) -> Vc<Self> {
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
impl ModuleReference for CjsRequireAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        cjs_resolve(
            self.origin,
            self.request,
            Some(self.issue_source),
            try_to_severity(self.in_try),
        )
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for CjsRequireAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<String>> {
        Ok(Vc::cell(format!(
            "require {}",
            self.request.to_string().await?,
        )))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for CjsRequireAssetReference {}

#[turbo_tasks::value_impl]
impl CodeGenerateable for CjsRequireAssetReference {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
    ) -> Result<Vc<CodeGeneration>> {
        let pm = PatternMapping::resolve_request(
            self.request,
            self.origin,
            Vc::upcast(chunking_context),
            cjs_resolve(
                self.origin,
                self.request,
                Some(self.issue_source),
                try_to_severity(self.in_try),
            ),
            Value::new(ChunkItem),
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
    pub origin: Vc<Box<dyn ResolveOrigin>>,
    pub request: Vc<Request>,
    pub path: Vc<AstPath>,
    pub issue_source: Vc<IssueSource>,
    pub in_try: bool,
}

#[turbo_tasks::value_impl]
impl CjsRequireResolveAssetReference {
    #[turbo_tasks::function]
    pub fn new(
        origin: Vc<Box<dyn ResolveOrigin>>,
        request: Vc<Request>,
        path: Vc<AstPath>,
        issue_source: Vc<IssueSource>,
        in_try: bool,
    ) -> Vc<Self> {
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
impl ModuleReference for CjsRequireResolveAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        cjs_resolve(
            self.origin,
            self.request,
            Some(self.issue_source),
            try_to_severity(self.in_try),
        )
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for CjsRequireResolveAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<String>> {
        Ok(Vc::cell(format!(
            "require.resolve {}",
            self.request.to_string().await?,
        )))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for CjsRequireResolveAssetReference {}

#[turbo_tasks::value_impl]
impl CodeGenerateable for CjsRequireResolveAssetReference {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
    ) -> Result<Vc<CodeGeneration>> {
        let pm = PatternMapping::resolve_request(
            self.request,
            self.origin,
            Vc::upcast(chunking_context),
            cjs_resolve(
                self.origin,
                self.request,
                Some(self.issue_source),
                try_to_severity(self.in_try),
            ),
            Value::new(ChunkItem),
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
    pub path: Vc<AstPath>,
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for CjsRequireCacheAccess {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        _context: Vc<Box<dyn EcmascriptChunkingContext>>,
    ) -> Result<Vc<CodeGeneration>> {
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
