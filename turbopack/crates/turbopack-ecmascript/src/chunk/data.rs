use serde::Serialize;
use turbo_tasks::ReadRef;
use turbopack_core::chunk::{ChunkData, ModuleId, ModuleIdJs};

#[derive(Serialize)]
#[serde(untagged)]
pub enum EcmascriptChunkData<'a> {
    Simple(&'a str),
    #[serde(rename_all = "camelCase")]
    WithRuntimeInfo {
        path: &'a str,
        #[serde(skip_serializing_if = "<[_]>::is_empty", default)]
        included: Vec<ModuleIdJs<'a>>,
        #[serde(skip_serializing_if = "<[_]>::is_empty", default)]
        excluded: Vec<ModuleIdJs<'a>>,
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
            return EcmascriptChunkData::Simple(path);
        }
        fn to_module_id_js(module_id: &[ReadRef<ModuleId>]) -> Vec<ModuleIdJs<'_>> {
            module_id.iter().map(|v| ModuleIdJs(v)).collect()
        }

        EcmascriptChunkData::WithRuntimeInfo {
            path,
            included: to_module_id_js(included),
            excluded: to_module_id_js(excluded),
            module_chunks,
        }
    }
}
