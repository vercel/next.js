use anyhow::{Result, bail};
use indoc::formatdoc;
#[cfg(not(feature = "sync"))]
use tracing::Instrument;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbopack_core::{
    chunk::{
        AsyncModuleInfo, ChunkData, ChunkableModule, ChunkingContext, ChunkingContextExt,
        ChunksData, ModuleChunkItemIdExt, availability_info::AvailabilityInfo,
    },
    ident::AssetIdent,
    module::{Module, ModuleSideEffects},
    module_graph::{
        ModuleGraph, chunk_group_info::ChunkGroup, module_batch::ChunkableModuleOrBatch,
    },
    output::OutputAssetsWithReferenced,
    reference::ModuleReferences,
};

use crate::{
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkItemOptions, EcmascriptChunkPlaceable,
        EcmascriptExports, data::EcmascriptChunkData, ecmascript_chunk_item,
    },
    runtime_functions::{TURBOPACK_EXPORT_VALUE, TURBOPACK_LOAD},
    utils::{StringifyJs, StringifyModuleId},
};

/// The AsyncLoaderModule is a module that loads another module async, by
/// putting it into a separate chunk group.
#[turbo_tasks::value]
pub struct AsyncLoaderModule {
    pub inner: ResolvedVc<Box<dyn ChunkableModule>>,
    pub chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    pub availability_info: AvailabilityInfo,
}

#[turbo_tasks::value_impl]
impl AsyncLoaderModule {
    #[turbo_tasks::function]
    pub fn new(
        module: ResolvedVc<Box<dyn ChunkableModule>>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        availability_info: AvailabilityInfo,
    ) -> Vc<Self> {
        Self::cell(AsyncLoaderModule {
            inner: module,
            chunking_context,
            availability_info,
        })
    }

    #[turbo_tasks::function]
    pub async fn asset_ident_for(module: Vc<Box<dyn ChunkableModule>>) -> Result<Vc<AssetIdent>> {
        Ok(turbo_tasks::read!(module.ident().owned())?
            .with_modifier(rcstr!("async loader"))
            .into_vc())
    }

    #[turbo_tasks::function]
    pub(super) async fn chunk_group(
        &self,
        module_graph: Vc<ModuleGraph>,
    ) -> Result<Vc<OutputAssetsWithReferenced>> {
        if let Some(chunk_items) = self.availability_info.available_modules() {
            let inner_module = ResolvedVc::upcast(self.inner);
            let batches = turbo_tasks::read!(
                module_graph.module_batches(self.chunking_context.batching_config())
            )?;
            let module_or_batch = turbo_tasks::read!(batches.get_entry(inner_module))?;
            if let Some(chunkable_module_or_batch) =
                ChunkableModuleOrBatch::from_module_or_batch(module_or_batch)
                && *turbo_tasks::read!(chunk_items.get(chunkable_module_or_batch.into()))?
            {
                return Ok(OutputAssetsWithReferenced {
                    assets: ResolvedVc::cell(vec![]),
                    referenced_assets: ResolvedVc::cell(vec![]),
                    references: ResolvedVc::cell(vec![]),
                }
                .cell());
            }
        }
        Ok(self.chunking_context.chunk_group_assets(
            self.inner.ident(),
            ChunkGroup::Async(ResolvedVc::upcast(self.inner)),
            module_graph,
            self.availability_info,
        ))
    }

    #[turbo_tasks::function]
    async fn chunks_data(self: Vc<Self>, module_graph: Vc<ModuleGraph>) -> Result<Vc<ChunksData>> {
        let this = turbo_tasks::read!(self)?;
        let span = tracing::info_span!(
            "compute async chunks",
            name = turbo_tasks::read!(self.ident().to_string())?.as_str()
        );
        #[cfg(not(feature = "sync"))]
        let result = async move {
            Ok(ChunkData::from_assets(
                turbo_tasks::read!(this.chunking_context.output_root().owned())?,
                *turbo_tasks::read!(self.chunk_group(module_graph))?.assets,
            ))
        }
        .instrument(span)
        .await;
        #[cfg(feature = "sync")]
        let result = {
            let _enter = span.entered();
            Ok(ChunkData::from_assets(
                turbo_tasks::read!(this.chunking_context.output_root().owned())?,
                *turbo_tasks::read!(self.chunk_group(module_graph))?.assets,
            ))
        };
        result
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
            supports_arrow_functions: *turbo_tasks::read!(
                chunking_context
                    .environment()
                    .runtime_versions()
                    .supports_arrow_functions()
            )?,
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

        let this = turbo_tasks::read!(self)?;

        let id = if let Some(placeable) =
            ResolvedVc::try_downcast::<Box<dyn EcmascriptChunkPlaceable>>(this.inner)
        {
            Some(turbo_tasks::read!(
                placeable.chunk_item_id(chunking_context)
            )?)
        } else {
            None
        };
        let id = id.as_ref();

        let chunks_data = turbo_tasks::read!(self.chunks_data(module_graph))?;
        let chunks_data = turbo_tasks::parallel!(chunks_data.iter())?;
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
                formatdoc! {
                    r#"
                        {TURBOPACK_EXPORT_VALUE}((parentImport) => {{
                            return Promise.all({chunks:#}.map((chunk) => {TURBOPACK_LOAD}(chunk))).then(() => {{
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
    async fn chunk_item_content_ident(
        self: Vc<Self>,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
    ) -> Result<Vc<AssetIdent>> {
        let this = turbo_tasks::read!(self)?;

        let nested_async_availability =
            turbo_tasks::read!(this.chunking_context.is_nested_async_availability_enabled())?;

        let availability_ident = if *nested_async_availability {
            Some(
                turbo_tasks::read!(self.chunks_data(module_graph).hash())?
                    .to_string()
                    .into(),
            )
        } else {
            turbo_tasks::read!(this.availability_info.ident())?
        };

        Ok(if let Some(availability_ident) = availability_ident {
            turbo_tasks::read!(self.ident().owned())?
                .with_modifier(availability_ident)
                .into_vc()
        } else {
            self.ident()
        })
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
