use anyhow::{Result, bail};
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxIndexMap, FxIndexSet, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, ValueToString, Vc,
};
use turbopack_core::{
    chunk::{ChunkGroupResult, ChunkingContext, availability_info::AvailabilityInfo},
    module::Module,
    module_graph::{
        ModuleGraph,
        chunk_group_info::{ChunkGroup, ChunkGroupInfo},
    },
    output::{OutputAsset, OutputAssets, OutputAssetsWithReferenced},
};

use crate::{
    next_client_reference::{
        ClientReference, ClientReferenceType,
        ecmascript_client_reference::ecmascript_client_reference_module::{
            ECMASCRIPT_CLIENT_REFERENCE_MERGE_TAG, ECMASCRIPT_CLIENT_REFERENCE_MERGE_TAG_SSR,
        },
        visit_client_reference::ClientReferenceGraphResult,
    },
    next_server_component::server_component_module::NextServerComponentModule,
};

fn is_isolated_merged_group_for_parent(
    chunk_group: &ChunkGroup,
    parent_indices: &FxIndexSet<u32>,
    merge_tag: &RcStr,
) -> bool {
    matches!(
        chunk_group,
        ChunkGroup::IsolatedMerged {
            parent,
            merge_tag: group_merge_tag,
            ..
        } if group_merge_tag == merge_tag && parent_indices.contains(&(*parent as u32))
    )
}

/// The chunk groups a client reference's merged group may hang off.
///
/// A client reference is reached from its source module, which can sit in several chunk groups
/// when the reference is shared between routes. When the reference belongs to a server component,
/// the relevant groups are the ones that contain that server component too.
///
/// An empty intersection is not an error: in a development module graph the source module and the
/// server component do not necessarily share a chunk group, and framework-level references have no
/// server component at all. Falling back to the source module's own groups is the conservative
/// choice -- the reference is still chunked, just not narrowed to the component's groups.
fn relevant_parent_indices(
    source_indices: FxIndexSet<u32>,
    server_component_indices: Option<&FxIndexSet<u32>>,
) -> FxIndexSet<u32> {
    let Some(server_component_indices) = server_component_indices else {
        return source_indices;
    };
    let intersection = source_indices
        .intersection(server_component_indices)
        .copied()
        .collect::<FxIndexSet<_>>();
    if intersection.is_empty() {
        source_indices
    } else {
        intersection
    }
}

/// A client reference, the module it is reached from, and the server component that owns it (if
/// any).
#[derive(Clone, Copy)]
struct ClientReferenceWithContext {
    /// The module that is chunked for this client reference.
    entry_module: ResolvedVc<Box<dyn Module>>,
    /// The module the client reference is reached from.
    source_module: ResolvedVc<Box<dyn Module>>,
    /// The server component this client reference belongs to, if it belongs to one. Framework
    /// references do not.
    server_component: Option<ResolvedVc<Box<dyn Module>>>,
}

async fn derived_isolated_merged_groups(
    chunk_group_info: Vc<ChunkGroupInfo>,
    references: &[ClientReferenceWithContext],
    merge_tag: &RcStr,
) -> Result<Vec<ChunkGroup>> {
    let mut groups = FxIndexMap::default();

    for &ClientReferenceWithContext {
        entry_module,
        source_module,
        server_component,
    } in references
    {
        let source_groups = chunk_group_info
            .get_chunk_groups_for_module(*source_module)
            .await?;
        let server_component_indices = if let Some(server_component) = server_component {
            Some(
                chunk_group_info
                    .get_chunk_groups_for_module(*server_component)
                    .await?
                    .iter()
                    .map(|group| group.index)
                    .collect::<FxIndexSet<_>>(),
            )
        } else {
            None
        };
        let source_indices = source_groups.iter().map(|group| group.index).collect();
        let parent_indices =
            relevant_parent_indices(source_indices, server_component_indices.as_ref());

        let mut found = false;
        for group in chunk_group_info
            .get_chunk_groups_for_module(*entry_module)
            .await?
            .iter()
        {
            if is_isolated_merged_group_for_parent(&group.chunk_group, &parent_indices, merge_tag) {
                found = true;
                groups
                    .entry(group.index)
                    .or_insert_with(|| group.chunk_group.clone());
            }
        }
        if !found {
            bail!(
                "could not find a graph-derived isolated merged group for {}",
                entry_module.ident().to_string().await?,
            );
        }
    }

    Ok(groups.into_values().collect())
}

