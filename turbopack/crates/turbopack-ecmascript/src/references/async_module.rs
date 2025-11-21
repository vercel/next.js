use anyhow::Result;
use serde::{Deserialize, Serialize};
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{ArrayLit, ArrayPat, Expr, Ident},
    quote,
};
use turbo_rcstr::rcstr;
use turbo_tasks::{
    FxIndexSet, NonLocalValue, ReadRef, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc,
    trace::TraceRawVcs,
};
use turbopack_core::{
    chunk::{AsyncModuleInfo, ChunkableModuleReference, ChunkingContext, ChunkingType},
    reference::{ModuleReference, ModuleReferences},
    resolve::ExternalType,
};

use super::esm::base::ReferencedAsset;
use crate::{
    ScopeHoistingContext,
    code_gen::{CodeGeneration, CodeGenerationHoistedStmt},
    utils::AstSyntaxContext,
};

/// Information needed for generating the async module wrapper for
/// [EcmascriptChunkItem](crate::chunk::EcmascriptChunkItem)s.
#[derive(
    PartialEq, Eq, Default, Debug, Clone, Serialize, Deserialize, TraceRawVcs, NonLocalValue,
)]
pub struct AsyncModuleOptions {
    pub has_top_level_await: bool,
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
    pub async fn module_options(
        self: Vc<Self>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<OptionAsyncModuleOptions>> {
        if let Some(async_module) = &*self.await? {
            return Ok(async_module.module_options(async_module_info));
        }

        Ok(OptionAsyncModuleOptions::none())
    }
}

/// The identifiers (and their corresponding syntax context) of all async modules referenced by the
/// current module.
#[turbo_tasks::value(transparent)]
struct AsyncModuleIdents(FxIndexSet<(String, AstSyntaxContext)>);

async fn get_inherit_async_referenced_asset(
    r: ResolvedVc<Box<dyn ModuleReference>>,
) -> Result<Option<ReadRef<ReferencedAsset>>> {
    let Some(r) = ResolvedVc::try_downcast::<Box<dyn ChunkableModuleReference>>(r) else {
        return Ok(None);
    };
    let Some(ty) = &*r.chunking_type().await? else {
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
    let referenced_asset: turbo_tasks::ReadRef<ReferencedAsset> =
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
            .map(|r| async {
                let Some(referenced_asset) = get_inherit_async_referenced_asset(*r).await? else {
                    return Ok(None);
                };
                Ok(match &*referenced_asset {
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
                    ReferencedAsset::None | ReferencedAsset::Unresolvable => None,
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
                    .map(|r| async {
                        let Some(referenced_asset) = get_inherit_async_referenced_asset(*r).await?
                        else {
                            return Ok(false);
                        };
                        Ok(matches!(
                            &*referenced_asset,
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
        if let Some(async_module_info) = async_module_info {
            let async_idents = self
                .get_async_idents(async_module_info, references, chunking_context)
                .await?;

            if !async_idents.is_empty() {
                let idents = async_idents
                    .iter()
                    .map(|(ident, ctxt)| Ident::new(ident.clone().into(), DUMMY_SP, **ctxt))
                    .collect::<Vec<_>>();

                return Ok(CodeGeneration::hoisted_stmts([
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
                ].to_vec()));
            }
        }

        Ok(CodeGeneration::empty())
    }
}
