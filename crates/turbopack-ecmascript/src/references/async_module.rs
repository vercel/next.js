use anyhow::Result;
use indexmap::IndexSet;
use serde::{Deserialize, Serialize};
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{ArrayLit, ArrayPat, Expr, Ident, Pat, Program},
    quote,
};
use turbo_tasks::{trace::TraceRawVcs, TryFlatJoinIterExt, Value, Vc};
use turbopack_core::{
    chunk::availability_info::{AvailabilityInfo, AvailabilityInfoNeeds},
    module::Module,
};

use super::esm::base::ReferencedAsset;
use crate::{
    chunk::{
        esm_scope::{EsmScope, EsmScopeScc},
        EcmascriptChunkPlaceable, EcmascriptChunkingContext,
    },
    code_gen::{CodeGenerateableWithAvailabilityInfo, CodeGeneration},
    create_visitor,
    references::esm::{base::insert_hoisted_stmt, EsmAssetReference},
};

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
    pub placeable: Vc<Box<dyn EcmascriptChunkPlaceable>>,
    pub references: IndexSet<Vc<EsmAssetReference>>,
    pub has_top_level_await: bool,
}

/// Option<[AsyncModule]>.
#[turbo_tasks::value(transparent)]
pub struct OptionAsyncModule(Option<Vc<AsyncModule>>);

#[turbo_tasks::value_impl]
impl OptionAsyncModule {
    /// Create an empty [OptionAsyncModule].
    #[turbo_tasks::function]
    pub fn none() -> Vc<Self> {
        Vc::cell(None)
    }

    /// See [AsyncModule::is_async].
    #[turbo_tasks::function]
    pub async fn is_async(
        self: Vc<Self>,
        availability_root: Option<Vc<Box<dyn Module>>>,
    ) -> Result<Vc<bool>> {
        Ok(Vc::cell(
            self.module_options(availability_root).await?.is_some(),
        ))
    }

    #[turbo_tasks::function]
    pub async fn module_options(
        self: Vc<Self>,
        availability_root: Option<Vc<Box<dyn Module>>>,
    ) -> Result<Vc<OptionAsyncModuleOptions>> {
        if let Some(async_module) = &*self.await? {
            return Ok(async_module.module_options(availability_root));
        }

        Ok(OptionAsyncModuleOptions::none())
    }
}

/// We use the acyclic graph in the [EsmScope] to resolve all referenced
/// [AsyncModule]s.
///
/// If we resolved raw references we would run into a deadlock if there are any
/// circular imports.
#[turbo_tasks::value]
struct AsyncModuleScc {
    scc: Vc<EsmScopeScc>,
    scope: Vc<EsmScope>,
}

/// Option<[AsyncModuleScc]>.
#[turbo_tasks::value(transparent)]
struct OptionAsyncModuleScc(Option<Vc<AsyncModuleScc>>);

#[turbo_tasks::value_impl]
impl AsyncModuleScc {
    #[turbo_tasks::function]
    fn new(scc: Vc<EsmScopeScc>, scope: Vc<EsmScope>) -> Vc<Self> {
        AsyncModuleScc { scc, scope }.cell()
    }

    #[turbo_tasks::function]
    async fn is_async(self: Vc<Self>) -> Result<Vc<bool>> {
        let this = self.await?;

        for placeable in &*this.scc.await? {
            if let Some(async_module) = &*placeable.get_async_module().await? {
                if *async_module.is_self_async().await? {
                    return Ok(Vc::cell(true));
                }
            }
        }

        for scc in &*this.scope.get_scc_children(this.scc).await? {
            // Because we generated SCCs there can be no loops in the children, so calling
            // recursively is fine.
            // AsyncModuleScc::new is resolved here to avoid unnecessary resolve tasks for
            // is_async in this hot code path.
            if *AsyncModuleScc::new(*scc, this.scope)
                .resolve()
                .await?
                .is_async()
                .await?
            {
                return Ok(Vc::cell(true));
            }
        }

        Ok(Vc::cell(false))
    }
}

#[turbo_tasks::value(transparent)]
struct AsyncModuleIdents(IndexSet<String>);

