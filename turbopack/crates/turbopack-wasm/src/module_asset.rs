use anyhow::{bail, Context, Result};
use turbo_rcstr::RcStr;
use turbo_tasks::{fxindexmap, ResolvedVc, Value, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        chunk_group::references_to_output_assets, AsyncModuleInfo, ChunkItem, ChunkType,
        ChunkableModule, ChunkingContext,
    },
    context::AssetContext,
    ident::AssetIdent,
    module::{Module, OptionModule},
    output::OutputAssets,
    reference::{ModuleReferences, SingleChunkableModuleReference},
    reference_type::ReferenceType,
    resolve::{origin::ResolveOrigin, parse::Request},
    source::Source,
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemOptions,
        EcmascriptChunkPlaceable, EcmascriptChunkType, EcmascriptExports,
    },
    references::async_module::OptionAsyncModule,
};

use crate::{
    loader::{compiling_loader_source, instantiating_loader_source},
    output_asset::WebAssemblyAsset,
    raw::RawWebAssemblyModuleAsset,
    source::WebAssemblySource,
};

#[turbo_tasks::function]
fn modifier() -> Vc<RcStr> {
    Vc::cell("wasm module".into())
}

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
    async fn loader_as_module(self: Vc<Self>) -> Result<Vc<Box<dyn Module>>> {
        let this = self.await?;
        let query = &*this.source.ident().query().await?;

        let loader_source = if query == "?module" {
            compiling_loader_source(*this.source)
        } else {
            instantiating_loader_source(*this.source)
        };

        let module = this.asset_context.process(
            loader_source,
            Value::new(ReferenceType::Internal(ResolvedVc::cell(fxindexmap! {
                "WASM_PATH".into() => ResolvedVc::upcast(RawWebAssemblyModuleAsset::new(*this.source, *this.asset_context).to_resolved().await?),
            }))),
        ).module();

        Ok(module)
    }
    #[turbo_tasks::function]
    async fn loader_as_resolve_origin(self: Vc<Self>) -> Result<Vc<Box<dyn ResolveOrigin>>> {
        let module = self.loader_as_module();

        let Some(esm_asset) = Vc::try_resolve_sidecast::<Box<dyn ResolveOrigin>>(module).await?
        else {
            bail!("WASM loader was not processed into an EcmascriptModuleAsset");
        };

        Ok(esm_asset)
    }

    #[turbo_tasks::function]
    async fn loader(self: Vc<Self>) -> Result<Vc<Box<dyn EcmascriptChunkPlaceable>>> {
        let module = self.loader_as_module();

        let Some(esm_asset) =
            Vc::try_resolve_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(module).await?
        else {
            bail!("WASM loader was not processed into an EcmascriptModuleAsset");
        };

        Ok(esm_asset)
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        Ok(Vc::cell(vec![ResolvedVc::upcast(
            SingleChunkableModuleReference::new(
                Vc::upcast(self.loader()),
                Vc::cell("wasm loader".into()),
            )
            .to_resolved()
            .await?,
        )]))
    }
}

#[turbo_tasks::value_impl]
impl Module for WebAssemblyModuleAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.source
            .ident()
            .with_modifier(modifier())
            .with_layer(self.asset_context.layer())
    }

    #[turbo_tasks::function]
    fn references(self: Vc<Self>) -> Vc<ModuleReferences> {
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
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        Vc::upcast(
            ModuleChunkItem {
                module: self,
                chunking_context,
            }
            .cell(),
        )
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

#[turbo_tasks::value]
struct ModuleChunkItem {
    module: ResolvedVc<WebAssemblyModuleAsset>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl ChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<OutputAssets>> {
        let loader_references = self.module.loader().references().await?;
        references_to_output_assets(loader_references.iter().map(|r| **r).collect::<_>()).await
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        Vc::upcast(*self.chunking_context)
    }

    #[turbo_tasks::function]
    async fn ty(&self) -> Result<Vc<Box<dyn ChunkType>>> {
        Ok(Vc::upcast(
            Vc::<EcmascriptChunkType>::default().resolve().await?,
        ))
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        Vc::upcast(*self.module)
    }

    #[turbo_tasks::function]
    fn is_self_async(self: Vc<Self>) -> Vc<bool> {
        Vc::cell(true)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
    }

    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<EcmascriptChunkItemContent> {
        panic!("content() should not be called");
    }

    #[turbo_tasks::function]
    async fn content_with_async_module_info(
        &self,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let loader_asset = self.module.loader();
        let item = loader_asset.as_chunk_item(Vc::upcast(*self.chunking_context));

        let ecmascript_item = Vc::try_resolve_downcast::<Box<dyn EcmascriptChunkItem>>(item)
            .await?
            .context("EcmascriptModuleAsset must implement EcmascriptChunkItem")?;

        let chunk_item_content = ecmascript_item
            .content_with_async_module_info(async_module_info)
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
