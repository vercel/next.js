use anyhow::Result;
use bincode::{Decode, Encode};
use indexmap::Equivalent;
use rustc_hash::FxHashSet;
use smallvec::SmallVec;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, NonLocalValue, ResolvedVc, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::FileSystemPath;

use crate::{environment::Environment, issue::IssueSeverity};

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
#[derive(Debug, Clone, Hash, TraceRawVcs, NonLocalValue, Encode, Decode, PartialEq, Eq)]
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
#[derive(Debug, Clone, PartialOrd, Ord)]
pub enum DefinableNameSegment {
    Name(RcStr),
    Call(RcStr),
    TypeOf,
}

// Hash can't be derived because DefinableNameSegmentRef must have a matching
// Hash implementation for Equivalent lookups, and derived discriminants are
// not guaranteed to match between different enum types.
// Also, we must use s.as_str().hash() instead of s.hash() because RcStr's Hash
// implementation for prehashed strings is not compatible with str's Hash.
impl std::hash::Hash for DefinableNameSegment {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        match self {
            Self::Name(s) => {
                0u8.hash(state);
                s.as_str().hash(state);
            }
            Self::Call(s) => {
                1u8.hash(state);
                s.as_str().hash(state);
            }
            Self::TypeOf => {
                2u8.hash(state);
            }
        }
    }
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

#[derive(PartialEq, Eq)]
pub enum DefinableNameSegmentRef<'a> {
    Name(&'a str),
    Call(&'a str),
    TypeOf,
}

// Hash can't be derived because it must match DefinableNameSegment's Hash
// implementation for Equivalent lookups, and derived discriminants are
// not guaranteed to match between different enum types.
impl std::hash::Hash for DefinableNameSegmentRef<'_> {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        match self {
            Self::Name(s) => {
                0u8.hash(state);
                s.hash(state);
            }
            Self::Call(s) => {
                1u8.hash(state);
                s.hash(state);
            }
            Self::TypeOf => {
                2u8.hash(state);
            }
        }
    }
}

impl Equivalent<DefinableNameSegment> for DefinableNameSegmentRef<'_> {
    fn equivalent(&self, key: &DefinableNameSegment) -> bool {
        match (self, key) {
            (DefinableNameSegmentRef::Name(a), DefinableNameSegment::Name(b)) => **a == *b.as_str(),
            (DefinableNameSegmentRef::Call(a), DefinableNameSegment::Call(b)) => **a == *b.as_str(),
            (DefinableNameSegmentRef::TypeOf, DefinableNameSegment::TypeOf) => true,
            _ => false,
        }
    }
}

#[derive(PartialEq, Eq)]
pub struct DefinableNameSegmentRefs<'a>(pub SmallVec<[DefinableNameSegmentRef<'a>; 4]>);

// Hash can't be derived because it must match Vec<DefinableNameSegment>'s Hash.
impl std::hash::Hash for DefinableNameSegmentRefs<'_> {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.0.len().hash(state);
        for segment in &self.0 {
            segment.hash(state);
        }
    }
}

impl Equivalent<Vec<DefinableNameSegment>> for DefinableNameSegmentRefs<'_> {
    fn equivalent(&self, key: &Vec<DefinableNameSegment>) -> bool {
        if self.0.len() != key.len() {
            return false;
        }
        for (a, b) in self.0.iter().zip(key.iter()) {
            if !a.equivalent(b) {
                return false;
            }
        }
        true
    }
}

#[turbo_tasks::value(transparent, cell = "keyed")]
#[derive(Debug, Clone)]
pub struct CompileTimeDefines(
    #[bincode(with = "turbo_bincode::indexmap")]
    pub  FxIndexMap<Vec<DefinableNameSegment>, CompileTimeDefineValue>,
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
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, TraceRawVcs, NonLocalValue, Encode, Decode)]
pub enum InputRelativeConstant {
    // The project relative directory name of the source file
    DirName,
    // The project relative file name of the source file.
    FileName,
}

#[derive(Debug, Clone, TraceRawVcs, NonLocalValue, Encode, Decode, PartialEq, Eq)]
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
    // Report the replacement of this free var with the given severity and message, and
    // potentially replace with the `inner` value.
    ReportUsage {
        message: RcStr,
        severity: IssueSeverity,
        inner: Option<Box<FreeVarReference>>,
    },
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

