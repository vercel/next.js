use anyhow::{anyhow, Result};
use lazy_static::lazy_static;
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{Expr, ExprStmt, Ident, Lit, Module, ModuleItem, Program, Script, Stmt},
    quote,
};
use turbo_tasks::{primitives::StringVc, Value, ValueToString, ValueToStringVc};
use turbopack_core::{
    asset::Asset,
    chunk::{
        ChunkableAssetReference, ChunkableAssetReferenceVc, ChunkingContextVc, ChunkingType,
        ChunkingTypeOptionVc, ModuleId,
    },
    reference::{AssetReference, AssetReferenceVc},
    resolve::{
        origin::ResolveOriginVc, parse::RequestVc, ResolveResult, ResolveResultVc, SpecialType,
    },
};

use crate::{
    analyzer::imports::ImportAnnotations,
    chunk::EcmascriptChunkPlaceableVc,
    code_gen::{CodeGenerateable, CodeGenerateableVc, CodeGeneration, CodeGenerationVc},
    create_visitor, magic_identifier,
    references::util::{request_to_string, throw_module_not_found_expr},
    resolve::esm_resolve,
};

#[turbo_tasks::value]
pub enum ReferencedAsset {
    Some(EcmascriptChunkPlaceableVc),
    OriginalReferenceTypeExternal(String),
    None,
}

impl ReferencedAsset {
    pub async fn get_ident(&self) -> Result<Option<String>> {
        Ok(match self {
            ReferencedAsset::Some(asset) => {
                let path = asset.path().to_string().await?;
                Some(magic_identifier::encode(&format!(
                    "imported module {}",
                    path
                )))
            }
            ReferencedAsset::OriginalReferenceTypeExternal(request) => {
                Some(magic_identifier::encode(&format!("external {}", request)))
            }
            ReferencedAsset::None => None,
        })
    }
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct EsmAssetReference {
    pub origin: ResolveOriginVc,
    pub request: RequestVc,
    pub annotations: ImportAnnotations,
}

impl EsmAssetReference {
    fn get_origin(&self) -> ResolveOriginVc {
        let mut origin = self.origin;
        if let Some(transition) = self.annotations.transition() {
            origin = origin.with_transition(transition);
        }
        origin
    }
}

#[turbo_tasks::value_impl]
impl EsmAssetReferenceVc {
    #[turbo_tasks::function]
    pub(super) async fn get_referenced_asset(self) -> Result<ReferencedAssetVc> {
        let this = self.await?;
        let resolve_result = esm_resolve(this.get_origin(), this.request);
        match &*resolve_result.await? {
            ResolveResult::Special(SpecialType::OriginalReferenceExternal, _) => {
                if let Some(request) = this.request.await?.request() {
                    return Ok(ReferencedAsset::OriginalReferenceTypeExternal(request).cell());
                } else {
                    return Ok(ReferencedAssetVc::cell(ReferencedAsset::None));
                }
            }
            ResolveResult::Special(SpecialType::OriginalReferenceTypeExternal(request), _) => {
                return Ok(ReferencedAsset::OriginalReferenceTypeExternal(request.clone()).cell());
            }
            _ => {}
        }
        let assets = resolve_result.primary_assets();
        for asset in assets.await?.iter() {
            if let Some(placeable) = EcmascriptChunkPlaceableVc::resolve_from(asset).await? {
                return Ok(ReferencedAssetVc::cell(ReferencedAsset::Some(placeable)));
            }
        }
        Ok(ReferencedAssetVc::cell(ReferencedAsset::None))
    }

