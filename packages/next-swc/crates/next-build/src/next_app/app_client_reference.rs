use std::collections::HashSet;

use anyhow::Result;
use indexmap::IndexMap;
use next_core::{
    next_client_reference::ClientReferenceType,
    {self},
};
use turbo_tasks::{TryJoinIterExt, Vc};
use turbopack_binding::turbopack::{
    build::BuildChunkingContext,
    core::{
        chunk::{ChunkableModule, ChunkingContext},
        output::{OutputAsset, OutputAssets},
    },
    ecmascript::chunk::EcmascriptChunkingContext,
};

/// Computes all client references chunks, and adds them to the relevant
/// manifests.
///
/// This returns a map from client reference type to the chunks that reference
/// type needs to load.
pub async fn compute_app_client_references_chunks(
    app_client_reference_types: &HashSet<ClientReferenceType>,
    client_chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
    ssr_chunking_context: Vc<BuildChunkingContext>,
    all_chunks: &mut Vec<Vc<Box<dyn OutputAsset>>>,
) -> Result<IndexMap<ClientReferenceType, ClientReferenceChunks>> {
    let app_client_references_chunks: IndexMap<_, _> = app_client_reference_types
        .iter()
        .map(|client_reference_ty| async move {
            Ok((
                *client_reference_ty,
                match client_reference_ty {
                    ClientReferenceType::EcmascriptClientReference(ecmascript_client_reference) => {
                        let ecmascript_client_reference_ref = ecmascript_client_reference.await?;
                        let client_entry_chunk = ecmascript_client_reference_ref
                            .client_module
                            .as_root_chunk(Vc::upcast(client_chunking_context));
                        let ssr_entry_chunk = ecmascript_client_reference_ref
                            .ssr_module
                            .as_root_chunk(Vc::upcast(ssr_chunking_context));
                        ClientReferenceChunks {
                            client_chunks: client_chunking_context.chunk_group(client_entry_chunk),
                            ssr_chunks: ssr_chunking_context.chunk_group(ssr_entry_chunk),
                        }
                    }
                    ClientReferenceType::CssClientReference(css_client_reference) => {
                        let css_client_reference_ref = css_client_reference.await?;
                        let client_entry_chunk = css_client_reference_ref
                            .client_module
                            .as_root_chunk(Vc::upcast(client_chunking_context));
                        ClientReferenceChunks {
                            client_chunks: client_chunking_context.chunk_group(client_entry_chunk),
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

    for (app_client_reference_ty, app_client_reference_chunks) in &app_client_references_chunks {
        match app_client_reference_ty {
            ClientReferenceType::EcmascriptClientReference(_) => {
                let client_chunks = &app_client_reference_chunks.client_chunks.await?;
                let ssr_chunks = &app_client_reference_chunks.ssr_chunks.await?;
                all_chunks.extend(client_chunks.iter().copied());
                all_chunks.extend(ssr_chunks.iter().copied());
            }
            ClientReferenceType::CssClientReference(_) => {
                let client_chunks = &app_client_reference_chunks.client_chunks.await?;
                all_chunks.extend(client_chunks.iter().copied());
            }
        }
    }

    Ok(app_client_references_chunks)
}

/// Contains the chunks corresponding to a client reference.
pub struct ClientReferenceChunks {
    /// Chunks to be loaded on the client.
    pub client_chunks: Vc<OutputAssets>,
    /// Chunks to be loaded on the server for SSR.
    pub ssr_chunks: Vc<OutputAssets>,
}
