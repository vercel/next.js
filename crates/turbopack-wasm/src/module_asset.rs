use anyhow::{bail, Result};
use indexmap::indexmap;
use turbo_tasks::{Value, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        availability_info::AvailabilityInfo, Chunk, ChunkItem, ChunkableModule, ChunkingContext,
    },
    context::AssetContext,
    ident::AssetIdent,
    module::{Module, OptionModule},
    reference::ModuleReferences,
    reference_type::ReferenceType,
    resolve::{origin::ResolveOrigin, parse::Request},
    source::Source,
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunk, EcmascriptChunkItem, EcmascriptChunkItemContent,
        EcmascriptChunkItemOptions, EcmascriptChunkPlaceable, EcmascriptChunkingContext,
        EcmascriptExports,
    },
    references::async_module::OptionAsyncModule,
    EcmascriptModuleAsset,
};

use crate::{
    loader::loader_source, output_asset::WebAssemblyAsset, raw::RawWebAssemblyModuleAsset,
    source::WebAssemblySource,
};

#[turbo_tasks::function]
fn modifier() -> Vc<String> {
    Vc::cell("wasm module".to_string())
}

/// Creates a javascript loader which instantiates the WebAssembly source and
/// re-exports its exports.
#[turbo_tasks::value]
#[derive(Clone)]
pub struct WebAssemblyModuleAsset {
    source: Vc<WebAssemblySource>,
    asset_context: Vc<Box<dyn AssetContext>>,
}

#[turbo_tasks::value_impl]
impl WebAssemblyModuleAsset {
    #[turbo_tasks::function]
    pub fn new(
        source: Vc<WebAssemblySource>,
        asset_context: Vc<Box<dyn AssetContext>>,
    ) -> Vc<Self> {
        Self::cell(WebAssemblyModuleAsset {
            source,
            asset_context,
        })
    }

    #[turbo_tasks::function]
    fn wasm_asset(&self, chunking_context: Vc<Box<dyn ChunkingContext>>) -> Vc<WebAssemblyAsset> {
        WebAssemblyAsset::new(self.source, chunking_context)
    }

    #[turbo_tasks::function]
    async fn loader(self: Vc<Self>) -> Result<Vc<EcmascriptModuleAsset>> {
        let this = self.await?;

        let module = this.asset_context.process(
            loader_source(this.source),
            Value::new(ReferenceType::Internal(Vc::cell(indexmap! {
                "WASM_PATH".to_string() => Vc::upcast(RawWebAssemblyModuleAsset::new(this.source, this.asset_context)),
            }))),
        );

        let Some(esm_asset) =
            Vc::try_resolve_downcast_type::<EcmascriptModuleAsset>(module).await?
        else {
            bail!("WASM loader was not processed into an EcmascriptModuleAsset");
        };

        Ok(esm_asset)
    }
}

#[turbo_tasks::value_impl]
impl Module for WebAssemblyModuleAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.source.ident().with_modifier(modifier())
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Vc<ModuleReferences> {
        self.loader().references()
    }
}

#[turbo_tasks::value_impl]
impl Asset for WebAssemblyModuleAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for WebAssemblyModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk(
        self: Vc<Self>,
        context: Vc<Box<dyn ChunkingContext>>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<Box<dyn Chunk>> {
        Vc::upcast(EcmascriptChunk::new(
            context,
            Vc::upcast(self),
            availability_info,
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for WebAssemblyModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: Vc<Self>,
        context: Vc<Box<dyn EcmascriptChunkingContext>>,
    ) -> Vc<Box<dyn EcmascriptChunkItem>> {
        Vc::upcast(
            ModuleChunkItem {
                module: self,
                context,
            }
            .cell(),
        )
    }

    #[turbo_tasks::function]
    fn get_exports(self: Vc<Self>) -> Vc<EcmascriptExports> {
        self.loader().get_exports()
    }

    #[turbo_tasks::function]
    fn get_async_module(self: Vc<Self>) -> Vc<OptionAsyncModule> {
        self.loader().get_async_module()
    }
}

#[turbo_tasks::value_impl]
impl ResolveOrigin for WebAssemblyModuleAsset {
    #[turbo_tasks::function]
    fn origin_path(&self) -> Vc<FileSystemPath> {
        self.source.ident().path()
    }

    #[turbo_tasks::function]
    fn context(&self) -> Vc<Box<dyn AssetContext>> {
        self.asset_context
    }

    #[turbo_tasks::function]
    fn get_inner_asset(self: Vc<Self>, request: Vc<Request>) -> Vc<OptionModule> {
        self.loader().get_inner_asset(request)
    }
}

#[turbo_tasks::value]
struct ModuleChunkItem {
    module: Vc<WebAssemblyModuleAsset>,
    context: Vc<Box<dyn EcmascriptChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl ChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        let loader = self.module.loader().as_chunk_item(self.context);

        Ok(loader.references())
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn EcmascriptChunkingContext>> {
        self.context
    }

    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<EcmascriptChunkItemContent> {
        self.content_with_availability_info(Value::new(AvailabilityInfo::Untracked))
    }

    #[turbo_tasks::function]
    async fn content_with_availability_info(
        &self,
        availability_info: Value<AvailabilityInfo>,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let loader_asset = self.module.loader();

        let chunk_item_content = loader_asset
            .as_chunk_item(self.context)
            .content_with_availability_info(availability_info)
            .await?;

        Ok(EcmascriptChunkItemContent {
            options: EcmascriptChunkItemOptions {
                wasm: true,
                ..chunk_item_content.options.clone()
            },
            ..chunk_item_content.clone_value()
        }
        .into())
    }
}
