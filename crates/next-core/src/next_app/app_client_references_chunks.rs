use anyhow::Result;
use futures::join;
use rustc_hash::FxHashMap;
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, ResolvedVc, TryJoinIterExt, Value, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    chunk::{availability_info::AvailabilityInfo, ChunkingContext},
    ident::AssetIdent,
    module::Module,
    module_graph::{chunk_group_info::ChunkGroup, ModuleGraph},
    output::{OutputAsset, OutputAssets},
};

use crate::{
    next_client_reference::{
        ecmascript_client_reference::ecmascript_client_reference_module::{
            ECMASCRIPT_CLIENT_REFERENCE_MERGE_TAG_CLIENT, ECMASCRIPT_CLIENT_REFERENCE_MERGE_TAG_SSR,
        },
        visit_client_reference::ClientReferenceGraphResult,
        ClientReferenceType,
    },
    next_server_component::server_component_module::NextServerComponentModule,
    next_server_utility::NEXT_SERVER_UTILITY_MERGE_TAG,
};

#[turbo_tasks::function]
pub fn client_modules_modifier() -> Vc<RcStr> {
    Vc::cell("client modules".into())
}

#[turbo_tasks::function]
pub fn ssr_modules_modifier() -> Vc<RcStr> {
    Vc::cell("ssr modules".into())
}

type ServerComponentOrUtilites = Option<ResolvedVc<NextServerComponentModule>>;

#[turbo_tasks::value]
pub struct ClientReferencesChunks {
    pub client_component_client_chunks:
        FxIndexMap<ClientReferenceType, (ResolvedVc<OutputAssets>, AvailabilityInfo)>,
    pub client_component_ssr_chunks:
        FxIndexMap<ClientReferenceType, (ResolvedVc<OutputAssets>, AvailabilityInfo)>,
    pub layout_segment_client_chunks:
        FxIndexMap<ServerComponentOrUtilites, Vec<ResolvedVc<Box<dyn OutputAsset>>>>,
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
    client_availability_info: Value<AvailabilityInfo>,
    ssr_chunking_context: Option<Vc<Box<dyn ChunkingContext>>>,
    entry_chunk_group: ChunkGroup,
    project_path: Vc<FileSystemPath>,
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
            // First None = server utils / "framework refernces", and then all layout segment server
            // components (in order)
            let mut client_references_by_server_component: FxIndexMap<_, Vec<_>> =
                FxIndexMap::from_iter(
                    std::iter::once(None)
                        .chain(
                            app_client_references
                                .server_component_entries
                                .iter()
                                .map(Some),
                        )
                        .map(|server_component| (server_component.cloned(), vec![])),
                );
            for client_reference in app_client_references.client_references.iter() {
                client_references_by_server_component
                    .entry(client_reference.server_component())
                    .or_default()
                    .push(client_reference.ty());
            }

            let chunk_group_info = module_graph.chunk_group_info();

            let mut current_client_availability_info = client_availability_info.into_value();
            let mut current_client_chunks = OutputAssets::empty().to_resolved().await?;
            let mut current_ssr_availability_info = AvailabilityInfo::Root;
            let mut current_ssr_chunks = OutputAssets::empty().to_resolved().await?;

            let mut layout_segment_client_chunks: FxIndexMap<
                ServerComponentOrUtilites,
                Vec<ResolvedVc<Box<dyn OutputAsset>>>,
            > = FxIndexMap::default();
            let mut client_component_ssr_chunks = FxIndexMap::default();
            let mut client_component_client_chunks = FxIndexMap::default();

            let server_utils_chunk_group = chunk_group_info
                .get_merged_group(
                    entry_chunk_group.clone(),
                    NEXT_SERVER_UTILITY_MERGE_TAG.clone(),
                )
                .await?
                .first()
                .cloned()
                // Some entypoints have server utilites that aren't marked as such, fall back to
                // page chunk group in that case.
                .unwrap_or(entry_chunk_group);

