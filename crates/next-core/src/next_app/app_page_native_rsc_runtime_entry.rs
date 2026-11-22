use anyhow::{Context, Result};
use async_trait::async_trait;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    file_source::FileSource,
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, StyledString},
};

use crate::{
    app_structure::AppPageLoaderTree,
    next_app::{AppPage, AppPath},
    next_config::NextConfig,
    segment_config::{ParseSegmentMode, parse_segment_config_from_source},
};

/// Reports a page that opts into the native RSC runtime (`experimental_nativeRscRuntime =
/// true`). The native RSC runtime has no entry yet, so such a page is always an error,
/// never a fallback to App Router.
pub async fn report_app_page_native_rsc_runtime(
    loader_tree: Vc<AppPageLoaderTree>,
    page: AppPage,
    next_config: Vc<NextConfig>,
) -> Result<()> {
    let tree = loader_tree.await?;
    let page_path = find_page(&tree)
        .or_else(|| tree.modules.layout.clone())
        .context("the loader tree of an app page must have a page or a root layout")?;
    let reason = if *next_config.enable_native_rsc_runtime().await? {
        rcstr!("The native RSC runtime isn't implemented yet.")
    } else {
        rcstr!("It requires `experimental.nativeRscRuntime`.")
    };
    NativeRscRuntimeUnsupportedIssue {
        file_path: page_path,
        page,
        reason,
    }
    .resolved_cell()
    .emit();
    Ok(())
}

/// Reports a `not-found` or `global-not-found` file that sets `experimental_nativeRscRuntime`
/// itself, for the built-in `/_not-found` page. Built-in pages don't inherit the export from the
/// root layout, so only the files that make up the page count: its leaf, and a
/// `global-not-found` file, which takes the root layout's place.
pub async fn report_app_builtin_page_native_rsc_runtime(
    loader_tree: Vc<AppPageLoaderTree>,
    page: AppPage,
) -> Result<()> {
    let tree = loader_tree.await?;
    let global_not_found = tree
        .modules
        .layout
        .clone()
        .filter(|layout| layout.file_stem() == Some("global-not-found"));
    for path in find_page(&tree).into_iter().chain(global_not_found) {
        let config = parse_segment_config_from_source(
            Vc::upcast(FileSource::new(path.clone())),
            ParseSegmentMode::App,
        )
        .await?;
        if config.native_rsc_runtime != Some(true) {
            continue;
        }
        let name = path.file_stem().unwrap_or_default();
        NativeRscRuntimeUnsupportedIssue {
            page: page.clone(),
            reason: format!("`{name}` files aren't supported yet.").into(),
            file_path: path,
        }
        .resolved_cell()
        .emit();
    }
    Ok(())
}

/// The page of a loader tree: the one `children` leads to, or else the first one in another slot,
/// for a route whose page is only in a parallel route slot.
pub(crate) fn find_page(tree: &AppPageLoaderTree) -> Option<FileSystemPath> {
    if let Some(page) = &tree.modules.page {
        return Some(page.clone());
    }
    let children = tree.parallel_routes.get("children");
    children
        .into_iter()
        .chain(
            tree.parallel_routes
                .iter()
                .filter(|(slot, _)| *slot != "children")
                .map(|(_, tree)| tree),
        )
        .find_map(|tree| find_page(tree))
}

/// A page on the native RSC runtime uses something the native RSC runtime doesn't
/// support yet.
#[turbo_tasks::value(shared)]
pub(crate) struct NativeRscRuntimeUnsupportedIssue {
    pub file_path: FileSystemPath,
    pub page: AppPage,
    pub reason: RcStr,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for NativeRscRuntimeUnsupportedIssue {
    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.file_path.clone())
    }

    fn stage(&self) -> IssueStage {
        IssueStage::AppStructure
    }

    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(
            format!(
                "\"{}\" can't use the native RSC runtime",
                AppPath::from(self.page.clone())
            )
            .into(),
        ))
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Text(self.reason.clone())))
    }
}
