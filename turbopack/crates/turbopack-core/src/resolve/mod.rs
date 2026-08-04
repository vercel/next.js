#[cfg(not(feature = "sync"))]
use std::future::Future;
use std::{
    borrow::Cow,
    collections::BTreeMap,
    fmt::{Display, Formatter, Write},
    iter::{empty, once},
    sync::LazyLock,
};

use anyhow::{Result, bail};
use bincode::{Decode, Encode};
use either::Either;
use rustc_hash::{FxHashMap, FxHashSet};
use serde::{Deserialize, Serialize};
use smallvec::SmallVec;
#[cfg(not(feature = "sync"))]
use tracing::Instrument;
use tracing::Level;
use turbo_frozenmap::{FrozenMap, FrozenSet};
use turbo_rcstr::{RcStr, rcstr};
#[cfg(not(feature = "sync"))]
use turbo_tasks::TryJoinIterExt;
use turbo_tasks::{
    FxIndexMap, NonLocalValue, ReadRef, ResolvedVc, ValueToString, ValueToStringRef, Vc,
    trace::TraceRawVcs,
};
use turbo_tasks_fs::{FileSystemEntryType, FileSystemPath};
use turbo_unix_path::normalize_request;

use crate::{
    context::AssetContext,
    data_uri_source::DataUriSource,
    file_source::FileSource,
    issue::{
        Issue, IssueExt, IssueSource, module::emit_unknown_module_type_error,
        resolve::ResolvingIssue,
    },
    module::Module,
    package_json::{PackageJsonIssue, read_package_json},
    raw_module::RawModule,
    reference_type::ReferenceType,
    resolve::{
        alias_map::AliasKey,
        error::{handle_resolve_error, resolve_error_severity},
        node::{node_cjs_resolve_options, node_esm_resolve_options},
        options::{
            ConditionValue, ImportMapResult, ResolveInPackage, ResolveIntoPackage, ResolveModules,
            ResolveModulesOptions, ResolveOptions, resolve_modules_options,
        },
        origin::ResolveOrigin,
        parse::{Request, stringify_data_uri},
        pattern::{Pattern, PatternMatch, read_matches},
        plugin::{AfterResolvePlugin, AfterResolvePluginCondition, BeforeResolvePlugin},
        remap::{ExportImport, ExportsField, ImportsField, ReplacedSubpathValueResult},
    },
    source::Source,
};

mod alias_map;
pub mod error;
pub mod node;
pub mod options;
pub mod origin;
pub mod parse;
pub mod pattern;
pub mod plugin;
pub(crate) mod remap;

pub use alias_map::{
    AliasMap, AliasMapIntoIter, AliasMapLookupIterator, AliasMatch, AliasPattern, AliasTemplate,
};
pub use remap::{ResolveAliasMap, SubpathValue};

/// Controls how resolve errors are handled.
#[turbo_tasks::value(shared, task_input)]
#[derive(Debug, Clone, Copy, Default, Hash)]
pub enum ResolveErrorMode {
    /// Emit an error issue (default behavior)
    #[default]
    Error,
    /// Emit a warning issue (e.g., when inside a try-catch block)
    Warn,
    /// Completely ignore the error (e.g., when marked with `turbopackOptional`)
    Ignore,
}

/// Type alias for a resolved after-resolve plugin paired with its condition.
type AfterResolvePluginWithCondition = (
    ResolvedVc<Box<dyn AfterResolvePlugin>>,
    ReadRef<AfterResolvePluginCondition>,
);

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub enum ModuleResolveResultItem {
    Module(ResolvedVc<Box<dyn Module>>),
    External {
        /// uri, path, reference, etc.
        name: RcStr,
        ty: ExternalType,
    },
    /// A module could not be created (according to the rules, e.g. no module type as assigned)
    Unknown(ResolvedVc<Box<dyn Source>>),
    /// Completely ignore this reference.
    Ignore,
    /// Emit the given issue, and generate a module which throws that issue's title at runtime.
    Error(ResolvedVc<Box<dyn Issue>>),
    /// Resolve the reference to an empty module.
    Empty,
    Custom(u8),
    /// A duplicate of an item that appeared earlier in the primary array.
    /// The usize is the index of the first occurrence. Most callers should skip
    /// this variant.
    ///
    /// Bakes duplicate detection into the datastructure to make filtering for uniques trivial which
    /// is required by primary_modules.
    Duplicate(usize),
}

impl ModuleResolveResultItem {
    turbo_tasks::dual_fn! {
    // Returns the module for this item if it is one
    // NOTE: if this is a `ModuleResolveResultItem::Duplicate` we return `None`, it is expected that
    // callers will have already found the module earlier.
    fn as_module(&self) -> Result<Option<ResolvedVc<Box<dyn Module>>>> {
        Ok(match *self {
            ModuleResolveResultItem::Module(module) => Some(module),
            ModuleResolveResultItem::Unknown(source) => {
                turbo_tasks::read!(emit_unknown_module_type_error(*source))?;
                None
            }
            ModuleResolveResultItem::Error(_err) => {
                // TODO emit error?
                None
            }
            _ => None,
        })
    }
    }
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug, Hash, Default, Serialize, Deserialize)]
pub struct BindingUsage {
    pub import: ImportUsage,
    pub export: ExportUsage,
}

#[turbo_tasks::value_impl]
impl BindingUsage {
    #[turbo_tasks::function]
    pub fn all() -> Vc<Self> {
        Self::default().cell()
    }
}

/// Defines where an import is used in a module
#[turbo_tasks::value(shared)]
#[derive(Debug, Clone, Default, Hash, Serialize, Deserialize)]
pub enum ImportUsage {
    /// This import is used at the top level of the module.  For example, for module level side
    /// effects
    #[default]
    TopLevel,
    /// This import is used only by these specific exports, if all exports are unused, the import
    /// can also be removed.
    ///
    /// (This is only ever set on `ModulePart::Export` references. Side effects are handled via
    /// `ModulePart::Evaluation` references, which always have `ImportUsage::TopLevel`.)
    Exports(FrozenSet<RcStr>),
}

/// Defines what parts of a module are used by another module
#[turbo_tasks::value]
#[derive(Debug, Clone, Default, Hash, Serialize, Deserialize)]
pub enum ExportUsage {
    Named(RcStr),
    /// Multiple named exports are used via a partial namespace object.
    PartialNamespaceObject(SmallVec<[RcStr; 1]>),
    /// This means the whole content of the module is used.
    #[default]
    All,
    /// Only side effects are used.
    Evaluation,
}

impl Display for ExportUsage {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            ExportUsage::Named(name) => write!(f, "export {name}"),
            ExportUsage::PartialNamespaceObject(names) => {
                write!(f, "exports ")?;
                for (i, name) in names.iter().enumerate() {
                    if i > 0 {
                        write!(f, ", ")?;
                    }
                    write!(f, "{name}")?;
                }
                Ok(())
            }
            ExportUsage::All => write!(f, "all"),
            ExportUsage::Evaluation => write!(f, "evaluation"),
        }
    }
}

#[turbo_tasks::value_impl]
impl ExportUsage {
    #[turbo_tasks::function]
    pub fn all() -> Vc<Self> {
        Self::All.cell()
    }

    #[turbo_tasks::function]
    pub fn evaluation() -> Vc<Self> {
        Self::Evaluation.cell()
    }

    #[turbo_tasks::function]
    pub fn named(name: RcStr) -> Vc<Self> {
        Self::Named(name).cell()
    }
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub struct ModuleResolveResult {
    pub primary: Box<[(RequestKey, ModuleResolveResultItem)]>,
    /// Affecting sources are other files that influence the resolve result.  For example,
    /// traversed symlinks
    pub affecting_sources: Box<[ResolvedVc<Box<dyn Source>>]>,
}

impl ModuleResolveResult {
    pub fn unresolvable() -> ResolvedVc<Self> {
        ModuleResolveResult {
            primary: Default::default(),
            affecting_sources: Default::default(),
        }
        .resolved_cell()
    }

    pub fn module(module: ResolvedVc<Box<dyn Module>>) -> ResolvedVc<Self> {
        Self::module_with_key(RequestKey::default(), module)
    }

    pub fn module_with_key(
        request_key: RequestKey,
        module: ResolvedVc<Box<dyn Module>>,
    ) -> ResolvedVc<Self> {
        ModuleResolveResult {
            primary: vec![(request_key, ModuleResolveResultItem::Module(module))]
                .into_boxed_slice(),
            affecting_sources: Default::default(),
        }
        .resolved_cell()
    }

    pub fn modules(
        modules: impl IntoIterator<Item = (RequestKey, ResolvedVc<Box<dyn Module>>)>,
    ) -> ResolvedVc<Self> {
        let mut primary: Vec<_> = modules
            .into_iter()
            .map(|(k, v)| (k, ModuleResolveResultItem::Module(v)))
            .collect();
        Self::mark_duplicates(&mut primary);
        ModuleResolveResult {
            primary: primary.into_boxed_slice(),
            affecting_sources: Default::default(),
        }
        .resolved_cell()
    }

    pub fn modules_with_affecting_sources(
        modules: impl IntoIterator<Item = (RequestKey, ResolvedVc<Box<dyn Module>>)>,
        affecting_sources: Vec<ResolvedVc<Box<dyn Source>>>,
    ) -> ResolvedVc<Self> {
        let mut primary: Vec<_> = modules
            .into_iter()
            .map(|(k, v)| (k, ModuleResolveResultItem::Module(v)))
            .collect();
        Self::mark_duplicates(&mut primary);
        ModuleResolveResult {
            primary: primary.into_boxed_slice(),
            affecting_sources: affecting_sources.into_boxed_slice(),
        }
        .resolved_cell()
    }
}

impl ModuleResolveResult {
    /// Marks duplicate items as `Duplicate(first_index)` in place.
    /// Preserves ordering; the first occurrence stays, subsequent occurrences
    /// of the same module/output asset become `Duplicate`.
    fn mark_duplicates(primary: &mut [(RequestKey, ModuleResolveResultItem)]) {
        if primary.len() <= 1 {
            return;
        }
        // Map from module identity to the index of first occurrence
        let mut seen_modules = FxHashMap::default();
        for (i, (_, item)) in primary.iter_mut().enumerate() {
            if let ModuleResolveResultItem::Module(m) = *item {
                if let Some(&first) = seen_modules.get(&m) {
                    *item = ModuleResolveResultItem::Duplicate(first);
                } else {
                    seen_modules.insert(m, i);
                }
            }
        }
    }

    /// Returns all module results (but ignoring any errors).
    pub fn primary_modules_raw_iter(
        &self,
    ) -> impl Iterator<Item = ResolvedVc<Box<dyn Module>>> + '_ {
        self.primary.iter().filter_map(|(_, item)| match *item {
            ModuleResolveResultItem::Module(a) => Some(a),
            _ => None,
        })
    }

    turbo_tasks::dual_fn! {
    /// Returns primary modules (no duplicates). Emits errors for Unknown items.
    /// Duplicates are already marked at construction time so no extra dedup is
    /// needed here.
    pub fn primary_modules(&self) -> Result<Vec<ResolvedVc<Box<dyn Module>>>> {
        // Sequential on purpose: `as_module` only awaits on the rare `Unknown` error
        // path, so there is nothing to gain from a concurrent fan-out here.
        let mut modules = Vec::new();
        for (_, item) in self.primary.iter() {
            if let Some(module) = turbo_tasks::read!(item.as_module())? {
                modules.push(module);
            }
        }
        Ok(modules)
    }
    }

    turbo_tasks::dual_fn! {
    /// Returns the first module in the result, or None.
    pub fn first_module(&self) -> Result<Option<ResolvedVc<Box<dyn Module>>>> {
        for (_, item) in self.primary.iter() {
            if let Some(module) = turbo_tasks::read!(item.as_module())? {
                return Ok(Some(module));
            }
        }
        Ok(None)
    }
    }

    pub fn affecting_sources_iter(&self) -> impl Iterator<Item = ResolvedVc<Box<dyn Source>>> + '_ {
        self.affecting_sources.iter().copied()
    }

    pub fn is_unresolvable(&self) -> bool {
        self.primary.is_empty()
    }

    pub fn errors(&self) -> impl Iterator<Item = ResolvedVc<Box<dyn Issue>>> + '_ {
        self.primary.iter().filter_map(|i| match &i.1 {
            ModuleResolveResultItem::Error(e) => Some(*e),
            _ => None,
        })
    }
}

pub struct ModuleResolveResultBuilder {
    pub primary: FxIndexMap<RequestKey, ModuleResolveResultItem>,
    pub affecting_sources: Vec<ResolvedVc<Box<dyn Source>>>,
}

impl From<ModuleResolveResultBuilder> for ModuleResolveResult {
    fn from(v: ModuleResolveResultBuilder) -> Self {
        let mut primary: Vec<_> = v.primary.into_iter().collect();
        Self::mark_duplicates(&mut primary);
        ModuleResolveResult {
            primary: primary.into_boxed_slice(),
            affecting_sources: v.affecting_sources.into_boxed_slice(),
        }
    }
}

/// Resolves a `Duplicate(i)` marker by looking up the underlying item in `source`.
/// `mark_duplicates` only ever produces backwards-pointing `Duplicate` indices into
/// `Module(_)` entries, so a single lookup is enough.
fn expand_duplicate<'a>(
    source: &'a [(RequestKey, ModuleResolveResultItem)],
    item: &'a ModuleResolveResultItem,
) -> &'a ModuleResolveResultItem {
    if let ModuleResolveResultItem::Duplicate(i) = *item {
        &source[i].1
    } else {
        item
    }
}

impl From<ModuleResolveResult> for ModuleResolveResultBuilder {
    fn from(v: ModuleResolveResult) -> Self {
        // Expand `Duplicate(i)` markers as we copy into the builder. The indices are valid
        // for `v.primary`, but the builder's `FxIndexMap` may be re-keyed and merged with
        // other results, so the indices wouldn't survive. The final
        // `From<Builder> for ModuleResolveResult` re-runs `mark_duplicates` on the merged
        // primary array.
        let primary = v
            .primary
            .iter()
            .map(|(k, item)| (k.clone(), expand_duplicate(&v.primary, item).clone()))
            .collect();
        ModuleResolveResultBuilder {
            primary,
            affecting_sources: v.affecting_sources.into_vec(),
        }
    }
}
impl ModuleResolveResultBuilder {
    pub fn merge_alternatives(&mut self, other: &ModuleResolveResult) {
        // Expand `Duplicate(i)` markers from `other` against `other.primary` before
        // inserting — the indices only make sense within `other`, not within the merged
        // result. The final `mark_duplicates` pass on conversion will re-derive markers.
        for (k, v) in other.primary.iter() {
            if !self.primary.contains_key(k) {
                self.primary
                    .insert(k.clone(), expand_duplicate(&other.primary, v).clone());
            }
        }
        let set = self
            .affecting_sources
            .iter()
            .copied()
            .collect::<FxHashSet<_>>();
        self.affecting_sources.extend(
            other
                .affecting_sources
                .iter()
                .filter(|source| !set.contains(source))
                .copied(),
        );
    }
}

#[turbo_tasks::value_impl]
impl ModuleResolveResult {
    #[turbo_tasks::function]
    pub async fn alternatives(results: Vec<Vc<ModuleResolveResult>>) -> Result<Vc<Self>> {
        if results.len() == 1 {
            return Ok(results.into_iter().next().unwrap());
        }
        let mut iter = turbo_tasks::parallel!(results)?.into_iter();
        if let Some(current) = iter.next() {
            let mut current: ModuleResolveResultBuilder = ReadRef::into_owned(current).into();
            for result in iter {
                // For clippy -- This explicit deref is necessary
                let other = &*result;
                current.merge_alternatives(other);
            }
            Ok(Self::cell(current.into()))
        } else {
            Ok(*ModuleResolveResult::unresolvable())
        }
    }
}

#[turbo_tasks::task_input]
#[derive(
    Copy, Clone, Debug, PartialEq, Eq, Hash, TraceRawVcs, Serialize, Deserialize, Encode, Decode,
)]
pub enum ExternalTraced {
    Untraced,
    Traced,
}

impl Display for ExternalTraced {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            ExternalTraced::Untraced => write!(f, "untraced"),
            ExternalTraced::Traced => write!(f, "traced"),
        }
    }
}

#[turbo_tasks::task_input]
#[derive(
    Copy, Clone, Debug, Eq, PartialEq, Hash, Serialize, Deserialize, TraceRawVcs, Encode, Decode,
)]
pub enum ExternalType {
    Url,
    CommonJs,
    EcmaScriptModule,
    Global,
    Script,
}

