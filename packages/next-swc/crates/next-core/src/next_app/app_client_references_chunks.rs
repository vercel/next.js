use anyhow::Result;
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use tracing::Instrument;
use turbo_tasks::{
    debug::ValueDebugFormat, trace::TraceRawVcs, TryFlatJoinIterExt, TryJoinIterExt, Vc,
};
use turbopack_binding::turbopack::{
    core::{chunk::ChunkingContextExt, ident::AssetIdent, module::Module, output::OutputAssets},
    ecmascript::chunk::EcmascriptChunkingContext,
};

use super::include_modules_module::IncludeModulesModule;
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
    base_ident: Vc<AssetIdent>,
    app_client_reference_types: Vc<ClientReferenceTypes>,
    client_chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
    ssr_chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
) -> Result<Vc<ClientReferencesChunks>> {
    async move {
        // TODO Reconsider this. Maybe it need to be true in production.
        let separate_chunk_group_per_client_reference = false;
        let app_client_reference_types = app_client_reference_types.await?;
        if separate_chunk_group_per_client_reference {
            let app_client_references_chunks: IndexMap<_, _> = app_client_reference_types
                .iter()
                .map(|client_reference_ty| async move {
                    Ok((
                        *client_reference_ty,
                        match client_reference_ty {
                            ClientReferenceType::EcmascriptClientReference(
                                ecmascript_client_reference,
                            ) => {
                                let ecmascript_client_reference_ref =
                                    ecmascript_client_reference.await?;
                                ClientReferenceChunks {
                                    client_chunks: client_chunking_context.root_chunk_group(
                                        Vc::upcast(ecmascript_client_reference_ref.client_module),
                                    ),
                                    ssr_chunks: ssr_chunking_context.root_chunk_group(Vc::upcast(
                                        ecmascript_client_reference_ref.ssr_module,
                                    )),
                                }
                            }
                            ClientReferenceType::CssClientReference(css_client_reference) => {
                                let css_client_reference_ref = css_client_reference.await?;
                                ClientReferenceChunks {
                                    client_chunks: client_chunking_context.root_chunk_group(
                                        Vc::upcast(css_client_reference_ref.client_module),
                                    ),
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
        } else {
            let ssr_modules = app_client_reference_types
                .iter()
                .map(|client_reference_ty| async move {
                    Ok(match client_reference_ty {
                        ClientReferenceType::EcmascriptClientReference(
                            ecmascript_client_reference,
                        ) => {
                            let ecmascript_client_reference_ref =
                                ecmascript_client_reference.await?;
                            Some(Vc::upcast(ecmascript_client_reference_ref.ssr_module))
                        }
                        _ => None,
                    })
                })
                .try_flat_join()
                .await?;
            let ssr_entry_module = IncludeModulesModule::new(
                base_ident.with_modifier(Vc::cell("client modules ssr".to_string())),
                Vc::cell(ssr_modules),
            );
            let client_modules = app_client_reference_types
                .iter()
                .map(|client_reference_ty| async move {
                    Ok(match client_reference_ty {
                        ClientReferenceType::EcmascriptClientReference(
                            ecmascript_client_reference,
                        ) => {
                            let ecmascript_client_reference_ref =
                                ecmascript_client_reference.await?;
                            Vc::upcast(ecmascript_client_reference_ref.client_module)
                        }
                        ClientReferenceType::CssClientReference(css_client_reference) => {
                            let css_client_reference_ref = css_client_reference.await?;
                            Vc::upcast(css_client_reference_ref.client_module)
                        }
                    })
                })
                .try_join()
                .await?;
            let client_entry_module = IncludeModulesModule::new(
                base_ident.with_modifier(Vc::cell("client modules".to_string())),
                Vc::cell(client_modules),
            );
            let global_entry_module = ClientReferenceChunks {
                client_chunks: {
                    let _span = tracing::info_span!("client side rendering").entered();
                    client_chunking_context.root_chunk_group(Vc::upcast(client_entry_module))
                },
                ssr_chunks: {
                    let _span = tracing::info_span!("server side rendering").entered();
                    ssr_chunking_context.root_chunk_group(Vc::upcast(ssr_entry_module))
                },
            };

            let app_client_references_chunks: IndexMap<_, _> = app_client_reference_types
                .iter()
                .map(move |&client_reference_ty| (client_reference_ty, global_entry_module.clone()))
                .collect();

            Ok(Vc::cell(app_client_references_chunks))
        }
    }
    .instrument(tracing::info_span!("process client references"))
    .await
}

/// Crawls all modules emitted in the client transition, returning a list of all
/// client JS modules.
#[turbo_tasks::function]
pub async fn get_app_server_reference_modules(
    app_client_reference_types: Vc<ClientReferenceTypes>,
) -> Result<Vc<Vec<Vc<Box<dyn Module>>>>> {
    Ok(Vc::cell(
        app_client_reference_types
            .await?
            .iter()
            .map(|client_reference_ty| async move {
                Ok(match client_reference_ty {
                    ClientReferenceType::EcmascriptClientReference(ecmascript_client_reference) => {
                        let ecmascript_client_reference_ref = ecmascript_client_reference.await?;
                        Some(Vc::upcast(ecmascript_client_reference_ref.client_module))
                    }
                    _ => None,
                })
            })
            .try_flat_join()
            .await?,
    ))
}
