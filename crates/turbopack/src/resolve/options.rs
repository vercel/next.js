use std::collections::BTreeMap;

use anyhow::Result;
use turbo_tasks::trace::TraceSlotRefs;
use turbo_tasks_fs::FileSystemPathRef;

#[turbo_tasks::value(shared)]
#[derive(Hash, PartialEq, Eq, Debug)]
pub struct LockedVersions {}

#[derive(TraceSlotRefs, Hash, PartialEq, Eq, Clone, Debug)]
pub enum ResolveModules {
    /// when inside of path, use the list of directories to
    /// resolve inside these
    Nested(FileSystemPathRef, Vec<String>),
    /// look into that directory
    Path(FileSystemPathRef),
    /// lookup versions based on lockfile in the registry filesystem
    /// registry filesystem is assumed to have structure like
    /// @scope/module/version/<path-in-package>
    Registry(FileSystemPathRef, LockedVersionsRef),
}

#[derive(TraceSlotRefs, Hash, PartialEq, Eq, Clone, Debug)]
pub enum ConditionValue {
    Set,
    Unset,
    Unknown,
}

impl From<bool> for ConditionValue {
    fn from(v: bool) -> Self {
        if v {
            ConditionValue::Set
        } else {
            ConditionValue::Unset
        }
    }
}

#[derive(TraceSlotRefs, Hash, PartialEq, Eq, Clone, Debug)]
pub enum ResolveIntoPackage {
    ExportsField {
        field: String,
        conditions: BTreeMap<String, ConditionValue>,
        unspecified_conditions: ConditionValue,
    },
    MainField(String),
    Default(String),
}

#[turbo_tasks::value(shared)]
#[derive(Hash, PartialEq, Eq, Clone, Debug)]
pub struct ResolveOptions {
    pub extensions: Vec<String>,
    pub modules: Vec<ResolveModules>,
    pub into_package: Vec<ResolveIntoPackage>,
}

#[turbo_tasks::value_impl]
impl ResolveOptionsRef {
    pub async fn modules(self) -> Result<ResolveModulesOptionsRef> {
        Ok(ResolveModulesOptions {
            modules: self.await?.modules.clone(),
        }
        .into())
    }
}

#[turbo_tasks::value(shared)]
#[derive(Hash, PartialEq, Eq, Clone, Debug)]
pub struct ResolveModulesOptions {
    pub modules: Vec<ResolveModules>,
}

#[turbo_tasks::function]
pub async fn resolve_modules_options(
    options: ResolveOptionsRef,
) -> Result<ResolveModulesOptionsRef> {
    Ok(ResolveModulesOptions {
        modules: options.await?.modules.clone(),
    }
    .into())
}