impl Display for ExternalType {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            ExternalType::CommonJs => write!(f, "commonjs"),
            ExternalType::EcmaScriptModule => write!(f, "esm"),
            ExternalType::Url => write!(f, "url"),
            ExternalType::Global => write!(f, "global"),
            ExternalType::Script => write!(f, "script"),
        }
    }
}

#[turbo_tasks::value(shared)]
#[derive(Debug, Clone)]
pub enum ResolveResultItem {
    Source(ResolvedVc<Box<dyn Source>>),
    External {
        /// uri, path, reference, etc.
        name: RcStr,
        ty: ExternalType,
        traced: ExternalTraced,
        /// The file path to the resolved file. Passing a value will create a symlink in the output
        /// root to be able to access potentially transitive dependencies.
        target: Option<FileSystemPath>,
    },
    /// Completely ignore this reference.
    Ignore,
    /// Emit the given issue, and generate a module which throws that issue's title at runtime.
    Error(ResolvedVc<Box<dyn Issue>>),
    /// Resolve the reference to an empty module.
    Empty,
    Custom(u8),
}

/// Represents the key for a request that leads to a certain results during
/// resolving.
///
/// A primary factor is the actual request string, but there are
/// other factors like exports conditions that can affect resolving and become
/// part of the key (assuming the condition is unknown at compile time)
#[derive(Clone, Debug, Default, Hash)]
#[turbo_tasks::value(task_input)]
pub struct RequestKey {
    pub request: Option<RcStr>,
    pub conditions: FrozenMap<RcStr, bool>,
}

impl Display for RequestKey {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        if let Some(request) = &self.request {
            write!(f, "{request}")?;
        } else {
            write!(f, "<default>")?;
        }
        if !self.conditions.is_empty() {
            write!(f, " (")?;
            for (i, (k, v)) in self.conditions.iter().enumerate() {
                if i > 0 {
                    write!(f, ", ")?;
                }
                write!(f, "{k}={v}")?;
            }
            write!(f, ")")?;
        }
        Ok(())
    }
}

impl RequestKey {
    pub fn new(request: RcStr) -> Self {
        RequestKey {
            request: Some(request),
            ..Default::default()
        }
    }
}

#[turbo_tasks::value(shared)]
#[derive(Clone)]
pub struct ResolveResult {
    pub primary: Box<[(RequestKey, ResolveResultItem)]>,
    /// Affecting sources are other files that influence the resolve result.  For example,
    /// traversed symlinks
    pub affecting_sources: Box<[ResolvedVc<Box<dyn Source>>]>,
}

#[turbo_tasks::value_impl]
impl ValueToString for ResolveResult {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        let mut result = String::new();
        if self.is_unresolvable() {
            result.push_str("unresolvable");
        }
        for (i, (request, item)) in self.primary.iter().enumerate() {
            if i > 0 {
                result.push_str(", ");
            }
            write!(result, "{request} -> ").unwrap();
            match item {
                ResolveResultItem::Source(a) => {
                    result.push_str(&turbo_tasks::read!(a.ident().to_string())?);
                }
                ResolveResultItem::External {
                    name: s,
                    ty,
                    traced,
                    target,
                } => {
                    result.push_str("external ");
                    result.push_str(s);
                    write!(
                        result,
                        " ({ty}, {traced}, {:?})",
                        if let Some(target) = target {
                            Some(turbo_tasks::read!(target.to_string_ref())?)
                        } else {
                            None
                        }
                    )?;
                }
                ResolveResultItem::Ignore => {
                    result.push_str("ignore");
                }
                ResolveResultItem::Empty => {
                    result.push_str("empty");
                }
                ResolveResultItem::Error(_) => {
                    result.push_str("error");
                }
                ResolveResultItem::Custom(_) => {
                    result.push_str("custom");
                }
            }
            result.push('\n');
        }
        if !self.affecting_sources.is_empty() {
            result.push_str(" (affecting sources: ");
            for (i, source) in self.affecting_sources.iter().enumerate() {
                if i > 0 {
                    result.push_str(", ");
                }
                result.push_str(&turbo_tasks::read!(source.ident().to_string())?);
            }
            result.push(')');
        }
        Ok(Vc::cell(result.into()))
    }
}

impl ResolveResult {
    pub fn unresolvable() -> Self {
        ResolveResult {
            primary: Default::default(),
            affecting_sources: Default::default(),
        }
    }

    pub fn unresolvable_with_affecting_sources(
        affecting_sources: Vec<ResolvedVc<Box<dyn Source>>>,
    ) -> Self {
        ResolveResult {
            primary: Default::default(),
            affecting_sources: affecting_sources.into_boxed_slice(),
        }
    }

    pub fn primary(result: ResolveResultItem) -> Self {
        Self::primary_with_key(RequestKey::default(), result)
    }

    pub fn primary_with_key(request_key: RequestKey, result: ResolveResultItem) -> Self {
        ResolveResult {
            primary: vec![(request_key, result)].into_boxed_slice(),
            affecting_sources: Default::default(),
        }
    }

    pub fn primary_with_affecting_sources(
        request_key: RequestKey,
        result: ResolveResultItem,
        affecting_sources: Vec<ResolvedVc<Box<dyn Source>>>,
    ) -> Self {
        ResolveResult {
            primary: vec![(request_key, result)].into_boxed_slice(),
            affecting_sources: affecting_sources.into_boxed_slice(),
        }
    }

    pub fn source(source: ResolvedVc<Box<dyn Source>>) -> Self {
        Self::source_with_key(RequestKey::default(), source)
    }

    fn source_with_key(request_key: RequestKey, source: ResolvedVc<Box<dyn Source>>) -> Self {
        ResolveResult {
            primary: vec![(request_key, ResolveResultItem::Source(source))].into_boxed_slice(),
            affecting_sources: Default::default(),
        }
    }

    fn source_with_affecting_sources(
        request_key: RequestKey,
        source: ResolvedVc<Box<dyn Source>>,
        affecting_sources: Vec<ResolvedVc<Box<dyn Source>>>,
    ) -> Self {
        ResolveResult {
            primary: vec![(request_key, ResolveResultItem::Source(source))].into_boxed_slice(),
            affecting_sources: affecting_sources.into_boxed_slice(),
        }
    }

    pub fn errors(&self) -> impl Iterator<Item = ResolvedVc<Box<dyn Issue>>> + '_ {
        self.primary.iter().filter_map(|i| match &i.1 {
            ResolveResultItem::Error(e) => Some(*e),
            _ => None,
        })
    }
}

impl ResolveResult {
    /// Returns the affecting sources for this result. Will be empty if affecting sources are
    /// disabled for this result.
    pub fn get_affecting_sources(&self) -> impl Iterator<Item = ResolvedVc<Box<dyn Source>>> + '_ {
        self.affecting_sources.iter().copied()
    }

    pub fn is_unresolvable(&self) -> bool {
        self.primary.is_empty()
    }

    pub fn first_source(&self) -> Option<ResolvedVc<Box<dyn Source>>> {
        self.primary.iter().find_map(|(_, item)| {
            if let &ResolveResultItem::Source(a) = item {
                Some(a)
            } else {
                None
            }
        })
    }

    pub fn primary_sources(&self) -> impl Iterator<Item = ResolvedVc<Box<dyn Source>>> {
        self.primary.iter().filter_map(|(_, item)| {
            if let &ResolveResultItem::Source(a) = item {
                Some(a)
            } else {
                None
            }
        })
    }

    #[cfg(not(feature = "sync"))]
    pub async fn map_module<A, AF>(&self, source_fn: A) -> Result<ModuleResolveResult>
    where
        A: Fn(ResolvedVc<Box<dyn Source>>) -> AF,
        AF: Future<Output = Result<ModuleResolveResultItem>>,
    {
        Ok(ModuleResolveResult {
            primary: turbo_tasks::read!(
                self.primary
                    .iter()
                    .map(|(request, item)| {
                        let asset_fn = &source_fn;
                        let request = request.clone();
                        let item = item.clone();
                        async move {
                            Ok((
                                request,
                                match item {
                                    ResolveResultItem::Source(source) => {
                                        turbo_tasks::read!(asset_fn(source))?
                                    }
                                    ResolveResultItem::External {
                                        name,
                                        ty,
                                        traced,
                                        target,
                                    } => {
                                        if traced == ExternalTraced::Traced || target.is_some() {
                                            // Should use map_primary_items instead
                                            bail!("map_module doesn't handle traced externals");
                                        }
                                        ModuleResolveResultItem::External { name, ty }
                                    }
                                    ResolveResultItem::Ignore => ModuleResolveResultItem::Ignore,
                                    ResolveResultItem::Empty => ModuleResolveResultItem::Empty,
                                    ResolveResultItem::Error(e) => {
                                        ModuleResolveResultItem::Error(e)
                                    }
                                    ResolveResultItem::Custom(u8) => {
                                        ModuleResolveResultItem::Custom(u8)
                                    }
                                },
                            ))
                        }
                    })
                    .try_join()
            )?
            .into_iter()
            .collect(),
            affecting_sources: self.affecting_sources.clone(),
        })
    }

    /// See the async definition above; the `sync` build takes a plain `Result`-returning
    /// mapper and maps the items sequentially.
    #[cfg(feature = "sync")]
    pub fn map_module<A>(&self, source_fn: A) -> Result<ModuleResolveResult>
    where
        A: Fn(ResolvedVc<Box<dyn Source>>) -> Result<ModuleResolveResultItem>,
    {
        Ok(ModuleResolveResult {
            primary: self
                .primary
                .iter()
                .map(|(request, item)| {
                    Ok((
                        request.clone(),
                        match item.clone() {
                            ResolveResultItem::Source(source) => source_fn(source)?,
                            ResolveResultItem::External {
                                name,
                                ty,
                                traced,
                                target,
                            } => {
                                if traced == ExternalTraced::Traced || target.is_some() {
                                    // Should use map_primary_items instead
                                    bail!("map_module doesn't handle traced externals");
                                }
                                ModuleResolveResultItem::External { name, ty }
                            }
                            ResolveResultItem::Ignore => ModuleResolveResultItem::Ignore,
                            ResolveResultItem::Empty => ModuleResolveResultItem::Empty,
                            ResolveResultItem::Error(e) => ModuleResolveResultItem::Error(e),
                            ResolveResultItem::Custom(u8) => ModuleResolveResultItem::Custom(u8),
                        },
                    ))
                })
                .collect::<Result<_>>()?,
            affecting_sources: self.affecting_sources.clone(),
        })
    }

    #[cfg(not(feature = "sync"))]
    pub async fn map_primary_items<A, AF>(&self, item_fn: A) -> Result<ModuleResolveResult>
    where
        A: Fn(ResolveResultItem) -> AF,
        AF: Future<Output = Result<ModuleResolveResultItem>>,
    {
        Ok(ModuleResolveResult {
            primary: turbo_tasks::read!(
                self.primary
                    .iter()
                    .map(|(request, item)| {
                        let asset_fn = &item_fn;
                        let request = request.clone();
                        let item = item.clone();
                        async move { Ok((request, turbo_tasks::read!(asset_fn(item))?)) }
                    })
                    .try_join()
            )?
            .into_iter()
            .collect(),
            affecting_sources: self.affecting_sources.clone(),
        })
    }

    /// See the async definition above; the `sync` build takes a plain `Result`-returning
    /// mapper and maps the items sequentially.
    #[cfg(feature = "sync")]
    pub fn map_primary_items<A>(&self, item_fn: A) -> Result<ModuleResolveResult>
    where
        A: Fn(ResolveResultItem) -> Result<ModuleResolveResultItem>,
    {
        Ok(ModuleResolveResult {
            primary: self
                .primary
                .iter()
                .map(|(request, item)| Ok((request.clone(), item_fn(item.clone())?)))
                .collect::<Result<_>>()?,
            affecting_sources: self.affecting_sources.clone(),
        })
    }

    /// Returns a new [ResolveResult] where all [RequestKey]s are set to the
    /// passed `request`.
    fn with_request_ref(&self, request: RcStr) -> Self {
        let new_primary = self
            .primary
            .iter()
            .map(|(k, v)| {
                (
                    RequestKey {
                        request: Some(request.clone()),
                        conditions: k.conditions.clone(),
                    },
                    v.clone(),
                )
            })
            .collect();
        ResolveResult {
            primary: new_primary,
            affecting_sources: self.affecting_sources.clone(),
        }
    }

    pub fn with_conditions(&self, new_conditions: &[(RcStr, bool)]) -> Self {
        let primary = self
            .primary
            .iter()
            .map(|(k, v)| {
                (
                    RequestKey {
                        request: k.request.clone(),
                        conditions: k.conditions.extend(new_conditions.iter().cloned()),
                    },
                    v.clone(),
                )
            })
            .collect::<FxIndexMap<_, _>>() // Deduplicate
            .into_iter()
            .collect();
        ResolveResult {
            primary,
            affecting_sources: self.affecting_sources.clone(),
        }
    }
}

struct ResolveResultBuilder {
    primary: FxIndexMap<RequestKey, ResolveResultItem>,
    affecting_sources: Vec<ResolvedVc<Box<dyn Source>>>,
}

impl From<ResolveResultBuilder> for ResolveResult {
    fn from(v: ResolveResultBuilder) -> Self {
        ResolveResult {
            primary: v.primary.into_iter().collect(),
            affecting_sources: v.affecting_sources.into_boxed_slice(),
        }
    }
}
impl From<ResolveResult> for ResolveResultBuilder {
    fn from(v: ResolveResult) -> Self {
        ResolveResultBuilder {
            primary: IntoIterator::into_iter(v.primary).collect(),
            affecting_sources: v.affecting_sources.into_vec(),
        }
    }
}
impl ResolveResultBuilder {
    pub fn merge_alternatives(&mut self, other: &ResolveResult) {
        for (k, v) in other.primary.iter() {
            if !self.primary.contains_key(k) {
                self.primary.insert(k.clone(), v.clone());
            }
        }
        let set = self
            .affecting_sources
            .iter()
            .copied()
            .collect::<FxHashSet<_>>();
        self.affecting_sources.extend(
            other
                .affecting_sources
                .iter()
                .filter(|source| !set.contains(source))
                .copied(),
        );
    }
}

#[turbo_tasks::value_impl]
impl ResolveResult {
    #[turbo_tasks::function]
    pub async fn as_raw_module_result(&self) -> Result<Vc<ModuleResolveResult>> {
        #[cfg(not(feature = "sync"))]
        let result = turbo_tasks::read!(self.map_module(|asset| async move {
            Ok(ModuleResolveResultItem::Module(ResolvedVc::upcast(
                turbo_tasks::read!(RawModule::new(*asset).to_resolved())?,
            )))
        }))?;
        #[cfg(feature = "sync")]
        let result = self.map_module(|asset| {
            Ok(ModuleResolveResultItem::Module(ResolvedVc::upcast(
                turbo_tasks::read!(RawModule::new(*asset).to_resolved())?,
            )))
        })?;
        Ok(result.cell())
    }

    #[turbo_tasks::function]
    fn with_affecting_sources(
        &self,
        sources: Vec<ResolvedVc<Box<dyn Source>>>,
    ) -> Result<Vc<Self>> {
        Ok(Self {
            primary: self.primary.clone(),
            affecting_sources: self
                .affecting_sources
                .iter()
                .copied()
                .chain(sources)
                .collect(),
        }
        .cell())
    }

    #[turbo_tasks::function]
    async fn alternatives(results: Vec<Vc<ResolveResult>>) -> Result<Vc<Self>> {
        if results.len() == 1 {
            return Ok(results.into_iter().next().unwrap());
        }
        let mut iter = turbo_tasks::parallel!(results)?.into_iter();
        if let Some(current) = iter.next() {
            let mut current: ResolveResultBuilder = ReadRef::into_owned(current).into();
            for result in iter {
                // For clippy -- This explicit deref is necessary
                let other = &*result;
                current.merge_alternatives(other);
            }
            Ok(Self::cell(current.into()))
        } else {
            Ok(ResolveResult::unresolvable().cell())
        }
    }

    #[turbo_tasks::function]
    async fn alternatives_with_affecting_sources(
        results: Vec<Vc<ResolveResult>>,
        affecting_sources: Vec<ResolvedVc<Box<dyn Source>>>,
    ) -> Result<Vc<Self>> {
        debug_assert!(
            !affecting_sources.is_empty(),
            "Caller should not call this function if there are no affecting sources"
        );
        if results.len() == 1 {
            return Ok(results
                .into_iter()
                .next()
                .unwrap()
                .with_affecting_sources(affecting_sources.into_iter().map(|src| *src).collect()));
        }
        let mut iter = turbo_tasks::parallel!(results)?.into_iter();
        if let Some(current) = iter.next() {
            let mut current: ResolveResultBuilder = ReadRef::into_owned(current).into();
            for result in iter {
                // For clippy -- This explicit deref is necessary
                let other = &*result;
                current.merge_alternatives(other);
            }
            current.affecting_sources.extend(affecting_sources);
            Ok(Self::cell(current.into()))
        } else {
            Ok(ResolveResult::unresolvable_with_affecting_sources(affecting_sources).cell())
        }
    }

