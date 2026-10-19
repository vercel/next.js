use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{
    common::DUMMY_SP,
    ecma::{
        ast::{ArrayLit, ArrayPat, ArrowExpr, Expr, Function, Ident, Program, YieldExpr},
        visit::{VisitMut, VisitMutWith},
    },
    quote,
};
use turbo_rcstr::rcstr;
use turbo_tasks::{FxIndexSet, NonLocalValue, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc};
use turbopack_core::{
    chunk::{AsyncModuleInfo, ChunkingContext, ChunkingType},
    reference::{ModuleReference, ModuleReferences},
    resolve::ExternalType,
};

use crate::{
    ScopeHoistingContext,
    ast_path_trie::AstPathId,
    code_gen::{AstModifier, CodeGeneration, CodeGenerationHoistedStmt},
    references::esm::base::ReferencedAsset,
    utils::AstSyntaxContext,
};

/// Information needed for generating the async module wrapper for
/// [EcmascriptChunkItem](crate::chunk::EcmascriptChunkItem)s.
#[derive(PartialEq, Eq, Default, Debug, Clone, NonLocalValue, Encode, Decode)]
pub struct AsyncModuleOptions {
    pub has_top_level_await: bool,
    pub lower_async_to_generator: bool,
}

/// Option<[AsyncModuleOptions]>.
#[turbo_tasks::value(transparent)]
pub struct OptionAsyncModuleOptions(Option<AsyncModuleOptions>);

#[turbo_tasks::value_impl]
impl OptionAsyncModuleOptions {
    #[turbo_tasks::function]
    pub(crate) fn none() -> Vc<Self> {
        Vc::cell(None)
    }
}

/// Contains the information necessary to decide if an ecmascript module is
/// async.
///
/// It will check if the current module or any of it's children contain a top
/// level await statement or is referencing an external ESM module.
#[turbo_tasks::value(shared)]
pub struct AsyncModule {
    pub has_top_level_await: bool,
    pub lower_async_to_generator: bool,
    pub import_externals: bool,
}

/// Option<[AsyncModule]>.
#[turbo_tasks::value(transparent)]
pub struct OptionAsyncModule(Option<ResolvedVc<AsyncModule>>);

