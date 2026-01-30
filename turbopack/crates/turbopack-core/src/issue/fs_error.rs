use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::Vc;
use turbo_tasks_fs::{FileSystemPath, error::FsError};

use crate::issue::{Issue, IssueStage, OptionStyledString, StyledString};

#[turbo_tasks::value_impl]
impl Issue for FsError {
    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.path.clone().cell()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::WriteOutput.cell()
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text(rcstr!("File system operation failed")).cell()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        let mut stack = vec![
            StyledString::Line(vec![
                StyledString::Text(rcstr!("Failed to ")),
                StyledString::Text(RcStr::from(self.operation.to_string())),
                StyledString::Text(rcstr!(":")),
            ]),
            StyledString::Text(RcStr::from(self.source.to_string())),
        ];
        if let Some(hint) = self.hint() {
            stack.extend([
                StyledString::Line(Vec::new()), // empty line
                StyledString::Text(RcStr::from(hint)),
            ]);
        }
        Vc::cell(Some(StyledString::Stack(stack).resolved_cell()))
    }
}
