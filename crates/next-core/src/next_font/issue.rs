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

/// Emitted when the compile-time Google Fonts fetch fails. Error on `next build`, warning in
/// `next dev` (which renders a fallback font).
#[turbo_tasks::value(shared)]
pub(crate) struct GoogleFontsFetchIssue {
    pub(crate) path: FileSystemPath,
    pub(crate) font_family: RcStr,
    pub(crate) is_dev: bool,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for GoogleFontsFetchIssue {
    fn stage(&self) -> IssueStage {
        IssueStage::Resolve
    }

    fn severity(&self) -> IssueSeverity {
        if self.is_dev {
            IssueSeverity::Warning
        } else {
            IssueSeverity::Error
        }
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.path.clone())
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Line(vec![
            StyledString::Code(rcstr!("next/font:")),
            StyledString::Text(if self.is_dev {
                rcstr!(" warning:")
            } else {
                rcstr!(" error:")
            }),
        ]))
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        let summary = if self.is_dev {
            StyledString::Line(vec![
                StyledString::Text(rcstr!("Failed to download ")),
                StyledString::Code(self.font_family.clone()),
                StyledString::Text(rcstr!(" from Google Fonts. Using a fallback font instead.")),
            ])
        } else {
            StyledString::Line(vec![
                StyledString::Text(rcstr!("Failed to fetch ")),
                StyledString::Code(self.font_family.clone()),
                StyledString::Text(rcstr!(" from Google Fonts.")),
            ])
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
