use anyhow::{Result, bail};
use indoc::formatdoc;
use rustc_hash::FxHashSet;
use tracing::Instrument;
use turbo_rcstr::rcstr;
use turbo_tasks::{FxIndexSet, ResolvedVc, TryJoinIterExt, ValueToString, Vc};
use turbopack_core::{
    chunk::{
        AsyncModuleInfo, ChunkData, ChunkableModule, ChunkingContext, ChunkingContextExt,
        ChunksData, ModuleChunkItemIdExt, availability_info::AvailabilityInfo,
    },
    ident::AssetIdent,
    module::{Module, ModuleSideEffects, Modules},
    module_graph::{
        BatchingConfig, ModuleGraph,
        chunk_group_info::{ChunkGroup, canonical_async_available_modules},
    },
    output::OutputAssetsWithReferenced,
    reference::ModuleReferences,
};

async fn canonical_async_availability(
    module_graph: ResolvedVc<ModuleGraph>,
    module: ResolvedVc<Box<dyn ChunkableModule>>,
    batching_config: ResolvedVc<BatchingConfig>,
) -> Result<AvailabilityInfo> {
    let chunk_group_info_vc = module_graph.chunk_group_info();
    let chunk_group_index = *chunk_group_info_vc
        .get_index_of(ChunkGroup::Async(ResolvedVc::upcast(module)))
        .await?;
    let chunk_group_info = chunk_group_info_vc.await?;

    // Availability is the intersection across parent paths, but page-conditional traversal must
    // stay active for every entry that can reach this shared group. Use the union of those entries
    // as traversal context without treating that union as module availability.
    let mut entry_modules = FxIndexSet::default();
    let mut visited = FxHashSet::default();
    let mut pending = chunk_group_info.chunk_group_parents[chunk_group_index]
        .iter()
        .map(|index| index as usize)
        .collect::<Vec<_>>();
    while let Some(index) = pending.pop() {
        if !visited.insert(index) {
            continue;
        }
        match &chunk_group_info.chunk_groups[index] {
            ChunkGroup::Entry(modules) => entry_modules.extend(modules.iter().copied()),
            _ => pending.extend(
                chunk_group_info.chunk_group_parents[index]
                    .iter()
                    .map(|index| index as usize),
            ),
        }
    }

    let available_modules =
        canonical_async_available_modules(module_graph, module, batching_config);
    let mut availability_info = AvailabilityInfo::root()
        .with_modules(available_modules)
        .await?
        .in_async_module();
    if !entry_modules.is_empty() {
        availability_info = availability_info.with_entry_group(ResolvedVc::<Modules>::cell(
            entry_modules.into_iter().collect(),
        ));
    }
    Ok(availability_info)
}

use crate::{
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkItemOptions, EcmascriptChunkPlaceable,
        EcmascriptExports, data::EcmascriptChunkData, ecmascript_chunk_item,
    },
    runtime_functions::{TURBOPACK_EXPORT_VALUE, TURBOPACK_LOAD, TURBOPACK_MODULES},
    utils::{StringifyJs, StringifyModuleId},
};

/// The AsyncLoaderModule is a module that loads another module async, by
/// putting it into a separate chunk group.
#[turbo_tasks::value]
pub struct AsyncLoaderModule {
    pub inner: ResolvedVc<Box<dyn ChunkableModule>>,
    pub chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl AsyncLoaderModule {
    #[turbo_tasks::function]
    pub fn new(
        module: ResolvedVc<Box<dyn ChunkableModule>>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Self> {
        Self::cell(AsyncLoaderModule {
            inner: module,
            chunking_context,
        })
    }

    #[turbo_tasks::function]
    pub async fn asset_ident_for(module: Vc<Box<dyn ChunkableModule>>) -> Result<Vc<AssetIdent>> {
        Ok(module
            .ident()
            .owned()
            .await?
            .with_modifier(rcstr!("async loader"))
            .into_vc())
    }

    #[turbo_tasks::function]
    pub(super) async fn chunk_group(
        &self,
        module_graph: Vc<ModuleGraph>,
    ) -> Result<Vc<OutputAssetsWithReferenced>> {
        // A loader has one stable module ID. Use the availability shared by every parent group so
        // its factory is both entry-independent and able to exclude common parent modules.
        let module_graph = module_graph.to_resolved().await?;
        let availability_info = canonical_async_availability(
            module_graph,
            self.inner,
            self.chunking_context
                .batching_config()
                .to_resolved()
                .await?,
        )
        .await?;
        Ok(self.chunking_context.chunk_group_assets(
            self.inner.ident(),
            ChunkGroup::Async(ResolvedVc::upcast(self.inner)),
            *module_graph,
            availability_info,
        ))
    }

    #[turbo_tasks::function]
    async fn chunks_data(self: Vc<Self>, module_graph: Vc<ModuleGraph>) -> Result<Vc<ChunksData>> {
        let this = self.await?;
        let span = tracing::info_span!(
            "compute async chunks",
            name = self.ident().to_string().await?.as_str()
        );
        async move {
            Ok(ChunkData::from_assets(
                this.chunking_context.output_root().owned().await?,
                *self.chunk_group(module_graph).await?.assets,
            ))
        }
        .instrument(span)
        .await
    }
}

#[turbo_tasks::value_impl]
impl Module for AsyncLoaderModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        Self::asset_ident_for(*self.inner)
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<turbopack_core::source::OptionSource> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        bail!("AsyncLoaderModule::references should never be called")
    }

    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        ModuleSideEffects::SideEffectFree.cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for AsyncLoaderModule {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        ecmascript_chunk_item(ResolvedVc::upcast(self), module_graph, chunking_context)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for AsyncLoaderModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::Value.cell()
    }

