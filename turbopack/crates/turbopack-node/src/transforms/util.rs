use std::collections::BTreeMap;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, TryJoinIterExt};
use turbo_tasks_fs::{File, FileContent, FileSystem};
use turbopack_core::{
    asset::AssetContent, server_fs::ServerFileSystem, virtual_source::VirtualSource,
};

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EmittedAsset {
    file: RcStr,
    content: RcStr,
    source_map: Option<JsonValue>,
}

pub async fn emitted_assets_to_virtual_sources(
    assets: Option<Vec<EmittedAsset>>,
) -> Result<Vec<ResolvedVc<VirtualSource>>> {
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
            VirtualSource::new(
                ServerFileSystem::new().root().join(file),
                AssetContent::File(FileContent::Content(File::from(content)).resolved_cell())
                    .cell(),
            )
            .to_resolved()
        })
        .try_join()
        .await
}
