use std::collections::HashSet;

use anyhow::{Result, bail};
use turbo_tasks::{FxIndexMap, ReadRef, ResolvedVc, TransientInstance, TryJoinIterExt, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        ChunkItem, ChunkItemExt, ChunkingContext, ChunkingType, ModuleChunkItemIdExt, ModuleId,
    },
    output::{
        ExpandOutputAssetsInput, OutputAsset, OutputAssets, OutputAssetsReferences,
        expand_output_assets,
    },
    reference::primary_chunkable_referenced_modules,
    version::{TotalUpdate, Update, Version, VersionedContent},
};
use turbopack_ecmascript::{
    async_chunk::module::AsyncLoaderModule,
    chunk::EcmascriptChunkPlaceable,
    chunk_list::{
        update::{EcmascriptUpdateInstruction, update_chunk_list},
        version::{ChunkListVersion, compute_chunk_list_version},
    },
};

use crate::{NodeJsChunkingContext, ecmascript::node::content::EcmascriptNodeChunkContent};

fn missing_parallel_reference(
    available: &HashSet<ModuleId>,
    chunking_type: &ChunkingType,
    id: &ModuleId,
) -> bool {
    matches!(chunking_type, ChunkingType::Parallel { .. }) && !available.contains(id)
}

/// Maps each chunk to its `output_root`-relative path and versioned content.
async fn collect_chunks_contents(
    output_root: &FileSystemPath,
    chunks: impl Iterator<Item = ResolvedVc<Box<dyn OutputAsset>>>,
) -> Result<FxIndexMap<String, ResolvedVc<Box<dyn VersionedContent>>>> {
    chunks
        .map(async |chunk| {
            let chunk_path = chunk.path().await?;
            let Some(path) = output_root.get_path_to(&chunk_path) else {
                bail!("chunk {chunk_path} is not inside the output root {output_root}");
            };
            Ok((
                path.to_string(),
                chunk.versioned_content().to_resolved().await?,
            ))
        })
        .try_join()
        .await
        .map(FxIndexMap::from_iter)
}

