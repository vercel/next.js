use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbopack_core::{
    reference::ModuleReference,
    resolve::{origin::ResolveOrigin, pattern::Pattern, resolve_raw, ModuleResolveResult},
    source::Source,
};

use crate::references::EcmascriptModuleReferenceable;

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct FileSourceReference {
    pub source: ResolvedVc<Box<dyn Source>>,
    pub path: ResolvedVc<Pattern>,
}

#[turbo_tasks::value_impl]
impl FileSourceReference {
    #[turbo_tasks::function]
    pub fn new(source: ResolvedVc<Box<dyn Source>>, path: ResolvedVc<Pattern>) -> Vc<Self> {
        Self::cell(FileSourceReference { source, path })
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptModuleReferenceable for FileSourceReference {
    #[turbo_tasks::function]
    fn as_reference(
        self: Vc<Self>,
        _origin: Vc<Box<dyn ResolveOrigin>>,
    ) -> Vc<Box<dyn ModuleReference>> {
        Vc::upcast(self)
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for FileSourceReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        let context_dir = self.source.ident().path().parent();

        resolve_raw(context_dir, *self.path, false).as_raw_module_result()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for FileSourceReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("raw asset {}", self.path.to_string().await?,).into(),
        ))
    }
}
