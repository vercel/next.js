use anyhow::Result;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemEntryType, FileSystemPath};

use super::ModuleReference;
use crate::{
    chunk::{ChunkingType, TracedMode},
    file_source::FileSource,
    raw_module::RawModule,
    resolve::ModuleResolveResult,
    source_map::{GenerateSourceMap, utils::resolve_source_map_sources},
};

#[turbo_tasks::value]
#[derive(ValueToString)]
#[value_to_string("source map file is referenced by {from}")]
pub struct SourceMapReference {
    from: FileSystemPath,
    file: FileSystemPath,
}

#[turbo_tasks::value_impl]
impl SourceMapReference {
    #[turbo_tasks::function]
    pub fn new(from: FileSystemPath, file: FileSystemPath) -> Vc<Self> {
        Self::cell(SourceMapReference { from, file })
    }
}

impl SourceMapReference {
    turbo_tasks::dual_fn! {
    fn get_file(&self) -> Result<Option<FileSystemPath>> {
        let file_type = turbo_tasks::read!(self.file.get_type());
        if let Ok(file_type_result) = file_type.as_ref()
            && let FileSystemEntryType::File = &**file_type_result
        {
            return Ok(Some(self.file.clone()));
        }
        Ok(None)
    }
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for SourceMapReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        if let Some(file) = turbo_tasks::read!(self.get_file())? {
            return Ok(*ModuleResolveResult::module(ResolvedVc::upcast(
                turbo_tasks::read!(
                    RawModule::new(Vc::upcast(FileSource::new(file))).to_resolved()
                )?,
            )));
        }
        Ok(*ModuleResolveResult::unresolvable())
    }

    fn chunking_type(&self) -> Option<ChunkingType> {
        Some(ChunkingType::Traced {
            mode: TracedMode::Transitive,
        })
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for SourceMapReference {
    #[turbo_tasks::function]
    async fn generate_source_map(&self) -> Result<Vc<FileContent>> {
        let Some(file) = turbo_tasks::read!(self.get_file())? else {
            return Ok(FileContent::NotFound.cell());
        };

        let content = turbo_tasks::read!(file.read())?;
        let content = content.as_content().map(|file| file.content());
        if let Some(source_map) =
            turbo_tasks::read!(resolve_source_map_sources(content, &self.from))?
        {
            Ok(FileContent::Content(File::from(source_map)).cell())
        } else {
            Ok(FileContent::NotFound.cell())
        }
    }
}
