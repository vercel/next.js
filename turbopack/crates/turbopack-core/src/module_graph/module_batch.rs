use turbo_tasks::{ResolvedVc, Vc};

use crate::{module::Module, module_graph::chunk_group_info::RoaringBitmapWrapper};

#[turbo_tasks::value]
pub struct ModuleBatch {
    pub modules: Vec<ResolvedVc<Box<dyn Module>>>,
    pub chunk_groups: Option<RoaringBitmapWrapper>,
}

#[turbo_tasks::value_impl]
impl ModuleBatch {
    #[turbo_tasks::function]
    pub fn new(
        modules: Vec<ResolvedVc<Box<dyn Module>>>,
        chunk_groups: Option<RoaringBitmapWrapper>,
    ) -> Vc<Self> {
        Self {
            modules,
            chunk_groups,
        }
        .cell()
    }
}
