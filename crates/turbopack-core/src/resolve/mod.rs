use std::{
    borrow::Cow,
    collections::{BTreeMap, HashMap, HashSet},
    fmt::{Display, Formatter, Write},
    future::Future,
    iter::once,
    pin::Pin,
};

use anyhow::{bail, Result};
use indexmap::{indexmap, IndexMap, IndexSet};
use serde::{Deserialize, Serialize};
use tracing::{Instrument, Level};
use turbo_tasks::{trace::TraceRawVcs, RcStr, TaskInput, TryJoinIterExt, Value, ValueToString, Vc};
use turbo_tasks_fs::{
    util::{normalize_path, normalize_request},
    FileSystemEntryType, FileSystemPath, RealPathResult,
};

use self::{
    options::{
        resolve_modules_options, ConditionValue, ImportMapResult, ResolveInPackage,
        ResolveIntoPackage, ResolveModules, ResolveModulesOptions, ResolveOptions,
    },
    origin::{ResolveOrigin, ResolveOriginExt},
    parse::Request,
    pattern::Pattern,
    plugin::BeforeResolvePlugin,
    remap::{ExportsField, ImportsField},
};
use crate::{
    context::AssetContext,
    file_source::FileSource,
    issue::{resolve::ResolvingIssue, IssueExt, IssueSource},
    module::{Module, Modules, OptionModule},
    output::{OutputAsset, OutputAssets},
    package_json::{read_package_json, PackageJsonIssue},
    raw_module::RawModule,
    reference_type::ReferenceType,
    resolve::{
        pattern::{read_matches, PatternMatch},
        plugin::AfterResolvePlugin,
    },
    source::{OptionSource, Source, Sources},
};

mod alias_map;
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

use crate::{error::PrettyPrintError, issue::IssueSeverity};

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub enum ModuleResolveResultItem {
    Module(Vc<Box<dyn Module>>),
    OutputAsset(Vc<Box<dyn OutputAsset>>),
    External(RcStr, ExternalType),
    Ignore,
    Error(Vc<RcStr>),
    Empty,
    Custom(u8),
    Unresolveable,
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub struct ModuleResolveResult {
    pub primary: IndexMap<RequestKey, ModuleResolveResultItem>,
    pub affecting_sources: Vec<Vc<Box<dyn Source>>>,
}

impl Default for ModuleResolveResult {
    fn default() -> Self {
        ModuleResolveResult::unresolveable()
    }
}

impl ModuleResolveResult {
    pub fn unresolveable() -> Self {
        ModuleResolveResult {
            primary: IndexMap::new(),
            affecting_sources: Vec::new(),
        }
    }

    pub fn unresolveable_with_affecting_sources(
        affecting_sources: Vec<Vc<Box<dyn Source>>>,
    ) -> ModuleResolveResult {
        ModuleResolveResult {
            primary: IndexMap::new(),
            affecting_sources,
        }
    }

    pub fn ignored() -> ModuleResolveResult {
        Self::ignored_with_key(RequestKey::default())
    }

    pub fn ignored_with_key(request_key: RequestKey) -> ModuleResolveResult {
        ModuleResolveResult {
            primary: indexmap! { request_key => ModuleResolveResultItem::Ignore },
            affecting_sources: Vec::new(),
        }
    }

    pub fn module(module: Vc<Box<dyn Module>>) -> ModuleResolveResult {
        Self::module_with_key(RequestKey::default(), module)
    }

    pub fn module_with_key(
        request_key: RequestKey,
        module: Vc<Box<dyn Module>>,
    ) -> ModuleResolveResult {
        ModuleResolveResult {
            primary: indexmap! { request_key => ModuleResolveResultItem::Module(module) },
            affecting_sources: Vec::new(),
        }
    }

    pub fn output_asset(
        request_key: RequestKey,
        output_asset: Vc<Box<dyn OutputAsset>>,
    ) -> ModuleResolveResult {
        ModuleResolveResult {
            primary: indexmap! { request_key => ModuleResolveResultItem::OutputAsset(output_asset) },
            affecting_sources: Vec::new(),
        }
    }

    pub fn modules(
        modules: impl IntoIterator<Item = (RequestKey, Vc<Box<dyn Module>>)>,
    ) -> ModuleResolveResult {
        ModuleResolveResult {
            primary: modules
                .into_iter()
                .map(|(k, v)| (k, ModuleResolveResultItem::Module(v)))
                .collect(),
            affecting_sources: Vec::new(),
        }
    }

    pub fn output_assets(
        output_assets: impl IntoIterator<Item = (RequestKey, Vc<Box<dyn OutputAsset>>)>,
    ) -> ModuleResolveResult {
        ModuleResolveResult {
            primary: output_assets
                .into_iter()
                .map(|(k, v)| (k, ModuleResolveResultItem::OutputAsset(v)))
                .collect(),
            affecting_sources: Vec::new(),
        }
    }

    pub fn modules_with_affecting_sources(
        modules: impl IntoIterator<Item = (RequestKey, Vc<Box<dyn Module>>)>,
        affecting_sources: Vec<Vc<Box<dyn Source>>>,
    ) -> ModuleResolveResult {
        ModuleResolveResult {
            primary: modules
                .into_iter()
                .map(|(k, v)| (k, ModuleResolveResultItem::Module(v)))
                .collect(),
            affecting_sources,
        }
    }

    pub fn primary_modules_iter(&self) -> impl Iterator<Item = Vc<Box<dyn Module>>> + '_ {
        self.primary.iter().filter_map(|(_, item)| match item {
            &ModuleResolveResultItem::Module(a) => Some(a),
            _ => None,
        })
    }

    pub fn add_affecting_source_ref(&mut self, source: Vc<Box<dyn Source>>) {
        self.affecting_sources.push(source);
    }

    pub fn affecting_sources_iter(&self) -> impl Iterator<Item = Vc<Box<dyn Source>>> + '_ {
        self.affecting_sources.iter().copied()
    }

    fn clone_with_affecting_sources(
        &self,
        affecting_sources: Vec<Vc<Box<dyn Source>>>,
    ) -> ModuleResolveResult {
        ModuleResolveResult {
            primary: self.primary.clone(),
            affecting_sources,
        }
    }

    pub fn merge_alternatives(&mut self, other: &ModuleResolveResult) {
        for (k, v) in other.primary.iter() {
            if !self.primary.contains_key(k) {
                self.primary.insert(k.clone(), v.clone());
            }
        }
        let set = self
            .affecting_sources
            .iter()
            .copied()
            .collect::<HashSet<_>>();
        self.affecting_sources.extend(
            other
                .affecting_sources
                .iter()
                .filter(|source| !set.contains(source))
                .copied(),
        );
    }

    pub fn is_unresolveable_ref(&self) -> bool {
        self.primary.is_empty()
    }
}

#[turbo_tasks::value_impl]
impl ModuleResolveResult {
    #[turbo_tasks::function]
    pub async fn with_affecting_source(
        self: Vc<Self>,
        source: Vc<Box<dyn Source>>,
    ) -> Result<Vc<Self>> {
        let mut this = self.await?.clone_value();
        this.add_affecting_source_ref(source);
        Ok(this.into())
    }

    #[turbo_tasks::function]
    pub async fn with_affecting_sources(
        self: Vc<Self>,
        sources: Vec<Vc<Box<dyn Source>>>,
    ) -> Result<Vc<Self>> {
        let mut this = self.await?.clone_value();
        for source in sources {
            this.add_affecting_source_ref(source);
        }
        Ok(this.into())
    }

    /// Returns the first [ModuleResolveResult] that is not
    /// [ModuleResolveResult::Unresolveable] in the given list, while keeping
    /// track of all the affecting_sources in all the [ModuleResolveResult]s.
    #[turbo_tasks::function]
    pub async fn select_first(results: Vec<Vc<ModuleResolveResult>>) -> Result<Vc<Self>> {
        let mut affecting_sources = vec![];
        for result in &results {
            affecting_sources.extend(result.await?.affecting_sources_iter());
        }
        for result in results {
            let result_ref = result.await?;
            if !result_ref.is_unresolveable_ref() {
                return Ok(result_ref
                    .clone_with_affecting_sources(affecting_sources)
                    .cell());
            }
        }
        Ok(ModuleResolveResult::unresolveable_with_affecting_sources(affecting_sources).into())
    }

    #[turbo_tasks::function]
    pub async fn alternatives(results: Vec<Vc<ModuleResolveResult>>) -> Result<Vc<Self>> {
        if results.len() == 1 {
            return Ok(results.into_iter().next().unwrap());
        }
        let mut iter = results.into_iter().try_join().await?.into_iter();
        if let Some(current) = iter.next() {
            let mut current = current.clone_value();
            for result in iter {
                // For clippy -- This explicit deref is necessary
                let other = &*result;
                current.merge_alternatives(other);
            }
            Ok(Self::cell(current))
        } else {
            Ok(Self::cell(ModuleResolveResult::unresolveable()))
        }
    }