            for (server_component, client_reference_types) in
                client_references_by_server_component.into_iter()
            {
                if server_component.is_none() && client_reference_types.is_empty() {
                    // Skip if there are no references from server utilites, there is no
                    // corresponding ChunkGroup in the graph in this case.
                    continue;
                }

                let mut client_to_ref_ty: FxHashMap<
                    ResolvedVc<Box<dyn Module>>,
                    Vec<ClientReferenceType>,
                > = FxHashMap::default();
                for ty in client_reference_types {
                    match ty {
                        ClientReferenceType::EcmascriptClientReference(proxy) => {
                            let proxy = proxy.await?;
                            client_to_ref_ty
                                .entry(ResolvedVc::upcast::<Box<dyn Module>>(proxy.client_module))
                                .or_default()
                                .push(ty);
                            client_to_ref_ty
                                .entry(ResolvedVc::upcast::<Box<dyn Module>>(proxy.ssr_module))
                                .or_default()
                                .push(ty);
                        }
                        ClientReferenceType::CssClientReference(r) => client_to_ref_ty
                            .entry(ResolvedVc::upcast::<Box<dyn Module>>(r))
                            .or_default()
                            .push(ty),
                    }
                }

                let parent_chunk_group = if let Some(server_component) = server_component {
                    ChunkGroup::Shared(ResolvedVc::upcast(server_component.await?.module))
                } else {
                    server_utils_chunk_group.clone()
                };
                let parent_chunk_group_id = chunk_group_info
                    .get_index_of(parent_chunk_group.clone())
                    .await?;

                let client_chunk_groups = chunk_group_info
                    .get_all_merged_groups(
                        parent_chunk_group.clone(),
                        ECMASCRIPT_CLIENT_REFERENCE_MERGE_TAG_CLIENT.clone(),
                    )
                    .await?;
                let ssr_chunk_groups = chunk_group_info
                    .get_all_merged_groups(
                        parent_chunk_group.clone(),
                        ECMASCRIPT_CLIENT_REFERENCE_MERGE_TAG_SSR.clone(),
                    )
                    .await?;

                let (base_ident, server_component_path, is_layout) =
                    if let Some(server_component) = server_component {
                        let server_path = server_component.server_path();
                        (
                            server_component.ident(),
                            &*server_path.to_string().await?,
                            server_path.file_stem().await?.as_deref() == Some("layout"),
                        )
                    } else {
                        (
                            AssetIdent::from_path(project_path),
                            &*NEXT_SERVER_UTILITY_MERGE_TAG,
                            false,
                        )
                    };

                let ssr_chunk_group = async {
                    if let Some(ssr_chunking_context) = ssr_chunking_context {
                        ssr_chunk_groups
                            .iter()
                            .map(async |chunk_group| {
                                Ok((
                                    chunk_group.clone(),
                                    ssr_chunking_context
                                        .chunk_group(
                                            base_ident.with_modifier(ssr_modules_modifier()),
                                            chunk_group.clone(),
                                            module_graph,
                                            Value::new(current_ssr_availability_info),
                                        )
                                        .await?,
                                ))
                            })
                            .try_join()
                            .instrument(tracing::info_span!(
                                "server side rendering",
                                layout_segment = display(&server_component_path),
                            ))
                            .await
                    } else {
                        Ok(vec![])
                    }
                };
                let client_chunk_group = client_chunk_groups
                    .iter()
                    .map(async |chunk_group| {
                        Ok((
                            chunk_group.clone(),
                            client_chunking_context
                                .chunk_group(
                                    base_ident.with_modifier(client_modules_modifier()),
                                    chunk_group.clone(),
                                    module_graph,
                                    Value::new(current_client_availability_info),
                                )
                                .await?,
                        ))
                    })
                    .try_join()
                    .instrument(tracing::info_span!(
                        "client side rendering",
                        layout_segment = display(&server_component_path),
                    ));

                let (client_chunk_group, ssr_chunk_group) =
                    join!(client_chunk_group, ssr_chunk_group);

                for (chunk_group, chunks_group_result) in ssr_chunk_group?.into_iter() {
                    let ssr_chunks = current_ssr_chunks.concatenate(*chunks_group_result.assets);
                    let ssr_chunks = ssr_chunks.to_resolved().await?;

                    let ChunkGroup::IsolatedMerged {
                        parent, entries, ..
                    } = chunk_group
                    else {
                        unreachable!("unexpected ChunkGroup type")
                    };

                    if is_layout && parent == (*parent_chunk_group_id as usize) {
                        // This server component is a layout segment, and this chunk is a direct
                        // child of that layout segment (not inside of an async import).
                        current_ssr_availability_info = chunks_group_result.availability_info;
                        current_ssr_chunks = ssr_chunks;
                    }

                    for entry in &*entries {
                        for client_reference_ty in client_to_ref_ty.get(entry).into_iter().flatten()
                        {
                            if let ClientReferenceType::EcmascriptClientReference(_) =
                                client_reference_ty
                            {
                                client_component_ssr_chunks.insert(
                                    *client_reference_ty,
                                    (ssr_chunks, chunks_group_result.availability_info),
                                );
                            }
                        }
                    }
                }

                for (chunk_group, chunk_group_result) in client_chunk_group?.into_iter() {
                    let client_chunks =
                        current_client_chunks.concatenate(*chunk_group_result.assets);
                    let client_chunks = client_chunks.to_resolved().await?;

                    let ChunkGroup::IsolatedMerged {
                        parent, entries, ..
                    } = chunk_group
                    else {
                        unreachable!("unexpected ChunkGroup type")
                    };

                    if is_layout && parent == (*parent_chunk_group_id as usize) {
                        // This server component is a layout segment, and this chunk is a direct
                        // child of that layout segment (not inside of an async import).
                        current_client_availability_info = chunk_group_result.availability_info;
                        current_client_chunks = client_chunks;
                    }

                    layout_segment_client_chunks
                        .entry(server_component)
                        .or_default()
                        .extend(client_chunks.await?.iter().copied());

                    for entry in &*entries {
                        for client_reference_ty in client_to_ref_ty.get(entry).into_iter().flatten()
                        {
                            if let ClientReferenceType::EcmascriptClientReference(_) =
                                client_reference_ty
                            {
                                client_component_client_chunks.insert(
                                    *client_reference_ty,
                                    (client_chunks, chunk_group_result.availability_info),
                                );
                            }
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
