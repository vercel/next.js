use anyhow::Result;
use next_core::{
    next_client_reference::{CssClientReferenceModule, EcmascriptClientReferenceModule},
    next_server_component::server_component_module::NextServerComponentModule,
};
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    NonLocalValue, ResolvedVc, TryFlatJoinIterExt, Vc, debug::ValueDebugFormat, trace::TraceRawVcs,
};
use turbopack::css::chunk::CssChunkPlaceable;
use turbopack_core::{module::Module, module_graph::SingleModuleGraph};

#[derive(
    Copy, Clone, Serialize, Deserialize, Eq, PartialEq, TraceRawVcs, ValueDebugFormat, NonLocalValue,
)]
pub enum ClientManifestEntryType {
    EcmascriptClientReference {
        module: ResolvedVc<EcmascriptClientReferenceModule>,
        ssr_module: ResolvedVc<Box<dyn Module>>,
    },
    CssClientReference(ResolvedVc<Box<dyn CssChunkPlaceable>>),
    ServerComponent(ResolvedVc<NextServerComponentModule>),
}

/// Tracks information about all the css and js client references in the graph.
#[turbo_tasks::value(transparent)]
pub struct ClientReferenceData(FxHashMap<ResolvedVc<Box<dyn Module>>, ClientManifestEntryType>);

#[turbo_tasks::function]
pub async fn map_client_references(
    graph: Vc<SingleModuleGraph>,
) -> Result<Vc<ClientReferenceData>> {
    let graph = graph.await?;
    let manifest = graph
        .iter_nodes()
        .map(|node| async move {
            let module = node.module;

            if let Some(client_reference_module) =
                ResolvedVc::try_downcast_type::<EcmascriptClientReferenceModule>(module)
            {
                Ok(Some((
                    module,
                    ClientManifestEntryType::EcmascriptClientReference {
                        module: client_reference_module,
                        ssr_module: ResolvedVc::upcast(client_reference_module.await?.ssr_module),
                    },
                )))
            } else if let Some(client_reference_module) =
                ResolvedVc::try_downcast_type::<CssClientReferenceModule>(module)
            {
                Ok(Some((
                    module,
                    ClientManifestEntryType::CssClientReference(
                        client_reference_module.await?.client_module,
                    ),
                )))
            } else if let Some(server_component) =
                ResolvedVc::try_downcast_type::<NextServerComponentModule>(module)
            {
                Ok(Some((
                    module,
                    ClientManifestEntryType::ServerComponent(server_component),
                )))
            } else {
                Ok(None)
            }
        })
        .try_flat_join()
        .await?
        .into_iter()
        .collect::<FxHashMap<_, _>>();

    Ok(Vc::cell(manifest))
}
