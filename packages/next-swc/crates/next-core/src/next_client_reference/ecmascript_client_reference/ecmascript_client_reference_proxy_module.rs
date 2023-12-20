use std::{io::Write, iter::once};

use anyhow::{bail, Context, Result};
use indoc::writedoc;
use turbo_tasks::{Value, ValueToString, Vc};
use turbo_tasks_fs::File;
use turbopack_binding::turbopack::{
    core::{
        asset::{Asset, AssetContent},
        chunk::{AsyncModuleInfo, ChunkItem, ChunkType, ChunkableModule, ChunkingContext},
        code_builder::CodeBuilder,
        context::AssetContext,
        ident::AssetIdent,
        module::Module,
        reference::{ModuleReferences, SingleModuleReference},
        reference_type::ReferenceType,
        virtual_source::VirtualSource,
    },
    ecmascript::{
        chunk::{
            EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkPlaceable,
            EcmascriptChunkType, EcmascriptChunkingContext, EcmascriptExports,
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
    async fn proxy_module(&self) -> Result<Vc<EcmascriptModuleAsset>> {
        let mut code = CodeBuilder::default();

        let server_module_path = &*self.server_module_ident.path().to_string().await?;

        // Adapted from https://github.com/facebook/react/blob/c5b9375767e2c4102d7e5559d383523736f1c902/packages/react-server-dom-webpack/src/ReactFlightWebpackNodeLoader.js#L323-L354
        if let EcmascriptExports::EsmExports(exports) = &*self.client_module.get_exports().await? {
            let exports = exports.expand_exports().await?;

            if !exports.dynamic_exports.is_empty() {
                // TODO: throw? warn?
            }

            writedoc!(
                code,
                r#"
                    import {{ registerClientReference }} from "react-server-dom-turbopack/server.edge";
                "#,
            )?;

            for export_name in exports.exports.keys() {
                if export_name == "default" {
                    writedoc!(
                        code,
                        r#"
                            export default registerClientReference(
                                function() {{ throw new Error({call_err}); }},
                                {server_module_path},
                                "default",
                            );
                        "#,
                        call_err = StringifyJs(&format!(
                            "Attempted to call the default export of {server_module_path} from \
                             the server, but it's on the client. It's not possible to invoke a \
                             client function from the server, it can only be rendered as a \
                             Component or passed to props of a Client Component."
                        )),
                        server_module_path = StringifyJs(server_module_path),
                    )?;
                } else {
                    writedoc!(
                        code,
                        r#"
                            export const {export_name} = registerClientReference(
                                function() {{ throw new Error({call_err}); }},
                                {server_module_path},
                                {export_name_str},
                            );
                        "#,
                        export_name = export_name,
                        call_err = StringifyJs(&format!(
                            "Attempted to call {export_name}() from the server but {export_name} \
                             is on the client. It's not possible to invoke a client function from \
                             the server, it can only be rendered as a Component or passed to \
                             props of a Client Component."
                        )),
                        server_module_path = StringifyJs(server_module_path),
                        export_name_str = StringifyJs(export_name),
                    )?;
                }
            }
        } else {
            writedoc!(
                code,
                r#"
                    const {{ createClientModuleProxy }} = require("react-server-dom-turbopack/server.edge");

                    __turbopack_export_namespace__(createClientModuleProxy({server_module_path}));
                "#,
                server_module_path = StringifyJs(server_module_path)
            )?;
        };

        let code = code.build();
        let proxy_module_content =
            AssetContent::file(File::from(code.source_code().clone()).into());

        let proxy_source = VirtualSource::new(
            self.server_module_ident.path().join("proxy.js".to_string()),
            proxy_module_content,
        );

        let proxy_module = self
            .server_asset_context
            .process(
                Vc::upcast(proxy_source),
                Value::new(ReferenceType::Undefined),
            )
            .module();

        let Some(proxy_module) =
            Vc::try_resolve_downcast_type::<EcmascriptModuleAsset>(proxy_module).await?
        else {
            bail!("proxy asset is not an ecmascript module");
        };

        Ok(proxy_module)
    }
}

#[turbo_tasks::value_impl]
impl Module for EcmascriptClientReferenceProxyModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.server_module_ident
            .with_modifier(client_proxy_modifier())
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        let EcmascriptClientReferenceProxyModule {
            server_module_ident,
            server_asset_context: _,
            client_module,
            ssr_module,
        } = &*self.await?;

        let references: Vec<_> = self
            .proxy_module()
            .references()
            .await?
            .iter()
            .copied()
            .chain(once(Vc::upcast(SingleModuleReference::new(
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
impl Asset for EcmascriptClientReferenceProxyModule {
    #[turbo_tasks::function]
    fn content(&self) -> Result<Vc<AssetContent>> {
        bail!("proxy module asset has no content")
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for EcmascriptClientReferenceProxyModule {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<Box<dyn ChunkItem>>> {
        let item = self.proxy_module().as_chunk_item(chunking_context);
        let ecmascript_item = Vc::try_resolve_downcast::<Box<dyn EcmascriptChunkItem>>(item)
            .await?
            .context("EcmascriptModuleAsset must implement EcmascriptChunkItem")?;
        let chunking_context =
            Vc::try_resolve_downcast::<Box<dyn EcmascriptChunkingContext>>(chunking_context)
                .await?
                .context(
                    "chunking context must impl EcmascriptChunkingContext to use \
                     EcmascriptClientReferenceProxyModule",
                )?;

        Ok(Vc::upcast(
            ProxyModuleChunkItem {
                client_proxy_asset: self,
                inner_proxy_module_chunk_item: ecmascript_item,
                chunking_context,
            }
            .cell(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for EcmascriptClientReferenceProxyModule {
    #[turbo_tasks::function]
    fn get_exports(self: Vc<Self>) -> Vc<EcmascriptExports> {
        self.proxy_module().get_exports()
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
    fn references(&self) -> Vc<ModuleReferences> {
        self.client_proxy_asset.references()
    }

    #[turbo_tasks::function]
    async fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        Vc::upcast(self.chunking_context)
    }

    #[turbo_tasks::function]
    fn ty(&self) -> Vc<Box<dyn ChunkType>> {
        Vc::upcast(Vc::<EcmascriptChunkType>::default())
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        Vc::upcast(self.client_proxy_asset)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ProxyModuleChunkItem {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<EcmascriptChunkItemContent> {
        self.inner_proxy_module_chunk_item.content()
    }

    #[turbo_tasks::function]
    fn content_with_async_module_info(
        &self,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Vc<EcmascriptChunkItemContent> {
        self.inner_proxy_module_chunk_item
            .content_with_async_module_info(async_module_info)
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn EcmascriptChunkingContext>> {
        EcmascriptChunkItem::chunking_context(self.inner_proxy_module_chunk_item)
    }
}
