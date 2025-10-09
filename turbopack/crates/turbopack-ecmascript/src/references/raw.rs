use anyhow::Result;
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    chunk::{ChunkableModuleReference, ChunkingType, ChunkingTypeOption},
    issue::{
        Issue, IssueExt, IssueSeverity, IssueSource, IssueStage, OptionIssueSource,
        OptionStyledString, StyledString,
    },
    reference::ModuleReference,
    resolve::{ModuleResolveResult, pattern::Pattern, resolve_raw},
};

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
            let num_matches = result.await?.primary.len();
            if num_matches > TOO_MANY_MATCHES_LIMIT {
                TooManyMatchesWarning {
                    source: self.issue_source,
                    context_dir: self.context_dir.clone(),
                    num_matches,
                    pattern: self.path,
                }
                .resolved_cell()
                .emit();
            }

            Ok(result)
        }
        .instrument(span)
        .await
    }
}
/// If a pattern resolves to more than 10000 results, it's likely a mistake so issue a warning.
const TOO_MANY_MATCHES_LIMIT: usize = 10000;
#[turbo_tasks::value(shared)]
struct TooManyMatchesWarning {
    source: IssueSource,
    context_dir: FileSystemPath,
    num_matches: usize,
    pattern: ResolvedVc<Pattern>,
}

#[turbo_tasks::value_impl]
impl Issue for TooManyMatchesWarning {
    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<StyledString>> {
        Ok(StyledString::Text(
            format!(
                "The file pattern {pattern} matches {num_matches} files in {context_dir}",
                pattern = self.pattern.to_string().await?,
                context_dir = self.context_dir.value_to_string().await?,
                num_matches = self.num_matches
            )
            .into(),
        )
        .cell())
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(
            StyledString::Text(rcstr!(
                "Overly broad patterns can lead to build performance issues and over bundling."
            ))
            .resolved_cell(),
        ))
    }

    #[turbo_tasks::function]
    async fn file_path(&self) -> Vc<FileSystemPath> {
        self.source.file_path()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Resolve.cell()
    }

    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionIssueSource> {
        Vc::cell(Some(self.source))
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