#[cfg(test)]
mod tests {
    use turbo_rcstr::rcstr;
    use turbo_tasks::FxIndexSet;
    use turbopack_core::module_graph::chunk_group_info::ChunkGroup;

    use crate::next_app::app_client_references_chunks::{
        is_isolated_merged_group_for_parent, relevant_parent_indices,
    };

    #[test]
    fn parent_indices_prefer_a_non_empty_output_intersection() {
        let source = FxIndexSet::from_iter([1, 2]);

        assert_eq!(
            relevant_parent_indices(source.clone(), Some(&FxIndexSet::from_iter([2, 3]))),
            FxIndexSet::from_iter([2]),
        );
        assert_eq!(
            relevant_parent_indices(source.clone(), Some(&FxIndexSet::from_iter([3]))),
            source,
        );
        assert_eq!(relevant_parent_indices(source.clone(), None), source,);
    }

    #[test]
    fn isolated_merged_groups_must_match_parent_and_tag() {
        let group = ChunkGroup::IsolatedMerged {
            parent: 7,
            merge_tag: rcstr!("client"),
            entries: Vec::new(),
        };

        assert!(is_isolated_merged_group_for_parent(
            &group,
            &FxIndexSet::from_iter([7]),
            &rcstr!("client"),
        ));
        assert!(!is_isolated_merged_group_for_parent(
            &group,
            &FxIndexSet::from_iter([8]),
            &rcstr!("client"),
        ));
        assert!(!is_isolated_merged_group_for_parent(
            &group,
            &FxIndexSet::from_iter([7]),
            &rcstr!("ssr"),
        ));
    }
}

