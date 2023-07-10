use anyhow::{bail, Context, Result};
use turbo_tasks::{primitives::StringVc, Value};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{
        availability_info::AvailabilityInfo, ChunkVc, ChunkableModule, ChunkableModuleVc,
        ChunkingContextVc,
    },
    ident::AssetIdentVc,
    module::{Module, ModuleVc},
    reference::{AssetReferencesVc, SingleAssetReferenceVc},
    resolve::ModulePartVc,
};

use super::{chunk_item::EcmascriptModulePartChunkItem, get_part_id, split_module, SplitResult};
use crate::{
    chunk::{
        EcmascriptChunkItemVc, EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc,
        EcmascriptChunkVc, EcmascriptChunkingContextVc, EcmascriptExportsVc,
    },
    references::analyze_ecmascript_module,
    AnalyzeEcmascriptModuleResultVc, EcmascriptModuleAssetVc,
};

/// A reference to part of an ES module.
///
/// This type is used for an advanced tree shkaing.
#[turbo_tasks::value]
pub struct EcmascriptModulePartAsset {
    pub(crate) full_module: EcmascriptModuleAssetVc,
    pub(crate) part: ModulePartVc,
}

#[turbo_tasks::value_impl]
impl EcmascriptModulePartAssetVc {
    /// Create a new instance of [EcmascriptModulePartAssetVc], whcih consists
    /// of a pointer to the full module and the [ModulePart] pointing the part
    /// of the module.
    #[turbo_tasks::function]
    pub fn new(module: EcmascriptModuleAssetVc, part: ModulePartVc) -> Self {
        EcmascriptModulePartAsset {
            full_module: module,
            part,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptModulePartAsset {
    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        // This is not reachable because EcmascriptModulePartAsset implements
        // ChunkableModule and ChunkableModule::as_chunk is called instead.
        todo!("EcmascriptModulePartAsset::content is not implemented")
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
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
                Ok(SingleAssetReferenceVc::new(
                    EcmascriptModulePartAssetVc::new(
                        self.full_module,
                        ModulePartVc::internal(part_id),
                    )
                    .as_asset(),
                    StringVc::cell("ecmascript module part".to_string()),
                )
                .as_asset_reference())
            })
            .collect::<Result<Vec<_>>>()?;

        let external = analyze(self.full_module, self.part)
            .await?
            .references
            .await?;

        assets.extend(external.iter().cloned());

        Ok(AssetReferencesVc::cell(assets))
    }

    #[turbo_tasks::function]
    async fn ident(&self) -> Result<AssetIdentVc> {
        let inner = self.full_module.ident();

        Ok(inner.with_part(self.part))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for EcmascriptModulePartAsset {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        self_vc: EcmascriptModulePartAssetVc,
        context: EcmascriptChunkingContextVc,
    ) -> Result<EcmascriptChunkItemVc> {
        Ok(EcmascriptModulePartChunkItem {
            module: self_vc,
            context,
        }
        .cell()
        .into())
    }

    #[turbo_tasks::function]
    async fn get_exports(self_vc: EcmascriptModuleAssetVc) -> Result<EcmascriptExportsVc> {
        Ok(self_vc.analyze().await?.exports)
    }
}

#[turbo_tasks::value_impl]
impl Module for EcmascriptModulePartAsset {}

#[turbo_tasks::value_impl]
impl ChunkableModule for EcmascriptModulePartAsset {
    #[turbo_tasks::function]
    async fn as_chunk(
        self_vc: EcmascriptModulePartAssetVc,
        context: ChunkingContextVc,
        availability_info: Value<AvailabilityInfo>,
    ) -> ChunkVc {
        EcmascriptChunkVc::new(
            context,
            self_vc.as_ecmascript_chunk_placeable(),
            availability_info,
        )
        .into()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptModulePartAssetVc {
    #[turbo_tasks::function]
    pub(super) async fn analyze(self) -> Result<AnalyzeEcmascriptModuleResultVc> {
        let this = self.await?;

        Ok(analyze(this.full_module, this.part))
    }
}

#[turbo_tasks::function]
async fn analyze(
    full_module: EcmascriptModuleAssetVc,
    part: ModulePartVc,
) -> Result<AnalyzeEcmascriptModuleResultVc> {
    let module = full_module.await?;

    Ok(analyze_ecmascript_module(
        module.source,
        full_module.as_resolve_origin(),
        Value::new(module.ty),
        module.transforms,
        Value::new(module.options),
        module.compile_time_info,
        Some(part),
    ))
}
