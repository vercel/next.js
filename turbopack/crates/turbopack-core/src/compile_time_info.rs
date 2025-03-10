use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;

use crate::environment::Environment;

#[macro_export]
macro_rules! definable_name_map_pattern_internal {
    ($name:ident) => {
        [stringify!($name).into()]
    };
    ($name:ident typeof) => {
        [stringify!($name).into(), $crate::compile_time_info::DefineableNameSegment::TypeOf]
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
        [$($array),+, stringify!($name).into(), $crate::compile_time_info::DefineableNameSegment::TypeOf]
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
#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Clone, Hash)]
pub enum CompileTimeDefineValue {
    Bool(bool),
    String(RcStr),
    JSON(RcStr),
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
        Self::JSON(value.to_string().into())
    }
}

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Clone, Hash)]
pub enum DefineableNameSegment {
    Name(RcStr),
    TypeOf,
}

impl From<RcStr> for DefineableNameSegment {
    fn from(value: RcStr) -> Self {
        DefineableNameSegment::Name(value)
    }
}

impl From<&str> for DefineableNameSegment {
    fn from(value: &str) -> Self {
        DefineableNameSegment::Name(value.into())
    }
}

impl From<String> for DefineableNameSegment {
    fn from(value: String) -> Self {
        DefineableNameSegment::Name(value.into())
    }
}

#[turbo_tasks::value(transparent)]
#[derive(Debug, Clone)]
pub struct CompileTimeDefines(pub FxIndexMap<Vec<DefineableNameSegment>, CompileTimeDefineValue>);

#[turbo_tasks::value(transparent)]
#[derive(Debug, Clone)]
pub struct CompileTimeDefinesIndividual(
    pub FxIndexMap<Vec<DefineableNameSegment>, ResolvedVc<CompileTimeDefineValue>>,
);

impl IntoIterator for CompileTimeDefines {
    type Item = (Vec<DefineableNameSegment>, CompileTimeDefineValue);
    type IntoIter = indexmap::map::IntoIter<Vec<DefineableNameSegment>, CompileTimeDefineValue>;

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
        Vc::cell(
            self.0
                .iter()
                .map(|(key, value)| (key.clone(), value.clone().resolved_cell()))
                .collect(),
        )
    }
}

#[turbo_tasks::value]
#[derive(Debug, Clone)]
pub enum FreeVarReference {
    EcmaScriptModule {
        request: RcStr,
        lookup_path: Option<ResolvedVc<FileSystemPath>>,
        export: Option<RcStr>,
    },
    Ident(RcStr),
    Member(RcStr, RcStr),
    Value(CompileTimeDefineValue),
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
pub struct FreeVarReferences(pub FxIndexMap<Vec<DefineableNameSegment>, FreeVarReference>);

/// A map from the last element (the member prop) to a map of the rest of the name to the value.
#[turbo_tasks::value(transparent)]
#[derive(Debug, Clone)]
pub struct FreeVarReferencesIndividual(
    pub  FxIndexMap<
        DefineableNameSegment,
        FxIndexMap<Vec<DefineableNameSegment>, ResolvedVc<FreeVarReference>>,
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
            DefineableNameSegment,
            FxIndexMap<Vec<DefineableNameSegment>, ResolvedVc<FreeVarReference>>,
        > = FxIndexMap::default();

        for (key, value) in &self.0 {
            let (last_key, key) = key.split_last().unwrap();
            result
                .entry(last_key.clone())
                .or_default()
                .insert(key.to_vec(), value.clone().resolved_cell());
        }

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
    use turbo_tasks::FxIndexMap;

    use crate::compile_time_info::{DefineableNameSegment, FreeVarReference, FreeVarReferences};

    #[test]
    fn macro_parser() {
        assert_eq!(
            free_var_references!(
                FOO = "bar",
                FOO = false,
                Buffer = FreeVarReference::EcmaScriptModule {
                    request: "node:buffer".into(),
                    lookup_path: None,
                    export: Some("Buffer".into()),
                },
            ),
            FreeVarReferences(FxIndexMap::from_iter(vec![
                (vec!["FOO".into()], FreeVarReference::Value("bar".into())),
                (vec!["FOO".into()], FreeVarReference::Value(false.into())),
                (
                    vec!["Buffer".into()],
                    FreeVarReference::EcmaScriptModule {
                        request: "node:buffer".into(),
                        lookup_path: None,
                        export: Some("Buffer".into()),
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
                    vec!["x".into(), DefineableNameSegment::TypeOf],
                    FreeVarReference::Value("a".into())
                ),
                (
                    vec!["x".into(), "y".into(), DefineableNameSegment::TypeOf],
                    FreeVarReference::Value("b".into())
                ),
                (
                    vec![
                        "x".into(),
                        "y".into(),
                        "z".into(),
                        DefineableNameSegment::TypeOf
                    ],
                    FreeVarReference::Value("c".into())
                )
            ]))
        );
    }
}
