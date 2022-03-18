use std::collections::BTreeMap;

use anyhow::Result;
use turbo_tasks::trace::TraceSlotRefs;
use turbo_tasks_fs::FileSystemPathRef;

use super::prefix_tree::{PrefixTree, WildcardReplacable};

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

#[derive(TraceSlotRefs, Hash, PartialEq, Eq, Clone, Debug)]
pub enum ImportMapping {
    External(Option<String>),
    Alias(String),
}

impl WildcardReplacable for ImportMapping {
    fn replace_wildcard(&self, value: &str) -> Result<Self> {
        match self {
            ImportMapping::External(name) => {
                if let Some(name) = name {
                    Ok(ImportMapping::External(Some(
                        name.clone().replace("*", value),
                    )))
                } else {
                    Ok(ImportMapping::External(None))
                }
            }
            ImportMapping::Alias(name) => {
                Ok(ImportMapping::Alias(name.clone().replace("*", value)))
            }
        }
    }

    fn append_to_folder(&self, value: &str) -> Result<Self> {
        fn add(name: &str, value: &str) -> String {
            if !name.ends_with("/") {
                format!("{name}{value}")
            } else {
                name.to_string()
            }
        }
        match self {
            ImportMapping::External(name) => {
                if let Some(name) = name {
                    Ok(ImportMapping::External(Some(add(name, value))))
                } else {
                    Ok(ImportMapping::External(None))
                }
            }
            ImportMapping::Alias(name) => Ok(ImportMapping::Alias(add(name, value))),
        }
    }
}

#[turbo_tasks::value(shared)]
#[derive(PartialEq, Eq, Clone, Debug, Default)]
pub struct ResolveOptions {
    pub extensions: Vec<String>,
    pub modules: Vec<ResolveModules>,
    pub into_package: Vec<ResolveIntoPackage>,
    pub import_map: PrefixTree<ImportMapping>,
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
