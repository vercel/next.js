use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{ArrayLit, ArrayPat, Expr, Ident},
    quote,
};
use turbo_rcstr::rcstr;
use turbo_tasks::{FxIndexSet, NonLocalValue, ResolvedVc, Vc, trace::TraceRawVcs};
#[cfg(not(feature = "sync"))]
use turbo_tasks::{TryFlatJoinIterExt, TryJoinIterExt};
use turbopack_core::{
    chunk::{AsyncModuleInfo, ChunkingContext, ChunkingType},
    reference::{ModuleReference, ModuleReferences},
    resolve::ExternalType,
};

use crate::{
    ScopeHoistingContext,
    code_gen::{CodeGeneration, CodeGenerationHoistedStmt},
    references::esm::base::ReferencedAsset,
    utils::AstSyntaxContext,
};

/// Information needed for generating the async module wrapper for
/// [EcmascriptChunkItem](crate::chunk::EcmascriptChunkItem)s.
#[derive(PartialEq, Eq, Default, Debug, Clone, TraceRawVcs, NonLocalValue, Encode, Decode)]
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

turbo_tasks::dual_fn! {
    fn get_inherit_async_referenced_asset(
        r: ResolvedVc<Box<dyn ModuleReference>>,
    ) -> Result<Option<ReferencedAsset>> {
        let trait_ref = turbo_tasks::read!(r.into_trait_ref())?;
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
            turbo_tasks::read!(ReferencedAsset::from_resolve_result(r.resolve_reference()))?;
        Ok(Some(referenced_asset))
    }
}

turbo_tasks::dual_fn! {
    /// Computes the async-dependency ident for one module reference (the per-item body of
    /// [`AsyncModule::get_async_idents`]'s fan-out).
    fn async_ident_for_reference(
        r: ResolvedVc<Box<dyn ModuleReference>>,
        import_externals: bool,
        async_module_info: &AsyncModuleInfo,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Option<(String, AstSyntaxContext)>> {
        let Some(referenced_asset) =
            turbo_tasks::read!(get_inherit_async_referenced_asset(r))?
        else {
            return Ok(None);
        };
        Ok(match &referenced_asset {
            ReferencedAsset::External(_, ExternalType::EcmaScriptModule) => {
                if import_externals {
                    turbo_tasks::read!(referenced_asset.get_ident(
                        chunking_context,
                        None,
                        ScopeHoistingContext::None
                    ))?
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
                    turbo_tasks::read!(referenced_asset.get_ident(
                        chunking_context,
                        None,
                        ScopeHoistingContext::None
                    ))?
                    .map(|i| i.into_module_namespace_ident().unwrap())
                    .map(|(i, ctx)| (i, ctx.unwrap_or_default().into()))
                } else {
                    None
                }
            }
            ReferencedAsset::External(..) => None,
            ReferencedAsset::None | ReferencedAsset::Unresolvable => None,
        })
    }
}

turbo_tasks::dual_fn! {
    /// Whether the reference (with inherit-async chunking) points at an external ESM module
    /// (the per-item body of [`AsyncModule::is_self_async`]'s fan-out).
    fn is_reference_external_esm(r: ResolvedVc<Box<dyn ModuleReference>>) -> Result<bool> {
        let Some(referenced_asset) =
            turbo_tasks::read!(get_inherit_async_referenced_asset(r))?
        else {
            return Ok(false);
        };
        Ok(matches!(
            &referenced_asset,
            ReferencedAsset::External(_, ExternalType::EcmaScriptModule)
        ))
    }
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
        let async_module_info = turbo_tasks::read!(async_module_info)?;
        let references = turbo_tasks::read!(references)?;

        #[cfg(not(feature = "sync"))]
        let reference_idents = references
            .iter()
            .map(|r| {
                async_ident_for_reference(
                    *r,
                    self.import_externals,
                    &async_module_info,
                    chunking_context,
                )
            })
            .try_flat_join()
            .await?;
        #[cfg(feature = "sync")]
        let reference_idents = {
            let mut reference_idents = Vec::new();
            for r in references.iter() {
                if let Some(ident) = async_ident_for_reference(
                    *r,
                    self.import_externals,
                    &async_module_info,
                    chunking_context,
                )? {
                    reference_idents.push(ident);
                }
            }
            reference_idents
        };

        Ok(Vc::cell(FxIndexSet::from_iter(reference_idents)))
    }

    #[turbo_tasks::function]
    pub(crate) async fn is_self_async(&self, references: Vc<ModuleReferences>) -> Result<Vc<bool>> {
        if self.has_top_level_await {
            return Ok(Vc::cell(true));
        }

        if !self.import_externals {
            return Ok(Vc::cell(false));
        }

        let references = turbo_tasks::read!(references)?;

        #[cfg(not(feature = "sync"))]
        let any_external_esm = references
            .iter()
            .map(|r| is_reference_external_esm(*r))
            .try_join()
            .await?
            .iter()
            .any(|&b| b);
        #[cfg(feature = "sync")]
        let any_external_esm = {
            // Evaluate every item (no short-circuit) to keep the same error surface as the
            // async build's `try_join`.
            let mut any_external_esm = false;
            for r in references.iter() {
                if is_reference_external_esm(*r)? {
                    any_external_esm = true;
                }
            }
            any_external_esm
        };

        Ok(Vc::cell(any_external_esm))
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
    turbo_tasks::dual_fn! {
    pub fn code_generation(
        self: Vc<Self>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
        references: Vc<ModuleReferences>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        if let Some(async_module_info) = async_module_info {
            let async_idents = turbo_tasks::read!(self
                .get_async_idents(async_module_info, references, chunking_context))
                ?;

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
}
