use turbo_rcstr::rcstr;
use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;

use super::options::{
    ConditionValue, ResolutionConditions, ResolveInPackage, ResolveIntoPackage, ResolveModules,
    ResolveOptions,
};

/// Where Node.js looks for the packages of a module request: in the `node_modules` directories,
/// unless it runs with a [package map](https://nodejs.org/api/packages.html#package-maps).
fn node_resolve_modules(package_map: Option<FileSystemPath>) -> Vec<ResolveModules> {
    vec![match package_map {
        Some(package_map) => ResolveModules::PackageMap(package_map),
        None => ResolveModules::Nested(vec![rcstr!("node_modules")]),
    }]
}

/// The options to resolve a request like `require()` of Node.js does.
///
/// `package_map` is the path of the package map Node.js runs with, if any.
#[turbo_tasks::function]
pub fn node_cjs_resolve_options(package_map: Option<FileSystemPath>) -> Vc<ResolveOptions> {
    let conditions: ResolutionConditions = [
        (rcstr!("node"), ConditionValue::Set),
        (rcstr!("require"), ConditionValue::Set),
    ]
    .into();
    let extensions = vec![rcstr!(".js"), rcstr!(".json"), rcstr!(".node")];
    ResolveOptions {
        extensions,
        modules: node_resolve_modules(package_map),
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

/// The options to resolve a request like `import` of Node.js does.
///
/// `package_map` is the path of the package map Node.js runs with, if any.
#[turbo_tasks::function]
pub fn node_esm_resolve_options(package_map: Option<FileSystemPath>) -> Vc<ResolveOptions> {
    let conditions: ResolutionConditions = [
        (rcstr!("node"), ConditionValue::Set),
        (rcstr!("import"), ConditionValue::Set),
    ]
    .into();
    let extensions = vec![rcstr!(".js"), rcstr!(".json"), rcstr!(".node")];
    ResolveOptions {
        fully_specified: true,
        extensions,
        modules: node_resolve_modules(package_map),
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
