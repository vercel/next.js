use anyhow::{Result, bail};
use turbo_rcstr::rcstr;
use turbo_tasks::{IntoTraitRef, ResolvedVc, Vc, fxindexmap};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    chunk::{
        AsyncModuleInfo, ChunkableModule, ChunkingContext, chunk_group::references_to_output_assets,
    },
    context::AssetContext,
    ident::AssetIdent,
    module::{Module, ModuleSideEffects, OptionModule},
    module_graph::ModuleGraph,
    output::OutputAssetsWithReferenced,
    reference::{ModuleReferences, SingleChunkableModuleReference},
    reference_type::ReferenceType,
    resolve::{ExportUsage, origin::ResolveOrigin, parse::Request},
    source::{OptionSource, Source},
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkPlaceable, EcmascriptExports,
        ecmascript_chunk_item,
    },
    references::async_module::OptionAsyncModule,
};

use crate::{
    loader::{compiling_loader_source, instantiating_loader_source},
    output_asset::WebAssemblyAsset,
    raw::RawWebAssemblyModuleAsset,
    source::WebAssemblySource,
};

/// Creates a javascript loader which instantiates the WebAssembly source and
/// re-exports its exports.
#[turbo_tasks::value]
#[derive(Clone)]
pub struct WebAssemblyModuleAsset {
    source: ResolvedVc<WebAssemblySource>,
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
}

#[turbo_tasks::value_impl]
impl WebAssemblyModuleAsset {
    #[turbo_tasks::function]
    pub fn new(
        source: ResolvedVc<WebAssemblySource>,
        asset_context: ResolvedVc<Box<dyn AssetContext>>,
    ) -> Vc<Self> {
        Self::cell(WebAssemblyModuleAsset {
            source,
            asset_context,
        })
    }

    #[turbo_tasks::function]
    fn wasm_asset(&self, chunking_context: Vc<Box<dyn ChunkingContext>>) -> Vc<WebAssemblyAsset> {
        WebAssemblyAsset::new(*self.source, chunking_context)
    }

    #[turbo_tasks::function]
    async fn loader_as_module(&self) -> Result<Vc<Box<dyn Module>>> {
        let query = &self.source.ident().await?.query;

        let loader_source = if query == "?module" {
            compiling_loader_source(*self.source)
        } else {
            instantiating_loader_source(*self.source)
        };

        let module = self.asset_context.process(
            loader_source,
            ReferenceType::Internal(ResolvedVc::cell(fxindexmap! {
                rcstr!("WASM_PATH") => ResolvedVc::upcast(RawWebAssemblyModuleAsset::new(*self.source, *self.asset_context).to_resolved().await?),
            })),
        ).module();

        Ok(module)
    }
    #[turbo_tasks::function]
    async fn loader_as_resolve_origin(self: Vc<Self>) -> Result<Vc<Box<dyn ResolveOrigin>>> {
        let module = self.loader_as_module();

        let Some(esm_asset) =
            ResolvedVc::try_sidecast::<Box<dyn ResolveOrigin>>(module.to_resolved().await?)
        else {
            bail!("WASM loader was not processed into an EcmascriptModuleAsset");
        };

        Ok(*esm_asset)
    }

    #[turbo_tasks::function]
    async fn loader(self: Vc<Self>) -> Result<Vc<Box<dyn EcmascriptChunkPlaceable>>> {
        let module = self.loader_as_module();

        let Some(esm_asset) = ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(
            module.to_resolved().await?,
        ) else {
            bail!("WASM loader was not processed into an EcmascriptModuleAsset");
        };

        Ok(*esm_asset)
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        Ok(Vc::cell(vec![ResolvedVc::upcast(
            SingleChunkableModuleReference::new(
                Vc::upcast(self.loader()),
                rcstr!("wasm loader"),
                ExportUsage::all(),
            )
            .to_resolved()
            .await?,
        )]))
    }
}

#[turbo_tasks::value_impl]
impl Module for WebAssemblyModuleAsset {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(self
            .source
            .ident()
            .with_modifier(rcstr!("wasm module"))
            .with_layer(self.asset_context.into_trait_ref().await?.layer()))
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionSource> {
        Vc::cell(Some(ResolvedVc::upcast(self.source)))
    }

    #[turbo_tasks::function]
    fn references(self: Vc<Self>) -> Vc<ModuleReferences> {
        self.loader().references()
    }

    #[turbo_tasks::function]
    fn is_self_async(self: Vc<Self>) -> Vc<bool> {
        Vc::cell(true)
    }

    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        // Both versions of this module have a top level await that instantiates a wasm module
        // wasm module instantiation can trigger arbitrary side effects from the native start
        // function
        ModuleSideEffects::SideEffectful.cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for WebAssemblyModuleAsset {
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
impl EcmascriptChunkPlaceable for WebAssemblyModuleAsset {
    #[turbo_tasks::function]
    fn get_exports(self: Vc<Self>) -> Vc<EcmascriptExports> {
        self.loader().get_exports()
    }

    #[turbo_tasks::function]
    fn get_async_module(self: Vc<Self>) -> Vc<OptionAsyncModule> {
        self.loader().get_async_module()
    }

    #[turbo_tasks::function]
    async fn chunk_item_content(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
        estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        // Delegate to the loader's chunk item content
        Ok(self.loader().chunk_item_content(
            chunking_context,
            module_graph,
            async_module_info,
            estimated,
        ))
    }

    #[turbo_tasks::function]
    async fn chunk_item_output_assets(
        self: Vc<Self>,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
        _module_graph: Vc<ModuleGraph>,
    ) -> Result<Vc<OutputAssetsWithReferenced>> {
        let loader_references = self.loader().references().await?;
        references_to_output_assets(&*loader_references).await
    }
}

#[turbo_tasks::value_impl]
impl ResolveOrigin for WebAssemblyModuleAsset {
    #[turbo_tasks::function]
    fn origin_path(&self) -> Vc<FileSystemPath> {
        self.source.ident().path()
    }

    #[turbo_tasks::function]
    fn asset_context(&self) -> Vc<Box<dyn AssetContext>> {
        *self.asset_context
    }

    #[turbo_tasks::function]
    fn get_inner_asset(self: Vc<Self>, request: Vc<Request>) -> Vc<OptionModule> {
        self.loader_as_resolve_origin().get_inner_asset(request)
    }
}
