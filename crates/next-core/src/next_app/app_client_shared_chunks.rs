use anyhow::Result;
use tracing::Instrument;
use turbo_tasks::{ResolvedVc, Value, Vc};
use turbopack_core::{
    chunk::{
        availability_info::AvailabilityInfo, ChunkGroupResult, ChunkingContext, EvaluatableAssets,
    },
    ident::AssetIdent,
    module_graph::{chunk_group_info::ChunkGroup, ModuleGraph},
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

    let span = tracing::trace_span!("app client shared");
    let app_client_shared_chunk_grou = async {
        client_chunking_context
            .evaluated_chunk_group(
                ident,
                ChunkGroup::Entry(
                    app_client_runtime_entries
                        .await?
                        .iter()
                        .map(|v| ResolvedVc::upcast(*v))
                        .collect(),
                ),
                module_graph,
                Value::new(AvailabilityInfo::Root),
            )
            .resolve()
            .await
    }
    .instrument(span)
    .await?;

    Ok(app_client_shared_chunk_grou)
}
