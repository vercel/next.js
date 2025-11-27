use serde::Serialize;
use turbo_tasks::ReadRef;
use turbopack_core::chunk::{ChunkData, ModuleId};

#[derive(Serialize, Hash, PartialEq, Eq)]
#[serde(untagged)]
pub enum EcmascriptChunkData<'a> {
    Simple(&'a str),
    #[serde(rename_all = "camelCase")]
    WithRuntimeInfo {
        path: &'a str,
        #[serde(skip_serializing_if = "<[_]>::is_empty", default)]
        included: &'a [ReadRef<ModuleId>],
        #[serde(skip_serializing_if = "<[_]>::is_empty", default)]
        excluded: &'a [ReadRef<ModuleId>],
        #[serde(skip_serializing_if = "<[_]>::is_empty", default)]
        module_chunks: &'a [String],
    },
}

impl EcmascriptChunkData<'_> {
    pub fn new(chunk_data: &ChunkData) -> EcmascriptChunkData<'_> {
        let ChunkData {
            path,
            included,
            excluded,
            module_chunks,
        } = chunk_data;
        if included.is_empty() && excluded.is_empty() && module_chunks.is_empty() {
            return EcmascriptChunkData::Simple(path);
        }
        EcmascriptChunkData::WithRuntimeInfo {
            path,
            included,
            excluded,
            module_chunks,
        }
    }
}
