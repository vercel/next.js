use anyhow::{Context, Result};
use indoc::formatdoc;
use turbo_tasks::{TryJoinIterExt, ValueToString, Vc};
use turbopack_binding::{
    turbo::tasks_fs::FileSystemPath,
    turbopack::{
        core::{
            asset::{Asset, AssetContent},
            chunk::{
                ChunkData, ChunkItem, ChunkItemExt, ChunkType, ChunkableModule,
                ChunkableModuleReference, ChunkingContext, ChunkingContextExt, ChunksData,
            },
            ident::AssetIdent,
            module::Module,
            output::{OutputAsset, OutputAssets},
            proxied_asset::ProxiedAsset,
            reference::{ModuleReference, ModuleReferences, SingleOutputAssetReference},
            resolve::ModuleResolveResult,
        },
        ecmascript::chunk::{EcmascriptChunkData, EcmascriptChunkType},
        turbopack::ecmascript::{
            chunk::{
                EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkPlaceable,
                EcmascriptChunkingContext, EcmascriptExports,
            },
            utils::StringifyJs,
        },
    },
};

#[turbo_tasks::function]
fn modifier() -> Vc<String> {
    Vc::cell("client chunks".to_string())
}

#[turbo_tasks::value(shared)]
pub struct WithClientChunksAsset {
    pub asset: Vc<Box<dyn EcmascriptChunkPlaceable>>,
    pub server_root: Vc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl Module for WithClientChunksAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.asset.ident().with_modifier(modifier())
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<ModuleReferences> {
        Vc::cell(vec![Vc::upcast(
            WithClientChunksAssetReference {
                asset: Vc::upcast(self.asset),
            }
            .cell(),
        )])
    }
}

#[turbo_tasks::value_impl]
impl Asset for WithClientChunksAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        unimplemented!()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for WithClientChunksAsset {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<Box<dyn turbopack_binding::turbopack::core::chunk::ChunkItem>>> {
        let context = Vc::try_resolve_sidecast::<Box<dyn EcmascriptChunkingContext>>(
            chunking_context.with_layer("rsc".to_string()),
        )
        .await?
        .context(
            "ChunkingContext::with_layer should not return a different kind of chunking context",
        )?;
        Ok(Vc::upcast(
            WithClientChunksChunkItem {
                context,
                inner: self,
            }
            .cell(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for WithClientChunksAsset {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        // TODO This should be EsmExports
        EcmascriptExports::Value.cell()
    }
}

#[turbo_tasks::value]
struct WithClientChunksChunkItem {
    context: Vc<Box<dyn EcmascriptChunkingContext>>,
    inner: Vc<WithClientChunksAsset>,
}

#[turbo_tasks::value_impl]
impl WithClientChunksChunkItem {
    #[turbo_tasks::function]
    async fn chunks(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;
        let inner = this.inner.await?;
        Ok(this.context.root_chunk_group(Vc::upcast(inner.asset)))
    }

    #[turbo_tasks::function]
    async fn client_chunks(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;
        let inner = this.inner.await?;
        let chunks = self.chunks();
        let output_root = this.context.output_root().await?;

        let mut client_chunks = Vec::new();
        for &chunk in &*chunks.await? {
            let extension = chunk.ident().path().extension().await?;
            // Only expose CSS chunks as client chunks.
            if &*extension == "css" {
                if let Some(path) = output_root.get_path_to(&*chunk.ident().path().await?) {
                    client_chunks.push(Vc::upcast(ProxiedAsset::new(
                        Vc::upcast(chunk),
                        inner.server_root.join(path.to_string()),
                    )));
                }
            }
        }

        Ok(Vc::cell(client_chunks))
    }

    #[turbo_tasks::function]
    async fn chunks_data(self: Vc<Self>) -> Result<Vc<ChunksData>> {
        let this = self.await?;
        let inner = this.inner.await?;
        Ok(ChunkData::from_assets(
            inner.server_root,
            self.client_chunks(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for WithClientChunksChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn EcmascriptChunkingContext>> {
        self.context
    }

    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<EcmascriptChunkItemContent>> {
        let this = self.await?;
        let inner = this.inner.await?;

        let chunks_data = self.chunks_data().await?;
        let chunks_data = chunks_data.iter().try_join().await?;
        let chunks_data: Vec<_> = chunks_data
            .iter()
            .map(|chunk_data| EcmascriptChunkData::new(chunk_data))
            .collect();

        let module_id = inner
            .asset
            .as_chunk_item(Vc::upcast(this.context))
            .id()
            .await?;
        Ok(EcmascriptChunkItemContent {
            inner_code: formatdoc!(
                // We store the chunks in a binding, otherwise a new array would be created every
                // time the export binding is read.
                r#"
                    __turbopack_esm__({{
                        default: () => __turbopack_import__({}),
                        chunks: () => chunks,
                    }});
                    const chunks = {:#};
                "#,
                StringifyJs(&module_id),
                StringifyJs(&chunks_data),
            )
            .into(),
            ..Default::default()
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for WithClientChunksChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.inner.ident()
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        let this = self.await?;
        let inner = this.inner.await?;
        let mut references = Vec::new();
        references.push(Vc::upcast(
            WithClientChunksAssetReference {
                asset: Vc::upcast(inner.asset),
            }
            .cell(),
        ));
        let client_chunks = self.client_chunks();
        let client_chunks = client_chunks.await?;
        let client_chunk = Vc::cell("client chunk".to_string());
        for &chunk in client_chunks.iter() {
            references.push(Vc::upcast(SingleOutputAssetReference::new(
                chunk,
                client_chunk,
            )));
        }
        let chunk_data_key = Vc::cell("chunk data".to_string());
        for chunk_data in &*self.chunks_data().await? {
            references.extend(chunk_data.references().await?.iter().map(|&output_asset| {
                Vc::upcast(SingleOutputAssetReference::new(
                    output_asset,
                    chunk_data_key,
                ))
            }));
        }
        Ok(Vc::cell(references))
    }

    #[turbo_tasks::function]
    async fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        Vc::upcast(self.context)
    }

    #[turbo_tasks::function]
    fn ty(&self) -> Vc<Box<dyn ChunkType>> {
        Vc::upcast(Vc::<EcmascriptChunkType>::default())
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        Vc::upcast(self.inner)
    }
}

#[turbo_tasks::value]
struct WithClientChunksAssetReference {
    asset: Vc<Box<dyn Module>>,
}

#[turbo_tasks::value_impl]
impl ValueToString for WithClientChunksAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<String>> {
        Ok(Vc::cell(format!(
            "local asset {}",
            self.asset.ident().to_string().await?
        )))
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for WithClientChunksAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        ModuleResolveResult::module(self.asset).cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for WithClientChunksAssetReference {}