    /// Returns a new [ResolveResult] where all [RequestKey]s are updated. The `old_request_key`
    /// (prefix) is replaced with the `request_key`. It's not expected that the [ResolveResult]
    /// contains [RequestKey]s that don't have the `old_request_key` prefix, but if there are still
    /// some, they are discarded.
    #[turbo_tasks::function]
    fn with_replaced_request_key(
        &self,
        old_request_key: RcStr,
        request_key: RequestKey,
    ) -> Result<Vc<Self>> {
        let new_primary = self
            .primary
            .iter()
            .filter_map(|(k, v)| {
                let remaining = k.request.as_ref()?.strip_prefix(&*old_request_key)?;
                Some((
                    RequestKey {
                        request: request_key
                            .request
                            .as_ref()
                            .map(|r| format!("{r}{remaining}").into()),
                        conditions: request_key.conditions.clone(),
                    },
                    v.clone(),
                ))
            })
            .collect();
        Ok(ResolveResult {
            primary: new_primary,
            affecting_sources: self.affecting_sources.clone(),
        }
        .cell())
    }

    /// Returns a new [ResolveResult] where all [RequestKey]s are updated. The prefix is removed
    /// from all [RequestKey]s. It's not expected that the [ResolveResult] contains [RequestKey]s
    /// without the prefix, but if there are still some, they are discarded.
    #[turbo_tasks::function]
    fn with_stripped_request_key_prefix(&self, prefix: RcStr) -> Result<Vc<Self>> {
        let new_primary = self
            .primary
            .iter()
            .filter_map(|(k, v)| {
                let remaining = k.request.as_ref()?.strip_prefix(&*prefix)?;
                Some((
                    RequestKey {
                        request: Some(remaining.into()),
                        conditions: k.conditions.clone(),
                    },
                    v.clone(),
                ))
            })
            .collect();
        Ok(ResolveResult {
            primary: new_primary,
            affecting_sources: self.affecting_sources.clone(),
        }
        .cell())
    }

    /// Returns a new [ResolveResult] where all [RequestKey]s are updated. All keys matching
    /// `old_request_key` are rewritten according to `request_key`. It's not expected that the
    /// [ResolveResult] contains [RequestKey]s that do not match the `old_request_key` prefix, but
    /// if there are still some, they are discarded.
    #[turbo_tasks::function]
    async fn with_replaced_request_key_pattern(
        &self,
        old_request_key: Vc<Pattern>,
        request_key: Vc<Pattern>,
    ) -> Result<Vc<Self>> {
        let old_request_key = &*turbo_tasks::read!(old_request_key)?;
        let request_key = &*turbo_tasks::read!(request_key)?;

        let new_primary = self
            .primary
            .iter()
            .map(|(k, v)| {
                (
                    RequestKey {
                        request: k
                            .request
                            .as_ref()
                            .and_then(|r| old_request_key.match_apply_template(r, request_key))
                            .map(Into::into),
                        conditions: k.conditions.clone(),
                    },
                    v.clone(),
                )
            })
            .collect();
        Ok(ResolveResult {
            primary: new_primary,
            affecting_sources: self.affecting_sources.clone(),
        }
        .cell())
    }

    /// Returns a new [ResolveResult] where all [RequestKey]s are set to the
    /// passed `request`.
    #[turbo_tasks::function]
    fn with_request(&self, request: RcStr) -> Vc<Self> {
        let new_primary = self
            .primary
            .iter()
            .map(|(k, v)| {
                (
                    RequestKey {
                        request: Some(request.clone()),
                        conditions: k.conditions.clone(),
                    },
                    v.clone(),
                )
            })
            .collect();
        ResolveResult {
            primary: new_primary,
            affecting_sources: self.affecting_sources.clone(),
        }
        .cell()
    }
}

#[turbo_tasks::value(transparent)]
pub struct ResolveResultOption(Option<ResolvedVc<ResolveResult>>);

#[turbo_tasks::value_impl]
impl ResolveResultOption {
    #[turbo_tasks::function]
    pub fn some(result: ResolvedVc<ResolveResult>) -> Vc<Self> {
        ResolveResultOption(Some(result)).cell()
    }

    #[turbo_tasks::function]
    pub fn none() -> Vc<Self> {
        ResolveResultOption(None).cell()
    }
}

turbo_tasks::dual_fn! {
fn exists(
    fs_path: &FileSystemPath,
    refs: Option<&mut Vec<ResolvedVc<Box<dyn Source>>>>,
) -> Result<Option<FileSystemPath>> {
    turbo_tasks::read!(type_exists(fs_path, FileSystemEntryType::File, refs))
}
}

turbo_tasks::dual_fn! {
fn dir_exists(
    fs_path: &FileSystemPath,
    refs: Option<&mut Vec<ResolvedVc<Box<dyn Source>>>>,
) -> Result<Option<FileSystemPath>> {
    turbo_tasks::read!(type_exists(fs_path, FileSystemEntryType::Directory, refs))
}
}

turbo_tasks::dual_fn! {
fn type_exists(
    fs_path: &FileSystemPath,
    ty: FileSystemEntryType,
    refs: Option<&mut Vec<ResolvedVc<Box<dyn Source>>>>,
) -> Result<Option<FileSystemPath>> {
    let path = turbo_tasks::read!(realpath(fs_path, refs))?;
    Ok(if *turbo_tasks::read!(path.get_type())? == ty {
        Some(path)
    } else {
        None
    })
}
}

turbo_tasks::dual_fn! {
fn realpath(
    fs_path: &FileSystemPath,
    refs: Option<&mut Vec<ResolvedVc<Box<dyn Source>>>>,
) -> Result<FileSystemPath> {
    let result = turbo_tasks::read!(fs_path.realpath_with_links())?;
    if let Some(refs) = refs {
        // Sequential on purpose: symlink chains are tiny, and `to_resolved` on a
        // freshly created `FileSource` resolves near-instantly.
        for path in result.symlinks.iter() {
            refs.push(ResolvedVc::upcast(turbo_tasks::read!(
                FileSource::new(path.clone()).to_resolved()
            )?));
        }
    }
    match &result.path_result {
        Ok(path) => Ok(path.clone()),
        Err(e) => bail!(turbo_tasks::read!(e.as_error_message(fs_path, &result))?),
    }
}
}

