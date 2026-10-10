use anyhow::{Result, bail};
use turbo_tasks::{ResolvedVc, Vc};
use turbopack::{ModuleAssetContext, transition::Transition};
use turbopack_core::{
    context::ProcessResult,
    file_source::FileSource,
    reference_type::{EntryReferenceSubType, ReferenceType},
    source::Source,
};
use turbopack_ecmascript::chunk::EcmascriptChunkPlaceable;

use crate::next_client_reference::ecmascript_client_reference::ecmascript_client_reference_module::EcmascriptClientReferenceModule;

#[turbo_tasks::value(shared)]
pub struct NextEcmascriptClientReferenceTransition {
    client_transition: ResolvedVc<Box<dyn Transition>>,
    ssr_transition: ResolvedVc<Box<dyn Transition>>,
}

#[turbo_tasks::value_impl]
impl NextEcmascriptClientReferenceTransition {
    #[turbo_tasks::function]
    pub fn new(
        client_transition: ResolvedVc<Box<dyn Transition>>,
        ssr_transition: ResolvedVc<Box<dyn Transition>>,
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
        self: Vc<Self>,
        source: Vc<Box<dyn Source>>,
        module_asset_context: Vc<ModuleAssetContext>,
        // The import part this resolution asked for is deliberately ignored: every part of the
        // same client component maps to one client reference module, so that turbo-tasks interns
        // it (and its generated proxy) once instead of once per part.
        _reference_type: ReferenceType,
    ) -> Result<Vc<ProcessResult>> {
        let module_asset_context = self.process_context(module_asset_context);

        let this = self.await?;

        let ident = source.ident();
        let ident_ref = ident.await?;
        let client_source = if ident_ref.path.path.contains("next/dist/esm/") {
            let path = ident_ref
                .path
                .root()
                .await?
                .join(&ident_ref.path.path.replace("next/dist/esm/", "next/dist/"))?;
            Vc::upcast(FileSource::new_with_query_and_fragment(
                path,
                ident_ref.query.clone(),
                ident_ref.fragment.clone(),
            ))
        } else {
            source
        };
        let client_module = this.client_transition.process(
            client_source,
            module_asset_context,
            ReferenceType::Entry(EntryReferenceSubType::AppClientComponent),
        );
        let ProcessResult::Module(client_module) = *client_module.await? else {
            return Ok(ProcessResult::Ignore.cell());
        };

        let ssr_module = this.ssr_transition.process(
            source,
            module_asset_context,
            ReferenceType::Entry(EntryReferenceSubType::AppClientComponent),
        );

        let ProcessResult::Module(ssr_module) = *ssr_module.await? else {
            return Ok(ProcessResult::Ignore.cell());
        };

        let Some(client_module) =
            ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(client_module)
        else {
            bail!("client asset is not ecmascript chunk placeable");
        };

        let Some(ssr_module) =
            ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(ssr_module)
        else {
            bail!("SSR asset is not ecmascript chunk placeable");
        };

        // TODO(alexkirsz) This is necessary to remove the transition currently set on
        // the context.
        let module_asset_context = module_asset_context.await?;
        let server_context = ModuleAssetContext::new(
            *module_asset_context.transitions,
            *module_asset_context.compile_time_info,
            *module_asset_context.module_options_context,
            *module_asset_context.resolve_options_context,
            module_asset_context.layer.clone(),
        );

        Ok(ProcessResult::Module(ResolvedVc::upcast(
            EcmascriptClientReferenceModule::new(
                ident,
                Vc::upcast(server_context),
                *client_module,
                *ssr_module,
            )
            .to_resolved()
            .await?,
        ))
        .cell())
    }
}
