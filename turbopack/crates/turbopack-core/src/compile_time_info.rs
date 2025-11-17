use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, NonLocalValue, ResolvedVc, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::FileSystemPath;

use crate::environment::Environment;

#[macro_export]
macro_rules! definable_name_map_pattern_internal {
    ($name:ident) => {
        [stringify!($name).into()]
    };
    ($name:ident typeof) => {
        [stringify!($name).into(), $crate::compile_time_info::DefinableNameSegment::TypeOf]
    };
    // Entry point for non-recursive calls
    ($name:ident . $($more:ident).+ typeof) => {
        $crate::definable_name_map_pattern_internal!($($more).+ typeof, [stringify!($name).into()])
    };
    ($name:ident . $($more:ident).+) => {
        $crate::definable_name_map_pattern_internal!($($more).+, [stringify!($name).into()])
    };
    // Pop first ident and push to end of array: (id, ..., [...]) => (..., [..., id])
    ($name:ident, [$($array:expr),+]) => {
        [$($array),+, stringify!($name).into()]
    };
    ($name:ident . $($more:ident).+, [$($array:expr),+]) => {
        $crate::definable_name_map_pattern_internal!($($more).+, [$($array),+, stringify!($name).into()])
    };
    ($name:ident typeof, [$($array:expr),+]) => {
        [$($array),+, stringify!($name).into(), $crate::compile_time_info::DefinableNameSegment::TypeOf]
    };
    ($name:ident . $($more:ident).+ typeof, [$($array:expr),+]) => {
        $crate::definable_name_map_pattern_internal!($($more).+ typeof, [$($array),+, stringify!($name).into()])
    };
}

// TODO stringify split map collect could be optimized with a marco
#[macro_export]
macro_rules! definable_name_map_internal {
    // Allow spreading a map: free_var_references!(..xy.into_iter(), FOO = "bar")
    ($map:ident, .. $value:expr) => {
        for (key, value) in $value {
            $map.insert(
                key.into(),
                value.into()
            );
        }
    };
    ($map:ident, .. $value:expr, $($more:tt)+) => {
        $crate::definable_name_map_internal!($map, .. $value);
        $crate::definable_name_map_internal!($map, $($more)+);
    };
    // Base case: a single entry
    ($map:ident, typeof $($name:ident).+ = $value:expr $(,)?) => {
        $map.insert(
            $crate::definable_name_map_pattern_internal!($($name).+ typeof).into(),
            $value.into()
        );
    };
    ($map:ident, $($name:ident).+ = $value:expr $(,)?) => {
        $map.insert(
            $crate::definable_name_map_pattern_internal!($($name).+).into(),
            $value.into()
        );
    };
    // Recursion: split off first entry
    ($map:ident, typeof $($name:ident).+ = $value:expr, $($more:tt)+) => {
        $crate::definable_name_map_internal!($map, typeof $($name).+ = $value);
        $crate::definable_name_map_internal!($map, $($more)+);
    };
    ($map:ident, $($name:ident).+ = $value:expr, $($more:tt)+) => {
        $crate::definable_name_map_internal!($map, $($name).+ = $value);
        $crate::definable_name_map_internal!($map, $($more)+);
    };

}

#[macro_export]
macro_rules! compile_time_defines {
    ($($more:tt)+) => {
        {
            let mut map = $crate::__private::FxIndexMap::default();
            $crate::definable_name_map_internal!(map, $($more)+);
            $crate::compile_time_info::CompileTimeDefines(map)
        }
    };
}

#[macro_export]
macro_rules! free_var_references {
    ($($more:tt)+) => {
        {
            let mut map = $crate::__private::FxIndexMap::default();
            $crate::definable_name_map_internal!(map, $($more)+);
            $crate::compile_time_info::FreeVarReferences(map)
        }
    };
}

// TODO: replace with just a `serde_json::Value`
// https://linear.app/vercel/issue/WEB-1641/compiletimedefinevalue-should-just-use-serde-jsonvalue
#[turbo_tasks::value]
#[derive(Debug, Clone, Hash)]
pub enum CompileTimeDefineValue {
    Null,
    Bool(bool),
    Number(RcStr),
    String(RcStr),
    Array(Vec<CompileTimeDefineValue>),
    Object(Vec<(RcStr, CompileTimeDefineValue)>),
    Undefined,
    Evaluate(RcStr),
}

impl From<bool> for CompileTimeDefineValue {
    fn from(value: bool) -> Self {
        Self::Bool(value)
    }
}

impl From<RcStr> for CompileTimeDefineValue {
    fn from(value: RcStr) -> Self {
        Self::String(value)
    }
}

impl From<String> for CompileTimeDefineValue {
    fn from(value: String) -> Self {
        Self::String(value.into())
    }
}

impl From<&str> for CompileTimeDefineValue {
    fn from(value: &str) -> Self {
        Self::String(value.into())
    }
}

