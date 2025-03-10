use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::{FileSystemEntryType, FileSystemPath};

use super::ModuleReference;
use crate::{
    file_source::FileSource,
    raw_module::RawModule,
    resolve::ModuleResolveResult,
    source_map::{
        utils::resolve_source_map_sources, GenerateSourceMap, OptionStringifiedSourceMap,
    },
};

#[turbo_tasks::value]
pub struct SourceMapReference {
    from: ResolvedVc<FileSystemPath>,
    file: ResolvedVc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl SourceMapReference {
    #[turbo_tasks::function]
    pub fn new(from: ResolvedVc<FileSystemPath>, file: ResolvedVc<FileSystemPath>) -> Vc<Self> {
        Self::cell(SourceMapReference { from, file })
    }
}

impl SourceMapReference {
    async fn get_file(&self) -> Option<Vc<FileSystemPath>> {
        let file_type = self.file.get_type().await;
        if let Ok(file_type_result) = file_type.as_ref() {
            if let FileSystemEntryType::File = &**file_type_result {
                return Some(*self.file);
            }
        }
        None
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for SourceMapReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        if let Some(file) = self.get_file().await {
            return Ok(*ModuleResolveResult::module(ResolvedVc::upcast(
                RawModule::new(Vc::upcast(FileSource::new(file)))
                    .to_resolved()
                    .await?,
            )));
        }
        Ok(*ModuleResolveResult::unresolvable())
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for SourceMapReference {
    #[turbo_tasks::function]
    async fn generate_source_map(&self) -> Result<Vc<OptionStringifiedSourceMap>> {
        let Some(file) = self.get_file().await else {
            return Ok(Vc::cell(None));
        };

        let content = file.read().await?;
        let content = content.as_content().map(|file| file.content());
        let source_map = resolve_source_map_sources(content, *self.from).await?;
        Ok(Vc::cell(source_map))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for SourceMapReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!(
                "source map file is referenced by {}",
                self.from.to_string().await?
            )
            .into(),
        ))
    }
}
