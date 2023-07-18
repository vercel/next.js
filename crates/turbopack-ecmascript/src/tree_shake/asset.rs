use anyhow::{bail, Context, Result};
use turbo_tasks::{Value, Vc};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{availability_info::AvailabilityInfo, Chunk, ChunkableModule, ChunkingContext},
    ident::AssetIdent,
    module::Module,
    reference::{AssetReferences, SingleAssetReference},
    resolve::ModulePart,
};

use super::{chunk_item::EcmascriptModulePartChunkItem, get_part_id, split_module, SplitResult};
use crate::{
    chunk::{
        EcmascriptChunk, EcmascriptChunkItem, EcmascriptChunkPlaceable, EcmascriptChunkingContext,
        EcmascriptExports,
    },
    references::analyze_ecmascript_module,
    AnalyzeEcmascriptModuleResult, EcmascriptModuleAsset,
};

/// A reference to part of an ES module.
///
/// This type is used for an advanced tree shkaing.
#[turbo_tasks::value]
pub struct EcmascriptModulePartAsset {
    pub(crate) full_module: Vc<EcmascriptModuleAsset>,
    pub(crate) part: Vc<ModulePart>,
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
}

#[turbo_tasks::value_impl]
impl Module for EcmascriptModulePartAsset {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        let inner = self.full_module.ident();

        Ok(inner.with_part(self.part))
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<AssetReferences>> {
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
                Ok(Vc::upcast(SingleAssetReference::new(
                    Vc::upcast(EcmascriptModulePartAsset::new(
                        self.full_module,
                        ModulePart::internal(part_id),
                    )),
                    Vc::cell("ecmascript module part".to_string()),
                )))
            })
            .collect::<Result<Vec<_>>>()?;

        let external = analyze(self.full_module, self.part)
            .await?
            .references
            .await?;

        assets.extend(external.iter().cloned());

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
    async fn as_chunk_item(
        self: Vc<Self>,
        context: Vc<Box<dyn EcmascriptChunkingContext>>,
    ) -> Result<Vc<Box<dyn EcmascriptChunkItem>>> {
        Ok(Vc::upcast(
            EcmascriptModulePartChunkItem {
                module: self,
                context,
            }
            .cell(),
        ))
    }

    #[turbo_tasks::function]
    async fn get_exports(self: Vc<Self>) -> Result<Vc<EcmascriptExports>> {
        Ok(self.analyze().await?.exports)
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for EcmascriptModulePartAsset {
    #[turbo_tasks::function]
    async fn as_chunk(
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
impl EcmascriptModulePartAsset {
    #[turbo_tasks::function]
    pub(super) async fn analyze(self: Vc<Self>) -> Result<Vc<AnalyzeEcmascriptModuleResult>> {
        let this = self.await?;

        Ok(analyze(this.full_module, this.part))
    }
}

#[turbo_tasks::function]
async fn analyze(
    full_module: Vc<EcmascriptModuleAsset>,
    part: Vc<ModulePart>,
) -> Result<Vc<AnalyzeEcmascriptModuleResult>> {
    let module = full_module.await?;

    Ok(analyze_ecmascript_module(
        module.source,
        Vc::upcast(full_module),
        Value::new(module.ty),
        module.transforms,
        Value::new(module.options),
        module.compile_time_info,
        Some(part),
    ))
}