    #[turbo_tasks::function]
    async fn chunk_item_content(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
        estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let options = EcmascriptChunkItemOptions {
            supports_arrow_functions: *chunking_context
                .environment()
                .runtime_versions()
                .supports_arrow_functions()
                .await?,
            ..Default::default()
        };

        if estimated {
            let code = formatdoc! {
                r#"
                    {TURBOPACK_EXPORT_VALUE}((parentImport) => {{
                        return Promise.all([].map((chunk) => {TURBOPACK_LOAD}(chunk))).then(() => {{}});
                    }});
                "#,
            };
            return Ok(EcmascriptChunkItemContent {
                inner_code: code.into(),
                options,
                ..Default::default()
            }
            .cell());
        }

        let this = self.await?;

        let id = if let Some(placeable) =
            ResolvedVc::try_downcast::<Box<dyn EcmascriptChunkPlaceable>>(this.inner)
        {
            Some(placeable.chunk_item_id(chunking_context).await?)
        } else {
            None
        };
        let id = id.as_ref();

        let chunks_data = self.chunks_data(module_graph).await?;
        let chunks_data = chunks_data.iter().try_join().await?;
        let chunks_data: Vec<_> = chunks_data
            .iter()
            .map(|chunk_data| EcmascriptChunkData::new(chunk_data))
            .collect();

        let code = match (id, chunks_data.is_empty()) {
            (Some(id), true) => {
                formatdoc! {
                    r#"
                        {TURBOPACK_EXPORT_VALUE}((parentImport) => {{
                            return Promise.resolve().then(() => {{
                                return parentImport({id});
                            }});
                        }});
                    "#,
                    id = StringifyModuleId(id),
                }
            }
            (Some(id), false) => {
                // A completed path that installed the target also installed the dependencies used
                // on that path. The canonical chunk list is the fallback when no path has done so.
                formatdoc! {
                    r#"
                        {TURBOPACK_EXPORT_VALUE}((parentImport) => {{
                            const load = {TURBOPACK_MODULES}.has({id})
                                ? Promise.resolve()
                                : Promise.all({chunks:#}.map((chunk) => {TURBOPACK_LOAD}(chunk)));
                            return load.then(() => {{
                                return parentImport({id});
                            }});
                        }});
                    "#,
                    chunks = StringifyJs(&chunks_data),
                    id = StringifyModuleId(id),
                }
            }
            (None, true) => {
                formatdoc! {
                    r#"
                        {TURBOPACK_EXPORT_VALUE}((parentImport) => {{
                            return Promise.resolve();
                        }});
                    "#,
                }
            }
            (None, false) => {
                formatdoc! {
                    r#"
                        {TURBOPACK_EXPORT_VALUE}((parentImport) => {{
                            return Promise.all({chunks:#}.map((chunk) => {TURBOPACK_LOAD}(chunk))).then(() => {{}});
                        }});
                    "#,
                    chunks = StringifyJs(&chunks_data),
                }
            }
        };

        Ok(EcmascriptChunkItemContent {
            inner_code: code.into(),
            options,
            ..Default::default()
        }
        .cell())
    }

    #[turbo_tasks::function]
    fn chunk_item_output_assets(
        self: Vc<Self>,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
    ) -> Vc<OutputAssetsWithReferenced> {
        self.chunk_group(module_graph)
    }
}