#[turbo_tasks::value(shared)]
enum ExportsFieldResult {
    Some(#[turbo_tasks(debug_ignore, trace_ignore)] ExportsField),
    None,
}

/// Extracts the "exports" field out of the package.json, parsing it into an
/// appropriate [AliasMap] for lookups.
#[turbo_tasks::function]
async fn exports_field(
    package_json_path: ResolvedVc<Box<dyn Source>>,
) -> Result<Vc<ExportsFieldResult>> {
    let read = turbo_tasks::read!(read_package_json(*package_json_path))?;
    let package_json = match &*read {
        Some(json) => json,
        None => return Ok(ExportsFieldResult::None.cell()),
    };

    let Some(exports) = package_json.get("exports") else {
        return Ok(ExportsFieldResult::None.cell());
    };
    match exports.try_into() {
        Ok(exports) => Ok(ExportsFieldResult::Some(exports).cell()),
        Err(err) => {
            PackageJsonIssue {
                error_message: err.to_string().into(),
                // TODO(PACK-4879): add line column information
                source: IssueSource::from_source_only(package_json_path),
            }
            .resolved_cell()
            .emit();
            Ok(ExportsFieldResult::None.cell())
        }
    }
}

#[turbo_tasks::value(shared)]
enum ImportsFieldResult {
    Some(
        #[turbo_tasks(debug_ignore, trace_ignore)] ImportsField,
        FileSystemPath,
    ),
    None,
}

/// Extracts the "imports" field out of the nearest package.json, parsing it
/// into an appropriate [AliasMap] for lookups.
#[turbo_tasks::function]
async fn imports_field(lookup_path: FileSystemPath) -> Result<Vc<ImportsFieldResult>> {
    // We don't need to collect affecting sources here because we don't use them
    let package_json_context = turbo_tasks::read!(find_context_file(
        lookup_path,
        *turbo_tasks::read!(package_json().to_resolved())?,
        false
    ))?;
    let FindContextFileResult::Found(package_json_path, _refs) = &*package_json_context else {
        return Ok(ImportsFieldResult::None.cell());
    };
    let source = turbo_tasks::read!(
        Vc::upcast::<Box<dyn Source>>(FileSource::new(package_json_path.clone())).to_resolved()
    )?;

    let read = turbo_tasks::read!(read_package_json(*source))?;
    let package_json = match &*read {
        Some(json) => json,
        None => return Ok(ImportsFieldResult::None.cell()),
    };

    let Some(imports) = package_json.get("imports") else {
        return Ok(ImportsFieldResult::None.cell());
    };
    match imports.try_into() {
        Ok(imports) => Ok(ImportsFieldResult::Some(imports, package_json_path.clone()).cell()),
        Err(err) => {
            PackageJsonIssue {
                error_message: err.to_string().into(),
                // TODO(PACK-4879): Add line-column information
                source: IssueSource::from_source_only(source),
            }
            .resolved_cell()
            .emit();
            Ok(ImportsFieldResult::None.cell())
        }
    }
}

#[turbo_tasks::function]
pub fn package_json() -> Vc<Vec<RcStr>> {
    Vc::cell(vec![rcstr!("package.json")])
}

#[turbo_tasks::value(shared)]
pub enum FindContextFileResult {
    Found(FileSystemPath, Vec<ResolvedVc<Box<dyn Source>>>),
    NotFound(Vec<ResolvedVc<Box<dyn Source>>>),
}

#[turbo_tasks::function]
pub async fn find_context_file(
    lookup_path: FileSystemPath,
    names: Vc<Vec<RcStr>>,
    collect_affecting_sources: bool,
) -> Result<Vc<FindContextFileResult>> {
    let mut refs = Vec::new();
    for name in &*turbo_tasks::read!(names)? {
        let fs_path = lookup_path.join(name)?;
        if let Some(fs_path) = turbo_tasks::read!(exists(
            &fs_path,
            if collect_affecting_sources {
                Some(&mut refs)
            } else {
                None
            },
        ))? {
            return Ok(FindContextFileResult::Found(fs_path, refs).cell());
        }
    }
    if lookup_path.is_root() {
        return Ok(FindContextFileResult::NotFound(refs).cell());
    }
    if refs.is_empty() {
        // Tailcall
        Ok(find_context_file(
            lookup_path.parent(),
            names,
            collect_affecting_sources,
        ))
    } else {
        let parent_result = turbo_tasks::read!(find_context_file(
            lookup_path.parent(),
            names,
            collect_affecting_sources
        ))?;
        Ok(match &*parent_result {
            FindContextFileResult::Found(p, r) => {
                refs.extend(r.iter().copied());
                FindContextFileResult::Found(p.clone(), refs)
            }
            FindContextFileResult::NotFound(r) => {
                refs.extend(r.iter().copied());
                FindContextFileResult::NotFound(refs)
            }
        }
        .cell())
    }
}

// Same as find_context_file, but also stop for package.json with the specified key
// This function never collects affecting sources
#[turbo_tasks::function]
pub async fn find_context_file_or_package_key(
    lookup_path: FileSystemPath,
    names: Vc<Vec<RcStr>>,
    package_key: RcStr,
) -> Result<Vc<FindContextFileResult>> {
    let package_json_path = lookup_path.join("package.json")?;
    if let Some(package_json_path) = turbo_tasks::read!(exists(&package_json_path, None))?
        && let Some(json) = &*turbo_tasks::read!(read_package_json(Vc::upcast(FileSource::new(
            package_json_path.clone()
        ))))?
        && json.get(&*package_key).is_some()
    {
        return Ok(FindContextFileResult::Found(package_json_path, Vec::new()).cell());
    }
    for name in &*turbo_tasks::read!(names)? {
        let fs_path = lookup_path.join(name)?;
        if let Some(fs_path) = turbo_tasks::read!(exists(&fs_path, None))? {
            return Ok(FindContextFileResult::Found(fs_path, Vec::new()).cell());
        }
    }
    if lookup_path.is_root() {
        return Ok(FindContextFileResult::NotFound(Vec::new()).cell());
    }

    Ok(find_context_file(lookup_path.parent(), names, false))
}

#[derive(Clone, PartialEq, Eq, TraceRawVcs, Debug, NonLocalValue, Encode, Decode)]
enum FindPackageItem {
    PackageDirectory { name: RcStr, dir: FileSystemPath },
    PackageFile { name: RcStr, file: FileSystemPath },
}

#[turbo_tasks::value]
#[derive(Debug)]
struct FindPackageResult {
    packages: Vec<FindPackageItem>,
    // Only populated if collect_affecting_sources is true
    affecting_sources: Vec<ResolvedVc<Box<dyn Source>>>,
}

#[turbo_tasks::function]
async fn find_package(
    lookup_path: FileSystemPath,
    package_name: Pattern,
    options: Vc<ResolveModulesOptions>,
    collect_affecting_sources: bool,
) -> Result<Vc<FindPackageResult>> {
    let mut packages = vec![];
    let mut affecting_sources = vec![];
    let options = turbo_tasks::read!(options)?;
    let package_name_cell = Pattern::new(package_name.clone());

    fn get_package_name(basepath: &FileSystemPath, package_dir: &FileSystemPath) -> Result<RcStr> {
        if let Some(name) = basepath.get_path_to(package_dir) {
            Ok(name.into())
        } else {
            bail!("Package directory {package_dir} is not inside the lookup path {basepath}",);
        }
    }

    for resolve_modules in &options.modules {
        match resolve_modules {
            ResolveModules::Nested(root, names) => {
                let mut lookup_path = lookup_path.clone();
                let mut lookup_path_value = lookup_path.clone();
                while lookup_path_value.is_inside_ref(root) {
                    for name in names.iter() {
                        let fs_path = lookup_path.join(name)?;
                        if let Some(fs_path) = turbo_tasks::read!(dir_exists(
                            &fs_path,
                            collect_affecting_sources.then_some(&mut affecting_sources),
                        ))? {
                            let matches = turbo_tasks::read!(read_matches(
                                fs_path.clone(),
                                rcstr!(""),
                                true,
                                package_name_cell
                            ))?;
                            for m in &*matches {
                                if let PatternMatch::Directory(_, package_dir) = m {
                                    packages.push(FindPackageItem::PackageDirectory {
                                        name: get_package_name(&fs_path, package_dir)?,
                                        dir: turbo_tasks::read!(realpath(
                                            package_dir,
                                            collect_affecting_sources
                                                .then_some(&mut affecting_sources),
                                        ))?,
                                    });
                                }
                            }
                        }
                    }
                    lookup_path = lookup_path.parent();
                    let new_context_value = lookup_path.clone();
                    if new_context_value == lookup_path_value {
                        break;
                    }
                    lookup_path_value = new_context_value;
                }
            }
            ResolveModules::Path {
                dir,
                excluded_extensions,
            } => {
                let matches = turbo_tasks::read!(read_matches(
                    dir.clone(),
                    rcstr!(""),
                    true,
                    package_name_cell
                ))?;
                for m in &*matches {
                    match m {
                        PatternMatch::Directory(_, package_dir) => {
                            packages.push(FindPackageItem::PackageDirectory {
                                name: get_package_name(dir, package_dir)?,
                                dir: turbo_tasks::read!(realpath(
                                    package_dir,
                                    collect_affecting_sources.then_some(&mut affecting_sources),
                                ))?,
                            });
                        }
                        PatternMatch::File(_, package_file) => {
                            packages.push(FindPackageItem::PackageFile {
                                name: get_package_name(dir, package_file)?,
                                file: turbo_tasks::read!(realpath(
                                    package_file,
                                    collect_affecting_sources.then_some(&mut affecting_sources),
                                ))?,
                            });
                        }
                    }
                }

                let excluded_extensions = turbo_tasks::read!(excluded_extensions)?;
                let mut package_name_with_extensions = package_name.clone();
                package_name_with_extensions.push(Pattern::alternatives(
                    options
                        .extensions
                        .iter()
                        .filter(|ext| !excluded_extensions.contains(*ext))
                        .cloned()
                        .map(Pattern::from),
                ));
                let package_name_with_extensions = Pattern::new(package_name_with_extensions);

                let matches = turbo_tasks::read!(read_matches(
                    dir.clone(),
                    rcstr!(""),
                    true,
                    package_name_with_extensions
                ))?;
                for m in &matches {
                    if let PatternMatch::File(_, package_file) = m {
                        packages.push(FindPackageItem::PackageFile {
                            name: get_package_name(dir, package_file)?,
                            file: turbo_tasks::read!(realpath(
                                package_file,
                                collect_affecting_sources.then_some(&mut affecting_sources),
                            ))?,
                        });
                    }
                }
            }
        }
    }
    Ok(FindPackageResult::cell(FindPackageResult {
        packages,
        affecting_sources,
    }))
}

fn merge_results(results: Vec<Vc<ResolveResult>>) -> Vc<ResolveResult> {
    match results.len() {
        0 => ResolveResult::unresolvable().cell(),
        1 => results.into_iter().next().unwrap(),
        _ => ResolveResult::alternatives(results),
    }
}

fn merge_results_with_affecting_sources(
    results: Vec<Vc<ResolveResult>>,
    affecting_sources: Vec<ResolvedVc<Box<dyn Source>>>,
) -> Vc<ResolveResult> {
    if affecting_sources.is_empty() {
        return merge_results(results);
    }
    match results.len() {
        0 => ResolveResult::unresolvable_with_affecting_sources(affecting_sources).cell(),
        1 => results
            .into_iter()
            .next()
            .unwrap()
            .with_affecting_sources(affecting_sources.into_iter().map(|src| *src).collect()),
        _ => ResolveResult::alternatives_with_affecting_sources(
            results,
            affecting_sources.into_iter().map(|src| *src).collect(),
        ),
    }
}

// Resolves the pattern
#[turbo_tasks::function]
pub async fn resolve_raw(
    lookup_dir: FileSystemPath,
    path: Vc<Pattern>,
    collect_affecting_sources: bool,
    force_in_lookup_dir: bool,
) -> Result<Vc<ResolveResult>> {
    turbo_tasks::dual_fn! {
    fn to_result(
        request: RcStr,
        path: &FileSystemPath,
        collect_affecting_sources: bool,
    ) -> Result<ResolveResult> {
        let result = &*turbo_tasks::read!(path.realpath_with_links())?;
        let path = match &result.path_result {
            Ok(path) => path,
            Err(e) => bail!(turbo_tasks::read!(e.as_error_message(path, result))?),
        };
        let request_key = RequestKey::new(request);
        let source =
            ResolvedVc::upcast(turbo_tasks::read!(FileSource::new(path.clone()).to_resolved())?);
        Ok(if collect_affecting_sources {
            // Sequential on purpose: symlink chains are tiny, and `to_resolved` on a
            // freshly created `FileSource` resolves near-instantly.
            let mut affecting_sources = Vec::with_capacity(result.symlinks.len());
            for symlink in result.symlinks.iter() {
                affecting_sources.push(turbo_tasks::read!(
                    Vc::upcast::<Box<dyn Source>>(FileSource::new(symlink.clone())).to_resolved()
                )?);
            }
            ResolveResult::source_with_affecting_sources(request_key, source, affecting_sources)
        } else {
            ResolveResult::source_with_key(request_key, source)
        })
    }
    }

    turbo_tasks::dual_fn! {
    fn collect_matches(
        matches: &[PatternMatch],
        collect_affecting_sources: bool,
    ) -> Result<Vec<Vc<ResolveResult>>> {
        // Sequential on purpose (was `try_flat_join`): each `to_result` is a couple of
        // fast task reads, and resolving them in order keeps the cells below constructed
        // in a deterministic order in both modes.
        let mut resolved_results = Vec::new();
        for m in matches.iter() {
            if let PatternMatch::File(request, path) = m {
                resolved_results.push(turbo_tasks::read!(to_result(
                    request.clone(),
                    path,
                    collect_affecting_sources
                ))?);
            }
        }
        // Construct all the cells after resolving the results to ensure they are constructed in
        // a deterministic order.
        Ok(resolved_results.into_iter().map(|res| res.cell()).collect())
    }
    }

    let mut results = Vec::new();

    let pat = turbo_tasks::read!(path)?;
    if let Some(pat) = pat
        .filter_could_match("/ROOT/")
        // Checks if this pattern is more specific than everything, so we test using a random path
        // that is unlikely to actually exist
        .and_then(|pat| pat.filter_could_not_match("/ROOT/fsd8nz8og54z"))
    {
        let path = Pattern::new(pat);
        let matches = turbo_tasks::read!(read_matches(
            turbo_tasks::read!(lookup_dir.root().owned())?,
            rcstr!("/ROOT/"),
            true,
            path,
        ))?;
        results.extend(turbo_tasks::read!(collect_matches(
            &matches,
            collect_affecting_sources
        ))?);
    }

    {
        let matches = turbo_tasks::read!(read_matches(
            lookup_dir.clone(),
            rcstr!(""),
            force_in_lookup_dir,
            path
        ))?;

        results.extend(turbo_tasks::read!(collect_matches(
            &matches,
            collect_affecting_sources
        ))?);
    }

    Ok(merge_results(results))
}

#[turbo_tasks::function]
pub async fn resolve(
    lookup_path: FileSystemPath,
    reference_type: ReferenceType,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
) -> Result<Vc<ResolveResult>> {
    turbo_tasks::read!(resolve_inline(
        lookup_path,
        reference_type,
        request,
        options
    ))
}

turbo_tasks::dual_fn! {
pub fn resolve_inline(
    lookup_path: FileSystemPath,
    reference_type: ReferenceType,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
) -> Result<Vc<ResolveResult>> {
    let span = tracing::info_span!(
        "resolving",
        lookup_path = display(turbo_tasks::read!(lookup_path.to_string_ref())?),
        name = tracing::field::Empty,
        reference_type = display(&reference_type),
    );
    if !span.is_disabled() {
        // You can't await multiple times in the span macro call parameters.
        span.record("name", turbo_tasks::read!(request.to_string())?.as_str());
    }

    #[cfg(not(feature = "sync"))]
    let result = resolve_inline_inner(lookup_path, reference_type, request, options)
        .instrument(span)
        .await;
    #[cfg(feature = "sync")]
    let result = {
        let _enter = span.entered();
        resolve_inline_inner(lookup_path, reference_type, request, options)
    };
    result
}
}

turbo_tasks::dual_fn! {
/// The uninstrumented body of [`resolve_inline`] (split out so both modes can wrap it
/// in the tracing span).
fn resolve_inline_inner(
    lookup_path: FileSystemPath,
    reference_type: ReferenceType,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
) -> Result<Vc<ResolveResult>> {
    // Pre-fetch options once to avoid repeated await calls
    let options_value = turbo_tasks::read!(options)?;

    // Fast path: skip plugin handling if no plugins are configured
    let has_before_plugins = !options_value.before_resolve_plugins.is_empty();
    let has_after_plugins = !options_value.after_resolve_plugins.is_empty();

    let before_plugins_result = if has_before_plugins {
        turbo_tasks::read!(handle_before_resolve_plugins(
            lookup_path.clone(),
            reference_type.clone(),
            request,
            options,
        ))?
    } else {
        None
    };

    let raw_result = match before_plugins_result {
        Some(result) => result,
        None => {
            *turbo_tasks::read!(resolve_internal(lookup_path.clone(), request, options)
                .to_resolved())?
        }
    };

    let result = if has_after_plugins {
        turbo_tasks::read!(handle_after_resolve_plugins(
            lookup_path,
            reference_type,
            request,
            options,
            raw_result
        ))?
    } else {
        raw_result
    };

    Ok(result)
}
}

#[turbo_tasks::function]
pub async fn url_resolve(
    origin: Vc<Box<dyn ResolveOrigin>>,
    request: ResolvedVc<Request>,
    reference_type: ReferenceType,
    issue_source: Option<IssueSource>,
    error_mode: ResolveErrorMode,
) -> Result<Vc<ModuleResolveResult>> {
    let origin_ref = turbo_tasks::read!(origin.into_trait_ref())?;
    let resolve_options = origin_ref.resolve_options();
    let rel_request = request.as_relative();
    let origin_path = origin_ref.origin_path();
    let origin_path_parent = origin_path.parent();
    let rel_result = resolve(
        origin_path_parent.clone(),
        reference_type.clone(),
        rel_request,
        resolve_options,
    );
    let result = if turbo_tasks::read!(rel_result)?.is_unresolvable()
        && turbo_tasks::read!(rel_request.to_resolved())? != request
    {
        let result = resolve(
            origin_path_parent,
            reference_type.clone(),
            *request,
            resolve_options,
        );
        if turbo_tasks::read!(resolve_options)?.collect_affecting_sources {
            result.with_affecting_sources(
                turbo_tasks::read!(rel_result)?
                    .get_affecting_sources()
                    .map(|src| *src)
                    .collect(),
            )
        } else {
            result
        }
    } else {
        rel_result
    };
    let result = origin_ref
        .asset_context()
        .process_resolve_result(result, reference_type.clone());
    turbo_tasks::read!(handle_resolve_error(
        result,
        reference_type,
        origin_path,
        *request,
        resolve_options,
        error_mode,
        issue_source,
    ))
}

#[turbo_tasks::value(transparent)]
struct MatchingBeforeResolvePlugins(Vec<ResolvedVc<Box<dyn BeforeResolvePlugin>>>);

#[turbo_tasks::function]
async fn get_matching_before_resolve_plugins(
    options: Vc<ResolveOptions>,
    request: Vc<Request>,
) -> Result<Vc<MatchingBeforeResolvePlugins>> {
    let request_ref = turbo_tasks::read!(request)?;
    // Sequential on purpose (was `try_flat_join`): plugin lists are tiny and each
    // condition read is cheap.
    let mut matching_plugins = Vec::new();
    for plugin in turbo_tasks::read!(options)?.before_resolve_plugins.iter() {
        if turbo_tasks::read!(
            turbo_tasks::read!(plugin.into_trait_ref())?.before_resolve_condition()
        )?
        .matches(&request_ref)
        {
            matching_plugins.push(*plugin);
        }
    }
    Ok(Vc::cell(matching_plugins))
}

turbo_tasks::dual_fn! {
#[tracing::instrument(level = "trace", skip_all)]
fn handle_before_resolve_plugins(
    lookup_path: FileSystemPath,
    reference_type: ReferenceType,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
) -> Result<Option<Vc<ResolveResult>>> {
    for plugin in turbo_tasks::read!(get_matching_before_resolve_plugins(options, request))? {
        if let Some(result) = *turbo_tasks::read!(plugin
            .before_resolve(lookup_path.clone(), reference_type.clone(), request))?
        {
            return Ok(Some(*result));
        }
    }
    Ok(None)
}
}

turbo_tasks::dual_fn! {
#[tracing::instrument(level = "trace", skip_all)]
fn handle_after_resolve_plugins(
    lookup_path: FileSystemPath,
    reference_type: ReferenceType,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
    result: Vc<ResolveResult>,
) -> Result<Vc<ResolveResult>> {
    // Pre-fetch options to avoid repeated await calls in the inner loop
    let options_value = turbo_tasks::read!(options)?;

    // Pre-resolve all plugin conditions once to avoid repeated resolve calls in the loop.
    // Sequential on purpose (was `try_join`): plugin lists are tiny.
    let mut resolved_conditions = Vec::with_capacity(options_value.after_resolve_plugins.len());
    for p in options_value.after_resolve_plugins.iter() {
        let condition =
            turbo_tasks::read!(turbo_tasks::read!(p.into_trait_ref())?.after_resolve_condition())?;
        resolved_conditions.push((*p, condition));
    }

    turbo_tasks::dual_fn! {
    fn apply_plugins_to_path(
        path: FileSystemPath,
        lookup_path: FileSystemPath,
        reference_type: ReferenceType,
        request: Vc<Request>,
        plugins_with_conditions: &[AfterResolvePluginWithCondition],
    ) -> Result<Option<Vc<ResolveResult>>> {
        for (plugin, after_resolve_condition) in plugins_with_conditions {
            if after_resolve_condition.matches(&path)
                && let Some(result) = *turbo_tasks::read!(plugin
                    .after_resolve(
                        path.clone(),
                        lookup_path.clone(),
                        reference_type.clone(),
                        request,
                    ))?
            {
                return Ok(Some(*result));
            }
        }
        Ok(None)
    }
    }

    let mut changed = false;
    let result_value = turbo_tasks::read!(result)?;

    let mut new_primary = FxIndexMap::default();
    let mut new_affecting_sources = Vec::new();

    for (key, primary) in result_value.primary.iter() {
        if let &ResolveResultItem::Source(source) = primary {
            let path = turbo_tasks::read!(source.ident())?.path.clone();
            if let Some(new_result) = turbo_tasks::read!(apply_plugins_to_path(
                path,
                lookup_path.clone(),
                reference_type.clone(),
                request,
                &resolved_conditions,
            ))?
            {
                let new_result = turbo_tasks::read!(new_result)?;
                changed = true;
                new_primary.extend(
                    new_result
                        .primary
                        .iter()
                        .map(|(_, item)| (key.clone(), item.clone())),
                );
                new_affecting_sources.extend(new_result.affecting_sources.iter().copied());
            } else {
                new_primary.insert(key.clone(), primary.clone());
            }
        } else {
            new_primary.insert(key.clone(), primary.clone());
        }
    }

    if !changed {
        return Ok(result);
    }

    let mut affecting_sources = result_value.affecting_sources.to_vec();
    affecting_sources.append(&mut new_affecting_sources);

    Ok(ResolveResult {
        primary: new_primary.into_iter().collect(),
        affecting_sources: affecting_sources.into_boxed_slice(),
    }
    .cell())
}
}

#[turbo_tasks::function]
async fn resolve_internal(
    lookup_path: FileSystemPath,
    request: ResolvedVc<Request>,
    options: ResolvedVc<ResolveOptions>,
) -> Result<Vc<ResolveResult>> {
    turbo_tasks::read!(resolve_internal_inline(
        lookup_path.clone(),
        *request,
        *options
    ))
}

turbo_tasks::dual_fn! {
fn resolve_internal_inline(
    lookup_path: FileSystemPath,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
) -> Result<Vc<ResolveResult>> {
    let span = tracing::info_span!(
        "internal resolving",
        lookup_path = display(turbo_tasks::read!(lookup_path.to_string_ref())?),
        name = tracing::field::Empty
    );
    if !span.is_disabled() {
        // You can't await multiple times in the span macro call parameters.
        span.record("name", turbo_tasks::read!(request.to_string())?.as_str());
    }

    #[cfg(not(feature = "sync"))]
    let result = resolve_internal_inline_inner(lookup_path, request, options)
        .instrument(span)
        .await;
    #[cfg(feature = "sync")]
    let result = {
        let _enter = span.entered();
        resolve_internal_inline_inner(lookup_path, request, options)
    };
    result
}
}

/// Recursion helper for [`resolve_internal_inline`]: the async build must box the
/// recursive future ([`Box::pin`]); the sync build simply recurses on the worker stack.
#[cfg(not(feature = "sync"))]
async fn resolve_internal_inline_boxed(
    lookup_path: FileSystemPath,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
) -> Result<Vc<ResolveResult>> {
    Box::pin(resolve_internal_inline(lookup_path, request, options)).await
}

/// See the async definition above: plain recursion, no boxing needed.
#[cfg(feature = "sync")]
fn resolve_internal_inline_boxed(
    lookup_path: FileSystemPath,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
) -> Result<Vc<ResolveResult>> {
    resolve_internal_inline(lookup_path, request, options)
}

turbo_tasks::dual_fn! {
/// The uninstrumented body of [`resolve_internal_inline`] (split out so both modes can
/// wrap it in the tracing span).
fn resolve_internal_inline_inner(
    lookup_path: FileSystemPath,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
) -> Result<Vc<ResolveResult>> {
    let options_value: &ResolveOptions = &*turbo_tasks::read!(options)?;

    let request_value = turbo_tasks::read!(request)?;

    // Apply import mappings if provided
    let mut has_alias = false;
    if let Some(import_map) = &options_value.import_map {
        let request_parts = match &*request_value {
            Request::Alternatives { requests } => requests.as_slice(),
            _ => &[turbo_tasks::read!(request.to_resolved())?],
        };
        for &request in request_parts {
            let result = turbo_tasks::read!(turbo_tasks::read!(import_map)?
                .lookup(lookup_path.clone(), *request))?;
            if !matches!(result, ImportMapResult::NoEntry) {
                has_alias = true;
                let resolved_result = turbo_tasks::read!(resolve_import_map_result(
                    &result,
                    lookup_path.clone(),
                    lookup_path.clone(),
                    *request,
                    options,
                    turbo_tasks::read!(request.query().owned())?,
                ))?;
                // We might have matched an alias in the import map, but there is no guarantee
                // the alias actually resolves to something. For instance, a tsconfig.json
                // `compilerOptions.paths` option might alias "@*" to "./*", which
                // would also match a request to "@emotion/core". Here, we follow what the
                // Typescript resolution algorithm does in case an alias match
                // doesn't resolve to anything: fall back to resolving the request normally.
                if let Some(resolved_result) = resolved_result {
                    let resolved_result = turbo_tasks::read!(resolved_result.into_cell_if_resolvable())?;
                    if let Some(result) = resolved_result {
                        return Ok(result);
                    }
                }
            }
        }
    }

    let result = match &*request_value {
        Request::Dynamic => ResolveResult::unresolvable().cell(),
        Request::Alternatives { requests } => {
            #[cfg(not(feature = "sync"))]
            let results = turbo_tasks::read!(requests
                .iter()
                .map(|req| resolve_internal_inline_boxed(lookup_path.clone(), **req, options))
                .try_join())?;
            #[cfg(feature = "sync")]
            let results = {
                // Sequential on purpose: recursive resolution of the alternatives.
                let mut results = Vec::with_capacity(requests.len());
                for req in requests.iter() {
                    results.push(resolve_internal_inline_boxed(
                        lookup_path.clone(),
                        **req,
                        options,
                    )?);
                }
                results
            };

            merge_results(results)
        }
        Request::Raw {
            path,
            query,
            force_in_lookup_dir,
            fragment,
        } => {
            let mut results = Vec::new();
            let matches = turbo_tasks::read!(read_matches(
                lookup_path.clone(),
                rcstr!(""),
                *force_in_lookup_dir,
                *turbo_tasks::read!(Pattern::new(path.clone()).to_resolved())?,
            ))?;

            for m in matches.iter() {
                match m {
                    PatternMatch::File(matched_pattern, path) => {
                        results.push(
                            turbo_tasks::read!(resolved(
                                RequestKey::new(matched_pattern.clone()),
                                path.clone(),
                                lookup_path.clone(),
                                request,
                                options_value,
                                options,
                                query.clone(),
                                fragment.clone(),
                            ))?
                            .into_cell(),
                        );
                    }
                    PatternMatch::Directory(matched_pattern, path) => {
                        results.push(
                            resolve_into_folder(path.clone(), options)
                                .with_request(matched_pattern.clone()),
                        );
                    }
                }
            }

            merge_results(results)
        }
        Request::Relative {
            path,
            query,
            force_in_lookup_dir,
            fragment,
        } => {
            turbo_tasks::read!(resolve_relative_request(
                lookup_path.clone(),
                request,
                options,
                options_value,
                path,
                query.clone(),
                *force_in_lookup_dir,
                fragment.clone(),
            ))?
        }
        Request::Module {
            module,
            path,
            query,
            fragment,
        } => {
            turbo_tasks::read!(resolve_module_request(
                lookup_path.clone(),
                request,
                options,
                options_value,
                module,
                path,
                query.clone(),
                fragment.clone(),
            ))?
        }
        Request::ServerRelative {
            path,
            query,
            fragment,
        } => {
            let mut new_pat = path.clone();
            new_pat.push_front(rcstr!(".").into());
            let relative = Request::relative(new_pat, query.clone(), fragment.clone(), true);

            if !has_alias {
                ResolvingIssue {
                    severity: turbo_tasks::read!(resolve_error_severity(options))?,
                    request_type: "server relative import: not implemented yet".to_string(),
                    request: turbo_tasks::read!(relative.to_resolved())?,
                    file_path: lookup_path.clone(),
                    resolve_options: turbo_tasks::read!(options.to_resolved())?,
                    error_message: Some(
                        "server relative imports are not implemented yet. Please try an \
                         import relative to the file you are importing from."
                            .to_string(),
                    ),
                    source: None,
                }
                .resolved_cell()
                .emit();
            }

            turbo_tasks::read!(resolve_internal_inline_boxed(
                turbo_tasks::read!(lookup_path.root().owned())?,
                relative,
                options,
            ))?
        }
        Request::Windows {
            path: _,
            query: _,
            fragment: _,
        } => {
            if !has_alias {
                ResolvingIssue {
                    severity: turbo_tasks::read!(resolve_error_severity(options))?,
                    request_type: "windows import: not implemented yet".to_string(),
                    request: turbo_tasks::read!(request.to_resolved())?,
                    file_path: lookup_path.clone(),
                    resolve_options: turbo_tasks::read!(options.to_resolved())?,
                    error_message: Some("windows imports are not implemented yet".to_string()),
                    source: None,
                }
                .resolved_cell()
                .emit();
            }

            ResolveResult::unresolvable().cell()
        }
        Request::Empty => ResolveResult::unresolvable().cell(),
        Request::PackageInternal { path } => {
            let (conditions, unspecified_conditions) = options_value
                .in_package
                .iter()
                .find_map(|item| match item {
                    ResolveInPackage::ImportsField {
                        conditions,
                        unspecified_conditions,
                    } => Some((Cow::Borrowed(conditions), *unspecified_conditions)),
                    _ => None,
                })
                .unwrap_or_else(|| (Default::default(), ConditionValue::Unset));
            turbo_tasks::read!(resolve_package_internal_with_imports_field(
                lookup_path.clone(),
                request,
                options,
                path,
                &conditions,
                &unspecified_conditions,
            ))?
        }
        Request::DataUri {
            media_type,
            encoding,
            data,
        } => {
            // Behave like Request::Uri
            let uri: RcStr = turbo_tasks::read!(stringify_data_uri(media_type, encoding, *data))?
                .into();
            if options_value.parse_data_uris {
                ResolveResult::primary_with_key(
                    RequestKey::new(uri.clone()),
                    ResolveResultItem::Source(ResolvedVc::upcast(
                        turbo_tasks::read!(DataUriSource::new(
                            media_type.clone(),
                            encoding.clone(),
                            **data,
                            lookup_path.clone(),
                        )
                        .to_resolved())
                        ?,
                    )),
                )
                .cell()
            } else {
                ResolveResult::primary_with_key(
                    RequestKey::new(uri.clone()),
                    ResolveResultItem::External {
                        name: uri,
                        ty: ExternalType::Url,
                        traced: ExternalTraced::Untraced,
                        target: None,
                    },
                )
                .cell()
            }
        }
        Request::Uri {
            protocol,
            remainder,
            query: _,
            fragment: _,
        } => {
            let uri: RcStr = format!("{protocol}{remainder}").into();
            ResolveResult::primary_with_key(
                RequestKey::new(uri.clone()),
                ResolveResultItem::External {
                    name: uri,
                    ty: ExternalType::Url,
                    traced: ExternalTraced::Untraced,
                    target: None,
                },
            )
            .cell()
        }
        Request::Unknown { path } => {
            if !has_alias {
                ResolvingIssue {
                    severity: turbo_tasks::read!(resolve_error_severity(options))?,
                    request_type: format!("unknown import: `{}`", path.describe_as_string()),
                    request: turbo_tasks::read!(request.to_resolved())?,
                    file_path: lookup_path.clone(),
                    resolve_options: turbo_tasks::read!(options.to_resolved())?,
                    error_message: None,
                    source: None,
                }
                .resolved_cell()
                .emit();
            }
            ResolveResult::unresolvable().cell()
        }
    };

    // The individual variants inside the alternative already looked at the fallback import
    // map in the recursive `resolve_internal_inline` calls
    if !matches!(*request_value, Request::Alternatives { .. }) {
        // Apply fallback import mappings if provided
        if let Some(import_map) = &options_value.fallback_import_map
            && turbo_tasks::read!(result)?.is_unresolvable()
        {
            let result = turbo_tasks::read!(turbo_tasks::read!(import_map)?
                .lookup(lookup_path.clone(), request))?;
            let resolved_result = turbo_tasks::read!(resolve_import_map_result(
                &result,
                lookup_path.clone(),
                lookup_path.clone(),
                request,
                options,
                turbo_tasks::read!(request.query().owned())?,
            ))?;
            if let Some(resolved_result) = resolved_result {
                let resolved_result = turbo_tasks::read!(resolved_result.into_cell_if_resolvable())?;
                if let Some(result) = resolved_result {
                    return Ok(result);
                }
            }
        }
    }

    Ok(result)
}
}

#[turbo_tasks::function]
async fn resolve_into_folder(
    package_path: FileSystemPath,
    options: Vc<ResolveOptions>,
) -> Result<Vc<ResolveResult>> {
    let options_value = turbo_tasks::read!(options)?;

    let mut affecting_sources = vec![];
    if let Some(package_json_path) = turbo_tasks::read!(exists(
        &package_path.join("package.json")?,
        if options_value.collect_affecting_sources {
            Some(&mut affecting_sources)
        } else {
            None
        },
    ))? {
        for resolve_into_package in options_value.into_package.iter() {
            match resolve_into_package {
                ResolveIntoPackage::MainField { field: name } => {
                    if let Some(package_json) = &*turbo_tasks::read!(read_package_json(
                        Vc::upcast(FileSource::new(package_json_path.clone()))
                    ))? && let Some(field_value) = package_json[name.as_str()].as_str()
                    {
                        let normalized_request = RcStr::from(normalize_request(field_value));
                        if normalized_request.is_empty()
                            || &*normalized_request == "."
                            || &*normalized_request == "./"
                        {
                            continue;
                        }
                        let request = Request::parse_string(normalized_request);

                        // main field will always resolve not fully specified
                        let options = if options_value.fully_specified {
                            *turbo_tasks::read!(options.with_fully_specified(false).to_resolved())?
                        } else {
                            options
                        };
                        let result = &*turbo_tasks::read!(turbo_tasks::read!(
                            resolve_internal_inline(package_path.clone(), request, options)
                        )?)?;
                        // we are not that strict when a main field fails to resolve
                        // we continue to try other alternatives
                        if !result.is_unresolvable() {
                            let mut result: ResolveResultBuilder =
                                result.with_request_ref(rcstr!(".")).into();
                            if options_value.collect_affecting_sources {
                                result.affecting_sources.push(ResolvedVc::upcast(
                                    turbo_tasks::read!(
                                        FileSource::new(package_json_path).to_resolved()
                                    )?,
                                ));
                                result.affecting_sources.extend(affecting_sources);
                            }
                            return Ok(ResolveResult::from(result).cell());
                        }
                    };
                }
                ResolveIntoPackage::ExportsField { .. } => {}
            }
        }
    }

    if options_value.fully_specified {
        return Ok(ResolveResult::unresolvable_with_affecting_sources(affecting_sources).cell());
    }

    // fall back to dir/index.[js,ts,...]
    let pattern = match &options_value.default_files[..] {
        [] => {
            return Ok(
                ResolveResult::unresolvable_with_affecting_sources(affecting_sources).cell(),
            );
        }
        [file] => Pattern::Constant(format!("./{file}").into()),
        files => Pattern::Alternatives(
            files
                .iter()
                .map(|file| Pattern::Constant(format!("./{file}").into()))
                .collect(),
        ),
    };

    let request = Request::parse(pattern);
    let result = turbo_tasks::read!(resolve_internal_inline(
        package_path.clone(),
        request,
        options
    ))?
    .with_request(rcstr!("."));

    Ok(if !affecting_sources.is_empty() {
        result.with_affecting_sources(ResolvedVc::deref_vec(affecting_sources))
    } else {
        result
    })
}

turbo_tasks::dual_fn! {
#[tracing::instrument(level = Level::TRACE, skip_all)]
fn resolve_relative_request(
    lookup_path: FileSystemPath,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
    options_value: &ResolveOptions,
    path_pattern: &Pattern,
    query: RcStr,
    force_in_lookup_dir: bool,
    fragment: RcStr,
) -> Result<Vc<ResolveResult>> {
    debug_assert!(query.is_empty() || query.starts_with("?"));
    debug_assert!(fragment.is_empty() || fragment.starts_with("#"));
    // Check alias field for aliases first
    let lookup_path_ref = lookup_path.clone();
    if let Some(result) = turbo_tasks::read!(apply_in_package(
        lookup_path.clone(),
        options,
        options_value,
        |package_path| {
            let request = path_pattern.as_constant_string()?;
            let prefix_path = package_path.get_path_to(&lookup_path_ref)?;
            let request = normalize_request(&format!("./{prefix_path}/{request}"));
            Some(request.into())
        },
        query.clone(),
        fragment.clone(),
    ))?
    {
        return Ok(result.into_cell());
    }

    let mut new_path = path_pattern.clone();

    // A small tree to 'undo' the set of modifications we make to patterns, ensuring that we produce
    // correct request keys
    #[derive(Eq, PartialEq, Clone, Hash, Debug)]
    enum RequestKeyTransform {
        /// A leaf node for 'no change'
        None,
        /// We added a fragment to the request and thus need to potentially remove it when matching
        AddedFragment,
        // We added an extension to the request and thus need to potentially remove it when
        // matching
        AddedExtension {
            /// The extension that was added
            ext: RcStr,
            /// This modification can be composed with others
            /// In reality just `None' or `AddedFragment``
            next: Vec<RequestKeyTransform>,
        },
        ReplacedExtension {
            /// The extension that was replaced, to figure out the original you need to query
            /// [TS_EXTENSION_REPLACEMENTS]
            ext: RcStr,
            /// This modification can be composed with others
            /// In just [AddedExtension], [None] or [AddedFragment]
            next: Vec<RequestKeyTransform>,
        },
    }

    impl RequestKeyTransform {
        /// Modifies the matched pattern using the modification rules and produces results if they
        /// match the supplied [pattern]
        fn undo(
            &self,
            matched_pattern: &RcStr,
            fragment: &RcStr,
            pattern: &Pattern,
        ) -> impl Iterator<Item = (RcStr, RcStr)> {
            let mut result = SmallVec::new();
            self.apply_internal(matched_pattern, fragment, pattern, &mut result);
            result.into_iter()
        }

        fn apply_internal(
            &self,
            matched_pattern: &RcStr,
            fragment: &RcStr,
            pattern: &Pattern,
            result: &mut SmallVec<[(RcStr, RcStr); 2]>,
        ) {
            match self {
                RequestKeyTransform::None => {
                    if pattern.is_match(matched_pattern.as_str()) {
                        result.push((matched_pattern.clone(), fragment.clone()));
                    }
                }
                RequestKeyTransform::AddedFragment => {
                    debug_assert!(
                        !fragment.is_empty(),
                        "can only have an AddedFragment modification if there was a fragment"
                    );
                    if let Some(stripped_pattern) = matched_pattern.strip_suffix(fragment.as_str())
                        && pattern.is_match(stripped_pattern)
                    {
                        result.push((stripped_pattern.into(), RcStr::default()));
                    }
                }
                RequestKeyTransform::AddedExtension { ext, next } => {
                    if let Some(stripped_pattern) = matched_pattern.strip_suffix(ext.as_str()) {
                        let stripped_pattern: RcStr = stripped_pattern.into();
                        Self::apply_all(next, &stripped_pattern, fragment, pattern, result);
                    }
                }
                RequestKeyTransform::ReplacedExtension { ext, next } => {
                    if let Some(stripped_pattern) = matched_pattern.strip_suffix(ext.as_str()) {
                        let replaced_pattern: RcStr = format!(
                            "{stripped_pattern}{old_ext}",
                            old_ext = TS_EXTENSION_REPLACEMENTS.reverse.get(ext).unwrap()
                        )
                        .into();
                        Self::apply_all(next, &replaced_pattern, fragment, pattern, result);
                    }
                }
            }
        }

        fn apply_all(
            list: &[RequestKeyTransform],
            matched_pattern: &RcStr,
            fragment: &RcStr,
            pattern: &Pattern,
            result: &mut SmallVec<[(RcStr, RcStr); 2]>,
        ) {
            list.iter()
                .for_each(|pm| pm.apply_internal(matched_pattern, fragment, pattern, result));
        }
    }

    let mut modifications = Vec::new();
    modifications.push(RequestKeyTransform::None);

    // Fragments are a bit odd. `require()` allows importing files with literal `#` characters in
    // them, but `import` treats it like a url and drops it from resolution. So we need to consider
    // both cases here.
    if !fragment.is_empty() {
        modifications.push(RequestKeyTransform::AddedFragment);
        new_path.push(Pattern::Alternatives(vec![
            Pattern::Constant(RcStr::default()),
            Pattern::Constant(fragment.clone()),
        ]));
    }

    if !options_value.fully_specified {
        // For each current set of modifications append an extension modification
        modifications =
            modifications
                .iter()
                .cloned()
                .chain(options_value.extensions.iter().map(|ext| {
                    RequestKeyTransform::AddedExtension {
                        ext: ext.clone(),
                        next: modifications.clone(),
                    }
                }))
                .collect();
        // Add the extensions as alternatives to the path
        // read_matches keeps the order of alternatives intact
        // TODO: if the pattern has a dynamic suffix then this 'ordering' doesn't work since we just
        // take the slowpath and return everything from the directory in `read_matches`
        new_path.push(Pattern::Alternatives(
            once(Pattern::Constant(RcStr::default()))
                .chain(
                    options_value
                        .extensions
                        .iter()
                        .map(|ext| Pattern::Constant(ext.clone())),
                )
                .collect(),
        ));
        new_path.normalize();
    };

    struct ExtensionReplacements {
        forward: FxHashMap<RcStr, SmallVec<[RcStr; 3]>>,
        reverse: FxHashMap<RcStr, RcStr>,
    }
    static TS_EXTENSION_REPLACEMENTS: LazyLock<ExtensionReplacements> = LazyLock::new(|| {
        let mut forward = FxHashMap::default();
        forward.insert(
            rcstr!(".js"),
            SmallVec::from_vec(vec![rcstr!(".ts"), rcstr!(".tsx"), rcstr!(".js")]),
        );

        forward.insert(
            rcstr!(".mjs"),
            SmallVec::from_vec(vec![rcstr!(".mts"), rcstr!(".mjs")]),
        );

        forward.insert(
            rcstr!(".cjs"),
            SmallVec::from_vec(vec![rcstr!(".cts"), rcstr!(".cjs")]),
        );
        let reverse = forward
            .iter()
            .flat_map(|(k, v)| v.iter().map(|v: &RcStr| (v.clone(), k.clone())))
            .collect::<FxHashMap<_, _>>();
        ExtensionReplacements { forward, reverse }
    });

    if options_value.enable_typescript_with_output_extension {
        // there are at most 4 possible replacements (the size of the reverse map)
        let mut replaced_extensions = SmallVec::<[RcStr; 4]>::new();
        let replaced = new_path.replace_final_constants(&mut |c: &RcStr| -> Option<Pattern> {
            let (base, ext) = c.split_at(c.rfind('.')?);

            let (ext, replacements) = TS_EXTENSION_REPLACEMENTS.forward.get_key_value(ext)?;
            for replacement in replacements {
                if replacement != ext && !replaced_extensions.contains(replacement) {
                    replaced_extensions.push(replacement.clone());
                    debug_assert!(replaced_extensions.len() <= replaced_extensions.inline_size());
                }
            }

            let replacements = replacements
                .iter()
                .cloned()
                .map(Pattern::Constant)
                .collect();

            if base.is_empty() {
                Some(Pattern::Alternatives(replacements))
            } else {
                Some(Pattern::Concatenation(vec![
                    Pattern::Constant(base.into()),
                    Pattern::Alternatives(replacements),
                ]))
            }
        });
        if replaced {
            // For each current set of modifications append an extension replacement modification
            modifications = modifications
                .iter()
                .cloned()
                .chain(replaced_extensions.iter().map(|ext| {
                    RequestKeyTransform::ReplacedExtension {
                        ext: ext.clone(),
                        next: modifications.clone(),
                    }
                }))
                .collect();
            new_path.normalize();
        }
    }

    let matches = turbo_tasks::read!(read_matches(
        lookup_path.clone(),
        rcstr!(""),
        force_in_lookup_dir,
        *turbo_tasks::read!(Pattern::new(new_path.clone()).to_resolved())?,
    ))?;

    // This loop is necessary to 'undo' the modifications to 'new_path' that were performed above.
    // e.g. we added extensions but these shouldn't be part of the request key so remove them.

    let mut keys = FxHashSet::default();
    let to_resolve = matches
        .iter()
        .flat_map(|m| {
            if let PatternMatch::File(matched_pattern, path) = m {
                Either::Left(
                    modifications
                        .iter()
                        .flat_map(|m| m.undo(matched_pattern, &fragment, path_pattern))
                        .map(move |result| (result, path)),
                )
            } else {
                Either::Right(empty())
            }
        })
        // Dedupe here before calling `resolved`
        .filter(move |((matched_pattern, _), _)| keys.insert(matched_pattern.clone()));
    #[cfg(not(feature = "sync"))]
    let results = turbo_tasks::read!(to_resolve
        .map(|((matched_pattern, fragment), path)| {
            resolved(
                RequestKey::new(matched_pattern),
                path.clone(),
                lookup_path.clone(),
                request,
                options_value,
                options,
                query.clone(),
                fragment,
            )
        })
        .try_join())?;
    #[cfg(feature = "sync")]
    let results = {
        // Sequential on purpose (was `try_join`).
        let mut results = Vec::new();
        for ((matched_pattern, fragment), path) in to_resolve {
            results.push(resolved(
                RequestKey::new(matched_pattern),
                path.clone(),
                lookup_path.clone(),
                request,
                options_value,
                options,
                query.clone(),
                fragment,
            )?);
        }
        results
    };

    // Convert ResolveResultOrCells to cells in deterministic order (after concurrent resolution)
    let mut results: Vec<Vc<ResolveResult>> = results.into_iter().map(|r| r.into_cell()).collect();

    // Directory matches must be resolved AFTER file matches
    for m in matches.iter() {
        if let PatternMatch::Directory(matched_pattern, path) = m {
            results.push(
                resolve_into_folder(path.clone(), options).with_request(matched_pattern.clone()),
            );
        }
    }

    Ok(merge_results(results))
}
}

turbo_tasks::dual_fn! {
#[tracing::instrument(level = Level::TRACE, skip_all)]
fn apply_in_package(
    lookup_path: FileSystemPath,
    options: Vc<ResolveOptions>,
    options_value: &ResolveOptions,
    get_request: impl Fn(&FileSystemPath) -> Option<RcStr>,
    query: RcStr,
    fragment: RcStr,
) -> Result<Option<ResolveResultOrCell>> {
    // Check alias field for module aliases first
    for in_package in options_value.in_package.iter() {
        // resolve_module_request is called when importing a node
        // module, not a PackageInternal one, so the imports field
        // doesn't apply.
        let ResolveInPackage::AliasField(field) = in_package else {
            continue;
        };

        let FindContextFileResult::Found(package_json_path, refs) = &*turbo_tasks::read!(find_context_file(
            lookup_path.clone(),
            *turbo_tasks::read!(package_json().to_resolved())?,
            options_value.collect_affecting_sources,
        ))?
        else {
            continue;
        };

        let read =
            turbo_tasks::read!(read_package_json(Vc::upcast(FileSource::new(package_json_path.clone()))))?;
        let Some(package_json) = &*read else {
            continue;
        };

        let Some(field_value) = package_json[field.as_str()].as_object() else {
            continue;
        };

        let package_path = package_json_path.parent();

        let Some(request) = get_request(&package_path) else {
            continue;
        };

        let value = if let Some(value) = field_value.get(&*request) {
            value
        } else if let Some(request) = request.strip_prefix("./") {
            let Some(value) = field_value.get(request) else {
                continue;
            };
            value
        } else {
            continue;
        };

        let refs = refs.clone();
        let request_key = RequestKey::new(request.clone());

        if value.as_bool() == Some(false) {
            return Ok(Some(ResolveResultOrCell::Value(
                ResolveResult::primary_with_affecting_sources(
                    request_key,
                    ResolveResultItem::Ignore,
                    refs,
                ),
            )));
        }

        if let Some(value) = value.as_str() {
            if value == &*request {
                // This would be a cycle, so we ignore it
                return Ok(None);
            }
            let mut result = resolve_internal(
                package_path,
                Request::parse(Pattern::Constant(value.into()))
                    .with_query(query.clone())
                    .with_fragment(fragment.clone()),
                options,
            )
            .with_replaced_request_key(value.into(), request_key);
            if options_value.collect_affecting_sources && !refs.is_empty() {
                result = result.with_affecting_sources(refs.into_iter().map(|src| *src).collect());
            }
            return Ok(Some(ResolveResultOrCell::Cell(result)));
        }

        ResolvingIssue {
            severity: turbo_tasks::read!(resolve_error_severity(options))?,
            file_path: package_json_path.clone(),
            request_type: format!("alias field ({field})"),
            request: turbo_tasks::read!(Request::parse(Pattern::Constant(request))
                .to_resolved())?,
            resolve_options: turbo_tasks::read!(options.to_resolved())?,
            error_message: Some(format!("invalid alias field value: {value}")),
            source: None,
        }
        .resolved_cell()
        .emit();

        return Ok(Some(ResolveResultOrCell::Value(
            ResolveResult::unresolvable_with_affecting_sources(refs),
        )));
    }
    Ok(None)
}
}

#[turbo_tasks::value]
enum FindSelfReferencePackageResult {
    Found {
        name: String,
        package_path: FileSystemPath,
    },
    NotFound,
}

#[turbo_tasks::function]
/// Finds the nearest folder containing package.json that could be used for a
/// self-reference (i.e. has an exports fields).
async fn find_self_reference(
    lookup_path: FileSystemPath,
) -> Result<Vc<FindSelfReferencePackageResult>> {
    let package_json_context = turbo_tasks::read!(find_context_file(
        lookup_path,
        *turbo_tasks::read!(package_json().to_resolved())?,
        false
    ))?;
    if let FindContextFileResult::Found(package_json_path, _refs) = &*package_json_context {
        let read = turbo_tasks::read!(read_package_json(Vc::upcast(FileSource::new(
            package_json_path.clone()
        ))))?;
        if let Some(json) = &*read
            && json.get("exports").is_some()
            && let Some(name) = json["name"].as_str()
        {
            return Ok(FindSelfReferencePackageResult::Found {
                name: name.to_string(),
                package_path: package_json_path.parent(),
            }
            .cell());
        }
    }
    Ok(FindSelfReferencePackageResult::NotFound.cell())
}

turbo_tasks::dual_fn! {
#[tracing::instrument(level = Level::TRACE, skip_all)]
fn resolve_module_request(
    lookup_path: FileSystemPath,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
    options_value: &ResolveOptions,
    module: &Pattern,
    path: &Pattern,
    query: RcStr,
    fragment: RcStr,
) -> Result<Vc<ResolveResult>> {
    // Check alias field for module aliases first
    if let Some(result) = turbo_tasks::read!(apply_in_package(
        lookup_path.clone(),
        options,
        options_value,
        |_| {
            let full_pattern = Pattern::concat([module.clone(), path.clone()]);
            full_pattern.as_constant_string().cloned()
        },
        query.clone(),
        fragment.clone(),
    ))?
    {
        return Ok(result.into_cell());
    }

    let mut results = vec![];

    // Self references, if the nearest package.json has the name of the requested
    // module. This should match only using the exports field and no other
    // fields/fallbacks.
    if let FindSelfReferencePackageResult::Found { name, package_path } =
        &*turbo_tasks::read!(find_self_reference(lookup_path.clone()))?
        && module.is_match(name)
    {
        let result = resolve_into_package(
            path.clone(),
            package_path.clone(),
            query.clone(),
            fragment.clone(),
            options,
        );
        if !turbo_tasks::read!(result)?.is_unresolvable() {
            return Ok(result);
        }
    }

    let result = turbo_tasks::read!(find_package(
        lookup_path.clone(),
        module.clone(),
        *turbo_tasks::read!(resolve_modules_options(options).to_resolved())?,
        options_value.collect_affecting_sources,
    ))?;

    if result.packages.is_empty() {
        return Ok(ResolveResult::unresolvable_with_affecting_sources(
            result.affecting_sources.clone(),
        )
        .cell());
    }

    // There may be more than one package with the same name. For instance, in a
    // TypeScript project, `compilerOptions.baseUrl` can declare a path where to
    // resolve packages. A request to "foo/bar" might resolve to either
    // "[baseUrl]/foo/bar" or "[baseUrl]/node_modules/foo/bar", and we'll need to
    // try both.
    for item in &result.packages {
        match item {
            FindPackageItem::PackageDirectory { name, dir } => {
                results.push(
                    resolve_into_package(
                        path.clone(),
                        dir.clone(),
                        query.clone(),
                        fragment.clone(),
                        options,
                    )
                    .with_replaced_request_key(rcstr!("."), RequestKey::new(name.clone())),
                );
            }
            FindPackageItem::PackageFile { name, file } => {
                if path.is_match("") {
                    let resolved_result = turbo_tasks::read!(resolved(
                        RequestKey::new(rcstr!(".")),
                        file.clone(),
                        lookup_path.clone(),
                        request,
                        options_value,
                        options,
                        query.clone(),
                        fragment.clone(),
                    ))?
                    .into_cell()
                    .with_replaced_request_key(rcstr!("."), RequestKey::new(name.clone()));
                    results.push(resolved_result)
                }
            }
        }
    }

    let module_result =
        merge_results_with_affecting_sources(results, result.affecting_sources.clone());

    if options_value.prefer_relative {
        let mut module_prefixed = module.clone();
        module_prefixed.push_front(rcstr!("./").into());
        let pattern = Pattern::concat([module_prefixed.clone(), rcstr!("/").into(), path.clone()]);
        let relative = turbo_tasks::read!(Request::relative(pattern, query, fragment, true)
            .to_resolved())?;
        let relative_result = turbo_tasks::read!(resolve_internal_inline_boxed(
            lookup_path.clone(),
            *relative,
            options,
        ))?;
        let relative_result = relative_result.with_stripped_request_key_prefix(rcstr!("./"));

        Ok(merge_results(vec![relative_result, module_result]))
    } else {
        Ok(module_result)
    }
}
}

#[turbo_tasks::function]
async fn resolve_into_package(
    path: Pattern,
    package_path: FileSystemPath,
    query: RcStr,
    fragment: RcStr,
    options: ResolvedVc<ResolveOptions>,
) -> Result<Vc<ResolveResult>> {
    let options_value = turbo_tasks::read!(options)?;
    let mut results = Vec::new();

    let is_root_match = path.is_match("") || path.is_match("/");
    let could_match_others = path.could_match_others("");

    let mut export_path_request = path.clone();
    export_path_request.push_front(rcstr!(".").into());
    for resolve_into_package in options_value.into_package.iter() {
        match resolve_into_package {
            // handled by the `resolve_into_folder` call below
            ResolveIntoPackage::MainField { .. } => {}
            ResolveIntoPackage::ExportsField {
                conditions,
                unspecified_conditions,
            } => {
                let package_json_path = package_path.join("package.json")?;
                let ExportsFieldResult::Some(exports_field) = &*turbo_tasks::read!(exports_field(
                    Vc::upcast(FileSource::new(package_json_path.clone()))
                ))?
                else {
                    continue;
                };

                results.push(turbo_tasks::read!(handle_exports_imports_field(
                    package_path.clone(),
                    package_json_path,
                    *options,
                    exports_field,
                    export_path_request.clone(),
                    conditions,
                    unspecified_conditions,
                    query,
                    ExportImport::Export,
                ))?);

                // other options do not apply anymore when an exports
                // field exist
                return Ok(merge_results(results));
            }
        }
    }

    // apply main field(s) or fallback to index.js if there's no subpath
    if is_root_match {
        results.push(resolve_into_folder(
            package_path.clone(),
            options.with_fully_specified(false),
        ));
    }

    if could_match_others {
        let mut new_pat = path.clone();
        new_pat.push_front(rcstr!(".").into());

        let relative =
            turbo_tasks::read!(Request::relative(new_pat, query, fragment, true).to_resolved())?;
        results.push(turbo_tasks::read!(resolve_internal_inline(
            package_path.clone(),
            *relative,
            *options
        ))?);
    }

    Ok(merge_results(results))
}

turbo_tasks::dual_fn! {
#[tracing::instrument(level = Level::TRACE, skip_all)]
fn resolve_import_map_result(
    result: &ImportMapResult,
    lookup_path: FileSystemPath,
    original_lookup_path: FileSystemPath,
    original_request: Vc<Request>,
    options: Vc<ResolveOptions>,
    query: RcStr,
) -> Result<Option<ResolveResultOrCell>> {
    Ok(match result {
        ImportMapResult::Result(result) => Some(ResolveResultOrCell::Cell(**result)),
        ImportMapResult::Alias(request, alias_lookup_path) => {
            let request_vc: Vc<Request> = **request;
            // Only add query if the aliased request doesn't already have one
            let request = if turbo_tasks::read!(request_vc.query())?.is_empty() && !query.is_empty() {
                request_vc.with_query(query.clone())
            } else {
                request_vc
            };
            let lookup_path = alias_lookup_path.clone().unwrap_or(lookup_path);

            // Compare request patterns to avoid cycles (ignoring query differences)
            let request_pattern = request.request_pattern();
            let original_pattern = original_request.request_pattern();

            if *turbo_tasks::read!(request_pattern)? == *turbo_tasks::read!(original_pattern)?
                && lookup_path == original_lookup_path
            {
                None
            } else {
                Some(ResolveResultOrCell::Cell(
                    resolve_internal(lookup_path, request, options)
                        .with_replaced_request_key_pattern(request_pattern, original_pattern),
                ))
            }
        }
        ImportMapResult::External {
            name,
            ty,
            traced,
            target,
        } => Some(ResolveResultOrCell::Value(ResolveResult::primary(
            ResolveResultItem::External {
                name: name.clone(),
                ty: *ty,
                traced: *traced,
                target: target.clone(),
            },
        ))),
        ImportMapResult::AliasExternal {
            name,
            ty,
            traced,
            lookup_dir: alias_lookup_path,
        } => {
            let request = Request::parse_string(name.clone());

            // We must avoid cycles during resolving
            if *turbo_tasks::read!(request.to_resolved())? == original_request
                && *alias_lookup_path == original_lookup_path
            {
                None
            } else {
                let is_external_resolvable = !turbo_tasks::read!(resolve_internal(
                    alias_lookup_path.clone(),
                    request,
                    match ty {
                        // TODO is that root correct?
                        ExternalType::CommonJs => {
                            node_cjs_resolve_options(turbo_tasks::read!(alias_lookup_path.root().owned())?)
                        }
                        ExternalType::EcmaScriptModule => {
                            node_esm_resolve_options(turbo_tasks::read!(alias_lookup_path.root().owned())?)
                        }
                        ExternalType::Script | ExternalType::Url | ExternalType::Global => options,
                    },
                ))?
                .is_unresolvable();
                if is_external_resolvable {
                    Some(ResolveResultOrCell::Value(ResolveResult::primary(
                        ResolveResultItem::External {
                            name: name.clone(),
                            ty: *ty,
                            traced: *traced,
                            target: None,
                        },
                    )))
                } else {
                    None
                }
            }
        }
        ImportMapResult::Alternatives(list) => {
            #[cfg(not(feature = "sync"))]
            let results = turbo_tasks::read!(list
                .iter()
                .map(|result| {
                    resolve_import_map_result(
                        result,
                        lookup_path.clone(),
                        original_lookup_path.clone(),
                        original_request,
                        options,
                        query.clone(),
                    )
                })
                .try_join())?;
            #[cfg(feature = "sync")]
            let results = {
                // Sequential on purpose: recursive resolution of the alternatives.
                let mut results = Vec::with_capacity(list.len());
                for result in list.iter() {
                    results.push(resolve_import_map_result(
                        result,
                        lookup_path.clone(),
                        original_lookup_path.clone(),
                        original_request,
                        options,
                        query.clone(),
                    )?);
                }
                results
            };

            // Convert ResolveResultOrCells to cells in deterministic order after try_join completes
            let cells: Vec<Vc<ResolveResult>> = results
                .into_iter()
                .flatten()
                .map(|r| r.into_cell())
                .collect();
            Some(ResolveResultOrCell::Cell(merge_results(cells)))
        }
        ImportMapResult::NoEntry => None,
        ImportMapResult::Error(issue) => Some(ResolveResultOrCell::Value(ResolveResult::primary(
            ResolveResultItem::Error(*issue),
        ))),
    })
}
}

/// Result of resolving a file path. Either a cell (from early return paths like alias resolution)
/// or a value that needs to be converted to a cell later.
enum ResolveResultOrCell {
    Cell(Vc<ResolveResult>),
    Value(ResolveResult),
}

impl ResolveResultOrCell {
    fn into_cell(self) -> Vc<ResolveResult> {
        match self {
            ResolveResultOrCell::Cell(vc) => vc,
            ResolveResultOrCell::Value(value) => value.cell(),
        }
    }

