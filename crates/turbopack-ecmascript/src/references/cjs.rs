use std::collections::HashMap;

use anyhow::Result;
use swc_common::DUMMY_SP;
use swc_ecma_ast::{Callee, Expr, ExprOrSpread, Ident, Lit, Str};
use swc_ecma_quote::quote;
use turbo_tasks::primitives::{BoolVc, StringVc};
use turbopack_core::{
    asset::AssetVc,
    chunk::{ChunkableAssetReference, ChunkableAssetReferenceVc, ChunkingContextVc, ModuleId},
    context::AssetContextVc,
    reference::{AssetReference, AssetReferenceVc},
    resolve::{parse::RequestVc, ResolveResult, ResolveResultVc},
};

use crate::{
    code_gen::{CodeGenerateable, CodeGenerateableVc, CodeGeneration, CodeGenerationVc},
    create_visitor,
    references::AstPathVc,
    resolve::cjs_resolve,
    EcmascriptChunkContextVc, EcmascriptChunkPlaceableVc,
};

#[turbo_tasks::value(AssetReference, ChunkableAssetReference)]
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

    #[turbo_tasks::function]
    async fn description(&self) -> Result<StringVc> {
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

#[turbo_tasks::value(shared)]
enum PatternMapping {
    Invalid,
    Single(ModuleId),
    Map(HashMap<String, ModuleId>),
}

impl PatternMapping {
    fn create(&self) -> Expr {
        match self {
            PatternMapping::Invalid => {
                // TODO improve error message
                quote!("(() => {throw new Error(\"Invalid\")})()" as Expr)
            }
            PatternMapping::Single(ModuleId::Number(n)) => Expr::Lit(Lit::Num((*n as f64).into())),
            PatternMapping::Single(ModuleId::String(s)) => Expr::Lit(Lit::Str(Str {
                span: DUMMY_SP,
                value: (s as &str).into(),
                raw: None,
            })),
            PatternMapping::Map(_) => {
                todo!("emit an error for this case: Complex expression can't be transformed");
            }
        }
    }

    fn apply(&self, _key_expr: Expr) -> Expr {
        // TODO handle PatternMapping::Map
        self.create()
    }
}

#[turbo_tasks::function]
async fn resolve_to_pattern_mapping(
    request: RequestVc,
    context: AssetContextVc,
    chunk_context: EcmascriptChunkContextVc,
) -> Result<PatternMappingVc> {
    let resolve_result = cjs_resolve(request, context).await?;
    async fn handle_asset(
        asset: AssetVc,
        chunk_context: EcmascriptChunkContextVc,
    ) -> Result<PatternMappingVc> {
        if let Some(placeable) = EcmascriptChunkPlaceableVc::resolve_from(asset).await? {
            Ok(PatternMapping::Single(chunk_context.id(placeable).await?.clone()).into())
        } else {
            println!(
                "asset {} is not placeable in ESM chunks, so it doesn't have a module id",
                asset.path().to_string().await?
            );
            Ok(PatternMapping::Invalid.into())
        }
    }
    match &*resolve_result {
        ResolveResult::Alternatives(assets, _) => {
            if let Some(asset) = assets.first() {
                handle_asset(*asset, chunk_context).await
            } else {
                Ok(PatternMapping::Invalid.into())
            }
        }
        ResolveResult::Single(asset, _) => handle_asset(*asset, chunk_context).await,
        _ => {
            // TODO implement mapping
            println!(
                "the reference resolves to a non-trivial result, which is not supported yet: {:?}",
                &*resolve_result
            );
            Ok(PatternMapping::Invalid.into())
        }
    }
}

#[turbo_tasks::value(AssetReference, ChunkableAssetReference, CodeGenerateable)]
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

    #[turbo_tasks::function]
    async fn description(&self) -> Result<StringVc> {
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

#[turbo_tasks::value_impl]
impl CodeGenerateable for CjsRequireAssetReference {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        chunk_context: EcmascriptChunkContextVc,
        _context: ChunkingContextVc,
    ) -> Result<CodeGenerationVc> {
        let pm = resolve_to_pattern_mapping(self.request, self.context, chunk_context).await?;
        let mut visitors = Vec::new();

        let path = &self.path.await?;
        if let PatternMapping::Invalid = &*pm {
            visitors.push(create_visitor!(path, visit_mut_expr(expr: &mut Expr) {
                *expr = Expr::Ident(Ident::new("undefined".into(), DUMMY_SP));
            }));
        } else {
            visitors.push(
                create_visitor!(exact path, visit_mut_call_expr(call_expr: &mut CallExpr) {
                    call_expr.callee = Callee::Expr(box Expr::Ident(Ident::new("__turbopack_require__".into(), DUMMY_SP)));
                    let old_args = call_expr.args.drain(..).collect::<Vec<_>>();
                    let expr = match old_args.into_iter().next() {
                        Some(ExprOrSpread { expr, spread: None }) => {
                            pm.apply(*expr)
                        }
                        _ => pm.create()
                    };
                    call_expr.args.push(ExprOrSpread { spread: None, expr: box expr });
                }),
            );
        }

        Ok(CodeGeneration { visitors }.into())
    }
}
