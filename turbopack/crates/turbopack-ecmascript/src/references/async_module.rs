use anyhow::Result;
use serde::{Deserialize, Serialize};
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{ArrayLit, ArrayPat, Expr, Ident},
    quote,
};
use turbo_tasks::{
    trace::TraceRawVcs, FxIndexSet, ReadRef, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc,
};
use turbopack_core::{
    chunk::{
        AsyncModuleInfo, ChunkableModule, ChunkableModuleReference, ChunkingContext, ChunkingType,
    },
    reference::{ModuleReference, ModuleReferences},
    resolve::ExternalType,
};

use super::esm::base::ReferencedAsset;
use crate::code_gen::{CodeGeneration, CodeGenerationHoistedStmt};

/// Information needed for generating the async module wrapper for
/// [EcmascriptChunkItem](crate::chunk::EcmascriptChunkItem)s.
#[derive(PartialEq, Eq, Default, Debug, Clone, Serialize, Deserialize, TraceRawVcs)]
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

#[turbo_tasks::value(transparent)]
struct AsyncModuleIdents(FxIndexSet<String>);

async fn get_inherit_async_referenced_asset(
    r: Vc<Box<dyn ModuleReference>>,
) -> Result<Option<ReadRef<ReferencedAsset>>> {
    let Some(r) = Vc::try_resolve_downcast::<Box<dyn ChunkableModuleReference>>(r).await? else {
        return Ok(None);
    };
    let Some(ty) = *r.chunking_type().await? else {
        return Ok(None);
    };
    if !matches!(ty, ChunkingType::ParallelInheritAsync) {
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
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        async_module_info: Vc<AsyncModuleInfo>,
        references: Vc<ModuleReferences>,
    ) -> Result<Vc<AsyncModuleIdents>> {
        let async_module_info = async_module_info.await?;

        let reference_idents = references
            .await?
            .iter()
            .map(|r| async {
                let Some(referenced_asset) = get_inherit_async_referenced_asset(**r).await? else {
                    return Ok(None);
                };
                Ok(match &*referenced_asset {
                    ReferencedAsset::External(_, ExternalType::EcmaScriptModule) => {
                        if self.import_externals {
                            referenced_asset.get_ident().await?
                        } else {
                            None
                        }
                    }
                    ReferencedAsset::Some(placeable) => {
                        let chunk_item = placeable
                            .as_chunk_item(Vc::upcast(chunking_context))
                            .to_resolved()
                            .await?;
                        if async_module_info
                            .referenced_async_modules
                            .contains(&chunk_item)
                        {
                            referenced_asset.get_ident().await?
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
                        let Some(referenced_asset) =
                            get_inherit_async_referenced_asset(**r).await?
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

    #[turbo_tasks::function]
    pub async fn code_generation(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
        references: Vc<ModuleReferences>,
    ) -> Result<Vc<CodeGeneration>> {
        if let Some(async_module_info) = async_module_info {
            let async_idents = self
                .get_async_idents(chunking_context, async_module_info, references)
                .await?;

            if !async_idents.is_empty() {
                let idents = async_idents
                    .iter()
                    .map(|ident: &String| {
                        Ident::new(ident.clone().into(), DUMMY_SP, Default::default())
                    })
                    .collect::<Vec<_>>();

                return Ok(CodeGeneration::hoisted_stmts([
                    CodeGenerationHoistedStmt::new("__turbopack_async_dependencies__".into(),
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
                    CodeGenerationHoistedStmt::new("__turbopack_async_dependencies__ await".into(),
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
