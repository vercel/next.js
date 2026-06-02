use anyhow::Result;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::module_graph::{ModuleGraph, runtime_features::RuntimeFeatures};
use turbopack_wasm::module_asset::WebAssemblyModuleAsset;

/// Scans a module graph to determine which optional runtime features the application
/// actually uses, so the runtime can be built without the code for unused features.
///
/// This lives in the umbrella `turbopack` crate because it needs to know about concrete
/// module types (e.g. [`WebAssemblyModuleAsset`]) which depend on `turbopack-core`, while
/// [`RuntimeFeatures`] itself lives in `turbopack-core` so it can be referenced from the
/// runtime-generation crates.
#[turbo_tasks::function]
pub async fn compute_runtime_features(graph: Vc<ModuleGraph>) -> Result<Vc<RuntimeFeatures>> {
    let graph = graph.await?;

    let mut has_wasm = false;
    for node in graph.iter_reachable_nodes()? {
        if ResolvedVc::try_downcast_type::<WebAssemblyModuleAsset>(node.module()).is_some() {
            has_wasm = true;
            break;
        }
    }

    Ok(RuntimeFeatures { has_wasm }.cell())
}
