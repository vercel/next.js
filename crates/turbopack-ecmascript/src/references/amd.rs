use std::mem::take;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use swc_core::{
    common::DUMMY_SP,
    ecma::{
        ast::{CallExpr, Callee, Expr, ExprOrSpread, Ident},
        utils::private_ident,
    },
    quote,
};
use turbo_tasks::{
    debug::ValueDebugFormat, primitives::StringVc, trace::TraceRawVcs, TryJoinIterExt, Value,
    ValueToString, ValueToStringVc,
};
use turbopack_core::{
    chunk::{ChunkableAssetReference, ChunkableAssetReferenceVc, ChunkingContextVc},
    reference::{AssetReference, AssetReferenceVc},
    resolve::{origin::ResolveOriginVc, parse::RequestVc, ResolveResultVc},
};

use super::pattern_mapping::{PatternMappingVc, ResolveType::Cjs};
use crate::{
    code_gen::{CodeGenerateable, CodeGenerateableVc, CodeGeneration, CodeGenerationVc},
    create_visitor,
    references::{
        pattern_mapping::{PatternMapping, PatternMappingReadRef},
        AstPathVc,
    },
    resolve::cjs_resolve,
};

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct AmdDefineAssetReference {
    origin: ResolveOriginVc,
    request: RequestVc,
}

#[turbo_tasks::value_impl]
impl AmdDefineAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(origin: ResolveOriginVc, request: RequestVc) -> Self {
        Self::cell(AmdDefineAssetReference { origin, request })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for AmdDefineAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        cjs_resolve(self.origin, self.request)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for AmdDefineAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "AMD define dependency {}",
            self.request.to_string().await?,
        )))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAssetReference for AmdDefineAssetReference {}

#[derive(
    ValueDebugFormat, Debug, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, Copy, Clone,
)]
pub enum AmdDefineDependencyElement {
    Request(RequestVc),
    Exports,
    Module,
    Require,
}

#[derive(
    ValueDebugFormat, Debug, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, Copy, Clone,
)]
pub enum AmdDefineFactoryType {
    Unknown,
    Function,
    Value,
}

#[turbo_tasks::value(shared)]
#[derive(Debug)]
pub struct AmdDefineWithDependenciesCodeGen {
    dependencies_requests: Vec<AmdDefineDependencyElement>,
    origin: ResolveOriginVc,
    path: AstPathVc,
    factory_type: AmdDefineFactoryType,
}

impl AmdDefineWithDependenciesCodeGenVc {
    pub fn new(
        dependencies_requests: Vec<AmdDefineDependencyElement>,
        origin: ResolveOriginVc,
        path: AstPathVc,
        factory_type: AmdDefineFactoryType,
    ) -> Self {
        Self::cell(AmdDefineWithDependenciesCodeGen {
            dependencies_requests,
            origin,
            path,
            factory_type,
        })
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for AmdDefineWithDependenciesCodeGen {
    #[turbo_tasks::function]
    async fn code_generation(&self, context: ChunkingContextVc) -> Result<CodeGenerationVc> {
        let mut visitors = Vec::new();

        enum ResolvedElement {
            PatternMapping(PatternMappingReadRef),
            Expr(Expr),
        }

        let resolved_elements = self
            .dependencies_requests
            .iter()
            .map(|element| async move {
                Ok(match element {
                    AmdDefineDependencyElement::Request(request) => {
                        ResolvedElement::PatternMapping(
                            PatternMappingVc::resolve_request(
                                *request,
                                self.origin,
                                context,
                                cjs_resolve(self.origin, *request),
                                Value::new(Cjs),
                            )
                            .await?,
                        )
                    }
                    AmdDefineDependencyElement::Exports => {
                        ResolvedElement::Expr(quote!("exports" as Expr))
                    }
                    AmdDefineDependencyElement::Module => {
                        ResolvedElement::Expr(quote!("module" as Expr))
                    }
                    AmdDefineDependencyElement::Require => {
                        ResolvedElement::Expr(quote!("__turbopack_require__" as Expr))
                    }
                })
            })
            .try_join()
            .await?;

        let factory_type = self.factory_type;

        let path = self.path.await?;
        visitors.push(
            // Transforms `define([dep1, dep2], factory)` into:
            // ```js
            // __turbopack_export_value__(
            //   factory(
            //     __turbopack_require__(dep1),
            //     __turbopack_require__(dep2),
            //   ),
            // );
            // ```
            create_visitor!(exact path, visit_mut_call_expr(call_expr: &mut CallExpr) {
                let CallExpr { args, callee, .. } = call_expr;
                if let Some(factory) = take(args).pop().map(|e| e.expr) {
                    let deps = resolved_elements.iter().map(|element| {
                        match element {
                            ResolvedElement::PatternMapping(pm) => {
                                match &**pm {
                                    PatternMapping::Invalid => Expr::Ident(Ident::new("undefined".into(), DUMMY_SP)),
                                    pm => Expr::Call(CallExpr {
                                        span: DUMMY_SP,
                                        callee: Callee::Expr(
                                            box Expr::Ident(Ident::new(
                                                if pm.is_internal_import() {
                                                    "__turbopack_require__"
                                                } else {
                                                    "__turbopack_external_require__"
                                                }.into(), DUMMY_SP
                                            ))
                                        ),
                                        args: vec![
                                            pm.create().into(),
                                        ],
                                        type_args: None
                                    }),
                                }
                            }
                            ResolvedElement::Expr(expr) => {
                                expr.clone()
                            }
                        }
                    }).map(|expr| ExprOrSpread {
                        expr: box expr,
                        spread: None,
                    }).collect();
                    match factory_type {
                        AmdDefineFactoryType::Unknown => {
                            // ((f, r = typeof f !== "function" ? f : f([...])) => r !== undefined && __turbopack_export_value__(r))(...)
                            let f = private_ident!("f");
                            let call_f = Expr::Call(CallExpr {
                                args: deps,
                                callee: Callee::Expr(box Expr::Ident(f.clone())),
                                span: DUMMY_SP,
                                type_args: None
                            });
                            *callee = Callee::Expr(box quote!("($f1, r = typeof $f2 !== \"function\" ? $f3 : $call_f) => r !== undefined && __turbopack_export_value(r)" as Expr,
                                f1 = f.clone(),
                                f2 = f.clone(),
                                f3 = f,
                                call_f: Expr = call_f
                            ));
                            args.push(ExprOrSpread {
                                expr: factory,
                                spread: None
                            });
                        },
                        AmdDefineFactoryType::Function => {
                            // (r => r !== undefined && __turbopack_export_value__(r))(...([...]))
                            *callee = Callee::Expr(box quote!("r => r !== undefined && __turbopack_export_value__(r)" as Expr));
                            args.push(ExprOrSpread {
                                expr: box Expr::Call(CallExpr {
                                    args: deps,
                                    callee: Callee::Expr(factory),
                                    span: DUMMY_SP,
                                    type_args: None
                                }),
                                spread: None
                            });
                        },
                        AmdDefineFactoryType::Value => {
                            // __turbopack_export_value__(...)
                            *callee = Callee::Expr(box quote!("__turbopack_export_value__" as Expr));
                            args.push(ExprOrSpread {
                                expr: factory,
                                spread: None
                            });
                        },
                    }
                }
            }),
        );

        Ok(CodeGeneration { visitors }.into())
    }
}
