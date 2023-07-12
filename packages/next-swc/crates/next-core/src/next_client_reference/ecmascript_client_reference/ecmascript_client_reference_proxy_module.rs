use std::{io::Write, iter::once};

use anyhow::{bail, Result};
use indoc::writedoc;
use turbo_tasks::{primitives::StringVc, Value, ValueToString};
use turbo_tasks_fs::File;
use turbopack_binding::turbopack::{
    core::{
        asset::{Asset, AssetContentVc, AssetVc},
        chunk::{
            availability_info::AvailabilityInfo, ChunkItem, ChunkItemVc, ChunkVc, ChunkableModule,
            ChunkableModuleVc, ChunkingContextVc,
        },
        code_builder::CodeBuilder,
        context::{AssetContext, AssetContextVc},
        ident::AssetIdentVc,
        module::{Module, ModuleVc},
        reference::{AssetReferencesVc, SingleAssetReferenceVc},
        reference_type::ReferenceType,
        virtual_source::VirtualSourceVc,
    },
    ecmascript::{
        chunk::{
            EcmascriptChunkItem, EcmascriptChunkItemContentVc, EcmascriptChunkItemVc,
            EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc, EcmascriptChunkVc,
            EcmascriptChunkingContextVc, EcmascriptExportsVc,
        },
        utils::StringifyJs,
        EcmascriptModuleAssetVc,
    },
};

use super::ecmascript_client_reference_module::EcmascriptClientReferenceModuleVc;

/// A [`EcmascriptClientReferenceProxyModule`] is used in RSC to represent
/// a client or SSR asset.
#[turbo_tasks::value(transparent)]
pub struct EcmascriptClientReferenceProxyModule {
    server_module_ident: AssetIdentVc,
    server_asset_context: AssetContextVc,
    client_module: EcmascriptChunkPlaceableVc,
    ssr_module: EcmascriptChunkPlaceableVc,
}

#[turbo_tasks::value_impl]
impl EcmascriptClientReferenceProxyModuleVc {
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
        server_module_ident: AssetIdentVc,
        server_asset_context: AssetContextVc,
        client_module: EcmascriptChunkPlaceableVc,
        ssr_module: EcmascriptChunkPlaceableVc,
    ) -> EcmascriptClientReferenceProxyModuleVc {
        EcmascriptClientReferenceProxyModule {
            server_module_ident,
            server_asset_context,
            client_module,
            ssr_module,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn proxy_module_asset(self) -> Result<EcmascriptModuleAssetVc> {
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
            AssetContentVc::from(File::from(code.source_code().clone()));

        let proxy_source = VirtualSourceVc::new(
            this.server_module_ident.path().join("proxy.ts"),
            proxy_module_asset_content,
        );

        let proxy_module = this
            .server_asset_context
            .process(proxy_source.into(), Value::new(ReferenceType::Undefined));

        let Some(proxy_module) = EcmascriptModuleAssetVc::resolve_from(&proxy_module).await? else {
            bail!("proxy asset is not an ecmascript module");
        };

        Ok(proxy_module)
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptClientReferenceProxyModule {
    #[turbo_tasks::function]
    fn ident(&self) -> AssetIdentVc {
        self.server_module_ident
            .with_modifier(client_proxy_modifier())
    }

    #[turbo_tasks::function]
    fn content(&self) -> Result<AssetContentVc> {
        bail!("proxy module asset has no content")
    }

    #[turbo_tasks::function]
    async fn references(
        self_vc: EcmascriptClientReferenceProxyModuleVc,
    ) -> Result<AssetReferencesVc> {
        let EcmascriptClientReferenceProxyModule {
            server_module_ident,
            server_asset_context: _,
            client_module,
            ssr_module,
        } = &*self_vc.await?;

        let references: Vec<_> = self_vc
            .proxy_module_asset()
            .references()
            .await?
            .iter()
            .copied()
            .chain(once(
                SingleAssetReferenceVc::new(
                    EcmascriptClientReferenceModuleVc::new(
                        *server_module_ident,
                        *client_module,
                        *ssr_module,
                    )
                    .into(),
                    client_reference_description(),
                )
                .into(),
            ))
            .collect();

        Ok(AssetReferencesVc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl Module for EcmascriptClientReferenceProxyModule {}

#[turbo_tasks::value_impl]
impl ChunkableModule for EcmascriptClientReferenceProxyModule {
    #[turbo_tasks::function]
    fn as_chunk(
        self_vc: EcmascriptClientReferenceProxyModuleVc,
        context: ChunkingContextVc,
        availability_info: Value<AvailabilityInfo>,
    ) -> ChunkVc {
        EcmascriptChunkVc::new(
            context,
            self_vc.as_ecmascript_chunk_placeable(),
            availability_info,
        )
        .into()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for EcmascriptClientReferenceProxyModule {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self_vc: EcmascriptClientReferenceProxyModuleVc,
        chunking_context: EcmascriptChunkingContextVc,
    ) -> EcmascriptChunkItemVc {
        ProxyModuleChunkItem {
            client_proxy_asset: self_vc,
            inner_proxy_module_chunk_item: self_vc
                .proxy_module_asset()
                .as_chunk_item(chunking_context),
            chunking_context,
        }
        .cell()
        .into()
    }

    #[turbo_tasks::function]
    fn get_exports(self_vc: EcmascriptClientReferenceProxyModuleVc) -> EcmascriptExportsVc {
        self_vc.proxy_module_asset().get_exports()
    }
}

/// This wrapper only exists to overwrite the `asset_ident` method of the
/// wrapped [`EcmascriptChunkItemVc`]. Otherwise, the asset ident of the
/// chunk item would not be the same as the asset ident of the
/// [`EcmascriptClientReferenceProxyModuleVc`].
#[turbo_tasks::value]
struct ProxyModuleChunkItem {
    client_proxy_asset: EcmascriptClientReferenceProxyModuleVc,
    inner_proxy_module_chunk_item: EcmascriptChunkItemVc,
    chunking_context: EcmascriptChunkingContextVc,
}

#[turbo_tasks::function]
fn client_proxy_modifier() -> StringVc {
    StringVc::cell("client proxy".to_string())
}

#[turbo_tasks::function]
fn client_reference_description() -> StringVc {
    StringVc::cell("client references".to_string())
}

#[turbo_tasks::value_impl]
impl ChunkItem for ProxyModuleChunkItem {
    #[turbo_tasks::function]
    async fn asset_ident(&self) -> AssetIdentVc {
        self.client_proxy_asset.ident()
    }

    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        self.client_proxy_asset.references()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ProxyModuleChunkItem {
    #[turbo_tasks::function]
    fn content(&self) -> EcmascriptChunkItemContentVc {
        self.inner_proxy_module_chunk_item.content()
    }

    #[turbo_tasks::function]
    fn content_with_availability_info(
        &self,
        availability_info: Value<AvailabilityInfo>,
    ) -> EcmascriptChunkItemContentVc {
        self.inner_proxy_module_chunk_item
            .content_with_availability_info(availability_info)
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> EcmascriptChunkingContextVc {
        self.inner_proxy_module_chunk_item.chunking_context()
    }
}
