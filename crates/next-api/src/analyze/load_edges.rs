//! Typed relationships among emitted outputs. Generic asset references are
//! recorded separately from explicit async loads and worker registrations.

use anyhow::Result;
use rustc_hash::{FxHashMap, FxHashSet};
use turbo_tasks::{FxIndexSet, ResolvedVc, ValueToString, ValueToStringRef, Vc};
use turbopack_core::{module::Module, output::OutputAsset};
use turbopack_ecmascript::references::service_worker::service_worker_chunk_filename;

use crate::{
    analyze::{
        AnalyzeChunkGroupData, AnalyzeChunkLoadEdge, AnalyzeDataBuilder, AnalyzeModuleIndex,
        AnalyzeUnjoinedChunkLoadEdge, AnalyzeUnjoinedModule, ChunkLoadCandidate,
    },
    route::AnalyzeChunkGroups,
};

pub(super) async fn collect_load_edges(
    builder: &mut AnalyzeDataBuilder,
    candidates: Vec<ChunkLoadCandidate>,
    asset_indices: &FxHashMap<ResolvedVc<Box<dyn OutputAsset>>, Vec<u32>>,
    chunk_groups: Vc<AnalyzeChunkGroups>,
    module_index: &AnalyzeModuleIndex,
    browser_chunks: &FxHashSet<u32>,
) -> Result<()> {
    resolve_candidates(builder, candidates, asset_indices).await?;
    record_groups(builder, asset_indices, chunk_groups, module_index).await?;
    record_worker_registrations(builder, module_index, browser_chunks).await?;

    // A batch or registration may discover the same typed relationship twice.
    let mut seen_edges = FxHashSet::default();
    builder.chunk_load_edges.retain(|edge| {
        seen_edges.insert((
            edge.source_output_file_index,
            edge.target_output_file_index,
            edge.kind.clone(),
            edge.trigger_module_index,
            edge.unjoined_trigger_ident.clone(),
        ))
    });
    let mut seen_unjoined = FxHashSet::default();
    builder.unjoined_modules.retain(|module| {
        seen_unjoined.insert((
            module.output_file_index,
            module.module_ident.clone(),
            module.reason,
        ))
    });
    Ok(())
}

async fn resolve_candidates(
    builder: &mut AnalyzeDataBuilder,
    candidates: Vec<ChunkLoadCandidate>,
    asset_indices: &FxHashMap<ResolvedVc<Box<dyn OutputAsset>>, Vec<u32>>,
) -> Result<()> {
    let mut async_groups = FxHashMap::default();
    for candidate in candidates {
        if let Some(target_indices) = asset_indices.get(&candidate.target) {
            let load_targets = target_indices
                .iter()
                .copied()
                .filter(|&target| target != candidate.source)
                .collect::<Vec<_>>();
            if load_targets.is_empty() {
                continue;
            }
            if candidate.kind == "async" || candidate.kind == "async_manifest" {
                let key = (
                    candidate.source,
                    candidate.trigger_module_index,
                    candidate.unjoined_trigger_ident.clone(),
                );
                let group_index = *async_groups.entry(key).or_insert_with(|| {
                    let index = builder.chunk_groups.len();
                    builder.chunk_groups.push(AnalyzeChunkGroupData {
                        id: index as u32,
                        kind: "async".into(),
                        trigger_module_index: candidate.trigger_module_index,
                        unjoined_trigger_ident: candidate.unjoined_trigger_ident.clone(),
                        output_file_indices: vec![],
                    });
                    index
                });
                for &target in &load_targets {
                    if !builder.chunk_groups[group_index]
                        .output_file_indices
                        .contains(&target)
                    {
                        builder.chunk_groups[group_index]
                            .output_file_indices
                            .push(target);
                    }
                }
            }
            for &target in &load_targets {
                builder.chunk_load_edges.push(AnalyzeChunkLoadEdge {
                    source_output_file_index: candidate.source,
                    target_output_file_index: target,
                    kind: candidate.kind.clone(),
                    trigger_module_index: candidate.trigger_module_index,
                    unjoined_trigger_ident: candidate.unjoined_trigger_ident.clone(),
                });
            }
        } else {
            let target_path = candidate.target.path().await?.to_string_ref().await?;
            if target_path.ends_with(".map") || target_path.ends_with(".nft.json") {
                continue;
            }
            builder
                .unjoined_chunk_load_edges
                .push(AnalyzeUnjoinedChunkLoadEdge {
                    source_output_file_index: Some(candidate.source),
                    target_path,
                    kind: candidate.kind,
                    reason: "target_not_in_route_outputs",
                    trigger_module_ident: candidate.unjoined_trigger_ident,
                });
        }
    }
    Ok(())
}

