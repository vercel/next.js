use std::{io::Write, iter::once};

use anyhow::{bail, Context, Result};
use indoc::writedoc;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Value, ValueToString, Vc};
use turbo_tasks_fs::File;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        AsyncModuleInfo, ChunkGroupType, ChunkItem, ChunkType, ChunkableModule,
        ChunkableModuleReference, ChunkingContext, ChunkingType, ChunkingTypeOption,
    },
    code_builder::CodeBuilder,
    context::AssetContext,
    ident::AssetIdent,
    module::Module,
    module_graph::ModuleGraph,
    reference::{ModuleReference, ModuleReferences},
    reference_type::ReferenceType,
    resolve::ModuleResolveResult,
    virtual_source::VirtualSource,
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkPlaceable,
        EcmascriptChunkType, EcmascriptExports,
    },
    runtime_functions::TURBOPACK_EXPORT_NAMESPACE,
    utils::StringifyJs,
};

/// A [`EcmascriptClientReferenceModule`] is used in RSC to represent
/// a client or SSR asset.
#[turbo_tasks::value]
pub struct EcmascriptClientReferenceModule {
    pub server_ident: ResolvedVc<AssetIdent>,
    server_asset_context: ResolvedVc<Box<dyn AssetContext>>,
    pub client_module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    pub ssr_module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
}

