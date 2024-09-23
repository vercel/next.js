use anyhow::{Context, Result};
use turbo_tasks::Vc;
use turbo_tasks_fs::glob::Glob;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{AsyncModuleInfo, ChunkableModule, ChunkingContext, EvaluatableAsset},
    ident::AssetIdent,
    module::{Module, OptionModule},
    reference::{ModuleReferences, SingleModuleReference},
    resolve::ModulePart,
};

use super::{
    chunk_item::EcmascriptModulePartChunkItem, get_part_id, part_of_module, split, split_module,
    Key, PartId, SplitResult,
};
use crate::{
    chunk::{EcmascriptChunkPlaceable, EcmascriptExports},
    parse::ParseResult,
    references::analyse_ecmascript_module,
    AnalyzeEcmascriptModuleResult, EcmascriptAnalyzable, EcmascriptModuleAsset,
    EcmascriptModuleAssetType, EcmascriptModuleContent, EcmascriptParsable,
};

/// A reference to part of an ES module.
///
/// This type is used for an advanced tree shkaing.
#[turbo_tasks::value]
pub struct EcmascriptModulePartAsset {
    pub full_module: Vc<EcmascriptModuleAsset>,
    pub part: Vc<ModulePart>,
}

#[turbo_tasks::value_impl]
impl EcmascriptParsable for EcmascriptModulePartAsset {
    #[turbo_tasks::function]
    async fn failsafe_parse(self: Vc<Self>) -> Result<Vc<ParseResult>> {
        let this = self.await?;

        let parsed = this.full_module.failsafe_parse();
        let split_data = split(
            this.full_module.ident(),
            this.full_module.source(),
            parsed,
            this.full_module.options().await?.special_exports,
        );
        Ok(part_of_module(split_data, this.part))
    }
    #[turbo_tasks::function]
    fn parse_original(&self) -> Result<Vc<ParseResult>> {
        Ok(self.full_module.parse_original())
    }

    #[turbo_tasks::function]
    async fn ty(&self) -> Result<Vc<EcmascriptModuleAssetType>> {
        Ok(self.full_module.ty())
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptAnalyzable for EcmascriptModulePartAsset {
    #[turbo_tasks::function]
    async fn analyze(self: Vc<Self>) -> Result<Vc<AnalyzeEcmascriptModuleResult>> {
        let this = self.await?;
        let part = this.part;
        Ok(analyse_ecmascript_module(this.full_module, Some(part)))
    }

    #[turbo_tasks::function]
    async fn module_content_without_analysis(
        self: Vc<Self>,
    ) -> Result<Vc<EcmascriptModuleContent>> {
        Ok(self.await?.full_module.module_content_without_analysis())
    }

    #[turbo_tasks::function]
    async fn module_content(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<EcmascriptModuleContent>> {
        Ok(self
            .await?
            .full_module
            .module_content(chunking_context, async_module_info))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptModulePartAsset {
    /// Create a new instance of [Vc<EcmascriptModulePartAsset>], whcih consists
    /// of a pointer to the full module and the [ModulePart] pointing the part
    /// of the module.
    #[turbo_tasks::function]
    pub fn new(module: Vc<EcmascriptModuleAsset>, part: Vc<ModulePart>) -> Vc<Self> {
        EcmascriptModulePartAsset {
            full_module: module,
            part,
        }
        .cell()
    }

    /// Returns `None` only if the part is a proxied export. (Which is allowed to not exist)
    #[turbo_tasks::function]
    pub async fn select_part(
        module: Vc<EcmascriptModuleAsset>,
        part: Vc<ModulePart>,
    ) -> Result<Vc<OptionModule>> {
        let split_result = split_module(module).await?;

        Ok(Vc::cell(
            if matches!(&*split_result, SplitResult::Failed { .. }) {
                Some(Vc::upcast(module))
            } else if matches!(&*part.await?, ModulePart::Export(..)) {
                let part_id = get_part_id(&split_result, part).await?;
                if part_id.is_some() {
                    Some(Vc::upcast(EcmascriptModulePartAsset::new(module, part)))
                } else {
                    None
                }
            } else {
                Some(Vc::upcast(EcmascriptModulePartAsset::new(module, part)))
            },
        ))
    }

    #[turbo_tasks::function]
    pub async fn is_async_module(self: Vc<Self>) -> Result<Vc<bool>> {
        let this = self.await?;
        let result = analyse_ecmascript_module(this.full_module, Some(this.part));

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
                )),
                Vc::cell("ecmascript module evaluation".into()),
            ));

            references.push(reference);

            let reference = Vc::upcast(SingleModuleReference::new(
                Vc::upcast(EcmascriptModulePartAsset::new(
                    self.full_module,
                    ModulePart::exports(),
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
                        )),
                        Vc::cell(format!("ecmascript export '{e}'").into()),
                    ));

                    references.push(reference);
                }
            }

            let reference = Vc::upcast(SingleModuleReference::new(
                Vc::upcast(EcmascriptModulePartAsset::new(
                    self.full_module,
                    ModulePart::star_reexports(),
                )),
                Vc::cell("reexport".into()),
            ));

            references.push(reference);

            references.extend(analyze.references.await?.iter().cloned());

            return Ok(Vc::cell(references));
        }

        if matches!(&*self.part.await?, ModulePart::StarReexports) {
            return Ok(analyze.references);
        }

        let deps = {
            let part_id = get_part_id(&split_data, self.part)
                .await
                .with_context(|| format!("part {:?} is not found in the module", self.part))?
                .expect(
                    "get_part_id should not return None for a part used by \
                     EcmascriptModulePartAsset",
                );

            match deps.get(&part_id) {
                Some(v) => &**v,
                None => &[],
            }
        };

        let mut assets = deps
            .iter()
            .map(|part_id| {
                Ok(Vc::upcast(SingleModuleReference::new(
                    Vc::upcast(EcmascriptModulePartAsset::new(
                        self.full_module,
                        match part_id {
                            PartId::Internal(part_id) => ModulePart::internal(*part_id),
                            PartId::Export(name) => ModulePart::export(name.clone()),
                            PartId::StarReexports => ModulePart::star_reexports(),
                            _ => unreachable!(
                                "PartId other than Internal and Export should not be used here"
                            ),
                        },
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
        self.full_module.content()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for EcmascriptModulePartAsset {
    #[turbo_tasks::function]
    async fn get_exports(self: Vc<Self>) -> Result<Vc<EcmascriptExports>> {
        Ok(self.analyze().await?.exports)
    }

    #[turbo_tasks::function]
    async fn is_marked_as_side_effect_free(
        &self,
        side_effect_free_packages: Vc<Glob>,
    ) -> Result<Vc<bool>> {
        Ok(match *self.part.await? {
            ModulePart::Evaluation
            | ModulePart::Facade
            | ModulePart::Locals
            | ModulePart::Internal(..) => self
                .full_module
                .is_marked_as_side_effect_free(side_effect_free_packages),
            ModulePart::Export(..)
            | ModulePart::Exports
            | ModulePart::StarReexports
            | ModulePart::RenamedExport { .. }
            | ModulePart::RenamedNamespace { .. } => Vc::cell(true),
        })
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
fn analyze(
    module: Vc<EcmascriptModuleAsset>,
    part: Vc<ModulePart>,
) -> Result<Vc<AnalyzeEcmascriptModuleResult>> {
    Ok(analyse_ecmascript_module(module, Some(part)))
}

#[turbo_tasks::value_impl]
impl EvaluatableAsset for EcmascriptModulePartAsset {}
