use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbo_tasks_fs::{FileSystemEntryType, FileSystemPathVc};

use super::{AssetReference, AssetReferenceVc};
use crate::{
    resolve::{ResolveResult, ResolveResultVc},
    source_asset::SourceAssetVc,
};

#[turbo_tasks::value]
pub struct SourceMap {
    from: FileSystemPathVc,
    file: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl SourceMapVc {
    #[turbo_tasks::function]
    pub fn new(from: FileSystemPathVc, file: FileSystemPathVc) -> Self {
        Self::cell(SourceMap { from, file })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for SourceMap {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> ResolveResultVc {
        let file_type = self.file.get_type().await;
        if let Ok(file_type_result) = file_type.as_ref() {
            if let FileSystemEntryType::File = &**file_type_result {
                return ResolveResult::Single(SourceAssetVc::new(self.file).into(), Vec::new())
                    .into();
            }
        }
        ResolveResult::unresolveable().into()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for SourceMap {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "source map file is referenced by {}",
            self.from.to_string().await?
        )))
    }
}
