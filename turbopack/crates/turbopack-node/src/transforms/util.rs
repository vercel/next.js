use anyhow::Result;
use bincode::{Decode, Encode};
use either::Either;
use serde::Deserialize;
use serde_with::serde_as;
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, ResolvedVc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbopack_core::emitted_output::EmittedFile;

#[serde_as]
#[derive(
    Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Deserialize, NonLocalValue, Encode, Decode,
)]
pub struct BytesBase64 {
    #[serde_as(as = "serde_with::base64::Base64")]
    pub binary: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, NonLocalValue, Encode, Decode)]
#[serde(rename_all = "camelCase")]
pub struct LoaderEmittedAsset {
    file: RcStr,
    #[serde(with = "either::serde_untagged")]
    #[bincode(with = "turbo_bincode::either")]
    content: Either<RcStr, BytesBase64>,
}

pub fn loader_emitted_assets_to_files(
    assets: Option<Vec<LoaderEmittedAsset>>,
    scope: &RcStr,
    origin: &FileSystemPath,
) -> Result<Vec<ResolvedVc<EmittedFile>>> {
    assets
        .into_iter()
        .flatten()
        .map(|asset| {
            let content = match asset.content {
                Either::Left(text) => File::from(text),
                Either::Right(bytes) => File::from(bytes.binary),
            };
            Ok(EmittedFile {
                scope: scope.clone(),
                name: asset.file,
                origin: origin.clone(),
                content: FileContent::Content(content).resolved_cell(),
            }
            .resolved_cell())
        })
        .collect()
}