    #[turbo_tasks::function]
    pub fn new(
        origin: ResolveOriginVc,
        request: RequestVc,
        annotations: Value<ImportAnnotations>,
    ) -> Self {
        Self::cell(EsmAssetReference {
            origin,
            request,
            annotations: annotations.into_value(),
        })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for EsmAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        esm_resolve(self.get_origin(), self.request)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EsmAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "import {} {}",
            self.request.to_string().await?,
            self.annotations
        )))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAssetReference for EsmAssetReference {
    #[turbo_tasks::function]
    fn chunking_type(&self, _context: ChunkingContextVc) -> Result<ChunkingTypeOptionVc> {
        Ok(
            if let Some(chunking_type) = self.annotations.chunking_type() {
                match chunking_type {
                    "separate" => ChunkingTypeOptionVc::cell(Some(ChunkingType::Separate)),
                    "parallel" => ChunkingTypeOptionVc::cell(Some(ChunkingType::Parallel)),
                    _ => return Err(anyhow!("unknown chunking_type: {}", chunking_type)),
                }
            } else {
                ChunkingTypeOptionVc::cell(Some(ChunkingType::default()))
            },
        )
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for EsmAssetReference {
    #[turbo_tasks::function]
    async fn code_generation(
        self_vc: EsmAssetReferenceVc,
        context: ChunkingContextVc,
    ) -> Result<CodeGenerationVc> {
        let mut visitors = Vec::new();

        let chunking_type = self_vc.chunking_type(context).await?;
        let resolved = self_vc.resolve_reference().await?;

        // Insert code that throws immediately at time of import if a request is
        // unresolvable
        if resolved.is_unresolveable() {
            let this = &*self_vc.await?;
            let request = request_to_string(this.request).await?.to_string();
            visitors.push(create_visitor!(visit_mut_program(program: &mut Program) {
                insert_hoisted_stmt(program, Stmt::Expr(ExprStmt {
                        expr: Box::new(throw_module_not_found_expr(
                          &request
                        )),
                        span: DUMMY_SP,
                    }));
            }));

            return Ok(CodeGeneration { visitors }.into());
        }

        // separate chunks can't be imported as the modules are not available
        if !matches!(*chunking_type, None | Some(ChunkingType::Separate)) {
            let referenced_asset = self_vc.get_referenced_asset().await?;
            if let Some(ident) = referenced_asset.get_ident().await? {
                match &*referenced_asset {
                    ReferencedAsset::Some(asset) => {
                        let id = asset.as_chunk_item(context).id().await?;
                        visitors.push(create_visitor!(visit_mut_program(program: &mut Program) {
                            let stmt = quote!(
                                "var $name = __turbopack_import__($id);" as Stmt,
                                name = Ident::new(ident.clone().into(), DUMMY_SP),
                                id: Expr = Expr::Lit(match &*id {
                                    ModuleId::String(s) => s.clone().into(),
                                    ModuleId::Number(n) => (*n as f64).into(),
                                })
                            );
                            insert_hoisted_stmt(program, stmt);
                        }));
                    }
                    ReferencedAsset::OriginalReferenceTypeExternal(request) => {
                        let request = request.clone();
                        visitors.push(create_visitor!(visit_mut_program(program: &mut Program) {
                            // TODO Technically this should insert a ESM external, but we don't support that yet
                            let stmt = quote!(
                                "var $name = __turbopack_external_require__($id);" as Stmt,
                                name = Ident::new(ident.clone().into(), DUMMY_SP),
                                id: Expr = Expr::Lit(request.clone().into())
                            );
                            insert_hoisted_stmt(program, stmt);
                        }));
                    }
                    ReferencedAsset::None => {}
                }
            }
        }

        Ok(CodeGeneration { visitors }.into())
    }
}

lazy_static! {
    static ref ESM_HOISTING_LOCATION: &'static str = Box::leak(Box::new(magic_identifier::encode(
        "ecmascript hoisting location"
    )));
}

pub(crate) fn insert_hoisted_stmt(program: &mut Program, stmt: Stmt) {
    match program {
        Program::Module(Module { body, .. }) => {
            let pos = body.iter().position(|item| {
                if let ModuleItem::Stmt(Stmt::Expr(ExprStmt {
                    expr: box Expr::Lit(Lit::Str(s)),
                    ..
                })) = item
                {
                    &*s.value == *ESM_HOISTING_LOCATION
                } else {
                    false
                }
            });
            if let Some(pos) = pos {
                body.insert(pos, ModuleItem::Stmt(stmt));
            } else {
                body.insert(
                    0,
                    ModuleItem::Stmt(Stmt::Expr(ExprStmt {
                        expr: box Expr::Lit(Lit::Str((*ESM_HOISTING_LOCATION).into())),
                        span: DUMMY_SP,
                    })),
                );
                body.insert(0, ModuleItem::Stmt(stmt));
            }
        }
        Program::Script(Script { body, .. }) => {
            let pos = body.iter().position(|item| {
                if let Stmt::Expr(ExprStmt {
                    expr: box Expr::Lit(Lit::Str(s)),
                    ..
                }) = item
                {
                    &*s.value == *ESM_HOISTING_LOCATION
                } else {
                    false
                }
            });
            if let Some(pos) = pos {
                body.insert(pos, stmt);
            } else {
                body.insert(
                    0,
                    Stmt::Expr(ExprStmt {
                        expr: box Expr::Lit(Lit::Str((*ESM_HOISTING_LOCATION).into())),
                        span: DUMMY_SP,
                    }),
                );
                body.insert(0, stmt);
            }
        }
    }
}
