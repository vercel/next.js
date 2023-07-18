use anyhow::{bail, Result};
use indoc::formatdoc;
use turbo_tasks::{Value, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_binding::turbopack::{
    core::{
        asset::{Asset, AssetContent},
        chunk::{
            availability_info::AvailabilityInfo, Chunk, ChunkItem, ChunkableModule, ChunkingContext,
        },
        ident::AssetIdent,
        module::Module,
        reference::{AssetReference, AssetReferences},
    },
    ecmascript::chunk::EcmascriptChunkItemExt,
    turbopack::ecmascript::{
        chunk::{
            EcmascriptChunk, EcmascriptChunkItem, EcmascriptChunkItemContent,
            EcmascriptChunkPlaceable, EcmascriptChunkingContext, EcmascriptExports,
        },
        utils::StringifyJs,
    },
};

use super::server_component_reference::NextServerComponentModuleReference;

#[turbo_tasks::function]
fn modifier() -> Vc<String> {
    Vc::cell("Next.js server component".to_string())
}

#[turbo_tasks::value(shared)]
pub struct NextServerComponentModule {
    module: Vc<Box<dyn EcmascriptChunkPlaceable>>,
}

#[turbo_tasks::value_impl]
impl NextServerComponentModule {
    #[turbo_tasks::function]
    pub fn new(module: Vc<Box<dyn EcmascriptChunkPlaceable>>) -> Vc<Self> {
        NextServerComponentModule { module }.cell()
    }

    #[turbo_tasks::function]
    pub async fn server_path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        let this = self.await?;
        Ok(this.module.ident().path())
    }
}

#[turbo_tasks::value_impl]
impl Module for NextServerComponentModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.module.ident().with_modifier(modifier())
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<AssetReferences> {
        let references: Vec<Vc<Box<dyn AssetReference>>> = vec![Vc::upcast(
            NextServerComponentModuleReference::new(Vc::upcast(self.module)),
        )];
        Vc::cell(references)
    }
}

#[turbo_tasks::value_impl]
impl Asset for NextServerComponentModule {
    #[turbo_tasks::function]
    fn content(&self) -> Result<Vc<AssetContent>> {
        bail!("Next.js server component module has no content")
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for NextServerComponentModule {
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
impl EcmascriptChunkPlaceable for NextServerComponentModule {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        self: Vc<Self>,
        context: Vc<Box<dyn EcmascriptChunkingContext>>,
    ) -> Result<Vc<Box<dyn EcmascriptChunkItem>>> {
        Ok(Vc::upcast(
            BuildServerComponentChunkItem {
                context,
                inner: self,
            }
            .cell(),
        ))
    }

    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        // TODO This should be EsmExports
        EcmascriptExports::Value.cell()
    }
}

#[turbo_tasks::value]
struct BuildServerComponentChunkItem {
    context: Vc<Box<dyn EcmascriptChunkingContext>>,
    inner: Vc<NextServerComponentModule>,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for BuildServerComponentChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn EcmascriptChunkingContext>> {
        self.context
    }

    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<EcmascriptChunkItemContent>> {
        let this = self.await?;
        let inner = this.inner.await?;

        let module_id = inner.module.as_chunk_item(this.context).id().await?;
        Ok(EcmascriptChunkItemContent {
            inner_code: formatdoc!(
                r#"
                    __turbopack_esm__({{
                        default: () => __turbopack_import__({}),
                    }});
                "#,
                StringifyJs(&module_id),
            )
            .into(),
            ..Default::default()
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for BuildServerComponentChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.inner.ident()
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<AssetReferences> {
        self.inner.references()
    }
}
