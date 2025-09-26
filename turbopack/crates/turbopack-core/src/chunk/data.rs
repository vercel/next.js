use anyhow::Result;
use turbo_tasks::{ReadRef, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbo_tasks_hash::Xxh3Hash64Hasher;

use crate::{
    chunk::{ModuleId, OutputChunk, OutputChunkRuntimeInfo},
    output::{OutputAsset, OutputAssets},
};

#[turbo_tasks::value]
pub struct ChunkData {
    pub path: String,
    pub included: Vec<ReadRef<ModuleId>>,
    pub excluded: Vec<ReadRef<ModuleId>>,
    pub module_chunks: Vec<String>,
}

#[turbo_tasks::value(transparent)]
pub struct ChunkDataOption(Option<ResolvedVc<ChunkData>>);

// NOTE(alexkirsz) Our convention for naming vector types is to add an "s" to
// the end of the type name, but in this case it would be both grammatically
// incorrect and clash with the variable names everywhere.
// TODO(WEB-101) Should fix this.
#[turbo_tasks::value(transparent)]
pub struct ChunksData(Vec<ResolvedVc<ChunkData>>);

#[turbo_tasks::value_impl]
impl ChunksData {
    #[turbo_tasks::function]
    pub async fn hash(&self) -> Result<Vc<u64>> {
        let mut hasher = Xxh3Hash64Hasher::new();
        for chunk in self.0.iter() {
            hasher.write_value(chunk.await?.path.as_str());
        }
        Ok(Vc::cell(hasher.finish()))
    }
}

#[turbo_tasks::value_impl]
impl ChunkData {
    #[turbo_tasks::function]
    pub async fn hash(&self) -> Result<Vc<u64>> {
        let mut hasher = Xxh3Hash64Hasher::new();
        hasher.write_value(self.path.as_str());
        for module in &self.included {
            hasher.write_value(module);
        }
        for module in &self.excluded {
            hasher.write_value(module);
        }
        for module_chunk in &self.module_chunks {
            hasher.write_value(module_chunk.as_str());
        }

        Ok(Vc::cell(hasher.finish()))
    }

    #[turbo_tasks::function]
    pub async fn from_asset(
        output_root: FileSystemPath,
        chunk: Vc<Box<dyn OutputAsset>>,
    ) -> Result<Vc<ChunkDataOption>> {
        let path = chunk.path().await?;
        // The "path" in this case is the chunk's path, not the chunk item's path.
        // The difference is a chunk is a file served by the dev server, and an
        // item is one of several that are contained in that chunk file.
        let Some(path) = output_root.get_path_to(&path) else {
            return Ok(Vc::cell(None));
        };
        let path = path.to_string();

        let Some(output_chunk) = Vc::try_resolve_sidecast::<Box<dyn OutputChunk>>(chunk).await?
        else {
            return Ok(Vc::cell(Some(
                ChunkData {
                    path,
                    included: Vec::new(),
                    excluded: Vec::new(),
                    module_chunks: Vec::new(),
                }
                .resolved_cell(),
            )));
        };

        let runtime_info = output_chunk.runtime_info().await?;

        let OutputChunkRuntimeInfo {
            included_ids,
            excluded_ids,
            module_chunks,
            placeholder_for_future_extensions: _,
        } = &*runtime_info;

        let included = if let Some(included_ids) = included_ids {
            included_ids.await?.iter().copied().try_join().await?
        } else {
            Vec::new()
        };
        let excluded = if let Some(excluded_ids) = excluded_ids {
            excluded_ids.await?.iter().copied().try_join().await?
        } else {
            Vec::new()
        };
        let module_chunks = if let Some(module_chunks) = module_chunks {
            module_chunks
                .await?
                .iter()
                .copied()
                .map(|chunk| {
                    let output_root = output_root.clone();

                    async move {
                        let chunk_path = chunk.path().await?;
                        Ok(output_root
                            .get_path_to(&chunk_path)
                            .map(|path| path.to_owned()))
                    }
                })
                .try_flat_join()
                .await?
        } else {
            Vec::new()
        };

        Ok(Vc::cell(Some(
            ChunkData {
                path,
                included,
                excluded,
                module_chunks,
            }
            .resolved_cell(),
        )))
    }

    #[turbo_tasks::function]
    pub async fn from_assets(
        output_root: FileSystemPath,
        chunks: Vc<OutputAssets>,
    ) -> Result<Vc<ChunksData>> {
        Ok(Vc::cell(
            chunks
                .await?
                .iter()
                .map(|&chunk| ChunkData::from_asset(output_root.clone(), *chunk))
                .try_join()
                .await?
                .into_iter()
                .flat_map(|chunk| *chunk)
                .collect(),
        ))
    }
}
