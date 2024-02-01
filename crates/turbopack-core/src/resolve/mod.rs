use std::{
    borrow::Cow,
    collections::{BTreeMap, HashMap, HashSet},
    future::Future,
    iter::once,
    pin::Pin,
};

use anyhow::{anyhow, bail, Result};
use serde_json::Value as JsonValue;
use tracing::{Instrument, Level};
use turbo_tasks::{TryJoinIterExt, Value, ValueToString, Vc};
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
        plugin::ResolvePlugin,
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
    OriginalReferenceExternal,
    OriginalReferenceTypeExternal(String),
    Ignore,
    Empty,
    Custom(u8),
    Unresolveable,
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub struct ModuleResolveResult {
    pub primary: Vec<ModuleResolveResultItem>,
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
            primary: Vec::new(),
            affecting_sources: Vec::new(),
        }
    }

    pub fn unresolveable_with_affecting_sources(
        affecting_sources: Vec<Vc<Box<dyn Source>>>,
    ) -> ModuleResolveResult {
        ModuleResolveResult {
            primary: Vec::new(),
            affecting_sources,
        }
    }

    pub fn module(module: Vc<Box<dyn Module>>) -> ModuleResolveResult {
        ModuleResolveResult {
            primary: vec![ModuleResolveResultItem::Module(module)],
            affecting_sources: Vec::new(),
        }
    }

    pub fn output_asset(output_asset: Vc<Box<dyn OutputAsset>>) -> ModuleResolveResult {
        ModuleResolveResult {
            primary: vec![ModuleResolveResultItem::OutputAsset(output_asset)],
            affecting_sources: Vec::new(),
        }
    }

    pub fn modules(modules: Vec<Vc<Box<dyn Module>>>) -> ModuleResolveResult {
        ModuleResolveResult {
            primary: modules
                .into_iter()
                .map(ModuleResolveResultItem::Module)
                .collect(),
            affecting_sources: Vec::new(),
        }
    }

    pub fn output_assets(output_assets: Vec<Vc<Box<dyn OutputAsset>>>) -> ModuleResolveResult {
        ModuleResolveResult {
            primary: output_assets
                .into_iter()
                .map(ModuleResolveResultItem::OutputAsset)
                .collect(),
            affecting_sources: Vec::new(),
        }
    }

    pub fn modules_with_affecting_sources(
        modules: Vec<Vc<Box<dyn Module>>>,
        affecting_sources: Vec<Vc<Box<dyn Source>>>,
    ) -> ModuleResolveResult {
        ModuleResolveResult {
            primary: modules
                .into_iter()
                .map(ModuleResolveResultItem::Module)
                .collect(),
            affecting_sources,
        }
    }

    pub fn primary_modules_iter(&self) -> impl Iterator<Item = Vc<Box<dyn Module>>> + '_ {
        self.primary.iter().filter_map(|item| match *item {
            ModuleResolveResultItem::Module(a) => Some(a),
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
        self.primary.extend(other.primary.iter().cloned());
        self.affecting_sources
            .extend(other.affecting_sources.iter().copied());
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
        Ok(Vc::cell(this.primary.iter().find_map(|item| match *item {
            ModuleResolveResultItem::Module(a) => Some(a),
            _ => None,
        })))
    }

    #[turbo_tasks::function]
    pub async fn primary_modules(self: Vc<Self>) -> Result<Vc<Modules>> {
        let this = self.await?;
        Ok(Vc::cell(this.primary_modules_iter().collect()))
    }

    #[turbo_tasks::function]
    pub async fn primary_output_assets(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;
        Ok(Vc::cell(
            this.primary
                .iter()
                .filter_map(|item| match *item {
                    ModuleResolveResultItem::OutputAsset(a) => Some(a),
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

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub enum ResolveResultItem {
    Source(Vc<Box<dyn Source>>),
    OriginalReferenceTypeExternal(String),
    Ignore,
    Empty,
    Custom(u8),
    Unresolveable,
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub struct ResolveResult {
    pub primary: Vec<ResolveResultItem>,
    pub affecting_sources: Vec<Vc<Box<dyn Source>>>,
}

impl Default for ResolveResult {
    fn default() -> Self {
        ResolveResult::unresolveable()
    }
}

impl ResolveResult {
    pub fn unresolveable() -> Self {
        ResolveResult {
            primary: Vec::new(),
            affecting_sources: Vec::new(),
        }
    }

    pub fn unresolveable_with_affecting_sources(
        affecting_sources: Vec<Vc<Box<dyn Source>>>,
    ) -> ResolveResult {
        ResolveResult {
            primary: Vec::new(),
            affecting_sources,
        }
    }

    pub fn primary(result: ResolveResultItem) -> ResolveResult {
        ResolveResult {
            primary: vec![result],
            affecting_sources: Vec::new(),
        }
    }

    pub fn primary_with_affecting_sources(
        result: ResolveResultItem,
        affecting_sources: Vec<Vc<Box<dyn Source>>>,
    ) -> ResolveResult {
        ResolveResult {
            primary: vec![result],
            affecting_sources,
        }
    }

    pub fn source(source: Vc<Box<dyn Source>>) -> ResolveResult {
        ResolveResult {
            primary: vec![ResolveResultItem::Source(source)],
            affecting_sources: Vec::new(),
        }
    }

    pub fn source_with_affecting_sources(
        source: Vc<Box<dyn Source>>,
        affecting_sources: Vec<Vc<Box<dyn Source>>>,
    ) -> ResolveResult {
        ResolveResult {
            primary: vec![ResolveResultItem::Source(source)],
            affecting_sources,
        }
    }

    pub fn sources(sources: Vec<Vc<Box<dyn Source>>>) -> ResolveResult {
        ResolveResult {
            primary: sources.into_iter().map(ResolveResultItem::Source).collect(),
            affecting_sources: Vec::new(),
        }
    }

    pub fn sources_with_affecting_sources(
        sources: Vec<Vc<Box<dyn Source>>>,
        affecting_sources: Vec<Vc<Box<dyn Source>>>,
    ) -> ResolveResult {
        ResolveResult {
            primary: sources.into_iter().map(ResolveResultItem::Source).collect(),
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
        self.primary.extend(other.primary.iter().cloned());
        self.affecting_sources
            .extend(other.affecting_sources.iter().copied());
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
                .cloned()
                .map(|result| {
                    let asset_fn = &source_fn;
                    async move {
                        if let ResolveResultItem::Source(asset) = result {
                            Ok(ResolveResultItem::Source(asset_fn(asset).await?))
                        } else {
                            Ok(result)
                        }
                    }
                })
                .try_join()
                .await?,
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
                .cloned()
                .map(|item| {
                    let asset_fn = &source_fn;
                    async move {
                        Ok(match item {
                            ResolveResultItem::Source(source) => asset_fn(source).await?,
                            ResolveResultItem::OriginalReferenceTypeExternal(s) => {
                                ModuleResolveResultItem::OriginalReferenceTypeExternal(s)
                            }
                            ResolveResultItem::Ignore => ModuleResolveResultItem::Ignore,
                            ResolveResultItem::Empty => ModuleResolveResultItem::Empty,
                            ResolveResultItem::Custom(u8) => ModuleResolveResultItem::Custom(u8),
                            ResolveResultItem::Unresolveable => {
                                ModuleResolveResultItem::Unresolveable
                            }
                        })
                    }
                })
                .try_join()
                .await?,
            affecting_sources: self.affecting_sources.clone(),
        })
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
        Ok(Vc::cell(this.primary.iter().find_map(|item| {
            if let ResolveResultItem::Source(a) = item {
                Some(*a)
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
                .filter_map(|item| {
                    if let ResolveResultItem::Source(a) = item {
                        Some(*a)
                    } else {
                        None
                    }
                })
                .collect(),
        ))
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
                error_message: err.to_string(),
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
                error_message: err.to_string(),
            }
            .cell()
            .emit();
            Ok(ImportsFieldResult::None.cell())
        }
    }
}

#[turbo_tasks::function]
pub fn package_json() -> Vc<Vec<String>> {
    Vc::cell(vec!["package.json".to_string()])
}

#[turbo_tasks::value(shared)]
pub enum FindContextFileResult {
    Found(Vc<FileSystemPath>, Vec<Vc<Box<dyn Source>>>),
    NotFound(Vec<Vc<Box<dyn Source>>>),
}

#[turbo_tasks::function]
pub async fn find_context_file(
    lookup_path: Vc<FileSystemPath>,
    names: Vc<Vec<String>>,
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

#[turbo_tasks::value]
struct FindPackageResult {
    packages: Vec<Vc<FileSystemPath>>,
    affecting_sources: Vec<Vc<Box<dyn Source>>>,
}

#[turbo_tasks::function]
async fn find_package(
    lookup_path: Vc<FileSystemPath>,
    package_name: String,
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
                                packages.push(fs_path);
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
                if dir_exists(package_dir, &mut affecting_sources)
                    .await?
                    .is_some()
                {
                    packages.push(package_dir.resolve().await?);
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
    async fn to_result(path: Vc<FileSystemPath>) -> Result<Vc<ResolveResult>> {
        let RealPathResult { path, symlinks } = &*path.realpath_with_links().await?;
        Ok(ResolveResult::source_with_affecting_sources(
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

    let pat = path.await?;
    if let Some(pat) = pat
        .filter_could_match("/ROOT/")
        .and_then(|pat| pat.filter_could_not_match("/ROOT/fsd8nz8og54z"))
    {
        let path = Pattern::new(pat);
        let matches = read_matches(lookup_dir.root(), "/ROOT/".to_string(), true, path).await?;
        if matches.len() > 10000 {
            println!(
                "WARN: resolving abs pattern {} in {} leads to {} results",
                path.to_string().await?,
                lookup_dir.to_string().await?,
                matches.len()
            );
        } else {
            for m in matches.iter() {
                if let PatternMatch::File(_, path) = m {
                    results.push(to_result(*path).await?);
                }
            }
        }
    }

    {
        let matches = read_matches(lookup_dir, "".to_string(), force_in_lookup_dir, path).await?;
        if matches.len() > 10000 {
            println!(
                "WARN: resolving pattern {} in {} leads to {} results",
                pat,
                lookup_dir.to_string().await?,
                matches.len()
            );
        }
        for m in matches.iter() {
            if let PatternMatch::File(_, path) = m {
                results.push(to_result(*path).await?);
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
    let span = {
        let lookup_path = lookup_path.to_string().await?;
        let request = request.to_string().await?;
        tracing::info_span!(
            "resolving",
            lookup_path = *lookup_path,
            request = *request,
            reference_type = display(&*reference_type)
        )
    };
    async {
        let raw_result = resolve_internal_inline(lookup_path, request, options)
            .await?
            .resolve()
            .await?;
        let result =
            handle_resolve_plugins(lookup_path, reference_type, request, options, raw_result)
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

async fn handle_resolve_plugins(
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

    let mut new_primary = Vec::new();
    let mut new_affecting_sources = Vec::new();

    for primary in result_value.primary.iter() {
        if let &ResolveResultItem::Source(source) = primary {
            let path = source.ident().path().resolve().await?;
            if let Some(new_result) =
                apply_plugins_to_path(path, lookup_path, reference_type.clone(), request, options)
                    .await?
            {
                let new_result = new_result.await?;
                changed = true;
                new_primary.extend(new_result.primary.iter().cloned());
                new_affecting_sources.extend(new_result.affecting_sources.iter().copied());
            } else {
                new_primary.push(primary.clone());
            }
        } else {
            new_primary.push(primary.clone());
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
    let span = {
        let lookup_path = lookup_path.to_string().await?;
        let request = request.to_string().await?;
        tracing::info_span!("resolving", lookup_path = *lookup_path, request = *request)
    };
    resolve_internal_inline(lookup_path, request, options)
        .instrument(span)
        .await
}

fn resolve_internal_boxed(
    lookup_path: Vc<FileSystemPath>,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
) -> Pin<Box<dyn Future<Output = Result<Vc<ResolveResult>>> + Send>> {
    Box::pin(resolve_internal_inline(lookup_path, request, options))
}

#[tracing::instrument(level = Level::TRACE, skip_all)]
async fn resolve_internal_inline(
    lookup_path: Vc<FileSystemPath>,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
) -> Result<Vc<ResolveResult>> {
    // This explicit deref of `options` is necessary
    #[allow(clippy::explicit_auto_deref)]
    let options_value: &ResolveOptions = &*options.await?;

    // Apply import mappings if provided
    if let Some(import_map) = &options_value.import_map {
        let result = import_map.await?.lookup(lookup_path, request).await?;
        if !matches!(result, ImportMapResult::NoEntry) {
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
                return Ok(result);
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
        } => {
            let mut results = Vec::new();
            let matches = read_matches(
                lookup_path,
                "".to_string(),
                *force_in_lookup_dir,
                Pattern::new(path.clone()).resolve().await?,
            )
            .await?;

            for m in matches.iter() {
                match m {
                    PatternMatch::File(_, path) => {
                        results.push(
                            resolved(*path, lookup_path, request, options_value, options, *query)
                                .await?,
                        );
                    }
                    PatternMatch::Directory(_, path) => {
                        results.push(resolve_into_folder(*path, options, *query));
                    }
                }
            }

            merge_results(results)
        }
        Request::Relative {
            path,
            query,
            force_in_lookup_dir,
        } => {
            resolve_relative_request(
                lookup_path,
                request,
                options,
                options_value,
                path,
                *query,
                *force_in_lookup_dir,
            )
            .await?
        }
        Request::Module {
            module,
            path,
            query,
        } => {
            resolve_module_request(lookup_path, options, options_value, module, path, *query)
                .await?
        }
        Request::ServerRelative { path, query } => {
            let mut new_pat = path.clone();
            new_pat.push_front(".".to_string().into());
            let relative = Request::relative(Value::new(new_pat), *query, true);

            ResolvingIssue {
                severity: IssueSeverity::Error.cell(),
                request_type: "server relative import: not implemented yet".to_string(),
                request,
                file_path: lookup_path,
                resolve_options: options,
                error_message: Some(
                    "server relative imports are not implemented yet. Please try an import \
                     relative to the file you are importing from."
                        .to_string(),
                ),
                source: None,
            }
            .cell()
            .emit();

            resolve_internal_boxed(
                lookup_path.root().resolve().await?,
                relative.resolve().await?,
                options,
            )
            .await?
        }
        Request::Windows { path: _, query: _ } => {
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
        } => ResolveResult::primary(ResolveResultItem::OriginalReferenceTypeExternal(format!(
            "{}{}",
            protocol, remainder
        )))
        .into(),
        Request::Unknown { path } => {
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
                return Ok(result);
            }
        }
    }

    Ok(result)
}

#[turbo_tasks::function]
async fn resolve_into_folder(
    package_path: Vc<FileSystemPath>,
    options: Vc<ResolveOptions>,
    query: Vc<String>,
) -> Result<Vc<ResolveResult>> {
    let package_json_path = package_path.join("package.json".to_string());
    let options_value = options.await?;
    for resolve_into_package in options_value.into_package.iter() {
        match resolve_into_package {
            ResolveIntoPackage::Default(req) => {
                let str = "./".to_string()
                    + &*normalize_path(req).ok_or_else(|| {
                        anyhow!(
                            "ResolveIntoPackage::Default can't be used with a request that \
                             escapes the current directory"
                        )
                    })?;
                let request = Request::parse(Value::new(str.into()));
                return resolve_internal_inline(package_path, request.resolve().await?, options)
                    .await;
            }
            ResolveIntoPackage::MainField {
                field: name,
                extensions,
            } => {
                if let Some(package_json) = &*read_package_json(package_json_path).await? {
                    if let Some(field_value) = package_json[name].as_str() {
                        let request =
                            Request::parse(Value::new(normalize_request(field_value).into()));

                        let options = if let Some(extensions) = extensions {
                            options.with_extensions(extensions.clone())
                        } else {
                            options
                        };

                        let result = &*resolve_internal_inline(package_path, request, options)
                            .await?
                            .await?;
                        // we are not that strict when a main field fails to resolve
                        // we continue to try other alternatives
                        if !result.is_unresolveable_ref() {
                            let mut result = result.clone();
                            result.add_affecting_source_ref(Vc::upcast(FileSource::new(
                                package_json_path,
                            )));
                            return Ok(result.into());
                        }
                    }
                };
            }
            ResolveIntoPackage::ExportsField {
                conditions,
                unspecified_conditions,
            } => {
                if let ExportsFieldResult::Some(exports_field) =
                    &*exports_field(package_json_path).await?
                {
                    // other options do not apply anymore when an exports field exist
                    return handle_exports_imports_field(
                        package_path,
                        package_json_path,
                        options,
                        exports_field,
                        ".",
                        conditions,
                        unspecified_conditions,
                        query,
                    )
                    .await;
                }
            }
        }
    }
    Ok(ResolveResult::unresolveable().into())
}

#[tracing::instrument(level = Level::TRACE, skip_all)]
async fn resolve_relative_request(
    lookup_path: Vc<FileSystemPath>,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
    options_value: &ResolveOptions,
    path: &Pattern,
    query: Vc<String>,
    force_in_lookup_dir: bool,
) -> Result<Vc<ResolveResult>> {
    let mut new_path = path.clone();
    // Add the extensions as alternatives to the path
    // read_matches keeps the order of alternatives intact
    new_path.push(Pattern::Alternatives(
        once(Pattern::Constant("".to_string()))
            .chain(
                options_value
                    .extensions
                    .iter()
                    .map(|ext| Pattern::Constant(ext.clone())),
            )
            .collect(),
    ));
    new_path.normalize();

    let mut results = Vec::new();
    let matches = read_matches(
        lookup_path,
        "".to_string(),
        force_in_lookup_dir,
        Pattern::new(new_path).resolve().await?,
    )
    .await?;

    for m in matches.iter() {
        match m {
            PatternMatch::File(_, path) => {
                results.push(
                    resolved(*path, lookup_path, request, options_value, options, query).await?,
                );
            }
            PatternMatch::Directory(_, path) => {
                results.push(resolve_into_folder(*path, options, query));
            }
        }
    }

    Ok(merge_results(results))
}

#[tracing::instrument(level = Level::TRACE, skip_all)]
async fn resolve_module_request(
    lookup_path: Vc<FileSystemPath>,
    options: Vc<ResolveOptions>,
    options_value: &ResolveOptions,
    module: &str,
    path: &Pattern,
    query: Vc<String>,
) -> Result<Vc<ResolveResult>> {
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

        let Some(field_value) = package_json[field].as_object() else {
            continue;
        };

        let package_path = package_json_path.parent();
        let full_pattern = Pattern::concat([module.to_string().into(), path.clone()]);

        let Some(request) = full_pattern.into_string() else {
            continue;
        };

        let Some(value) = field_value.get(&request) else {
            continue;
        };

        return resolve_alias_field_result(
            value,
            refs.clone(),
            package_path,
            options,
            *package_json_path,
            &request,
            field,
            query,
        )
        .await;
    }

    let result = find_package(
        lookup_path,
        module.to_string(),
        resolve_modules_options(options).resolve().await?,
    )
    .await?;

    if result.packages.is_empty() {
        return Ok(ResolveResult::unresolveable_with_affecting_sources(
            result.affecting_sources.clone(),
        )
        .into());
    }

    let mut results = vec![];

    // There may be more than one package with the same name. For instance, in a
    // TypeScript project, `compilerOptions.baseUrl` can declare a path where to
    // resolve packages. A request to "foo/bar" might resolve to either
    // "[baseUrl]/foo/bar" or "[baseUrl]/node_modules/foo/bar", and we'll need to
    // try both.
    for &package_path in &result.packages {
        results.push(resolve_into_package(
            Value::new(path.clone()),
            package_path.resolve().await?,
            query,
            options,
        ));
    }

    Ok(merge_results_with_affecting_sources(
        results,
        result.affecting_sources.clone(),
    ))
}

#[turbo_tasks::function]
async fn resolve_into_package(
    path: Value<Pattern>,
    package_path: Vc<FileSystemPath>,
    query: Vc<String>,
    options: Vc<ResolveOptions>,
) -> Result<Vc<ResolveResult>> {
    let path = path.into_value();
    let options_value = options.await?;
    let mut results = Vec::new();

    let is_match = path.is_match("");
    let could_match_others = path.could_match_others("");
    if is_match {
        results.push(resolve_into_folder(package_path, options, query));
    }
    if could_match_others {
        for resolve_into_package in options_value.into_package.iter() {
            match resolve_into_package {
                ResolveIntoPackage::Default(_) | ResolveIntoPackage::MainField { .. } => {
                    // doesn't affect packages with subpath
                    if path.is_match("/") {
                        results.push(resolve_into_folder(package_path, options, query));
                    }
                }
                ResolveIntoPackage::ExportsField {
                    conditions,
                    unspecified_conditions,
                } => {
                    let package_json_path = package_path.join("package.json".to_string());
                    let ExportsFieldResult::Some(exports_field) =
                        &*exports_field(package_json_path).await?
                    else {
                        continue;
                    };

                    let Some(path) = path.clone().into_string() else {
                        todo!("pattern into an exports field is not implemented yet");
                    };

                    results.push(
                        handle_exports_imports_field(
                            package_path,
                            package_json_path,
                            options,
                            exports_field,
                            &format!(".{path}"),
                            conditions,
                            unspecified_conditions,
                            query,
                        )
                        .await?,
                    );

                    // other options do not apply anymore when an exports
                    // field exist
                    break;
                }
            }
        }

        let mut new_pat = path.clone();
        new_pat.push_front(".".to_string().into());

        let relative = Request::relative(Value::new(new_pat), query, true);
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
    query: Vc<String>,
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
    query: Vc<String>,
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
async fn resolve_alias_field_result(
    result: &JsonValue,
    refs: Vec<Vc<Box<dyn Source>>>,
    package_path: Vc<FileSystemPath>,
    resolve_options: Vc<ResolveOptions>,
    issue_context: Vc<FileSystemPath>,
    issue_request: &str,
    field_name: &str,
    query: Vc<String>,
) -> Result<Vc<ResolveResult>> {
    if result.as_bool() == Some(false) {
        return Ok(
            ResolveResult::primary_with_affecting_sources(ResolveResultItem::Ignore, refs).cell(),
        );
    }

    if let Some(value) = result.as_str() {
        return Ok(resolve_internal(
            package_path,
            Request::parse(Value::new(Pattern::Constant(value.to_string()))).with_query(query),
            resolve_options,
        )
        .with_affecting_sources(refs));
    }

    ResolvingIssue {
        severity: IssueSeverity::Error.cell(),
        file_path: issue_context,
        request_type: format!("alias field ({field_name})"),
        request: Request::parse(Value::new(Pattern::Constant(issue_request.to_string()))),
        resolve_options,
        error_message: Some(format!("invalid alias field value: {}", result)),
        source: None,
    }
    .cell()
    .emit();

    Ok(ResolveResult::unresolveable_with_affecting_sources(refs).cell())
}

#[tracing::instrument(level = Level::TRACE, skip_all)]
async fn resolved(
    fs_path: Vc<FileSystemPath>,
    original_context: Vc<FileSystemPath>,
    original_request: Vc<Request>,
    ResolveOptions {
        resolved_map,
        in_package,
        ..
    }: &ResolveOptions,
    options: Vc<ResolveOptions>,
    query: Vc<String>,
) -> Result<Vc<ResolveResult>> {
    let RealPathResult { path, symlinks } = &*fs_path.realpath_with_links().await?;

    for in_package in in_package.iter() {
        // resolved is called when importing a relative path, not a
        // PackageInternal one, so the imports field doesn't apply.
        let ResolveInPackage::AliasField(field) = in_package else {
            continue;
        };

        let FindContextFileResult::Found(package_json_path, refs) =
            &*find_context_file(fs_path.parent(), package_json()).await?
        else {
            continue;
        };

        let package_json = &*read_package_json(*package_json_path).await?;
        let Some(field_value) = package_json
            .as_ref()
            .and_then(|package_json| package_json[field].as_object())
        else {
            continue;
        };

        let package_path = package_json_path.parent();
        let Some(rel_path) = package_path.await?.get_relative_path_to(&*fs_path.await?) else {
            continue;
        };

        let Some(value) = field_value.get(&rel_path) else {
            continue;
        };

        return resolve_alias_field_result(
            value,
            refs.clone(),
            package_path,
            options,
            *package_json_path,
            &rel_path,
            field,
            query,
        )
        .await;
    }

    if let Some(resolved_map) = resolved_map {
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
    conditions: &BTreeMap<String, ConditionValue>,
    unspecified_conditions: &ConditionValue,
    query: Vc<String>,
) -> Result<Vc<ResolveResult>> {
    let mut results = Vec::new();
    let mut conditions_state = HashMap::new();

    let req = format!("{}{}", path, &*query.await?);
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

    {
        let mut duplicates_set = HashSet::new();
        results.retain(|item| duplicates_set.insert(*item));
    }

    let mut resolved_results = Vec::new();
    for path in results {
        if let Some(path) = normalize_path(path) {
            let request = Request::parse(Value::new(format!("./{}", path).into()));
            resolved_results.push(resolve_internal_boxed(package_path, request, options).await?);
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
    conditions: &BTreeMap<String, ConditionValue>,
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
        Vc::<String>::default(),
    )
    .await
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
    Ok(match result.is_unresolveable().await {
        Ok(unresolveable) => {
            if *unresolveable {
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
    Export(Vc<String>),
    /// Represents a renamed export of a module.
    RenamedExport {
        original_export: Vc<String>,
        export: Vc<String>,
    },
    /// Represents a namespace object of a module exported as named export.
    RenamedNamespace { export: Vc<String> },
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
    pub fn export(export: String) -> Vc<Self> {
        ModulePart::Export(Vc::cell(export)).cell()
    }
    #[turbo_tasks::function]
    pub fn renamed_export(original_export: String, export: String) -> Vc<Self> {
        ModulePart::RenamedExport {
            original_export: Vc::cell(original_export),
            export: Vc::cell(export),
        }
        .cell()
    }
    #[turbo_tasks::function]
    pub fn renamed_namespace(export: String) -> Vc<Self> {
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
    async fn to_string(&self) -> Result<Vc<String>> {
        Ok(Vc::cell(match self {
            ModulePart::Evaluation => "module evaluation".to_string(),
            ModulePart::Export(export) => format!("export {}", export.await?),
            ModulePart::RenamedExport {
                original_export,
                export,
            } => format!("export {} as {}", original_export.await?, export.await?),
            ModulePart::RenamedNamespace { export } => {
                format!("export * as {}", export.await?)
            }
            ModulePart::Internal(id) => format!("internal part {}", id),
            ModulePart::Locals => "locals".to_string(),
            ModulePart::Exports => "exports".to_string(),
            ModulePart::Facade => "facade".to_string(),
        }))
    }
}