#[turbo_tasks::value(transparent, cell = "keyed")]
#[derive(Debug, Clone)]
pub struct FreeVarReferences(
    #[bincode(with = "turbo_bincode::indexmap")]
    pub  FxIndexMap<Vec<DefinableNameSegment>, FreeVarReference>,
);

#[turbo_tasks::value(transparent, cell = "keyed")]
pub struct FreeVarReferencesMembers(FxHashSet<RcStr>);

#[turbo_tasks::value_impl]
impl FreeVarReferences {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Vc::cell(FxIndexMap::default())
    }

    #[turbo_tasks::function]
    pub fn members(&self) -> Vc<FreeVarReferencesMembers> {
        let mut members = FxHashSet::default();
        for (key, _) in self.0.iter() {
            if let Some(name) = key
                .iter()
                .rfind(|segment| {
                    matches!(
                        segment,
                        DefinableNameSegment::Name(_) | DefinableNameSegment::Call(_)
                    )
                })
                .and_then(|segment| match segment {
                    DefinableNameSegment::Name(n) | DefinableNameSegment::Call(n) => Some(n),
                    _ => None,
                })
            {
                members.insert(name.clone());
            }
        }
        Vc::cell(members)
    }
}

impl IntoIterator for FreeVarReferences {
    type Item = (Vec<DefinableNameSegment>, FreeVarReference);
    type IntoIter = indexmap::map::IntoIter<Vec<DefinableNameSegment>, FreeVarReference>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
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
    use std::{
        collections::hash_map::DefaultHasher,
        hash::{Hash, Hasher},
    };

    use smallvec::smallvec;
    use turbo_rcstr::rcstr;
    use turbo_tasks::FxIndexMap;

    use crate::compile_time_info::{
        DefinableNameSegment, DefinableNameSegmentRef, DefinableNameSegmentRefs, FreeVarReference,
        FreeVarReferences,
    };

    fn hash_value<T: Hash>(value: &T) -> u64 {
        let mut hasher = DefaultHasher::new();
        value.hash(&mut hasher);
        hasher.finish()
    }

    #[test]
    fn hash_segment_name_matches() {
        let segment = DefinableNameSegment::Name(rcstr!("process"));
        let segment_ref = DefinableNameSegmentRef::Name("process");
        assert_eq!(
            hash_value(&segment),
            hash_value(&segment_ref),
            "DefinableNameSegment::Name and DefinableNameSegmentRef::Name must have matching Hash"
        );
    }

    #[test]
    fn hash_segment_call_matches() {
        let segment = DefinableNameSegment::Call(rcstr!("foo"));
        let segment_ref = DefinableNameSegmentRef::Call("foo");
        assert_eq!(
            hash_value(&segment),
            hash_value(&segment_ref),
            "DefinableNameSegment::Call and DefinableNameSegmentRef::Call must have matching Hash"
        );
    }

    #[test]
    fn hash_segment_typeof_matches() {
        let segment = DefinableNameSegment::TypeOf;
        let segment_ref = DefinableNameSegmentRef::TypeOf;
        assert_eq!(
            hash_value(&segment),
            hash_value(&segment_ref),
            "DefinableNameSegment::TypeOf and DefinableNameSegmentRef::TypeOf must have matching \
             Hash"
        );
    }

    #[test]
    fn hash_segments_vec_matches() {
        let segments: Vec<DefinableNameSegment> = vec![
            DefinableNameSegment::Name(rcstr!("process")),
            DefinableNameSegment::Name(rcstr!("env")),
            DefinableNameSegment::Name(rcstr!("NODE_ENV")),
        ];
        let segments_ref = DefinableNameSegmentRefs(smallvec![
            DefinableNameSegmentRef::Name("process"),
            DefinableNameSegmentRef::Name("env"),
            DefinableNameSegmentRef::Name("NODE_ENV"),
        ]);
        assert_eq!(
            hash_value(&segments),
            hash_value(&segments_ref),
            "Vec<DefinableNameSegment> and DefinableNameSegmentRefs must have matching Hash"
        );
    }