fn client_references_by_server_component(
    app_client_references: &ClientReferenceGraphResult,
) -> FxIndexMap<ResolvedVc<NextServerComponentModule>, Vec<ClientReference>> {
    let mut client_references_by_server_component: FxIndexMap<_, Vec<_>> = FxIndexMap::default();
    let mut framework_references = Vec::new();
    for &server_component in &app_client_references.server_component_entries {
        client_references_by_server_component
            .entry(server_component)
            .or_default();
    }
    for client_reference in &app_client_references.client_references {
        if let Some(server_component) = client_reference.server_component {
            client_references_by_server_component
                .entry(server_component)
                .or_default()
                .push(*client_reference);
        } else {
            framework_references.push(*client_reference);
        }
    }
    // Framework components need to go into first layout segment.
    if let Some((_, list)) = client_references_by_server_component.first_mut() {
        list.extend(framework_references);
    }
    client_references_by_server_component
}

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
            //         Ok((
            //             client_reference.ty,
            //             match client_reference.ty {
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
            let client_references_by_server_component =
                client_references_by_server_component(&app_client_references);

            let chunk_group_info = module_graph.chunk_group_info();

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
            let mut client_component_ssr_chunks = FxIndexMap::default();
            let mut client_component_client_chunks = FxIndexMap::default();

            for (server_component, client_references) in
                client_references_by_server_component.into_iter()
            {
                let base_ident = server_component.ident().owned().await?;

                let server_path = server_component.server_path().owned().await?;
                let is_layout = server_path.file_stem() == Some("layout");
                let ssr_modules = client_references
                    .iter()
                    .map(async |client_reference| {
                        let parent_module = client_reference.parent_module;
                        Ok(match client_reference.ty {
                            ClientReferenceType::EcmascriptClientReference(
                                ecmascript_client_reference,
                            ) => {
                                let ecmascript_client_reference_ref =
                                    ecmascript_client_reference.await?;

                                Some(ClientReferenceWithContext {
                                    entry_module: ResolvedVc::upcast(
                                        ecmascript_client_reference_ref.ssr_module,
                                    ),
                                    source_module: parent_module,
                                    server_component: client_reference
                                        .server_component
                                        .map(ResolvedVc::upcast),
                                })
                            }
                            _ => None,
                        })
                    })
                    .try_flat_join()
                    .await?;

                let ssr_chunk_group = if !ssr_modules.is_empty()
                    && let Some(ssr_chunking_context) = ssr_chunking_context
                {
                    let groups = derived_isolated_merged_groups(
                        chunk_group_info,
                        &ssr_modules,
                        &ECMASCRIPT_CLIENT_REFERENCE_MERGE_TAG_SSR,
                    )
                    .await?;
                    let mut combined_chunk_group = ChunkGroupResult::empty_resolved();
                    let mut availability_info = current_ssr_chunk_group.await?.availability_info;
                    let group_count = groups.len();
                    for (index, group) in groups.into_iter().enumerate() {
                        let modifier = if group_count == 1 {
                            rcstr!("ssr modules")
                        } else {
                            format!("ssr modules {index}").into()
                        };
                        let chunk_group = ssr_chunking_context.chunk_group(
                            base_ident.clone().with_modifier(modifier).into_vc(),
                            group,
                            module_graph,
                            availability_info,
                        );
                        combined_chunk_group = combined_chunk_group
                            .concatenate(chunk_group)
                            .to_resolved()
                            .await?;
                        availability_info = combined_chunk_group.await?.availability_info;
                    }
                    (group_count > 0).then_some(combined_chunk_group)
                } else {
                    None
                };

                let client_modules = client_references
                    .iter()
                    .map(async |client_reference| {
                        let parent_module = client_reference.parent_module;
                        Ok(ClientReferenceWithContext {
                            entry_module: match client_reference.ty {
                                ClientReferenceType::EcmascriptClientReference(
                                    ecmascript_client_reference,
                                ) => ResolvedVc::upcast(
                                    ecmascript_client_reference.await?.client_module,
                                ),
                                ClientReferenceType::CssClientReference(css_client_reference) => {
                                    ResolvedVc::upcast(css_client_reference)
                                }
                            },
                            source_module: parent_module,
                            server_component: client_reference
                                .server_component
                                .map(ResolvedVc::upcast),
                        })
                    })
                    .try_join()
                    .await?;
                let client_chunk_group = if !client_modules.is_empty() {
                    let groups = derived_isolated_merged_groups(
                        chunk_group_info,
                        &client_modules,
                        &ECMASCRIPT_CLIENT_REFERENCE_MERGE_TAG,
                    )
                    .await?;
                    let mut combined_chunk_group = ChunkGroupResult::empty_resolved();
                    let mut availability_info = current_client_chunk_group.await?.availability_info;
                    let group_count = groups.len();
                    for (index, group) in groups.into_iter().enumerate() {
                        let modifier = if group_count == 1 {
                            rcstr!("client modules")
                        } else {
                            format!("client modules {index}").into()
                        };
                        let chunk_group = client_chunking_context.chunk_group(
                            base_ident.clone().with_modifier(modifier).into_vc(),
                            group,
                            module_graph,
                            availability_info,
                        );
                        combined_chunk_group = combined_chunk_group
                            .concatenate(chunk_group)
                            .to_resolved()
                            .await?;
                        availability_info = combined_chunk_group.await?.availability_info;
                    }
                    (group_count > 0).then_some(combined_chunk_group)
                } else {
                    None
                };

                if let Some(client_chunk_group) = client_chunk_group {
                    let client_chunk_group = current_client_chunk_group
                        .concatenate(*client_chunk_group)
                        .to_resolved()
                        .await?;

                    if is_layout {
                        current_client_chunk_group = client_chunk_group;
                    }

                    let assets = client_chunk_group
                        .output_assets_with_referenced()
                        .to_resolved()
                        .await?;
                    layout_segment_client_chunks.insert(server_component, assets);

                    for client_reference in &client_references {
                        if let ClientReferenceType::EcmascriptClientReference(_) =
                            client_reference.ty
                        {
                            client_component_client_chunks
                                .insert(client_reference.ty, client_chunk_group);
                        }
                    }
                }

                if let Some(ssr_chunk_group) = ssr_chunk_group {
                    let ssr_chunk_group = current_ssr_chunk_group
                        .concatenate(*ssr_chunk_group)
                        .to_resolved()
                        .await?;

                    if is_layout {
                        current_ssr_chunk_group = ssr_chunk_group;
                    }

                    let assets = ssr_chunk_group
                        .output_assets_with_referenced()
                        .to_resolved()
                        .await?;
                    for client_reference in &client_references {
                        if let ClientReferenceType::EcmascriptClientReference(_) =
                            client_reference.ty
                        {
                            client_component_ssr_chunks.insert(client_reference.ty, assets);
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
        .map(async |&assets| {
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
