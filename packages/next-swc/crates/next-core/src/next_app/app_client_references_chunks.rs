use anyhow::Result;
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use turbo_tasks::{debug::ValueDebugFormat, trace::TraceRawVcs, TryJoinIterExt, Vc};
use turbopack_binding::turbopack::{
    build::BuildChunkingContext,
    core::{chunk::ChunkingContextExt, output::OutputAssets},
    ecmascript::chunk::EcmascriptChunkingContext,
};

use crate::next_client_reference::{ClientReferenceType, ClientReferenceTypes};

/// Contains the chunks corresponding to a client reference.
#[derive(
    Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat,
)]
pub struct ClientReferenceChunks {
    /// Chunks to be loaded on the client.
    pub client_chunks: Vc<OutputAssets>,
    /// Chunks to be loaded on the server for SSR.
    pub ssr_chunks: Vc<OutputAssets>,
}

#[turbo_tasks::value(transparent)]
pub struct ClientReferencesChunks(IndexMap<ClientReferenceType, ClientReferenceChunks>);

/// Computes all client references chunks.
///
/// This returns a map from client reference type to the chunks that reference
/// type needs to load.
#[turbo_tasks::function]
pub async fn get_app_client_references_chunks(
    app_client_reference_types: Vc<ClientReferenceTypes>,
    client_chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
    ssr_chunking_context: Vc<BuildChunkingContext>,
) -> Result<Vc<ClientReferencesChunks>> {
    let app_client_references_chunks: IndexMap<_, _> = app_client_reference_types
        .await?
        .iter()
        .map(|client_reference_ty| async move {
            Ok((
                *client_reference_ty,
                match client_reference_ty {
                    ClientReferenceType::EcmascriptClientReference(ecmascript_client_reference) => {
                        let ecmascript_client_reference_ref = ecmascript_client_reference.await?;
                        ClientReferenceChunks {
                            client_chunks: client_chunking_context.root_chunk_group(Vc::upcast(
                                ecmascript_client_reference_ref.client_module,
                            )),
                            ssr_chunks: ssr_chunking_context.root_chunk_group(Vc::upcast(
                                ecmascript_client_reference_ref.ssr_module,
                            )),
                        }
                    }
                    ClientReferenceType::CssClientReference(css_client_reference) => {
                        let css_client_reference_ref = css_client_reference.await?;
                        ClientReferenceChunks {
                            client_chunks: client_chunking_context.root_chunk_group(Vc::upcast(
                                css_client_reference_ref.client_module,
                            )),
                            ssr_chunks: OutputAssets::empty(),
                        }
                    }
                },
            ))
        })
        .try_join()
        .await?
        .into_iter()
        .collect();

    Ok(Vc::cell(app_client_references_chunks))
}
