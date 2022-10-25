use std::{
    borrow::Cow,
    collections::{BTreeMap, HashMap, HashSet},
    future::Future,
    mem::take,
    pin::Pin,
};

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use turbo_tasks::{
    primitives::{BoolVc, StringVc},
    trace::TraceRawVcs,
    TryJoinIterExt, Value, ValueToString, ValueToStringVc,
};
use turbo_tasks_fs::{
    util::{normalize_path, normalize_request},
    FileJsonContent, FileJsonContentVc, FileSystemEntryType, FileSystemPathVc, RealPathResult,
};

use self::{
    exports::{ExportsField, ExportsValue},
    options::{
        resolve_modules_options, ImportMapResult, ResolveInPackage, ResolveIntoPackage,
        ResolveModules, ResolveModulesOptionsVc, ResolveOptionsVc,
    },
    origin::ResolveOriginVc,
    parse::{Request, RequestVc},
};
use crate::{
    asset::{AssetVc, AssetsVc},
    issue::{
        package_json::{PackageJsonIssue, PackageJsonIssueVc},
        resolve::{ResolvingIssue, ResolvingIssueVc},
    },
    reference::{AssetReference, AssetReferenceVc},
    resolve::{
        options::{ConditionValue, ResolveOptions},
        pattern::{read_matches, Pattern, PatternMatch, PatternVc},
    },
    source_asset::SourceAssetVc,
};

mod alias_map;
mod exports;
pub mod options;
pub mod origin;
pub mod parse;
pub mod pattern;

pub use alias_map::{
    AliasMap, AliasMapIntoIter, AliasMapLookupIterator, AliasMatch, AliasPattern, AliasTemplate,
};

#[derive(PartialEq, Eq, Clone, Debug, TraceRawVcs, Serialize, Deserialize)]
pub enum SpecialType {
    OriginalReferenceExternal,
    OriginalReferenceTypeExternal(String),
    Ignore,
    Empty,
    Custom(u8),
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub enum ResolveResult {
    Single(AssetVc, Vec<AssetReferenceVc>),
    Keyed(HashMap<String, AssetVc>, Vec<AssetReferenceVc>),
    Alternatives(Vec<AssetVc>, Vec<AssetReferenceVc>),
    Special(SpecialType, Vec<AssetReferenceVc>),
    Unresolveable(Vec<AssetReferenceVc>),
}

impl Default for ResolveResult {
    fn default() -> Self {
        ResolveResult::Unresolveable(Vec::new())
    }
}

impl ResolveResult {
    pub fn unresolveable() -> Self {
        ResolveResult::Unresolveable(Vec::new())
    }

    pub fn add_reference(&mut self, reference: AssetReferenceVc) {
        match self {
            ResolveResult::Single(_, list)
            | ResolveResult::Keyed(_, list)
            | ResolveResult::Alternatives(_, list)
            | ResolveResult::Special(_, list)
            | ResolveResult::Unresolveable(list) => list.push(reference),
        }
    }

    fn get_references(&self) -> &Vec<AssetReferenceVc> {
        match self {
            ResolveResult::Single(_, list)
            | ResolveResult::Keyed(_, list)
            | ResolveResult::Alternatives(_, list)
            | ResolveResult::Special(_, list)
            | ResolveResult::Unresolveable(list) => list,
        }
    }

    fn clone_with_references(&self, references: Vec<AssetReferenceVc>) -> ResolveResult {
        match self {
            ResolveResult::Single(asset, _) => ResolveResult::Single(*asset, references),
            ResolveResult::Keyed(map, _) => ResolveResult::Keyed(map.clone(), references),
            ResolveResult::Alternatives(alternatives, _) => {
                ResolveResult::Alternatives(alternatives.clone(), references)
            }
            ResolveResult::Special(special_type, _) => {
                ResolveResult::Special(special_type.clone(), references)
            }
            ResolveResult::Unresolveable(_) => ResolveResult::Unresolveable(references),
        }
    }

