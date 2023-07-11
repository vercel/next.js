use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbopack_core::{
    asset::Asset,
    reference::{AssetReference, AssetReferenceVc},
    resolve::{pattern::PatternVc, resolve_raw, ResolveResultVc},
    source::SourceVc,
};

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct FileSourceReference {
    pub source: SourceVc,
    pub path: PatternVc,
}

#[turbo_tasks::value_impl]
impl FileSourceReferenceVc {
    #[turbo_tasks::function]
    pub fn new(source: SourceVc, path: PatternVc) -> Self {
        Self::cell(FileSourceReference { source, path })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for FileSourceReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<ResolveResultVc> {
        let context = self.source.ident().path().parent();

        Ok(resolve_raw(context, self.path, false))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for FileSourceReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "raw asset {}",
            self.path.to_string().await?,
        )))
    }
}
