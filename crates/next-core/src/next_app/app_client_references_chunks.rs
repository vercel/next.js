use anyhow::Result;
use tracing::Instrument;
use turbo_rcstr::rcstr;
use turbo_tasks::{
    FxIndexMap, FxIndexSet, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, ValueToStringRef, Vc,
};
use turbopack_core::{
    chunk::{ChunkGroupResult, ChunkingContext, availability_info::AvailabilityInfo},
    module::Module,
    module_graph::{ModuleGraph, chunk_group_info::ChunkGroup},
    output::{OutputAsset, OutputAssets, OutputAssetsWithReferenced},
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
    #[bincode(with = "turbo_bincode::indexmap")]
    pub client_component_client_chunks:
        FxIndexMap<ClientReferenceType, ResolvedVc<ChunkGroupResult>>,
    #[bincode(with = "turbo_bincode::indexmap")]
    pub client_component_ssr_chunks:
        FxIndexMap<ClientReferenceType, ResolvedVc<OutputAssetsWithReferenced>>,
    #[bincode(with = "turbo_bincode::indexmap")]
    pub layout_segment_client_chunks:
        FxIndexMap<ResolvedVc<NextServerComponentModule>, ResolvedVc<OutputAssetsWithReferenced>>,
    /// Async-only: contributes `entryCSSFiles`, never `entryJSFiles`.
    #[bincode(with = "turbo_bincode::indexmap")]
    pub layout_segment_async_client_chunks:
        FxIndexMap<ResolvedVc<NextServerComponentModule>, ResolvedVc<OutputAssetsWithReferenced>>,
}

