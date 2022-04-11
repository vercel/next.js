use std::collections::BTreeMap;

use anyhow::Result;
use turbo_tasks::{trace::TraceSlotVcs, Value, Vc};
use turbo_tasks_fs::{glob::Glob, FileSystemPathVc};

use crate::resolve::parse::RequestVc;

use super::{
    prefix_tree::{PrefixTree, WildcardReplacable},
    ResolveResult, ResolveResultVc, SpecialType,
};

#[turbo_tasks::value(shared)]
#[derive(Hash, PartialEq, Eq, Debug)]
pub struct LockedVersions {}

#[derive(TraceSlotVcs, Hash, PartialEq, Eq, Clone, Debug)]
pub enum ResolveModules {
    /// when inside of path, use the list of directories to
    /// resolve inside these
    Nested(FileSystemPathVc, Vec<String>),
    /// look into that directory
    Path(FileSystemPathVc),
    /// lookup versions based on lockfile in the registry filesystem
    /// registry filesystem is assumed to have structure like
    /// @scope/module/version/<path-in-package>
    Registry(FileSystemPathVc, LockedVersionsVc),
}

#[derive(TraceSlotVcs, Hash, PartialEq, Eq, Clone, Debug)]
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

#[derive(TraceSlotVcs, Hash, PartialEq, Eq, Clone, Debug)]
pub enum ResolveIntoPackage {
    ExportsField {
        field: String,
        conditions: BTreeMap<String, ConditionValue>,
        unspecified_conditions: ConditionValue,
    },
    MainField(String),
    Default(String),
}

#[derive(TraceSlotVcs, Hash, PartialEq, Eq, Clone, Debug)]
pub enum ImportMapping {
    External(Option<String>),
    Alias(String),
    Ignore,
    Empty,
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
            ImportMapping::Ignore | ImportMapping::Empty => Ok(self.clone()),
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
            ImportMapping::Ignore | ImportMapping::Empty => Ok(self.clone()),
        }
    }
}

#[turbo_tasks::value(shared)]
#[derive(PartialEq, Eq, Clone, Debug, Default)]
pub struct ImportMap {
    pub direct: PrefixTree<ImportMapping>,
    pub by_glob: Vec<(Glob, ImportMapping)>,
}

#[turbo_tasks::value(shared)]
#[derive(PartialEq, Eq, Clone, Debug, Default)]
pub struct ResolvedMap {
    pub by_glob: Vec<(FileSystemPathVc, Glob, ImportMapping)>,
}

#[turbo_tasks::value(shared)]
#[derive(PartialEq, Eq, Clone, Debug)]
pub enum ImportMapResult {
    Result(ResolveResultVc),
    Alias(RequestVc),
    NoEntry,
}

fn import_mapping_to_result(mapping: &ImportMapping) -> ImportMapResultVc {
    match mapping {
        ImportMapping::External(name) => ImportMapResult::Result(
            ResolveResult::Special(
                name.as_ref().map_or_else(
                    || SpecialType::OriginalReferenceExternal,
                    |req| SpecialType::OriginalRefernceTypeExternal(req.to_string()),
                ),
                Vec::new(),
            )
            .into(),
        )
        .into(),
        ImportMapping::Ignore => {
            ImportMapResult::Result(ResolveResult::Special(SpecialType::Ignore, Vec::new()).into())
                .into()
        }
        ImportMapping::Empty => {
            ImportMapResult::Result(ResolveResult::Special(SpecialType::Empty, Vec::new()).into())
                .into()
        }
        ImportMapping::Alias(name) => {
            let request = RequestVc::parse(Value::new(name.to_string().into()));

            ImportMapResult::Alias(request).into()
        }
    }
}

#[turbo_tasks::value_impl]
impl ImportMapVc {
    pub async fn lookup(self, request: RequestVc) -> Result<ImportMapResultVc> {
        let this = self.await?;
        // TODO lookup pattern
        if let Some(request_string) = request.await?.request() {
            if let Some(result) = this.direct.lookup(&request_string).next() {
                return Ok(import_mapping_to_result(result?.as_ref()));
            }
            let request_string_without_slash = if request_string.ends_with('/') {
                &request_string[..request_string.len() - 1]
            } else {
                &request_string
            };
            for (glob, mapping) in this.by_glob.iter() {
                if glob.execute(request_string_without_slash) {
                    return Ok(import_mapping_to_result(&mapping));
                }
            }
        }
        Ok(ImportMapResult::NoEntry.into())
    }
}

#[turbo_tasks::value_impl]
impl ResolvedMapVc {
    pub async fn lookup(self, resolved: FileSystemPathVc) -> Result<ImportMapResultVc> {
        let this = self.await?;
        let resolved = resolved.await?;
        for (root, glob, mapping) in this.by_glob.iter() {
            let root = root.get().await?;
            if let Some(path) = root.get_path_to(&resolved) {
                if glob.execute(path) {
                    return Ok(import_mapping_to_result(&mapping));
                }
            }
        }
        Ok(ImportMapResult::NoEntry.into())
    }
}

#[turbo_tasks::value(shared)]
#[derive(PartialEq, Eq, Clone, Debug, Default)]
pub struct ResolveOptions {
    pub extensions: Vec<String>,
    pub modules: Vec<ResolveModules>,
    pub into_package: Vec<ResolveIntoPackage>,
    pub import_map: Option<ImportMapVc>,
    pub resolved_map: Option<ResolvedMapVc>,
    pub resolve_typescript_types: bool,
}

#[turbo_tasks::value_impl]
impl ResolveOptionsVc {
    pub async fn modules(self) -> Result<ResolveModulesOptionsVc> {
        Ok(ResolveModulesOptions {
            modules: self.await?.modules.clone(),
        }
        .into())
    }

    pub async fn resolve_typescript_types(self) -> Result<Vc<bool>> {
        Ok(Vc::slot(self.await?.resolve_typescript_types))
    }
}

#[turbo_tasks::value(shared)]
#[derive(Hash, PartialEq, Eq, Clone, Debug)]
pub struct ResolveModulesOptions {
    pub modules: Vec<ResolveModules>,
}

#[turbo_tasks::function]
pub async fn resolve_modules_options(options: ResolveOptionsVc) -> Result<ResolveModulesOptionsVc> {
    Ok(ResolveModulesOptions {
        modules: options.await?.modules.clone(),
    }
    .into())
}