#[turbo_tasks::value_impl]
impl OptionAsyncModule {
    /// Create an empty [OptionAsyncModule].
    #[turbo_tasks::function]
    pub fn none() -> Vc<Self> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    pub fn module_options(
        &self,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Vc<OptionAsyncModuleOptions> {
        if let Some(async_module) = &self.0 {
            return async_module.module_options(async_module_info);
        }

        OptionAsyncModuleOptions::none()
    }
}

/// The identifiers (and their corresponding syntax context) of all async modules referenced by the
/// current module.
#[turbo_tasks::value(transparent)]
struct AsyncModuleIdents(
    #[bincode(with = "turbo_bincode::indexset")] FxIndexSet<(String, AstSyntaxContext)>,
);

async fn get_inherit_async_referenced_asset(
    r: ResolvedVc<Box<dyn ModuleReference>>,
) -> Result<Option<ReferencedAsset>> {
    let trait_ref = r.into_trait_ref().await?;
    let Some(ty) = &trait_ref.chunking_type() else {
        return Ok(None);
    };
    if !matches!(
        ty,
        ChunkingType::Parallel {
            inherit_async: true,
            ..
        }
    ) {
        return Ok(None);
    };
    let referenced_asset: ReferencedAsset =
        ReferencedAsset::from_resolve_result(r.resolve_reference()).await?;
    Ok(Some(referenced_asset))
}

#[turbo_tasks::value_impl]
impl AsyncModule {
    #[turbo_tasks::function]
    async fn get_async_idents(
        &self,
        async_module_info: Vc<AsyncModuleInfo>,
        references: Vc<ModuleReferences>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<AsyncModuleIdents>> {
        let async_module_info = async_module_info.await?;

        let reference_idents = references
            .await?
            .iter()
            .map(async |r| {
                let Some(referenced_asset) = get_inherit_async_referenced_asset(*r).await? else {
                    return Ok(None);
                };
                Ok(match &referenced_asset {
                    ReferencedAsset::External(_, ExternalType::EcmaScriptModule) => {
                        if self.import_externals {
                            referenced_asset
                                .get_ident(chunking_context, None, ScopeHoistingContext::None)
                                .await?
                                .map(|i| i.into_module_namespace_ident().unwrap())
                                .map(|(i, ctx)| (i, ctx.unwrap_or_default().into()))
                        } else {
                            None
                        }
                    }
                    ReferencedAsset::Some(placeable) => {
                        if async_module_info
                            .referenced_async_modules
                            .contains(&ResolvedVc::upcast(*placeable))
                        {
                            referenced_asset
                                .get_ident(chunking_context, None, ScopeHoistingContext::None)
                                .await?
                                .map(|i| i.into_module_namespace_ident().unwrap())
                                .map(|(i, ctx)| (i, ctx.unwrap_or_default().into()))
                        } else {
                            None
                        }
                    }
                    ReferencedAsset::External(..) => None,
                    ReferencedAsset::NonPlaceable(_)
                    | ReferencedAsset::None
                    | ReferencedAsset::Empty
                    | ReferencedAsset::Unresolvable => None,
                })
            })
            .try_flat_join()
            .await?;

        Ok(Vc::cell(FxIndexSet::from_iter(reference_idents)))
    }

    #[turbo_tasks::function]
    pub(crate) async fn is_self_async(&self, references: Vc<ModuleReferences>) -> Result<Vc<bool>> {
        if self.has_top_level_await {
            return Ok(Vc::cell(true));
        }

        Ok(Vc::cell(
            self.import_externals
                && references
                    .await?
                    .iter()
                    .map(async |r| {
                        let Some(referenced_asset) = get_inherit_async_referenced_asset(*r).await?
                        else {
                            return Ok(false);
                        };
                        Ok(matches!(
                            &referenced_asset,
                            ReferencedAsset::External(_, ExternalType::EcmaScriptModule)
                        ))
                    })
                    .try_join()
                    .await?
                    .iter()
                    .any(|&b| b),
        ))
    }

    /// Returns
    #[turbo_tasks::function]
    pub fn module_options(
        &self,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Vc<OptionAsyncModuleOptions> {
        if async_module_info.is_none() {
            return Vc::cell(None);
        }

        Vc::cell(Some(AsyncModuleOptions {
            has_top_level_await: self.has_top_level_await,
            lower_async_to_generator: self.lower_async_to_generator,
        }))
    }
}

impl AsyncModule {
    pub async fn code_generation(
        self: Vc<Self>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
        references: Vc<ModuleReferences>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let mut generated = CodeGeneration::empty();
        if self.await?.lower_async_to_generator {
            generated
                .visitors
                .push((AstPathId::ROOT, Box::new(LowerModuleAwait)));
        }
        if let Some(async_module_info) = async_module_info {
            let async_idents = self
                .get_async_idents(async_module_info, references, chunking_context)
                .await?;

            if !async_idents.is_empty() {
                let idents = async_idents
                    .iter()
                    .map(|(ident, ctxt)| Ident::new(ident.clone().into(), DUMMY_SP, **ctxt))
                    .collect::<Vec<_>>();

                generated.hoisted_stmts.extend([
                    CodeGenerationHoistedStmt::new(rcstr!("__turbopack_async_dependencies__"),
                        quote!(
                            "var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__($deps);"
                                as Stmt,
                            deps: Expr = Expr::Array(ArrayLit {
                                span: DUMMY_SP,
                                elems: idents
                                    .iter()
                                    .map(|ident| { Some(Expr::Ident(ident.clone()).into()) })
                                    .collect(),
                            })
                        )
                    ),
                    CodeGenerationHoistedStmt::new(rcstr!("__turbopack_async_dependencies__ await"),
                        quote!(
                            "($deps = __turbopack_async_dependencies__.then ? (await \
                            __turbopack_async_dependencies__)() : __turbopack_async_dependencies__);" as Stmt,
                            deps: AssignTarget = ArrayPat {
                                span: DUMMY_SP,
                                elems: idents
                                    .into_iter()
                                    .map(|ident| { Some(ident.into()) })
                                    .collect(),
                                optional: false,
                                type_ann: None,
                            }.into(),
                        )),
                ]);
                if self.await?.lower_async_to_generator {
                    for statement in &mut generated.hoisted_stmts {
                        statement.stmt.visit_mut_with(&mut LowerModuleAwait);
                    }
                }
                return Ok(generated);
            }
        }

        Ok(generated)
    }
}

/// This runs after source analysis and preserves the original AST spans for maps.
struct LowerModuleAwait;
impl AstModifier for LowerModuleAwait {
    fn visit_mut_program(&self, program: &mut Program) {
        program.visit_mut_with(&mut LowerModuleAwait);
    }
}
impl VisitMut for LowerModuleAwait {
    fn visit_mut_function(&mut self, _: &mut Function) {}
    fn visit_mut_arrow_expr(&mut self, _: &mut ArrowExpr) {}
    fn visit_mut_expr(&mut self, expression: &mut Expr) {
        expression.visit_mut_children_with(self);
        if let Expr::Await(awaited) = expression {
            *expression = Expr::Yield(YieldExpr {
                span: awaited.span,
                arg: Some(awaited.arg.clone()),
                delegate: false,
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use swc_core::{
        ecma::{
            ast::{Decl, Expr, Stmt},
            visit::VisitMutWith,
        },
        quote,
    };

    use crate::references::async_module::LowerModuleAwait;

    #[test]
    fn lowers_only_module_await_and_preserves_original_spans() {
        let mut statement = quote!("await source;" as Stmt);
        let Stmt::Expr(before) = &statement else {
            panic!("expected expression")
        };
        let Expr::Await(before) = &*before.expr else {
            panic!("expected await")
        };
        let span = before.span;
        statement.visit_mut_with(&mut LowerModuleAwait);
        let Stmt::Expr(after) = statement else {
            panic!("expected expression")
        };
        let Expr::Yield(after) = *after.expr else {
            panic!("expected yield")
        };
        assert_eq!(after.span, span);
        let mut nested = quote!("async function nested() { await source; }" as Stmt);
        nested.visit_mut_with(&mut LowerModuleAwait);
        let Stmt::Decl(Decl::Fn(function)) = nested else {
            panic!("expected function")
        };
        assert!(function.function.is_async);
    }
}

pub(crate) fn unlowered_top_level_for_await(program: &Program) -> Option<swc_core::common::Span> {
    struct Find(Option<swc_core::common::Span>);
    impl swc_core::ecma::visit::Visit for Find {
        fn visit_function(&mut self, _: &Function) {}
        fn visit_arrow_expr(&mut self, _: &ArrowExpr) {}
        fn visit_for_of_stmt(&mut self, statement: &swc_core::ecma::ast::ForOfStmt) {
            if statement.is_await {
                self.0 = Some(statement.span);
            } else {
                swc_core::ecma::visit::VisitWith::visit_children_with(statement, self);
            }
        }
    }
    let mut finder = Find(None);
    swc_core::ecma::visit::VisitWith::visit_with(program, &mut finder);
    finder.0
}