/// Never emitted as an asset — the entry chunk already inlines the `R.c(...)`
/// calls for its shared chunks. This exists purely to give the entry a
/// *stable* [`VersionedContent`] identity keyed off a chunk-list ident, so
/// adding/removing/renaming a shared chunk doesn't force a `TotalUpdate`.
///
/// Tracks both synchronous chunks and chunks reachable via async-loader
/// references (dynamic `import()`), so an edit inside a lazy-loaded module
/// still rides the merged `ChunkListUpdate` instead of being missed.
#[turbo_tasks::value]
pub struct EcmascriptBuildNodeChunkListContent {
    #[bincode(with = "turbo_bincode::indexmap")]
    pub(super) chunks_contents: FxIndexMap<String, ResolvedVc<Box<dyn VersionedContent>>>,
    /// Async-loader chunks also participate in HMR, but are not required when
    /// the route's synchronous entry graph is evaluated.
    synchronous_chunk_paths: Vec<String>,
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeChunkListContent {
    #[turbo_tasks::function]
    pub async fn compute_update_from_version(
        self: Vc<Self>,
        from: TransientInstance<ReadRef<ChunkListVersion>>,
    ) -> Result<Vc<Update>> {
        let to = self.version();
        let this = self.await?;
        let update = update_chunk_list(
            &this.chunks_contents,
            to,
            ResolvedVc::upcast(ReadRef::resolved_cell((*from).clone())),
        )
        .await?;
        let update_ref = update.await?;
        let Update::Partial(partial) = &*update_ref else {
            return Ok(update);
        };
        let Some(EcmascriptUpdateInstruction::ChunkList(instruction)) = partial
            .instruction
            .downcast_ref::<EcmascriptUpdateInstruction>(
        ) else {
            return Ok(update);
        };
        let changed_ids: HashSet<_> = instruction
            .merged
            .iter()
            .flat_map(|merged| merged.entries.keys().cloned())
            .collect();
        if changed_ids.is_empty() {
            return Ok(update);
        }

        // A chunk list and its modules' code can briefly observe different
        // revisions of the module graph during rapid file replacement. A new
        // synchronous import without a factory in the target list cannot be
        // safely applied as a partial server update.
        let mut available = HashSet::new();
        let mut changed_items = Vec::new();
        let synchronous_paths: HashSet<_> = this.synchronous_chunk_paths.iter().collect();
        for (path, chunk_content) in &this.chunks_contents {
            let Some(node_content) =
                ResolvedVc::try_downcast_type::<EcmascriptNodeChunkContent>(*chunk_content)
            else {
                continue;
            };
            for &item in node_content.included_chunk_items().await?.iter() {
                let id = item.id().await?;
                if synchronous_paths.contains(path) && changed_ids.contains(&id) {
                    changed_items.push(item);
                }
                available.insert(id);
            }
        }
        for item in changed_items {
            let module = item.module().to_resolved().await?;
            // Async loaders don't expose module references; their target chunk
            // group is tracked separately in this chunk list.
            if ResolvedVc::try_downcast_type::<AsyncLoaderModule>(module).is_some() {
                continue;
            }
            let refs = primary_chunkable_referenced_modules(*module, false, false).await?;
            let chunking_context = item.into_trait_ref().await?.chunking_context();
            for (_, reference) in refs.iter() {
                if !matches!(reference.chunking_type, ChunkingType::Parallel { .. }) {
                    continue;
                }
                for &referenced in &reference.modules {
                    // Only ECMAScript modules have factories in this chunk list.
                    if ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(referenced)
                        .is_none()
                    {
                        continue;
                    }
                    let id = referenced.chunk_item_id(chunking_context).await?;
                    if missing_parallel_reference(&available, &reference.chunking_type, &id) {
                        return Ok(Update::Total(TotalUpdate {
                            to: Vc::upcast::<Box<dyn Version>>(to).into_trait_ref().await?,
                        })
                        .cell());
                    }
                }
            }
        }
        Ok(update)
    }

    #[turbo_tasks::function]
    pub async fn new(
        chunking_context: ResolvedVc<NodeJsChunkingContext>,
        chunks: ResolvedVc<OutputAssets>,
        referenced_assets: ResolvedVc<OutputAssets>,
        references: ResolvedVc<OutputAssetsReferences>,
    ) -> Result<Vc<Self>> {
        let output_root = chunking_context.output_root().owned().await?;

        // Expand async-loader references transitively to reach dynamically
        // imported chunks. `inner=false`: only follow Reference edges (async
        // loaders), not Asset-adjacent files like source maps that aren't part
        // of the module graph and can't be hot-reloaded.
        //
        // `referenced_assets` covers async chunks that were already expanded by
        // the caller (e.g. chunks reachable from concatenated chunk groups).
        // They must be tracked here too, otherwise an edit inside one of them
        // produces no chunk list update at all.
        let async_chunks = expand_output_assets(
            referenced_assets
                .await?
                .iter()
                .copied()
                .map(ExpandOutputAssetsInput::Asset)
                .chain(
                    references
                        .await?
                        .iter()
                        .copied()
                        .map(ExpandOutputAssetsInput::Reference),
                ),
            false,
        )
        .await?;

        let synchronous_chunks_contents =
            collect_chunks_contents(&output_root, chunks.await?.iter().copied()).await?;
        let synchronous_chunk_paths = synchronous_chunks_contents.keys().cloned().collect();
        let chunks_contents = synchronous_chunks_contents
            .into_iter()
            .chain(collect_chunks_contents(&output_root, async_chunks.into_iter()).await?)
            .collect();

        Ok(EcmascriptBuildNodeChunkListContent {
            chunks_contents,
            synchronous_chunk_paths,
        }
        .cell())
    }

    /// Builds a chunk list content directly from a fixed set of `chunks`,
    /// without expanding async-loader references. Used by
    /// `super::chunk_list::EcmascriptBuildNodeChunkList` to track chunks
    /// (e.g. client-component SSR chunks) that are already fully enumerated by
    /// the caller.
    #[turbo_tasks::function]
    pub async fn new_from_chunks(
        chunking_context: ResolvedVc<NodeJsChunkingContext>,
        chunks: Vc<OutputAssets>,
    ) -> Result<Vc<Self>> {
        let output_root = chunking_context.output_root().owned().await?;
        let chunks_contents =
            collect_chunks_contents(&output_root, chunks.await?.iter().copied()).await?;

        Ok(EcmascriptBuildNodeChunkListContent {
            synchronous_chunk_paths: chunks_contents.keys().cloned().collect(),
            chunks_contents,
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub async fn version(&self) -> Result<Vc<ChunkListVersion>> {
        compute_chunk_list_version(&self.chunks_contents).await
    }
}

#[turbo_tasks::value_impl]
impl VersionedContent for EcmascriptBuildNodeChunkListContent {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        bail!("EcmascriptBuildNodeChunkListContent does not have content")
    }

    #[turbo_tasks::function]
    fn version(self: Vc<Self>) -> Vc<Box<dyn Version>> {
        Vc::upcast(self.version())
    }

    #[turbo_tasks::function]
    async fn update(
        self: ResolvedVc<Self>,
        from_version: ResolvedVc<Box<dyn Version>>,
    ) -> Result<Vc<Update>> {
        let this = self.await?;
        let to_version = self.version();
        update_chunk_list(&this.chunks_contents, to_version, from_version).await
    }
}

#[turbo_tasks::function(operation, root)]
pub fn compute_update_from_version_operation(
    content: ResolvedVc<EcmascriptBuildNodeChunkListContent>,
    from: TransientInstance<ReadRef<ChunkListVersion>>,
) -> Vc<Update> {
    content.compute_update_from_version(from)
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use turbopack_core::chunk::{ChunkingType, ModuleId};

    use super::missing_parallel_reference;

    #[test]
    fn missing_parallel_factory_requires_restart() {
        let present = ModuleId::String("present".into());
        let missing = ModuleId::String("missing".into());
        let available = HashSet::from([present.clone()]);
        let parallel = ChunkingType::Parallel {
            inherit_async: true,
            hoisted: true,
        };

        assert!(!missing_parallel_reference(&available, &parallel, &present));
        assert!(missing_parallel_reference(&available, &parallel, &missing));
    }

    #[test]
    fn separate_chunk_groups_do_not_require_a_restart() {
        let available = HashSet::new();
        let missing = ModuleId::String("async".into());
        assert!(!missing_parallel_reference(
            &available,
            &ChunkingType::Async,
            &missing
        ));
        assert!(!missing_parallel_reference(
            &available,
            &ChunkingType::Shared {
                inherit_async: false,
                merge_tag: None,
            },
            &missing
        ));
    }
}
