use anyhow::{Result, bail};
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    chunk::{ChunkingType, TracedMode},
    file_source::FileSource,
    issue::IssueSource,
    raw_module::RawModule,
    reference::{DynamicTraceReference, ModuleReference},
    resolve::{
        ModuleResolveResult, RequestKey,
        pattern::{Pattern, PatternMatch, read_matches},
        resolve_raw,
    },
};

use crate::references::util::check_and_emit_too_many_matches_warning;

#[turbo_tasks::value]
#[derive(Hash, Debug, ValueToString)]
#[value_to_string("raw asset {path}")]
pub struct FileSourceReference {
    context_dir: FileSystemPath,
    path: ResolvedVc<Pattern>,
    collect_affecting_sources: bool,
    issue_source: IssueSource,
    /// The dynamic function whose access triggered this reference (e.g.
    /// `fs.readFileSync`), used to name the call in diagnostics.
    origin_fn_name: RcStr,
}

#[turbo_tasks::value_impl]
impl FileSourceReference {
    #[turbo_tasks::function]
    pub fn new(
        context_dir: FileSystemPath,
        path: ResolvedVc<Pattern>,
        collect_affecting_sources: bool,
        issue_source: IssueSource,
        origin_fn_name: RcStr,
    ) -> Vc<Self> {
        Self::cell(FileSourceReference {
            context_dir,
            path,
            collect_affecting_sources,
            issue_source,
            origin_fn_name,
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
            .to_resolved()
            .await?;
            check_and_emit_too_many_matches_warning(
                *result,
                self.issue_source,
                self.context_dir.clone(),
                self.path,
            )
            .await?;

            Ok(*result)
        }
        .instrument(span)
        .await
    }

    fn chunking_type(&self) -> Option<ChunkingType> {
        Some(ChunkingType::Traced {
            mode: TracedMode::Entry,
        })
    }

    fn source(&self) -> Option<IssueSource> {
        Some(self.issue_source)
    }
}

#[turbo_tasks::value_impl]
impl DynamicTraceReference for FileSourceReference {
    fn origin_fn_name(&self) -> RcStr {
        self.origin_fn_name.clone()
    }
}

#[turbo_tasks::value]
#[derive(Hash, Debug, ValueToString)]
#[value_to_string("directory assets {path}")]
pub struct DirAssetReference {
    context_dir: FileSystemPath,
    path: ResolvedVc<Pattern>,
    issue_source: IssueSource,
    /// The dynamic function whose access triggered this reference (e.g.
    /// `fs.readdir`), used to name the call in diagnostics.
    origin_fn_name: RcStr,
}

#[turbo_tasks::value_impl]
impl DirAssetReference {
    #[turbo_tasks::function]
    pub fn new(
        context_dir: FileSystemPath,
        path: ResolvedVc<Pattern>,
        issue_source: IssueSource,
        origin_fn_name: RcStr,
    ) -> Vc<Self> {
        Self::cell(DirAssetReference {
            context_dir,
            path,
            issue_source,
            origin_fn_name,
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
        .iter()
        .flatten()
        .chain(rel_matches.iter().flatten());

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
                    Err(e) => bail!(e.as_error_message(file, &realpath).await?),
                };
                results.push((
                    RequestKey::new(matched_path.clone()),
                    ResolvedVc::upcast(
                        RawModule::new(Vc::upcast(FileSource::new(path.clone())))
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

    fn chunking_type(&self) -> Option<ChunkingType> {
        Some(ChunkingType::Traced {
            mode: TracedMode::Entry,
        })
    }

    fn source(&self) -> Option<IssueSource> {
        Some(self.issue_source)
    }
}

#[turbo_tasks::value_impl]
impl DynamicTraceReference for DirAssetReference {
    fn origin_fn_name(&self) -> RcStr {
        self.origin_fn_name.clone()
    }
}
