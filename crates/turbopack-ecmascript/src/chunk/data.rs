use serde::Serialize;
use turbopack_core::chunk::{ChunkData, ModuleIdReadRef};

#[derive(Serialize, Hash, PartialEq, Eq)]
#[serde(untagged)]
pub enum EcmascriptChunkData<'a> {
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

impl<'a> EcmascriptChunkData<'a> {
    pub fn new(chunk_data: &ChunkData) -> EcmascriptChunkData {
        let ChunkData {
            path,
            included,
            excluded,
            module_chunks,
            references: _,
        } = chunk_data;
        if included.is_empty() && excluded.is_empty() && module_chunks.is_empty() {
            return EcmascriptChunkData::Simple(&path);
        }
        EcmascriptChunkData::WithRuntimeInfo {
            path,
            included: &included,
            excluded: &excluded,
            module_chunks: &module_chunks,
        }
    }
}
