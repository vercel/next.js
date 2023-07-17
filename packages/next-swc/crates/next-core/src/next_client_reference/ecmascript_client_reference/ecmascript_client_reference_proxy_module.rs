use std::{io::Write, iter::once};

use anyhow::{bail, Result};
use indoc::writedoc;
use turbo_tasks::{Value, ValueToString, Vc};
use turbo_tasks_fs::File;
use turbopack_binding::turbopack::{
    core::{
        asset::{Asset, AssetContent},
        chunk::{
            availability_info::AvailabilityInfo, Chunk, ChunkItem, ChunkableModule, ChunkingContext,
        },
        code_builder::CodeBuilder,
        context::AssetContext,
        ident::AssetIdent,
        module::Module,
        reference::{AssetReferences, SingleAssetReference},
        reference_type::ReferenceType,
        virtual_source::VirtualSource,
    },
    ecmascript::{
        chunk::{
            EcmascriptChunk, EcmascriptChunkItem, EcmascriptChunkItemContent,
            EcmascriptChunkPlaceable, EcmascriptChunkingContext, EcmascriptExports,
        },
        utils::StringifyJs,
        EcmascriptModuleAsset,
    },
};

use super::ecmascript_client_reference_module::EcmascriptClientReferenceModule;

/// A [`EcmascriptClientReferenceProxyModule`] is used in RSC to represent
/// a client or SSR asset.
#[turbo_tasks::value(transparent)]
pub struct EcmascriptClientReferenceProxyModule {
    server_module_ident: Vc<AssetIdent>,
    server_asset_context: Vc<Box<dyn AssetContext>>,
    client_module: Vc<Box<dyn EcmascriptChunkPlaceable>>,
    ssr_module: Vc<Box<dyn EcmascriptChunkPlaceable>>,
}

#[turbo_tasks::value_impl]
impl EcmascriptClientReferenceProxyModule {
    /// Create a new [`EcmascriptClientReferenceProxyModule`].
    ///
    /// # Arguments
    ///
    /// * `server_module_ident` - The identifier of the server module.
    /// * `server_asset_context` - The context of the server module.
    /// * `client_module` - The client module.
    /// * `ssr_module` - The SSR module.
    #[turbo_tasks::function]
    pub fn new(
        server_module_ident: Vc<AssetIdent>,
        server_asset_context: Vc<Box<dyn AssetContext>>,
        client_module: Vc<Box<dyn EcmascriptChunkPlaceable>>,
        ssr_module: Vc<Box<dyn EcmascriptChunkPlaceable>>,
    ) -> Vc<EcmascriptClientReferenceProxyModule> {
        EcmascriptClientReferenceProxyModule {
            server_module_ident,
            server_asset_context,
            client_module,
            ssr_module,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn proxy_module_asset(self: Vc<Self>) -> Result<Vc<EcmascriptModuleAsset>> {
        let this = self.await?;
        let mut code = CodeBuilder::default();

        // Adapted from
        // next.js/packages/next/src/build/webpack/loaders/next-flight-loader/index.ts
        writedoc!(
            code,
            r#"
                import {{ createProxy }} from 'next/dist/build/webpack/loaders/next-flight-loader/module-proxy'

                const proxy = createProxy({server_module_path})

                // Accessing the __esModule property and exporting $$typeof are required here.
                // The __esModule getter forces the proxy target to create the default export
                // and the $$typeof value is for rendering logic to determine if the module
                // is a client boundary.
                const {{ __esModule, $$typeof }} = proxy;
                
                export {{ __esModule, $$typeof }};
                export default proxy;
            "#,
            server_module_path = StringifyJs(&this.server_module_ident.path().to_string().await?)
        )?;

        let code = code.build();
        let proxy_module_asset_content =
            AssetContent::file(File::from(code.source_code().clone()).into());

        let proxy_source = VirtualSource::new(
            this.server_module_ident.path().join("proxy.ts".to_string()),
            proxy_module_asset_content,
        );

        let proxy_module = this.server_asset_context.process(
            Vc::upcast(proxy_source),
            Value::new(ReferenceType::Undefined),
        );

        let Some(proxy_module) =
            Vc::try_resolve_downcast_type::<EcmascriptModuleAsset>(proxy_module).await?
        else {
            bail!("proxy asset is not an ecmascript module");
        };

        Ok(proxy_module)
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptClientReferenceProxyModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.server_module_ident
            .with_modifier(client_proxy_modifier())
    }

    #[turbo_tasks::function]
    fn content(&self) -> Result<Vc<AssetContent>> {
        bail!("proxy module asset has no content")
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<AssetReferences>> {
        let EcmascriptClientReferenceProxyModule {
            server_module_ident,
            server_asset_context: _,
            client_module,
            ssr_module,
        } = &*self.await?;

        let references: Vec<_> = self
            .proxy_module_asset()
            .references()
            .await?
            .iter()
            .copied()
            .chain(once(Vc::upcast(SingleAssetReference::new(
                Vc::upcast(EcmascriptClientReferenceModule::new(
                    *server_module_ident,
                    *client_module,
                    *ssr_module,
                )),
                client_reference_description(),
            ))))
            .collect();

        Ok(Vc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl Module for EcmascriptClientReferenceProxyModule {}

#[turbo_tasks::value_impl]
impl ChunkableModule for EcmascriptClientReferenceProxyModule {
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
impl EcmascriptChunkPlaceable for EcmascriptClientReferenceProxyModule {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
    ) -> Vc<Box<dyn EcmascriptChunkItem>> {
        Vc::upcast(
            ProxyModuleChunkItem {
                client_proxy_asset: self,
                inner_proxy_module_chunk_item: self
                    .proxy_module_asset()
                    .as_chunk_item(chunking_context),
                chunking_context,
            }
            .cell(),
        )
    }

    #[turbo_tasks::function]
    fn get_exports(self: Vc<Self>) -> Vc<EcmascriptExports> {
        self.proxy_module_asset().get_exports()
    }
}

/// This wrapper only exists to overwrite the `asset_ident` method of the
/// wrapped [`Vc<Box<dyn EcmascriptChunkItem>>`]. Otherwise, the asset ident of
/// the chunk item would not be the same as the asset ident of the
/// [`Vc<EcmascriptClientReferenceProxyModule>`].
#[turbo_tasks::value]
struct ProxyModuleChunkItem {
    client_proxy_asset: Vc<EcmascriptClientReferenceProxyModule>,
    inner_proxy_module_chunk_item: Vc<Box<dyn EcmascriptChunkItem>>,
    chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
}

#[turbo_tasks::function]
fn client_proxy_modifier() -> Vc<String> {
    Vc::cell("client proxy".to_string())
}

#[turbo_tasks::function]
fn client_reference_description() -> Vc<String> {
    Vc::cell("client references".to_string())
}

#[turbo_tasks::value_impl]
impl ChunkItem for ProxyModuleChunkItem {
    #[turbo_tasks::function]
    async fn asset_ident(&self) -> Vc<AssetIdent> {
        self.client_proxy_asset.ident()
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<AssetReferences> {
        self.client_proxy_asset.references()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ProxyModuleChunkItem {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<EcmascriptChunkItemContent> {
        self.inner_proxy_module_chunk_item.content()
    }

    #[turbo_tasks::function]
    fn content_with_availability_info(
        &self,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<EcmascriptChunkItemContent> {
        self.inner_proxy_module_chunk_item
            .content_with_availability_info(availability_info)
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn EcmascriptChunkingContext>> {
        self.inner_proxy_module_chunk_item.chunking_context()
    }
}
