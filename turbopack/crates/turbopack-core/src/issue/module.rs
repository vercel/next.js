use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;

use super::{Issue, IssueStage, OptionStyledString, StyledString};
use crate::{
    ident::AssetIdent,
    issue::{IssueExt, IssueSource, OptionIssueSource},
    source::Source,
};

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

#[turbo_tasks::value_impl]
impl Issue for ModuleIssue {
    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::ProcessModule.cell()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.ident.path()
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        *self.title
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(self.description))
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionIssueSource> {
        Vc::cell(self.source)
    }
}

#[turbo_tasks::function]
pub async fn emit_unknown_module_type_error(source: Vc<Box<dyn Source>>) -> Result<()> {
    ModuleIssue {
        ident: source.ident().to_resolved().await?,
        title: StyledString::Text(rcstr!("Unknown module type")).resolved_cell(),
        description: StyledString::Text(
            r"This module doesn't have an associated type. Use a known file extension, or register a loader for it.

Read more: https://nextjs.org/docs/app/api-reference/next-config-js/turbo#webpack-loaders".into(),
        )
        .resolved_cell(),
        source: Some(IssueSource::from_source_only(source.to_resolved().await?)),
    }
    .resolved_cell()
    .emit();

    Ok(())
}