impl From<serde_json::Value> for CompileTimeDefineValue {
    fn from(value: serde_json::Value) -> Self {
        match value {
            serde_json::Value::Null => Self::Null,
            serde_json::Value::Bool(b) => Self::Bool(b),
            serde_json::Value::Number(n) => Self::Number(n.to_string().into()),
            serde_json::Value::String(s) => Self::String(s.into()),
            serde_json::Value::Array(a) => Self::Array(a.into_iter().map(|i| i.into()).collect()),
            serde_json::Value::Object(m) => {
                Self::Object(m.into_iter().map(|(k, v)| (k.into(), v.into())).collect())
            }
        }
    }
}

#[turbo_tasks::value]
#[derive(Debug, Clone, Hash, PartialOrd, Ord)]
pub enum DefinableNameSegment {
    Name(RcStr),
    TypeOf,
}

impl From<RcStr> for DefinableNameSegment {
    fn from(value: RcStr) -> Self {
        DefinableNameSegment::Name(value)
    }
}

impl From<&str> for DefinableNameSegment {
    fn from(value: &str) -> Self {
        DefinableNameSegment::Name(value.into())
    }
}

impl From<String> for DefinableNameSegment {
    fn from(value: String) -> Self {
        DefinableNameSegment::Name(value.into())
    }
}

#[turbo_tasks::value(transparent)]
#[derive(Debug, Clone)]
pub struct CompileTimeDefines(pub FxIndexMap<Vec<DefinableNameSegment>, CompileTimeDefineValue>);

#[turbo_tasks::value(transparent)]
#[derive(Debug, Clone)]
pub struct CompileTimeDefinesIndividual(
    pub FxIndexMap<Vec<DefinableNameSegment>, ResolvedVc<CompileTimeDefineValue>>,
);

impl IntoIterator for CompileTimeDefines {
    type Item = (Vec<DefinableNameSegment>, CompileTimeDefineValue);
    type IntoIter = indexmap::map::IntoIter<Vec<DefinableNameSegment>, CompileTimeDefineValue>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

#[turbo_tasks::value_impl]
impl CompileTimeDefines {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Vc::cell(FxIndexMap::default())
    }

    #[turbo_tasks::function]
    pub fn individual(&self) -> Vc<CompileTimeDefinesIndividual> {
        let mut map: FxIndexMap<Vec<DefinableNameSegment>, ResolvedVc<CompileTimeDefineValue>> =
            self.0
                .iter()
                .map(|(key, value)| (key.clone(), value.clone().resolved_cell()))
                .collect();

        // Sort keys to make order as deterministic as possible
        map.sort_keys();

        Vc::cell(map)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, NonLocalValue)]
pub enum InputRelativeConstant {
    // The project relative directory name of the source file
    DirName,
    // The project relative file name of the source file.
    FileName,
}

#[turbo_tasks::value]
#[derive(Debug, Clone)]
pub enum FreeVarReference {
    EcmaScriptModule {
        request: RcStr,
        lookup_path: Option<FileSystemPath>,
        export: Option<RcStr>,
    },
    Ident(RcStr),
    Member(RcStr, RcStr),
    Value(CompileTimeDefineValue),
    InputRelative(InputRelativeConstant),
    Error(RcStr),
}

impl From<bool> for FreeVarReference {
    fn from(value: bool) -> Self {
        Self::Value(value.into())
    }
}

impl From<String> for FreeVarReference {
    fn from(value: String) -> Self {
        Self::Value(value.into())
    }
}
impl From<RcStr> for FreeVarReference {
    fn from(value: RcStr) -> Self {
        Self::Value(value.into())
    }
}

impl From<&str> for FreeVarReference {
    fn from(value: &str) -> Self {
        Self::Value(value.into())
    }
}

impl From<CompileTimeDefineValue> for FreeVarReference {
    fn from(value: CompileTimeDefineValue) -> Self {
        Self::Value(value)
    }
}

#[turbo_tasks::value(transparent)]
#[derive(Debug, Clone)]
pub struct FreeVarReferences(pub FxIndexMap<Vec<DefinableNameSegment>, FreeVarReference>);

/// A map from the last element (the member prop) to a map of the rest of the name to the value.
#[turbo_tasks::value(transparent)]
#[derive(Debug, Clone)]
pub struct FreeVarReferencesIndividual(
    pub  FxIndexMap<
        DefinableNameSegment,
        FxIndexMap<Vec<DefinableNameSegment>, ResolvedVc<FreeVarReference>>,
    >,
);

#[turbo_tasks::value_impl]
impl FreeVarReferences {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Vc::cell(FxIndexMap::default())
    }

    #[turbo_tasks::function]
    pub fn individual(&self) -> Vc<FreeVarReferencesIndividual> {
        let mut result: FxIndexMap<
            DefinableNameSegment,
            FxIndexMap<Vec<DefinableNameSegment>, ResolvedVc<FreeVarReference>>,
        > = FxIndexMap::default();

        for (key, value) in &self.0 {
            let (last_key, key) = key.split_last().unwrap();
            result
                .entry(last_key.clone())
                .or_default()
                .insert(key.to_vec(), value.clone().resolved_cell());
        }

        // Sort keys to make order as deterministic as possible
        result.sort_keys();
        result.iter_mut().for_each(|(_, inner)| inner.sort_keys());

        Vc::cell(result)
    }
}

