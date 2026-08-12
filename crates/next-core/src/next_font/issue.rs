use anyhow::Result;
use async_trait::async_trait;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::ResolvedVc;
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::issue::{Issue, IssueSeverity, IssueStage, StyledString};

#[turbo_tasks::value(shared)]
pub(crate) struct NextFontIssue {
    pub(crate) path: FileSystemPath,
    pub(crate) title: ResolvedVc<StyledString>,
    pub(crate) description: ResolvedVc<StyledString>,
    pub(crate) severity: IssueSeverity,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for NextFontIssue {
    fn stage(&self) -> IssueStage {
        IssueStage::Resolve
    }

    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.path.clone())
    }

    async fn title(&self) -> Result<StyledString> {
        self.title.owned().await
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(self.description.owned().await?))
    }
}

/// Which outcome produced a [`GoogleFontsFetchIssue`].
#[derive(Copy, Clone)]
#[turbo_tasks::value(shared)]
pub(crate) enum GoogleFontsFetchIssueKind {
    /// The fetch failed in `next dev`. Warning; a fallback font is rendered.
    DevFailure,
    /// The fetch failed in `next build`. Error; the build fails.
    BuildFailure,
    /// The caller-supplied soft deadline elapsed in `next dev` before the fetch finished. Info;
    /// a fallback font is rendered *for now* while the request completes in the background. The
    /// compilation re-runs once the request settles, replacing this with the real styles (or a
    /// [`GoogleFontsFetchIssueKind::DevFailure`] warning if it truly failed).
    SoftPending,
}

/// Emitted for the compile-time Google Fonts fetch outcome. See [`GoogleFontsFetchIssueKind`].
#[turbo_tasks::value(shared)]
pub(crate) struct GoogleFontsFetchIssue {
    pub(crate) path: FileSystemPath,
    pub(crate) font_family: RcStr,
    pub(crate) kind: GoogleFontsFetchIssueKind,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for GoogleFontsFetchIssue {
    fn stage(&self) -> IssueStage {
        IssueStage::Resolve
    }

    fn severity(&self) -> IssueSeverity {
        match self.kind {
            GoogleFontsFetchIssueKind::DevFailure => IssueSeverity::Warning,
            GoogleFontsFetchIssueKind::BuildFailure => IssueSeverity::Error,
            GoogleFontsFetchIssueKind::SoftPending => IssueSeverity::Info,
        }
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.path.clone())
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Line(vec![
            StyledString::Code(rcstr!("next/font:")),
            StyledString::Text(match self.kind {
                GoogleFontsFetchIssueKind::DevFailure => rcstr!(" warning:"),
                GoogleFontsFetchIssueKind::BuildFailure => rcstr!(" error:"),
                GoogleFontsFetchIssueKind::SoftPending => rcstr!(" info:"),
            }),
        ]))
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        let summary = match self.kind {
            GoogleFontsFetchIssueKind::DevFailure => StyledString::Line(vec![
                StyledString::Text(rcstr!("Failed to download ")),
                StyledString::Code(self.font_family.clone()),
                StyledString::Text(rcstr!(" from Google Fonts. Using a fallback font instead.")),
            ]),
            GoogleFontsFetchIssueKind::BuildFailure => StyledString::Line(vec![
                StyledString::Text(rcstr!("Failed to fetch ")),
                StyledString::Code(self.font_family.clone()),
                StyledString::Text(rcstr!(" from Google Fonts.")),
            ]),
            GoogleFontsFetchIssueKind::SoftPending => {
                // Not a failure: the request is still running and will replace the fallback once
                // it lands, so this omits the offline/proxy guidance below.
                return Ok(Some(StyledString::Line(vec![
                    StyledString::Text(rcstr!("Downloading ")),
                    StyledString::Code(self.font_family.clone()),
                    StyledString::Text(rcstr!(
                        " from Google Fonts is taking a while. Using a fallback font while it \
                         loads; the real font will appear once the download completes."
                    )),
                ])));
            }
        };
        let guidance = StyledString::Line(vec![
            StyledString::Text(rcstr!(
                "If you are offline or behind a proxy, self-host the font with "
            )),
            StyledString::Code(rcstr!("next/font/local")),
            StyledString::Text(rcstr!(", or set ")),
            StyledString::Code(rcstr!("HTTP_PROXY")),
            StyledString::Text(rcstr!("/")),
            StyledString::Code(rcstr!("HTTPS_PROXY")),
            StyledString::Text(rcstr!(" so Next.js can reach ")),
            StyledString::Code(rcstr!("fonts.googleapis.com")),
            StyledString::Text(rcstr!(".")),
        ]);
        Ok(Some(StyledString::Stack(vec![summary, guidance])))
    }
}
