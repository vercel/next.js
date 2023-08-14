use anyhow::Result;
use turbo_tasks::{TryJoinIterExt, Value, Vc};
use turbopack_binding::turbopack::{
    core::{
        chunk::{availability_info::AvailabilityInfo, ChunkingContext, EvaluatableAssets},
        output::OutputAssets,
    },
    ecmascript::chunk::{EcmascriptChunk, EcmascriptChunkPlaceable, EcmascriptChunkingContext},
};

#[turbo_tasks::function]
pub async fn get_app_shared_client_chunk(
    app_client_runtime_entries: Vc<EvaluatableAssets>,
    client_chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
) -> Result<Vc<EcmascriptChunk>> {
    let client_runtime_entries: Vec<_> = app_client_runtime_entries
        .await?
        .iter()
        .map(|entry| async move {
            Ok(Vc::try_resolve_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(*entry).await?)
        })
        .try_join()
        .await?
        .into_iter()
        .flatten()
        .collect();

    Ok(EcmascriptChunk::new_normalized(
        client_chunking_context,
        // TODO(alexkirsz) Should this accept Evaluatable instead?
        Vc::cell(client_runtime_entries),
        None,
        Value::new(AvailabilityInfo::Untracked),
    ))
}

#[turbo_tasks::function]
pub async fn get_app_client_shared_chunks(
    app_client_runtime_entries: Vc<EvaluatableAssets>,
    client_chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
) -> Result<Vc<OutputAssets>> {
    if app_client_runtime_entries.await?.is_empty() {
        return Ok(OutputAssets::empty());
    }

    let app_client_shared_chunk =
        get_app_shared_client_chunk(app_client_runtime_entries, client_chunking_context);

    let app_client_shared_chunks = client_chunking_context.evaluated_chunk_group(
        Vc::upcast(app_client_shared_chunk),
        app_client_runtime_entries,
    );

    Ok(app_client_shared_chunks)
}