#[turbo_tasks::value_impl]
impl AsyncModule {
    #[turbo_tasks::function]
    async fn get_async_idents(
        self: Vc<Self>,
        availability_root: Option<Vc<Box<dyn Module>>>,
    ) -> Result<Vc<AsyncModuleIdents>> {
        let this = self.await?;

        let reference_idents = this
            .references
            .iter()
            .map(|r| async {
                let referenced_asset = r.get_referenced_asset().await?;
                Ok(match &*referenced_asset {
                    ReferencedAsset::OriginalReferenceTypeExternal(_) => {
                        // TODO(WEB-1259): we need to detect if external modules are esm
                        None
                    }
                    ReferencedAsset::Some(placeable) => {
                        if *placeable
                            .get_async_module()
                            .is_async(availability_root)
                            .await?
                        {
                            referenced_asset.get_ident().await?
                        } else {
                            None
                        }
                    }
                    ReferencedAsset::None => None,
                })
            })
            .try_flat_join()
            .await?;

        Ok(Vc::cell(IndexSet::from_iter(reference_idents)))
    }

    #[turbo_tasks::function]
    pub(crate) fn is_self_async(&self) -> Vc<bool> {
        Vc::cell(self.has_top_level_await)
    }

    #[turbo_tasks::function]
    async fn get_scc(
        self: Vc<Self>,
        availability_root: Option<Vc<Box<dyn Module>>>,
    ) -> Result<Vc<OptionAsyncModuleScc>> {
        let this = self.await?;

        let scope = EsmScope::new(availability_root);
        let Some(scc) = &*scope.get_scc(this.placeable).await? else {
            // I'm not sure if this should be possible.
            return Ok(Vc::cell(None));
        };

        let scc = AsyncModuleScc::new(*scc, scope);

        Ok(Vc::cell(Some(scc.resolve().await?)))
    }

    /// Check if the current module or any of it's ESM children contain a top
    /// level await statement or is referencing an external ESM module.
    #[turbo_tasks::function]
    pub async fn is_async(
        self: Vc<Self>,
        availability_root: Option<Vc<Box<dyn Module>>>,
    ) -> Result<Vc<bool>> {
        Ok(
            if let Some(scc) = &*self.get_scc(availability_root).await? {
                scc.is_async()
            } else {
                self.is_self_async()
            },
        )
    }

    /// Returns
    #[turbo_tasks::function]
    pub async fn module_options(
        self: Vc<Self>,
        availability_root: Option<Vc<Box<dyn Module>>>,
    ) -> Result<Vc<OptionAsyncModuleOptions>> {
        if !*self.is_async(availability_root).await? {
            return Ok(Vc::cell(None));
        }

        Ok(Vc::cell(Some(AsyncModuleOptions {
            has_top_level_await: self.await?.has_top_level_await,
        })))
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateableWithAvailabilityInfo for AsyncModule {
    #[turbo_tasks::function]
    async fn code_generation(
        self: Vc<Self>,
        _context: Vc<Box<dyn EcmascriptChunkingContext>>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Result<Vc<CodeGeneration>> {
        let mut visitors = Vec::new();

        let availability_info = availability_info.into_value();

        if !matches!(availability_info, AvailabilityInfo::Untracked) {
            let async_idents = self
                .get_async_idents(availability_info.current_availability_root())
                .await?;

            if !async_idents.is_empty() {
                visitors.push(create_visitor!(visit_mut_program(program: &mut Program) {
                    add_async_dependency_handler(program, &async_idents);
                }));
            }
        }

        Ok(CodeGeneration { visitors }.into())
    }

    #[turbo_tasks::function]
    async fn get_availability_info_needs(
        self: Vc<Self>,
        is_async_module: bool,
    ) -> Result<Vc<AvailabilityInfoNeeds>> {
        let mut needs = AvailabilityInfoNeeds::none();
        if is_async_module {
            needs.current_availability_root = true;
        }
        Ok(needs.cell())
    }
}

fn add_async_dependency_handler(program: &mut Program, idents: &IndexSet<String>) {
    let idents = idents
        .iter()
        .map(|ident| Ident::new(ident.clone().into(), DUMMY_SP))
        .collect::<Vec<_>>();

    let stmt = quote!(
        "var __turbopack_async_dependencies__ = __turbopack_handle_async_dependencies__($deps);"
            as Stmt,
        deps: Expr = Expr::Array(ArrayLit {
            span: DUMMY_SP,
            elems: idents
                .iter()
                .map(|ident| { Some(Expr::Ident(ident.clone()).into()) })
                .collect(),
        }),
    );

    insert_hoisted_stmt(program, stmt);

    let stmt = quote!(
        "($deps = __turbopack_async_dependencies__.then ? (await \
         __turbopack_async_dependencies__)() : __turbopack_async_dependencies__);" as Stmt,
        deps: Pat = Pat::Array(ArrayPat {
            span: DUMMY_SP,
            elems: idents
                .into_iter()
                .map(|ident| { Some(ident.into()) })
                .collect(),
            optional: false,
            type_ann: None,
        }),
    );

    insert_hoisted_stmt(program, stmt);
}
