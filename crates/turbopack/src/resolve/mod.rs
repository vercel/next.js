use std::{
    borrow::Cow,
    collections::{BTreeMap, HashMap, HashSet},
    future::Future,
    mem::{self, take},
};

use anyhow::{anyhow, Result};
use json::JsonValue;
use turbo_tasks::{trace::TraceSlotRefs, util::try_join_all, Value, ValueToString};
use turbo_tasks_fs::{
    glob::GlobRef,
    util::{join_path, normalize_path, normalize_request},
    DirectoryContent, FileContent, FileJsonContent, FileJsonContentRef, FileSystemPathRef,
};

use crate::{
    asset::AssetRef,
    reference::{AssetReference, AssetReferenceRef},
    resolve::{
        options::{ConditionValue, ResolvedMapRef},
        pattern::{read_matches, Pattern, PatternMatch, PatternRef},
    },
    source_asset::SourceAssetRef,
};

use self::{
    exports::{ExportsField, ExportsValue},
    options::{
        resolve_modules_options, ImportMap, ImportMapResult, ImportMapping, ResolveIntoPackage,
        ResolveModules, ResolveModulesOptionsRef, ResolveOptions, ResolveOptionsRef, ResolvedMap,
    },
    parse::{Request, RequestRef},
    prefix_tree::PrefixTree,
};

mod exports;
pub mod options;
pub mod parse;
pub mod pattern;
mod prefix_tree;

#[derive(PartialEq, Eq, Clone, Debug, TraceSlotRefs)]
pub enum SpecialType {
    OriginalReferenceExternal,
    OriginalRefernceTypeExternal(String),
    Ignore,
    Empty,
    Custom(u8),
}

#[turbo_tasks::value(shared)]
#[derive(PartialEq, Eq, Clone, Debug)]
pub enum ResolveResult {
    Nested(Vec<AssetReferenceRef>),
    Single(AssetRef, Option<Vec<AssetReferenceRef>>),
    Keyed(HashMap<String, AssetRef>, Option<Vec<AssetReferenceRef>>),
    Alternatives(HashSet<AssetRef>, Option<Vec<AssetReferenceRef>>),
    Special(SpecialType, Option<Vec<AssetReferenceRef>>),
    Unresolveable(Option<Vec<AssetReferenceRef>>),
}

impl ResolveResult {
    pub fn add_reference(&mut self, reference: AssetReferenceRef) {
        match self {
            ResolveResult::Nested(list) => list.push(reference),
            ResolveResult::Single(_, list)
            | ResolveResult::Keyed(_, list)
            | ResolveResult::Alternatives(_, list)
            | ResolveResult::Special(_, list)
            | ResolveResult::Unresolveable(list) => match list {
                Some(list) => list.push(reference),
                None => *list = Some(vec![reference]),
            },
        }
    }

    fn get_references(&self) -> Option<&Vec<AssetReferenceRef>> {
        match self {
            ResolveResult::Nested(list) => Some(list),
            ResolveResult::Single(_, list)
            | ResolveResult::Keyed(_, list)
            | ResolveResult::Alternatives(_, list)
            | ResolveResult::Special(_, list)
            | ResolveResult::Unresolveable(list) => list.as_ref(),
        }
    }