/// Computes all client references chunks.
///
/// This returns a map from client reference type to the chunks that the reference
/// type needs to load.
#[turbo_tasks::function]
pub async fn get_app_client_references_chunks(
    app_client_references: Vc<ClientReferenceGraphResult>,
    module_graph: Vc<ModuleGraph>,
    client_chunking_context: Vc<Box<dyn ChunkingContext>>,
    client_availability_info: AvailabilityInfo,
    ssr_chunking_context: Option<Vc<Box<dyn ChunkingContext>>>,
    separate_async_client_references: bool,
) -> Result<Vc<ClientReferencesChunks>> {
    async move {
        let app_client_references = app_client_references.await?;
        let mut client_references_by_server_component: FxIndexMap<_, Vec<_>> =
            FxIndexMap::default();
        let mut framework_reference_types = Vec::new();
        for &server_component in app_client_references.server_component_entries.iter() {
            client_references_by_server_component
                .entry(server_component)
                .or_default();
        }
        for client_reference in app_client_references.client_references.iter() {
            if let Some(server_component) = client_reference.server_component {
                client_references_by_server_component
                    .entry(server_component)
                    .or_default()
                    .push(client_reference.ty);
            } else {
                framework_reference_types.push(client_reference.ty);
            }
        }
        // Framework components need to go into first layout segment
        if let Some((_, list)) = client_references_by_server_component.first_mut() {
            list.extend(framework_reference_types);
        }

        let chunk_group_info = module_graph.chunk_group_info();
        let chunk_group_info_ref = chunk_group_info.await?;
        let client_merge_tag = ecmascript_client_reference_merge_tag();

        // The graph already separates async-only client references into their own merged group.
        // Left empty when the flag is off, which keeps every reference in the eager bucket below.
        let client_reference_groups: FxIndexMap<ClientReferenceType, Vec<usize>> =
            if !separate_async_client_references {
                FxIndexMap::default()
            } else {
                let module_chunk_groups = chunk_group_info_ref.module_chunk_groups.await?;
                let merged_modules = module_graph.merged_modules().await?;
                app_client_references
                    .client_references
                    .iter()
                    .map(async |client_reference| {
                        let module: ResolvedVc<Box<dyn Module>> = match client_reference.ty {
                            ClientReferenceType::EcmascriptClientReference(r) => {
                                ResolvedVc::upcast(r.await?.client_module)
                            }
                            ClientReferenceType::CssClientReference(r) => ResolvedVc::upcast(r),
                        };
                        let groups = match module_chunk_groups.get(&module) {
                            Some(groups) => Some(groups),
                            // Merged-away modules are absent; look up what they replaced.
                            None => match merged_modules.get_original_module(module).await? {
                                Some(original) => module_chunk_groups.get(&original),
                                None => None,
                            },
                        };
                        let groups = groups
                            .into_iter()
                            .flat_map(|groups| groups.iter())
                            .filter(|&index| {
                                matches!(
                                    chunk_group_info_ref.chunk_groups.get_index(index as usize),
                                    Some(ChunkGroup::IsolatedMerged { merge_tag, .. })
                                        if *merge_tag == client_merge_tag
                                )
                            })
                            .map(|index| index as usize)
                            .collect::<Vec<_>>();
                        Ok((client_reference.ty, groups))
                    })
                    .try_join()
                    .await?
                    .into_iter()
                    .collect()
            };

        // Reachable from several segments, each of which would chunk it against its own
        // availability, emitting a second copy whenever it shares a module with that
        // segment's eager chunks.
        let mut chunked_async_groups: FxIndexMap<usize, ResolvedVc<ChunkGroupResult>> =
            FxIndexMap::default();

        let mut current_client_chunk_group = ChunkGroupResult {
            assets: ResolvedVc::cell(vec![]),
            referenced_assets: ResolvedVc::cell(vec![]),
            references: ResolvedVc::cell(vec![]),
            availability_info: client_availability_info,
            chunk_group_bootstrap_params: None,
        }
        .resolved_cell();
        let mut current_ssr_chunk_group = ChunkGroupResult::empty_resolved();

        let mut layout_segment_client_chunks = FxIndexMap::default();
        let mut layout_segment_async_client_chunks = FxIndexMap::default();
        let mut client_component_ssr_chunks = FxIndexMap::default();
        let mut client_component_client_chunks = FxIndexMap::default();

        for (server_component, client_reference_types) in
            client_references_by_server_component.into_iter()
        {
            let parent_chunk_group = *chunk_group_info
                .get_index_of(ChunkGroup::Shared(ResolvedVc::upcast(server_component)))
                .await?;

            let base_ident = server_component.ident().owned().await?;

            let server_path = server_component.server_path().owned().await?;
            let is_layout = server_path.file_stem() == Some("layout");
            let server_component_path = server_path.to_string_ref().await?;

            let mut eager_reference_types = Vec::new();
            let mut async_group_reference_types: FxIndexMap<usize, Vec<ClientReferenceType>> =
                FxIndexMap::default();
            for &client_reference_ty in client_reference_types.iter() {
                let groups = client_reference_groups
                    .get(&client_reference_ty)
                    .map_or(&[][..], |groups| groups.as_slice());
                // Async only if every group leaves it lazy for this segment.
                let is_async = !groups.is_empty()
                    && groups.iter().all(|&index| {
                        let parent = match chunk_group_info_ref.chunk_groups.get_index(index) {
                            Some(ChunkGroup::IsolatedMerged { parent, .. }) => *parent,
                            _ => return false,
                        };
                        match chunk_group_info_ref.chunk_groups.get_index(parent) {
                            // Behind an async import.
                            Some(ChunkGroup::Async(..)) => true,
                            // This segment imports it directly, so it has to be eager. Another
                            // segment's group says nothing about reachability from here.
                            Some(ChunkGroup::Shared(module)) => {
                                *module != ResolvedVc::upcast(server_component)
                            }
                            _ => false,
                        }
                    });
                if is_async {
                    for &index in groups {
                        async_group_reference_types
                            .entry(index)
                            .or_default()
                            .push(client_reference_ty);
                    }
                } else {
                    eager_reference_types.push(client_reference_ty);
                }
            }

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

            let ssr_chunk_group = if !ssr_modules.is_empty()
                && let Some(ssr_chunking_context) = ssr_chunking_context
            {
                let availability_info = current_ssr_chunk_group.await?.availability_info;
                let _span = tracing::info_span!(
                    "server side rendering",
                    layout_segment = display(&server_component_path),
                )
                .entered();

                Some(
                    ssr_chunking_context.chunk_group(
                        base_ident
                            .clone()
                            .with_modifier(rcstr!("ssr modules"))
                            .into_vc(),
                        ChunkGroup::IsolatedMerged {
                            parent: parent_chunk_group,
                            merge_tag: ecmascript_client_reference_merge_tag_ssr(),
                            entries: ssr_modules,
                        },
                        module_graph,
                        availability_info,
                    ),
                )
            } else {
                None
            };

            let client_modules = eager_reference_types
                .iter()
                .map(|client_reference_ty| async move {
                    Ok(match client_reference_ty {
                        ClientReferenceType::EcmascriptClientReference(
                            ecmascript_client_reference,
                        ) => ResolvedVc::upcast(ecmascript_client_reference.await?.client_module),
                        ClientReferenceType::CssClientReference(css_client_reference) => {
                            ResolvedVc::upcast(*css_client_reference)
                        }
                    })
                })
                .try_join()
                .await?;
            let client_chunk_group = if !client_modules.is_empty() {
                let availability_info = current_client_chunk_group.await?.availability_info;
                let _span = tracing::info_span!(
                    "client side rendering",
                    layout_segment = display(&server_component_path),
                )
                .entered();

                Some(
                    client_chunking_context.chunk_group(
                        base_ident
                            .clone()
                            .with_modifier(rcstr!("client modules"))
                            .into_vc(),
                        ChunkGroup::IsolatedMerged {
                            parent: parent_chunk_group,
                            merge_tag: client_merge_tag.clone(),
                            entries: client_modules,
                        },
                        module_graph,
                        availability_info,
                    ),
                )
            } else {
                None
            };

            let mut segment_client_chunk_group = current_client_chunk_group;
            if let Some(client_chunk_group) = client_chunk_group {
                let client_chunk_group = current_client_chunk_group
                    .concatenate(client_chunk_group)
                    .to_resolved()
                    .await?;

                if is_layout {
                    current_client_chunk_group = client_chunk_group;
                }
                segment_client_chunk_group = client_chunk_group;

                let assets = client_chunk_group
                    .output_assets_with_referenced()
                    .to_resolved()
                    .await?;
                layout_segment_client_chunks.insert(server_component, assets);

                for &client_reference_ty in eager_reference_types.iter() {
                    if let ClientReferenceType::EcmascriptClientReference(_) = client_reference_ty {
                        client_component_client_chunks
                            .insert(client_reference_ty, client_chunk_group);
                    }
                }
            }

            // Uses the eager group's availability, so its modules are excluded not duplicated.
            let mut segment_async_chunk_group: Option<ResolvedVc<ChunkGroupResult>> = None;
            for (group_index, reference_types) in async_group_reference_types {
                let async_chunk_group = match chunked_async_groups.get(&group_index) {
                    Some(&already_chunked) => already_chunked,
                    None => {
                        let availability_info = segment_client_chunk_group.await?.availability_info;
                        let chunk_group = {
                            let _span = tracing::info_span!(
                                "client side rendering (async)",
                                layout_segment = display(&server_component_path),
                            )
                            .entered();

                            client_chunking_context.chunk_group(
                                base_ident
                                    .clone()
                                    .with_modifier(rcstr!("async client modules"))
                                    .into_vc(),
                                chunk_group_info_ref.chunk_groups[group_index].clone(),
                                module_graph,
                                availability_info,
                            )
                        };
                        let async_chunk_group = segment_client_chunk_group
                            .concatenate(chunk_group)
                            .to_resolved()
                            .await?;
                        chunked_async_groups.insert(group_index, async_chunk_group);
                        segment_async_chunk_group = Some(match segment_async_chunk_group {
                            Some(previous) => {
                                previous
                                    .concatenate(*async_chunk_group)
                                    .to_resolved()
                                    .await?
                            }
                            None => async_chunk_group,
                        });
                        async_chunk_group
                    }
                };

                for client_reference_ty in reference_types {
                    if let ClientReferenceType::EcmascriptClientReference(_) = client_reference_ty {
                        client_component_client_chunks
                            .insert(client_reference_ty, async_chunk_group);
                    }
                }
            }
            if let Some(segment_async_chunk_group) = segment_async_chunk_group {
                layout_segment_async_client_chunks.insert(
                    server_component,
                    segment_async_chunk_group
                        .output_assets_with_referenced()
                        .to_resolved()
                        .await?,
                );
            }

            if let Some(ssr_chunk_group) = ssr_chunk_group {
                let ssr_chunk_group = current_ssr_chunk_group
                    .concatenate(ssr_chunk_group)
                    .to_resolved()
                    .await?;

                if is_layout {
                    current_ssr_chunk_group = ssr_chunk_group;
                }

                let assets = ssr_chunk_group
                    .output_assets_with_referenced()
                    .to_resolved()
                    .await?;
                for &client_reference_ty in client_reference_types.iter() {
                    if let ClientReferenceType::EcmascriptClientReference(_) = client_reference_ty {
                        client_component_ssr_chunks.insert(client_reference_ty, assets);
                    }
                }
            }
        }

        Ok(ClientReferencesChunks {
            client_component_client_chunks,
            client_component_ssr_chunks,
            layout_segment_client_chunks,
            layout_segment_async_client_chunks,
        }
        .cell())
    }
    .instrument(tracing::info_span!("process client references"))
    .await
}

