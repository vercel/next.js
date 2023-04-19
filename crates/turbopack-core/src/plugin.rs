use crate::{asset::AssetVc, context::AssetContextVc, resolve::ModulePartVc};

#[turbo_tasks::value_trait]
pub trait CustomModuleType {
    fn create_module(
        &self,
        source: AssetVc,
        context: AssetContextVc,
        part: Option<ModulePartVc>,
    ) -> AssetVc;
}