    turbo_tasks::dual_fn! {
    fn into_cell_if_resolvable(self) -> Result<Option<Vc<ResolveResult>>> {
        match self {
            ResolveResultOrCell::Cell(resolved_result) => {
                if !turbo_tasks::read!(resolved_result)?.is_unresolvable() {
                    return Ok(Some(resolved_result));
                }
            }
            ResolveResultOrCell::Value(resolve_result) => {
                if !resolve_result.is_unresolvable() {
                    return Ok(Some(resolve_result.cell()));
                }
            }
        }
        Ok(None)
    }
    }
}

turbo_tasks::dual_fn! {
#[tracing::instrument(level = Level::TRACE, skip_all)]
fn resolved(
    request_key: RequestKey,
    fs_path: FileSystemPath,
    original_context: FileSystemPath,
    original_request: Vc<Request>,
    options_value: &ResolveOptions,
    options: Vc<ResolveOptions>,
    query: RcStr,
    fragment: RcStr,
) -> Result<ResolveResultOrCell> {
    let result = &*turbo_tasks::read!(fs_path.realpath_with_links())?;
    let path = match &result.path_result {
        Ok(path) => path,
        Err(e) => bail!(turbo_tasks::read!(e.as_error_message(&fs_path, result))?),
    };

    let path_ref = path.clone();
    // Check alias field for path aliases first
    if let Some(result) = turbo_tasks::read!(apply_in_package(
        path.parent(),
        options,
        options_value,
        |package_path| package_path.get_relative_path_to(&path_ref),
        query.clone(),
        fragment.clone(),
    ))?
    {
        return Ok(result);
    }

    if let Some(resolved_map) = options_value.resolved_map {
        let result = turbo_tasks::read!(resolved_map
            .lookup(path.clone(), original_context.clone(), original_request))?;

        let resolved_result = turbo_tasks::read!(resolve_import_map_result(
            &result,
            path.parent(),
            original_context.clone(),
            original_request,
            options,
            query.clone(),
        ))?;

        if let Some(result) = resolved_result {
            return Ok(result);
        }
    }
    let source = ResolvedVc::upcast(
        turbo_tasks::read!(FileSource::new_with_query_and_fragment(path.clone(), query, fragment)
            .to_resolved())?,
    );
    Ok(ResolveResultOrCell::Value(
        if options_value.collect_affecting_sources {
            // Sequential on purpose: symlink chains are tiny, and `to_resolved` on a
            // freshly created `FileSource` resolves near-instantly.
            let mut affecting_sources = Vec::with_capacity(result.symlinks.len());
            for symlink in result.symlinks.iter() {
                affecting_sources.push(ResolvedVc::upcast(turbo_tasks::read!(
                    FileSource::new(symlink.clone()).to_resolved()
                )?));
            }
            ResolveResult::source_with_affecting_sources(request_key, source, affecting_sources)
        } else {
            ResolveResult::source_with_key(request_key, source)
        },
    ))
}
}

turbo_tasks::dual_fn! {
fn handle_exports_imports_field(
    package_path: FileSystemPath,
    package_json_path: FileSystemPath,
    options: Vc<ResolveOptions>,
    exports_imports_field: &AliasMap<SubpathValue>,
    mut path: Pattern,
    conditions: &BTreeMap<RcStr, ConditionValue>,
    unspecified_conditions: &ConditionValue,
    query: RcStr,
    ty: ExportImport,
) -> Result<Vc<ResolveResult>> {
    let mut results = Vec::new();
    let mut conditions_state = FxHashMap::default();

    if !query.is_empty() {
        path.push(query.into());
    }
    let req = path;

    let values = exports_imports_field.lookup(&req);
    for value in values {
        let value = value?;
        if value.output.add_results(
            value.prefix,
            value.key,
            conditions,
            unspecified_conditions,
            &mut conditions_state,
            &mut results,
        ) {
            // Match found, stop (leveraging the lazy `lookup` iterator).
            break;
        }
    }

    let mut resolved_results = Vec::new();
    for ReplacedSubpathValueResult {
        result_path,
        conditions,
        map_prefix,
        map_key,
    } in results
    {
        let request = match ty {
            ExportImport::Export => {
                // Only relative paths are allowed in exports fields
                Pattern::Concatenation(vec![Pattern::Constant(rcstr!("./")), result_path.clone()])
            }
            ExportImport::Import => result_path.clone(),
        };
        let request = *turbo_tasks::read!(Request::parse(request).to_resolved())?;

        let resolve_result = turbo_tasks::read!(resolve_internal_inline_boxed(
            package_path.clone(),
            request,
            options,
        ))?;

        let resolve_result = if let Some(req) = req.as_constant_string() {
            resolve_result.with_request(req.clone())
        } else {
            match map_key {
                AliasKey::Exact => resolve_result.with_request(map_prefix.clone().into()),
                AliasKey::Wildcard { .. } => {
                    // - `req` is the user's request (key of the export map)
                    // - `result_path` is the final request (value of the export map), so
                    //   effectively `'{foo}*{bar}'`

                    // Because of the assertion in AliasMapLookupIterator, `req` is of the
                    // form:
                    // - "prefix...<dynamic>" or
                    // - "prefix...<dynamic>...suffix"

                    let mut old_request_key = result_path;
                    if matches!(ty, ExportImport::Export) {
                        // Remove the Pattern::Constant(rcstr!("./")) from above again
                        old_request_key.push_front(rcstr!("./").into());
                    }
                    let new_request_key = req.clone();

                    resolve_result.with_replaced_request_key_pattern(
                        Pattern::new(old_request_key),
                        Pattern::new(new_request_key),
                    )
                }
            }
        };

        let resolve_result = if !conditions.is_empty() {
            let resolve_result = turbo_tasks::read!(resolve_result)?.with_conditions(&conditions);
            resolve_result.cell()
        } else {
            resolve_result
        };
        resolved_results.push(resolve_result);
    }

    // other options do not apply anymore when an exports field exist
    Ok(merge_results_with_affecting_sources(
        resolved_results,
        vec![ResolvedVc::upcast(
            turbo_tasks::read!(FileSource::new(package_json_path).to_resolved())?,
        )],
    ))
}
}

turbo_tasks::dual_fn! {
/// Resolves a `#dep` import using the containing package.json's `imports`
/// field. The dep may be a constant string or a pattern, and the values can be
/// static strings or conditions like `import` or `require` to handle ESM/CJS
/// with differently compiled files.
fn resolve_package_internal_with_imports_field(
    file_path: FileSystemPath,
    request: Vc<Request>,
    resolve_options: Vc<ResolveOptions>,
    pattern: &Pattern,
    conditions: &BTreeMap<RcStr, ConditionValue>,
    unspecified_conditions: &ConditionValue,
) -> Result<Vc<ResolveResult>> {
    let Pattern::Constant(specifier) = pattern else {
        bail!("PackageInternal requests can only be Constant strings");
    };
    // https://github.com/nodejs/node/blob/1b177932/lib/internal/modules/esm/resolve.js#L615-L619
    if specifier == "#" || specifier.starts_with("#/") || specifier.ends_with('/') {
        ResolvingIssue {
            severity: turbo_tasks::read!(resolve_error_severity(resolve_options))?,
            file_path: file_path.clone(),
            request_type: format!("package imports request: `{specifier}`"),
            request: turbo_tasks::read!(request.to_resolved())?,
            resolve_options: turbo_tasks::read!(resolve_options.to_resolved())?,
            error_message: None,
            source: None,
        }
        .resolved_cell()
        .emit();
        return Ok(ResolveResult::unresolvable().cell());
    }

    let imports_result = turbo_tasks::read!(imports_field(file_path))?;
    let (imports, package_json_path) = match &*imports_result {
        ImportsFieldResult::Some(i, p) => (i, p.clone()),
        ImportsFieldResult::None => return Ok(ResolveResult::unresolvable().cell()),
    };

    turbo_tasks::read!(handle_exports_imports_field(
        package_json_path.parent(),
        package_json_path.clone(),
        resolve_options,
        imports,
        Pattern::Constant(specifier.clone()),
        conditions,
        unspecified_conditions,
        RcStr::default(),
        ExportImport::Import,
    ))
}
}

/// ModulePart represents a part of a module.
///
/// Currently this is used only for ESMs.
#[turbo_tasks::task_input]
#[derive(
    Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Hash, TraceRawVcs, Encode, Decode,
)]
pub enum ModulePart {
    /// Represents the side effects of a module. This part is evaluated even if
    /// all exports are unused.
    Evaluation,
    /// Represents an export of a module.
    Export(RcStr),
    /// Represents a renamed export of a module.
    RenamedExport {
        original_export: RcStr,
        export: RcStr,
    },
    /// Represents a namespace object of a module exported as named export.
    RenamedNamespace { export: RcStr },
    /// A pointer to a specific part.
    Internal(u32),
    /// The local declarations of a module.
    Locals,
    /// The whole exports of a module.
    Exports,
    /// A facade of the module behaving like the original, but referencing
    /// internal parts.
    Facade,
}

