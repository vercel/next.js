use std::{
    borrow::Cow,
    collections::{BTreeMap, HashMap, HashSet},
    future::Future,
    pin::Pin,
};

use anyhow::{anyhow, bail, Result};
use serde_json::Value as JsonValue;
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
    parse::Request,
    pattern::{Pattern, QueryMap},
    remap::{ExportsField, ImportsField},
};
use crate::{
    asset::{Asset, AssetOption, Assets},
    file_source::FileSource,
    issue::{resolve::ResolvingIssue, IssueExt},
    package_json::{read_package_json, PackageJsonIssue},
    reference::AssetReference,
    reference_type::ReferenceType,
    resolve::{
        pattern::{read_matches, PatternMatch},
        plugin::ResolvePlugin,
    },
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

use crate::issue::{IssueSeverity, OptionIssueSource};

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub enum PrimaryResolveResult {
    Asset(Vc<Box<dyn Asset>>),
    OriginalReferenceExternal,
    OriginalReferenceTypeExternal(String),
    Ignore,
    Empty,
    Custom(u8),
    Unresolveable,
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub struct ResolveResult {
    pub primary: Vec<PrimaryResolveResult>,
    pub references: Vec<Vc<Box<dyn AssetReference>>>,
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
            references: Vec::new(),
        }
    }

    pub fn unresolveable_with_references(
        references: Vec<Vc<Box<dyn AssetReference>>>,
    ) -> ResolveResult {
        ResolveResult {
            primary: Vec::new(),
            references,
        }
    }

    pub fn primary(result: PrimaryResolveResult) -> ResolveResult {
        ResolveResult {
            primary: vec![result],
            references: Vec::new(),
        }
    }

    pub fn primary_with_references(
        result: PrimaryResolveResult,
        references: Vec<Vc<Box<dyn AssetReference>>>,
    ) -> ResolveResult {
        ResolveResult {
            primary: vec![result],
            references,
        }
    }

    pub fn asset(asset: Vc<Box<dyn Asset>>) -> ResolveResult {
        ResolveResult {
            primary: vec![PrimaryResolveResult::Asset(asset)],
            references: Vec::new(),
        }
    }

    pub fn asset_with_references(
        asset: Vc<Box<dyn Asset>>,
        references: Vec<Vc<Box<dyn AssetReference>>>,
    ) -> ResolveResult {
        ResolveResult {
            primary: vec![PrimaryResolveResult::Asset(asset)],
            references,
        }
    }

    pub fn assets(assets: Vec<Vc<Box<dyn Asset>>>) -> ResolveResult {
        ResolveResult {
            primary: assets
                .into_iter()
                .map(PrimaryResolveResult::Asset)
                .collect(),
            references: Vec::new(),
        }
    }

    pub fn assets_with_references(
        assets: Vec<Vc<Box<dyn Asset>>>,
        references: Vec<Vc<Box<dyn AssetReference>>>,
    ) -> ResolveResult {
        ResolveResult {
            primary: assets
                .into_iter()
                .map(PrimaryResolveResult::Asset)
                .collect(),
            references,
        }
    }

    pub fn add_reference_ref(&mut self, reference: Vc<Box<dyn AssetReference>>) {
        self.references.push(reference);
    }

    pub fn get_references(&self) -> &Vec<Vc<Box<dyn AssetReference>>> {
        &self.references
    }

    fn clone_with_references(&self, references: Vec<Vc<Box<dyn AssetReference>>>) -> ResolveResult {
        ResolveResult {
            primary: self.primary.clone(),
            references,
        }
    }

    pub fn merge_alternatives(&mut self, other: &ResolveResult) {
        self.primary.extend(other.primary.iter().cloned());
        self.references.extend(other.references.iter().copied());
    }

    pub fn is_unresolveable_ref(&self) -> bool {
        self.primary.is_empty()
    }

    pub async fn map<A, AF, R, RF>(&self, asset_fn: A, reference_fn: R) -> Result<Self>
    where
        A: Fn(Vc<Box<dyn Asset>>) -> AF,
        AF: Future<Output = Result<Vc<Box<dyn Asset>>>>,
        R: Fn(Vc<Box<dyn AssetReference>>) -> RF,
        RF: Future<Output = Result<Vc<Box<dyn AssetReference>>>>,
    {
        Ok(Self {
            primary: self
                .primary
                .iter()
                .cloned()
                .map(|result| {
                    let asset_fn = &asset_fn;
                    async move {
                        if let PrimaryResolveResult::Asset(asset) = result {
                            Ok(PrimaryResolveResult::Asset(asset_fn(asset).await?))
                        } else {
                            Ok(result)
                        }
                    }
                })
                .try_join()
                .await?,
            references: self
                .references
                .iter()
                .copied()
                .map(reference_fn)
                .try_join()
                .await?,
        })
    }
}