    pub fn merge_alternatives(&mut self, other: &ResolveResult) {
        match self {
            ResolveResult::Single(asset, list) => {
                *self = ResolveResult::Alternatives(vec![*asset], take(list))
            }
            ResolveResult::Keyed(_, list) | ResolveResult::Special(_, list) => {
                *self = ResolveResult::Unresolveable(take(list));
            }
            ResolveResult::Alternatives(_, _) | ResolveResult::Unresolveable(_) => {
                // already is appropriate type
            }
        }
        match self {
            ResolveResult::Single(_, _)
            | ResolveResult::Keyed(_, _)
            | ResolveResult::Special(_, _) => {
                unreachable!()
            }
            ResolveResult::Alternatives(assets, list) => match other {
                ResolveResult::Single(asset, list2) => {
                    assets.push(*asset);
                    list.extend(list2.iter().cloned());
                }
                ResolveResult::Alternatives(assets2, list2) => {
                    assets.extend(assets2.iter().cloned());
                    list.extend(list2.iter().cloned());
                }
                ResolveResult::Keyed(_, _)
                | ResolveResult::Special(_, _)
                | ResolveResult::Unresolveable(_) => {
                    list.extend(other.get_references().iter().cloned());
                }
            },
            ResolveResult::Unresolveable(list) => match other {
                ResolveResult::Single(asset, list2) => {
                    list.extend(list2.iter().cloned());
                    *self = ResolveResult::Alternatives(vec![*asset], take(list));
                }
                ResolveResult::Alternatives(assets, list2) => {
                    list.extend(list2.iter().cloned());
                    *self = ResolveResult::Alternatives(assets.clone(), take(list));
                }
                ResolveResult::Keyed(_, _)
                | ResolveResult::Special(_, _)
                | ResolveResult::Unresolveable(_) => {
                    list.extend(other.get_references().iter().cloned());
                }
            },
        }
    }

    pub fn is_unresolveable(&self) -> bool {
        matches!(self, ResolveResult::Unresolveable(_))
    }

    pub async fn map<A, AF, R, RF>(&self, mut asset_fn: A, mut reference_fn: R) -> Result<Self>
    where
        A: FnMut(AssetVc) -> AF,
        AF: Future<Output = Result<AssetVc>>,
        R: FnMut(AssetReferenceVc) -> RF,
        RF: Future<Output = Result<AssetReferenceVc>>,
    {
        Ok(match self {
            ResolveResult::Single(asset, refs) => {
                let asset = asset_fn(*asset).await?;
                let refs = refs.iter().map(|r| reference_fn(*r)).try_join().await?;
                ResolveResult::Single(asset, refs)
            }
            ResolveResult::Keyed(map, refs) => {
                let mut new_map = HashMap::new();
                for (key, value) in map.iter() {
                    new_map.insert(key.clone(), asset_fn(*value).await?);
                }
                let refs = refs.iter().map(|r| reference_fn(*r)).try_join().await?;
                ResolveResult::Keyed(new_map, refs)
            }
            ResolveResult::Alternatives(assets, refs) => {
                let mut new_assets = Vec::new();
                for asset in assets.iter() {
                    new_assets.push(asset_fn(*asset).await?);
                }
                let refs = refs.iter().map(|r| reference_fn(*r)).try_join().await?;
                ResolveResult::Alternatives(new_assets, refs)
            }
            ResolveResult::Special(ty, refs) => {
                let refs = refs.iter().map(|r| reference_fn(*r)).try_join().await?;
                ResolveResult::Special(ty.clone(), refs)
            }
            ResolveResult::Unresolveable(refs) => {
                let refs = refs.iter().map(|r| reference_fn(*r)).try_join().await?;
                ResolveResult::Unresolveable(refs)
            }
        })
    }
}

#[turbo_tasks::value_impl]
impl ResolveResultVc {
    #[turbo_tasks::function]
    pub async fn add_reference(self, reference: AssetReferenceVc) -> Result<Self> {
        let mut this = self.await?.clone_value();
        this.add_reference(reference);
        Ok(this.into())
    }