/// Flattens all client-side output assets from `client_references_chunks` so the
/// page's HMR chunk list can subscribe to updates for chunks built outside the
/// entry's own module graph (each `chunk_group(IsolatedMerged)` call for a
/// client component group generates chunks separately).
#[turbo_tasks::function]
pub async fn get_client_references_chunks_for_hmr(
    client_references_chunks: Vc<ClientReferencesChunks>,
) -> Result<Vc<OutputAssets>> {
    let client_references_chunks_ref = client_references_chunks.await?;
    let mut extras: FxIndexSet<ResolvedVc<Box<dyn OutputAsset>>> = client_references_chunks_ref
        .layout_segment_client_chunks
        .values()
        .map(|&assets| async move {
            let primary = assets.primary_assets().await?;
            Ok(primary.iter().copied().collect::<Vec<_>>())
        })
        .try_flat_join()
        .await?
        .into_iter()
        .collect();
    for &chunk_group in client_references_chunks_ref
        .client_component_client_chunks
        .values()
    {
        // Use all_assets() (not primary_assets()) to also follow async loader references
        // transitively. This ensures that dynamic imports within 'use client' pages are
        // covered by the page's HMR subscription, not just the page module itself.
        extras.extend(chunk_group.all_assets().await?.iter().copied());
    }
    // client_component_ssr_chunks are intentionally excluded: they run on the server
    // (Node.js/Edge), not in the browser, so they don't belong in the client HMR chunk list.
    Ok(Vc::cell(extras.into_iter().collect()))
}
