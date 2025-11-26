use turbo_rcstr::rcstr;
use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;

use super::options::{
    ConditionValue, ResolutionConditions, ResolveInPackage, ResolveIntoPackage, ResolveModules,
    ResolveOptions,
};

#[turbo_tasks::function]
pub fn node_cjs_resolve_options(root: FileSystemPath) -> Vc<ResolveOptions> {
    let conditions: ResolutionConditions = [
        (rcstr!("node"), ConditionValue::Set),
        (rcstr!("require"), ConditionValue::Set),
    ]
    .into();
    let extensions = vec![rcstr!(".js"), rcstr!(".json"), rcstr!(".node")];
    ResolveOptions {
        extensions,
        modules: vec![ResolveModules::Nested(root, vec![rcstr!("node_modules")])],
        into_package: vec![
            ResolveIntoPackage::ExportsField {
                conditions: conditions.clone(),
                unspecified_conditions: ConditionValue::Unset,
            },
            ResolveIntoPackage::MainField {
                field: rcstr!("main"),
            },
        ],
        in_package: vec![ResolveInPackage::ImportsField {
            conditions,
            unspecified_conditions: ConditionValue::Unset,
        }],
        default_files: vec![rcstr!("index")],
        ..Default::default()
    }
    .cell()
}

#[turbo_tasks::function]
pub fn node_esm_resolve_options(root: FileSystemPath) -> Vc<ResolveOptions> {
    let conditions: ResolutionConditions = [
        (rcstr!("node"), ConditionValue::Set),
        (rcstr!("import"), ConditionValue::Set),
    ]
    .into();
    let extensions = vec![rcstr!(".js"), rcstr!(".json"), rcstr!(".node")];
    ResolveOptions {
        fully_specified: true,
        extensions,
        modules: vec![ResolveModules::Nested(root, vec![rcstr!("node_modules")])],
        into_package: vec![
            ResolveIntoPackage::ExportsField {
                conditions: conditions.clone(),
                unspecified_conditions: ConditionValue::Unset,
            },
            ResolveIntoPackage::MainField {
                field: rcstr!("main"),
            },
        ],
        in_package: vec![ResolveInPackage::ImportsField {
            conditions,
            unspecified_conditions: ConditionValue::Unset,
        }],
        default_files: vec![rcstr!("index")],
        ..Default::default()
    }
    .cell()
}