#[turbo_tasks::value_impl]
impl ResolveResult {
    #[turbo_tasks::function]
    pub async fn with_reference(
        self: Vc<Self>,
        reference: Vc<Box<dyn AssetReference>>,
    ) -> Result<Vc<Self>> {
        let mut this = self.await?.clone_value();
        this.add_reference_ref(reference);
        Ok(this.into())
    }

    #[turbo_tasks::function]
    pub async fn with_references(
        self: Vc<Self>,
        references: Vec<Vc<Box<dyn AssetReference>>>,
    ) -> Result<Vc<Self>> {
        let mut this = self.await?.clone_value();
        for reference in references {
            this.add_reference_ref(reference);
        }
        Ok(this.into())
    }

    /// Returns the first [ResolveResult] that is not
    /// [ResolveResult::Unresolveable] in the given list, while keeping track
    /// of all the references in all the [ResolveResult]s.
    #[turbo_tasks::function]
    pub async fn select_first(results: Vec<Vc<ResolveResult>>) -> Result<Vc<Self>> {
        let mut references = vec![];
        for result in &results {
            references.extend(result.await?.get_references());
        }
        for result in results {
            let result_ref = result.await?;
            if !result_ref.is_unresolveable_ref() {
                return Ok(result_ref.clone_with_references(references).cell());
            }
        }
        Ok(ResolveResult::unresolveable_with_references(references).into())
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
    pub async fn alternatives_with_references(
        results: Vec<Vc<ResolveResult>>,
        references: Vec<Vc<Box<dyn AssetReference>>>,
    ) -> Result<Vc<Self>> {
        if references.is_empty() {
            return Ok(Self::alternatives(results));
        }
        if results.len() == 1 {
            return Ok(results
                .into_iter()
                .next()
                .unwrap()
                .with_references(references));
        }
        let mut iter = results.into_iter().try_join().await?.into_iter();
        if let Some(current) = iter.next() {
            let mut current = current.clone_value();
            for result in iter {
                // For clippy -- This explicit deref is necessary
                let other = &*result;
                current.merge_alternatives(other);
            }
            current.references.extend(references);
            Ok(Self::cell(current))
        } else {
            Ok(Self::cell(ResolveResult::unresolveable_with_references(
                references,
            )))
        }
    }

    #[turbo_tasks::function]
    pub async fn is_unresolveable(self: Vc<Self>) -> Result<Vc<bool>> {
        let this = self.await?;
        Ok(Vc::cell(this.is_unresolveable_ref()))
    }

    #[turbo_tasks::function]
    pub async fn first_asset(self: Vc<Self>) -> Result<Vc<AssetOption>> {
        let this = self.await?;
        Ok(Vc::cell(this.primary.iter().find_map(|item| {
            if let PrimaryResolveResult::Asset(a) = item {
                Some(*a)
            } else {
                None
            }
        })))
    }

    #[turbo_tasks::function]
    pub async fn primary_assets(self: Vc<Self>) -> Result<Vc<Assets>> {
        let this = self.await?;
        Ok(Vc::cell(
            this.primary
                .iter()
                .filter_map(|item| {
                    if let PrimaryResolveResult::Asset(a) = item {
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
    refs: &mut Vec<Vc<Box<dyn AssetReference>>>,
) -> Result<Option<Vc<FileSystemPath>>> {
    type_exists(fs_path, FileSystemEntryType::File, refs).await
}

async fn dir_exists(
    fs_path: Vc<FileSystemPath>,
    refs: &mut Vec<Vc<Box<dyn AssetReference>>>,
) -> Result<Option<Vc<FileSystemPath>>> {
    type_exists(fs_path, FileSystemEntryType::Directory, refs).await
}

async fn type_exists(
    fs_path: Vc<FileSystemPath>,
    ty: FileSystemEntryType,
    refs: &mut Vec<Vc<Box<dyn AssetReference>>>,
) -> Result<Option<Vc<FileSystemPath>>> {
    let result = fs_path.resolve().await?.realpath_with_links().await?;
    for path in result.symlinks.iter() {
        refs.push(Vc::upcast(AffectingResolvingAssetReference::new(*path)));
    }
    let path = result.path;
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
async fn imports_field(context: Vc<FileSystemPath>) -> Result<Vc<ImportsFieldResult>> {
    let package_json_context = find_context_file(context, package_json()).await?;
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
    Found(Vc<FileSystemPath>, Vec<Vc<Box<dyn AssetReference>>>),
    NotFound(Vec<Vc<Box<dyn AssetReference>>>),
}

#[turbo_tasks::function]
pub async fn find_context_file(
    context: Vc<FileSystemPath>,
    names: Vc<Vec<String>>,
) -> Result<Vc<FindContextFileResult>> {
    let mut refs = Vec::new();
    let context_value = context.await?;
    for name in &*names.await? {
        let fs_path = context.join(name.clone());
        if let Some(fs_path) = exists(fs_path, &mut refs).await? {
            return Ok(FindContextFileResult::Found(fs_path, refs).into());
        }
    }
    if context_value.is_root() {
        return Ok(FindContextFileResult::NotFound(refs).into());
    }
    if refs.is_empty() {
        // Tailcall
        Ok(find_context_file(context.parent(), names))
    } else {
        let parent_result = find_context_file(context.parent(), names).await?;
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
    references: Vec<Vc<Box<dyn AssetReference>>>,
}

#[turbo_tasks::function]
async fn find_package(
    context: Vc<FileSystemPath>,
    package_name: String,
    options: Vc<ResolveModulesOptions>,
) -> Result<Vc<FindPackageResult>> {
    let mut packages = vec![];
    let mut references = vec![];
    let options = options.await?;
    for resolve_modules in &options.modules {
        match resolve_modules {
            ResolveModules::Nested(root_vc, names) => {
                let mut context = context;
                let mut context_value = context.await?;
                // For clippy -- This explicit deref is necessary
                let root = &*root_vc.await?;
                while context_value.is_inside_ref(root) {
                    for name in names.iter() {
                        let fs_path = context.join(name.clone());
                        if let Some(fs_path) = dir_exists(fs_path, &mut references).await? {
                            let fs_path = fs_path.join(package_name.clone());
                            if let Some(fs_path) = dir_exists(fs_path, &mut references).await? {
                                packages.push(fs_path);
                            }
                        }
                    }
                    context = context.parent().resolve().await?;
                    let new_context_value = context.await?;
                    if *new_context_value == *context_value {
                        break;
                    }
                    context_value = new_context_value;
                }
            }
            ResolveModules::Path(context) => {
                let package_dir = context.join(package_name.clone());
                if dir_exists(package_dir, &mut references).await?.is_some() {
                    packages.push(package_dir.resolve().await?);
                }
            }
            ResolveModules::Registry(_, _) => todo!(),
        }
    }
    Ok(FindPackageResult::cell(FindPackageResult {
        packages,
        references,
    }))
}

fn merge_results(results: Vec<Vc<ResolveResult>>) -> Vc<ResolveResult> {
    match results.len() {
        0 => ResolveResult::unresolveable().into(),
        1 => results.into_iter().next().unwrap(),
        _ => ResolveResult::alternatives(results),
    }
}

fn merge_results_with_references(
    results: Vec<Vc<ResolveResult>>,
    references: Vec<Vc<Box<dyn AssetReference>>>,
) -> Vc<ResolveResult> {
    if references.is_empty() {
        return merge_results(results);
    }
    match results.len() {
        0 => ResolveResult::unresolveable_with_references(references).into(),
        1 => results
            .into_iter()
            .next()
            .unwrap()
            .with_references(references),
        _ => ResolveResult::alternatives_with_references(results, references),
    }
}

#[turbo_tasks::function]
pub async fn resolve_raw(
    context: Vc<FileSystemPath>,
    path: Vc<Pattern>,
    force_in_context: bool,
) -> Result<Vc<ResolveResult>> {
    async fn to_result(path: Vc<FileSystemPath>) -> Result<Vc<ResolveResult>> {
        let RealPathResult { path, symlinks } = &*path.realpath_with_links().await?;
        Ok(ResolveResult::asset_with_references(
            Vc::upcast(FileSource::new(*path)),
            symlinks
                .iter()
                .map(|p| Vc::upcast(AffectingResolvingAssetReference::new(*p)))
                .collect(),
        )
        .into())
    }
    let mut results = Vec::new();
    let pat = path.await?;
    if let Some(pat) = pat.filter_could_match("/ROOT/") {
        if let Some(pat) = pat.filter_could_not_match("/ROOT/fsd8nz8og54z") {
            let path = Pattern::new(pat);
            let matches = read_matches(context.root(), "/ROOT/".to_string(), true, path).await?;
            if matches.len() > 10000 {
                println!(
                    "WARN: resolving abs pattern {} in {} leads to {} results",
                    path.to_string().await?,
                    context.to_string().await?,
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
    }
    {
        let matches = read_matches(context, "".to_string(), force_in_context, path).await?;
        if matches.len() > 10000 {
            println!(
                "WARN: resolving pattern {} in {} leads to {} results",
                pat,
                context.to_string().await?,
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
    context: Vc<FileSystemPath>,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
) -> Result<Vc<ResolveResult>> {
    let raw_result = resolve_internal(context, request, options);
    let result = handle_resolve_plugins(context, request, options, raw_result);
    Ok(result)
}

#[turbo_tasks::function]
async fn handle_resolve_plugins(
    context: Vc<FileSystemPath>,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
    result: Vc<ResolveResult>,
) -> Result<Vc<ResolveResult>> {
    async fn apply_plugins_to_path(
        path: Vc<FileSystemPath>,
        context: Vc<FileSystemPath>,
        request: Vc<Request>,
        options: Vc<ResolveOptions>,
    ) -> Result<Option<Vc<ResolveResult>>> {
        for plugin in &options.await?.plugins {
            if *plugin.after_resolve_condition().matches(path).await? {
                if let Some(result) = *plugin.after_resolve(path, context, request).await? {
                    return Ok(Some(result));
                }
            }
        }
        Ok(None)
    }

    let mut changed = false;
    let result_value = result.await?;

    let mut new_primary = Vec::new();
    let mut new_references = Vec::new();

    for primary in result_value.primary.iter() {
        if let PrimaryResolveResult::Asset(asset) = primary {
            if let Some(new_result) = apply_plugins_to_path(
                asset.ident().path().resolve().await?,
                context,
                request,
                options,
            )
            .await?
            {
                let new_result = new_result.await?;
                changed = true;
                new_primary.extend(new_result.primary.iter().cloned());
                new_references.extend(new_result.references.iter().copied());
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

    let mut references = result_value.references.clone();
    references.append(&mut new_references);

    Ok(ResolveResult {
        primary: new_primary,
        references,
    }
    .cell())
}

#[turbo_tasks::function]
async fn resolve_internal(
    context: Vc<FileSystemPath>,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
) -> Result<Vc<ResolveResult>> {
    // This explicit deref of `options` is necessary
    #[allow(clippy::explicit_auto_deref)]
    let options_value: &ResolveOptions = &*options.await?;

    // Apply import mappings if provided
    if let Some(import_map) = &options_value.import_map {
        let result_ref = import_map.lookup(context, request).await?;
        let result = &*result_ref;
        if !matches!(result, ImportMapResult::NoEntry) {
            let resolved_result =
                resolve_import_map_result(result, context, context, request, options).await?;
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
                .map(|req| resolve_internal(context, *req, options))
                .collect();
            merge_results(results)
        }
        Request::Raw {
            path,
            force_in_context,
        } => {
            let mut results = Vec::new();
            let matches = read_matches(
                context,
                "".to_string(),
                *force_in_context,
                Pattern::new(path.clone()),
            )
            .await?;
            for m in matches.iter() {
                match m {
                    PatternMatch::File(_, path) => {
                        results
                            .push(resolved(*path, context, request, options_value, options).await?);
                    }
                    PatternMatch::Directory(_, path) => {
                        results.push(resolve_into_folder(*path, options).await?);
                    }
                }
            }
            merge_results(results)
        }
        Request::Relative {
            path,
            force_in_context,
        } => {
            let mut patterns = vec![path.clone()];
            for ext in options_value.extensions.iter() {
                let mut path = path.clone();
                path.push(ext.clone().into());
                patterns.push(path);
            }

            // This ensures the order of the patterns (extensions) is
            // preserved, `Pattern::Alternatives` inside a `Request::Raw` does not preserve
            // the order
            let mut results = Vec::new();
            for pattern in patterns {
                results.push(resolve_internal(
                    context,
                    Request::raw(Value::new(pattern), *force_in_context),
                    options,
                ));
            }

            merge_results(results)
        }
        Request::Module {
            module,
            path,
            query,
        } => resolve_module_request(context, options, options_value, module, path, query).await?,
        Request::ServerRelative { path } => {
            let mut new_pat = path.clone();
            new_pat.push_front(".".to_string().into());
            let relative = Request::relative(Value::new(new_pat), true);

            ResolvingIssue {
                severity: IssueSeverity::Error.cell(),
                request_type: "server relative import: not implemented yet".to_string(),
                request,
                context,
                resolve_options: options,
                error_message: Some(
                    "server relative imports are not implemented yet. Please try an import \
                     relative to the file you are importing from."
                        .to_string(),
                ),
                source: OptionIssueSource::none(),
            }
            .cell()
            .emit();

            resolve_internal(context.root(), relative, options)
        }
        Request::Windows { path: _ } => {
            ResolvingIssue {
                severity: IssueSeverity::Error.cell(),
                request_type: "windows import: not implemented yet".to_string(),
                request,
                context,
                resolve_options: options,
                error_message: Some("windows imports are not implemented yet".to_string()),
                source: OptionIssueSource::none(),
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
                context,
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
        } => ResolveResult::primary(PrimaryResolveResult::OriginalReferenceTypeExternal(
            format!("{}{}", protocol, remainder),
        ))
        .into(),
        Request::Unknown { path } => {
            ResolvingIssue {
                severity: IssueSeverity::Error.cell(),
                request_type: format!("unknown import: `{}`", path),
                request,
                context,
                resolve_options: options,
                error_message: None,
                source: OptionIssueSource::none(),
            }
            .cell()
            .emit();
            ResolveResult::unresolveable().into()
        }
    };

    // Apply fallback import mappings if provided
    if let Some(import_map) = &options_value.fallback_import_map {
        if *result.is_unresolveable().await? {
            let result_ref = import_map.lookup(context, request).await?;
            let result = &*result_ref;
            let resolved_result =
                resolve_import_map_result(result, context, context, request, options).await?;
            if let Some(result) = resolved_result {
                return Ok(result);
            }
        }
    }

    Ok(result)
}

async fn resolve_into_folder(
    package_path: Vc<FileSystemPath>,
    options: Vc<ResolveOptions>,
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
                return Ok(resolve_internal(package_path, request, options));
            }
            ResolveIntoPackage::MainField(name) => {
                if let Some(package_json) = &*read_package_json(package_json_path).await? {
                    if let Some(field_value) = package_json[name].as_str() {
                        let request =
                            Request::parse(Value::new(normalize_request(field_value).into()));

                        let result = &*resolve_internal(package_path, request, options).await?;
                        // we are not that strict when a main field fails to resolve
                        // we continue to try other alternatives
                        if !result.is_unresolveable_ref() {
                            let mut result = result.clone();
                            result.add_reference_ref(Vc::upcast(
                                AffectingResolvingAssetReference::new(package_json_path),
                            ));
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
                    );
                }
            }
        }
    }
    Ok(ResolveResult::unresolveable().into())
}

async fn resolve_module_request(
    context: Vc<FileSystemPath>,
    options: Vc<ResolveOptions>,
    options_value: &ResolveOptions,
    module: &str,
    path: &Pattern,
    _: &Vc<QueryMap>,
) -> Result<Vc<ResolveResult>> {
    // Check alias field for module aliases first
    for in_package in options_value.in_package.iter() {
        match in_package {
            ResolveInPackage::AliasField(field) => {
                if let FindContextFileResult::Found(package_json_path, refs) =
                    &*find_context_file(context, package_json()).await?
                {
                    let read = read_package_json(*package_json_path).await?;
                    if let Some(package_json) = &*read {
                        if let Some(field_value) = package_json[field].as_object() {
                            let package_path = package_json_path.parent();
                            let full_pattern =
                                Pattern::concat([module.to_string().into(), path.clone()]);
                            if let Some(request) = full_pattern.into_string() {
                                if let Some(value) = field_value.get(&request) {
                                    return resolve_alias_field_result(
                                        value,
                                        refs.clone(),
                                        package_path,
                                        options,
                                        *package_json_path,
                                        &request,
                                        field,
                                    )
                                    .await;
                                }
                            }
                        }
                    }
                }
            }
            ResolveInPackage::ImportsField { .. } => {
                // resolve_module_request is called when importing a node
                // module, not a PackageInternal one, so the imports field
                // doesn't apply.
            }
        }
    }

    let result = find_package(
        context,
        module.to_string(),
        resolve_modules_options(options),
    )
    .await?;

    if result.packages.is_empty() {
        return Ok(ResolveResult::unresolveable_with_references(result.references.clone()).into());
    }

    let mut results = vec![];
    let is_match = path.is_match("");
    let could_match_others = path.could_match_others("");

    // There may be more than one package with the same name. For instance, in a
    // TypeScript project, `compilerOptions.baseUrl` can declare a path where to
    // resolve packages. A request to "foo/bar" might resolve to either
    // "[baseUrl]/foo/bar" or "[baseUrl]/node_modules/foo/bar", and we'll need to
    // try both.
    for package_path in &result.packages {
        if is_match {
            results.push(resolve_into_folder(*package_path, options).await?);
        }
        if could_match_others {
            for resolve_into_package in options_value.into_package.iter() {
                match resolve_into_package {
                    ResolveIntoPackage::Default(_) | ResolveIntoPackage::MainField(_) => {
                        // doesn't affect packages with subpath
                        if path.is_match("/") {
                            results.push(resolve_into_folder(*package_path, options).await?);
                        }
                    }
                    ResolveIntoPackage::ExportsField {
                        conditions,
                        unspecified_conditions,
                    } => {
                        let package_json_path = package_path.join("package.json".to_string());
                        if let ExportsFieldResult::Some(exports_field) =
                            &*exports_field(package_json_path).await?
                        {
                            if let Some(path) = path.clone().into_string() {
                                results.push(handle_exports_imports_field(
                                    *package_path,
                                    package_json_path,
                                    options,
                                    exports_field,
                                    &format!(".{path}"),
                                    conditions,
                                    unspecified_conditions,
                                )?);
                            } else {
                                todo!("pattern into an exports field is not implemented yet");
                            }
                            // other options do not apply anymore when an exports
                            // field exist
                            break;
                        }
                    }
                }
            }
            let mut new_pat = path.clone();
            new_pat.push_front(".".to_string().into());
            let relative = Request::relative(Value::new(new_pat), true);
            results.push(resolve_internal(*package_path, relative, options));
        }
    }

    Ok(merge_results_with_references(
        results,
        result.references.clone(),
    ))
}

async fn resolve_import_map_result(
    result: &ImportMapResult,
    context: Vc<FileSystemPath>,
    original_context: Vc<FileSystemPath>,
    original_request: Vc<Request>,
    options: Vc<ResolveOptions>,
) -> Result<Option<Vc<ResolveResult>>> {
    Ok(match result {
        ImportMapResult::Result(result) => Some(*result),
        ImportMapResult::Alias(request, alias_context) => {
            let request = *request;
            let context = alias_context.unwrap_or(context);
            // We must avoid cycles during resolving
            if request.resolve().await? == original_request
                && context.resolve().await? == original_context
            {
                None
            } else {
                Some(resolve_internal(context, request, options))
            }
        }
        ImportMapResult::Alternatives(list) => {
            let results = list
                .iter()
                .map(|result| {
                    resolve_import_map_result_boxed(
                        result,
                        context,
                        original_context,
                        original_request,
                        options,
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
    context: Vc<FileSystemPath>,
    original_context: Vc<FileSystemPath>,
    original_request: Vc<Request>,
    options: Vc<ResolveOptions>,
) -> Pin<Box<dyn Future<Output = ResolveImportMapResult> + Send + 'a>> {
    Box::pin(async move {
        resolve_import_map_result(result, context, original_context, original_request, options)
            .await
    })
}

async fn resolve_alias_field_result(
    result: &JsonValue,
    refs: Vec<Vc<Box<dyn AssetReference>>>,
    package_path: Vc<FileSystemPath>,
    resolve_options: Vc<ResolveOptions>,
    issue_context: Vc<FileSystemPath>,
    issue_request: &str,
    field_name: &str,
) -> Result<Vc<ResolveResult>> {
    if result.as_bool() == Some(false) {
        return Ok(
            ResolveResult::primary_with_references(PrimaryResolveResult::Ignore, refs).cell(),
        );
    }
    if let Some(value) = result.as_str() {
        return Ok(resolve_internal(
            package_path,
            Request::parse(Value::new(Pattern::Constant(value.to_string()))),
            resolve_options,
        )
        .with_references(refs));
    }
    ResolvingIssue {
        severity: IssueSeverity::Error.cell(),
        context: issue_context,
        request_type: format!("alias field ({field_name})"),
        request: Request::parse(Value::new(Pattern::Constant(issue_request.to_string()))),
        resolve_options,
        error_message: Some(format!("invalid alias field value: {}", result)),
        source: OptionIssueSource::none(),
    }
    .cell()
    .emit();
    Ok(ResolveResult::unresolveable_with_references(refs).cell())
}

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
) -> Result<Vc<ResolveResult>> {
    let RealPathResult { path, symlinks } = &*fs_path.realpath_with_links().await?;
    for in_package in in_package.iter() {
        match in_package {
            ResolveInPackage::AliasField(field) => {
                if let FindContextFileResult::Found(package_json_path, refs) =
                    &*find_context_file(fs_path.parent(), package_json()).await?
                {
                    let read = read_package_json(*package_json_path).await?;
                    if let Some(package_json) = &*read {
                        if let Some(field_value) = package_json[field].as_object() {
                            let package_path = package_json_path.parent();
                            if let Some(rel_path) =
                                package_path.await?.get_relative_path_to(&*fs_path.await?)
                            {
                                if let Some(value) = field_value.get(&rel_path) {
                                    return resolve_alias_field_result(
                                        value,
                                        refs.clone(),
                                        package_path,
                                        options,
                                        *package_json_path,
                                        &rel_path,
                                        field,
                                    )
                                    .await;
                                }
                            }
                        }
                    }
                }
            }
            ResolveInPackage::ImportsField { .. } => {
                // resolved is called when importing a relative path, not a
                // PackageInternal one, so the imports field doesn't apply.
            }
        }
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
        )
        .await?;
        if let Some(result) = resolved_result {
            return Ok(result);
        }
    }

    Ok(ResolveResult::asset_with_references(
        Vc::upcast(FileSource::new(*path)),
        symlinks
            .iter()
            .map(|p| Vc::upcast(AffectingResolvingAssetReference::new(*p)))
            .collect(),
    )
    .into())
}

fn handle_exports_imports_field(
    package_path: Vc<FileSystemPath>,
    package_json_path: Vc<FileSystemPath>,
    options: Vc<ResolveOptions>,
    exports_imports_field: &AliasMap<SubpathValue>,
    path: &str,
    conditions: &BTreeMap<String, ConditionValue>,
    unspecified_conditions: &ConditionValue,
) -> Result<Vc<ResolveResult>> {
    let mut results = Vec::new();
    let mut conditions_state = HashMap::new();
    let values = exports_imports_field
        .lookup(path)
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
            let request = Request::relative(Value::new(format!("./{}", path).into()), false);
            resolved_results.push(resolve_internal(package_path, request, options));
        }
    }
    // other options do not apply anymore when an exports field exist
    Ok(merge_results_with_references(
        resolved_results,
        vec![Vc::upcast(AffectingResolvingAssetReference::new(
            package_json_path,
        ))],
    ))
}

/// Resolves a `#dep` import using the containing package.json's `imports`
/// field. The dep may be a constant string or a pattern, and the values can be
/// static strings or conditions like `import` or `require` to handle ESM/CJS
/// with differently compiled files.
async fn resolve_package_internal_with_imports_field(
    context: Vc<FileSystemPath>,
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
            context,
            request_type: format!("package imports request: `{specifier}`"),
            request,
            resolve_options,
            error_message: None,
            source: OptionIssueSource::none(),
        }
        .cell()
        .emit();
        return Ok(ResolveResult::unresolveable().into());
    }

    let imports_result = imports_field(context).await?;
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
    )
}

#[turbo_tasks::value]
pub struct AffectingResolvingAssetReference {
    path: Vc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl AffectingResolvingAssetReference {
    #[turbo_tasks::function]
    pub fn new(path: Vc<FileSystemPath>) -> Vc<Self> {
        Self::cell(AffectingResolvingAssetReference { path })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for AffectingResolvingAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ResolveResult> {
        ResolveResult::asset(Vc::upcast(FileSource::new(self.path))).into()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for AffectingResolvingAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<String>> {
        Ok(Vc::cell(format!(
            "resolving is affected by {}",
            self.path.to_string().await?
        )))
    }
}

pub async fn handle_resolve_error(
    result: Vc<ResolveResult>,
    reference_type: Value<ReferenceType>,
    origin_path: Vc<FileSystemPath>,
    request: Vc<Request>,
    resolve_options: Vc<ResolveOptions>,
    source: Vc<OptionIssueSource>,
    severity: Vc<IssueSeverity>,
) -> Result<Vc<ResolveResult>> {
    Ok(match result.is_unresolveable().await {
        Ok(unresolveable) => {
            if *unresolveable {
                ResolvingIssue {
                    severity,
                    context: origin_path,
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
                context: origin_path,
                request_type: format!("{} request", reference_type.into_value()),
                request,
                resolve_options,
                error_message: Some(err.to_string()),
                source,
            }
            .cell()
            .emit();
            ResolveResult::unresolveable().into()
        }
    })
}

/// ModulePart represnts a part of a module.
///
/// Currently this is used only for ESMs.
#[turbo_tasks::value]
pub enum ModulePart {
    /// Represents the side effects of a module. This part is evaluated even if
    /// all exports are unused.
    ModuleEvaluation,
    /// Represents an export of a module.
    Export(Vc<String>),
    /// A pointer to a specific part.
    Internal(u32),
}

#[turbo_tasks::value_impl]
impl ModulePart {
    #[turbo_tasks::function]
    pub fn module_evaluation() -> Vc<Self> {
        ModulePart::ModuleEvaluation.cell()
    }
    #[turbo_tasks::function]
    pub fn export(export: String) -> Vc<Self> {
        ModulePart::Export(Vc::cell(export)).cell()
    }
    #[turbo_tasks::function]
    pub fn internal(id: u32) -> Vc<Self> {
        ModulePart::Internal(id).cell()
    }
}
