use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;

use super::options::{
    ConditionValue, ResolutionConditions, ResolveInPackage, ResolveIntoPackage, ResolveModules,
    ResolveOptions,
};

#[turbo_tasks::function]
pub fn node_cjs_resolve_options(root: Vc<FileSystemPath>) -> Vc<ResolveOptions> {
    let conditions: ResolutionConditions = [
        ("node".to_string(), ConditionValue::Set),
        ("require".to_string(), ConditionValue::Set),
    ]
    .into();
    ResolveOptions {
        extensions: vec![".js".to_string(), ".json".to_string(), ".node".to_string()],
        modules: vec![ResolveModules::Nested(
            root,
            vec!["node_modules".to_string()],
        )],
        into_package: vec![
            ResolveIntoPackage::ExportsField {
                conditions: conditions.clone(),
                unspecified_conditions: ConditionValue::Unset,
            },
            ResolveIntoPackage::MainField("main".to_string()),
            ResolveIntoPackage::Default("index".to_string()),
        ],
        in_package: vec![ResolveInPackage::ImportsField {
            conditions,
            unspecified_conditions: ConditionValue::Unset,
        }],
        ..Default::default()
    }
    .cell()
}
