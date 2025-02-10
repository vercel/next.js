use turbo_tasks::Vc;
use turbopack_core::{module::Module, resolve::ModulePart, source::Source};

use crate::ModuleAssetContext;

#[turbo_tasks::value_trait]
pub trait CustomModuleType {
    fn create_module(
        self: Vc<Self>,
        source: Vc<Box<dyn Source>>,
        module_asset_context: Vc<ModuleAssetContext>,
        part: Option<ModulePart>,
    ) -> Vc<Box<dyn Module>>;
}
