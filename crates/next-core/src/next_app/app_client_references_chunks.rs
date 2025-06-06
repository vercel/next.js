use anyhow::Result;
use tracing::Instrument;
use turbo_rcstr::rcstr;
use turbo_tasks::{FxIndexMap, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, ValueToString, Vc};
use turbopack_core::{
    chunk::{ChunkingContext, availability_info::AvailabilityInfo},
    module::Module,
    module_graph::{ModuleGraph, chunk_group_info::ChunkGroup},
    output::OutputAssets,
};

use crate::{
    next_client_reference::{
        ClientReferenceType,
        ecmascript_client_reference::ecmascript_client_reference_module::{
            ecmascript_client_reference_merge_tag, ecmascript_client_reference_merge_tag_ssr,
        },
        visit_client_reference::ClientReferenceGraphResult,
    },
    next_server_component::server_component_module::NextServerComponentModule,
};

#[turbo_tasks::value]
pub struct ClientReferencesChunks {
    pub client_component_client_chunks:
        FxIndexMap<ClientReferenceType, (ResolvedVc<OutputAssets>, AvailabilityInfo)>,
    pub client_component_ssr_chunks:
        FxIndexMap<ClientReferenceType, (ResolvedVc<OutputAssets>, AvailabilityInfo)>,
    pub layout_segment_client_chunks:
        FxIndexMap<ResolvedVc<NextServerComponentModule>, ResolvedVc<OutputAssets>>,
}

