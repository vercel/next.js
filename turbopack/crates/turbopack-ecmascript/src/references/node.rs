use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    file_source::FileSource, raw_module::RawModule, reference::ModuleReference,
    resolve::ModuleResolveResult,
};

#[turbo_tasks::value]
#[derive(Hash, Clone, Debug)]
pub struct PackageJsonReference {
    pub package_json: FileSystemPath,
}

#[turbo_tasks::value_impl]
impl PackageJsonReference {
    #[turbo_tasks::function]
    pub fn new(package_json: FileSystemPath) -> Vc<Self> {
        Self::cell(PackageJsonReference { package_json })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for PackageJsonReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        Ok(*ModuleResolveResult::module(ResolvedVc::upcast(
            RawModule::new(Vc::upcast(FileSource::new(self.package_json.clone())))
                .to_resolved()
                .await?,
        )))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for PackageJsonReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!(
                "package.json {}",
                self.package_json.value_to_string().await?
            )
            .into(),
        ))
    }
}
