use turbo_tasks_fs::FileSystemPathVc;

use super::options::{
    ConditionValue, ResolveIntoPackage, ResolveModules, ResolveOptions, ResolveOptionsVc,
};

#[turbo_tasks::function]
pub fn node_cjs_resolve_options(root: FileSystemPathVc) -> ResolveOptionsVc {
    ResolveOptions {
        extensions: vec![".js".to_string(), ".json".to_string(), ".node".to_string()],
        modules: vec![ResolveModules::Nested(
            root,
            vec!["node_modules".to_string()],
        )],
        into_package: vec![
            ResolveIntoPackage::ExportsField {
                field: "exports".to_string(),
                conditions: [
                    ("node".to_string(), ConditionValue::Set),
                    ("require".to_string(), ConditionValue::Set),
                ]
                .into(),
                unspecified_conditions: ConditionValue::Unset,
            },
            ResolveIntoPackage::MainField("main".to_string()),
            ResolveIntoPackage::Default("index".to_string()),
        ],
        ..Default::default()
    }
    .cell()
}