#[turbo_tasks::value(shared)]
#[derive(Debug, Clone)]
pub struct CompileTimeInfo {
    pub environment: ResolvedVc<Environment>,
    pub defines: ResolvedVc<CompileTimeDefines>,
    pub free_var_references: ResolvedVc<FreeVarReferences>,
}

impl CompileTimeInfo {
    pub fn builder(environment: ResolvedVc<Environment>) -> CompileTimeInfoBuilder {
        CompileTimeInfoBuilder {
            environment,
            defines: None,
            free_var_references: None,
        }
    }
}

#[turbo_tasks::value_impl]
impl CompileTimeInfo {
    #[turbo_tasks::function]
    pub async fn new(environment: ResolvedVc<Environment>) -> Result<Vc<Self>> {
        Ok(CompileTimeInfo {
            environment,
            defines: CompileTimeDefines::empty().to_resolved().await?,
            free_var_references: FreeVarReferences::empty().to_resolved().await?,
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub fn environment(&self) -> Vc<Environment> {
        *self.environment
    }
}

pub struct CompileTimeInfoBuilder {
    environment: ResolvedVc<Environment>,
    defines: Option<ResolvedVc<CompileTimeDefines>>,
    free_var_references: Option<ResolvedVc<FreeVarReferences>>,
}

impl CompileTimeInfoBuilder {
    pub fn defines(mut self, defines: ResolvedVc<CompileTimeDefines>) -> Self {
        self.defines = Some(defines);
        self
    }

    pub fn free_var_references(
        mut self,
        free_var_references: ResolvedVc<FreeVarReferences>,
    ) -> Self {
        self.free_var_references = Some(free_var_references);
        self
    }

    pub async fn build(self) -> Result<CompileTimeInfo> {
        Ok(CompileTimeInfo {
            environment: self.environment,
            defines: match self.defines {
                Some(defines) => defines,
                None => CompileTimeDefines::empty().to_resolved().await?,
            },
            free_var_references: match self.free_var_references {
                Some(free_var_references) => free_var_references,
                None => FreeVarReferences::empty().to_resolved().await?,
            },
        })
    }

    pub async fn cell(self) -> Result<Vc<CompileTimeInfo>> {
        Ok(self.build().await?.cell())
    }
}

#[cfg(test)]
mod test {
    use turbo_rcstr::rcstr;
    use turbo_tasks::FxIndexMap;

    use crate::compile_time_info::{DefinableNameSegment, FreeVarReference, FreeVarReferences};

    #[test]
    fn macro_parser() {
        assert_eq!(
            free_var_references!(
                FOO = "bar",
                FOO = false,
                Buffer = FreeVarReference::EcmaScriptModule {
                    request: rcstr!("node:buffer"),
                    lookup_path: None,
                    export: Some(rcstr!("Buffer")),
                },
            ),
            FreeVarReferences(FxIndexMap::from_iter(vec![
                (
                    vec![rcstr!("FOO").into()],
                    FreeVarReference::Value(rcstr!("bar").into())
                ),
                (
                    vec![rcstr!("FOO").into()],
                    FreeVarReference::Value(false.into())
                ),
                (
                    vec![rcstr!("Buffer").into()],
                    FreeVarReference::EcmaScriptModule {
                        request: rcstr!("node:buffer"),
                        lookup_path: None,
                        export: Some(rcstr!("Buffer")),
                    }
                ),
            ]))
        );
    }

    #[test]
    fn macro_parser_typeof() {
        assert_eq!(
            free_var_references!(
                typeof x = "a",
                typeof x.y = "b",
                typeof x.y.z = "c"
            ),
            FreeVarReferences(FxIndexMap::from_iter(vec![
                (
                    vec![rcstr!("x").into(), DefinableNameSegment::TypeOf],
                    FreeVarReference::Value(rcstr!("a").into())
                ),
                (
                    vec![
                        rcstr!("x").into(),
                        rcstr!("y").into(),
                        DefinableNameSegment::TypeOf
                    ],
                    FreeVarReference::Value(rcstr!("b").into())
                ),
                (
                    vec![
                        rcstr!("x").into(),
                        rcstr!("y").into(),
                        rcstr!("z").into(),
                        DefinableNameSegment::TypeOf
                    ],
                    FreeVarReference::Value(rcstr!("b").into())
                ),
                (
                    vec![
                        rcstr!("x").into(),
                        rcstr!("y").into(),
                        rcstr!("z").into(),
                        DefinableNameSegment::TypeOf
                    ],
                    FreeVarReference::Value(rcstr!("c").into())
                )
            ]))
        );
    }
}