async fn record_groups(
    builder: &mut AnalyzeDataBuilder,
    asset_indices: &FxHashMap<ResolvedVc<Box<dyn OutputAsset>>, Vec<u32>>,
    chunk_groups: Vc<AnalyzeChunkGroups>,
    module_index: &AnalyzeModuleIndex,
) -> Result<()> {
    for group in chunk_groups.await?.iter() {
        let id = builder.chunk_groups.len() as u32;
        let mut output_indices = FxIndexSet::default();
        for &asset in group.assets.await?.iter() {
            let Some(indices) = asset_indices.get(&asset) else {
                let path = asset.path().await?.to_string_ref().await?;
                anyhow::bail!("chunk-group asset {path} not present among emitted output files");
            };
            output_indices.extend(indices.iter().copied());
        }
        let (trigger_module_index, unjoined_trigger_ident) = if let Some(module) = group.trigger {
            let ident = module.ident().to_string().owned().await?;
            if let Some(&index) = module_index.by_ident.get(&ident) {
                (Some(index), None)
            } else {
                (None, Some(ident))
            }
        } else {
            (None, None)
        };
        builder.chunk_groups.push(AnalyzeChunkGroupData {
            id,
            kind: group.kind.clone(),
            trigger_module_index,
            unjoined_trigger_ident,
            output_file_indices: output_indices.into_iter().collect(),
        });
    }
    Ok(())
}

/// The marker is in the page graph, but its worker payload is in a separate
/// compilation graph. Trace only synchronous dependents to a browser item.
async fn record_worker_registrations(
    builder: &mut AnalyzeDataBuilder,
    module_index: &AnalyzeModuleIndex,
    browser_chunks: &FxHashSet<u32>,
) -> Result<()> {
    let worker_files: FxHashSet<u32> = builder
        .chunk_groups
        .iter()
        .filter(|group| group.kind == "worker")
        .flat_map(|group| group.output_file_indices.iter().copied())
        .collect();
    if !worker_files.is_empty() {
        for &(importer, marker) in &module_index.worker_registrations {
            let marker = marker.await?;
            let filename = service_worker_chunk_filename(&marker.scope);
            let importer_ident = importer.ident().to_string().owned().await?;
            let importer_index = module_index.by_ident.get(&importer_ident).copied();
            for target in &worker_files {
                let output = &builder.output_files[*target as usize].output_file.filename;
                if !output.ends_with(filename.as_str()) {
                    continue;
                }
                builder.unjoined_modules.push(AnalyzeUnjoinedModule {
                    output_file_index: *target,
                    module_ident: marker.inner.ident().to_string().owned().await?,
                    reason: "worker_compiled_in_separate_graph",
                });
                // A registration may live in generated `<locals>`; find the
                // enclosing emitted item without crossing async/traced edges.
                let mut sources = FxIndexSet::default();
                let mut pending = vec![importer];
                let mut seen = FxHashSet::default();
                while let Some(module) = pending.pop() {
                    if !seen.insert(module) {
                        continue;
                    }
                    let ident = module.ident().to_string().owned().await?;
                    let mut found = false;
                    if let Some(&index) = module_index.by_ident.get(&ident) {
                        for (i, file) in builder.output_files.iter().enumerate() {
                            if browser_chunks.contains(&(i as u32))
                                && file.module_indices.contains(&index)
                            {
                                sources.insert(i as u32);
                                found = true;
                            }
                        }
                    }
                    if !found && let Some(parents) = module_index.sync_dependents.get(&module) {
                        pending.extend(parents.iter().copied());
                    }
                }
                if sources.is_empty() {
                    builder
                        .unjoined_chunk_load_edges
                        .push(AnalyzeUnjoinedChunkLoadEdge {
                            source_output_file_index: None,
                            target_path: output.clone(),
                            kind: "worker_registration".into(),
                            reason: "importer_not_in_browser_chunk",
                            trigger_module_ident: Some(importer_ident.clone()),
                        });
                } else {
                    for source in sources {
                        builder.chunk_load_edges.push(AnalyzeChunkLoadEdge {
                            source_output_file_index: source,
                            target_output_file_index: *target,
                            kind: "worker_registration".into(),
                            trigger_module_index: importer_index,
                            unjoined_trigger_ident: None,
                        });
                    }
                }
            }
        }
    }
    Ok(())
}
