use turbopack_core::{module::ModuleVc, resolve::ModulePartVc, source::SourceVc};

use crate::ModuleAssetContextVc;

#[turbo_tasks::value_trait]
pub trait CustomModuleType {
    fn create_module(
        &self,
        source: SourceVc,
        context: ModuleAssetContextVc,
        part: Option<ModulePartVc>,
    ) -> ModuleVc;
}
