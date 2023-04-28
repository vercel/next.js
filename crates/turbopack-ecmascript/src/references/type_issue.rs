use turbo_tasks::primitives::StringVc;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::issue::{Issue, IssueSeverity, IssueSeverityVc, IssueVc};

use crate::SpecifiedModuleType;

#[turbo_tasks::value(shared)]
pub struct SpecifiedModuleTypeIssue {
    pub path: FileSystemPathVc,
    pub specified_type: SpecifiedModuleType,
}

#[turbo_tasks::value_impl]
impl Issue for SpecifiedModuleTypeIssue {
    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.path
    }

    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        match self.specified_type {
            SpecifiedModuleType::CommonJs => StringVc::cell(
                "Specified module format (CommonJs) is not matching the module format of the \
                 source code (EcmaScript Modules)"
                    .to_string(),
            ),
            SpecifiedModuleType::EcmaScript => StringVc::cell(
                "Specified module format (EcmaScript Modules) is not matching the module format \
                 of the source code (CommonJs)"
                    .to_string(),
            ),
            SpecifiedModuleType::Automatic => StringVc::cell(
                "Specified module format is not matching the module format of the source code"
                    .to_string(),
            ),
        }
    }

    #[turbo_tasks::function]
    fn description(&self) -> StringVc {
        match self.specified_type {
            SpecifiedModuleType::CommonJs => StringVc::cell(
                "The CommonJs module format was specified in the package.json that is affecting \
                 this source file or by using an special extension, but Ecmascript import/export \
                 syntax is used in the source code.\nThe module was automatically converted to an \
                 EcmaScript module, but that is in conflict with the specified module format. \
                 Either change the \"type\" field in the package.json or replace EcmaScript \
                 import/export syntax with CommonJs syntas in the source file.\nIn some cases \
                 EcmaScript import/export syntax is added by an transform and isn't actually part \
                 of the source code. In these cases revisit transformation options to inject the \
                 correct syntax."
                    .to_string(),
            ),
            SpecifiedModuleType::EcmaScript => StringVc::cell(
                "The EcmaScript module format was specified in the package.json that is affecting \
                 this source file or by using an special extension, but it looks like that \
                 CommonJs syntax is used in the source code.\nExports made by CommonJs syntax \
                 will lead to a runtime error, since the module is in EcmaScript mode. Either \
                 change the \"type\" field in the package.json or replace CommonJs syntax with \
                 EcmaScript import/export syntax in the source file."
                    .to_string(),
            ),
            SpecifiedModuleType::Automatic => StringVc::cell(
                "The module format specified in the package.json file is not matching the module \
                 format of the source code."
                    .to_string(),
            ),
        }
    }

    #[turbo_tasks::function]
    fn severity(&self) -> IssueSeverityVc {
        match self.specified_type {
            SpecifiedModuleType::CommonJs => IssueSeverity::Error.cell(),
            SpecifiedModuleType::EcmaScript => IssueSeverity::Warning.cell(),
            SpecifiedModuleType::Automatic => IssueSeverity::Hint.cell(),
        }
    }

    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("module type".to_string())
    }
}
