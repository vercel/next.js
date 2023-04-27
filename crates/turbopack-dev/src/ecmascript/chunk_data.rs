use std::hash::Hash;

use anyhow::Result;
use serde::Serialize;
use turbo_tasks::{primitives::StringVc, TryJoinIterExt};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::{Asset, AssetVc, AssetsVc},
    chunk::{ModuleIdReadRef, OutputChunk, OutputChunkRuntimeInfo, OutputChunkVc},
    reference::{AssetReferencesVc, SingleAssetReferenceVc},
};

#[turbo_tasks::value]
pub struct ChunkData {
    pub path: String,
    pub included: Vec<ModuleIdReadRef>,
    pub excluded: Vec<ModuleIdReadRef>,
    pub module_chunks: Vec<String>,
    pub references: AssetReferencesVc,
}

impl ChunkData {
    /// Returns a serializable version of this chunk data.
    pub fn runtime_chunk_data(&self) -> RuntimeChunkData {
        let ChunkData {
            path,
            included,
            excluded,
            module_chunks,
            references: _,
        } = self;
        if included.is_empty() && excluded.is_empty() && module_chunks.is_empty() {
            return RuntimeChunkData::Simple(&path);
        }
        RuntimeChunkData::WithRuntimeInfo {
            path,
            included: &included,
            excluded: &excluded,
            module_chunks: &module_chunks,
        }
    }
}

#[derive(Serialize, Hash, PartialEq, Eq)]
#[serde(untagged)]
pub enum RuntimeChunkData<'a> {
    Simple(&'a str),
    #[serde(rename_all = "camelCase")]
    WithRuntimeInfo {
        path: &'a str,
        #[serde(skip_serializing_if = "<[_]>::is_empty", default)]
        included: &'a [ModuleIdReadRef],
        #[serde(skip_serializing_if = "<[_]>::is_empty", default)]
        excluded: &'a [ModuleIdReadRef],
        #[serde(skip_serializing_if = "<[_]>::is_empty", default)]
        module_chunks: &'a [String],
    },
}

#[turbo_tasks::value(transparent)]
pub struct ChunkDataOption(Option<ChunkDataVc>);

// NOTE(alexkirsz) Our convention for naming vector types is to add an "s" to
// the end of the type name, but in this case it would be both gramatically
// incorrect and clash with the variable names everywhere.
// TODO(WEB-101) Should fix this.
#[turbo_tasks::value(transparent)]
pub struct ChunksData(Vec<ChunkDataVc>);

#[turbo_tasks::function]
fn module_chunk_reference_description() -> StringVc {
    StringVc::cell("module chunk".to_string())
}

#[turbo_tasks::value_impl]
impl ChunkDataVc {
    #[turbo_tasks::function]
    pub async fn from_asset(
        output_root: FileSystemPathVc,
        chunk: AssetVc,
    ) -> Result<ChunkDataOptionVc> {
        let output_root = output_root.await?;
        let path = chunk.ident().path().await?;
        // The "path" in this case is the chunk's path, not the chunk item's path.
        // The difference is a chunk is a file served by the dev server, and an
        // item is one of several that are contained in that chunk file.
        let Some(path) = output_root.get_path_to(&*path) else {
            return Ok(ChunkDataOptionVc::cell(None));
        };
        let path = path.to_string();

        let Some(output_chunk) = OutputChunkVc::resolve_from(chunk).await? else {
            return Ok(ChunkDataOptionVc::cell(Some(ChunkData {
                path,
                included: Vec::new(),
                excluded: Vec::new(),
                module_chunks: Vec::new(),
                references: AssetReferencesVc::empty(),
            }.cell())));
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
        let (module_chunks, module_chunks_references) = if let Some(module_chunks) = module_chunks {
            module_chunks
                .await?
                .iter()
                .copied()
                .map(|chunk| {
                    let output_root = output_root.clone();

                    async move {
                        let chunk_path = chunk.ident().path().await?;
                        Ok(output_root.get_path_to(&*chunk_path).map(|path| {
                            (
                                path.to_owned(),
                                SingleAssetReferenceVc::new(
                                    chunk,
                                    module_chunk_reference_description(),
                                )
                                .as_asset_reference(),
                            )
                        }))
                    }
                })
                .try_join()
                .await?
                .into_iter()
                .flatten()
                .unzip()
        } else {
            (Vec::new(), Vec::new())
        };

        Ok(ChunkDataOptionVc::cell(Some(
            ChunkData {
                path,
                included,
                excluded,
                module_chunks: module_chunks,
                references: AssetReferencesVc::cell(module_chunks_references),
            }
            .cell(),
        )))
    }

    #[turbo_tasks::function]
    pub async fn from_assets(
        output_root: FileSystemPathVc,
        chunks: AssetsVc,
    ) -> Result<ChunksDataVc> {
        Ok(ChunksDataVc::cell(
            chunks
                .await?
                .iter()
                .map(|&chunk| ChunkDataVc::from_asset(output_root, chunk))
                .try_join()
                .await?
                .into_iter()
                .flat_map(|chunk| *chunk)
                .collect(),
        ))
    }

    /// Returns [`AssetReferences`] to the assets that this chunk data
    /// references.
    #[turbo_tasks::function]
    pub async fn references(self) -> Result<AssetReferencesVc> {
        Ok(self.await?.references)
    }
}
