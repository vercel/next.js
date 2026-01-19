use anyhow::{Result, bail};
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    chunk::{ChunkableModuleReference, ChunkingType, ChunkingTypeOption},
    file_source::FileSource,
    issue::IssueSource,
    raw_module::RawModule,
    reference::ModuleReference,
    resolve::{
        ModuleResolveResult, RequestKey,
        pattern::{Pattern, PatternMatch, read_matches},
        resolve_raw,
    },
};

use crate::references::util::check_and_emit_too_many_matches_warning;

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct FileSourceReference {
    context_dir: FileSystemPath,
    path: ResolvedVc<Pattern>,
    collect_affecting_sources: bool,
    issue_source: IssueSource,
}

#[turbo_tasks::value_impl]
impl FileSourceReference {
    #[turbo_tasks::function]
    pub fn new(
        context_dir: FileSystemPath,
        path: ResolvedVc<Pattern>,
        collect_affecting_sources: bool,
        issue_source: IssueSource,
    ) -> Vc<Self> {
        Self::cell(FileSourceReference {
            context_dir,
            path,
            collect_affecting_sources,
            issue_source,
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
            let result = resolve_raw(
                self.context_dir.clone(),
                *self.path,
                self.collect_affecting_sources,
                /* force_in_lookup_dir */ false,
            )
            .as_raw_module_result()
            .resolve()
            .await?;
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

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct DirAssetReference {
    context_dir: FileSystemPath,
    path: ResolvedVc<Pattern>,
    issue_source: IssueSource,
}

#[turbo_tasks::value_impl]
impl DirAssetReference {
    #[turbo_tasks::function]
    pub fn new(
        context_dir: FileSystemPath,
        path: ResolvedVc<Pattern>,
        issue_source: IssueSource,
    ) -> Vc<Self> {
        Self::cell(DirAssetReference {
            context_dir,
            path,
            issue_source,
        })
    }
}

async fn resolve_reference_from_dir(
    context_dir: FileSystemPath,
    path: Vc<Pattern>,
) -> Result<Vc<ModuleResolveResult>> {
    let path_ref = path.await?;
    let (abs_path, rel_path) = path_ref.split_could_match("/ROOT/");
    if abs_path.is_none() && rel_path.is_none() {
        return Ok(*ModuleResolveResult::unresolvable());
    }

    let abs_matches = if let Some(abs_path) = &abs_path {
        Some(
            read_matches(
                context_dir.root().owned().await?,
                rcstr!("/ROOT/"),
                true,
                Pattern::new(abs_path.or_any_nested_file()),
            )
            .await?,
        )
    } else {
        None
    };
    let rel_matches = if let Some(rel_path) = &rel_path {
        Some(
            read_matches(
                context_dir,
                rcstr!(""),
                true,
                Pattern::new(rel_path.or_any_nested_file()),
            )
            .await?,
        )
    } else {
        None
    };

    let matches = abs_matches
        .into_iter()
        .flatten()
        .chain(rel_matches.into_iter().flatten());

    let mut affecting_sources = Vec::new();
    let mut results = Vec::new();
    for pat_match in matches {
        match pat_match {
            PatternMatch::File(matched_path, file) => {
                let realpath = file.realpath_with_links().await?;
                for symlink in &realpath.symlinks {
                    affecting_sources.push(ResolvedVc::upcast(
                        FileSource::new(symlink.clone()).to_resolved().await?,
                    ));
                }
                let path: FileSystemPath = match &realpath.path_result {
                    Ok(path) => path.clone(),
                    Err(e) => bail!(e.as_error_message(file, &realpath)),
                };
                results.push((
                    RequestKey::new(matched_path.clone()),
                    ResolvedVc::upcast(
                        RawModule::new(Vc::upcast(FileSource::new(path)))
                            .to_resolved()
                            .await?,
                    ),
                ));
            }
            PatternMatch::Directory(..) => {}
        }
    }
    Ok(*ModuleResolveResult::modules_with_affecting_sources(
        results,
        affecting_sources,
    ))
}

#[turbo_tasks::value_impl]
impl ModuleReference for DirAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        let span = tracing::info_span!(
            "trace directory",
            pattern = display(self.path.to_string().await?)
        );
        async {
            let result = resolve_reference_from_dir(self.context_dir.clone(), *self.path).await?;
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
impl ChunkableModuleReference for DirAssetReference {
    #[turbo_tasks::function]
    fn chunking_type(&self) -> Vc<ChunkingTypeOption> {
        Vc::cell(Some(ChunkingType::Traced))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for DirAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("directory assets {}", self.path.to_string().await?,).into(),
        ))
    }
}
