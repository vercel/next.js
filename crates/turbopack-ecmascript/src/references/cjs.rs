use anyhow::Result;
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{Callee, Expr, ExprOrSpread, Ident, Lit, Str},
    quote,
};
use turbo_tasks::{
    primitives::{BoolVc, StringVc},
    Value, ValueToString, ValueToStringVc,
};
use turbopack_core::{
    chunk::{ChunkableAssetReference, ChunkableAssetReferenceVc, ChunkingContextVc},
    context::AssetContextVc,
    reference::{AssetReference, AssetReferenceVc},
    resolve::{parse::RequestVc, ResolveResultVc},
};

use super::pattern_mapping::{PatternMapping, PatternMappingVc, ResolveType::Cjs};
use crate::{
    code_gen::{CodeGenerateable, CodeGenerateableVc, CodeGeneration, CodeGenerationVc},
    create_visitor,
    references::AstPathVc,
    resolve::cjs_resolve,
};

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct CjsAssetReference {
    pub context: AssetContextVc,
    pub request: RequestVc,
}

#[turbo_tasks::value_impl]
impl CjsAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(context: AssetContextVc, request: RequestVc) -> Self {
        Self::cell(CjsAssetReference { context, request })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for CjsAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        cjs_resolve(self.request, self.context)
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
impl ChunkableAssetReference for CjsAssetReference {
    #[turbo_tasks::function]
    fn is_chunkable(&self) -> BoolVc {
        BoolVc::cell(true)
    }
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct CjsRequireAssetReference {
    pub context: AssetContextVc,
    pub request: RequestVc,
    pub path: AstPathVc,
}

#[turbo_tasks::value_impl]
impl CjsRequireAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(context: AssetContextVc, request: RequestVc, path: AstPathVc) -> Self {
        Self::cell(CjsRequireAssetReference {
            context,
            request,
            path,
        })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for CjsRequireAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        cjs_resolve(self.request, self.context)
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
impl ChunkableAssetReference for CjsRequireAssetReference {
    #[turbo_tasks::function]
    fn is_chunkable(&self) -> BoolVc {
        BoolVc::cell(true)
    }
}

/// Creates a IIFE that throws an error with the given error message.
fn throw_expr(message: Str) -> Expr {
    let message_arg = Expr::Lit(Lit::Str(message));
    quote!(
        "function() { throw new Error($arg) }()" as Expr,
        arg: Expr = message_arg
    )
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for CjsRequireAssetReference {
    #[turbo_tasks::function]
    async fn code_generation(&self, context: ChunkingContextVc) -> Result<CodeGenerationVc> {
        let pm = PatternMappingVc::resolve_request(
            self.context.context_path(),
            context,
            cjs_resolve(self.request, self.context),
            Value::new(Cjs),
        )
        .await?;
        let mut visitors = Vec::new();

        let path = &self.path.await?;
        if let PatternMapping::Invalid = &*pm {
            let request_string = self.request.to_string().await?.clone();
            visitors.push(create_visitor!(path, visit_mut_expr(expr: &mut Expr) {
                // In Node.js, a require call that cannot be resolved will throw an error.
                *expr = throw_expr(format!("Cannot find {request_string}").into());
            }));
        } else {
            visitors.push(
                create_visitor!(exact path, visit_mut_call_expr(call_expr: &mut CallExpr) {
                    call_expr.callee = Callee::Expr(box Expr::Ident(Ident::new(if pm.is_internal_import() { "__turbopack_require__" } else { "require" }.into(), DUMMY_SP)));
                    let old_args = std::mem::take(&mut call_expr.args);
                    let expr = match old_args.into_iter().next() {
                        Some(ExprOrSpread { expr, spread: None }) => pm.apply(*expr),
                        _ => pm.create(),
                    };
                    call_expr.args.push(ExprOrSpread { spread: None, expr: box expr });
                }),
            );
        }

        Ok(CodeGeneration { visitors }.into())
    }
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct CjsRequireResolveAssetReference {
    pub context: AssetContextVc,
    pub request: RequestVc,
    pub path: AstPathVc,
}

#[turbo_tasks::value_impl]
impl CjsRequireResolveAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(context: AssetContextVc, request: RequestVc, path: AstPathVc) -> Self {
        Self::cell(CjsRequireResolveAssetReference {
            context,
            request,
            path,
        })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for CjsRequireResolveAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        cjs_resolve(self.request, self.context)
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
impl ChunkableAssetReference for CjsRequireResolveAssetReference {
    #[turbo_tasks::function]
    fn is_chunkable(&self) -> BoolVc {
        BoolVc::cell(true)
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for CjsRequireResolveAssetReference {
    #[turbo_tasks::function]
    async fn code_generation(&self, context: ChunkingContextVc) -> Result<CodeGenerationVc> {
        let pm = PatternMappingVc::resolve_request(
            self.context.context_path(),
            context,
            cjs_resolve(self.request, self.context),
            Value::new(Cjs),
        )
        .await?;
        let mut visitors = Vec::new();

        let path = &self.path.await?;
        if let PatternMapping::Invalid = &*pm {
            let request_string = self.request.to_string().await?.clone();
            visitors.push(create_visitor!(path, visit_mut_expr(expr: &mut Expr) {
                // In Node.js, a require.resolve call that cannot be resolved will throw an error.
                *expr = throw_expr(format!("Cannot find {request_string}").into());
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
                } else {
                    unreachable!("`CjsRequireResolveAssetReference` is only created from `CallExpr`");
                }
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
    async fn code_generation(&self, _context: ChunkingContextVc) -> Result<CodeGenerationVc> {
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
