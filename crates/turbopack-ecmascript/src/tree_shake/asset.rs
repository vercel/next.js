use anyhow::{Context, Result};
use turbo_tasks::Vc;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkableModule, ChunkingContext, EvaluatableAsset},
    ident::AssetIdent,
    module::Module,
    reference::{ModuleReferences, SingleModuleReference},
    resolve::ModulePart,
};

use super::{
    chunk_item::EcmascriptModulePartChunkItem, get_part_id, split_module, Key, SplitResult,
};
use crate::{
    chunk::{EcmascriptChunkPlaceable, EcmascriptExports},
    references::analyse_ecmascript_module,
    AnalyzeEcmascriptModuleResult, EcmascriptModuleAsset,
};

/// A reference to part of an ES module.
///
/// This type is used for an advanced tree shkaing.
#[turbo_tasks::value]
pub struct EcmascriptModulePartAsset {
    pub full_module: Vc<EcmascriptModuleAsset>,
    pub(crate) part: Vc<ModulePart>,
    pub(crate) import_externals: bool,
}

#[turbo_tasks::value_impl]
impl EcmascriptModulePartAsset {
    /// Create a new instance of [Vc<EcmascriptModulePartAsset>], whcih consists
    /// of a pointer to the full module and the [ModulePart] pointing the part
    /// of the module.
    #[turbo_tasks::function]
    pub fn new(
        module: Vc<EcmascriptModuleAsset>,
        part: Vc<ModulePart>,
        import_externals: bool,
    ) -> Vc<Self> {
        EcmascriptModulePartAsset {
            full_module: module,
            part,
            import_externals,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub async fn is_async_module(self: Vc<Self>) -> Result<Vc<bool>> {
        let this = self.await?;
        let result = this.full_module.analyze();

        if let Some(async_module) = *result.await?.async_module.await? {
            Ok(async_module.is_self_async(self.references()))
        } else {
            Ok(Vc::cell(false))
        }
    }
}

#[turbo_tasks::value_impl]
impl Module for EcmascriptModulePartAsset {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        let inner = self.full_module.ident();
        let result = split_module(self.full_module);

        match &*result.await? {
            SplitResult::Ok { .. } => Ok(inner.with_part(self.part)),
            SplitResult::Failed { .. } => Ok(inner),
        }
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        let split_data = split_module(self.full_module).await?;

        let analyze = analyze(self.full_module, self.part).await?;

        let (deps, entrypoints) = match &*split_data {
            SplitResult::Ok {
                deps, entrypoints, ..
            } => (deps, entrypoints),
            SplitResult::Failed { .. } => return Ok(analyze.references),
        };

        // Facade depends on evaluation and re-exports
        if matches!(&*self.part.await?, ModulePart::Facade) {
            let mut references = vec![];

            let reference = Vc::upcast(SingleModuleReference::new(
                Vc::upcast(EcmascriptModulePartAsset::new(
                    self.full_module,
                    ModulePart::evaluation(),
                    self.import_externals,
                )),
                Vc::cell("ecmascript module evaluation".into()),
            ));

            references.push(reference);

            let reference = Vc::upcast(SingleModuleReference::new(
                Vc::upcast(EcmascriptModulePartAsset::new(
                    self.full_module,
                    ModulePart::exports(),
                    self.import_externals,
                )),
                Vc::cell("ecmascript reexports".into()),
            ));

            references.push(reference);

            references.extend(analyze.references.await?.iter().cloned());

            return Ok(Vc::cell(references));
        }

        // ModulePart::Exports contains all reexports and a reexport of the Locals
        if matches!(&*self.part.await?, ModulePart::Exports) {
            let mut references = vec![];

            for key in entrypoints.keys() {
                if let Key::Export(e) = key {
                    let reference = Vc::upcast(SingleModuleReference::new(
                        Vc::upcast(EcmascriptModulePartAsset::new(
                            self.full_module,
                            ModulePart::export(e.clone()),
                            self.import_externals,
                        )),
                        Vc::cell(format!("ecmascript export '{e}'").into()),
                    ));

                    references.push(reference);
                }
            }

            references.extend(analyze.references.await?.iter().cloned());

            return Ok(Vc::cell(references));
        }
        let deps = {
            let part_id = get_part_id(&split_data, self.part)
                .await
                .with_context(|| format!("part {:?} is not found in the module", self.part))?;

            match deps.get(&part_id) {
                Some(v) => &**v,
                None => &[],
            }
        };

        let mut assets = deps
            .iter()
            .map(|&part_id| {
                Ok(Vc::upcast(SingleModuleReference::new(
                    Vc::upcast(EcmascriptModulePartAsset::new(
                        self.full_module,
                        ModulePart::internal(part_id),
                        self.import_externals,
                    )),
                    Vc::cell("ecmascript module part".into()),
                )))
            })
            .collect::<Result<Vec<_>>>()?;

        assets.extend(analyze.references.await?.iter().cloned());

        Ok(Vc::cell(assets))
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptModulePartAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        todo!()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for EcmascriptModulePartAsset {
    #[turbo_tasks::function]
    async fn get_exports(self: Vc<Self>) -> Result<Vc<EcmascriptExports>> {
        Ok(self.analyze().await?.exports)
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for EcmascriptModulePartAsset {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<Box<dyn turbopack_core::chunk::ChunkItem>>> {
        Ok(Vc::upcast(
            EcmascriptModulePartChunkItem {
                module: self,
                chunking_context,
            }
            .cell(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptModulePartAsset {
    #[turbo_tasks::function]
    pub(super) async fn analyze(self: Vc<Self>) -> Result<Vc<AnalyzeEcmascriptModuleResult>> {
        let this = self.await?;

        Ok(analyze(this.full_module, this.part))
    }
}

#[turbo_tasks::function]
async fn analyze(
    module: Vc<EcmascriptModuleAsset>,
    part: Vc<ModulePart>,
) -> Result<Vc<AnalyzeEcmascriptModuleResult>> {
    Ok(analyse_ecmascript_module(module, Some(part)))
}

#[turbo_tasks::value_impl]
impl EvaluatableAsset for EcmascriptModulePartAsset {}
