//! Build-time output groups with joined async and worker triggers.

use anyhow::Result;
use rustc_hash::{FxHashMap, FxHashSet};
use turbo_tasks::{FxIndexSet, ResolvedVc, ValueToString, ValueToStringRef, Vc};
use turbopack_core::{module::Module, output::OutputAsset};
use turbopack_ecmascript::references::service_worker::service_worker_chunk_filename;

use crate::{
    analyze::{AnalyzeChunkGroupData, AnalyzeDataBuilder, AnalyzeModuleIndex, ChunkLoadCandidate},
    route::AnalyzeChunkGroups,
};

pub(super) async fn collect_groups(
    builder: &mut AnalyzeDataBuilder,
    candidates: Vec<ChunkLoadCandidate>,
    asset_indices: &FxHashMap<ResolvedVc<Box<dyn OutputAsset>>, Vec<u32>>,
    chunk_groups: Vc<AnalyzeChunkGroups>,
    module_index: &AnalyzeModuleIndex,
    browser_chunks: &FxHashSet<u32>,
) -> Result<()> {
    record_async_groups(builder, candidates, asset_indices);
    record_groups(builder, asset_indices, chunk_groups, module_index).await?;
    record_worker_groups(builder, module_index, browser_chunks).await?;
    for (id, group) in builder.chunk_groups.iter_mut().enumerate() {
        group.id = id as u32;
    }
    Ok(())
}

fn record_async_groups(
    builder: &mut AnalyzeDataBuilder,
    candidates: Vec<ChunkLoadCandidate>,
    asset_indices: &FxHashMap<ResolvedVc<Box<dyn OutputAsset>>, Vec<u32>>,
) {
    let mut async_groups = FxHashMap::default();
    for candidate in candidates {
        let Some(target_indices) = asset_indices.get(&candidate.target) else {
            continue;
        };
        for &target in target_indices {
            if target == candidate.source {
                continue;
            }
            let key = (candidate.source, candidate.trigger_module_index);
            let group_index = *async_groups.entry(key).or_insert_with(|| {
                let index = builder.chunk_groups.len();
                builder.chunk_groups.push(AnalyzeChunkGroupData {
                    id: index as u32,
                    kind: "async".into(),
                    trigger_module_index: Some(candidate.trigger_module_index),
                    output_file_indices: vec![],
                });
                index
            });
            let outputs = &mut builder.chunk_groups[group_index].output_file_indices;
            if !outputs.contains(&target) {
                outputs.push(target);
            }
        }
    }
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
        let trigger_module_index = if let Some(module) = group.trigger {
            let ident = module.ident().to_string().owned().await?;
            Some(*module_index.by_ident.get(&ident).ok_or_else(|| {
                anyhow::anyhow!(
                    "{} group trigger {ident} is missing from the analyzer module index",
                    group.kind
                )
            })?)
        } else {
            None
        };
        builder.chunk_groups.push(AnalyzeChunkGroupData {
            id,
            kind: group.kind.clone(),
            trigger_module_index,
            output_file_indices: output_indices.into_iter().collect(),
        });
    }
    Ok(())
}

/// The marker is in the page graph, but its worker payload is in a separate
/// compilation graph. Trace only synchronous dependents to a browser item.
async fn record_worker_groups(
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
    builder.chunk_groups.retain(|group| group.kind != "worker");
    let mut worker_groups = FxHashMap::default();
    if !worker_files.is_empty() {
        for &(importer, marker) in &module_index.worker_entries {
            let marker = marker.await?;
            let filename = service_worker_chunk_filename(&marker.scope);
            for target in &worker_files {
                let output = &builder.output_files[*target as usize].output_file.filename;
                if !output.ends_with(filename.as_str()) {
                    continue;
                }
                // A registration may live in generated `<locals>`; find the
                // enclosing emitted item without crossing async/traced edges.
                let mut triggers = FxIndexSet::default();
                let mut pending = vec![importer];
                let mut seen = FxHashSet::default();
                while let Some(module) = pending.pop() {
                    if !seen.insert(module) {
                        continue;
                    }
                    let ident = module.ident().to_string().owned().await?;
                    let mut found = false;
                    if let Some(&index) = module_index.by_ident.get(&ident) {
                        found = builder.output_files.iter().enumerate().any(|(i, file)| {
                            browser_chunks.contains(&(i as u32))
                                && file.module_indices.contains(&index)
                        });
                        if found {
                            triggers.insert(index);
                        }
                    }
                    if !found && let Some(parents) = module_index.sync_dependents.get(&module) {
                        pending.extend(parents.iter().copied());
                    }
                }
                for trigger in triggers {
                    let group_index = *worker_groups.entry(trigger).or_insert_with(|| {
                        let index = builder.chunk_groups.len();
                        builder.chunk_groups.push(AnalyzeChunkGroupData {
                            id: index as u32,
                            kind: "worker".into(),
                            trigger_module_index: Some(trigger),
                            output_file_indices: vec![],
                        });
                        index
                    });
                    let outputs = &mut builder.chunk_groups[group_index].output_file_indices;
                    if !outputs.contains(target) {
                        outputs.push(*target);
                    }
                }
            }
        }
    }
    Ok(())
}
