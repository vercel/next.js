use anyhow::{bail, Context, Result};
use turbo_tasks::Vc;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkableModule, ChunkingContext},
    ident::AssetIdent,
    module::Module,
    reference::{ModuleReferences, SingleModuleReference},
    resolve::ModulePart,
};

use super::{chunk_item::EcmascriptModulePartChunkItem, get_part_id, split_module, SplitResult};
use crate::{
    chunk::{EcmascriptChunkPlaceable, EcmascriptChunkingContext, EcmascriptExports},
    references::analyse_ecmascript_module,
    AnalyzeEcmascriptModuleResult, EcmascriptModuleAsset,
};

/// A reference to part of an ES module.
///
/// This type is used for an advanced tree shkaing.
#[turbo_tasks::value]
pub struct EcmascriptModulePartAsset {
    pub(crate) full_module: Vc<EcmascriptModuleAsset>,
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
}

#[turbo_tasks::value_impl]
impl Module for EcmascriptModulePartAsset {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        let inner = self.full_module.ident();

        Ok(inner.with_part(self.part))
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        let split_data = split_module(self.full_module).await?;

        let deps = match &*split_data {
            SplitResult::Ok { deps, .. } => deps,
            _ => {
                bail!("failed to split module")
            }
        };

        let part_id = get_part_id(&split_data, self.part)
            .await
            .with_context(|| format!("part {:?} is not found in the module", self.part))?;

        let deps = match deps.get(&part_id) {
            Some(v) => v,
            None => bail!("part {:?} is not found in the module", part_id),
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
                    Vc::cell("ecmascript module part".to_string()),
                )))
            })
            .collect::<Result<Vec<_>>>()?;

        let analyze = analyze(self.full_module, self.part).await?;

        assets.extend(analyze.references.await?.iter().cloned());

        Ok(Vc::cell(assets))
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptModulePartAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        // This is not reachable because EcmascriptModulePartAsset implements
        // ChunkableModule and ChunkableModule::as_chunk is called instead.
        todo!("EcmascriptModulePartAsset::content is not implemented")
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
        let chunking_context =
            Vc::try_resolve_downcast::<Box<dyn EcmascriptChunkingContext>>(chunking_context)
                .await?
                .context(
                    "chunking context must impl EcmascriptChunkingContext to use \
                     EcmascriptModulePartAsset",
                )?;
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
