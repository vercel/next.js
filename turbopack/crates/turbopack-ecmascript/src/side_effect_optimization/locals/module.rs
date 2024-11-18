use std::collections::BTreeMap;

use anyhow::{bail, Result};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::glob::Glob;
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
    chunk::{EcmascriptChunkPlaceable, EcmascriptExports},
    references::{
        async_module::OptionAsyncModule,
        esm::{EsmExport, EsmExports},
    },
    EcmascriptModuleAsset,
};

/// A module derived from an original ecmascript module that only contains the
/// local declarations, but excludes all reexports. These reexports are exposed
/// from [EcmascriptModuleFacadeModule] instead.
#[turbo_tasks::value]
pub struct EcmascriptModuleLocalsModule {
    pub module: ResolvedVc<EcmascriptModuleAsset>,
}

#[turbo_tasks::value_impl]
impl EcmascriptModuleLocalsModule {
    #[turbo_tasks::function]
    pub fn new(module: ResolvedVc<EcmascriptModuleAsset>) -> Vc<Self> {
        EcmascriptModuleLocalsModule { module }.cell()
    }
}

#[turbo_tasks::value_impl]
impl Module for EcmascriptModuleLocalsModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        let inner = self.module.ident();

        inner.with_part(ModulePart::locals())
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        let result = self.module.analyze().await?;
        Ok(*result.local_references)
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
                EsmExport::LocalBinding(local_name, mutable) => {
                    exports.insert(
                        name.clone(),
                        EsmExport::LocalBinding(local_name.clone(), *mutable),
                    );
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
        Ok(EcmascriptExports::EsmExports(exports.to_resolved().await?).cell())
    }

    #[turbo_tasks::function]
    fn is_marked_as_side_effect_free(&self, side_effect_free_packages: Vc<Glob>) -> Vc<bool> {
        self.module
            .is_marked_as_side_effect_free(side_effect_free_packages)
    }

    #[turbo_tasks::function]
    fn get_async_module(&self) -> Vc<OptionAsyncModule> {
        self.module.get_async_module()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for EcmascriptModuleLocalsModule {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        Vc::upcast(
            EcmascriptModuleLocalsChunkItem {
                module: self,
                chunking_context,
            }
            .cell(),
        )
    }
}
