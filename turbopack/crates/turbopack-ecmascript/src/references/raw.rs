use anyhow::Result;
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    chunk::{ChunkableModuleReference, ChunkingType, ChunkingTypeOption},
    reference::ModuleReference,
    resolve::{ModuleResolveResult, pattern::Pattern, resolve_raw},
};

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct FileSourceReference {
    context_dir: FileSystemPath,
    path: ResolvedVc<Pattern>,
    collect_affecting_sources: bool,
}

#[turbo_tasks::value_impl]
impl FileSourceReference {
    #[turbo_tasks::function]
    pub fn new(
        context_dir: FileSystemPath,
        path: ResolvedVc<Pattern>,
        collect_affecting_sources: bool,
    ) -> Vc<Self> {
        Self::cell(FileSourceReference {
            context_dir,
            path,
            collect_affecting_sources,
        })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for FileSourceReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        let span = tracing::info_span!(
            "trace file",
            pattern = display(self.path.to_string().await?)
        );
        async {
            resolve_raw(
                self.context_dir.clone(),
                *self.path,
                self.collect_affecting_sources,
                /* force_in_lookup_dir */ false,
            )
            .as_raw_module_result()
            .resolve()
            .await
        }
        .instrument(span)
        .await
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for FileSourceReference {
    #[turbo_tasks::function]
    fn chunking_type(&self) -> Vc<ChunkingTypeOption> {
        Vc::cell(Some(ChunkingType::Traced))
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
