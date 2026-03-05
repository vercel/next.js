use turbo_rcstr::RcStr;
use turbo_tasks::Vc;

use crate::{
    chunk::{ChunkItem, ChunkingContext},
    module::Module,
    module_graph::{ModuleGraph, chunk_group_info::ChunkGroup},
};

/// A module that can collect other modules during the collect phase.
#[turbo_tasks::value_trait]
pub trait CollectingModule: Module {
    /// The namespace that this module is interesed in
    #[turbo_tasks::function]
    fn namespace(self: Vc<Self>) -> Vc<RcStr>;

    #[turbo_tasks::function]
    fn as_chunk_item(
        self: Vc<Self>,
        module_graph: Vc<ModuleGraph>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        chunk_group: ChunkGroup,
    ) -> Vc<Box<dyn ChunkItem>>;
}
