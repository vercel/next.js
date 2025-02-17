//! If an import is specified as dynamic, next.js does few things:
//! - Runs a next_dynamic [transform to the source file](https://github.com/vercel/next.js/blob/ae1b89984d26b2af3658001fa19a19e1e77c312d/packages/next-swc/crates/next-transform-dynamic/src/lib.rs#L22)
//!   - This transform will [inject `loadableGenerated` property](https://github.com/vercel/next.js/blob/ae1b89984d26b2af3658001fa19a19e1e77c312d/packages/next-swc/crates/next-transform-dynamic/tests/fixture/wrapped-import/output-webpack-dev.js#L5),
//!     which contains the list of the import ids in the form of `${origin} -> ${imported}`.
//! - Emits `react-loadable-manifest.json` which contains the mapping of the import ids to the chunk
//!   ids.
//!   - Webpack: [implementation](https://github.com/vercel/next.js/blob/ae1b89984d26b2af3658001fa19a19e1e77c312d/packages/next/src/build/webpack/plugins/react-loadable-plugin.ts)
//!   - Turbopack: [implementation 1](https://github.com/vercel/next.js/pull/56389/files#diff-3cac9d9bfe73e0619e6407f21f6fe652da0719d0ec9074ff813ad3e416d0eb1a),
//!     [implementation 2](https://github.com/vercel/next.js/pull/56389/files#diff-791951bbe1fa09bcbad9be9173412d0848168f7d658758f11b6e8888a021552c),
//!     [implementation 3](https://github.com/vercel/next.js/pull/56389/files#diff-c33f6895801329243dd3f627c69da259bcab95c2c9d12993152842591931ff01R557)
//! - When running an application,
//!    - Server reads generated `react-loadable-manifest.json`, sets dynamicImportIds with the
//!      mapping of the import ids, and dynamicImports to the actual corresponding chunks.
//!      [implementation 1](https://github.com/vercel/next.js/blob/ad42b610c25b72561ad367b82b1c7383fd2a5dd2/packages/next/src/server/load-components.ts#L119),
//!      [implementation 2](https://github.com/vercel/next.js/blob/ad42b610c25b72561ad367b82b1c7383fd2a5dd2/packages/next/src/server/render.tsx#L1417C7-L1420)
//!    - Server embeds those into __NEXT_DATA__ and [send to the client.](https://github.com/vercel/next.js/blob/ad42b610c25b72561ad367b82b1c7383fd2a5dd2/packages/next/src/server/render.tsx#L1453)
//!    - When client boots up, pass it to the [client preload](https://github.com/vercel/next.js/blob/ad42b610c25b72561ad367b82b1c7383fd2a5dd2/packages/next/src/client/index.tsx#L943)
//!    - Loadable runtime [injects preload fn](https://github.com/vercel/next.js/blob/ad42b610c25b72561ad367b82b1c7383fd2a5dd2/packages/next/src/shared/lib/loadable.shared-runtime.tsx#L281)
//!      to wait until all the dynamic components are being loaded, this ensures hydration mismatch
//!      won't occur

use anyhow::Result;
use next_core::{
    next_app::ClientReferencesChunks, next_client_reference::EcmascriptClientReferenceModule,
    next_dynamic::NextDynamicEntryModule,
};
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    debug::ValueDebugFormat, trace::TraceRawVcs, FxIndexMap, NonLocalValue, ReadRef, ResolvedVc,
    TryFlatJoinIterExt, TryJoinIterExt, Value, Vc,
};
use turbopack_core::{
    chunk::{
        availability_info::AvailabilityInfo, ChunkItem, ChunkItemExt, ChunkableModule,
        ChunkingContext, ModuleId,
    },
    module::Module,
    module_graph::{ModuleGraph, SingleModuleGraph, SingleModuleGraphModuleNode},
    output::OutputAssets,
};

use crate::module_graph::DynamicImportEntriesWithImporter;