impl ModulePart {
    pub fn evaluation() -> Self {
        ModulePart::Evaluation
    }

    pub fn export(export: RcStr) -> Self {
        ModulePart::Export(export)
    }

    pub fn renamed_export(original_export: RcStr, export: RcStr) -> Self {
        ModulePart::RenamedExport {
            original_export,
            export,
        }
    }

    pub fn renamed_namespace(export: RcStr) -> Self {
        ModulePart::RenamedNamespace { export }
    }

    pub fn internal(id: u32) -> Self {
        ModulePart::Internal(id)
    }

    pub fn locals() -> Self {
        ModulePart::Locals
    }

    pub fn exports() -> Self {
        ModulePart::Exports
    }

    pub fn facade() -> Self {
        ModulePart::Facade
    }
}

impl Display for ModulePart {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            ModulePart::Evaluation => f.write_str("module evaluation"),
            ModulePart::Export(export) => write!(f, "export {export}"),
            ModulePart::RenamedExport {
                original_export,
                export,
            } => write!(f, "export {original_export} as {export}"),
            ModulePart::RenamedNamespace { export } => {
                write!(f, "export * as {export}")
            }
            ModulePart::Internal(id) => write!(f, "internal part {id}"),
            ModulePart::Locals => f.write_str("locals"),
            ModulePart::Exports => f.write_str("exports"),
            ModulePart::Facade => f.write_str("facade"),
        }
    }
}
#[cfg(test)]
mod tests {
    use std::{
        fs::{File, create_dir_all},
        io::Write,
    };

