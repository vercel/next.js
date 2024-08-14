use std::collections::BTreeMap;

use anyhow::{bail, Result};
use indoc::formatdoc;
use turbo_tasks::{RcStr, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkItem, ChunkItemExt, ChunkType, ChunkableModule, ChunkingContext, ModuleIdJs},
    ident::AssetIdent,
    module::{Module, Modules},
    reference::ModuleReferences,
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkPlaceable,
        EcmascriptChunkType, EcmascriptExports,
    },
    references::{
        esm::{EsmExport, EsmExports},
        external_module::IncludeIdentModule,
    },
};

use super::server_component_reference::NextServerComponentModuleReference;
use crate::next_app::app_client_references_chunks::{
    client_modules_modifier, client_modules_ssr_modifier,
};

#[turbo_tasks::function]
fn modifier() -> Vc<RcStr> {
    Vc::cell("Next.js server component".into())
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
    pub fn server_path(&self) -> Vc<FileSystemPath> {
        self.module.ident().path()
    }
}

#[turbo_tasks::value_impl]
impl Module for NextServerComponentModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.module.ident().with_modifier(modifier())
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<ModuleReferences> {
        Vc::cell(vec![Vc::upcast(NextServerComponentModuleReference::new(
            Vc::upcast(self.module),
        ))])
    }

    #[turbo_tasks::function]
    fn additional_layers_modules(self: Vc<Self>) -> Vc<Modules> {
        let base_ident = self.ident();
        let ssr_entry_module = Vc::upcast(IncludeIdentModule::new(
            base_ident.with_modifier(client_modules_ssr_modifier()),
        ));
        let client_entry_module = Vc::upcast(IncludeIdentModule::new(
            base_ident.with_modifier(client_modules_modifier()),
        ));
        Vc::cell(vec![ssr_entry_module, client_entry_module])
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
    fn as_chunk_item(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        Vc::upcast(
            NextServerComponentChunkItem {
                chunking_context,
                inner: self,
            }
            .cell(),
        )
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for NextServerComponentModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        let module_reference = Vc::upcast(NextServerComponentModuleReference::new(Vc::upcast(
            self.module,
        )));

        let mut exports = BTreeMap::new();
        exports.insert(
            "default".into(),
            EsmExport::ImportedBinding(module_reference, "default".into(), false),
        );

        EcmascriptExports::EsmExports(
            EsmExports {
                exports,
                star_exports: vec![module_reference],
            }
            .cell(),
        )
        .cell()
    }
}

#[turbo_tasks::value]
struct NextServerComponentChunkItem {
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    inner: Vc<NextServerComponentModule>,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for NextServerComponentChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        self.chunking_context
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<EcmascriptChunkItemContent>> {
        let inner = self.inner.await?;

        let module_id = inner
            .module
            .as_chunk_item(Vc::upcast(self.chunking_context))
            .id()
            .await?;
        Ok(EcmascriptChunkItemContent {
            inner_code: formatdoc!(
                r#"
                    __turbopack_export_namespace__(__turbopack_import__({}));
                "#,
                ModuleIdJs(&module_id),
            )
            .into(),
            ..Default::default()
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for NextServerComponentChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.inner.ident()
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<ModuleReferences> {
        self.inner.references()
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        self.chunking_context
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
