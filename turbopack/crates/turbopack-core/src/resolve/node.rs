use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;

use super::options::{
    ConditionValue, ResolutionConditions, ResolveInPackage, ResolveIntoPackage, ResolveModules,
    ResolveOptions,
};

#[turbo_tasks::function]
pub fn node_cjs_resolve_options(root: ResolvedVc<FileSystemPath>) -> Vc<ResolveOptions> {
    let conditions: ResolutionConditions = [
        ("node".into(), ConditionValue::Set),
        ("require".into(), ConditionValue::Set),
    ]
    .into();
    let extensions = vec![".js".into(), ".json".into(), ".node".into()];
    ResolveOptions {
        extensions,
        modules: vec![ResolveModules::Nested(root, vec!["node_modules".into()])],
        into_package: vec![
            ResolveIntoPackage::ExportsField {
                conditions: conditions.clone(),
                unspecified_conditions: ConditionValue::Unset,
            },
            ResolveIntoPackage::MainField {
                field: "main".into(),
            },
        ],
        in_package: vec![ResolveInPackage::ImportsField {
            conditions,
            unspecified_conditions: ConditionValue::Unset,
        }],
        default_files: vec!["index".into()],
        ..Default::default()
    }
    .cell()
}

#[turbo_tasks::function]
pub fn node_esm_resolve_options(root: ResolvedVc<FileSystemPath>) -> Vc<ResolveOptions> {
    let conditions: ResolutionConditions = [
        ("node".into(), ConditionValue::Set),
        ("import".into(), ConditionValue::Set),
    ]
    .into();
    let extensions = vec![".js".into(), ".json".into(), ".node".into()];
    ResolveOptions {
        fully_specified: true,
        extensions,
        modules: vec![ResolveModules::Nested(root, vec!["node_modules".into()])],
        into_package: vec![
            ResolveIntoPackage::ExportsField {
                conditions: conditions.clone(),
                unspecified_conditions: ConditionValue::Unset,
            },
            ResolveIntoPackage::MainField {
                field: "main".into(),
            },
        ],
        in_package: vec![ResolveInPackage::ImportsField {
            conditions,
            unspecified_conditions: ConditionValue::Unset,
        }],
        default_files: vec!["index".into()],
        ..Default::default()
    }
    .cell()
}
