use anyhow::Result;
use turbo_tasks::{Value, Vc};
use turbopack_core::{
    chunk::{
        availability_info::AvailabilityInfo, ChunkGroupResult, ChunkingContext, EvaluatableAssets,
    },
    ident::AssetIdent,
    module_graph::ModuleGraph,
    output::OutputAssets,
};

#[turbo_tasks::function]
pub async fn get_app_client_shared_chunk_group(
    ident: Vc<AssetIdent>,
    app_client_runtime_entries: Vc<EvaluatableAssets>,
    module_graph: Vc<ModuleGraph>,
    client_chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<Vc<ChunkGroupResult>> {
    if app_client_runtime_entries.await?.is_empty() {
        return Ok(ChunkGroupResult {
            assets: OutputAssets::empty().to_resolved().await?,
            availability_info: AvailabilityInfo::Root,
        }
        .cell());
    }

    let _span = tracing::trace_span!("app client shared").entered();
    let app_client_shared_chunk_grou = client_chunking_context.evaluated_chunk_group(
        ident,
        app_client_runtime_entries,
        module_graph,
        Value::new(AvailabilityInfo::Root),
    );

    Ok(app_client_shared_chunk_grou)
}
