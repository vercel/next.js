use anyhow::Result;
use next_core::{
    self,
    next_client_reference::{CssClientReferenceModule, EcmascriptClientReferenceModule},
    next_server_component::server_component_module::NextServerComponentModule,
};
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    debug::ValueDebugFormat, trace::TraceRawVcs, NonLocalValue, ResolvedVc, TryFlatJoinIterExt, Vc,
};
use turbopack::css::chunk::CssChunkPlaceable;
use turbopack_core::{module::Module, module_graph::SingleModuleGraph};

#[derive(
    Clone, Serialize, Deserialize, Eq, PartialEq, TraceRawVcs, ValueDebugFormat, NonLocalValue,
)]
pub enum ClientReferenceMapType {
    EcmascriptClientReference {
        module: ResolvedVc<EcmascriptClientReferenceModule>,
        ssr_module: ResolvedVc<Box<dyn Module>>,
    },
    CssClientReference(ResolvedVc<Box<dyn CssChunkPlaceable>>),
    ServerComponent(ResolvedVc<NextServerComponentModule>),
}

#[turbo_tasks::value(transparent)]
pub struct ClientReferencesSet(FxHashMap<ResolvedVc<Box<dyn Module>>, ClientReferenceMapType>);

#[turbo_tasks::function]
pub async fn map_client_references(
    graph: Vc<SingleModuleGraph>,
) -> Result<Vc<ClientReferencesSet>> {
    let actions = graph
        .await?
        .iter_nodes()
        .map(|node| async move {
            let module = node.module;

            if let Some(client_reference_module) =
                ResolvedVc::try_downcast_type::<EcmascriptClientReferenceModule>(module)
            {
                Ok(Some((
                    module,
                    ClientReferenceMapType::EcmascriptClientReference {
                        module: client_reference_module,
                        ssr_module: ResolvedVc::upcast(client_reference_module.await?.ssr_module),
                    },
                )))
            } else if let Some(client_reference_module) =
                ResolvedVc::try_downcast_type::<CssClientReferenceModule>(module)
            {
                Ok(Some((
                    module,
                    ClientReferenceMapType::CssClientReference(ResolvedVc::upcast(
                        client_reference_module.await?.client_module,
                    )),
                )))
            } else if let Some(server_component) =
                ResolvedVc::try_downcast_type::<NextServerComponentModule>(module)
            {
                Ok(Some((
                    module,
                    ClientReferenceMapType::ServerComponent(server_component),
                )))
            } else {
                Ok(None)
            }
        })
        .try_flat_join()
        .await?;
    Ok(Vc::cell(actions.into_iter().collect()))
}