pub(crate) enum NextDynamicChunkAvailability<'a> {
    /// In App Router, the client references
    ClientReferences(&'a ClientReferencesChunks),
    /// In Pages Router, the base page chunk group
    AvailabilityInfo(AvailabilityInfo),
}

pub(crate) async fn collect_next_dynamic_chunks(
    module_graph: Vc<ModuleGraph>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    dynamic_import_entries: ReadRef<DynamicImportEntriesWithImporter>,
    chunking_availability: NextDynamicChunkAvailability<'_>,
) -> Result<ResolvedVc<DynamicImportedChunks>> {
    let chunking_availability = &chunking_availability;
    let dynamic_import_chunks = dynamic_import_entries
        .iter()
        .map(|(dynamic_entry, parent_client_reference)| async move {
            let module = ResolvedVc::upcast::<Box<dyn ChunkableModule>>(*dynamic_entry);

            // This is the availability info for the parent chunk group, i.e. the client reference
            // containing the next/dynamic imports
            let availability_info = match chunking_availability {
                NextDynamicChunkAvailability::ClientReferences(client_reference_chunks) => {
                    client_reference_chunks
                        .client_component_client_chunks
                        .get(&parent_client_reference.unwrap())
                        .unwrap()
                        .1
                }
                NextDynamicChunkAvailability::AvailabilityInfo(availability_info) => {
                    *availability_info
                }
            };

            let async_loader = chunking_context.async_loader_chunk_item(
                *module,
                module_graph,
                Value::new(availability_info),
            );
            let async_chunk_group = async_loader.references().to_resolved().await?;

            let module_id = dynamic_entry
                .as_chunk_item(module_graph, Vc::upcast(chunking_context))
                .id()
                .to_resolved()
                .await?;

            Ok((*dynamic_entry, (module_id, async_chunk_group)))
        })
        .try_join()
        .await?;

    Ok(ResolvedVc::cell(FxIndexMap::from_iter(
        dynamic_import_chunks,
    )))
}

#[turbo_tasks::value(transparent)]
#[derive(Default)]
pub struct DynamicImportedChunks(
    pub  FxIndexMap<
        ResolvedVc<NextDynamicEntryModule>,
        (ResolvedVc<ModuleId>, ResolvedVc<OutputAssets>),
    >,
);

#[derive(
    Clone, PartialEq, Eq, ValueDebugFormat, Serialize, Deserialize, TraceRawVcs, NonLocalValue,
)]
pub enum DynamicImportEntriesMapType {
    DynamicEntry(ResolvedVc<NextDynamicEntryModule>),
    ClientReference(ResolvedVc<EcmascriptClientReferenceModule>),
}

#[turbo_tasks::value(transparent)]
pub struct DynamicImportEntries(
    pub FxIndexMap<ResolvedVc<Box<dyn Module>>, DynamicImportEntriesMapType>,
);

#[turbo_tasks::function]
pub async fn map_next_dynamic(graph: Vc<SingleModuleGraph>) -> Result<Vc<DynamicImportEntries>> {
    let actions = graph
        .await?
        .iter_nodes()
        .map(|node| async move {
            let SingleModuleGraphModuleNode { module, layer, .. } = node;

            if layer
                .as_ref()
                .is_some_and(|layer| &**layer == "app-client" || &**layer == "client")
            {
                if let Some(dynamic_entry_module) =
                    ResolvedVc::try_downcast_type::<NextDynamicEntryModule>(*module)
                {
                    return Ok(Some((
                        *module,
                        DynamicImportEntriesMapType::DynamicEntry(dynamic_entry_module),
                    )));
                }
            }
            // TODO add this check once these modules have the correct layer
            // if layer.is_some_and(|layer| &**layer == "app-rsc") {
            if let Some(client_reference_module) =
                ResolvedVc::try_downcast_type::<EcmascriptClientReferenceModule>(*module)
            {
                return Ok(Some((
                    *module,
                    DynamicImportEntriesMapType::ClientReference(client_reference_module),
                )));
            }
            // }
            Ok(None)
        })
        .try_flat_join()
        .await?;
    Ok(Vc::cell(actions.into_iter().collect()))
}