    #[turbo_tasks::function]
    pub async fn add_references(self, references: Vec<AssetReferenceVc>) -> Result<Self> {
        let mut this = self.await?.clone_value();
        for reference in references {
            this.add_reference(reference);
        }
        Ok(this.into())
    }

    /// Returns the first [ResolveResult] that is not
    /// [ResolveResult::Unresolveable] in the given list, while keeping track
    /// of all the references in all the [ResolveResult]s.
    #[turbo_tasks::function]
    pub async fn select_first(results: Vec<ResolveResultVc>) -> Result<Self> {
        let mut references = vec![];
        for result in &results {
            references.extend(result.await?.get_references());
        }
        for result in results {
            let result_ref = result.await?;
            if !result_ref.is_unresolveable() {
                return Ok(result_ref.clone_with_references(references).cell());
            }
        }
        Ok(ResolveResult::Unresolveable(references).into())
    }

    #[turbo_tasks::function]
    pub async fn alternatives(results: Vec<ResolveResultVc>) -> Result<Self> {
        if results.len() == 1 {
            return Ok(results.into_iter().next().unwrap());
        }
        let mut iter = results.into_iter();
        if let Some(current) = iter.next() {
            let mut current = current.await?.clone_value();
            for result in iter {
                // For clippy -- This explicit deref is necessary
                let other = &*result.await?;
                current.merge_alternatives(other);
            }
            Ok(Self::cell(current))
        } else {
            Ok(Self::cell(ResolveResult::Unresolveable(Vec::new())))
        }
    }

    #[turbo_tasks::function]
    pub async fn alternatives_with_references(
        results: Vec<ResolveResultVc>,
        references: Vec<AssetReferenceVc>,
    ) -> Result<Self> {
        if references.is_empty() {
            return Self::alternatives_inline(results).await;
        }
        if results.len() == 1 {
            return Ok(results
                .into_iter()
                .next()
                .unwrap()
                .add_references(references));
        }
        let mut iter = results.into_iter();
        if let Some(current) = iter.next() {
            let mut current = current.await?.clone_value();
            for reference in references {
                current.add_reference(reference)
            }
            for result_vc in iter {
                // For clippy -- This explicit deref is necessary
                let result = &*result_vc.await?;
                current.merge_alternatives(result);
            }
            Ok(Self::cell(current))
        } else {
            Ok(Self::cell(ResolveResult::Unresolveable(references)))
        }
    }

    #[turbo_tasks::function]
    pub async fn is_unresolveable(self) -> Result<BoolVc> {
        let this = self.await?;
        Ok(BoolVc::cell(this.is_unresolveable()))
    }

