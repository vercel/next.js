use std::collections::BTreeMap;

use anyhow::{bail, Context, Result};
use turbo_tasks::Vc;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkableModule, ChunkingContext},
    ident::AssetIdent,
    module::Module,
    reference::ModuleReferences,
    resolve::ModulePart,
};

use super::chunk_item::EcmascriptModuleLocalsChunkItem;
use crate::{
    chunk::{EcmascriptChunkPlaceable, EcmascriptChunkingContext, EcmascriptExports},
    references::esm::{EsmExport, EsmExports},
    EcmascriptModuleAsset,
};

/// A module derived from an original ecmascript module that only contains the
/// local declarations, but excludes all reexports. These reexports are exposed
/// from [EcmascriptModuleFacadeModule] instead.
#[turbo_tasks::value]
pub struct EcmascriptModuleLocalsModule {
    pub module: Vc<EcmascriptModuleAsset>,
}

#[turbo_tasks::value_impl]
impl EcmascriptModuleLocalsModule {
    #[turbo_tasks::function]
    pub fn new(module: Vc<EcmascriptModuleAsset>) -> Vc<Self> {
        EcmascriptModuleLocalsModule { module }.cell()
    }
}

#[turbo_tasks::value_impl]
impl Module for EcmascriptModuleLocalsModule {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        let inner = self.module.ident();

        Ok(inner.with_part(ModulePart::locals()))
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        let result = self.module.failsafe_analyze().await?;
        Ok(result.local_references)
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptModuleLocalsModule {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.module.content()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for EcmascriptModuleLocalsModule {
    #[turbo_tasks::function]
    async fn get_exports(&self) -> Result<Vc<EcmascriptExports>> {
        let EcmascriptExports::EsmExports(exports) = *self.module.get_exports().await? else {
            bail!("EcmascriptModuleLocalsModule must only be used on modules with EsmExports");
        };
        let esm_exports = exports.await?;
        let mut exports = BTreeMap::new();

        for (name, export) in &esm_exports.exports {
            match export {
                EsmExport::ImportedBinding(..) | EsmExport::ImportedNamespace(..) => {
                    // not included in locals module
                }
                EsmExport::LocalBinding(local_name) => {
                    exports.insert(name.clone(), EsmExport::LocalBinding(local_name.clone()));
                }
                EsmExport::Error => {
                    exports.insert(name.clone(), EsmExport::Error);
                }
            }
        }

        let exports = EsmExports {
            exports,
            star_exports: vec![],
        }
        .cell();
        Ok(EcmascriptExports::EsmExports(exports).cell())
    }

    #[turbo_tasks::function]
    fn is_marked_as_side_effect_free(&self) -> Vc<bool> {
        self.module.is_marked_as_side_effect_free()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for EcmascriptModuleLocalsModule {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<Box<dyn turbopack_core::chunk::ChunkItem>>> {
        let chunking_context =
            Vc::try_resolve_downcast::<Box<dyn EcmascriptChunkingContext>>(chunking_context)
                .await?
                .context(
                    "chunking context must impl EcmascriptChunkingContext to use \
                     EcmascriptModuleLocalsModule",
                )?;
        Ok(Vc::upcast(
            EcmascriptModuleLocalsChunkItem {
                module: self,
                chunking_context,
            }
            .cell(),
        ))
    }
}
