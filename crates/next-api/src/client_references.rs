use std::collections::HashMap;

use anyhow::Result;
use next_core::{
    self, next_client_reference::EcmascriptClientReferenceModule,
    next_server_component::server_component_module::NextServerComponentModule,
};
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    debug::ValueDebugFormat, trace::TraceRawVcs, ResolvedVc, TryFlatJoinIterExt, Vc,
};
use turbopack::css::CssModuleAsset;
use turbopack_core::module::Module;

use crate::module_graph::SingleModuleGraph;

#[derive(Clone, Serialize, Deserialize, Eq, PartialEq, TraceRawVcs, ValueDebugFormat)]
pub enum ClientReferenceMapType {
    EcmascriptClientReference {
        module: ResolvedVc<EcmascriptClientReferenceModule>,
        ssr_module: ResolvedVc<Box<dyn Module>>,
    },
    CssClientReference(ResolvedVc<CssModuleAsset>),
    ServerComponent(ResolvedVc<NextServerComponentModule>),
}

#[turbo_tasks::value(transparent)]
pub struct ClientReferencesSet(HashMap<ResolvedVc<Box<dyn Module>>, ClientReferenceMapType>);

#[turbo_tasks::function]
pub async fn map_client_references(
    graph: Vc<SingleModuleGraph>,
) -> Result<Vc<ClientReferencesSet>> {
    let actions = graph
        .await?
        .enumerate_nodes()
        .map(|(_, module)| async move {
            if let Some(client_reference_module) =
                ResolvedVc::try_downcast_type::<EcmascriptClientReferenceModule>(module).await?
            {
                Ok(Some((
                    module,
                    ClientReferenceMapType::EcmascriptClientReference {
                        module: client_reference_module,
                        ssr_module: ResolvedVc::upcast(client_reference_module.await?.ssr_module),
                    },
                )))
            } else if let Some(css_client_reference_asset) =
                ResolvedVc::try_downcast_type::<CssModuleAsset>(module).await?
            {
                Ok(Some((
                    module,
                    ClientReferenceMapType::CssClientReference(css_client_reference_asset),
                )))
            } else if let Some(server_component) =
                ResolvedVc::try_downcast_type::<NextServerComponentModule>(module).await?
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
