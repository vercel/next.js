use anyhow::Result;
use indexmap::IndexSet;
use serde::{Deserialize, Serialize};
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{ArrayLit, ArrayPat, Expr, Ident, Pat, Program},
    quote,
};
use turbo_tasks::{primitives::Bools, trace::TraceRawVcs, TryFlatJoinIterExt, Value, Vc};
use turbopack_core::chunk::availability_info::AvailabilityInfo;

use crate::{
    chunk::{
        esm_scope::{EsmScope, EsmScopeScc},
        EcmascriptChunkPlaceable, EcmascriptChunkingContext,
    },
    code_gen::{CodeGenerateableWithAvailabilityInfo, CodeGeneration},
    create_visitor,
    references::esm::{base::insert_hoisted_stmt, EsmAssetReference},
    EcmascriptModuleAsset,
};

#[derive(PartialEq, Eq, Default, Debug, Clone, Serialize, Deserialize, TraceRawVcs)]
pub struct AsyncModuleOptions {
    pub has_top_level_await: bool,
}

#[turbo_tasks::value(transparent)]
pub struct OptionAsyncModuleOptions(Option<AsyncModuleOptions>);

#[turbo_tasks::value_impl]
impl OptionAsyncModuleOptions {
    #[turbo_tasks::function]
    pub(crate) fn none() -> Vc<Self> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    pub(crate) async fn is_async(self: Vc<Self>) -> Result<Vc<bool>> {
        Ok(Vc::cell(self.await?.is_some()))
    }
}

#[turbo_tasks::value(shared)]
pub struct AsyncModule {
    pub(super) module: Vc<EcmascriptModuleAsset>,
    pub(super) references: IndexSet<Vc<EsmAssetReference>>,
    pub(super) has_top_level_await: bool,
}

#[turbo_tasks::value(transparent)]
pub struct AsyncModules(IndexSet<Vc<AsyncModule>>);

#[turbo_tasks::value(transparent)]
pub struct OptionAsyncModule(Option<Vc<AsyncModule>>);

#[turbo_tasks::value_impl]
impl OptionAsyncModule {
    #[turbo_tasks::function]
    pub(crate) fn none() -> Vc<Self> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    pub(crate) async fn is_async(
        self: Vc<Self>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Result<Vc<bool>> {
        Ok(Vc::cell(
            self.module_options(availability_info).await?.is_some(),
        ))
    }

    #[turbo_tasks::function]
    pub(crate) async fn module_options(
        self: Vc<Self>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Result<Vc<OptionAsyncModuleOptions>> {
        if let Some(async_module) = &*self.await? {
            return Ok(async_module.module_options(availability_info));
        }

        Ok(OptionAsyncModuleOptions::none())
    }
}

#[turbo_tasks::value]
pub struct AsyncModuleScc {
    scc: Vc<EsmScopeScc>,
    scope: Vc<EsmScope>,
}

#[turbo_tasks::value(transparent)]
pub struct OptionAsyncModuleScc(Option<Vc<AsyncModuleScc>>);

#[turbo_tasks::function]
async fn is_placeable_self_async(
    placeable: Vc<Box<dyn EcmascriptChunkPlaceable>>,
) -> Result<Vc<bool>> {
    let Some(async_module) = &*placeable.get_async_module().await? else {
        return Ok(Vc::cell(false));
    };

    Ok(async_module.is_self_async())
}

#[turbo_tasks::value_impl]
impl AsyncModuleScc {
    #[turbo_tasks::function]
    fn new(scc: Vc<EsmScopeScc>, scope: Vc<EsmScope>) -> Vc<Self> {
        AsyncModuleScc { scc, scope }.cell()
    }

    #[turbo_tasks::function]
    pub(crate) async fn is_async(self: Vc<Self>) -> Result<Vc<bool>> {
        let this = self.await?;

        let mut bools = Vec::new();

        for placeable in &*this.scc.await? {
            bools.push(is_placeable_self_async(*placeable));
        }

        for scc in &*this.scope.get_scc_children(this.scc).await? {
            // Because we generated SCCs there can be no loops in the children, so calling
            // recursively is fine.
            bools.push(AsyncModuleScc::new(*scc, this.scope).is_async());
        }

        Ok(Vc::<Bools>::cell(bools).any())
    }
}

#[turbo_tasks::value(transparent)]
pub struct AsyncModuleIdents(IndexSet<String>);

#[turbo_tasks::value_impl]
impl AsyncModule {
    #[turbo_tasks::function]
    pub(crate) async fn get_async_idents(
        self: Vc<Self>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Result<Vc<AsyncModuleIdents>> {
        let this = self.await?;

        let reference_idents = this
            .references
            .iter()
            .map(|r| async {
                let referenced_asset = r.get_referenced_asset().await?;
                let ident = if *r.is_async(availability_info).await? {
                    referenced_asset.get_ident().await?
                } else {
                    None
                };
                anyhow::Ok(ident)
            })
            .try_flat_join()
            .await?;

        Ok(Vc::cell(IndexSet::from_iter(reference_idents)))
    }

    #[turbo_tasks::function]
    pub(crate) async fn has_top_level_await(self: Vc<Self>) -> Result<Vc<bool>> {
        Ok(Vc::cell(self.await?.has_top_level_await))
    }

    #[turbo_tasks::function]
    pub(crate) async fn is_self_async(self: Vc<Self>) -> Result<Vc<bool>> {
        let this = self.await?;

        if this.has_top_level_await {
            return Ok(Vc::cell(true));
        }

        let bools = Vc::<Bools>::cell(
            this.references
                .iter()
                .map(|r| r.is_external_esm())
                .collect(),
        );

        Ok(bools.any())
    }

    #[turbo_tasks::function]
    async fn get_scc(
        self: Vc<Self>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Result<Vc<OptionAsyncModuleScc>> {
        let this = self.await?;

        let scope = EsmScope::new(availability_info);
        let Some(scc) = &*scope.get_scc(Vc::upcast(this.module)).await? else {
            // I'm not sure if this should be possible.
            return Ok(Vc::cell(None));
        };

        let scc = AsyncModuleScc::new(*scc, scope);

        Ok(Vc::cell(Some(scc)))
    }

    #[turbo_tasks::function]
    pub(crate) async fn is_async(
        self: Vc<Self>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Result<Vc<bool>> {
        Ok(
            if let Some(scc) = &*self.get_scc(availability_info).await? {
                scc.is_async()
            } else {
                self.is_self_async()
            },
        )
    }

    #[turbo_tasks::function]
    pub(crate) async fn module_options(
        self: Vc<Self>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Result<Vc<OptionAsyncModuleOptions>> {
        if !*self.is_async(availability_info).await? {
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

        let async_idents = self.get_async_idents(availability_info).await?;

        if !async_idents.is_empty() {
            visitors.push(create_visitor!(visit_mut_program(program: &mut Program) {
                add_async_dependency_handler(program, &async_idents);
            }));
        }

        Ok(CodeGeneration { visitors }.into())
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