    pub fn merge_alternatives(&mut self, other: &ResolveResult) {
        fn extend_option_list<T: Clone>(list: &mut Option<Vec<T>>, other: Option<&Vec<T>>) {
            match (list.as_mut(), other) {
                (Some(list), Some(other)) => list.extend(other.iter().map(|i| i.clone())),
                (Some(_), None) => {}
                (None, None) => {}
                (None, Some(other)) => *list = Some(other.clone()),
            };
        }
        match self {
            ResolveResult::Nested(list) => {
                let list = mem::replace(list, Vec::new());
                *self = ResolveResult::Unresolveable(Some(list))
            }
            ResolveResult::Single(asset, list) => {
                *self = ResolveResult::Alternatives(HashSet::from([asset.clone()]), list.take())
            }
            ResolveResult::Keyed(_, list) | ResolveResult::Special(_, list) => {
                *self = ResolveResult::Unresolveable(list.take());
            }
            ResolveResult::Alternatives(_, _) | ResolveResult::Unresolveable(_) => {
                // already is appropriate type
            }
        }
        match self {
            ResolveResult::Nested(_)
            | ResolveResult::Single(_, _)
            | ResolveResult::Keyed(_, _)
            | ResolveResult::Special(_, _) => {
                unreachable!()
            }
            ResolveResult::Alternatives(assets, list) => match other {
                ResolveResult::Single(asset, list2) => {
                    assets.insert(asset.clone());
                    extend_option_list(list, list2.as_ref());
                }
                ResolveResult::Alternatives(assets2, list2) => {
                    assets.extend(assets2.iter().map(|i| i.clone()));
                    extend_option_list(list, list2.as_ref());
                }
                ResolveResult::Nested(_)
                | ResolveResult::Keyed(_, _)
                | ResolveResult::Special(_, _)
                | ResolveResult::Unresolveable(_) => {
                    let mut list = list.take();
                    extend_option_list(&mut list, other.get_references());
                }
            },
            ResolveResult::Unresolveable(list) => match other {
                ResolveResult::Single(asset, list2) => {
                    extend_option_list(list, list2.as_ref());
                    *self = ResolveResult::Alternatives(
                        [asset.clone()].into_iter().collect(),
                        take(list),
                    );
                }
                ResolveResult::Alternatives(assets, list2) => {
                    extend_option_list(list, list2.as_ref());
                    *self = ResolveResult::Alternatives(assets.clone(), take(list));
                }
                ResolveResult::Nested(_)
                | ResolveResult::Keyed(_, _)
                | ResolveResult::Special(_, _)
                | ResolveResult::Unresolveable(_) => {
                    let mut list = list.take();
                    extend_option_list(&mut list, other.get_references());
                }
            },
        }
    }

    pub fn is_unresolveable(&self) -> bool {
        if let ResolveResult::Unresolveable(_) = self {
            true
        } else {
            false
        }
    }

    pub async fn map<A, AF, R, RF>(&self, mut asset_fn: A, reference_fn: R) -> Result<Self>
    where
        A: FnMut(&AssetRef) -> AF,
        AF: Future<Output = Result<AssetRef>>,
        R: FnMut(&AssetReferenceRef) -> RF,
        RF: Future<Output = Result<AssetReferenceRef>>,
    {
        Ok(match self {
            ResolveResult::Nested(refs) => {
                let refs = try_join_all(refs.iter().map(reference_fn)).await?;
                ResolveResult::Nested(refs)
            }
            ResolveResult::Single(asset, refs) => {
                let asset = asset_fn(asset).await?;
                let refs = if let Some(refs) = refs {
                    Some(try_join_all(refs.iter().map(reference_fn)).await?)
                } else {
                    None
                };
                ResolveResult::Single(asset, refs)
            }
            ResolveResult::Keyed(map, refs) => {
                let mut new_map = HashMap::new();
                for (key, value) in map.iter() {
                    new_map.insert(key.clone(), asset_fn(value).await?);
                }
                let refs = if let Some(refs) = refs {
                    Some(try_join_all(refs.iter().map(reference_fn)).await?)
                } else {
                    None
                };
                ResolveResult::Keyed(new_map, refs)
            }
            ResolveResult::Alternatives(assets, refs) => {
                let mut new_assets = HashSet::new();
                for asset in assets.iter() {
                    new_assets.insert(asset_fn(asset).await?);
                }
                let refs = if let Some(refs) = refs {
                    Some(try_join_all(refs.iter().map(reference_fn)).await?)
                } else {
                    None
                };
                ResolveResult::Alternatives(new_assets, refs)
            }
            ResolveResult::Special(ty, refs) => {
                let refs = if let Some(refs) = refs {
                    Some(try_join_all(refs.iter().map(reference_fn)).await?)
                } else {
                    None
                };
                ResolveResult::Special(ty.clone(), refs)
            }
            ResolveResult::Unresolveable(refs) => {
                let refs = if let Some(refs) = refs {
                    Some(try_join_all(refs.iter().map(reference_fn)).await?)
                } else {
                    None
                };
                ResolveResult::Unresolveable(refs)
            }
        })
    }
}

