use std::collections::BTreeMap;

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use turbo_tasks::{trace::TraceRawVcs, TaskInput, Vc};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{AsyncModuleInfo, ChunkableModule, ChunkingContext, EvaluatableAsset},
    ident::AssetIdent,
    module::Module,
    reference::ModuleReferences,
    resolve::ModulePart,
};

use super::{
    chunk_item::EcmascriptModuleReexportsChunkItem, reference::EcmascriptModuleFacadeReference,
};
use crate::{
    chunk::{EcmascriptChunkPlaceable, EcmascriptChunkingContext, EcmascriptExports},
    references::{
        async_module::OptionAsyncModule,
        esm::{EsmExport, EsmExports},
    },
    side_effect_optimization::locals::reference::EcmascriptModuleLocalsReference,
    EcmascriptModuleAsset, EcmascriptModuleContent,
};

#[derive(
    Copy,
    Clone,
    Debug,
    Eq,
    PartialEq,
    Hash,
    Ord,
    PartialOrd,
    Serialize,
    Deserialize,
    TaskInput,
    TraceRawVcs,
)]
pub enum FacadeType {
    Evaluation,
    Reexports,
    Complete,
}

#[turbo_tasks::value]
pub struct EcmascriptModuleFacadeModule {
    pub module: Vc<EcmascriptModuleAsset>,
    pub ty: FacadeType,
}

/// A module derived from an original ecmascript module that only contains all
/// the reexports from that module and also reexports the locals from
/// [EcmascriptModuleLocalsModule]. It allows to follow
#[turbo_tasks::value_impl]
impl EcmascriptModuleFacadeModule {
    #[turbo_tasks::function]
    pub fn new(module: Vc<EcmascriptModuleAsset>, ty: FacadeType) -> Vc<Self> {
        EcmascriptModuleFacadeModule { module, ty }.cell()
    }

    #[turbo_tasks::function]
    pub async fn module_content(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<EcmascriptModuleContent>> {
        let this = self.await?;

        let parsed = this.module.parse().resolve().await?;

        Ok(EcmascriptModuleContent::new(
            parsed,
            self.ident(),
            chunking_context,
            self.references(),
            Vc::cell(vec![]),
            self.get_exports(),
            async_module_info,
        ))
    }
}

#[turbo_tasks::value_impl]
impl Module for EcmascriptModuleFacadeModule {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        let inner = self.module.ident();

        Ok(inner.with_part(match self.ty {
            FacadeType::Evaluation => ModulePart::module_evaluation(),
            FacadeType::Reexports => ModulePart::reexports(),
            FacadeType::Complete => ModulePart::facade(),
        }))
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        let references = match self.ty {
            FacadeType::Evaluation => {
                let result = self.module.failsafe_analyze().await?;
                let references = result.evaluation_references;
                let mut references = references.await?.clone_value();
                references.push(Vc::upcast(EcmascriptModuleLocalsReference::new(
                    self.module,
                )));
                references
            }
            FacadeType::Reexports => {
                let result = self.module.failsafe_analyze().await?;
                let references = result.reexport_references;
                let mut references = references.await?.clone_value();
                references.push(Vc::upcast(EcmascriptModuleLocalsReference::new(
                    self.module,
                )));
                references
            }
            FacadeType::Complete => {
                vec![
                    Vc::upcast(EcmascriptModuleFacadeReference::new(
                        self.module,
                        FacadeType::Evaluation,
                    )),
                    Vc::upcast(EcmascriptModuleFacadeReference::new(
                        self.module,
                        FacadeType::Reexports,
                    )),
                ]
            }
        };
        Ok(Vc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptModuleFacadeModule {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        // This is not reachable because EcmascriptModuleFacadeModule
        // implements ChunkableModule and ChunkableModule::as_chunk_item is
        // called instead.
        todo!("EcmascriptModuleFacadeModule::content is not implemented")
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for EcmascriptModuleFacadeModule {
    #[turbo_tasks::function]
    async fn get_exports(&self) -> Result<Vc<EcmascriptExports>> {
        let result = self.module.failsafe_analyze().await?;
        let EcmascriptExports::EsmExports(exports) = *result.exports.await? else {
            bail!("EcmascriptModuleFacadeModule must only be used on modules with EsmExports");
        };
        let esm_exports = exports.await?;
        let mut exports = BTreeMap::new();
        let mut star_exports = Vec::new();

        match self.ty {
            FacadeType::Reexports => {
                for (name, export) in &esm_exports.exports {
                    let name = name.clone();
                    match export {
                        EsmExport::LocalBinding(local_name) => {
                            exports.insert(
                                name,
                                EsmExport::ImportedBinding(
                                    Vc::upcast(EcmascriptModuleLocalsReference::new(self.module)),
                                    local_name.clone(),
                                ),
                            );
                        }
                        EsmExport::ImportedNamespace(reference) => {
                            exports.insert(name, EsmExport::ImportedNamespace(*reference));
                        }
                        EsmExport::ImportedBinding(reference, imported_name) => {
                            exports.insert(
                                name,
                                EsmExport::ImportedBinding(*reference, imported_name.clone()),
                            );
                        }
                        EsmExport::Error => {
                            exports.insert(name, EsmExport::Error);
                        }
                    }
                }
                star_exports.extend(esm_exports.star_exports.iter().copied());
            }
            FacadeType::Complete => {
                // Reexport everything from the reexports module
                // (including default export if any)
                if esm_exports.exports.keys().any(|name| name == "default") {
                    exports.insert(
                        "default".to_string(),
                        EsmExport::ImportedBinding(
                            Vc::upcast(EcmascriptModuleFacadeReference::new(
                                self.module,
                                FacadeType::Reexports,
                            )),
                            "default".to_string(),
                        ),
                    );
                }
                star_exports.push(Vc::upcast(EcmascriptModuleFacadeReference::new(
                    self.module,
                    FacadeType::Reexports,
                )));
            }
            FacadeType::Evaluation => {
                // no exports
            }
        }

        let exports = EsmExports {
            exports,
            star_exports,
        }
        .cell();
        Ok(EcmascriptExports::EsmExports(exports).cell())
    }

    #[turbo_tasks::function]
    fn is_marked_as_side_effect_free(&self) -> Vc<bool> {
        match self.ty {
            FacadeType::Evaluation | FacadeType::Complete => {
                self.module.is_marked_as_side_effect_free()
            }
            FacadeType::Reexports => Vc::cell(true),
        }
    }

    #[turbo_tasks::function]
    fn get_async_module(&self) -> Vc<OptionAsyncModule> {
        self.module.get_async_module()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for EcmascriptModuleFacadeModule {
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
                     EcmascriptModuleFacadeModule",
                )?;
        Ok(Vc::upcast(
            EcmascriptModuleReexportsChunkItem {
                module: self,
                chunking_context,
            }
            .cell(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl EvaluatableAsset for EcmascriptModuleFacadeModule {}
