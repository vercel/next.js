use std::hash::Hash;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_tasks::TryJoinIterExt;
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    asset::{Asset, AssetVc},
    chunk::{ModuleIdReadRef, OutputChunk, OutputChunkRuntimeInfo, OutputChunkVc},
};

#[derive(Serialize, Deserialize, Hash, PartialEq, Eq)]
#[serde(untagged)]
pub enum ChunkData {
    Simple(String),
    WithRuntimeInfo {
        path: String,
        #[serde(skip_serializing_if = "Vec::is_empty", default)]
        included: Vec<ModuleIdReadRef>,
        #[serde(skip_serializing_if = "Vec::is_empty", default)]
        excluded: Vec<ModuleIdReadRef>,
    },
}

impl ChunkData {
    pub async fn from_asset(
        output_root: &FileSystemPath,
        chunk: AssetVc,
    ) -> Result<Option<impl Serialize + Hash + PartialEq + Eq>> {
        let path = chunk.ident().path().await?;
        // The "path" in this case is the chunk's path, not the chunk item's path.
        // The difference is a chunk is a file served by the dev server, and an
        // item is one of several that are contained in that chunk file.
        let Some(path) = output_root.get_path_to(&*path) else {
            return Ok(None);
        };
        let path = path.to_string();

        let Some(output_chunk) = OutputChunkVc::resolve_from(chunk).await? else {
            return Ok(Some(ChunkData::Simple(path)));
        };

        let runtime_info = output_chunk.runtime_info().await?;

        let OutputChunkRuntimeInfo {
            included_ids,
            excluded_ids,
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

        if included.is_empty() && excluded.is_empty() {
            return Ok(Some(ChunkData::Simple(path)));
        }

        Ok(Some(ChunkData::WithRuntimeInfo {
            path,
            included,
            excluded,
        }))
    }
}
