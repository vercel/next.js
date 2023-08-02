//! WebAssembly support for turbopack.
//!
//! WASM assets are copied directly to the output folder.
//!
//! When imported from ES modules, they produce a thin module that loads and
//! instantiates the WebAssembly module.

#![feature(min_specialization)]
#![feature(arbitrary_self_types)]
#![feature(async_fn_in_trait)]

use anyhow::{bail, Result};
use indexmap::IndexSet;
use turbo_tasks::{Value, ValueToString, Vc};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        availability_info::AvailabilityInfo, Chunk, ChunkItem, ChunkableModule, ChunkingContext,
    },
    context::AssetContext,
    ident::AssetIdent,
    module::Module,
    output::OutputAsset,
    reference::{ModuleReferences, SingleOutputAssetReference},
    source::Source,
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunk, EcmascriptChunkItem, EcmascriptChunkItemContent,
        EcmascriptChunkItemOptions, EcmascriptChunkPlaceable, EcmascriptChunkingContext,
        EcmascriptExports,
    },
    references::async_module::{AsyncModule, OptionAsyncModule},
    utils::StringifyJs,
};

#[turbo_tasks::function]
fn modifier() -> Vc<String> {
    Vc::cell("wasm".to_string())
}

#[turbo_tasks::value]
#[derive(Clone)]
pub struct WebAssemblyModuleAsset {
    pub source: Vc<Box<dyn Source>>,
    pub context: Vc<Box<dyn AssetContext>>,
}

#[turbo_tasks::value_impl]
impl WebAssemblyModuleAsset {
    #[turbo_tasks::function]
    pub fn new(source: Vc<Box<dyn Source>>, context: Vc<Box<dyn AssetContext>>) -> Vc<Self> {
        Self::cell(WebAssemblyModuleAsset { source, context })
    }

    #[turbo_tasks::function]
    async fn wasm_asset(
        self: Vc<Self>,
        context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<WebAssemblyAsset>> {
        Ok(WebAssemblyAsset::cell(WebAssemblyAsset {
            context,
            source: self.await?.source,
        }))
    }
}

#[turbo_tasks::value_impl]
impl Module for WebAssemblyModuleAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.source.ident().with_modifier(modifier())
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
        Vc::upcast(ModuleChunkItem::cell(ModuleChunkItem {
            module: self,
            context,
            wasm_asset: self.wasm_asset(Vc::upcast(context)),
        }))
    }

    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::DynamicNamespace.into()
    }

    #[turbo_tasks::function]
    fn get_async_module(self: Vc<Self>) -> Vc<OptionAsyncModule> {
        Vc::cell(Some(
            AsyncModule {
                placeable: Vc::upcast(self),
                references: IndexSet::new(),
                has_top_level_await: true,
            }
            .cell(),
        ))
    }
}

#[turbo_tasks::value]
struct WebAssemblyAsset {
    context: Vc<Box<dyn ChunkingContext>>,
    source: Vc<Box<dyn Source>>,
}

#[turbo_tasks::value_impl]
impl OutputAsset for WebAssemblyAsset {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        let ident = self.source.ident().with_modifier(modifier());

        let asset_path = self.context.chunk_path(ident, ".wasm".to_string());

        Ok(AssetIdent::from_path(asset_path))
    }
}

#[turbo_tasks::value_impl]
impl Asset for WebAssemblyAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}

#[turbo_tasks::value]
struct ModuleChunkItem {
    module: Vc<WebAssemblyModuleAsset>,
    context: Vc<Box<dyn EcmascriptChunkingContext>>,
    wasm_asset: Vc<WebAssemblyAsset>,
}

#[turbo_tasks::value_impl]
impl ChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        Ok(Vc::cell(vec![Vc::upcast(SingleOutputAssetReference::new(
            Vc::upcast(self.wasm_asset),
            Vc::cell(format!(
                "wasm(loader) {}",
                self.wasm_asset.ident().to_string().await?
            )),
        ))]))
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
        let path = self.wasm_asset.ident().path().await?;
        let output_root = self.context.output_root().await?;

        let Some(path) = output_root.get_path_to(&path) else {
            bail!("WASM asset ident is not relative to output root");
        };

        let code = format!(
            "__turbopack_dynamic__(await __turbopack_wasm__({path}));",
            path = StringifyJs(path)
        )
        .into();

        let options = EcmascriptChunkItemOptions {
            async_module: self
                .module
                .get_async_module()
                .module_options(availability_info)
                .await?
                .clone_value(),
            wasm: true,
            ..Default::default()
        };

        Ok(EcmascriptChunkItemContent {
            inner_code: code,
            options,
            ..Default::default()
        }
        .into())
    }
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    turbopack_ecmascript::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
