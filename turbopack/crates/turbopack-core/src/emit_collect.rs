use turbo_rcstr::RcStr;
use turbo_tasks::Vc;

use crate::{
    chunk::{ChunkItem, ChunkingContext},
    module::{Module, Modules},
    module_graph::ModuleGraph,
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
        chunk_group: Vc<Modules>,
    ) -> Vc<Box<dyn ChunkItem>>;
}

// TODO why does `EmittedModuleReference: ModuleReference` not work?
// error[E0599]: the method `data` exists for struct `ResolvedVc<Box<dyn EmittedModuleReference>>`,
// but its trait bounds were not satisfied    --> turbopack/crates/turbopack/src/collect_module.rs:
// 330:40     |
// 330 |                           Some(reference.data().await?)
//     |                                          ^^^^ method cannot be called on
// `ResolvedVc<Box<dyn EmittedModuleReference>>` due to unsatisfied trait bounds     |
//    ::: /Users/niklas/.rustup/toolchains/nightly-2026-02-18-aarch64-apple-darwin/lib/rustlib/src/
// rust/library/alloc/src/boxed.rs:234:1     |
// 234 | / pub struct Box<
// 235 | |     T: ?Sized,
// 236 | |     #[unstable(feature = "allocator_api", issue = "32838")] A: Allocator = Global,
// 237 | | >(Unique<T>, A);
//     | |_- doesn't satisfy `_: EmittedModuleReference` or `_: ModuleReference`
//     |
//     = note: the following trait bounds were not satisfied:
//             `std::boxed::Box<dyn turbopack_core::emit_collect::EmittedModuleReference>:
// turbopack_core::reference::ModuleReference`             which is required by `std::boxed::Box<dyn
// turbopack_core::emit_collect::EmittedModuleReference>:
// turbopack_core::emit_collect::EmittedModuleReference`     = note: the full name for the type has
// been written to
// '/Users/niklas/code/next.js-other/target/rust-analyzer/debug/deps/turbopack-ea315ed4f922e76f.
// long-type-12349184873382223084.txt'     = note: consider using `--verbose` to print the full type
// name to the console#[turbo_tasks::value_trait]
#[turbo_tasks::value_trait]
pub trait EmittedModuleReference {
    // TODO Vc<JsValue>
    #[turbo_tasks::function]
    fn data(self: Vc<Self>) -> Vc<Option<RcStr>>;
}