#[turbo_tasks::value_impl]
impl ResolveResultRef {
    async fn add_reference(self, reference: AssetReferenceRef) -> Result<Self> {
        let mut this = self.await?.clone();
        this.add_reference(reference);
        Ok(this.into())
    }

    async fn alternatives(results: Vec<ResolveResultRef>) -> Result<Self> {
        if results.len() == 1 {
            return Ok(results.into_iter().next().unwrap());
        }
        let mut iter = results.into_iter();
        if let Some(current) = iter.next() {
            let mut current = current.await?.clone();
            for result in iter {
                current.merge_alternatives(&*result.await?);
            }
            Ok(Self::slot(current))
        } else {
            Ok(Self::slot(ResolveResult::Unresolveable(None)))
        }
    }
}

#[turbo_tasks::function]
pub async fn resolve_options(context: FileSystemPathRef) -> Result<ResolveOptionsRef> {
    let parent = context.clone().parent().resolve().await?;
    if parent != context {
        return Ok(resolve_options(parent));
    }
    let context_value = context.get().await?;
    let root = FileSystemPathRef::new(context_value.fs.clone(), "");
    let mut direct_mappings = PrefixTree::new();
    for req in [
        "assert",
        "async_hooks",
        "buffer",
        "child_process",
        "cluster",
        "console",
        "constants",
        "crypto",
        "dgram",
        "diagnostics_channel",
        "dns",
        "dns/promises",
        "domain",
        "events",
        "fs",
        "fs/promises",
        "http",
        "http2",
        "https",
        "inspector",
        "module",
        "net",
        "os",
        "path",
        "path/posix",
        "path/win32",
        "perf_hooks",
        "process",
        "punycode",
        "querystring",
        "readline",
        "repl",
        "stream",
        "stream/promises",
        "stream/web",
        "string_decoder",
        "sys",
        "timers",
        "timers/promises",
        "tls",
        "trace_events",
        "tty",
        "url",
        "util",
        "util/types",
        "v8",
        "vm",
        "wasi",
        "worker_threads",
        "zlib",
        "pnpapi",
    ] {
        direct_mappings.insert(req, ImportMapping::External(None))?;
        direct_mappings.insert(&format!("node:{req}"), ImportMapping::External(None))?;
    }
    let glob_mappings = vec![
        (
            context.clone(),
            GlobRef::new("**/*/next/dist/server/next.js").await?.clone(),
            ImportMapping::Ignore,
        ),
        (
            context.clone(),
            GlobRef::new("**/*/next/dist/bin/next").await?.clone(),
            ImportMapping::Ignore,
        ),
    ];
    let import_map = ImportMap {
        direct: direct_mappings,
        by_glob: Vec::new(),
    }
    .into();
    let resolved_map = ResolvedMap {
        by_glob: glob_mappings,
    }
    .into();
    Ok(ResolveOptions {
        extensions: vec![".js".to_string(), ".node".to_string(), ".json".to_string()],
        modules: vec![ResolveModules::Nested(
            root,
            vec!["node_modules".to_string()],
        )],
        into_package: vec![
            ResolveIntoPackage::ExportsField {
                field: "exports".to_string(),
                conditions: [
                    ("types".to_string(), ConditionValue::Unset),
                    ("react-server".to_string(), ConditionValue::Unset),
                    ("production".to_string(), ConditionValue::Unknown),
                    ("development".to_string(), ConditionValue::Unknown),
                    ("import".to_string(), ConditionValue::Unknown),
                    ("require".to_string(), ConditionValue::Unknown),
                ]
                .into_iter()
                .collect(),
                unspecified_conditions: ConditionValue::Unset,
            },
            ResolveIntoPackage::MainField("main".to_string()),
            ResolveIntoPackage::Default("index".to_string()),
        ],
        import_map: Some(import_map),
        resolved_map: Some(resolved_map),
        ..Default::default()
    }
    .into())
}