    #[turbo_tasks::function]
    pub async fn alternatives_with_affecting_sources(
        results: Vec<Vc<ModuleResolveResult>>,
        affecting_sources: Vec<Vc<Box<dyn Source>>>,
    ) -> Result<Vc<Self>> {
        if affecting_sources.is_empty() {
            return Ok(Self::alternatives(results));
        }
        if results.len() == 1 {
            return Ok(results
                .into_iter()
                .next()
                .unwrap()
                .with_affecting_sources(affecting_sources));
        }
        let mut iter = results.into_iter().try_join().await?.into_iter();
        if let Some(current) = iter.next() {
            let mut current = current.clone_value();
            for result in iter {
                // For clippy -- This explicit deref is necessary
                let other = &*result;
                current.merge_alternatives(other);
            }
            current.affecting_sources.extend(affecting_sources);
            Ok(Self::cell(current))
        } else {
            Ok(Self::cell(
                ModuleResolveResult::unresolveable_with_affecting_sources(affecting_sources),
            ))
        }
    }

    #[turbo_tasks::function]
    pub async fn is_unresolveable(self: Vc<Self>) -> Result<Vc<bool>> {
        let this = self.await?;
        Ok(Vc::cell(this.is_unresolveable_ref()))
    }

    #[turbo_tasks::function]
    pub async fn first_module(self: Vc<Self>) -> Result<Vc<OptionModule>> {
        let this = self.await?;
        Ok(Vc::cell(this.primary.iter().find_map(
            |(_, item)| match item {
                &ModuleResolveResultItem::Module(a) => Some(a),
                _ => None,
            },
        )))
    }

    /// Returns a set (no duplicates) of primary modules in the result. All
    /// modules are already resolved Vc.
    #[turbo_tasks::function]
    pub async fn primary_modules(self: Vc<Self>) -> Result<Vc<Modules>> {
        let this = self.await?;
        let mut iter = this.primary_modules_iter();
        let Some(first) = iter.next() else {
            return Ok(Vc::cell(vec![]));
        };
        let first = first.resolve().await?;

        let Some(second) = iter.next() else {
            return Ok(Vc::cell(vec![first]));
        };
        let second = second.resolve().await?;

        // We have at least two items, so we need to deduplicate them
        let mut set = IndexSet::from([first, second]);
        for module in this.primary_modules_iter() {
            set.insert(module.resolve().await?);
        }
        Ok(Vc::cell(set.into_iter().collect()))
    }

    #[turbo_tasks::function]
    pub async fn primary_output_assets(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;
        Ok(Vc::cell(
            this.primary
                .iter()
                .filter_map(|(_, item)| match item {
                    &ModuleResolveResultItem::OutputAsset(a) => Some(a),
                    _ => None,
                })
                .collect(),
        ))
    }
}

#[turbo_tasks::value(transparent)]
pub struct ModuleResolveResultOption(Option<Vc<ModuleResolveResult>>);

#[turbo_tasks::value_impl]
impl ModuleResolveResultOption {
    #[turbo_tasks::function]
    pub fn some(result: Vc<ModuleResolveResult>) -> Vc<Self> {
        ModuleResolveResultOption(Some(result)).cell()
    }

    #[turbo_tasks::function]
    pub fn none() -> Vc<Self> {
        ModuleResolveResultOption(None).cell()
    }
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, Serialize, Deserialize, TraceRawVcs, TaskInput)]
pub enum ExternalType {
    Url,
    CommonJs,
    EcmaScriptModule,
}

impl Display for ExternalType {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            ExternalType::CommonJs => write!(f, "commonjs"),
            ExternalType::EcmaScriptModule => write!(f, "esm"),
            ExternalType::Url => write!(f, "url"),
        }
    }
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub enum ResolveResultItem {
    Source(Vc<Box<dyn Source>>),
    External(RcStr, ExternalType),
    Ignore,
    Error(Vc<RcStr>),
    Empty,
    Custom(u8),
    Unresolveable,
}

/// This represents the key for a request that leads to a certain results during
/// resolving. A primary factor is the actual request string, but there are
/// other factors like exports conditions that can affect resolting and become
/// part of the key (assuming the condition is unknown at compile time)
#[derive(Clone, Debug, Default, Hash, Ord, PartialOrd)]
#[turbo_tasks::value(serialization = "auto_for_input")]
pub struct RequestKey {
    pub request: Option<RcStr>,
    pub conditions: BTreeMap<String, bool>,
}

