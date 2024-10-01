use anyhow::{bail, Result};
use turbo_tasks::{RcStr, Value, Vc};
use turbopack::{
    transition::{ContextTransition, Transition},
    ModuleAssetContext,
};
use turbopack_core::{
    context::ProcessResult,
    file_source::FileSource,
    reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
    source::Source,
};
use turbopack_ecmascript::{
    chunk::EcmascriptChunkPlaceable, tree_shake::asset::EcmascriptModulePartAsset,
    EcmascriptModuleAsset,
};

use super::ecmascript_client_reference_proxy_module::EcmascriptClientReferenceProxyModule;

#[turbo_tasks::value(shared)]
pub struct NextEcmascriptClientReferenceTransition {
    client_transition: Vc<Box<dyn Transition>>,
    ssr_transition: Vc<ContextTransition>,
}

#[turbo_tasks::value_impl]
impl NextEcmascriptClientReferenceTransition {
    #[turbo_tasks::function]
    pub fn new(
        client_transition: Vc<Box<dyn Transition>>,
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
    fn process_layer(self: Vc<Self>, layer: Vc<RcStr>) -> Vc<RcStr> {
        layer
    }

    #[turbo_tasks::function]
    async fn process(
        self: Vc<Self>,
        source: Vc<Box<dyn Source>>,
        module_asset_context: Vc<ModuleAssetContext>,
        reference_type: Value<ReferenceType>,
    ) -> Result<Vc<ProcessResult>> {
        let part = match &*reference_type {
            ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::ImportPart(
                part,
            )) => Some(*part),
            _ => None,
        };

        let module_asset_context = self.process_context(module_asset_context);

        let this = self.await?;

        let ident = match part {
            Some(part) => source.ident().with_part(part),
            None => source.ident(),
        };
        let ident_ref = ident.await?;
        let ident_path = ident_ref.path.await?;
        let client_source = if ident_path.path.contains("next/dist/esm/") {
            let path = ident_ref.path.root().join(
                ident_path
                    .path
                    .replace("next/dist/esm/", "next/dist/")
                    .into(),
            );
            Vc::upcast(FileSource::new_with_query(path, ident_ref.query))
        } else {
            source
        };
        let mut client_module = this
            .client_transition
            .process(client_source, module_asset_context, reference_type.clone())
            .module();

        let ssr_module = this
            .ssr_transition
            .process(source, module_asset_context, reference_type)
            .module();

        if let (Some(full), Some(part)) = (
            Vc::try_resolve_downcast_type::<EcmascriptModuleAsset>(client_module).await?,
            part,
        ) {
            client_module = EcmascriptModulePartAsset::select_part(full, part);
        }

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
        let module_asset_context = module_asset_context.await?;
        let server_context = ModuleAssetContext::new(
            module_asset_context.transitions,
            module_asset_context.compile_time_info,
            module_asset_context.module_options_context,
            module_asset_context.resolve_options_context,
            module_asset_context.layer,
        );

        Ok(
            ProcessResult::Module(Vc::upcast(EcmascriptClientReferenceProxyModule::new(
                ident,
                Vc::upcast(server_context),
                client_module,
                ssr_module,
            )))
            .cell(),
        )
    }
}
