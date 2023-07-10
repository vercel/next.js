use turbopack_core::{asset::AssetVc, module::ModuleVc, resolve::ModulePartVc};

use crate::ModuleAssetContextVc;

#[turbo_tasks::value_trait]
pub trait CustomModuleType {
    fn create_module(
        &self,
        source: AssetVc,
        context: ModuleAssetContextVc,
        part: Option<ModulePartVc>,
    ) -> ModuleVc;
}