    use anyhow::Result;
    use turbo_rcstr::{RcStr, rcstr};
    use turbo_tasks::Vc;
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
    use turbo_tasks_fs::{DiskFileSystem, FileContent, FileSystem, FileSystemPath};

    use crate::{
        asset::AssetContent,
        module::Module,
        raw_module::RawModule,
        resolve::{
            ModuleResolveResult, ModuleResolveResultBuilder, ModuleResolveResultItem, RequestKey,
            ResolveResult, ResolveResultItem, node::node_esm_resolve_options, parse::Request,
            pattern::Pattern,
        },
        source::Source,
        virtual_source::VirtualSource,
    };

    #[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_explicit_js_resolves_to_ts() {
        resolve_relative_request_test(TestParams {
            files: vec!["foo.js", "foo.ts"],
            pattern: rcstr!("./foo.js").into(),
            enable_typescript_with_output_extension: true,
            fully_specified: false,
            custom_extensions: None,
            expected: vec![("./foo.js", "foo.ts")],
        })
        .await;
    }

    #[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_implicit_request_ts_priority() {
        resolve_relative_request_test(TestParams {
            files: vec!["foo.js", "foo.ts"],
            pattern: rcstr!("./foo").into(),
            enable_typescript_with_output_extension: true,
            fully_specified: false,
            custom_extensions: None,
            expected: vec![("./foo", "foo.ts")],
        })
        .await;
    }

    #[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_ts_priority_over_json() {
        resolve_relative_request_test(TestParams {
            files: vec!["posts.json", "posts.ts"],
            pattern: rcstr!("./posts").into(),
            enable_typescript_with_output_extension: true,
            fully_specified: false,
            custom_extensions: None,
            expected: vec![("./posts", "posts.ts")],
        })
        .await;
    }

    #[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_only_js_file_no_ts() {
        resolve_relative_request_test(TestParams {
            files: vec!["bar.js"],
            pattern: rcstr!("./bar.js").into(),
            enable_typescript_with_output_extension: true,
            fully_specified: false,
            custom_extensions: None,
            expected: vec![("./bar.js", "bar.js")],
        })
        .await;
    }

    #[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_explicit_ts_request() {
        resolve_relative_request_test(TestParams {
            files: vec!["foo.js", "foo.ts"],
            pattern: rcstr!("./foo.ts").into(),
            enable_typescript_with_output_extension: true,
            fully_specified: false,
            custom_extensions: None,
            expected: vec![("./foo.ts", "foo.ts")],
        })
        .await;
    }

    // Fragment handling tests
    #[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_fragment() {
        resolve_relative_request_test(TestParams {
            files: vec!["client.ts"],
            pattern: rcstr!("./client#frag").into(),
            enable_typescript_with_output_extension: true,
            fully_specified: false,
            custom_extensions: None,
            expected: vec![("./client", "client.ts")],
        })
        .await;
    }

    #[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_fragment_as_part_of_filename() {
        // When a file literally contains '#' in its name, it should be preserved
        resolve_relative_request_test(TestParams {
            files: vec!["client#component.js", "client#component.ts"],
            pattern: rcstr!("./client#component.js").into(),
            enable_typescript_with_output_extension: true,
            fully_specified: false,
            custom_extensions: None,
            // Whether or not this request key is correct somewhat ambiguous.  It depends on whether
            // or not we consider this fragment to be part of the request pattern
            expected: vec![("./client", "client#component.ts")],
        })
        .await;
    }

    #[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_fragment_with_ts_priority() {
        // Fragment handling with extension priority
        resolve_relative_request_test(TestParams {
            files: vec!["page#section.js", "page#section.ts"],
            pattern: rcstr!("./page#section").into(),
            enable_typescript_with_output_extension: true,
            fully_specified: false,
            custom_extensions: None,
            expected: vec![("./page", "page#section.ts")],
        })
        .await;
    }

    #[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_query() {
        resolve_relative_request_test(TestParams {
            files: vec!["client.ts", "client.js"],
            pattern: rcstr!("./client?q=s").into(),
            enable_typescript_with_output_extension: true,
            fully_specified: false,
            custom_extensions: None,
            expected: vec![("./client", "client.ts")],
        })
        .await;
    }

    // Dynamic pattern tests
    #[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_dynamic_pattern_with_js_extension() {
        // Pattern: ./src/*.js should generate multiple keys with .ts priority
        // When both foo.js and foo.ts exist, dynamic patterns need both keys for runtime resolution
        // Results are sorted alphabetically by key
        resolve_relative_request_test(TestParams {
            files: vec!["src/foo.js", "src/foo.ts", "src/bar.js"],
            pattern: Pattern::Concatenation(vec![
                Pattern::Constant(rcstr!("./src/")),
                Pattern::Dynamic,
                Pattern::Constant(rcstr!(".js")),
            ]),
            enable_typescript_with_output_extension: true,
            fully_specified: false,
            custom_extensions: None,
            expected: vec![
                ("./src/foo.js", "src/foo.ts"),
                ("./src/bar.js", "src/bar.js"),
            ],
        })
        .await;
    }

    #[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_dynamic_pattern_without_extension() {
        // Pattern: ./src/* (no extension) with TypeScript priority
        // Dynamic patterns generate keys for all matched files, including extension alternatives
        // Results are sorted deterministically by matched file name
        resolve_relative_request_test(TestParams {
            files: vec!["src/foo.js", "src/foo.ts", "src/bar.js"],
            pattern: Pattern::Concatenation(vec![
                Pattern::Constant(rcstr!("./src/")),
                Pattern::Dynamic,
            ]),
            enable_typescript_with_output_extension: true,
            fully_specified: false,
            custom_extensions: None,
            expected: vec![
                ("./src/bar.js", "src/bar.js"),
                ("./src/bar", "src/bar.js"),
                // TODO: all three should point at the .ts file
                // This happens because read_matches returns the `.js` file first (alphabetically
                // foo.js < foo.ts) and foo (extensionless) is deduped to point at foo.js since it
                // was the first file with that base name encountered. To fix this we would need to
                // change how we handle extension priority for dynamic patterns.
                ("./src/foo.js", "src/foo.js"),
                ("./src/foo", "src/foo.js"),
                ("./src/foo.ts", "src/foo.ts"),
            ],
        })
        .await;
    }

    /// Test that custom `resolveExtensions` ordering is respected:
    /// `.web.tsx` appears before `.tsx` in the list, so it must win when both exist.
    #[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_custom_extensions_web_before_default() {
        resolve_relative_request_test(TestParams {
            files: vec!["Component.web.tsx", "Component.tsx"],
            pattern: rcstr!("./Component").into(),
            enable_typescript_with_output_extension: false,
            fully_specified: false,
            custom_extensions: Some(vec![
                rcstr!(".web.tsx"),
                rcstr!(".web.ts"),
                rcstr!(".web.jsx"),
                rcstr!(".web.js"),
                rcstr!(".tsx"),
                rcstr!(".ts"),
                rcstr!(".jsx"),
                rcstr!(".js"),
            ]),
            expected: vec![("./Component", "Component.web.tsx")],
        })
        .await;
    }

    /// Test that when `.web.tsx` doesn't exist, resolution falls back to `.tsx`.
    #[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_custom_extensions_fallback_when_web_missing() {
        resolve_relative_request_test(TestParams {
            files: vec!["Component.tsx"],
            pattern: rcstr!("./Component").into(),
            enable_typescript_with_output_extension: false,
            fully_specified: false,
            custom_extensions: Some(vec![
                rcstr!(".web.tsx"),
                rcstr!(".web.ts"),
                rcstr!(".web.jsx"),
                rcstr!(".web.js"),
                rcstr!(".tsx"),
                rcstr!(".ts"),
                rcstr!(".jsx"),
                rcstr!(".js"),
            ]),
            expected: vec![("./Component", "Component.tsx")],
        })
        .await;
    }

    /// Parameters for resolve_relative_request_test
    struct TestParams<'a> {
        files: Vec<&'a str>,
        pattern: Pattern,
        enable_typescript_with_output_extension: bool,
        fully_specified: bool,
        /// Custom extensions list; when `None`, uses the default `[".ts", ".js", ".json"]`
        custom_extensions: Option<Vec<RcStr>>,
        expected: Vec<(&'a str, &'a str)>,
    }

    /// Helper function to run a single extension priority test case
    async fn resolve_relative_request_test(
        TestParams {
            files,
            pattern,
            enable_typescript_with_output_extension,
            fully_specified,
            custom_extensions,
            expected,
        }: TestParams<'_>,
    ) {
        let scratch = tempfile::tempdir().unwrap();
        {
            let path = scratch.path();

            for file_name in &files {
                let file_path = path.join(file_name);
                if let Some(parent) = file_path.parent() {
                    create_dir_all(parent).unwrap();
                }
                File::create_new(&file_path)
                    .unwrap()
                    .write_all(format!("export default '{file_name}'").as_bytes())
                    .unwrap();
            }
        }

        let path: RcStr = scratch.path().to_str().unwrap().into();
        let expected_owned: Vec<(String, String)> = expected
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();

        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));

        let custom_extensions_owned = custom_extensions;

        tt.run_once(async move {
            #[turbo_tasks::value(transparent)]
            struct ResolveRelativeRequestOutput(Vec<(String, String)>);

            #[turbo_tasks::function(operation, root)]
            async fn resolve_relative_request_operation(
                path: RcStr,
                pattern: Pattern,
                enable_typescript_with_output_extension: bool,
                fully_specified: bool,
                custom_extensions: Option<Vec<RcStr>>,
            ) -> Result<Vc<ResolveRelativeRequestOutput>> {
                let fs = DiskFileSystem::new(rcstr!("temp"), Vc::cell(path));
                let lookup_path = turbo_tasks::read!(fs.root().owned())?;

                let result = turbo_tasks::read!(resolve_relative_helper(
                    lookup_path,
                    pattern,
                    enable_typescript_with_output_extension,
                    fully_specified,
                    custom_extensions,
                ))?;

                // Sequential on purpose (was `try_join`): task-body code must hand
                // `read!` SyncRead-able exprs under the sync build.
                let mut results: Vec<(String, String)> = Vec::new();
                for (k, v) in result.primary.iter() {
                    results.push((
                        k.to_string(),
                        if let ResolveResultItem::Source(source) = v {
                            turbo_tasks::read!(source.ident())?.path.path.to_string()
                        } else {
                            unreachable!()
                        },
                    ));
                }

                Ok(Vc::cell(results))
            }

            let results = resolve_relative_request_operation(
                path,
                pattern,
                enable_typescript_with_output_extension,
                fully_specified,
                custom_extensions_owned,
            )
            .read_strongly_consistent()
            .await?;

            assert_eq!(&*results, &expected_owned);

            Ok(())
        })
        .await
        .unwrap();
    }

    #[turbo_tasks::function]
    async fn resolve_relative_helper(
        lookup_path: FileSystemPath,
        pattern: Pattern,
        enable_typescript_with_output_extension: bool,
        fully_specified: bool,
        custom_extensions: Option<Vec<RcStr>>,
    ) -> Result<Vc<ResolveResult>> {
        let request = Request::parse(pattern.clone());

        let extensions = custom_extensions
            .unwrap_or_else(|| vec![rcstr!(".ts"), rcstr!(".js"), rcstr!(".json")]);
        let mut options_value = turbo_tasks::read!(
            node_esm_resolve_options(lookup_path.clone())
                .with_fully_specified(fully_specified)
                .with_extensions(extensions)
                .owned()
        )?;
        options_value.enable_typescript_with_output_extension =
            enable_typescript_with_output_extension;
        let options = options_value.clone().cell();
        match &*turbo_tasks::read!(request)? {
            Request::Relative {
                path,
                query,
                force_in_lookup_dir,
                fragment,
            } => {
                turbo_tasks::read!(super::resolve_relative_request(
                    lookup_path,
                    request,
                    options,
                    &options_value,
                    path,
                    query.clone(),
                    *force_in_lookup_dir,
                    fragment.clone(),
                ))
            }
            r => panic!("request should be relative, got {r:?}"),
        }
    }

    /// Snapshot of a `ModuleResolveResult::primary` array, encoded as `Vec<String>` so it
    /// can cross the strongly-consistent read boundary (operation outputs need to be
    /// `Encode`/`Decode`). One string per entry:
    ///   - `module:<path>`  for `Module(_)`
    ///   - `dup:<i>`        for `Duplicate(i)`
    ///   - `other`          for everything else
    #[turbo_tasks::value(transparent)]
    pub struct DupCheckResult(Vec<String>);

    turbo_tasks::dual_fn! {
    fn snapshot_primary(result: &ModuleResolveResult) -> Result<Vec<String>> {
        let mut out = Vec::with_capacity(result.primary.len());
        for (_, item) in result.primary.iter() {
            out.push(match *item {
                ModuleResolveResultItem::Module(m) => {
                    let ident = turbo_tasks::read!(m.ident())?;
                    format!("module:{}", ident.path.path)
                }
                ModuleResolveResultItem::Duplicate(i) => format!("dup:{i}"),
                _ => "other".to_string(),
            });
        }
        Ok(out)
    }
    }

    #[turbo_tasks::function]
    fn fs() -> Vc<Box<dyn FileSystem>> {
        Vc::upcast(DiskFileSystem::new(rcstr!("temp"), Vc::cell(fs_path())))
    }

    #[turbo_tasks::function]
    async fn make_module(name: RcStr) -> Result<Vc<Box<dyn Module>>> {
        let path = turbo_tasks::read!(fs().root())?.join(&name)?;
        let file_content =
            FileContent::Content(turbo_tasks_fs::File::from(format!("// {name}"))).resolved_cell();
        let content = turbo_tasks::read!(AssetContent::file(*file_content).to_resolved())?;
        let source = VirtualSource::new(path, *content);
        let module = turbo_tasks::read!(RawModule::new(Vc::upcast(source)).to_resolved())?;
        Ok(Vc::upcast(*module))
    }

    fn fs_path() -> RcStr {
        rcstr!("/tmp/_mdt")
    }

    #[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
    async fn modules_constructor_marks_module_duplicates() {
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        #[turbo_tasks::function(operation, root)]
        async fn run_test() -> Result<Vc<DupCheckResult>> {
            let m_a = turbo_tasks::read!(make_module(rcstr!("a.js")).to_resolved())?;
            let m_b = turbo_tasks::read!(make_module(rcstr!("b.js")).to_resolved())?;

            let result = turbo_tasks::read!(ModuleResolveResult::modules([
                (RequestKey::new(rcstr!("a")), m_a),
                (RequestKey::new(rcstr!("b")), m_b),
                (RequestKey::new(rcstr!("a-again")), m_a),
                (RequestKey::new(rcstr!("b-again")), m_b),
            ]))?;

            // primary_modules() yields each module exactly once, in first-seen order.
            let modules = turbo_tasks::read!(result.primary_modules())?;
            assert_eq!(modules, vec![m_a, m_b]);

            Ok(Vc::cell(turbo_tasks::read!(snapshot_primary(&result))?))
        }
        tt.run_once(async move {
            let snap = run_test().read_strongly_consistent().await?;
            assert_eq!(
                snap.iter().map(String::as_str).collect::<Vec<_>>(),
                vec!["module:a.js", "module:b.js", "dup:0", "dup:1"]
            );
            Ok(())
        })
        .await
        .unwrap();
    }

    #[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
    async fn first_module_returns_first_when_duplicates_follow() {
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        #[turbo_tasks::function(operation, root)]
        async fn run_test() -> Result<Vc<DupCheckResult>> {
            let m = turbo_tasks::read!(make_module(rcstr!("a.js")).to_resolved())?;

            let result = turbo_tasks::read!(ModuleResolveResult::modules([
                (RequestKey::default(), m),
                (RequestKey::new(rcstr!("again")), m),
                (RequestKey::new(rcstr!("once-more")), m),
            ]))?;

            assert_eq!(turbo_tasks::read!(result.first_module())?, Some(m));
            assert_eq!(turbo_tasks::read!(result.primary_modules())?, vec![m]);
            Ok(Vc::cell(turbo_tasks::read!(snapshot_primary(&result))?))
        }
        tt.run_once(async move {
            let snap = run_test().read_strongly_consistent().await?;
            assert_eq!(
                snap.iter().map(String::as_str).collect::<Vec<_>>(),
                vec!["module:a.js", "dup:0", "dup:0"]
            );
            Ok(())
        })
        .await
        .unwrap();
    }

    #[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
    async fn builder_marks_module_duplicates_skipping_non_dedup_items() {
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        #[turbo_tasks::function(operation, root)]
        async fn run_test() -> Result<Vc<DupCheckResult>> {
            let m = turbo_tasks::read!(make_module(rcstr!("a.js")).to_resolved())?;

            let mut builder = ModuleResolveResultBuilder {
                primary: Default::default(),
                affecting_sources: Vec::new(),
            };
            builder.primary.insert(
                RequestKey::new(rcstr!("k0")),
                ModuleResolveResultItem::Module(m),
            );
            builder.primary.insert(
                RequestKey::new(rcstr!("k1")),
                ModuleResolveResultItem::Empty,
            );
            builder.primary.insert(
                RequestKey::new(rcstr!("k2")),
                ModuleResolveResultItem::Module(m),
            );
            let result: ModuleResolveResult = builder.into();
            assert_eq!(turbo_tasks::read!(result.primary_modules())?, vec![m]);
            Ok(Vc::cell(turbo_tasks::read!(snapshot_primary(&result))?))
        }
        tt.run_once(async move {
            let snap = run_test().read_strongly_consistent().await?;

            assert_eq!(
                snap.iter().map(String::as_str).collect::<Vec<_>>(),
                vec!["module:a.js", "other", "dup:0"]
            );
            Ok(())
        })
        .await
        .unwrap();
    }

    #[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
    async fn alternatives_preserves_unique_module_set() {
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        #[turbo_tasks::function(operation, root)]
        async fn run_test() -> Result<Vc<DupCheckResult>> {
            let m_a = turbo_tasks::read!(make_module(rcstr!("a.js")).to_resolved())?;
            let m_b = turbo_tasks::read!(make_module(rcstr!("b.js")).to_resolved())?;

            // r1 has m_a twice → Module(m_a), Duplicate(0).
            let r1 = *ModuleResolveResult::modules([
                (RequestKey::new(rcstr!("k1")), m_a),
                (RequestKey::new(rcstr!("k2")), m_a),
            ]);
            // r2 prepended with m_b so the ordering inside r2 puts m_b at index 0 — a "stale"
            // 0 from r1 would now incorrectly point at m_b after a naive concatenation.
            let r2 = *ModuleResolveResult::module(m_b);

            let merged = turbo_tasks::read!(ModuleResolveResult::alternatives(vec![r1, r2]))?;
            assert_eq!(
                turbo_tasks::read!(merged.primary_modules())?,
                vec![m_a, m_b]
            );

            // Verify every Duplicate(i) is well-formed
            for (i, (_, item)) in merged.primary.iter().enumerate() {
                if let ModuleResolveResultItem::Duplicate(first) = *item {
                    assert!(
                        first < i,
                        "Duplicate index {first} at position {i} must point backwards"
                    );
                    let pointed = &merged.primary[first].1;
                    let ModuleResolveResultItem::Module(pointed_module) = *pointed else {
                        panic!(
                            "Duplicate({first}) at {i} points at {pointed:?}, expected a concrete \
                             Module"
                        );
                    };
                    // The pointed-at module must be m_a — proves the index was re-derived
                    // against the merged array, not carried stale from r1.
                    assert_eq!(
                        pointed_module, m_a,
                        "Duplicate({first}) at position {i} points at the wrong module"
                    );
                }
            }
            Ok(Vc::cell(turbo_tasks::read!(snapshot_primary(&merged))?))
        }
        tt.run_once(async move {
            let snap = run_test().read_strongly_consistent().await?;

            assert_eq!(
                snap.iter().map(String::as_str).collect::<Vec<_>>(),
                vec!["module:a.js", "dup:0", "module:b.js"]
            );
            Ok(())
        })
        .await
        .unwrap();
    }
}
