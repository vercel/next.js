use anyhow::Result;
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    chunk::{ChunkableModuleReference, ChunkingType, ChunkingTypeOption},
    context::AssetContext,
    file_source::FileSource,
    issue::IssueSource,
    raw_module::RawModule,
    reference::ModuleReference,
    reference_type::{ReferenceType, WorkerReferenceSubType},
    resolve::{ModuleResolveResult, pattern::Pattern, resolve_raw},
};

use crate::references::util::check_and_emit_too_many_matches_warning;

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

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct FilePathModuleReference {
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
    context_dir: FileSystemPath,
    path: ResolvedVc<Pattern>,
    collect_affecting_sources: bool,
    issue_source: IssueSource,
}

#[turbo_tasks::value_impl]
impl FilePathModuleReference {
    #[turbo_tasks::function]
    pub fn new(
        asset_context: ResolvedVc<Box<dyn AssetContext>>,
        context_dir: FileSystemPath,
        path: ResolvedVc<Pattern>,
        collect_affecting_sources: bool,
        issue_source: IssueSource,
    ) -> Vc<Self> {
        Self {
            asset_context,
            context_dir,
            path,
            collect_affecting_sources,
            issue_source,
        }
        .cell()
    }
}

// A reference to an module by absolute or cwd-relative file path (e.g. for the
// worker-threads `new Worker` which has the resolving behavior of `fs.readFile` but should treat
// the resolve result as an module instead of a raw source).
#[turbo_tasks::value_impl]
impl ModuleReference for FilePathModuleReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        let span = tracing::info_span!(
            "trace module",
            pattern = display(self.path.to_string().await?)
        );
        async {
            let result = resolve_raw(
                self.context_dir.clone(),
                *self.path,
                self.collect_affecting_sources,
                /* force_in_lookup_dir */ false,
            );
            let result = self.asset_context.process_resolve_result(
                result,
                ReferenceType::Worker(WorkerReferenceSubType::NodeWorker),
            );

            check_and_emit_too_many_matches_warning(
                result,
                self.issue_source,
                self.context_dir.clone(),
                self.path,
            )
            .await?;

            Ok(result)
        }
        .instrument(span)
        .await
    }
}
#[turbo_tasks::value_impl]
impl ChunkableModuleReference for FilePathModuleReference {
    #[turbo_tasks::function]
    fn chunking_type(&self) -> Vc<ChunkingTypeOption> {
        Vc::cell(Some(ChunkingType::Traced))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for FilePathModuleReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("raw asset {}", self.path.to_string().await?,).into(),
        ))
    }
}
