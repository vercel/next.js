use anyhow::Result;
use turbo_tasks::{Value, Vc};
use turbopack_binding::turbopack::{
    core::{
        chunk::{availability_info::AvailabilityInfo, ChunkingContextExt, EvaluatableAssets},
        ident::AssetIdent,
        output::OutputAssets,
    },
    ecmascript::chunk::EcmascriptChunkingContext,
};

#[turbo_tasks::function]
pub async fn get_app_client_shared_chunks(
    ident: Vc<AssetIdent>,
    app_client_runtime_entries: Vc<EvaluatableAssets>,
    client_chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
) -> Result<Vc<OutputAssets>> {
    if app_client_runtime_entries.await?.is_empty() {
        return Ok(OutputAssets::empty());
    }

    let app_client_shared_chunks = client_chunking_context.evaluated_chunk_group_assets(
        ident,
        app_client_runtime_entries,
        Value::new(AvailabilityInfo::Root),
    );

    Ok(app_client_shared_chunks)
}