#[turbo_tasks::value_impl]
impl EcmascriptClientReferenceModule {
    /// Create a new [`EcmascriptClientReferenceModule`].
    ///
    /// # Arguments
    ///
    /// * `server_ident` - The identifier of the server module.
    /// * `server_asset_context` - The context of the server module.
    /// * `client_module` - The client module.
    /// * `ssr_module` - The SSR module.
    #[turbo_tasks::function]
    pub fn new(
        server_ident: ResolvedVc<AssetIdent>,
        server_asset_context: ResolvedVc<Box<dyn AssetContext>>,
        client_module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
        ssr_module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    ) -> Vc<EcmascriptClientReferenceModule> {
        EcmascriptClientReferenceModule {
            server_ident,
            server_asset_context,
            client_module,
            ssr_module,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn proxy_module(&self) -> Result<Vc<Box<dyn EcmascriptChunkPlaceable>>> {
        let mut code = CodeBuilder::default();
        let is_esm: bool;

        let server_module_path = &*self.server_ident.to_string().await?;

        // Adapted from https://github.com/facebook/react/blob/c5b9375767e2c4102d7e5559d383523736f1c902/packages/react-server-dom-webpack/src/ReactFlightWebpackNodeLoader.js#L323-L354
        if let EcmascriptExports::EsmExports(exports) = &*self.client_module.get_exports().await? {
            is_esm = true;
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
            is_esm = false;
            writedoc!(
                code,
                r#"
                    const {{ createClientModuleProxy }} = require("react-server-dom-turbopack/server.edge");

                    {TURBOPACK_EXPORT_NAMESPACE}(createClientModuleProxy({server_module_path}));
                "#,
                server_module_path = StringifyJs(server_module_path)
            )?;
        };

        let code = code.build();
        let proxy_module_content =
            AssetContent::file(File::from(code.source_code().clone()).into());

        let proxy_source = VirtualSource::new(
            self.server_ident.path().join(
                // Depending on the original format, we call the file `proxy.mjs` or `proxy.cjs`.
                // This is because we're placing the virtual module next to the original code, so
                // its parsing will be affected by `type` fields in package.json --
                // a bare `proxy.js` may end up being unexpectedly parsed as the wrong format.
                format!("proxy.{}", if is_esm { "mjs" } else { "cjs" }).into(),
            ),
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
            Vc::try_resolve_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(proxy_module).await?
        else {
            bail!("proxy asset is not an ecmascript module");
        };

        Ok(proxy_module)
    }
}

#[turbo_tasks::function]
fn client_reference_modifier() -> Vc<RcStr> {
    Vc::cell("client reference/proxy".into())
}

#[turbo_tasks::function]
fn ecmascript_client_reference_client_ref_modifier() -> Vc<RcStr> {
    Vc::cell("ecmascript client reference to client".into())
}

#[turbo_tasks::function]
fn ecmascript_client_reference_ssr_ref_modifier() -> Vc<RcStr> {
    Vc::cell("ecmascript client reference to ssr".into())
}

#[turbo_tasks::value_impl]
impl Module for EcmascriptClientReferenceModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.server_ident.with_modifier(client_reference_modifier())
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        let EcmascriptClientReferenceModule {
            client_module,
            ssr_module,
            ..
        } = &*self.await?;

        let references: Vec<_> = self
            .proxy_module()
            .references()
            .await?
            .iter()
            .copied()
            .chain(once(ResolvedVc::upcast(
                EcmascriptClientReference::new(
                    *ResolvedVc::upcast(*client_module),
                    ChunkGroupType::Evaluated,
                    Some("client".into()),
                    ecmascript_client_reference_client_ref_modifier(),
                )
                .to_resolved()
                .await?,
            )))
            .chain(once(ResolvedVc::upcast(
                EcmascriptClientReference::new(
                    *ResolvedVc::upcast(*ssr_module),
                    ChunkGroupType::Entry,
                    Some("ssr".into()),
                    ecmascript_client_reference_ssr_ref_modifier(),
                )
                .to_resolved()
                .await?,
            )))
            .collect();

        Ok(Vc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptClientReferenceModule {
    #[turbo_tasks::function]
    fn content(&self) -> Result<Vc<AssetContent>> {
        bail!("client reference module asset has no content")
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for EcmascriptClientReferenceModule {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        self: ResolvedVc<Self>,
        module_graph: Vc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<Box<dyn ChunkItem>>> {
        let item = self
            .proxy_module()
            .as_chunk_item(module_graph, *chunking_context);
        let ecmascript_item = Vc::try_resolve_downcast::<Box<dyn EcmascriptChunkItem>>(item)
            .await?
            .context("EcmascriptModuleAsset must implement EcmascriptChunkItem")?
            .to_resolved()
            .await?;

        Ok(Vc::upcast(
            EcmascriptClientReferenceProxyChunkItem {
                inner_module: self,
                inner_chunk_item: ecmascript_item,
                chunking_context,
            }
            .cell(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for EcmascriptClientReferenceModule {
    #[turbo_tasks::function]
    fn get_exports(self: Vc<Self>) -> Vc<EcmascriptExports> {
        self.proxy_module().get_exports()
    }
}

/// This wrapper only exists to overwrite the `asset_ident` method of the
/// wrapped [`Vc<Box<dyn EcmascriptChunkItem>>`]. Otherwise, the asset ident of
/// the chunk item would not be the same as the asset ident of the
/// [`Vc<EcmascriptClientReferenceModule>`].
#[turbo_tasks::value]
struct EcmascriptClientReferenceProxyChunkItem {
    inner_module: ResolvedVc<EcmascriptClientReferenceModule>,
    inner_chunk_item: ResolvedVc<Box<dyn EcmascriptChunkItem>>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::function]
fn client_reference_description() -> Vc<RcStr> {
    Vc::cell("client references".into())
}

#[turbo_tasks::value_impl]
impl ChunkItem for EcmascriptClientReferenceProxyChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.inner_module.ident()
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        Vc::upcast(*self.chunking_context)
    }

    #[turbo_tasks::function]
    fn ty(&self) -> Vc<Box<dyn ChunkType>> {
        Vc::upcast(Vc::<EcmascriptChunkType>::default())
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        Vc::upcast(*self.inner_module)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for EcmascriptClientReferenceProxyChunkItem {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<EcmascriptChunkItemContent> {
        self.inner_chunk_item.content()
    }

    #[turbo_tasks::function]
    fn content_with_async_module_info(
        &self,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Vc<EcmascriptChunkItemContent> {
        self.inner_chunk_item
            .content_with_async_module_info(async_module_info)
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        EcmascriptChunkItem::chunking_context(*self.inner_chunk_item)
    }
}

#[turbo_tasks::value]
pub(crate) struct EcmascriptClientReference {
    module: ResolvedVc<Box<dyn Module>>,
    ty: ChunkGroupType,
    merge_tag: Option<RcStr>,
    description: ResolvedVc<RcStr>,
}

#[turbo_tasks::value_impl]
impl EcmascriptClientReference {
    #[turbo_tasks::function]
    pub fn new(
        module: ResolvedVc<Box<dyn Module>>,
        ty: ChunkGroupType,
        merge_tag: Option<RcStr>,
        description: ResolvedVc<RcStr>,
    ) -> Vc<Self> {
        Self::cell(EcmascriptClientReference {
            module,
            ty,
            merge_tag,
            description,
        })
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for EcmascriptClientReference {
    #[turbo_tasks::function]
    fn chunking_type(&self) -> Vc<ChunkingTypeOption> {
        Vc::cell(Some(ChunkingType::Isolated {
            _ty: self.ty,
            merge_tag: self.merge_tag.clone(),
        }))
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for EcmascriptClientReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        ModuleResolveResult::module(self.module).cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptClientReference {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        *self.description
    }
}