async fn exists(fs_path: FileSystemPathRef) -> Result<bool> {
    Ok(if let FileContent::Content(_) = &*fs_path.read().await? {
        true
    } else {
        false
    })
}

async fn dir_exists(fs_path: FileSystemPathRef) -> Result<bool> {
    Ok(
        if let DirectoryContent::Entries(_) = &*fs_path.read_dir().await? {
            true
        } else {
            false
        },
    )
}

#[turbo_tasks::value(shared)]
#[derive(PartialEq, Eq)]
enum ExportsFieldResult {
    Some(#[trace_ignore] ExportsField),
    None,
}

#[turbo_tasks::function]
async fn exports_field(
    package_json: FileJsonContentRef,
    field: &str,
) -> Result<ExportsFieldResultRef> {
    if let FileJsonContent::Content(package_json) = &*package_json.await? {
        let field_value = &package_json[field];
        if let JsonValue::Null = field_value {
            return Ok(ExportsFieldResult::None.into());
        }
        let exports_field: Result<ExportsField> = field_value.try_into();
        match exports_field {
            Ok(exports_field) => Ok(ExportsFieldResult::Some(exports_field).into()),
            Err(err) => {
                // TODO report error to stream
                println!(
                    "{}",
                    err.chain()
                        .map(|e| e.to_string())
                        .collect::<Vec<_>>()
                        .join(" -> ")
                );
                Ok(ExportsFieldResult::None.into())
            }
        }
    } else {
        Ok(ExportsFieldResult::None.into())
    }
}

#[turbo_tasks::value(shared)]
#[derive(PartialEq, Eq)]
pub enum FindPackageJsonResult {
    Found(FileSystemPathRef),
    NotFound,
}

#[turbo_tasks::function]
pub async fn find_package_json(context: FileSystemPathRef) -> Result<FindPackageJsonResultRef> {
    let context_value = context.get().await?;
    if let Some(new_path) = join_path(&context_value.path, "package.json") {
        let fs_path = FileSystemPathRef::new_normalized(context_value.fs.clone(), new_path);
        if exists(fs_path.clone()).await? {
            return Ok(FindPackageJsonResult::Found(fs_path).into());
        }
    }
    if context_value.is_root() {
        return Ok(FindPackageJsonResult::NotFound.into());
    }
    Ok(find_package_json(context.parent()))
}

#[turbo_tasks::value(shared)]
#[derive(PartialEq, Eq)]
enum FindPackageResult {
    Package(FileSystemPathRef),
    NotFound,
}

#[turbo_tasks::function]
async fn find_package(
    context: FileSystemPathRef,
    package_name: String,
    options: ResolveModulesOptionsRef,
) -> Result<FindPackageResultRef> {
    let options = options.await?;
    for resolve_modules in &options.modules {
        match resolve_modules {
            ResolveModules::Nested(root, names) => {
                let mut context = context.clone();
                let mut context_value = context.get().await?;
                while context_value.is_inside(&*root.get().await?) {
                    for name in names.iter() {
                        if let Some(nested_path) = join_path(&context_value.path, &name) {
                            if let Some(new_path) = join_path(&nested_path, &package_name) {
                                let fs_path = FileSystemPathRef::new_normalized(
                                    context_value.fs.clone(),
                                    nested_path,
                                );
                                if dir_exists(fs_path).await? {
                                    let fs_path = FileSystemPathRef::new_normalized(
                                        context_value.fs.clone(),
                                        new_path,
                                    );
                                    if dir_exists(fs_path.clone()).await? {
                                        return Ok(FindPackageResult::Package(fs_path).into());
                                    }
                                }
                            }
                        }
                    }
                    context = context.parent();
                    let new_context_value = context.get().await?;
                    if *new_context_value == *context_value {
                        break;
                    }
                    context_value = new_context_value;
                }
            }
            ResolveModules::Path(_) => todo!(),
            ResolveModules::Registry(_, _) => todo!(),
        }
    }
    Ok(FindPackageResult::NotFound.into())
}

fn merge_results(results: Vec<ResolveResultRef>) -> ResolveResultRef {
    match results.len() {
        0 => ResolveResult::Unresolveable(None).into(),
        1 => results.into_iter().next().unwrap(),
        _ => ResolveResultRef::alternatives(results),
    }
}

#[turbo_tasks::function]
pub async fn resolve_raw(
    context: FileSystemPathRef,
    path: PatternRef,
    force_in_context: bool,
) -> Result<ResolveResultRef> {
    fn to_result(path: &FileSystemPathRef) -> ResolveResultRef {
        ResolveResult::Single(SourceAssetRef::new(path.clone()).into(), None).into()
    }
    let mut results = Vec::new();
    let pat = path.get().await?;
    if pat.could_match("/") && !pat.could_match("/fsd8nz8og54z") {
        let matches =
            read_matches(context.clone().root(), "/".to_string(), true, path.clone()).await?;
        if matches.len() > 10000 {
            println!(
                "WARN: resolving abs pattern {} in {} leads to {} results",
                pat.to_string(),
                context.clone().to_string().await?,
                matches.len()
            );
        } else {
            for m in matches.iter() {
                if let PatternMatch::File(_, path) = m {
                    results.push(to_result(&path));
                }
            }
        }
    }
    {
        let matches = read_matches(context.clone(), "".to_string(), force_in_context, path).await?;
        if matches.len() > 10000 {
            println!(
                "WARN: resolving pattern {} in {} leads to {} results",
                pat.to_string(),
                context.clone().to_string().await?,
                matches.len()
            );
        }
        for m in matches.iter() {
            if let PatternMatch::File(_, path) = m {
                results.push(to_result(&path));
            }
        }
    }
    Ok(merge_results(results))
}

#[turbo_tasks::function]
pub async fn resolve(
    context: FileSystemPathRef,
    request: RequestRef,
    options: ResolveOptionsRef,
) -> Result<ResolveResultRef> {
    async fn resolved(
        fs_path: FileSystemPathRef,
        resolved_map: &Option<ResolvedMapRef>,
        options: &ResolveOptionsRef,
    ) -> Result<ResolveResultRef> {
        if let Some(resolved_map) = resolved_map {
            match &*resolved_map.clone().lookup(fs_path.clone()).await? {
                ImportMapResult::Result(result) => {
                    return Ok(result.clone());
                }
                ImportMapResult::Alias(request) => {
                    return Ok(resolve(
                        fs_path.clone().parent(),
                        request.clone(),
                        options.clone(),
                    ));
                }
                ImportMapResult::NoEntry => {}
            }
        }
        return Ok(ResolveResult::Single(SourceAssetRef::new(fs_path).into(), None).into());
    }

    fn handle_exports_field(
        package_path: &FileSystemPathRef,
        package_json: &FileSystemPathRef,
        options: &ResolveOptionsRef,
        exports_field: &ExportsField,
        path: &str,
        conditions: &BTreeMap<String, ConditionValue>,
        unspecified_conditions: &ConditionValue,
    ) -> Result<ResolveResultRef> {
        let mut results = Vec::new();
        let mut conditions_state = HashMap::new();
        let values = exports_field
            .lookup(path)
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
                let request = RequestRef::parse(Value::new(format!("./{}", path).into()));
                resolved_results.push(resolve(package_path.clone(), request, options.clone()));
            }
        }
        // other options do not apply anymore when an exports field exist
        let resolved = merge_results(resolved_results);
        let resolved = resolved
            .add_reference(AffectingResolvingAssetReferenceRef::new(package_json.clone()).into());
        return Ok(resolved);
    }

    async fn resolve_into_folder(
        package_path: &FileSystemPathRef,
        package_json: &Option<(FileJsonContentRef, FileSystemPathRef)>,
        options: &ResolveOptionsRef,
    ) -> Result<ResolveResultRef> {
        let options_value = options.get().await?;
        for resolve_into_package in options_value.into_package.iter() {
            match resolve_into_package {
                ResolveIntoPackage::Default(req) => {
                    let str = "./".to_string()
                        + &normalize_path(&req).ok_or_else(|| {
                            anyhow!(
                                "ResolveIntoPackage::Default can't be used with a request that \
                                 escapes the current directory"
                            )
                        })?;
                    let request = RequestRef::parse(Value::new(str.into()));
                    return Ok(resolve(package_path.clone(), request, options.clone()));
                }
                ResolveIntoPackage::MainField(name) => {
                    if let Some((ref package_json, ref package_json_path)) = package_json {
                        if let FileJsonContent::Content(package_json) = &*package_json.get().await?
                        {
                            if let Some(field_value) = package_json[name].as_str() {
                                let request = RequestRef::parse(Value::new(
                                    normalize_request(&field_value).into(),
                                ));
                                let result =
                                    resolve(package_path.clone(), request, options.clone()).await?;
                                // we are not that strict when a main field fails to resolve
                                // we continue to try other alternatives
                                if !result.is_unresolveable() {
                                    let mut result = result.clone();
                                    result.add_reference(
                                        AffectingResolvingAssetReferenceRef::new(
                                            package_json_path.clone(),
                                        )
                                        .into(),
                                    );
                                    return Ok(result.into());
                                }
                            }
                        }
                    }
                }
                ResolveIntoPackage::ExportsField {
                    field,
                    conditions,
                    unspecified_conditions,
                } => {
                    if let Some((ref package_json, ref package_json_path)) = package_json {
                        if let ExportsFieldResult::Some(exports_field) =
                            &*exports_field(package_json.clone(), field).await?
                        {
                            // other options do not apply anymore when an exports field exist
                            return handle_exports_field(
                                package_path,
                                &package_json_path,
                                &options,
                                exports_field,
                                ".",
                                conditions,
                                unspecified_conditions,
                            );
                        }
                    }
                }
            }
        }
        Ok(ResolveResult::Unresolveable(None).into())
    }

    let options_value = options.get().await?;

    // Apply import mappings if provided
    if let Some(import_map) = &options_value.import_map {
        match &*import_map.clone().lookup(request.clone()).await? {
            ImportMapResult::Result(result) => {
                return Ok(result.clone());
            }
            ImportMapResult::Alias(request) => {
                return Ok(resolve(context, request.clone(), options));
            }
            ImportMapResult::NoEntry => {}
        }
    }

    let request_value = request.get().await?;
    Ok(match &*request_value {
        Request::Dynamic => ResolveResult::Unresolveable(None).into(),
        Request::Alternatives { requests } => {
            let results = requests
                .iter()
                .map(|req| resolve(context.clone(), req.clone(), options.clone()))
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
                PatternRef::new(path.clone()),
            )
            .get()
            .await?;
            for m in matches.iter() {
                match m {
                    PatternMatch::File(_, path) => {
                        results.push(
                            resolved(path.clone(), &options_value.resolved_map, &options).await?,
                        );
                    }
                    PatternMatch::Directory(_, path) => {
                        let path_value = path.get().await?;
                        let package_json = {
                            if let Some(new_path) = join_path(&path_value.path, "package.json") {
                                let fs_path = FileSystemPathRef::new_normalized(
                                    path_value.fs.clone(),
                                    new_path,
                                );
                                Some((fs_path.clone().read_json(), fs_path))
                            } else {
                                None
                            }
                        };
                        results.push(resolve_into_folder(&path, &package_json, &options).await?);
                    }
                }
            }
            merge_results(results)
        }
        Request::Relative {
            path,
            force_in_context,
        } => {
            let mut patterns = Vec::new();
            patterns.push(path.clone());
            for ext in options_value.extensions.iter() {
                let mut path = path.clone();
                path.push(ext.clone().into());
                patterns.push(path);
            }
            let new_pat = Pattern::alternatives(patterns);

            resolve(
                context,
                RequestRef::raw(Value::new(new_pat), *force_in_context),
                options,
            )
        }
        Request::Module { module, path } => {
            let package = find_package(
                context,
                module.clone(),
                resolve_modules_options(options.clone()),
            );
            match &*package.await? {
                FindPackageResult::Package(package_path) => {
                    let package_path_value = package_path.get().await?;
                    let package_json = {
                        if let Some(new_path) = join_path(&package_path_value.path, "package.json")
                        {
                            let fs_path = FileSystemPathRef::new_normalized(
                                package_path_value.fs.clone(),
                                new_path,
                            );
                            Some((fs_path.clone().read_json(), fs_path))
                        } else {
                            None
                        }
                    };
                    let mut results = Vec::new();
                    if path.is_match("") {
                        results.push(
                            resolve_into_folder(&package_path, &package_json, &options).await?,
                        );
                    }
                    if path.could_match_others("") {
                        for resolve_into_package in options_value.into_package.iter() {
                            match resolve_into_package {
                                ResolveIntoPackage::Default(_)
                                | ResolveIntoPackage::MainField(_) => {
                                    // doesn't affect packages with subpath
                                }
                                ResolveIntoPackage::ExportsField {
                                    field,
                                    conditions,
                                    unspecified_conditions,
                                } => {
                                    if let Some((ref package_json, ref package_json_path)) =
                                        package_json
                                    {
                                        if let ExportsFieldResult::Some(exports_field) =
                                            &*exports_field(package_json.clone(), field).await?
                                        {
                                            if let Some(path) = path.clone().into_string() {
                                                results.push(handle_exports_field(
                                                    package_path,
                                                    &package_json_path,
                                                    &options,
                                                    exports_field,
                                                    &format!(".{path}"),
                                                    conditions,
                                                    unspecified_conditions,
                                                )?);
                                            } else {
                                                todo!(
                                                    "pattern into an exports field is not \
                                                     implemented yet"
                                                );
                                            }
                                            // other options do not apply anymore when an exports
                                            // field exist
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        let mut new_pat = path.clone();
                        new_pat.push_front(".".to_string().into());
                        let relative = RequestRef::relative(Value::new(new_pat), true);
                        results.push(resolve(package_path.clone(), relative, options.clone()));
                    }
                    merge_results(results)
                }
                FindPackageResult::NotFound => ResolveResult::Unresolveable(None).into(),
            }
        }
        Request::ServerRelative { path: _ } => ResolveResult::Unresolveable(None).into(),
        Request::Windows { path: _ } => ResolveResult::Unresolveable(None).into(),
        Request::Empty => ResolveResult::Unresolveable(None).into(),
        Request::PackageInternal { path: _ } => ResolveResult::Unresolveable(None).into(),
        Request::Uri {
            protocol: _,
            remainer: _,
        } => ResolveResult::Unresolveable(None).into(),
        Request::Unknown { path: _ } => ResolveResult::Unresolveable(None).into(),
    })
}

#[turbo_tasks::value(AssetReference)]
#[derive(PartialEq, Eq)]
struct AffectingResolvingAssetReference {
    file: FileSystemPathRef,
}

impl AffectingResolvingAssetReferenceRef {
    fn new(file: FileSystemPathRef) -> Self {
        Self::slot(AffectingResolvingAssetReference { file })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for AffectingResolvingAssetReference {
    fn resolve_reference(&self) -> ResolveResultRef {
        ResolveResult::Single(SourceAssetRef::new(self.file.clone()).into(), None).into()
    }
}