    #[turbo_tasks::function]
    pub async fn primary_assets(self) -> Result<AssetsVc> {
        let this = self.await?;
        Ok(AssetsVc::cell(match &*this {
            ResolveResult::Single(asset, _) => vec![*asset],
            ResolveResult::Keyed(map, _) => map.values().copied().collect(),
            ResolveResult::Alternatives(assets, _) => assets.clone(),
            ResolveResult::Special(_, _) | ResolveResult::Unresolveable(_) => Vec::new(),
        }))
    }
}

async fn exists(
    fs_path: FileSystemPathVc,
    refs: &mut Vec<AssetReferenceVc>,
) -> Result<Option<FileSystemPathVc>> {
    type_exists(fs_path, FileSystemEntryType::File, refs).await
}

async fn dir_exists(
    fs_path: FileSystemPathVc,
    refs: &mut Vec<AssetReferenceVc>,
) -> Result<Option<FileSystemPathVc>> {
    type_exists(fs_path, FileSystemEntryType::Directory, refs).await
}

async fn type_exists(
    fs_path: FileSystemPathVc,
    ty: FileSystemEntryType,
    refs: &mut Vec<AssetReferenceVc>,
) -> Result<Option<FileSystemPathVc>> {
    let result = fs_path.realpath_with_links().await?;
    for path in result.symlinks.iter() {
        refs.push(AffectingResolvingAssetReferenceVc::new(*path).into());
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

#[turbo_tasks::function]
async fn exports_field(
    package_json_path: FileSystemPathVc,
    package_json: FileJsonContentVc,
    field: &str,
) -> Result<ExportsFieldResultVc> {
    if let FileJsonContent::Content(package_json) = &*package_json.await? {
        let field_value = &package_json[field];
        if let serde_json::Value::Null = field_value {
            return Ok(ExportsFieldResult::None.into());
        }
        let exports_field: Result<ExportsField> = field_value.try_into();
        match exports_field {
            Ok(exports_field) => Ok(ExportsFieldResult::Some(exports_field).into()),
            Err(err) => {
                let issue: PackageJsonIssueVc = PackageJsonIssue {
                    path: package_json_path,
                    error_message: err.to_string(),
                }
                .into();
                issue.as_issue().emit();
                Ok(ExportsFieldResult::None.into())
            }
        }
    } else {
        Ok(ExportsFieldResult::None.into())
    }
}

#[turbo_tasks::value(shared)]
pub enum FindContextFileResult {
    Found(FileSystemPathVc, Vec<AssetReferenceVc>),
    NotFound(Vec<AssetReferenceVc>),
}

#[turbo_tasks::function]
pub async fn find_context_file(
    context: FileSystemPathVc,
    name: &str,
) -> Result<FindContextFileResultVc> {
    let mut refs = Vec::new();
    let context_value = context.await?;
    let fs_path = context.join(name);
    if let Some(fs_path) = exists(fs_path, &mut refs).await? {
        return Ok(FindContextFileResult::Found(fs_path, refs).into());
    }
    if context_value.is_root() {
        return Ok(FindContextFileResult::NotFound(refs).into());
    }
    if refs.is_empty() {
        // Tailcall
        Ok(find_context_file(context.parent(), name))
    } else {
        let parent_result = find_context_file(context.parent(), name).await?;
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
    packages: Vec<FileSystemPathVc>,
    references: Vec<AssetReferenceVc>,
}

#[turbo_tasks::function]
async fn find_package(
    context: FileSystemPathVc,
    package_name: String,
    options: ResolveModulesOptionsVc,
) -> Result<FindPackageResultVc> {
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
                while context_value.is_inside(root) {
                    for name in names.iter() {
                        let fs_path = context.join(name);
                        if let Some(fs_path) = dir_exists(fs_path, &mut references).await? {
                            let fs_path = fs_path.join(&package_name);
                            if let Some(fs_path) = dir_exists(fs_path, &mut references).await? {
                                packages.push(fs_path);
                            }
                        }
                    }
                    context = context.parent();
                    let new_context_value = context.await?;
                    if *new_context_value == *context_value {
                        break;
                    }
                    context_value = new_context_value;
                }
            }
            ResolveModules::Path(context) => {
                let package_dir = context.join(&package_name);
                if dir_exists(package_dir, &mut references).await?.is_some() {
                    packages.push(package_dir.resolve().await?);
                }
            }
            ResolveModules::Registry(_, _) => todo!(),
        }
    }
    Ok(FindPackageResultVc::cell(FindPackageResult {
        packages,
        references,
    }))
}

fn merge_results(results: Vec<ResolveResultVc>) -> ResolveResultVc {
    match results.len() {
        0 => ResolveResult::unresolveable().into(),
        1 => results.into_iter().next().unwrap(),
        _ => ResolveResultVc::alternatives(results),
    }
}

fn merge_results_with_references(
    results: Vec<ResolveResultVc>,
    references: Vec<AssetReferenceVc>,
) -> ResolveResultVc {
    if references.is_empty() {
        return merge_results(results);
    }
    match results.len() {
        0 => ResolveResult::Unresolveable(references).into(),
        1 => results
            .into_iter()
            .next()
            .unwrap()
            .add_references(references),
        _ => ResolveResultVc::alternatives_with_references(results, references),
    }
}

#[turbo_tasks::function]
pub async fn resolve_raw(
    context: FileSystemPathVc,
    path: PatternVc,
    force_in_context: bool,
) -> Result<ResolveResultVc> {
    async fn to_result(path: FileSystemPathVc) -> Result<ResolveResultVc> {
        let RealPathResult { path, symlinks } = &*path.realpath_with_links().await?;
        Ok(ResolveResult::Single(
            SourceAssetVc::new(*path).into(),
            symlinks
                .iter()
                .map(|p| AffectingResolvingAssetReferenceVc::new(*p).into())
                .collect(),
        )
        .into())
    }
    let mut results = Vec::new();
    let pat = path.await?;
    if let Some(pat) = pat.filter_could_match("/ROOT/") {
        if let Some(pat) = pat.filter_could_not_match("/ROOT/fsd8nz8og54z") {
            let path = PatternVc::new(pat);
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
    context: FileSystemPathVc,
    request: RequestVc,
    options: ResolveOptionsVc,
) -> Result<ResolveResultVc> {
    // This explicit deref of `options` is necessary
    #[allow(clippy::explicit_auto_deref)]
    let options_value: &ResolveOptions = &*options.await?;

    // Apply import mappings if provided
    if let Some(import_map) = &options_value.import_map {
        let result_ref = import_map.lookup(request).await?;
        let result = &*result_ref;
        if !matches!(result, ImportMapResult::NoEntry) {
            let resolve_result_vc =
                resolve_import_map_result(result, context, context, request, options).await?;
            // We might have matched an alias in the import map, but there is no guarantee
            // the alias actually resolves to something. For instance, a tsconfig.json
            // `compilerOptions.paths` option might alias "@*" to "./*", which
            // would also match a request to "@emotion/core". Here, we follow what the
            // Typescript resolution algorithm does in case an alias match
            // doesn't resolve to anything: fall back to resolving the request normally.
            if !*resolve_result_vc.is_unresolveable().await? {
                return Ok(resolve_result_vc);
            }
        }
    }

    let request_value = request.await?;
    let result = match &*request_value {
        Request::Dynamic => ResolveResult::unresolveable().into(),
        Request::Alternatives { requests } => {
            let results = requests
                .iter()
                .map(|req| resolve(context, *req, options))
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
                PatternVc::new(path.clone()),
            )
            .await?;
            for m in matches.iter() {
                match m {
                    PatternMatch::File(_, path) => {
                        results
                            .push(resolved(*path, context, request, options_value, options).await?);
                    }
                    PatternMatch::Directory(_, path) => {
                        let package_json_path = path.join("package.json");
                        let package_json = package_json_path.read_json();
                        results.push(
                            resolve_into_folder(*path, package_json, package_json_path, options)
                                .await?,
                        );
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
            let new_pat = Pattern::alternatives(patterns);

            resolve(
                context,
                RequestVc::raw(Value::new(new_pat), *force_in_context),
                options,
            )
        }
        Request::Module { module, path } => {
            resolve_module_request(context, options, options_value, module, path).await?
        }
        Request::ServerRelative { path } => {
            let mut new_pat = path.clone();
            new_pat.push_front(".".to_string().into());
            let relative = RequestVc::relative(Value::new(new_pat), true);

            let issue: ResolvingIssueVc = ResolvingIssue {
                request_type: "server relative import: not implemented yet".to_string(),
                request,
                context,
                resolve_options: options,
                error_message: Some("server relative imports are not implemented yet".to_string()),
            }
            .into();
            issue.as_issue().emit();

            resolve(context.root(), relative, options)
        }
        Request::Windows { path: _ } => {
            let issue: ResolvingIssueVc = ResolvingIssue {
                request_type: "windows import: not implemented yet".to_string(),
                request,
                context,
                resolve_options: options,
                error_message: Some("windows imports are not implemented yet".to_string()),
            }
            .into();
            issue.as_issue().emit();

            ResolveResult::unresolveable().into()
        }
        Request::Empty => ResolveResult::unresolveable().into(),
        Request::PackageInternal { path: _ } => {
            let issue: ResolvingIssueVc = ResolvingIssue {
                request_type: "package internal import: not implemented yet".to_string(),
                request,
                context,
                resolve_options: options,
                error_message: Some("package internal imports are not implemented yet".to_string()),
            }
            .into();
            issue.as_issue().emit();
            ResolveResult::unresolveable().into()
        }
        Request::Uri {
            protocol: _,
            remainder: _,
        } => {
            let issue: ResolvingIssueVc = ResolvingIssue {
                request_type: "URI imports: not implemented yet".to_string(),
                request,
                context,
                resolve_options: options,
                error_message: Some("URI imports are not implemented yet".to_string()),
            }
            .into();
            issue.as_issue().emit();
            ResolveResult::unresolveable().into()
        }
        Request::Unknown { path } => {
            let issue: ResolvingIssueVc = ResolvingIssue {
                request_type: format!("unknown import: `{}`", path),
                request,
                context,
                resolve_options: options,
                error_message: None,
            }
            .into();
            issue.as_issue().emit();
            ResolveResult::unresolveable().into()
        }
    };

    // Apply fallback import mappings if provided
    if let Some(import_map) = &options_value.fallback_import_map {
        if *result.is_unresolveable().await? {
            let result_ref = import_map.lookup(request).await?;
            let result = &*result_ref;
            if !matches!(result, ImportMapResult::NoEntry) {
                let resolve_result_vc =
                    resolve_import_map_result(result, context, context, request, options).await?;
                return Ok(resolve_result_vc);
            }
        }
    }

    Ok(result)
}

async fn resolve_into_folder(
    package_path: FileSystemPathVc,
    package_json: FileJsonContentVc,
    package_json_path: FileSystemPathVc,
    options: ResolveOptionsVc,
) -> Result<ResolveResultVc> {
    let options_value = options.await?;
    for resolve_into_package in options_value.into_package.iter() {
        match resolve_into_package {
            ResolveIntoPackage::Default(req) => {
                let str = "./".to_string()
                    + &normalize_path(req).ok_or_else(|| {
                        anyhow!(
                            "ResolveIntoPackage::Default can't be used with a request that \
                             escapes the current directory"
                        )
                    })?;
                let request = RequestVc::parse(Value::new(str.into()));
                return Ok(resolve(package_path, request, options));
            }
            ResolveIntoPackage::MainField(name) => {
                if let FileJsonContent::Content(package_json) = &*package_json.await? {
                    if let Some(field_value) = package_json[name].as_str() {
                        let request =
                            RequestVc::parse(Value::new(normalize_request(field_value).into()));

                        let result = &*resolve(package_path, request, options).await?;
                        // we are not that strict when a main field fails to resolve
                        // we continue to try other alternatives
                        if !result.is_unresolveable() {
                            let mut result = result.clone();
                            result.add_reference(
                                AffectingResolvingAssetReferenceVc::new(package_json_path).into(),
                            );
                            return Ok(result.into());
                        }
                    }
                }
            }
            ResolveIntoPackage::ExportsField {
                field,
                conditions,
                unspecified_conditions,
            } => {
                if let ExportsFieldResult::Some(exports_field) =
                    &*exports_field(package_json_path, package_json, field).await?
                {
                    // other options do not apply anymore when an exports field exist
                    return handle_exports_field(
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
    context: FileSystemPathVc,
    options: ResolveOptionsVc,
    options_value: &ResolveOptions,
    module: &str,
    path: &Pattern,
) -> Result<ResolveResultVc> {
    let result = find_package(
        context,
        module.to_string(),
        resolve_modules_options(options),
    )
    .await?;

    if result.packages.is_empty() {
        return Ok(ResolveResult::Unresolveable(result.references.clone()).into());
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
        let package_json_path = package_path.join("package.json");
        let package_json = package_json_path.read_json();
        if is_match {
            results.push(
                resolve_into_folder(*package_path, package_json, package_json_path, options)
                    .await?,
            );
        }
        if could_match_others {
            for resolve_into_package in options_value.into_package.iter() {
                match resolve_into_package {
                    ResolveIntoPackage::Default(_) | ResolveIntoPackage::MainField(_) => {
                        // doesn't affect packages with subpath
                        if path.is_match("/") {
                            results.push(
                                resolve_into_folder(
                                    *package_path,
                                    package_json,
                                    package_json_path,
                                    options,
                                )
                                .await?,
                            );
                        }
                    }
                    ResolveIntoPackage::ExportsField {
                        field,
                        conditions,
                        unspecified_conditions,
                    } => {
                        if let ExportsFieldResult::Some(exports_field) =
                            &*exports_field(package_json_path, package_json, field).await?
                        {
                            if let Some(path) = path.clone().into_string() {
                                results.push(handle_exports_field(
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
            let relative = RequestVc::relative(Value::new(new_pat), true);
            results.push(resolve(*package_path, relative, options));
        }
    }

    Ok(merge_results_with_references(
        results,
        result.references.clone(),
    ))
}

async fn resolve_import_map_result(
    result: &ImportMapResult,
    context: FileSystemPathVc,
    original_context: FileSystemPathVc,
    original_request: RequestVc,
    options: ResolveOptionsVc,
) -> Result<ResolveResultVc> {
    Ok(match result {
        ImportMapResult::Result(result) => *result,
        ImportMapResult::Alias(request, alias_context) => {
            let request = *request;
            let context = alias_context.unwrap_or(context);
            // We must avoid cycles during resolving
            if request.resolve().await? == original_request
                && context.resolve().await? == original_context
            {
                ResolveResult::unresolveable().cell()
            } else {
                resolve(context, request, options)
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
            ResolveResultVc::select_first(results)
        }
        ImportMapResult::NoEntry => unreachable!(),
    })
}

fn resolve_import_map_result_boxed<'a>(
    result: &'a ImportMapResult,
    context: FileSystemPathVc,
    original_context: FileSystemPathVc,
    original_request: RequestVc,
    options: ResolveOptionsVc,
) -> Pin<Box<dyn Future<Output = Result<ResolveResultVc>> + Send + 'a>> {
    Box::pin(async move {
        resolve_import_map_result(result, context, original_context, original_request, options)
            .await
    })
}

async fn resolve_alias_field_result(
    result: &JsonValue,
    refs: Vec<AssetReferenceVc>,
    package_path: FileSystemPathVc,
    resolve_options: ResolveOptionsVc,
    issue_context: FileSystemPathVc,
    issue_request: &str,
    field_name: &str,
) -> Result<ResolveResultVc> {
    if result.as_bool() == Some(false) {
        return Ok(ResolveResult::Special(SpecialType::Ignore, refs).cell());
    }
    if let Some(value) = result.as_str() {
        return Ok(resolve(
            package_path,
            RequestVc::parse(Value::new(Pattern::Constant(value.to_string()))),
            resolve_options,
        )
        .add_references(refs));
    }
    let issue: ResolvingIssueVc = ResolvingIssue {
        context: issue_context,
        request_type: format!("alias field ({field_name})"),
        request: RequestVc::parse(Value::new(Pattern::Constant(issue_request.to_string()))),
        resolve_options,
        error_message: Some(format!("invalid alias field value: {}", result)),
    }
    .cell();
    issue.as_issue().emit();
    Ok(ResolveResult::Unresolveable(refs).cell())
}

async fn resolved(
    fs_path: FileSystemPathVc,
    original_context: FileSystemPathVc,
    original_request: RequestVc,
    ResolveOptions {
        resolved_map,
        in_package,
        ..
    }: &ResolveOptions,
    options: ResolveOptionsVc,
) -> Result<ResolveResultVc> {
    let RealPathResult { path, symlinks } = &*fs_path.realpath_with_links().await?;
    for resolve_in in in_package.iter() {
        match resolve_in {
            ResolveInPackage::AliasField(field) => {
                if let FindContextFileResult::Found(package_json, refs) =
                    &*find_context_file(fs_path.parent(), "package.json").await?
                {
                    if let FileJsonContent::Content(package) = &*package_json.read_json().await? {
                        if let Some(field_value) = package[field].as_object() {
                            let package_path = package_json.parent();
                            if let Some(rel_path) =
                                package_path.await?.get_relative_path_to(&*fs_path.await?)
                            {
                                if let Some(value) = field_value.get(&rel_path) {
                                    return resolve_alias_field_result(
                                        value,
                                        refs.clone(),
                                        package_path,
                                        options,
                                        *package_json,
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
        }
    }
    if let Some(resolved_map) = resolved_map {
        let result = resolved_map.lookup(*path).await?;
        if !matches!(&*result, ImportMapResult::NoEntry) {
            return resolve_import_map_result(
                &result,
                path.parent(),
                original_context,
                original_request,
                options,
            )
            .await;
        }
    }
    Ok(ResolveResult::Single(
        SourceAssetVc::new(*path).into(),
        symlinks
            .iter()
            .map(|p| AffectingResolvingAssetReferenceVc::new(*p).into())
            .collect(),
    )
    .into())
}

fn handle_exports_field(
    package_path: FileSystemPathVc,
    package_json: FileSystemPathVc,
    options: ResolveOptionsVc,
    exports_field: &ExportsField,
    path: &str,
    conditions: &BTreeMap<String, ConditionValue>,
    unspecified_conditions: &ConditionValue,
) -> Result<ResolveResultVc> {
    let mut results = Vec::new();
    let mut conditions_state = HashMap::new();
    let values = exports_field
        .lookup(path)
        .map(AliasMatch::try_into_self)
        .collect::<Result<Vec<Cow<'_, ExportsValue>>>>()?;
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
            let request = RequestVc::parse(Value::new(format!("./{}", path).into()));
            resolved_results.push(resolve(package_path, request, options));
        }
    }
    // other options do not apply anymore when an exports field exist
    Ok(merge_results_with_references(
        resolved_results,
        vec![AffectingResolvingAssetReferenceVc::new(package_json).into()],
    ))
}

#[turbo_tasks::value]
pub struct AffectingResolvingAssetReference {
    path: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl AffectingResolvingAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(path: FileSystemPathVc) -> Self {
        Self::cell(AffectingResolvingAssetReference { path })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for AffectingResolvingAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        ResolveResult::Single(SourceAssetVc::new(self.path).into(), Vec::new()).into()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for AffectingResolvingAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "resolving is affected by {}",
            self.path.to_string().await?
        )))
    }
}

pub async fn handle_resolve_error(
    result: ResolveResultVc,
    request_type: &str,
    origin: ResolveOriginVc,
    request: RequestVc,
    resolve_options: ResolveOptionsVc,
) -> Result<ResolveResultVc> {
    Ok(match result.is_unresolveable().await {
        Ok(unresolveable) => {
            if *unresolveable {
                let issue: ResolvingIssueVc = ResolvingIssue {
                    context: origin.origin_path(),
                    request_type: request_type.to_string(),
                    request,
                    resolve_options,
                    error_message: None,
                }
                .into();
                issue.as_issue().emit();
            }
            result
        }
        Err(err) => {
            let issue: ResolvingIssueVc = ResolvingIssue {
                context: origin.origin_path(),
                request_type: request_type.to_string(),
                request,
                resolve_options,
                error_message: Some(err.to_string()),
            }
            .into();
            issue.as_issue().emit();
            ResolveResult::unresolveable().into()
        }
    })
}
