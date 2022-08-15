use std::collections::BTreeMap;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_tasks::{primitives::BoolVc, trace::TraceRawVcs, Value};
use turbo_tasks_fs::{
    glob::{Glob, GlobVc},
    FileSystemPathVc,
};

use super::{
    prefix_tree::{PrefixTree, WildcardReplacable},
    ResolveResult, ResolveResultVc, SpecialType,
};
use crate::resolve::parse::RequestVc;

#[turbo_tasks::value(shared)]
#[derive(Hash, Debug)]
pub struct LockedVersions {}

#[derive(TraceRawVcs, Hash, PartialEq, Eq, Clone, Debug, Serialize, Deserialize)]
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

#[derive(TraceRawVcs, Hash, PartialEq, Eq, Clone, Debug, Serialize, Deserialize)]
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

#[derive(TraceRawVcs, Hash, PartialEq, Eq, Clone, Debug, Serialize, Deserialize)]
pub enum ResolveIntoPackage {
    ExportsField {
        field: String,
        conditions: BTreeMap<String, ConditionValue>,
        unspecified_conditions: ConditionValue,
    },
    MainField(String),
    Default(String),
}

#[derive(TraceRawVcs, Hash, PartialEq, Eq, Clone, Debug, Serialize, Deserialize)]
pub enum ImportMapping {
    External(Option<String>),
    Alias(String, Option<FileSystemPathVc>),
    Ignore,
    Empty,
    Alternatives(Vec<ImportMapping>),
}

impl ImportMapping {
    pub fn aliases(list: Vec<String>, context: Option<FileSystemPathVc>) -> ImportMapping {
        if list.is_empty() {
            ImportMapping::Ignore
        } else if list.len() == 1 {
            ImportMapping::Alias(list.into_iter().next().unwrap(), context)
        } else {
            ImportMapping::Alternatives(
                list.into_iter()
                    .map(|s| ImportMapping::Alias(s, context))
                    .collect(),
            )
        }
    }
}

impl WildcardReplacable for ImportMapping {
    fn replace_wildcard(&self, value: &str) -> Result<Self> {
        match self {
            ImportMapping::External(name) => {
                if let Some(name) = name {
                    Ok(ImportMapping::External(Some(
                        name.clone().replace('*', value),
                    )))
                } else {
                    Ok(ImportMapping::External(None))
                }
            }
            ImportMapping::Alias(name, context) => Ok(ImportMapping::Alias(
                name.clone().replace('*', value),
                *context,
            )),
            ImportMapping::Ignore | ImportMapping::Empty => Ok(self.clone()),
            ImportMapping::Alternatives(list) => Ok(ImportMapping::Alternatives(
                list.iter()
                    .map(|e| e.replace_wildcard(value))
                    .collect::<Result<Vec<_>>>()?,
            )),
        }
    }

    fn append_to_folder(&self, value: &str) -> Result<Self> {
        fn add(name: &str, value: &str) -> String {
            if !name.ends_with('/') {
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
            ImportMapping::Alias(name, context) => {
                Ok(ImportMapping::Alias(add(name, value), *context))
            }
            ImportMapping::Ignore | ImportMapping::Empty => Ok(self.clone()),
            ImportMapping::Alternatives(list) => Ok(ImportMapping::Alternatives(
                list.iter()
                    .map(|e| e.append_to_folder(value))
                    .collect::<Result<Vec<_>>>()?,
            )),
        }
    }
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug, Default)]
pub struct ImportMap {
    pub direct: PrefixTree<ImportMapping>,
    pub by_glob: Vec<(Glob, ImportMapping)>,
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug, Default)]
pub struct ResolvedMap {
    pub by_glob: Vec<(FileSystemPathVc, GlobVc, ImportMapping)>,
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub enum ImportMapResult {
    Result(ResolveResultVc),
    Alias(RequestVc, Option<FileSystemPathVc>),
    Alternatives(Vec<ImportMapResult>),
    NoEntry,
}

fn import_mapping_to_result(mapping: &ImportMapping) -> ImportMapResult {
    match mapping {
        ImportMapping::External(name) => ImportMapResult::Result(
            ResolveResult::Special(
                name.as_ref().map_or_else(
                    || SpecialType::OriginalReferenceExternal,
                    |req| SpecialType::OriginalReferenceTypeExternal(req.to_string()),
                ),
                Vec::new(),
            )
            .into(),
        ),
        ImportMapping::Ignore => {
            ImportMapResult::Result(ResolveResult::Special(SpecialType::Ignore, Vec::new()).into())
        }
        ImportMapping::Empty => {
            ImportMapResult::Result(ResolveResult::Special(SpecialType::Empty, Vec::new()).into())
        }
        ImportMapping::Alias(name, context) => {
            let request = RequestVc::parse(Value::new(name.to_string().into()));

            ImportMapResult::Alias(request, *context)
        }
        ImportMapping::Alternatives(list) => {
            ImportMapResult::Alternatives(list.iter().map(import_mapping_to_result).collect())
        }
    }
}

#[turbo_tasks::value_impl]
impl ImportMapVc {
    #[turbo_tasks::function]
    pub async fn lookup(self, request: RequestVc) -> Result<ImportMapResultVc> {
        let this = self.await?;
        // TODO lookup pattern
        if let Some(request_string) = request.await?.request() {
            if let Some(result) = this.direct.lookup(&request_string).next() {
                return Ok(import_mapping_to_result(result?.as_ref()).into());
            }
            let request_string_without_slash = if request_string.ends_with('/') {
                &request_string[..request_string.len() - 1]
            } else {
                &request_string
            };
            for (glob, mapping) in this.by_glob.iter() {
                if glob.execute(request_string_without_slash) {
                    return Ok(import_mapping_to_result(mapping).into());
                }
            }
        }
        Ok(ImportMapResult::NoEntry.into())
    }
}

#[turbo_tasks::value_impl]
impl ResolvedMapVc {
    #[turbo_tasks::function]
    pub async fn lookup(self, resolved: FileSystemPathVc) -> Result<ImportMapResultVc> {
        let this = self.await?;
        let resolved = resolved.await?;
        for (root, glob, mapping) in this.by_glob.iter() {
            let root = root.await?;
            if let Some(path) = root.get_path_to(&resolved) {
                if glob.await?.execute(path) {
                    return Ok(import_mapping_to_result(mapping).into());
                }
            }
        }
        Ok(ImportMapResult::NoEntry.into())
    }
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug, Default)]
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
    #[turbo_tasks::function]
    pub async fn modules(self) -> Result<ResolveModulesOptionsVc> {
        Ok(ResolveModulesOptions {
            modules: self.await?.modules.clone(),
        }
        .into())
    }

    #[turbo_tasks::function]
    pub async fn resolve_typescript_types(self) -> Result<BoolVc> {
        Ok(BoolVc::cell(self.await?.resolve_typescript_types))
    }
}

#[turbo_tasks::value(shared)]
#[derive(Hash, Clone, Debug)]
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
