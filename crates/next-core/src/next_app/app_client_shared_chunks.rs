use anyhow::Result;
use tracing::Instrument;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{
    chunk::{
        ChunkGroupResult, ChunkingContext, EvaluatableAssets, availability_info::AvailabilityInfo,
    },
    ident::AssetIdent,
    module_graph::{ModuleGraph, chunk_group_info::ChunkGroup},
    output::OutputAssets,
};

#[turbo_tasks::function]
pub async fn get_app_client_shared_chunk_group(
    ident: Vc<AssetIdent>,
    app_client_runtime_entries: Vc<EvaluatableAssets>,
    module_graph: Vc<ModuleGraph>,
    client_chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<Vc<ChunkGroupResult>> {
    if turbo_tasks::read!(app_client_runtime_entries)?.is_empty() {
        return Ok(ChunkGroupResult::empty());
    }

    let span = tracing::trace_span!("app client shared");
    #[cfg(not(feature = "sync"))]
    let app_client_shared_chunk_group = turbo_tasks::read!(
        async {
            turbo_tasks::read!(
                client_chunking_context
                    .evaluated_chunk_group(
                        ident,
                        ChunkGroup::Entry(
                            turbo_tasks::read!(app_client_runtime_entries)?
                                .iter()
                                .map(|v| ResolvedVc::upcast(*v))
                                .collect(),
                        ),
                        module_graph,
                        // The shared chunk group must stay shared across pages; page-specific HMR
                        // chunks (e.g. client references) are routed through a separate
                        // page-specific evaluated chunk group instead.
                        OutputAssets::empty(),
                        AvailabilityInfo::root(),
                    )
                    .to_resolved()
            )
            .map(|r| *r)
        }
        .instrument(span)
    )?;
    #[cfg(feature = "sync")]
    let app_client_shared_chunk_group = {
        let _guard = span.entered();
        turbo_tasks::read!(
            client_chunking_context
                .evaluated_chunk_group(
                    ident,
                    ChunkGroup::Entry(
                        turbo_tasks::read!(app_client_runtime_entries)?
                            .iter()
                            .map(|v| ResolvedVc::upcast(*v))
                            .collect(),
                    ),
                    module_graph,
                    // The shared chunk group must stay shared across pages; page-specific HMR
                    // chunks (e.g. client references) are routed through a separate page-specific
                    // evaluated chunk group instead.
                    OutputAssets::empty(),
                    AvailabilityInfo::root(),
                )
                .to_resolved()
        )
        .map(|r| *r)
    }?;

    Ok(app_client_shared_chunk_group)
}