    #[test]
    fn hash_segments_with_typeof_matches() {
        let segments: Vec<DefinableNameSegment> = vec![
            DefinableNameSegment::Name(rcstr!("process")),
            DefinableNameSegment::TypeOf,
        ];
        let segments_ref = DefinableNameSegmentRefs(smallvec![
            DefinableNameSegmentRef::Name("process"),
            DefinableNameSegmentRef::TypeOf,
        ]);
        assert_eq!(
            hash_value(&segments),
            hash_value(&segments_ref),
            "Vec<DefinableNameSegment> with TypeOf and DefinableNameSegmentRefs must have \
             matching Hash"
        );
    }

    #[test]
    fn hash_segments_with_call_matches() {
        let segments: Vec<DefinableNameSegment> = vec![
            DefinableNameSegment::Name(rcstr!("foo")),
            DefinableNameSegment::Call(rcstr!("bar")),
        ];
        let segments_ref = DefinableNameSegmentRefs(smallvec![
            DefinableNameSegmentRef::Name("foo"),
            DefinableNameSegmentRef::Call("bar"),
        ]);
        assert_eq!(
            hash_value(&segments),
            hash_value(&segments_ref),
            "Vec<DefinableNameSegment> with Call and DefinableNameSegmentRefs must have matching \
             Hash"
        );
    }

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

    #[test]
    fn indexmap_lookup_with_equivalent() {
        // Test that DefinableNameSegmentRefs can be used to look up Vec<DefinableNameSegment>
        // in an IndexMap using the Equivalent trait
        let mut map: FxIndexMap<Vec<DefinableNameSegment>, &str> = FxIndexMap::default();
        map.insert(
            vec![
                DefinableNameSegment::Name(rcstr!("process")),
                DefinableNameSegment::Name(rcstr!("env")),
                DefinableNameSegment::Name(rcstr!("NODE_ENV")),
            ],
            "production",
        );
        map.insert(
            vec![
                DefinableNameSegment::Name(rcstr!("process")),
                DefinableNameSegment::Name(rcstr!("turbopack")),
            ],
            "true",
        );

        // Lookup using DefinableNameSegmentRefs
        let key = DefinableNameSegmentRefs(smallvec![
            DefinableNameSegmentRef::Name("process"),
            DefinableNameSegmentRef::Name("env"),
            DefinableNameSegmentRef::Name("NODE_ENV"),
        ]);
        assert_eq!(
            map.get(&key),
            Some(&"production"),
            "IndexMap lookup with Equivalent trait should work"
        );

        let key2 = DefinableNameSegmentRefs(smallvec![
            DefinableNameSegmentRef::Name("process"),
            DefinableNameSegmentRef::Name("turbopack"),
        ]);
        assert_eq!(
            map.get(&key2),
            Some(&"true"),
            "IndexMap lookup with Equivalent trait should work for shorter keys"
        );

        let key3 = DefinableNameSegmentRefs(smallvec![
            DefinableNameSegmentRef::Name("process"),
            DefinableNameSegmentRef::Name("nonexistent"),
        ]);
        assert_eq!(
            map.get(&key3),
            None,
            "IndexMap lookup should return None for nonexistent keys"
        );
    }

    #[test]
    fn fxhashset_rcstr_lookup_with_str() {
        // Test that &str can be used to look up RcStr in a FxHashSet
        // This is used by FreeVarReferencesMembers::contains_key
        use rustc_hash::FxHashSet;

        let mut set: FxHashSet<turbo_rcstr::RcStr> = FxHashSet::default();
        set.insert(rcstr!("process"));
        set.insert(rcstr!("env"));
        set.insert(rcstr!("NODE_ENV"));

        // This tests whether &str can look up RcStr in the set
        // It requires RcStr: Borrow<str> AND hash(&str) == hash(&RcStr)
        assert!(
            set.contains("process"),
            "FxHashSet<RcStr> lookup with &str should work for 'process'"
        );
        assert!(
            set.contains("env"),
            "FxHashSet<RcStr> lookup with &str should work for 'env'"
        );
        assert!(
            set.contains("NODE_ENV"),
            "FxHashSet<RcStr> lookup with &str should work for 'NODE_ENV'"
        );
        assert!(
            !set.contains("nonexistent"),
            "FxHashSet<RcStr> lookup with &str should return false for nonexistent keys"
        );
    }
}