impl Display for RequestKey {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        if let Some(request) = &self.request {
            write!(f, "{}", request)?;
        } else {
            write!(f, "<default>")?;
        }
        if !self.conditions.is_empty() {
            write!(f, " (")?;
            for (i, (k, v)) in self.conditions.iter().enumerate() {
                if i > 0 {
                    write!(f, ", ")?;
                }
                write!(f, "{}={}", k, v)?;
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
#[derive(Clone, Debug)]
pub struct ResolveResult {
    pub primary: IndexMap<RequestKey, ResolveResultItem>,
    pub affecting_sources: Vec<Vc<Box<dyn Source>>>,
}

impl Default for ResolveResult {
    fn default() -> Self {
        ResolveResult::unresolveable()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for ResolveResult {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        let mut result = String::new();
        for (i, (request, item)) in self.primary.iter().enumerate() {
            if i > 0 {
                result.push_str(", ");
            }
            write!(result, "{} -> ", request).unwrap();
            match item {
                ResolveResultItem::Source(a) => {
                    result.push_str(&a.ident().to_string().await?);
                }
                ResolveResultItem::External(s, ty) => {
                    result.push_str("external ");
                    result.push_str(s);
                    write!(result, " ({})", ty)?;
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
                ResolveResultItem::Unresolveable => {
                    result.push_str("unresolveable");
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
                result.push_str(&source.ident().to_string().await?);
            }
            result.push(')');
        }
        Ok(Vc::cell(result.into()))
    }
}

impl ResolveResult {
    pub fn unresolveable() -> Self {
        ResolveResult {
            primary: IndexMap::new(),
            affecting_sources: Vec::new(),
        }
    }

    pub fn unresolveable_with_affecting_sources(
        affecting_sources: Vec<Vc<Box<dyn Source>>>,
    ) -> ResolveResult {
        ResolveResult {
            primary: IndexMap::new(),
            affecting_sources,
        }
    }

    pub fn primary(result: ResolveResultItem) -> ResolveResult {
        Self::primary_with_key(RequestKey::default(), result)
    }

    pub fn primary_with_key(request_key: RequestKey, result: ResolveResultItem) -> ResolveResult {
        ResolveResult {
            primary: indexmap! { request_key => result },
            affecting_sources: Vec::new(),
        }
    }

    pub fn primary_with_affecting_sources(
        request_key: RequestKey,
        result: ResolveResultItem,
        affecting_sources: Vec<Vc<Box<dyn Source>>>,
    ) -> ResolveResult {
        ResolveResult {
            primary: indexmap! { request_key => result },
            affecting_sources,
        }
    }

    pub fn source(source: Vc<Box<dyn Source>>) -> ResolveResult {
        Self::source_with_key(RequestKey::default(), source)
    }

    pub fn source_with_key(request_key: RequestKey, source: Vc<Box<dyn Source>>) -> ResolveResult {
        ResolveResult {
            primary: indexmap! { request_key => ResolveResultItem::Source(source) },
            affecting_sources: Vec::new(),
        }
    }

    pub fn source_with_affecting_sources(
        request_key: RequestKey,
        source: Vc<Box<dyn Source>>,
        affecting_sources: Vec<Vc<Box<dyn Source>>>,
    ) -> ResolveResult {
        ResolveResult {
            primary: indexmap! { request_key => ResolveResultItem::Source(source) },
            affecting_sources,
        }
    }

    pub fn add_affecting_source_ref(&mut self, reference: Vc<Box<dyn Source>>) {
        self.affecting_sources.push(reference);
    }

    pub fn get_affecting_sources(&self) -> impl Iterator<Item = Vc<Box<dyn Source>>> + '_ {
        self.affecting_sources.iter().copied()
    }

    fn clone_with_affecting_sources(
        &self,
        affecting_sources: Vec<Vc<Box<dyn Source>>>,
    ) -> ResolveResult {
        ResolveResult {
            primary: self.primary.clone(),
            affecting_sources,
        }
    }

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
            .collect::<HashSet<_>>();
        self.affecting_sources.extend(
            other
                .affecting_sources
                .iter()
                .filter(|source| !set.contains(source))
                .copied(),
        );
    }

    pub fn is_unresolveable_ref(&self) -> bool {
        self.primary.is_empty()
    }

    pub async fn map<A, AF, R, RF>(&self, source_fn: A, affecting_source_fn: R) -> Result<Self>
    where
        A: Fn(Vc<Box<dyn Source>>) -> AF,
        AF: Future<Output = Result<Vc<Box<dyn Source>>>>,
        R: Fn(Vc<Box<dyn Source>>) -> RF,
        RF: Future<Output = Result<Vc<Box<dyn Source>>>>,
    {
        Ok(Self {
            primary: self
                .primary
                .iter()
                .map(|(request, result)| {
                    let asset_fn = &source_fn;
                    let request = request.clone();
                    let result = result.clone();
                    async move {
                        if let ResolveResultItem::Source(asset) = result {
                            Ok((request, ResolveResultItem::Source(asset_fn(asset).await?)))
                        } else {
                            Ok((request, result))
                        }
                    }
                })
                .try_join()
                .await?
                .into_iter()
                .collect(),
            affecting_sources: self
                .affecting_sources
                .iter()
                .copied()
                .map(affecting_source_fn)
                .try_join()
                .await?,
        })
    }

    pub async fn map_module<A, AF>(&self, source_fn: A) -> Result<ModuleResolveResult>
    where
        A: Fn(Vc<Box<dyn Source>>) -> AF,
        AF: Future<Output = Result<ModuleResolveResultItem>>,
    {
        Ok(ModuleResolveResult {
            primary: self
                .primary
                .iter()
                .map(|(request, item)| {
                    let asset_fn = &source_fn;
                    let request = request.clone();
                    let item = item.clone();
                    async move {
                        Ok((
                            request,
                            match item {
                                ResolveResultItem::Source(source) => asset_fn(source).await?,
                                ResolveResultItem::External(s, ty) => {
                                    ModuleResolveResultItem::External(s, ty)
                                }
                                ResolveResultItem::Ignore => ModuleResolveResultItem::Ignore,
                                ResolveResultItem::Empty => ModuleResolveResultItem::Empty,
                                ResolveResultItem::Error(e) => ModuleResolveResultItem::Error(e),
                                ResolveResultItem::Custom(u8) => {
                                    ModuleResolveResultItem::Custom(u8)
                                }
                                ResolveResultItem::Unresolveable => {
                                    ModuleResolveResultItem::Unresolveable
                                }
                            },
                        ))
                    }
                })
                .try_join()
                .await?
                .into_iter()
                .collect(),
            affecting_sources: self.affecting_sources.clone(),
        })
    }

    /// Returns a new [ResolveResult] where all [RequestKey]s are set to the
    /// passed `request`.
    pub fn with_request_ref(&self, request: RcStr) -> Self {
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

    pub fn add_conditions<'a>(&mut self, conditions: impl IntoIterator<Item = (&'a str, bool)>) {
        let mut primary = self.primary.drain(..).collect::<Vec<_>>();
        for (k, v) in conditions {
            for (key, _) in primary.iter_mut() {
                key.conditions.insert(k.to_string(), v);
            }
        }
        for (k, v) in primary {
            self.primary.insert(k, v);
        }
    }
}

#[turbo_tasks::value_impl]
impl ResolveResult {
    #[turbo_tasks::function]
    pub async fn as_raw_module_result(self: Vc<Self>) -> Result<Vc<ModuleResolveResult>> {
        Ok(self
            .await?
            .map_module(|asset| async move {
                Ok(ModuleResolveResultItem::Module(Vc::upcast(RawModule::new(
                    asset,
                ))))
            })
            .await?
            .cell())
    }

    #[turbo_tasks::function]
    pub async fn with_affecting_source(
        self: Vc<Self>,
        affecting_source: Vc<Box<dyn Source>>,
    ) -> Result<Vc<Self>> {
        let mut this = self.await?.clone_value();
        this.add_affecting_source_ref(affecting_source);
        Ok(this.into())
    }

    #[turbo_tasks::function]
    pub async fn with_affecting_sources(
        self: Vc<Self>,
        affecting_sources: Vec<Vc<Box<dyn Source>>>,
    ) -> Result<Vc<Self>> {
        let mut this = self.await?.clone_value();
        for affecting_source in affecting_sources {
            this.add_affecting_source_ref(affecting_source);
        }
        Ok(this.into())
    }

    /// Returns the first [ResolveResult] that is not
    /// [ResolveResult::Unresolveable] in the given list, while keeping track
    /// of all the affecting_sources in all the [ResolveResult]s.
    #[turbo_tasks::function]
    pub async fn select_first(results: Vec<Vc<ResolveResult>>) -> Result<Vc<Self>> {
        let mut affecting_sources = vec![];
        for result in &results {
            affecting_sources.extend(result.await?.get_affecting_sources());
        }
        for result in results {
            let result_ref = result.await?;
            if !result_ref.is_unresolveable_ref() {
                return Ok(result_ref
                    .clone_with_affecting_sources(affecting_sources)
                    .cell());
            }
        }
        Ok(ResolveResult::unresolveable_with_affecting_sources(affecting_sources).into())
    }

    #[turbo_tasks::function]
    pub async fn alternatives(results: Vec<Vc<ResolveResult>>) -> Result<Vc<Self>> {
        if results.len() == 1 {
            return Ok(results.into_iter().next().unwrap());
        }
        let mut iter = results.into_iter().try_join().await?.into_iter();
        if let Some(current) = iter.next() {
            let mut current = current.clone_value();
            for result in iter {
                // For clippy -- This explicit deref is necessary
                let other = &*result;
                current.merge_alternatives(other);
            }
            Ok(Self::cell(current))
        } else {
            Ok(Self::cell(ResolveResult::unresolveable()))
        }
    }

    #[turbo_tasks::function]
    pub async fn alternatives_with_affecting_sources(
        results: Vec<Vc<ResolveResult>>,
        affecting_sources: Vec<Vc<Box<dyn Source>>>,
    ) -> Result<Vc<Self>> {
        if affecting_sources.is_empty() {
            return Ok(Self::alternatives(results));
        }
        if results.len() == 1 {
            return Ok(results
                .into_iter()
                .next()
                .unwrap()
                .with_affecting_sources(affecting_sources));
        }
        let mut iter = results.into_iter().try_join().await?.into_iter();
        if let Some(current) = iter.next() {
            let mut current = current.clone_value();
            for result in iter {
                // For clippy -- This explicit deref is necessary
                let other = &*result;
                current.merge_alternatives(other);
            }
            current.affecting_sources.extend(affecting_sources);
            Ok(Self::cell(current))
        } else {
            Ok(Self::cell(
                ResolveResult::unresolveable_with_affecting_sources(affecting_sources),
            ))
        }
    }

    #[turbo_tasks::function]
    pub async fn is_unresolveable(self: Vc<Self>) -> Result<Vc<bool>> {
        let this = self.await?;
        Ok(Vc::cell(this.is_unresolveable_ref()))
    }

    #[turbo_tasks::function]
    pub async fn first_source(self: Vc<Self>) -> Result<Vc<OptionSource>> {
        let this = self.await?;
        Ok(Vc::cell(this.primary.iter().find_map(|(_, item)| {
            if let &ResolveResultItem::Source(a) = item {
                Some(a)
            } else {
                None
            }
        })))
    }

    #[turbo_tasks::function]
    pub async fn primary_sources(self: Vc<Self>) -> Result<Vc<Sources>> {
        let this = self.await?;
        Ok(Vc::cell(
            this.primary
                .iter()
                .filter_map(|(_, item)| {
                    if let &ResolveResultItem::Source(a) = item {
                        Some(a)
                    } else {
                        None
                    }
                })
                .collect(),
        ))
    }

    /// Returns a new [ResolveResult] where all [RequestKey]s are updates. The
    /// `old_request_key` (prefix) is replaced with the `request_key`. It's not
    /// expected that the [ResolveResult] contains [RequestKey]s that don't have
    /// the `old_request_key` prefix, but if there are still some, they are
    /// discarded.
    #[turbo_tasks::function]
    pub async fn with_replaced_request_key(
        self: Vc<Self>,
        old_request_key: RcStr,
        request_key: Value<RequestKey>,
    ) -> Result<Vc<Self>> {
        let this = self.await?;
        let request_key = request_key.into_value();
        let new_primary = this
            .primary
            .iter()
            .filter_map(|(k, v)| {
                let remaining = k.request.as_ref()?.strip_prefix(&*old_request_key)?;
                Some((
                    RequestKey {
                        request: request_key
                            .request
                            .as_ref()
                            .map(|r| format!("{}{}", r, remaining).into()),
                        conditions: request_key.conditions.clone(),
                    },
                    v.clone(),
                ))
            })
            .collect();
        Ok(ResolveResult {
            primary: new_primary,
            affecting_sources: this.affecting_sources.clone(),
        }
        .into())
    }

    /// Returns a new [ResolveResult] where all [RequestKey]s are set to the
    /// passed `request`.
    #[turbo_tasks::function]
    pub async fn with_request(self: Vc<Self>, request: RcStr) -> Result<Vc<Self>> {
        let this = self.await?;
        let new_primary = this
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
        Ok(ResolveResult {
            primary: new_primary,
            affecting_sources: this.affecting_sources.clone(),
        }
        .into())
    }
}

#[turbo_tasks::value(transparent)]
pub struct ResolveResultOption(Option<Vc<ResolveResult>>);

#[turbo_tasks::value_impl]
impl ResolveResultOption {
    #[turbo_tasks::function]
    pub fn some(result: Vc<ResolveResult>) -> Vc<Self> {
        ResolveResultOption(Some(result)).cell()
    }

    #[turbo_tasks::function]
    pub fn none() -> Vc<Self> {
        ResolveResultOption(None).cell()
    }
}

async fn exists(
    fs_path: Vc<FileSystemPath>,
    refs: &mut Vec<Vc<Box<dyn Source>>>,
) -> Result<Option<Vc<FileSystemPath>>> {
    type_exists(fs_path, FileSystemEntryType::File, refs).await
}

async fn dir_exists(
    fs_path: Vc<FileSystemPath>,
    refs: &mut Vec<Vc<Box<dyn Source>>>,
) -> Result<Option<Vc<FileSystemPath>>> {
    type_exists(fs_path, FileSystemEntryType::Directory, refs).await
}

async fn type_exists(
    fs_path: Vc<FileSystemPath>,
    ty: FileSystemEntryType,
    refs: &mut Vec<Vc<Box<dyn Source>>>,
) -> Result<Option<Vc<FileSystemPath>>> {
    let result = fs_path.resolve().await?.realpath_with_links().await?;
    for path in result.symlinks.iter() {
        refs.push(Vc::upcast(FileSource::new(*path)));
    }
    let path = result.path.resolve().await?;
    Ok(if *path.get_type().await? == ty {
        Some(path)
    } else {
        None
    })
}

async fn any_exists(
    fs_path: Vc<FileSystemPath>,
    refs: &mut Vec<Vc<Box<dyn Source>>>,
) -> Result<Option<(FileSystemEntryType, Vc<FileSystemPath>)>> {
    let result = fs_path.resolve().await?.realpath_with_links().await?;
    for path in result.symlinks.iter() {
        refs.push(Vc::upcast(FileSource::new(*path)));
    }
    let path = result.path.resolve().await?;
    let ty = *path.get_type().await?;
    Ok(
        if matches!(
            ty,
            FileSystemEntryType::NotFound | FileSystemEntryType::Error
        ) {
            None
        } else {
            Some((ty, path))
        },
    )
}

#[turbo_tasks::value(shared)]
enum ExportsFieldResult {
    Some(#[turbo_tasks(debug_ignore, trace_ignore)] ExportsField),
    None,
}

/// Extracts the "exports" field out of the nearest package.json, parsing it
/// into an appropriate [AliasMap] for lookups.
#[turbo_tasks::function]
async fn exports_field(package_json_path: Vc<FileSystemPath>) -> Result<Vc<ExportsFieldResult>> {
    let read = read_package_json(package_json_path).await?;
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
                path: package_json_path,
                error_message: err.to_string().into(),
            }
            .cell()
            .emit();
            Ok(ExportsFieldResult::None.cell())
        }
    }
}

#[turbo_tasks::value(shared)]
enum ImportsFieldResult {
    Some(
        #[turbo_tasks(debug_ignore, trace_ignore)] ImportsField,
        Vc<FileSystemPath>,
    ),
    None,
}

/// Extracts the "imports" field out of the nearest package.json, parsing it
/// into an appropriate [AliasMap] for lookups.
#[turbo_tasks::function]
async fn imports_field(lookup_path: Vc<FileSystemPath>) -> Result<Vc<ImportsFieldResult>> {
    let package_json_context = find_context_file(lookup_path, package_json()).await?;
    let FindContextFileResult::Found(package_json_path, _refs) = &*package_json_context else {
        return Ok(ImportsFieldResult::None.cell());
    };

    let read = read_package_json(*package_json_path).await?;
    let package_json = match &*read {
        Some(json) => json,
        None => return Ok(ImportsFieldResult::None.cell()),
    };

    let Some(imports) = package_json.get("imports") else {
        return Ok(ImportsFieldResult::None.cell());
    };
    match imports.try_into() {
        Ok(imports) => Ok(ImportsFieldResult::Some(imports, *package_json_path).cell()),
        Err(err) => {
            PackageJsonIssue {
                path: *package_json_path,
                error_message: err.to_string().into(),
            }
            .cell()
            .emit();
            Ok(ImportsFieldResult::None.cell())
        }
    }
}

#[turbo_tasks::function]
pub fn package_json() -> Vc<Vec<RcStr>> {
    Vc::cell(vec!["package.json".into()])
}

#[turbo_tasks::value(shared)]
pub enum FindContextFileResult {
    Found(Vc<FileSystemPath>, Vec<Vc<Box<dyn Source>>>),
    NotFound(Vec<Vc<Box<dyn Source>>>),
}

#[turbo_tasks::function]
pub async fn find_context_file(
    lookup_path: Vc<FileSystemPath>,
    names: Vc<Vec<RcStr>>,
) -> Result<Vc<FindContextFileResult>> {
    let mut refs = Vec::new();
    let context_value = lookup_path.await?;
    for name in &*names.await? {
        let fs_path = lookup_path.join(name.clone());
        if let Some(fs_path) = exists(fs_path, &mut refs).await? {
            return Ok(FindContextFileResult::Found(fs_path, refs).into());
        }
    }
    if context_value.is_root() {
        return Ok(FindContextFileResult::NotFound(refs).into());
    }
    if refs.is_empty() {
        // Tailcall
        Ok(find_context_file(
            lookup_path.parent().resolve().await?,
            names,
        ))
    } else {
        let parent_result = find_context_file(lookup_path.parent().resolve().await?, names).await?;
        Ok(match &*parent_result {
            FindContextFileResult::Found(p, r) => {
                refs.extend(r.iter().copied());
                FindContextFileResult::Found(*p, refs)
            }
            FindContextFileResult::NotFound(r) => {
                refs.extend(r.iter().copied());
                FindContextFileResult::NotFound(refs)
            }
        }
        .into())
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, Debug)]
enum FindPackageItem {
    PackageDirectory(Vc<FileSystemPath>),
    PackageFile(Vc<FileSystemPath>),
}

#[turbo_tasks::value]
struct FindPackageResult {
    packages: Vec<FindPackageItem>,
    affecting_sources: Vec<Vc<Box<dyn Source>>>,
}

#[turbo_tasks::function]
async fn find_package(
    lookup_path: Vc<FileSystemPath>,
    package_name: RcStr,
    options: Vc<ResolveModulesOptions>,
) -> Result<Vc<FindPackageResult>> {
    let mut packages = vec![];
    let mut affecting_sources = vec![];
    let options = options.await?;
    for resolve_modules in &options.modules {
        match resolve_modules {
            ResolveModules::Nested(root_vc, names) => {
                let mut lookup_path = lookup_path;
                let mut lookup_path_value = lookup_path.await?;
                // For clippy -- This explicit deref is necessary
                let root = &*root_vc.await?;
                while lookup_path_value.is_inside_ref(root) {
                    for name in names.iter() {
                        let fs_path = lookup_path.join(name.clone());
                        if let Some(fs_path) = dir_exists(fs_path, &mut affecting_sources).await? {
                            let fs_path = fs_path.join(package_name.clone());
                            if let Some(fs_path) =
                                dir_exists(fs_path, &mut affecting_sources).await?
                            {
                                packages.push(FindPackageItem::PackageDirectory(fs_path));
                            }
                        }
                    }
                    lookup_path = lookup_path.parent().resolve().await?;
                    let new_context_value = lookup_path.await?;
                    if *new_context_value == *lookup_path_value {
                        break;
                    }
                    lookup_path_value = new_context_value;
                }
            }
            ResolveModules::Path(context) => {
                let package_dir = context.join(package_name.clone());
                if let Some((ty, package_dir)) =
                    any_exists(package_dir, &mut affecting_sources).await?
                {
                    match ty {
                        FileSystemEntryType::Directory => {
                            packages.push(FindPackageItem::PackageDirectory(package_dir));
                        }
                        FileSystemEntryType::File => {
                            packages.push(FindPackageItem::PackageFile(package_dir));
                        }
                        _ => {}
                    }
                }
                for extension in &options.extensions {
                    let package_file = package_dir.append(extension.clone());
                    if let Some(package_file) = exists(package_file, &mut affecting_sources).await?
                    {
                        packages.push(FindPackageItem::PackageFile(package_file));
                    }
                }
            }
            ResolveModules::Registry(_, _) => todo!(),
        }
    }
    Ok(FindPackageResult::cell(FindPackageResult {
        packages,
        affecting_sources,
    }))
}

fn merge_results(results: Vec<Vc<ResolveResult>>) -> Vc<ResolveResult> {
    match results.len() {
        0 => ResolveResult::unresolveable().into(),
        1 => results.into_iter().next().unwrap(),
        _ => ResolveResult::alternatives(results),
    }
}

fn merge_results_with_affecting_sources(
    results: Vec<Vc<ResolveResult>>,
    affecting_sources: Vec<Vc<Box<dyn Source>>>,
) -> Vc<ResolveResult> {
    if affecting_sources.is_empty() {
        return merge_results(results);
    }
    match results.len() {
        0 => ResolveResult::unresolveable_with_affecting_sources(affecting_sources).into(),
        1 => results
            .into_iter()
            .next()
            .unwrap()
            .with_affecting_sources(affecting_sources),
        _ => ResolveResult::alternatives_with_affecting_sources(results, affecting_sources),
    }
}

#[turbo_tasks::function]
pub async fn resolve_raw(
    lookup_dir: Vc<FileSystemPath>,
    path: Vc<Pattern>,
    force_in_lookup_dir: bool,
) -> Result<Vc<ResolveResult>> {
    async fn to_result(request: &str, path: Vc<FileSystemPath>) -> Result<Vc<ResolveResult>> {
        let RealPathResult { path, symlinks } = &*path.realpath_with_links().await?;
        Ok(ResolveResult::source_with_affecting_sources(
            RequestKey::new(request.into()),
            Vc::upcast(FileSource::new(*path)),
            symlinks
                .iter()
                .copied()
                .map(FileSource::new)
                .map(Vc::upcast)
                .collect(),
        )
        .cell())
    }

    let mut results = Vec::new();

    let lookup_dir_str = lookup_dir.to_string().await?;
    let pat = path.await?;
    if let Some(pat) = pat
        .filter_could_match("/ROOT/")
        .and_then(|pat| pat.filter_could_not_match("/ROOT/fsd8nz8og54z"))
    {
        let path = Pattern::new(pat);
        let matches = read_matches(lookup_dir.root(), "/ROOT/".into(), true, path).await?;
        if matches.len() > 10000 {
            let path_str = path.to_string().await?;
            println!(
                "WARN: resolving abs pattern {} in {} leads to {} results",
                path_str,
                lookup_dir_str,
                matches.len()
            );
        } else {
            for m in matches.iter() {
                if let PatternMatch::File(request, path) = m {
                    results.push(to_result(request, *path).await?);
                }
            }
        }
    }

    {
        let matches = read_matches(lookup_dir, "".into(), force_in_lookup_dir, path).await?;
        if matches.len() > 10000 {
            println!(
                "WARN: resolving pattern {} in {} leads to {} results",
                pat,
                lookup_dir_str,
                matches.len()
            );
        }
        for m in matches.iter() {
            if let PatternMatch::File(request, path) = m {
                results.push(to_result(request, *path).await?);
            }
        }
    }

    Ok(merge_results(results))
}

#[turbo_tasks::function]
pub async fn resolve(
    lookup_path: Vc<FileSystemPath>,
    reference_type: Value<ReferenceType>,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
) -> Result<Vc<ResolveResult>> {
    resolve_inline(lookup_path, reference_type.into_value(), request, options).await
}

pub async fn resolve_inline(
    lookup_path: Vc<FileSystemPath>,
    reference_type: ReferenceType,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
) -> Result<Vc<ResolveResult>> {
    let span = {
        let lookup_path = lookup_path.to_string().await?.to_string();
        let request = request.to_string().await?.to_string();
        tracing::info_span!(
            "resolving",
            lookup_path = lookup_path,
            request = request,
            reference_type = display(&reference_type),
        )
    };
    async {
        let reference_type = Value::new(reference_type);
        let before_plugins_result =
            handle_before_resolve_plugins(lookup_path, reference_type.clone(), request, options)
                .await?;

        let raw_result = match before_plugins_result {
            Some(result) => result,
            None => {
                resolve_internal(lookup_path, request, options)
                    .resolve()
                    .await?
            }
        };

        let result =
            handle_after_resolve_plugins(lookup_path, reference_type, request, options, raw_result)
                .await?;
        Ok(result)
    }
    .instrument(span)
    .await
}

#[turbo_tasks::function]
pub async fn url_resolve(
    origin: Vc<Box<dyn ResolveOrigin>>,
    request: Vc<Request>,
    reference_type: Value<ReferenceType>,
    issue_source: Option<Vc<IssueSource>>,
    issue_severity: Vc<IssueSeverity>,
) -> Result<Vc<ModuleResolveResult>> {
    let resolve_options = origin.resolve_options(reference_type.clone());
    let rel_request = request.as_relative();
    let rel_result = resolve(
        origin.origin_path().parent(),
        reference_type.clone(),
        rel_request,
        resolve_options,
    );
    let result = if *rel_result.is_unresolveable().await? && rel_request.resolve().await? != request
    {
        resolve(
            origin.origin_path().parent(),
            reference_type.clone(),
            request,
            resolve_options,
        )
        .with_affecting_sources(rel_result.await?.get_affecting_sources().collect())
    } else {
        rel_result
    };
    let result = origin
        .asset_context()
        .process_resolve_result(result, reference_type.clone());
    handle_resolve_error(
        result,
        reference_type,
        origin.origin_path(),
        request,
        resolve_options,
        issue_severity,
        issue_source,
    )
    .await
}

async fn handle_before_resolve_plugins(
    lookup_path: Vc<FileSystemPath>,
    reference_type: Value<ReferenceType>,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
) -> Result<Option<Vc<ResolveResult>>> {
    for plugin in &options.await?.before_resolve_plugins {
        let condition = plugin.before_resolve_condition().resolve().await?;
        if !condition.await?.matches(request).await? {
            continue;
        }

        if let Some(result) = *plugin
            .before_resolve(lookup_path, reference_type.clone(), request)
            .await?
        {
            return Ok(Some(result));
        }
    }
    Ok(None)
}

async fn handle_after_resolve_plugins(
    lookup_path: Vc<FileSystemPath>,
    reference_type: Value<ReferenceType>,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
    result: Vc<ResolveResult>,
) -> Result<Vc<ResolveResult>> {
    async fn apply_plugins_to_path(
        path: Vc<FileSystemPath>,
        lookup_path: Vc<FileSystemPath>,
        reference_type: Value<ReferenceType>,
        request: Vc<Request>,
        options: Vc<ResolveOptions>,
    ) -> Result<Option<Vc<ResolveResult>>> {
        for plugin in &options.await?.plugins {
            let after_resolve_condition = plugin.after_resolve_condition().resolve().await?;
            if *after_resolve_condition.matches(path).await? {
                if let Some(result) = *plugin
                    .after_resolve(path, lookup_path, reference_type.clone(), request)
                    .await?
                {
                    return Ok(Some(result));
                }
            }
        }
        Ok(None)
    }

    let mut changed = false;
    let result_value = result.await?;

    let mut new_primary = IndexMap::new();
    let mut new_affecting_sources = Vec::new();

    for (key, primary) in result_value.primary.iter() {
        if let &ResolveResultItem::Source(source) = primary {
            let path = source.ident().path().resolve().await?;
            if let Some(new_result) =
                apply_plugins_to_path(path, lookup_path, reference_type.clone(), request, options)
                    .await?
            {
                let new_result = new_result.await?;
                changed = true;
                new_primary.extend(
                    new_result
                        .primary
                        .values()
                        .cloned()
                        .map(|item| (key.clone(), item)),
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

    let mut affecting_sources = result_value.affecting_sources.clone();
    affecting_sources.append(&mut new_affecting_sources);

    Ok(ResolveResult {
        primary: new_primary,
        affecting_sources,
    }
    .cell())
}

#[turbo_tasks::function]
async fn resolve_internal(
    lookup_path: Vc<FileSystemPath>,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
) -> Result<Vc<ResolveResult>> {
    resolve_internal_inline(lookup_path, request, options).await
}

fn resolve_internal_boxed(
    lookup_path: Vc<FileSystemPath>,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
) -> Pin<Box<dyn Future<Output = Result<Vc<ResolveResult>>> + Send>> {
    Box::pin(resolve_internal_inline(lookup_path, request, options))
}

async fn resolve_internal_inline(
    lookup_path: Vc<FileSystemPath>,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
) -> Result<Vc<ResolveResult>> {
    let span = {
        let lookup_path = lookup_path.to_string().await?.to_string();
        let request = request.to_string().await?.to_string();
        tracing::info_span!(
            "internal resolving",
            lookup_path = lookup_path,
            request = request
        )
    };
    async move {
        // This explicit deref of `options` is necessary
        #[allow(clippy::explicit_auto_deref)]
        let options_value: &ResolveOptions = &*options.await?;

        let mut has_alias = false;

        // Apply import mappings if provided
        if let Some(import_map) = &options_value.import_map {
            let result = import_map.await?.lookup(lookup_path, request).await?;
            if !matches!(result, ImportMapResult::NoEntry) {
                has_alias = true;
                let resolved_result = resolve_import_map_result(
                    &result,
                    lookup_path,
                    lookup_path,
                    request,
                    options,
                    request.query(),
                )
                .await?;
                // We might have matched an alias in the import map, but there is no guarantee
                // the alias actually resolves to something. For instance, a tsconfig.json
                // `compilerOptions.paths` option might alias "@*" to "./*", which
                // would also match a request to "@emotion/core". Here, we follow what the
                // Typescript resolution algorithm does in case an alias match
                // doesn't resolve to anything: fall back to resolving the request normally.
                if let Some(result) = resolved_result {
                    if !*result.is_unresolveable().await? {
                        return Ok(result);
                    }
                }
            }
        }

        let request_value = request.await?;
        let result = match &*request_value {
            Request::Dynamic => ResolveResult::unresolveable().into(),
            Request::Alternatives { requests } => {
                let results = requests
                    .iter()
                    .map(|req| resolve_internal_boxed(lookup_path, *req, options))
                    .try_join()
                    .await?;

                merge_results(results)
            }
            Request::Raw {
                path,
                query,
                force_in_lookup_dir,
                fragment,
            } => {
                let mut results = Vec::new();
                let matches = read_matches(
                    lookup_path,
                    "".into(),
                    *force_in_lookup_dir,
                    Pattern::new(path.clone()).resolve().await?,
                )
                .await?;

                for m in matches.iter() {
                    match m {
                        PatternMatch::File(matched_pattern, path) => {
                            results.push(
                                resolved(
                                    RequestKey::new(matched_pattern.clone()),
                                    *path,
                                    lookup_path,
                                    request,
                                    options_value,
                                    options,
                                    *query,
                                    *fragment,
                                )
                                .await?,
                            );
                        }
                        PatternMatch::Directory(matched_pattern, path) => {
                            results.push(
                                resolve_into_folder(*path, options)
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
                if !fragment.await?.is_empty() {
                    if let Ok(result) = resolve_relative_request(
                        lookup_path,
                        request,
                        options,
                        options_value,
                        path,
                        *query,
                        *force_in_lookup_dir,
                        *fragment,
                    )
                    .await
                    {
                        return Ok(result);
                    }
                }
                // Resolve without fragment
                resolve_relative_request(
                    lookup_path,
                    request,
                    options,
                    options_value,
                    path,
                    *query,
                    *force_in_lookup_dir,
                    Vc::cell(RcStr::default()),
                )
                .await?
            }
            Request::Module {
                module,
                path,
                query,
                fragment,
            } => {
                resolve_module_request(
                    lookup_path,
                    request,
                    options,
                    options_value,
                    module,
                    path,
                    *query,
                    *fragment,
                )
                .await?
            }
            Request::ServerRelative {
                path,
                query,
                fragment,
            } => {
                let mut new_pat = path.clone();
                new_pat.push_front(RcStr::from(".").into());
                let relative = Request::relative(Value::new(new_pat), *query, *fragment, true);

                if !has_alias {
                    ResolvingIssue {
                        severity: IssueSeverity::Error.cell(),
                        request_type: "server relative import: not implemented yet".to_string(),
                        request,
                        file_path: lookup_path,
                        resolve_options: options,
                        error_message: Some(
                            "server relative imports are not implemented yet. Please try an \
                             import relative to the file you are importing from."
                                .to_string(),
                        ),
                        source: None,
                    }
                    .cell()
                    .emit();
                }

                resolve_internal_boxed(
                    lookup_path.root().resolve().await?,
                    relative.resolve().await?,
                    options,
                )
                .await?
            }
            Request::Windows {
                path: _,
                query: _,
                fragment: _,
            } => {
                if !has_alias {
                    ResolvingIssue {
                        severity: IssueSeverity::Error.cell(),
                        request_type: "windows import: not implemented yet".to_string(),
                        request,
                        file_path: lookup_path,
                        resolve_options: options,
                        error_message: Some("windows imports are not implemented yet".to_string()),
                        source: None,
                    }
                    .cell()
                    .emit();
                }

                ResolveResult::unresolveable().into()
            }
            Request::Empty => ResolveResult::unresolveable().into(),
            Request::PackageInternal { path } => {
                let options_value = options.await?;
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
                resolve_package_internal_with_imports_field(
                    lookup_path,
                    request,
                    options,
                    path,
                    &conditions,
                    &unspecified_conditions,
                )
                .await?
            }
            Request::Uri {
                protocol,
                remainder,
                query: _,
                fragment: _,
            } => {
                let uri: RcStr = format!("{}{}", protocol, remainder).into();
                ResolveResult::primary_with_key(
                    RequestKey::new(uri.clone()),
                    ResolveResultItem::External(uri, ExternalType::Url),
                )
                .into()
            }
            Request::Unknown { path } => {
                if !has_alias {
                    ResolvingIssue {
                        severity: IssueSeverity::Error.cell(),
                        request_type: format!("unknown import: `{}`", path),
                        request,
                        file_path: lookup_path,
                        resolve_options: options,
                        error_message: None,
                        source: None,
                    }
                    .cell()
                    .emit();
                }
                ResolveResult::unresolveable().into()
            }
        };

        // Apply fallback import mappings if provided
        if let Some(import_map) = &options_value.fallback_import_map {
            if *result.is_unresolveable().await? {
                let result = import_map.await?.lookup(lookup_path, request).await?;
                let resolved_result = resolve_import_map_result(
                    &result,
                    lookup_path,
                    lookup_path,
                    request,
                    options,
                    request.query(),
                )
                .await?;
                if let Some(result) = resolved_result {
                    if !*result.is_unresolveable().await? {
                        return Ok(result);
                    }
                }
            }
        }

        Ok(result)
    }
    .instrument(span)
    .await
}

#[turbo_tasks::function]
async fn resolve_into_folder(
    package_path: Vc<FileSystemPath>,
    options: Vc<ResolveOptions>,
) -> Result<Vc<ResolveResult>> {
    let package_json_path = package_path.join("package.json".into());
    let options_value = options.await?;

    for resolve_into_package in options_value.into_package.iter() {
        match resolve_into_package {
            ResolveIntoPackage::MainField { field: name } => {
                if let Some(package_json) = &*read_package_json(package_json_path).await? {
                    if let Some(field_value) = package_json[name.as_str()].as_str() {
                        let normalized_request: RcStr = normalize_request(field_value).into();
                        if normalized_request.is_empty()
                            || &*normalized_request == "."
                            || &*normalized_request == "./"
                        {
                            continue;
                        }
                        let request = Request::parse(Value::new(normalized_request.into()));

                        // main field will always resolve not fully specified
                        let options = if options_value.fully_specified {
                            options.with_fully_specified(false).resolve().await?
                        } else {
                            options
                        };
                        let result = &*resolve_internal_inline(package_path, request, options)
                            .await?
                            .await?;
                        // we are not that strict when a main field fails to resolve
                        // we continue to try other alternatives
                        if !result.is_unresolveable_ref() {
                            let mut result = result.with_request_ref(".".into());
                            result.add_affecting_source_ref(Vc::upcast(FileSource::new(
                                package_json_path,
                            )));
                            return Ok(result.into());
                        }
                    }
                };
            }
            ResolveIntoPackage::ExportsField { .. } => {}
        }
    }

    if options_value.fully_specified {
        return Ok(ResolveResult::unresolveable().into());
    }

    // fall back to dir/index.[js,ts,...]
    let pattern = match &options_value.default_files[..] {
        [] => return Ok(ResolveResult::unresolveable().into()),
        [file] => Pattern::Constant(format!("./{file}").into()),
        files => Pattern::Alternatives(
            files
                .iter()
                .map(|file| Pattern::Constant(format!("./{file}").into()))
                .collect(),
        ),
    };

    let request = Request::parse(Value::new(pattern));

    Ok(
        resolve_internal_inline(package_path, request.resolve().await?, options)
            .await?
            .with_request(".".into()),
    )
}

#[tracing::instrument(level = Level::TRACE, skip_all)]
async fn resolve_relative_request(
    lookup_path: Vc<FileSystemPath>,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
    options_value: &ResolveOptions,
    path_pattern: &Pattern,
    query: Vc<RcStr>,
    force_in_lookup_dir: bool,
    fragment: Vc<RcStr>,
) -> Result<Vc<ResolveResult>> {
    // Check alias field for aliases first
    let lookup_path_ref = &*lookup_path.await?;
    if let Some(result) = apply_in_package(
        lookup_path,
        options,
        options_value,
        |package_path| {
            let request = path_pattern.as_string()?;
            let prefix_path = package_path.get_path_to(lookup_path_ref)?;
            let request = normalize_request(&format!("./{prefix_path}/{request}"));
            Some(request.into())
        },
        query,
        fragment,
    )
    .await?
    {
        return Ok(result);
    }

    let mut new_path = path_pattern.clone();

    let fragment_val = fragment.await?;

    if !fragment_val.is_empty() {
        new_path.push(Pattern::Alternatives(
            once(Pattern::Constant("".into()))
                .chain(once(Pattern::Constant(format!("#{fragment_val}").into())))
                .collect(),
        ));
    }

    if !options_value.fully_specified {
        // Add the extensions as alternatives to the path
        // read_matches keeps the order of alternatives intact
        new_path.push(Pattern::Alternatives(
            once(Pattern::Constant("".into()))
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

    let mut results = Vec::new();
    let matches = read_matches(
        lookup_path,
        "".into(),
        force_in_lookup_dir,
        Pattern::new(new_path).resolve().await?,
    )
    .await?;

    for m in matches.iter() {
        if let PatternMatch::File(matched_pattern, path) = m {
            let mut pushed = false;
            if !options_value.fully_specified {
                for ext in options_value.extensions.iter() {
                    let Some(matched_pattern) = matched_pattern.strip_suffix(&**ext) else {
                        continue;
                    };

                    if !fragment_val.is_empty() {
                        // If the fragment is not empty, we need to strip it from the matched
                        // pattern
                        if let Some(matched_pattern) = matched_pattern
                            .strip_suffix(&**fragment_val)
                            .and_then(|s| s.strip_suffix('#'))
                        {
                            results.push(
                                resolved(
                                    RequestKey::new(matched_pattern.into()),
                                    *path,
                                    lookup_path,
                                    request,
                                    options_value,
                                    options,
                                    query,
                                    Vc::cell(RcStr::default()),
                                )
                                .await?,
                            );
                            pushed = true;
                        }
                    }
                    if !pushed && path_pattern.is_match(matched_pattern) {
                        results.push(
                            resolved(
                                RequestKey::new(matched_pattern.into()),
                                *path,
                                lookup_path,
                                request,
                                options_value,
                                options,
                                query,
                                fragment,
                            )
                            .await?,
                        );
                        pushed = true;
                    }
                }
            }
            if !fragment_val.is_empty() {
                // If the fragment is not empty, we need to strip it from the matched pattern
                if let Some(matched_pattern) = matched_pattern
                    .strip_suffix(&**fragment_val)
                    .and_then(|s| s.strip_suffix('#'))
                {
                    results.push(
                        resolved(
                            RequestKey::new(matched_pattern.into()),
                            *path,
                            lookup_path,
                            request,
                            options_value,
                            options,
                            query,
                            Vc::cell(RcStr::default()),
                        )
                        .await?,
                    );
                    pushed = true;
                }
            }

            if !pushed || path_pattern.is_match(matched_pattern) {
                results.push(
                    resolved(
                        RequestKey::new(matched_pattern.clone()),
                        *path,
                        lookup_path,
                        request,
                        options_value,
                        options,
                        query,
                        fragment,
                    )
                    .await?,
                );
            }
        }
    }
    // Directory matches must be resolved AFTER file matches
    for m in matches.iter() {
        if let PatternMatch::Directory(matched_pattern, path) = m {
            results.push(resolve_into_folder(*path, options).with_request(matched_pattern.clone()));
        }
    }

    Ok(merge_results(results))
}

#[tracing::instrument(level = Level::TRACE, skip_all)]
async fn apply_in_package(
    lookup_path: Vc<FileSystemPath>,
    options: Vc<ResolveOptions>,
    options_value: &ResolveOptions,
    get_request: impl Fn(&FileSystemPath) -> Option<RcStr>,
    query: Vc<RcStr>,
    fragment: Vc<RcStr>,
) -> Result<Option<Vc<ResolveResult>>> {
    // Check alias field for module aliases first
    for in_package in options_value.in_package.iter() {
        // resolve_module_request is called when importing a node
        // module, not a PackageInternal one, so the imports field
        // doesn't apply.
        let ResolveInPackage::AliasField(field) = in_package else {
            continue;
        };

        let FindContextFileResult::Found(package_json_path, refs) =
            &*find_context_file(lookup_path, package_json().resolve().await?).await?
        else {
            continue;
        };

        let read = read_package_json(*package_json_path).await?;
        let Some(package_json) = &*read else {
            continue;
        };

        let Some(field_value) = package_json[field.as_str()].as_object() else {
            continue;
        };

        let package_path = package_json_path.parent().resolve().await?;

        let Some(request) = get_request(&*package_path.await?) else {
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
            return Ok(Some(
                ResolveResult::primary_with_affecting_sources(
                    request_key,
                    ResolveResultItem::Ignore,
                    refs,
                )
                .cell(),
            ));
        }

        if let Some(value) = value.as_str() {
            if value == &*request {
                // This would be a cycle, so we ignore it
                return Ok(None);
            }
            return Ok(Some(
                resolve_internal(
                    package_path,
                    Request::parse(Value::new(Pattern::Constant(value.into())))
                        .with_query(query)
                        .with_fragment(fragment),
                    options,
                )
                .with_replaced_request_key(value.into(), Value::new(request_key))
                .with_affecting_sources(refs),
            ));
        }

        ResolvingIssue {
            severity: IssueSeverity::Error.cell(),
            file_path: *package_json_path,
            request_type: format!("alias field ({field})"),
            request: Request::parse(Value::new(Pattern::Constant(request))),
            resolve_options: options,
            error_message: Some(format!("invalid alias field value: {}", value)),
            source: None,
        }
        .cell()
        .emit();

        return Ok(Some(
            ResolveResult::unresolveable_with_affecting_sources(refs).cell(),
        ));
    }
    Ok(None)
}

#[tracing::instrument(level = Level::TRACE, skip_all)]
async fn resolve_module_request(
    lookup_path: Vc<FileSystemPath>,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
    options_value: &ResolveOptions,
    module: &str,
    path: &Pattern,
    query: Vc<RcStr>,
    fragment: Vc<RcStr>,
) -> Result<Vc<ResolveResult>> {
    // Check alias field for module aliases first
    if let Some(result) = apply_in_package(
        lookup_path,
        options,
        options_value,
        |_| {
            let full_pattern = Pattern::concat([RcStr::from(module).into(), path.clone()]);
            full_pattern.into_string()
        },
        query,
        fragment,
    )
    .await?
    {
        return Ok(result);
    }

    let mut results = vec![];

    let result = find_package(
        lookup_path,
        module.into(),
        resolve_modules_options(options).resolve().await?,
    )
    .await?;

    if result.packages.is_empty() {
        return Ok(ResolveResult::unresolveable_with_affecting_sources(
            result.affecting_sources.clone(),
        )
        .into());
    }

    // There may be more than one package with the same name. For instance, in a
    // TypeScript project, `compilerOptions.baseUrl` can declare a path where to
    // resolve packages. A request to "foo/bar" might resolve to either
    // "[baseUrl]/foo/bar" or "[baseUrl]/node_modules/foo/bar", and we'll need to
    // try both.
    for item in &result.packages {
        match *item {
            FindPackageItem::PackageDirectory(package_path) => {
                results.push(resolve_into_package(
                    Value::new(path.clone()),
                    package_path,
                    query,
                    fragment,
                    options,
                ));
            }
            FindPackageItem::PackageFile(package_path) => {
                if path.is_match("") {
                    let resolved = resolved(
                        RequestKey::new(".".into()),
                        package_path,
                        lookup_path,
                        request,
                        options_value,
                        options,
                        query,
                        fragment,
                    )
                    .await?;
                    results.push(resolved)
                }
            }
        }
    }

    let module_result =
        merge_results_with_affecting_sources(results, result.affecting_sources.clone())
            .with_replaced_request_key(".".into(), Value::new(RequestKey::new(module.into())));

    if options_value.prefer_relative {
        let module_prefix: RcStr = format!("./{module}").into();
        let pattern = Pattern::concat([
            module_prefix.clone().into(),
            RcStr::from("/").into(),
            path.clone(),
        ]);
        let relative = Request::relative(Value::new(pattern), query, fragment, true);
        let relative_result =
            resolve_internal_boxed(lookup_path, relative.resolve().await?, options).await?;
        let relative_result = relative_result
            .with_replaced_request_key(module_prefix, Value::new(RequestKey::new(module.into())));

        Ok(merge_results(vec![relative_result, module_result]))
    } else {
        Ok(module_result)
    }
}

#[turbo_tasks::function]
async fn resolve_into_package(
    path: Value<Pattern>,
    package_path: Vc<FileSystemPath>,
    query: Vc<RcStr>,
    fragment: Vc<RcStr>,
    options: Vc<ResolveOptions>,
) -> Result<Vc<ResolveResult>> {
    let path = path.into_value();
    let options_value = options.await?;
    let mut results = Vec::new();

    let is_root_match = path.is_match("") || path.is_match("/");
    let could_match_others = path.could_match_others("");

    for resolve_into_package in options_value.into_package.iter() {
        match resolve_into_package {
            // handled by the `resolve_into_folder` call below
            ResolveIntoPackage::MainField { .. } => {}
            ResolveIntoPackage::ExportsField {
                conditions,
                unspecified_conditions,
            } => {
                let package_json_path = package_path.join("package.json".into());
                let ExportsFieldResult::Some(exports_field) =
                    &*exports_field(package_json_path).await?
                else {
                    continue;
                };

                let Some(path) = path.clone().into_string() else {
                    todo!("pattern into an exports field is not implemented yet");
                };

                let path = if &*path == "/" {
                    ".".to_string()
                } else {
                    format!(".{path}")
                };

                results.push(
                    handle_exports_imports_field(
                        package_path,
                        package_json_path,
                        options,
                        exports_field,
                        &path,
                        conditions,
                        unspecified_conditions,
                        query,
                    )
                    .await?,
                );

                // other options do not apply anymore when an exports
                // field exist
                return Ok(merge_results(results));
            }
        }
    }

    // apply main field(s) or fallback to index.js if there's no subpath
    if is_root_match {
        results.push(resolve_into_folder(package_path, options));
    }

    if could_match_others {
        let mut new_pat = path.clone();
        new_pat.push_front(RcStr::from(".").into());

        let relative = Request::relative(Value::new(new_pat), query, fragment, true);
        results
            .push(resolve_internal_inline(package_path, relative.resolve().await?, options).await?);
    }

    Ok(merge_results(results))
}

#[tracing::instrument(level = Level::TRACE, skip_all)]
async fn resolve_import_map_result(
    result: &ImportMapResult,
    lookup_path: Vc<FileSystemPath>,
    original_lookup_path: Vc<FileSystemPath>,
    original_request: Vc<Request>,
    options: Vc<ResolveOptions>,
    query: Vc<RcStr>,
) -> Result<Option<Vc<ResolveResult>>> {
    Ok(match result {
        ImportMapResult::Result(result) => Some(*result),
        ImportMapResult::Alias(request, alias_lookup_path) => {
            let request = *request;
            let lookup_path = alias_lookup_path.unwrap_or(lookup_path);
            // We must avoid cycles during resolving
            if request.resolve().await? == original_request
                && lookup_path.resolve().await? == original_lookup_path
            {
                None
            } else {
                Some(resolve_internal(lookup_path, request, options))
            }
        }
        ImportMapResult::Alternatives(list) => {
            let results = list
                .iter()
                .map(|result| {
                    resolve_import_map_result_boxed(
                        result,
                        lookup_path,
                        original_lookup_path,
                        original_request,
                        options,
                        query,
                    )
                })
                .try_join()
                .await?;

            Some(ResolveResult::select_first(
                results.into_iter().flatten().collect(),
            ))
        }
        ImportMapResult::NoEntry => None,
    })
}

type ResolveImportMapResult = Result<Option<Vc<ResolveResult>>>;

fn resolve_import_map_result_boxed<'a>(
    result: &'a ImportMapResult,
    lookup_path: Vc<FileSystemPath>,
    original_lookup_path: Vc<FileSystemPath>,
    original_request: Vc<Request>,
    options: Vc<ResolveOptions>,
    query: Vc<RcStr>,
) -> Pin<Box<dyn Future<Output = ResolveImportMapResult> + Send + 'a>> {
    Box::pin(resolve_import_map_result(
        result,
        lookup_path,
        original_lookup_path,
        original_request,
        options,
        query,
    ))
}

#[tracing::instrument(level = Level::TRACE, skip_all)]
async fn resolved(
    request_key: RequestKey,
    fs_path: Vc<FileSystemPath>,
    original_context: Vc<FileSystemPath>,
    original_request: Vc<Request>,
    options_value: &ResolveOptions,
    options: Vc<ResolveOptions>,
    query: Vc<RcStr>,
    fragment: Vc<RcStr>,
) -> Result<Vc<ResolveResult>> {
    let RealPathResult { path, symlinks } = &*fs_path.realpath_with_links().await?;

    let path_ref = &*path.await?;
    // Check alias field for path aliases first
    if let Some(result) = apply_in_package(
        path.parent().resolve().await?,
        options,
        options_value,
        |package_path| package_path.get_relative_path_to(path_ref),
        query,
        fragment,
    )
    .await?
    {
        return Ok(result);
    }

    if let Some(resolved_map) = options_value.resolved_map {
        let result = resolved_map
            .lookup(*path, original_context, original_request)
            .await?;

        let resolved_result = resolve_import_map_result(
            &result,
            path.parent(),
            original_context,
            original_request,
            options,
            query,
        )
        .await?;

        if let Some(result) = resolved_result {
            return Ok(result);
        }
    }

    Ok(ResolveResult::source_with_affecting_sources(
        request_key,
        Vc::upcast(FileSource::new_with_query(*path, query)),
        symlinks
            .iter()
            .copied()
            .map(FileSource::new)
            .map(Vc::upcast)
            .collect(),
    )
    .into())
}

async fn handle_exports_imports_field(
    package_path: Vc<FileSystemPath>,
    package_json_path: Vc<FileSystemPath>,
    options: Vc<ResolveOptions>,
    exports_imports_field: &AliasMap<SubpathValue>,
    path: &str,
    conditions: &BTreeMap<RcStr, ConditionValue>,
    unspecified_conditions: &ConditionValue,
    query: Vc<RcStr>,
) -> Result<Vc<ResolveResult>> {
    let mut results = Vec::new();
    let mut conditions_state = HashMap::new();

    let query_str = query.await?;

    let req = format!("{}{}", path, query_str);
    let values = exports_imports_field
        .lookup(&req)
        .map(AliasMatch::try_into_self)
        .collect::<Result<Vec<_>>>()?;

    for value in values.iter() {
        if value.add_results(
            conditions,
            unspecified_conditions,
            &mut conditions_state,
            &mut results,
        ) {
            break;
        }
    }

    let mut resolved_results = Vec::new();
    for (result_path, conditions) in results {
        if let Some(result_path) = normalize_path(result_path) {
            let request =
                Request::parse(Value::new(RcStr::from(format!("./{}", result_path)).into()));
            let resolve_result = resolve_internal_boxed(package_path, request, options).await?;
            if conditions.is_empty() {
                resolved_results.push(resolve_result.with_request(path.into()));
            } else {
                let mut resolve_result = resolve_result.await?.with_request_ref(path.into());
                resolve_result.add_conditions(conditions);
                resolved_results.push(resolve_result.cell());
            }
        }
    }

    // other options do not apply anymore when an exports field exist
    Ok(merge_results_with_affecting_sources(
        resolved_results,
        vec![Vc::upcast(FileSource::new(package_json_path))],
    ))
}

/// Resolves a `#dep` import using the containing package.json's `imports`
/// field. The dep may be a constant string or a pattern, and the values can be
/// static strings or conditions like `import` or `require` to handle ESM/CJS
/// with differently compiled files.
async fn resolve_package_internal_with_imports_field(
    file_path: Vc<FileSystemPath>,
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
            severity: IssueSeverity::Error.cell(),
            file_path,
            request_type: format!("package imports request: `{specifier}`"),
            request,
            resolve_options,
            error_message: None,
            source: None,
        }
        .cell()
        .emit();
        return Ok(ResolveResult::unresolveable().into());
    }

    let imports_result = imports_field(file_path).await?;
    let (imports, package_json_path) = match &*imports_result {
        ImportsFieldResult::Some(i, p) => (i, p),
        ImportsFieldResult::None => return Ok(ResolveResult::unresolveable().into()),
    };

    handle_exports_imports_field(
        package_json_path.parent(),
        *package_json_path,
        resolve_options,
        imports,
        specifier,
        conditions,
        unspecified_conditions,
        Vc::<RcStr>::default(),
    )
    .await
}

async fn is_unresolveable(result: Vc<ModuleResolveResult>) -> Result<bool> {
    Ok(*result.resolve().await?.is_unresolveable().await?)
}

pub async fn handle_resolve_error(
    result: Vc<ModuleResolveResult>,
    reference_type: Value<ReferenceType>,
    origin_path: Vc<FileSystemPath>,
    request: Vc<Request>,
    resolve_options: Vc<ResolveOptions>,
    severity: Vc<IssueSeverity>,
    source: Option<Vc<IssueSource>>,
) -> Result<Vc<ModuleResolveResult>> {
    Ok(match is_unresolveable(result).await {
        Ok(unresolveable) => {
            if unresolveable {
                ResolvingIssue {
                    severity,
                    file_path: origin_path,
                    request_type: format!("{} request", reference_type.into_value()),
                    request,
                    resolve_options,
                    error_message: None,
                    source,
                }
                .cell()
                .emit();
            }

            result
        }
        Err(err) => {
            ResolvingIssue {
                severity,
                file_path: origin_path,
                request_type: format!("{} request", reference_type.into_value()),
                request,
                resolve_options,
                error_message: Some(format!("{}", PrettyPrintError(&err))),
                source,
            }
            .cell()
            .emit();
            ModuleResolveResult::unresolveable().cell()
        }
    })
}

// TODO this should become a TaskInput instead of a Vc
/// ModulePart represents a part of a module.
///
/// Currently this is used only for ESMs.
#[turbo_tasks::value]
pub enum ModulePart {
    /// Represents the side effects of a module. This part is evaluated even if
    /// all exports are unused.
    Evaluation,
    /// Represents an export of a module.
    Export(Vc<RcStr>),
    /// Represents a renamed export of a module.
    RenamedExport {
        original_export: Vc<RcStr>,
        export: Vc<RcStr>,
    },
    /// Represents a namespace object of a module exported as named export.
    RenamedNamespace { export: Vc<RcStr> },
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

#[turbo_tasks::value_impl]
impl ModulePart {
    #[turbo_tasks::function]
    pub fn evaluation() -> Vc<Self> {
        ModulePart::Evaluation.cell()
    }
    #[turbo_tasks::function]
    pub fn export(export: RcStr) -> Vc<Self> {
        ModulePart::Export(Vc::cell(export)).cell()
    }
    #[turbo_tasks::function]
    pub fn renamed_export(original_export: RcStr, export: RcStr) -> Vc<Self> {
        ModulePart::RenamedExport {
            original_export: Vc::cell(original_export),
            export: Vc::cell(export),
        }
        .cell()
    }
    #[turbo_tasks::function]
    pub fn renamed_namespace(export: RcStr) -> Vc<Self> {
        ModulePart::RenamedNamespace {
            export: Vc::cell(export),
        }
        .cell()
    }
    #[turbo_tasks::function]
    pub fn internal(id: u32) -> Vc<Self> {
        ModulePart::Internal(id).cell()
    }
    #[turbo_tasks::function]
    pub fn locals() -> Vc<Self> {
        ModulePart::Locals.cell()
    }
    #[turbo_tasks::function]
    pub fn exports() -> Vc<Self> {
        ModulePart::Exports.cell()
    }
    #[turbo_tasks::function]
    pub fn facade() -> Vc<Self> {
        ModulePart::Facade.cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for ModulePart {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(match self {
            ModulePart::Evaluation => "module evaluation".into(),
            ModulePart::Export(export) => format!("export {}", export.await?).into(),
            ModulePart::RenamedExport {
                original_export,
                export,
            } => {
                let original_export = original_export.await?;
                let export = export.await?;
                format!("export {} as {}", original_export, export).into()
            }
            ModulePart::RenamedNamespace { export } => {
                format!("export * as {}", export.await?).into()
            }
            ModulePart::Internal(id) => format!("internal part {}", id).into(),
            ModulePart::Locals => "locals".into(),
            ModulePart::Exports => "exports".into(),
            ModulePart::Facade => "facade".into(),
        }))
    }
}
