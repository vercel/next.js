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

use anyhow::{Context, Result};
use bincode::{Decode, Encode};
use either::Either;
use next_core::{
    next_app::ClientReferencesChunks, next_client_reference::EcmascriptClientReferenceModule,
    next_dynamic::NextDynamicEntryModule,
};
use turbo_tasks::{
    FxIndexMap, NonLocalValue, ReadRef, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc,
    debug::ValueDebugFormat, turbobail,
};
use turbopack_core::{
    chunk::{
        ChunkGroupResult, ChunkableModule, ChunkingContext, availability_info::AvailabilityInfo,
    },
    module::Module,
    module_graph::{ModuleGraph, ModuleGraphLayer},
    output::{OutputAssetsReference, OutputAssetsWithReferenced},
};
use turbopack_ecmascript::async_chunk::module::AsyncLoaderModule;

use crate::module_graph::{DynamicImportEntriesWithImporter, DynamicImportEntryWithImporter};

/// The chunk groups whose async loaders load the `next/dynamic` imports at runtime.
pub(crate) enum NextDynamicChunkAvailability<'a> {
    /// In App Router, the chunk group of the client reference containing the import
    ClientReferences(&'a ClientReferencesChunks),
    /// In Pages Router, the page's client chunk group
    ChunkGroup(&'a ChunkGroupResult),
}

pub(crate) async fn collect_next_dynamic_chunks(
    module_graph: Vc<ModuleGraph>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    dynamic_import_entries: ReadRef<DynamicImportEntriesWithImporter>,
    chunking_availability: NextDynamicChunkAvailability<'_>,
) -> Result<ResolvedVc<DynamicImportedChunks>> {
    let chunking_availability = &chunking_availability;
    let module_graph = module_graph.to_resolved().await?;
    let chunking_context = chunking_context.to_resolved().await?;
    let dynamic_import_chunks = dynamic_import_entries
        .iter()
        .map(
            async |DynamicImportEntryWithImporter {
                       dynamic_entry,
                       parent_client_reference,
                       async_modules,
                   }| {
                let module = ResolvedVc::upcast::<Box<dyn ChunkableModule>>(*dynamic_entry);

                let parent_chunk_group = match chunking_availability {
                    NextDynamicChunkAvailability::ClientReferences(client_reference_chunks) => {
                        Either::Left(
                            client_reference_chunks
                                .client_component_client_chunks
                                .get(&parent_client_reference.context(
                                    "Parent client reference not found for next/dynamic import",
                                )?)
                                .context(
                                    "Client reference chunk group not found for next/dynamic \
                                     import",
                                )?
                                .await?,
                        )
                    }
                    NextDynamicChunkAvailability::ChunkGroup(chunk_group) => {
                        Either::Right(*chunk_group)
                    }
                };
                let availability_info = async_loader_availability_info(
                    &parent_chunk_group,
                    async_modules,
                    module,
                    chunking_context,
                    module_graph,
                )
                .await?;

                // The react-loadable manifest needs the final CSS and JavaScript files so
                // next/dynamic can preload them during SSR. Do not use a lazy manifest loader
                // here.
                let async_loader =
                    AsyncLoaderModule::new(*module, *chunking_context, availability_info)
                        .to_resolved()
                        .await?
                        .as_chunk_item(*module_graph, *chunking_context);
                let async_chunk_group = async_loader.references().to_resolved().await?;

                Ok((*dynamic_entry, (*dynamic_entry, async_chunk_group)))
            },
        )
        .try_join()
        .await?;

    Ok(ResolvedVc::cell(FxIndexMap::from_iter(
        dynamic_import_chunks,
    )))
}

/// The availability chunking created the emitted async loader of `module` (a `next/dynamic`
/// import) with, so the manifest lists the chunks that loader loads.
///
/// Don't re-derive it here: it depends on which chunk group created the loader (e.g. a layout's or
/// the page's in a concatenated chunk group, or the async chunk group of a plain `import()` on the
/// way to the import), and on chunking options. Starting at `parent_chunk_group`, follow the async
/// chunk groups of `async_modules` (outermost first) until one of the chunk groups followed so far
/// created the loader. Each async chunk group is the one its emitted loader loads, created with the
/// recorded availability.
///
/// All chunk groups followed so far are searched, not only the innermost one: a chunk group
/// doesn't create an async loader that an available (outer) chunk group already created.
async fn async_loader_availability_info(
    parent_chunk_group: &ChunkGroupResult,
    async_modules: &[ResolvedVc<Box<dyn Module>>],
    module: ResolvedVc<Box<dyn ChunkableModule>>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    module_graph: ResolvedVc<ModuleGraph>,
) -> Result<AvailabilityInfo> {
    let mut async_chunk_groups: Vec<ReadRef<ChunkGroupResult>> = vec![];
    async fn find(
        parent_chunk_group: &ChunkGroupResult,
        async_chunk_groups: &[ReadRef<ChunkGroupResult>],
        module: ResolvedVc<Box<dyn ChunkableModule>>,
    ) -> Result<Option<AvailabilityInfo>> {
        for chunk_group in
            std::iter::once(parent_chunk_group).chain(async_chunk_groups.iter().map(|c| &**c))
        {
            if let Some(availability_info) = chunk_group
                .find_async_loader_availability_info(module)
                .await?
            {
                return Ok(Some(availability_info));
            }
        }
        Ok(None)
    }

    for &async_module in async_modules {
        if let Some(availability_info) =
            find(parent_chunk_group, &async_chunk_groups, module).await?
        {
            return Ok(availability_info);
        }
        let async_module = ResolvedVc::try_downcast::<Box<dyn ChunkableModule>>(async_module)
            .context("Async module on the path to a next/dynamic import isn't chunkable")?;
        let Some(availability_info) =
            find(parent_chunk_group, &async_chunk_groups, async_module).await?
        else {
            turbobail!(
                "No async loader for {} on the path to the next/dynamic import {} was created by \
                 the {} chunk group result(s) followed",
                async_module.ident(),
                module.ident(),
                async_chunk_groups.len() + 1
            );
        };
        let Some(next_chunk_group) =
            *AsyncLoaderModule::new(*async_module, *chunking_context, availability_info)
                .chunk_group_result(*module_graph)
                .await?
        else {
            // The async module is already available, so its loader loads nothing: the async
            // loaders it needs were created by the chunk group it is available in, so continue
            // with the chunk groups followed so far.
            continue;
        };
        async_chunk_groups.push(next_chunk_group.await?);
    }
    if let Some(availability_info) = find(parent_chunk_group, &async_chunk_groups, module).await? {
        return Ok(availability_info);
    }
    turbobail!(
        "No async loader for the next/dynamic import {} was created by the {} chunk group \
         result(s) followed",
        module.ident(),
        async_chunk_groups.len() + 1
    )
}

#[turbo_tasks::value(transparent)]
#[derive(Default)]
pub struct DynamicImportedChunks(
    #[bincode(with = "turbo_bincode::indexmap")]
    pub  FxIndexMap<
        ResolvedVc<NextDynamicEntryModule>,
        (
            ResolvedVc<NextDynamicEntryModule>,
            ResolvedVc<OutputAssetsWithReferenced>,
        ),
    >,
);

#[derive(Clone, PartialEq, Eq, ValueDebugFormat, NonLocalValue, Encode, Decode)]
pub enum DynamicImportEntriesMapType {
    DynamicEntry(ResolvedVc<NextDynamicEntryModule>),
    ClientReference(ResolvedVc<EcmascriptClientReferenceModule>),
}

#[turbo_tasks::value(transparent)]
pub struct DynamicImportEntries(
    #[bincode(with = "turbo_bincode::indexmap")]
    pub  FxIndexMap<ResolvedVc<Box<dyn Module>>, DynamicImportEntriesMapType>,
);

#[turbo_tasks::function]
pub async fn map_next_dynamic(
    graph: ResolvedVc<ModuleGraphLayer>,
) -> Result<Vc<DynamicImportEntries>> {
    let actions =
        graph
            .await?
            .iter_reachable_modules()?
            .map(async |module| {
                if let Some(dynamic_entry_module) =
                    ResolvedVc::try_downcast_type::<NextDynamicEntryModule>(module)
                    && module.ident().await?.layer.as_ref().is_some_and(|layer| {
                        layer.name() == "app-client" || layer.name() == "client"
                    })
                {
                    return Ok(Some((
                        module,
                        DynamicImportEntriesMapType::DynamicEntry(dynamic_entry_module),
                    )));
                }
                // TODO add this check once these modules have the correct layer
                // if layer.is_some_and(|layer| &**layer == "app-rsc") {
                if let Some(client_reference_module) =
                    ResolvedVc::try_downcast_type::<EcmascriptClientReferenceModule>(module)
                {
                    return Ok(Some((
                        module,
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
