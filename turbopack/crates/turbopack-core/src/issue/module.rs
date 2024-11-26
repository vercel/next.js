use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;

use super::{Issue, IssueStage, OptionStyledString, StyledString};
use crate::{ident::AssetIdent, issue::IssueExt, source::Source};

#[turbo_tasks::value(shared)]
pub struct ModuleIssue {
    pub ident: Vc<AssetIdent>,
    pub title: Vc<StyledString>,
    pub description: Vc<StyledString>,
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
        self.title
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(self.description))
    }
}

#[turbo_tasks::function]
pub fn emit_unknown_module_type_error(source: Vc<Box<dyn Source>>) {
    ModuleIssue {
        ident: source.ident(),
        title: StyledString::Text("Unknown module type".into()).cell(),
        description: StyledString::Text(
            r"This module doesn't have an associated type. Use a known file extension, or register a loader for it.

Read more: https://nextjs.org/docs/app/api-reference/next-config-js/turbo#webpack-loaders".into(),
        )
        .cell(),
    }
    .cell()
    .emit();
}