/// Computes all client references chunks.
///
/// This returns a map from client reference type to the chunks that reference
/// type needs to load.
#[turbo_tasks::function]
pub async fn get_app_client_references_chunks(
    app_client_references: Vc<ClientReferenceGraphResult>,
    module_graph: Vc<ModuleGraph>,
    client_chunking_context: Vc<Box<dyn ChunkingContext>>,
    client_availability_info: AvailabilityInfo,
    ssr_chunking_context: Option<Vc<Box<dyn ChunkingContext>>>,
) -> Result<Vc<ClientReferencesChunks>> {
    async move {
        // TODO Reconsider this. Maybe it need to be true in production.
        let separate_chunk_group_per_client_reference = false;
        let app_client_references = app_client_references.await?;
        if separate_chunk_group_per_client_reference {
            todo!();
            // let app_client_references_chunks: Vec<(_, (_, Option<_>))> = app_client_references
            //     .client_references
            //     .iter()
            //     .map(|client_reference| async move {
            //         let client_reference_ty = client_reference.ty();
            //         Ok((
            //             client_reference_ty,
            //             match client_reference_ty {
            //                 ClientReferenceType::EcmascriptClientReference(
            //                     ecmascript_client_reference,
            //                 ) => {
            //                     let ecmascript_client_reference_ref =
            //                         ecmascript_client_reference.await?;

            //                     let client_chunk_group = client_chunking_context
            //                         .root_chunk_group(
            //                             module_graph,
            //                             *ResolvedVc::upcast(
            //                                 ecmascript_client_reference_ref.client_module,
            //                             ),
            //                         )
            //                         .await?;

            //                     (
            //                         (
            //                             client_chunk_group.assets,
            //                             client_chunk_group.availability_info,
            //                         ),
            //                         if let Some(ssr_chunking_context) = ssr_chunking_context {
            //                             let ssr_chunk_group = ssr_chunking_context
            //                                 .root_chunk_group(
            //                                     *ResolvedVc::upcast(
            //                                         ecmascript_client_reference_ref.ssr_module,
            //                                     ),
            //                                     module_graph,
            //                                 )
            //                                 .await?;

            //                             Some((
            //                                 ssr_chunk_group.assets,
            //                                 ssr_chunk_group.availability_info,
            //                             ))
            //                         } else {
            //                             None
            //                         },
            //                     )
            //                 }
            //                 ClientReferenceType::CssClientReference(css_client_reference) => {
            //                     let client_chunk_group = client_chunking_context
            //                         .root_chunk_group(
            //                             *ResolvedVc::upcast(css_client_reference),
            //                             module_graph,
            //                         )
            //                         .await?;

            //                     (
            //                         (
            //                             client_chunk_group.assets,
            //                             client_chunk_group.availability_info,
            //                         ),
            //                         None,
            //                     )
            //                 }
            //             },
            //         ))
            //     })
            //     .try_join()
            //     .await?;

            // Ok(ClientReferencesChunks {
            //     client_component_client_chunks: app_client_references_chunks
            //         .iter()
            //         .map(|&(client_reference_ty, (client_chunks, _))| {
            //             (client_reference_ty, client_chunks)
            //         })
            //         .collect(),
            //     client_component_ssr_chunks: app_client_references_chunks
            //         .iter()
            //         .flat_map(|&(client_reference_ty, (_, ssr_chunks))| {
            //             ssr_chunks.map(|ssr_chunks| (client_reference_ty, ssr_chunks))
            //         })
            //         .collect(),
            //     layout_segment_client_chunks: FxIndexMap::default(),
            // }
            // .cell())
        } else {
            let mut client_references_by_server_component: FxIndexMap<_, Vec<_>> =
                FxIndexMap::default();
            let mut framework_reference_types = Vec::new();
            for &server_component in app_client_references.server_component_entries.iter() {
                client_references_by_server_component
                    .entry(server_component)
                    .or_default();
            }
            for client_reference in app_client_references.client_references.iter() {
                if let Some(server_component) = client_reference.server_component() {
                    client_references_by_server_component
                        .entry(server_component)
                        .or_default()
                        .push(client_reference.ty());
                } else {
                    framework_reference_types.push(client_reference.ty());
                }
            }
            // Framework components need to go into first layout segment
            if let Some((_, list)) = client_references_by_server_component.first_mut() {
                list.extend(framework_reference_types);
            }

            let chunk_group_info = module_graph.chunk_group_info();

            let mut current_client_availability_info = client_availability_info;
            let mut current_client_chunks = OutputAssets::empty().to_resolved().await?;
            let mut current_ssr_availability_info = AvailabilityInfo::Root;
            let mut current_ssr_chunks = OutputAssets::empty().to_resolved().await?;

            let mut layout_segment_client_chunks = FxIndexMap::default();
            let mut client_component_ssr_chunks = FxIndexMap::default();
            let mut client_component_client_chunks = FxIndexMap::default();

            for (server_component, client_reference_types) in
                client_references_by_server_component.into_iter()
            {
                let parent_chunk_group = *chunk_group_info
                    .get_index_of(ChunkGroup::Shared(ResolvedVc::upcast(
                        server_component.await?.module,
                    )))
                    .await?;

                let base_ident = server_component.ident();

                let server_path = server_component.server_path();
                let is_layout = server_path.file_stem().await?.as_deref() == Some("layout");
                let server_component_path = server_path.to_string().await?;

                let ssr_modules = client_reference_types
                    .iter()
                    .map(|client_reference_ty| async move {
                        Ok(match client_reference_ty {
                            ClientReferenceType::EcmascriptClientReference(
                                ecmascript_client_reference,
                            ) => {
                                let ecmascript_client_reference_ref =
                                    ecmascript_client_reference.await?;

                                Some(ResolvedVc::upcast(
                                    ecmascript_client_reference_ref.ssr_module,
                                ))
                            }
                            _ => None,
                        })
                    })
                    .try_flat_join()
                    .await?;

                let ssr_chunk_group = if !ssr_modules.is_empty() {
                    ssr_chunking_context.map(|ssr_chunking_context| {
                        let _span = tracing::info_span!(
                            "server side rendering",
                            layout_segment = display(&server_component_path),
                        )
                        .entered();

                        ssr_chunking_context.chunk_group(
                            base_ident.with_modifier(rcstr!("ssr modules")),
                            ChunkGroup::IsolatedMerged {
                                parent: parent_chunk_group,
                                merge_tag: ecmascript_client_reference_merge_tag_ssr(),
                                entries: ssr_modules,
                            },
                            module_graph,
                            current_ssr_availability_info,
                        )
                    })
                } else {
                    None
                };

                let client_modules = client_reference_types
                    .iter()
                    .map(|client_reference_ty| async move {
                        Ok(match client_reference_ty {
                            ClientReferenceType::EcmascriptClientReference(
                                ecmascript_client_reference,
                            ) => {
                                ResolvedVc::upcast(ecmascript_client_reference.await?.client_module)
                            }
                            ClientReferenceType::CssClientReference(css_client_reference) => {
                                ResolvedVc::upcast(*css_client_reference)
                            }
                        })
                    })
                    .try_join()
                    .await?;
                let client_chunk_group = if !client_modules.is_empty() {
                    let _span = tracing::info_span!(
                        "client side rendering",
                        layout_segment = display(&server_component_path),
                    )
                    .entered();

                    Some(client_chunking_context.chunk_group(
                        base_ident.with_modifier(rcstr!("client modules")),
                        ChunkGroup::IsolatedMerged {
                            parent: parent_chunk_group,
                            merge_tag: ecmascript_client_reference_merge_tag(),
                            entries: client_modules,
                        },
                        module_graph,
                        current_client_availability_info,
                    ))
                } else {
                    None
                };

                if let Some(client_chunk_group) = client_chunk_group {
                    let client_chunk_group = client_chunk_group.await?;

                    let client_chunks =
                        current_client_chunks.concatenate(*client_chunk_group.assets);
                    let client_chunks = client_chunks.to_resolved().await?;

                    if is_layout {
                        current_client_availability_info = client_chunk_group.availability_info;
                        current_client_chunks = client_chunks;
                    }

                    layout_segment_client_chunks.insert(server_component, client_chunks);

                    for &client_reference_ty in client_reference_types.iter() {
                        if let ClientReferenceType::EcmascriptClientReference(_) =
                            client_reference_ty
                        {
                            client_component_client_chunks.insert(
                                client_reference_ty,
                                (client_chunks, client_chunk_group.availability_info),
                            );
                        }
                    }
                }

                if let Some(ssr_chunk_group) = ssr_chunk_group {
                    let ssr_chunk_group = ssr_chunk_group.await?;

                    let ssr_chunks = current_ssr_chunks.concatenate(*ssr_chunk_group.assets);
                    let ssr_chunks = ssr_chunks.to_resolved().await?;

                    if is_layout {
                        current_ssr_availability_info = ssr_chunk_group.availability_info;
                        current_ssr_chunks = ssr_chunks;
                    }

                    for &client_reference_ty in client_reference_types.iter() {
                        if let ClientReferenceType::EcmascriptClientReference(_) =
                            client_reference_ty
                        {
                            client_component_ssr_chunks.insert(
                                client_reference_ty,
                                (ssr_chunks, ssr_chunk_group.availability_info),
                            );
                        }
                    }
                }
            }

            Ok(ClientReferencesChunks {
                client_component_client_chunks,
                client_component_ssr_chunks,
                layout_segment_client_chunks,
            }
            .cell())
        }
    }
    .instrument(tracing::info_span!("process client references"))
    .await
}
