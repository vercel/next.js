use anyhow::Result;
use async_trait::async_trait;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;

use super::{Issue, IssueSource, IssueStage, StyledString};
use crate::{ident::AssetIdent, issue::IssueExt, source::Source};

#[turbo_tasks::value]
pub struct ModuleIssue {
    pub ident: ResolvedVc<AssetIdent>,
    pub title: ResolvedVc<StyledString>,
    pub description: ResolvedVc<StyledString>,
    // TODO(PACK-4879): make this mandatory and drop `ident`
    pub source: Option<IssueSource>,
}
#[turbo_tasks::value_impl]
impl ModuleIssue {
    #[turbo_tasks::function]
    pub fn new(
        ident: ResolvedVc<AssetIdent>,
        title: RcStr,
        description: RcStr,
        source: Option<IssueSource>,
    ) -> Vc<Self> {
        ModuleIssue {
            ident,
            title: StyledString::Text(title).resolved_cell(),
            description: StyledString::Text(description).resolved_cell(),
            source,
        }
        .cell()
    }
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for ModuleIssue {
    fn stage(&self) -> IssueStage {
        IssueStage::ProcessModule
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.ident.await?.path.clone())
    }

    async fn title(&self) -> Result<StyledString> {
        Ok((*self.title.await?).clone())
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some((*self.description.await?).clone()))
    }

    fn source(&self) -> Option<IssueSource> {
        self.source
    }
}

const UNKNOWN_MODULE_TYPE_HINT: &str = "Use a known file extension, or register a loader for it.

Read more: https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#configuring-webpack-loaders";

/// Report a file that could not be turned into a module because no module type
/// applies to it.
///
/// The file has no module in the module graph, so no import trace can be
/// computed for this issue. When the location of the import that pulled the file
/// in is known, the issue is reported there instead.
#[turbo_tasks::function]
pub async fn emit_unknown_module_type_error(
    source: Vc<Box<dyn Source>>,
    import: Option<IssueSource>,
) -> Result<()> {
    if let Some(import) = import {
        UnknownModuleTypeIssue {
            file: source.ident().to_resolved().await?,
            import,
        }
        .resolved_cell()
        .emit();
    } else {
        ModuleIssue {
            ident: source.ident().to_resolved().await?,
            title: StyledString::Text(rcstr!("Unknown module type")).resolved_cell(),
            description: StyledString::Text(
                format!("This module doesn't have an associated type. {UNKNOWN_MODULE_TYPE_HINT}")
                    .into(),
            )
            .resolved_cell(),
            source: Some(IssueSource::from_source_only(source.to_resolved().await?)),
        }
        .resolved_cell()
        .emit();
    }

    Ok(())
}

/// A file that no module type applies to, reported at the import that pulled it in.
#[turbo_tasks::value]
struct UnknownModuleTypeIssue {
    file: ResolvedVc<AssetIdent>,
    import: IssueSource,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for UnknownModuleTypeIssue {
    fn stage(&self) -> IssueStage {
        IssueStage::ProcessModule
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        self.import.file_path().await
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(rcstr!("Unknown module type")))
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Text(
            format!(
                "{} doesn't have an associated module type. {UNKNOWN_MODULE_TYPE_HINT}",
                self.file.await?.path.path
            )
            .into(),
        )))
    }

    fn source(&self) -> Option<IssueSource> {
        Some(self.import)
    }
}
