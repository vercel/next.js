use std::collections::BTreeMap;

use anyhow::Result;
use bincode::{Decode, Encode};
use serde::Deserialize;
use serde_json::Value as JsonValue;
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, ResolvedVc, trace::TraceRawVcs};
use turbo_tasks_fs::{File, FileContent, FileSystem};
use turbopack_core::{
    asset::AssetContent, server_fs::ServerFileSystem, virtual_source::VirtualSource,
};

#[derive(Debug, PartialEq, Eq, Deserialize, Clone, TraceRawVcs, NonLocalValue, Encode, Decode)]
#[serde(rename_all = "camelCase")]
pub struct EmittedAsset {
    file: RcStr,
    content: RcStr,
    #[bincode(with = "turbo_bincode::serde_self_describing")]
    source_map: Option<JsonValue>,
}

turbo_tasks::dual_fn! {
    pub fn emitted_assets_to_virtual_sources(
        assets: Option<Vec<EmittedAsset>>,
    ) -> Result<Vec<ResolvedVc<VirtualSource>>> {
        // Sort it to make it deterministic
        let sorted: BTreeMap<_, _> = assets
            .into_iter()
            .flatten()
            .map(
                |EmittedAsset {
                     file,
                     content,
                     source_map,
                 }| (file, (content, source_map)),
            )
            .collect();
        let mut sources = Vec::with_capacity(sorted.len());
        for (file, (content, _source_map)) in sorted {
            // TODO handle SourceMap
            sources.push(turbo_tasks::read!(
                VirtualSource::new(
                    turbo_tasks::read!(ServerFileSystem::new().root())?.join(&file)?,
                    AssetContent::File(FileContent::Content(File::from(content)).resolved_cell())
                        .cell(),
                )
                .to_resolved()
            )?);
        }
        Ok(sources)
    }
}
