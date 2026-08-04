use std::io::Write as _;

use anyhow::{Result, anyhow};
use indoc::writedoc;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{
    chunk::{
        AsyncModuleInfo, ChunkData, ChunkableModule, ChunkingContext, ChunksData,
        ModuleChunkItemIdExt,
    },
    ident::AssetIdent,
    module::{Module, ModuleSideEffects},
    module_graph::ModuleGraph,
    output::OutputAssetsWithReferenced,
    reference::ModuleReferences,
};

use super::chunk_asset::ManifestAsyncModule;
use crate::{
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkPlaceable, EcmascriptExports,
        data::EcmascriptChunkData, ecmascript_chunk_item,
    },
    runtime_functions::{TURBOPACK_EXPORT_VALUE, TURBOPACK_LOAD, TURBOPACK_REQUIRE},
    utils::{StringifyJs, StringifyModuleId},
};

fn modifier() -> RcStr {
    rcstr!("loader")
}

/// The manifest loader module is shipped in the same chunk that uses the dynamic
/// `import()` expression.
///
/// Its responsibility is to load the manifest chunk from the server. The
/// dynamic import has been rewritten to import this manifest loader module,
/// which will load the manifest chunk from the server, which will load all
/// the chunks needed by the dynamic import. Finally, we'll be able to import
/// the module we're trying to dynamically import.
///
/// Splitting the dynamic import into a quickly generate-able manifest loader
/// module and a slow-to-generate manifest chunk allows for faster incremental
/// compilation. The traversal won't be performed until the dynamic import is
/// actually reached, instead of eagerly as part of the chunk that the dynamic
/// import appears in.
#[turbo_tasks::value]
pub struct ManifestLoaderModule {
    pub manifest: ResolvedVc<ManifestAsyncModule>,
}

#[turbo_tasks::value_impl]
impl ManifestLoaderModule {
    #[turbo_tasks::function]
    pub fn new(manifest: ResolvedVc<ManifestAsyncModule>) -> Vc<Self> {
        Self::cell(ManifestLoaderModule { manifest })
    }

    #[turbo_tasks::function]
    pub async fn chunks_data(self: Vc<Self>) -> Result<Vc<ChunksData>> {
        let this = turbo_tasks::read!(self)?;
        let manifest = turbo_tasks::read!(this.manifest)?;
        let chunks = turbo_tasks::read!(this.manifest.manifest_chunk_group())?.assets;
        Ok(ChunkData::from_assets(
            turbo_tasks::read!(manifest.chunking_context.output_root().owned())?,
            *chunks,
        ))
    }

    #[turbo_tasks::function]
    pub async fn asset_ident_for(module: Vc<Box<dyn ChunkableModule>>) -> Result<Vc<AssetIdent>> {
        Ok(turbo_tasks::read!(module.ident().owned())?
            .with_modifier(modifier())
            .into_vc())
    }
}

#[turbo_tasks::value_impl]
impl Module for ManifestLoaderModule {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(turbo_tasks::read!(self.manifest.module_ident().owned())?
            .with_modifier(modifier())
            .into_vc())
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<turbopack_core::source::OptionSource> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<ModuleReferences> {
        Vc::cell(vec![])
    }

    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        ModuleSideEffects::SideEffectFree.cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for ManifestLoaderModule {
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
impl EcmascriptChunkPlaceable for ManifestLoaderModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::Value.cell()
    }

    #[turbo_tasks::function]
    async fn chunk_item_content(
        self: Vc<Self>,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
        _module_graph: Vc<ModuleGraph>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
        _estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let this = turbo_tasks::read!(self)?;
        let mut code = Vec::new();

        let manifest = turbo_tasks::read!(this.manifest)?;

        // We need several items in order for a dynamic import to fully load. First, we
        // need the chunk path of the manifest chunk, relative from the output root. The
        // chunk is a servable file, which will contain the manifest chunk item, which
        // will perform the actual chunk traversal and generate load statements.
        let chunks_server_data =
            &*turbo_tasks::parallel!(turbo_tasks::read!(self.chunks_data())?.iter())?;

        // We also need the manifest chunk item's id, which points to a CJS module that
        // exports a promise for all of the necessary chunk loads.
        let item_id = turbo_tasks::read!(this.manifest.chunk_item_id(*manifest.chunking_context))?;

        // Finally, we need the id of the module that we're actually trying to
        // dynamically import.
        let placeable =
            ResolvedVc::try_downcast::<Box<dyn EcmascriptChunkPlaceable>>(manifest.inner)
                .ok_or_else(|| anyhow!("asset is not placeable in ecmascript chunk"))?;
        let dynamic_id = turbo_tasks::read!(placeable.chunk_item_id(*manifest.chunking_context))?;

        // This is the code that will be executed when the dynamic import is reached.
        // It will load the manifest chunk, which will load all the chunks needed by
        // the dynamic import, and finally we'll be able to import the module we're
        // trying to dynamically import.
        // This is similar to what happens when the first evaluated chunk is executed
        // on first page load, but it's happening on-demand instead of eagerly.
        writedoc!(
            code,
            r#"
                {TURBOPACK_EXPORT_VALUE}((parentImport) => {{
                    return Promise.all({chunks_server_data}.map((chunk) => {TURBOPACK_LOAD}(chunk))).then(() => {{
                        return {TURBOPACK_REQUIRE}({item_id});
                    }}).then((chunks) => {{
                        return Promise.all(chunks.map((chunk) => {TURBOPACK_LOAD}(chunk)));
                    }}).then(() => {{
                        return parentImport({dynamic_id});
                    }});
                }});
            "#,
            chunks_server_data = StringifyJs(
                &chunks_server_data
                    .iter()
                    .map(|chunk_data| EcmascriptChunkData::new(chunk_data))
                    .collect::<Vec<_>>()
            ),
            item_id = StringifyModuleId(&item_id),
            dynamic_id = StringifyModuleId(&dynamic_id),
        )?;

        Ok(EcmascriptChunkItemContent {
            inner_code: code.into(),
            ..Default::default()
        }
        .cell())
    }

    #[turbo_tasks::function]
    fn chunk_item_content_ident(
        self: Vc<Self>,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
        _module_graph: Vc<ModuleGraph>,
    ) -> Vc<AssetIdent> {
        self.content_ident()
    }

    #[turbo_tasks::function]
    fn chunk_item_output_assets(
        &self,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
        _module_graph: Vc<ModuleGraph>,
    ) -> Vc<OutputAssetsWithReferenced> {
        self.manifest.manifest_chunk_group()
    }
}

#[turbo_tasks::value_impl]
impl ManifestLoaderModule {
    #[turbo_tasks::function]
    pub async fn content_ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(turbo_tasks::read!(self.manifest.content_ident().owned())?
            .with_modifier(modifier())
            .into_vc())
    }
}
