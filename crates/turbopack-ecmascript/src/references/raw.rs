use anyhow::Result;
use turbo_tasks::{ValueToString, Vc};
use turbopack_core::{
    asset::Asset,
    reference::AssetReference,
    resolve::{pattern::Pattern, resolve_raw, ResolveResult},
    source::Source,
};

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct FileSourceReference {
    pub source: Vc<Box<dyn Source>>,
    pub path: Vc<Pattern>,
}

#[turbo_tasks::value_impl]
impl FileSourceReference {
    #[turbo_tasks::function]
    pub fn new(source: Vc<Box<dyn Source>>, path: Vc<Pattern>) -> Vc<Self> {
        Self::cell(FileSourceReference { source, path })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for FileSourceReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ResolveResult>> {
        let context = self.source.ident().path().parent();

        Ok(resolve_raw(context, self.path, false))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for FileSourceReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<String>> {
        Ok(Vc::cell(format!(
            "raw asset {}",
            self.path.to_string().await?,
        )))
    }
}
