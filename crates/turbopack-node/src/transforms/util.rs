use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use turbo_tasks_fs::{File, FileContent, FileSystem};
use turbopack_core::{
    asset::AssetContent, server_fs::ServerFileSystemVc, virtual_source::VirtualSourceVc,
};

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EmittedAsset {
    file: String,
    content: String,
    source_map: Option<JsonValue>,
}

pub fn emitted_assets_to_virtual_sources(
    assets: Option<Vec<EmittedAsset>>,
) -> Vec<VirtualSourceVc> {
    assets
        .into_iter()
        .flatten()
        .map(
            |EmittedAsset {
                 file,
                 content,
                 source_map,
             }| (file, (content, source_map)),
        )
        // Sort it to make it determinstic
        .collect::<BTreeMap<_, _>>()
        .into_iter()
        .map(|(file, (content, _source_map))| {
            // TODO handle SourceMap
            VirtualSourceVc::new(
                ServerFileSystemVc::new().root().join(&file),
                AssetContent::File(FileContent::Content(File::from(content)).cell()).cell(),
            )
        })
        .collect()
}
