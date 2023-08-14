use anyhow::{bail, Result};
use turbo_tasks::{Value, Vc};
use turbopack_binding::turbopack::{
    core::{
        module::Module,
        reference_type::{EntryReferenceSubType, ReferenceType},
        source::Source,
    },
    ecmascript::chunk::EcmascriptChunkPlaceable,
    turbopack::{
        transition::{ContextTransition, Transition},
        ModuleAssetContext,
    },
};

use super::ecmascript_client_reference_proxy_module::EcmascriptClientReferenceProxyModule;

#[turbo_tasks::value(shared)]
pub struct NextEcmascriptClientReferenceTransition {
    client_transition: Vc<ContextTransition>,
    ssr_transition: Vc<ContextTransition>,
}

#[turbo_tasks::value_impl]
impl NextEcmascriptClientReferenceTransition {
    #[turbo_tasks::function]
    pub fn new(
        client_transition: Vc<ContextTransition>,
        ssr_transition: Vc<ContextTransition>,
    ) -> Vc<Self> {
        NextEcmascriptClientReferenceTransition {
            client_transition,
            ssr_transition,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl Transition for NextEcmascriptClientReferenceTransition {
    #[turbo_tasks::function]
    async fn process(
        &self,
        source: Vc<Box<dyn Source>>,
        context: Vc<ModuleAssetContext>,
        _reference_type: Value<ReferenceType>,
    ) -> Result<Vc<Box<dyn Module>>> {
        let client_module = self.client_transition.process(
            source,
            context,
            Value::new(ReferenceType::Entry(
                EntryReferenceSubType::AppClientComponent,
            )),
        );

        let ssr_module = self.ssr_transition.process(
            source,
            context,
            Value::new(ReferenceType::Entry(
                EntryReferenceSubType::AppClientComponent,
            )),
        );

        let Some(client_module) =
            Vc::try_resolve_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(client_module).await?
        else {
            bail!("client asset is not ecmascript chunk placeable");
        };

        let Some(ssr_module) =
            Vc::try_resolve_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(ssr_module).await?
        else {
            bail!("SSR asset is not ecmascript chunk placeable");
        };

        // TODO(alexkirsz) This is necessary to remove the transition currently set on
        // the context.
        let context = context.await?;
        let server_context = ModuleAssetContext::new(
            context.transitions,
            context.compile_time_info,
            context.module_options_context,
            context.resolve_options_context,
        );

        Ok(Vc::upcast(EcmascriptClientReferenceProxyModule::new(
            source.ident(),
            Vc::upcast(server_context),
            client_module,
            ssr_module,
        )))
    }
}
