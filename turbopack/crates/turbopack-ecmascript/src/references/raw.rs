use anyhow::{Result, bail};
#[cfg(not(feature = "sync"))]
use tracing::Instrument;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    chunk::{ChunkingType, TracedMode},
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
#[derive(Hash, Debug, ValueToString)]
#[value_to_string("raw asset {path}")]
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

turbo_tasks::dual_fn! {
/// The uninstrumented body of [`FileSourceReference::resolve_reference`] (split out so
/// both modes can wrap it in the tracing span).
fn resolve_file_source_reference(
    context_dir: FileSystemPath,
    path: ResolvedVc<Pattern>,
    collect_affecting_sources: bool,
    issue_source: IssueSource,
) -> Result<Vc<ModuleResolveResult>> {
    let result = turbo_tasks::read!(resolve_raw(
        context_dir.clone(),
        *path,
        collect_affecting_sources,
        /* force_in_lookup_dir */ false,
    )
    .as_raw_module_result()
    .to_resolved())
    ?;
    turbo_tasks::read!(check_and_emit_too_many_matches_warning(
        *result,
        issue_source,
        context_dir,
        path,
    ))
    ?;

    Ok(*result)
}
}

#[turbo_tasks::value_impl]
impl ModuleReference for FileSourceReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        let span = tracing::info_span!(
            "trace file",
            pattern = display(turbo_tasks::read!(self.path.to_string())?)
        );
        #[cfg(not(feature = "sync"))]
        let result = resolve_file_source_reference(
            self.context_dir.clone(),
            self.path,
            self.collect_affecting_sources,
            self.issue_source,
        )
        .instrument(span)
        .await;
        #[cfg(feature = "sync")]
        let result = {
            let _enter = span.entered();
            resolve_file_source_reference(
                self.context_dir.clone(),
                self.path,
                self.collect_affecting_sources,
                self.issue_source,
            )
        };
        result
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

#[turbo_tasks::value]
#[derive(Hash, Debug, ValueToString)]
#[value_to_string("directory assets {path}")]
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

turbo_tasks::dual_fn! {
fn resolve_reference_from_dir(
    context_dir: FileSystemPath,
    path: Vc<Pattern>,
) -> Result<Vc<ModuleResolveResult>> {
    let path_ref = turbo_tasks::read!(path)?;
    let (abs_path, rel_path) = path_ref.split_could_match("/ROOT/");
    if abs_path.is_none() && rel_path.is_none() {
        return Ok(*ModuleResolveResult::unresolvable());
    }

    let abs_matches = if let Some(abs_path) = &abs_path {
        Some(
            turbo_tasks::read!(read_matches(
                turbo_tasks::read!(context_dir.root().owned())?,
                rcstr!("/ROOT/"),
                true,
                Pattern::new(abs_path.or_any_nested_file()),
            ))
            ?,
        )
    } else {
        None
    };
    let rel_matches = if let Some(rel_path) = &rel_path {
        Some(
            turbo_tasks::read!(read_matches(
                context_dir,
                rcstr!(""),
                true,
                Pattern::new(rel_path.or_any_nested_file()),
            ))
            ?,
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
                let realpath = turbo_tasks::read!(file.realpath_with_links())?;
                for symlink in &realpath.symlinks {
                    affecting_sources.push(ResolvedVc::upcast(
                        turbo_tasks::read!(FileSource::new(symlink.clone()).to_resolved())?,
                    ));
                }
                let path: FileSystemPath = match &realpath.path_result {
                    Ok(path) => path.clone(),
                    Err(e) => bail!(turbo_tasks::read!(e.as_error_message(file, &realpath))?),
                };
                results.push((
                    RequestKey::new(matched_path.clone()),
                    ResolvedVc::upcast(
                        turbo_tasks::read!(RawModule::new(Vc::upcast(FileSource::new(path.clone())))
                            .to_resolved())
                            ?,
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
}

turbo_tasks::dual_fn! {
/// The uninstrumented body of [`DirAssetReference::resolve_reference`] (split out so
/// both modes can wrap it in the tracing span).
fn resolve_dir_asset_reference(
    context_dir: FileSystemPath,
    path: ResolvedVc<Pattern>,
    issue_source: IssueSource,
) -> Result<Vc<ModuleResolveResult>> {
    let result = turbo_tasks::read!(resolve_reference_from_dir(context_dir.clone(), *path))?;
    turbo_tasks::read!(check_and_emit_too_many_matches_warning(
        result,
        issue_source,
        context_dir,
        path,
    ))
    ?;
    Ok(result)
}
}

#[turbo_tasks::value_impl]
impl ModuleReference for DirAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        let span = tracing::info_span!(
            "trace directory",
            pattern = display(turbo_tasks::read!(self.path.to_string())?)
        );
        #[cfg(not(feature = "sync"))]
        let result =
            resolve_dir_asset_reference(self.context_dir.clone(), self.path, self.issue_source)
                .instrument(span)
                .await;
        #[cfg(feature = "sync")]
        let result = {
            let _enter = span.entered();
            resolve_dir_asset_reference(self.context_dir.clone(), self.path, self.issue_source)
        };
        result
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
