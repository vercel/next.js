use turbo_rcstr::RcStr;
use turbo_tasks::{ValueToString, Vc};

use crate::{
    chunk::{ChunkItem, ChunkingContext},
    module::{Module, Modules},
    module_graph::ModuleGraph,
    reference::ModuleReference,
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
        entry_chunk_group: Vc<Modules>,
    ) -> Vc<Box<dyn ChunkItem>>;
}

#[turbo_tasks::value_trait]
pub trait EmittedModuleReference: ModuleReference + ValueToString {
    // TODO Vc<JsValue>
    #[turbo_tasks::function]
    fn data(self: Vc<Self>) -> Vc<Option<RcStr>>;
}
