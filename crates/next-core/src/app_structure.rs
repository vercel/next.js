use std::collections::BTreeMap;

use anyhow::{Context, Result, bail};
use indexmap::map::{Entry, OccupiedEntry};
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxIndexMap, FxIndexSet, NonLocalValue, ResolvedVc, TaskInput, TryJoinIterExt, ValueDefault, Vc,
    debug::ValueDebugFormat, fxindexmap, trace::TraceRawVcs,
};
use turbo_tasks_fs::{DirectoryContent, DirectoryEntry, FileSystemEntryType, FileSystemPath};
use turbopack_core::issue::{
    Issue, IssueExt, IssueSeverity, IssueStage, OptionStyledString, StyledString,
};

use crate::{
    mode::NextMode,
    next_app::{
        AppPage, AppPath, PageSegment, PageType,
        metadata::{
            GlobalMetadataFileMatch, MetadataFileMatch, match_global_metadata_file,
            match_local_metadata_file, normalize_metadata_route,
        },
    },
    next_import_map::get_next_package,
};

// Next.js ignores underscores for routes but you can use %5f to still serve an underscored
// route.
fn normalize_underscore(string: &str) -> String {
    string.replace("%5F", "_")
}

/// A final route in the app directory.
#[turbo_tasks::value]
#[derive(Default, Debug, Clone)]
pub struct AppDirModules {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<FileSystemPath>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layout: Option<FileSystemPath>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<FileSystemPath>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub global_error: Option<FileSystemPath>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub global_not_found: Option<FileSystemPath>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loading: Option<FileSystemPath>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template: Option<FileSystemPath>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub forbidden: Option<FileSystemPath>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unauthorized: Option<FileSystemPath>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub not_found: Option<FileSystemPath>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default: Option<FileSystemPath>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route: Option<FileSystemPath>,
    #[serde(skip_serializing_if = "Metadata::is_empty", default)]
    pub metadata: Metadata,
}

impl AppDirModules {
    fn without_leaves(&self) -> Self {
        Self {
            page: None,
            layout: self.layout.clone(),
            error: self.error.clone(),
            global_error: self.global_error.clone(),
            global_not_found: self.global_not_found.clone(),
            loading: self.loading.clone(),
            template: self.template.clone(),
            not_found: self.not_found.clone(),
            forbidden: self.forbidden.clone(),
            unauthorized: self.unauthorized.clone(),
            default: None,
            route: None,
            metadata: self.metadata.clone(),
        }
    }
}

/// A single metadata file plus an optional "alt" text file.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TraceRawVcs, NonLocalValue)]
pub enum MetadataWithAltItem {
    Static {
        path: FileSystemPath,
        alt_path: Option<FileSystemPath>,
    },
    Dynamic {
        path: FileSystemPath,
    },
}

/// A single metadata file.
#[derive(
    Clone, Debug, Hash, Serialize, Deserialize, PartialEq, Eq, TaskInput, TraceRawVcs, NonLocalValue,
)]
pub enum MetadataItem {
    Static { path: FileSystemPath },
    Dynamic { path: FileSystemPath },
}

#[turbo_tasks::function]
pub async fn get_metadata_route_name(meta: MetadataItem) -> Result<Vc<RcStr>> {
    Ok(match meta {
        MetadataItem::Static { path } => Vc::cell(path.file_name().into()),
        MetadataItem::Dynamic { path } => {
            let Some(stem) = path.file_stem() else {
                bail!(
                    "unable to resolve file stem for metadata item at {}",
                    path.value_to_string().await?
                );
            };

            match stem {
                "manifest" => Vc::cell(rcstr!("manifest.webmanifest")),
                _ => Vc::cell(RcStr::from(stem)),
            }
        }
    })
}

impl MetadataItem {
    pub fn into_path(self) -> FileSystemPath {
        match self {
            MetadataItem::Static { path } => path,
            MetadataItem::Dynamic { path } => path,
        }
    }
}

impl From<MetadataWithAltItem> for MetadataItem {
    fn from(value: MetadataWithAltItem) -> Self {
        match value {
            MetadataWithAltItem::Static { path, .. } => MetadataItem::Static { path },
            MetadataWithAltItem::Dynamic { path } => MetadataItem::Dynamic { path },
        }
    }
}

/// Metadata file that can be placed in any segment of the app directory.
#[derive(
    Default, Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TraceRawVcs, NonLocalValue,
)]
pub struct Metadata {
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub icon: Vec<MetadataWithAltItem>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub apple: Vec<MetadataWithAltItem>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub twitter: Vec<MetadataWithAltItem>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub open_graph: Vec<MetadataWithAltItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sitemap: Option<MetadataItem>,
    // The page indicates where the metadata is defined and captured.
    // The steps for capturing metadata (get_directory_tree) and constructing
    // LoaderTree (directory_tree_to_entrypoints) is separated,
    // and child loader tree can trickle down metadata when clone / merge components calculates
    // the actual path incorrectly with fillMetadataSegment.
    //
    // This is only being used for the static metadata files.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_page: Option<AppPage>,
}

impl Metadata {
    pub fn is_empty(&self) -> bool {
        let Metadata {
            icon,
            apple,
            twitter,
            open_graph,
            sitemap,
            base_page: _,
        } = self;
        icon.is_empty()
            && apple.is_empty()
            && twitter.is_empty()
            && open_graph.is_empty()
            && sitemap.is_none()
    }
}

/// Metadata files that can be placed in the root of the app directory.
#[turbo_tasks::value]
#[derive(Default, Clone, Debug)]
pub struct GlobalMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub favicon: Option<MetadataItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub robots: Option<MetadataItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manifest: Option<MetadataItem>,
}

impl GlobalMetadata {
    pub fn is_empty(&self) -> bool {
        let GlobalMetadata {
            favicon,
            robots,
            manifest,
        } = self;
        favicon.is_none() && robots.is_none() && manifest.is_none()
    }
}

#[turbo_tasks::value]
#[derive(Debug)]
pub struct DirectoryTree {
    /// key is e.g. "dashboard", "(dashboard)", "@slot"
    pub subdirectories: BTreeMap<RcStr, ResolvedVc<DirectoryTree>>,
    pub modules: AppDirModules,
}

#[turbo_tasks::value]
#[derive(Clone, Debug)]
struct PlainDirectoryTree {
    /// key is e.g. "dashboard", "(dashboard)", "@slot"
    pub subdirectories: BTreeMap<RcStr, PlainDirectoryTree>,
    pub modules: AppDirModules,
}

#[turbo_tasks::value_impl]
impl DirectoryTree {
    #[turbo_tasks::function]
    pub async fn into_plain(&self) -> Result<Vc<PlainDirectoryTree>> {
        let mut subdirectories = BTreeMap::new();

        for (name, subdirectory) in &self.subdirectories {
            subdirectories.insert(name.clone(), subdirectory.into_plain().owned().await?);
        }

        Ok(PlainDirectoryTree {
            subdirectories,
            modules: self.modules.clone(),
        }
        .cell())
    }
}

#[turbo_tasks::value(transparent)]
pub struct OptionAppDir(Option<FileSystemPath>);

/// Finds and returns the [DirectoryTree] of the app directory if existing.
#[turbo_tasks::function]
pub async fn find_app_dir(project_path: FileSystemPath) -> Result<Vc<OptionAppDir>> {
    let app = project_path.join("app")?;
    let src_app = project_path.join("src/app")?;
    let app_dir = if *app.get_type().await? == FileSystemEntryType::Directory {
        app
    } else if *src_app.get_type().await? == FileSystemEntryType::Directory {
        src_app
    } else {
        return Ok(Vc::cell(None));
    };

    Ok(Vc::cell(Some(app_dir)))
}

#[turbo_tasks::function]
async fn get_directory_tree(
    dir: FileSystemPath,
    page_extensions: Vc<Vec<RcStr>>,
) -> Result<Vc<DirectoryTree>> {
    let span = tracing::info_span!(
        "read app directory tree",
        name = display(dir.value_to_string().await?)
    );
    get_directory_tree_internal(dir, page_extensions)
        .instrument(span)
        .await
}

async fn get_directory_tree_internal(
    dir: FileSystemPath,
    page_extensions: Vc<Vec<RcStr>>,
) -> Result<Vc<DirectoryTree>> {
    let DirectoryContent::Entries(entries) = &*dir.read_dir().await? else {
        // the file watcher might invalidate things in the wrong order,
        // and we have to account for the eventual consistency of turbo-tasks
        // so we just return an empty tree here.
        return Ok(DirectoryTree {
            subdirectories: Default::default(),
            modules: AppDirModules::default(),
        }
        .cell());
    };
    let page_extensions_value = page_extensions.await?;

    let mut subdirectories = BTreeMap::new();
    let mut modules = AppDirModules::default();

    let mut metadata_icon = Vec::new();
    let mut metadata_apple = Vec::new();
    let mut metadata_open_graph = Vec::new();
    let mut metadata_twitter = Vec::new();

    for (basename, entry) in entries {
        let entry = entry.clone().resolve_symlink().await?;
        match entry {
            DirectoryEntry::File(file) => {
                // Do not process .d.ts files as routes
                if basename.ends_with(".d.ts") {
                    continue;
                }
                if let Some((stem, ext)) = basename.split_once('.')
                    && page_extensions_value.iter().any(|e| e == ext)
                {
                    match stem {
                        "page" => modules.page = Some(file.clone()),
                        "layout" => modules.layout = Some(file.clone()),
                        "error" => modules.error = Some(file.clone()),
                        "global-error" => modules.global_error = Some(file.clone()),
                        "global-not-found" => modules.global_not_found = Some(file.clone()),
                        "loading" => modules.loading = Some(file.clone()),
                        "template" => modules.template = Some(file.clone()),
                        "forbidden" => modules.forbidden = Some(file.clone()),
                        "unauthorized" => modules.unauthorized = Some(file.clone()),
                        "not-found" => modules.not_found = Some(file.clone()),
                        "default" => modules.default = Some(file.clone()),
                        "route" => modules.route = Some(file.clone()),
                        _ => {}
                    }
                }

                let Some(MetadataFileMatch {
                    metadata_type,
                    number,
                    dynamic,
                }) = match_local_metadata_file(basename.as_str(), &page_extensions_value)
                else {
                    continue;
                };

                let entry = match metadata_type {
                    "icon" => &mut metadata_icon,
                    "apple-icon" => &mut metadata_apple,
                    "twitter-image" => &mut metadata_twitter,
                    "opengraph-image" => &mut metadata_open_graph,
                    "sitemap" => {
                        if dynamic {
                            modules.metadata.sitemap = Some(MetadataItem::Dynamic { path: file });
                        } else {
                            modules.metadata.sitemap = Some(MetadataItem::Static { path: file });
                        }
                        continue;
                    }
                    _ => continue,
                };

                if dynamic {
                    entry.push((number, MetadataWithAltItem::Dynamic { path: file }));
                    continue;
                }

                let file_name = file.file_name();
                let basename = file_name
                    .rsplit_once('.')
                    .map_or(file_name, |(basename, _)| basename);
                let alt_path = file.parent().join(&format!("{basename}.alt.txt"))?;
                let alt_path = matches!(&*alt_path.get_type().await?, FileSystemEntryType::File)
                    .then_some(alt_path);

                entry.push((
                    number,
                    MetadataWithAltItem::Static {
                        path: file,
                        alt_path,
                    },
                ));
            }
            DirectoryEntry::Directory(dir) => {
                // appDir ignores paths starting with an underscore
                if !basename.starts_with('_') {
                    let result = get_directory_tree(dir.clone(), page_extensions)
                        .to_resolved()
                        .await?;
                    subdirectories.insert(basename.clone(), result);
                }
            }
            // TODO(WEB-952) handle symlinks in app dir
            _ => {}
        }
    }

    fn sort<T>(mut list: Vec<(Option<u32>, T)>) -> Vec<T> {
        list.sort_by_key(|(num, _)| *num);
        list.into_iter().map(|(_, item)| item).collect()
    }

    modules.metadata.icon = sort(metadata_icon);
    modules.metadata.apple = sort(metadata_apple);
    modules.metadata.twitter = sort(metadata_twitter);
    modules.metadata.open_graph = sort(metadata_open_graph);

    Ok(DirectoryTree {
        subdirectories,
        modules,
    }
    .cell())
}

#[turbo_tasks::value]
#[derive(Debug, Clone)]
pub struct AppPageLoaderTree {
    pub page: AppPage,
    pub segment: RcStr,
    pub parallel_routes: FxIndexMap<RcStr, AppPageLoaderTree>,
    pub modules: AppDirModules,
    pub global_metadata: ResolvedVc<GlobalMetadata>,
}

impl AppPageLoaderTree {
    /// Returns true if there's a page match in this loader tree.
    pub fn has_page(&self) -> bool {
        if &*self.segment == "__PAGE__" {
            return true;
        }

        for (_, tree) in &self.parallel_routes {
            if tree.has_page() {
                return true;
            }
        }

        false
    }

    /// Returns whether the only match in this tree is for a catch-all
    /// route.
    pub fn has_only_catchall(&self) -> bool {
        if &*self.segment == "__PAGE__" && !self.page.is_catchall() {
            return false;
        }

        for (_, tree) in &self.parallel_routes {
            if !tree.has_only_catchall() {
                return false;
            }
        }

        true
    }

    /// Returns true if this loader tree contains an intercepting route match.
    pub fn is_intercepting(&self) -> bool {
        if self.page.is_intercepting() && self.has_page() {
            return true;
        }

        for (_, tree) in &self.parallel_routes {
            if tree.is_intercepting() {
                return true;
            }
        }

        false
    }

    /// Returns the specificity of the page (i.e. the number of segments
    /// affecting the path)
    pub fn get_specificity(&self) -> usize {
        if &*self.segment == "__PAGE__" {
            return AppPath::from(self.page.clone()).len();
        }

        let mut specificity = 0;

        for (_, tree) in &self.parallel_routes {
            specificity = specificity.max(tree.get_specificity());
        }

        specificity
    }
}

#[turbo_tasks::value(transparent)]
#[derive(Default)]
pub struct RootParamVecOption(Option<Vec<RcStr>>);

#[turbo_tasks::value_impl]
impl ValueDefault for RootParamVecOption {
    #[turbo_tasks::function]
    fn value_default() -> Vc<Self> {
        Vc::cell(Default::default())
    }
}

#[turbo_tasks::value(transparent)]
pub struct FileSystemPathVec(Vec<FileSystemPath>);

#[turbo_tasks::value_impl]
impl ValueDefault for FileSystemPathVec {
    #[turbo_tasks::function]
    fn value_default() -> Vc<Self> {
        Vc::cell(Vec::new())
    }
}

#[derive(
    Clone,
    PartialEq,
    Eq,
    Hash,
    Serialize,
    Deserialize,
    TraceRawVcs,
    ValueDebugFormat,
    Debug,
    TaskInput,
    NonLocalValue,
)]
pub enum Entrypoint {
    AppPage {
        pages: Vec<AppPage>,
        loader_tree: ResolvedVc<AppPageLoaderTree>,
        root_params: ResolvedVc<RootParamVecOption>,
    },
    AppRoute {
        page: AppPage,
        path: FileSystemPath,
        root_layouts: ResolvedVc<FileSystemPathVec>,
        root_params: ResolvedVc<RootParamVecOption>,
    },
    AppMetadata {
        page: AppPage,
        metadata: MetadataItem,
        root_params: ResolvedVc<RootParamVecOption>,
    },
}

impl Entrypoint {
    pub fn page(&self) -> &AppPage {
        match self {
            Entrypoint::AppPage { pages, .. } => pages.first().unwrap(),
            Entrypoint::AppRoute { page, .. } => page,
            Entrypoint::AppMetadata { page, .. } => page,
        }
    }
    pub fn root_params(&self) -> ResolvedVc<RootParamVecOption> {
        match self {
            Entrypoint::AppPage { root_params, .. } => *root_params,
            Entrypoint::AppRoute { root_params, .. } => *root_params,
            Entrypoint::AppMetadata { root_params, .. } => *root_params,
        }
    }
}

#[turbo_tasks::value(transparent)]
pub struct Entrypoints(FxIndexMap<AppPath, Entrypoint>);

fn is_parallel_route(name: &str) -> bool {
    name.starts_with('@')
}

fn is_group_route(name: &str) -> bool {
    name.starts_with('(') && name.ends_with(')')
}

fn match_parallel_route(name: &str) -> Option<&str> {
    name.strip_prefix('@')
}

fn conflict_issue(
    app_dir: FileSystemPath,
    e: &'_ OccupiedEntry<'_, AppPath, Entrypoint>,
    a: &str,
    b: &str,
    value_a: &AppPage,
    value_b: &AppPage,
) {
    let item_names = if a == b {
        format!("{a}s")
    } else {
        format!("{a} and {b}")
    };

    DirectoryTreeIssue {
        app_dir,
        message: StyledString::Text(
            format!(
                "Conflicting {} at {}: {a} at {value_a} and {b} at {value_b}",
                item_names,
                e.key(),
            )
            .into(),
        )
        .resolved_cell(),
        severity: IssueSeverity::Error,
    }
    .resolved_cell()
    .emit();
}

fn add_app_page(
    app_dir: FileSystemPath,
    result: &mut FxIndexMap<AppPath, Entrypoint>,
    page: AppPage,
    loader_tree: ResolvedVc<AppPageLoaderTree>,
    root_params: ResolvedVc<RootParamVecOption>,
) {
    let mut e = match result.entry(page.clone().into()) {
        Entry::Occupied(e) => e,
        Entry::Vacant(e) => {
            e.insert(Entrypoint::AppPage {
                pages: vec![page],
                loader_tree,
                root_params,
            });
            return;
        }
    };

    let conflict = |existing_name: &str, existing_page: &AppPage| {
        conflict_issue(app_dir, &e, "page", existing_name, &page, existing_page);
    };

    let value = e.get();
    match value {
        Entrypoint::AppPage {
            pages: existing_pages,
            loader_tree: existing_loader_tree,
            ..
        } => {
            // loader trees should always match for the same path as they are generated by a
            // turbo tasks function
            if *existing_loader_tree != loader_tree {
                conflict("page", existing_pages.first().unwrap());
            }

            let Entrypoint::AppPage {
                pages: stored_pages,
                ..
            } = e.get_mut()
            else {
                unreachable!("Entrypoint::AppPage was already matched");
            };

            stored_pages.push(page);
            stored_pages.sort();
        }
        Entrypoint::AppRoute {
            page: existing_page,
            ..
        } => {
            conflict("route", existing_page);
        }
        Entrypoint::AppMetadata {
            page: existing_page,
            ..
        } => {
            conflict("metadata", existing_page);
        }
    }
}

fn add_app_route(
    app_dir: FileSystemPath,
    result: &mut FxIndexMap<AppPath, Entrypoint>,
    page: AppPage,
    path: FileSystemPath,
    root_layouts: ResolvedVc<FileSystemPathVec>,
    root_params: ResolvedVc<RootParamVecOption>,
) {
    let e = match result.entry(page.clone().into()) {
        Entry::Occupied(e) => e,
        Entry::Vacant(e) => {
            e.insert(Entrypoint::AppRoute {
                page,
                path,
                root_layouts,
                root_params,
            });
            return;
        }
    };

    let conflict = |existing_name: &str, existing_page: &AppPage| {
        conflict_issue(app_dir, &e, "route", existing_name, &page, existing_page);
    };

    let value = e.get();
    match value {
        Entrypoint::AppPage { pages, .. } => {
            conflict("page", pages.first().unwrap());
        }
        Entrypoint::AppRoute {
            page: existing_page,
            ..
        } => {
            conflict("route", existing_page);
        }
        Entrypoint::AppMetadata {
            page: existing_page,
            ..
        } => {
            conflict("metadata", existing_page);
        }
    }
}

fn add_app_metadata_route(
    app_dir: FileSystemPath,
    result: &mut FxIndexMap<AppPath, Entrypoint>,
    page: AppPage,
    metadata: MetadataItem,
    root_params: ResolvedVc<RootParamVecOption>,
) {
    let e = match result.entry(page.clone().into()) {
        Entry::Occupied(e) => e,
        Entry::Vacant(e) => {
            e.insert(Entrypoint::AppMetadata {
                page,
                metadata,
                root_params,
            });
            return;
        }
    };

    let conflict = |existing_name: &str, existing_page: &AppPage| {
        conflict_issue(app_dir, &e, "metadata", existing_name, &page, existing_page);
    };

    let value = e.get();
    match value {
        Entrypoint::AppPage { pages, .. } => {
            conflict("page", pages.first().unwrap());
        }
        Entrypoint::AppRoute {
            page: existing_page,
            ..
        } => {
            conflict("route", existing_page);
        }
        Entrypoint::AppMetadata {
            page: existing_page,
            ..
        } => {
            conflict("metadata", existing_page);
        }
    }
}

#[turbo_tasks::function]
pub fn get_entrypoints(
    app_dir: FileSystemPath,
    page_extensions: Vc<Vec<RcStr>>,
    is_global_not_found_enabled: Vc<bool>,
    next_mode: Vc<NextMode>,
) -> Vc<Entrypoints> {
    directory_tree_to_entrypoints(
        app_dir.clone(),
        get_directory_tree(app_dir.clone(), page_extensions),
        get_global_metadata(app_dir, page_extensions),
        is_global_not_found_enabled,
        next_mode,
        Default::default(),
        Default::default(),
    )
}

#[turbo_tasks::value(transparent)]
pub struct CollectedRootParams(FxIndexSet<RcStr>);

#[turbo_tasks::function]
pub async fn collect_root_params(
    entrypoints: ResolvedVc<Entrypoints>,
) -> Result<Vc<CollectedRootParams>> {
    let mut collected_root_params = FxIndexSet::<RcStr>::default();
    for (_, entrypoint) in entrypoints.await?.iter() {
        if let Some(ref root_params) = *entrypoint.root_params().await? {
            collected_root_params.extend(root_params.iter().cloned());
        }
    }
    Ok(Vc::cell(collected_root_params))
}

#[turbo_tasks::function]
fn directory_tree_to_entrypoints(
    app_dir: FileSystemPath,
    directory_tree: Vc<DirectoryTree>,
    global_metadata: Vc<GlobalMetadata>,
    is_global_not_found_enabled: Vc<bool>,
    next_mode: Vc<NextMode>,
    root_layouts: Vc<FileSystemPathVec>,
    root_params: Vc<RootParamVecOption>,
) -> Vc<Entrypoints> {
    directory_tree_to_entrypoints_internal(
        app_dir,
        global_metadata,
        is_global_not_found_enabled,
        next_mode,
        rcstr!(""),
        directory_tree,
        AppPage::new(),
        root_layouts,
        root_params,
    )
}

#[turbo_tasks::value]
struct DuplicateParallelRouteIssue {
    app_dir: FileSystemPath,
    previously_inserted_page: AppPage,
    page: AppPage,
}

#[turbo_tasks::value_impl]
impl Issue for DuplicateParallelRouteIssue {
    #[turbo_tasks::function]
    fn file_path(&self) -> Result<Vc<FileSystemPath>> {
        Ok(self.app_dir.join(&self.page.to_string())?.cell())
    }

    #[turbo_tasks::function]
    fn stage(self: Vc<Self>) -> Vc<IssueStage> {
        IssueStage::ProcessModule.cell()
    }

    #[turbo_tasks::function]
    async fn title(self: Vc<Self>) -> Result<Vc<StyledString>> {
        let this = self.await?;
        Ok(StyledString::Text(
            format!(
                "You cannot have two parallel pages that resolve to the same path. Please check \
                 {} and {}.",
                this.previously_inserted_page, this.page
            )
            .into(),
        )
        .cell())
    }
}

#[turbo_tasks::value]
struct MissingDefaultParallelRouteIssue {
    app_dir: FileSystemPath,
    app_page: AppPage,
    slot_name: RcStr,
}

#[turbo_tasks::function]
fn missing_default_parallel_route_issue(
    app_dir: FileSystemPath,
    app_page: AppPage,
    slot_name: RcStr,
) -> Vc<MissingDefaultParallelRouteIssue> {
    MissingDefaultParallelRouteIssue {
        app_dir,
        app_page,
        slot_name,
    }
    .cell()
}

#[turbo_tasks::value_impl]
impl Issue for MissingDefaultParallelRouteIssue {
    #[turbo_tasks::function]
    fn file_path(&self) -> Result<Vc<FileSystemPath>> {
        Ok(self
            .app_dir
            .join(&self.app_page.to_string())?
            .join(&format!("@{}", self.slot_name))?
            .cell())
    }

    #[turbo_tasks::function]
    fn stage(self: Vc<Self>) -> Vc<IssueStage> {
        IssueStage::AppStructure.cell()
    }

    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Vc<StyledString> {
        StyledString::Text(
            format!(
                "Missing required default.js file for parallel route at {}/@{}",
                self.app_page, self.slot_name
            )
            .into(),
        )
        .cell()
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(
            StyledString::Stack(vec![
                StyledString::Text(
                    format!(
                        "The parallel route slot \"@{}\" is missing a default.js file. When using \
                         parallel routes, each slot must have a default.js file to serve as a \
                         fallback.",
                        self.slot_name
                    )
                    .into(),
                ),
                StyledString::Text(
                    format!(
                        "Create a default.js file at: {}/@{}/default.js",
                        self.app_page, self.slot_name
                    )
                    .into(),
                ),
            ])
            .resolved_cell(),
        ))
    }

    #[turbo_tasks::function]
    fn documentation_link(&self) -> Vc<RcStr> {
        Vc::cell(rcstr!(
            "https://nextjs.org/docs/messages/slot-missing-default"
        ))
    }
}

fn page_path_except_parallel(loader_tree: &AppPageLoaderTree) -> Option<AppPage> {
    if loader_tree.page.iter().any(|v| {
        matches!(
            v,
            PageSegment::CatchAll(..)
                | PageSegment::OptionalCatchAll(..)
                | PageSegment::Parallel(..)
        )
    }) {
        return None;
    }

    if loader_tree.modules.page.is_some() {
        return Some(loader_tree.page.clone());
    }

    if let Some(children) = loader_tree.parallel_routes.get("children") {
        return page_path_except_parallel(children);
    }

    None
}

/// Checks if a directory tree has child routes (non-parallel, non-group routes).
/// Leaf segments don't need default.js because there are no child routes
/// that could cause the parallel slot to unmatch.
fn has_child_routes(directory_tree: &PlainDirectoryTree) -> bool {
    for (name, subdirectory) in &directory_tree.subdirectories {
        // Skip parallel routes (start with '@')
        if is_parallel_route(name) {
            continue;
        }

        // Skip route groups, but check if they have pages inside
        if is_group_route(name) {
            // Recursively check if the group has child routes
            if has_child_routes(subdirectory) {
                return true;
            }
            continue;
        }

        // If we get here, it's a regular route segment (child route)
        return true;
    }

    false
}

async fn check_duplicate(
    duplicate: &mut FxHashMap<AppPath, AppPage>,
    loader_tree: &AppPageLoaderTree,
    app_dir: FileSystemPath,
) -> Result<()> {
    let page_path = page_path_except_parallel(loader_tree);

    if let Some(page_path) = page_path
        && let Some(prev) = duplicate.insert(AppPath::from(page_path.clone()), page_path.clone())
        && prev != page_path
    {
        DuplicateParallelRouteIssue {
            app_dir: app_dir.clone(),
            previously_inserted_page: prev.clone(),
            page: loader_tree.page.clone(),
        }
        .resolved_cell()
        .emit();
    }

    Ok(())
}

#[turbo_tasks::value(transparent)]
struct AppPageLoaderTreeOption(Option<ResolvedVc<AppPageLoaderTree>>);

/// creates the loader tree for a specific route (pathname / [AppPath])
#[turbo_tasks::function]
async fn directory_tree_to_loader_tree(
    app_dir: FileSystemPath,
    global_metadata: Vc<GlobalMetadata>,
    directory_name: RcStr,
    directory_tree: Vc<DirectoryTree>,
    app_page: AppPage,
    // the page this loader tree is constructed for
    for_app_path: AppPath,
) -> Result<Vc<AppPageLoaderTreeOption>> {
    let plain_tree = &*directory_tree.into_plain().await?;

    let tree = directory_tree_to_loader_tree_internal(
        app_dir,
        global_metadata,
        directory_name,
        plain_tree,
        app_page,
        for_app_path,
        AppDirModules::default(),
    )
    .await?;

    Ok(Vc::cell(tree.map(AppPageLoaderTree::resolved_cell)))
}

/// Checks the current module if it needs to be updated with the default page.
/// If the module is already set, update the parent module to the same value.
/// If the parent module is set and module is not set, set the module to the parent module.
/// If the module and the parent module are not set, set them to the default value.
///
/// # Arguments
/// * `app_dir` - The application directory.
/// * `module` - The current module to check and update if it is not set.
/// * `parent_module` - The parent module to update if the current module is set or both are not
///   set.
/// * `file_path` - The file path to the default page if neither the current module nor the parent
///   module is set.
/// * `is_first_layer_group_route` - If true, the module will be overridden with the parent module
///   if it is not set.
async fn check_and_update_module_references(
    app_dir: FileSystemPath,
    module: &mut Option<FileSystemPath>,
    parent_module: &mut Option<FileSystemPath>,
    file_path: &str,
    is_first_layer_group_route: bool,
) -> Result<()> {
    match (module.as_mut(), parent_module.as_mut()) {
        // If the module is set, update the parent module to the same value
        (Some(module), _) => *parent_module = Some(module.clone()),
        // If we are in a first layer group route and we have a parent module, we want to override
        // a nonexistent module with the parent module
        (None, Some(parent_module)) if is_first_layer_group_route => {
            *module = Some(parent_module.clone())
        }
        // If we are not in a first layer group route, and the module is not set, and the parent
        // module is set, we do nothing
        (None, Some(_)) => {}
        // If the module is not set, and the parent module is not set, we override with the default
        // page. This can only happen in the root directory because after this the parent module
        // will always be set.
        (None, None) => {
            let default_page = get_next_package(app_dir).await?.join(file_path)?;
            *module = Some(default_page.clone());
            *parent_module = Some(default_page);
        }
    }

    Ok(())
}

/// Checks if the current directory is the root directory and if the module is not set.
/// If the module is not set, it will be set to the default page.
///
/// # Arguments
/// * `app_dir` - The application directory.
/// * `module` - The module to check and update if it is not set.
/// * `file_path` - The file path to the default page if the module is not set.
async fn check_and_update_global_module_references(
    app_dir: FileSystemPath,
    module: &mut Option<FileSystemPath>,
    file_path: &str,
) -> Result<()> {
    if module.is_none() {
        *module = Some(get_next_package(app_dir).await?.join(file_path)?);
    }

    Ok(())
}

async fn directory_tree_to_loader_tree_internal(
    app_dir: FileSystemPath,
    global_metadata: Vc<GlobalMetadata>,
    directory_name: RcStr,
    directory_tree: &PlainDirectoryTree,
    app_page: AppPage,
    // the page this loader tree is constructed for
    for_app_path: AppPath,
    mut parent_modules: AppDirModules,
) -> Result<Option<AppPageLoaderTree>> {
    let app_path = AppPath::from(app_page.clone());

    if !for_app_path.contains(&app_path) {
        return Ok(None);
    }

    let mut modules = directory_tree.modules.clone();

    // Capture the current page for the metadata to calculate segment relative to
    // the corresponding page for the static metadata files.
    modules.metadata.base_page = Some(app_page.clone());

    // the root directory in the app dir.
    let is_root_directory = app_page.is_root();

    // If the first layer is a group route, we treat it as root layer
    let is_first_layer_group_route = app_page.is_first_layer_group_route();

    // Handle the non-global modules that should always be overridden for top level groups or set to
    // the default page if they are not set.
    if is_root_directory || is_first_layer_group_route {
        check_and_update_module_references(
            app_dir.clone(),
            &mut modules.not_found,
            &mut parent_modules.not_found,
            "dist/client/components/builtin/not-found.js",
            is_first_layer_group_route,
        )
        .await?;

        check_and_update_module_references(
            app_dir.clone(),
            &mut modules.forbidden,
            &mut parent_modules.forbidden,
            "dist/client/components/builtin/forbidden.js",
            is_first_layer_group_route,
        )
        .await?;

        check_and_update_module_references(
            app_dir.clone(),
            &mut modules.unauthorized,
            &mut parent_modules.unauthorized,
            "dist/client/components/builtin/unauthorized.js",
            is_first_layer_group_route,
        )
        .await?;
    }

    if is_root_directory {
        check_and_update_global_module_references(
            app_dir.clone(),
            &mut modules.global_error,
            "dist/client/components/builtin/global-error.js",
        )
        .await?;
    }

    let mut tree = AppPageLoaderTree {
        page: app_page.clone(),
        segment: directory_name.clone(),
        parallel_routes: FxIndexMap::default(),
        modules: modules.without_leaves(),
        global_metadata: global_metadata.to_resolved().await?,
    };

    let current_level_is_parallel_route = is_parallel_route(&directory_name);

    if current_level_is_parallel_route {
        tree.segment = rcstr!("(slot)");
    }

    if let Some(page) = (app_path == for_app_path || app_path.is_catchall())
        .then_some(modules.page)
        .flatten()
    {
        tree.parallel_routes.insert(
            rcstr!("children"),
            AppPageLoaderTree {
                page: app_page.clone(),
                segment: rcstr!("__PAGE__"),
                parallel_routes: FxIndexMap::default(),
                modules: AppDirModules {
                    page: Some(page),
                    metadata: modules.metadata,
                    ..Default::default()
                },
                global_metadata: global_metadata.to_resolved().await?,
            },
        );
    }

    let mut duplicate = FxHashMap::default();

    for (subdir_name, subdirectory) in &directory_tree.subdirectories {
        let parallel_route_key = match_parallel_route(subdir_name);

        let mut child_app_page = app_page.clone();
        let mut illegal_path_error = None;

        // When constructing the app_page fails (e. g. due to limitations of the order),
        // we only want to emit the error when there are actual pages below that
        // directory.
        if let Err(e) = child_app_page.push_str(&normalize_underscore(subdir_name)) {
            illegal_path_error = Some(e);
        }

        let subtree = Box::pin(directory_tree_to_loader_tree_internal(
            app_dir.clone(),
            global_metadata,
            subdir_name.clone(),
            subdirectory,
            child_app_page.clone(),
            for_app_path.clone(),
            parent_modules.clone(),
        ))
        .await?;

        if let Some(illegal_path) = subtree.as_ref().and(illegal_path_error) {
            return Err(illegal_path);
        }

        if let Some(subtree) = subtree {
            if let Some(key) = parallel_route_key {
                let is_inside_catchall = app_page.is_catchall();

                // Validate that parallel routes (except "children") have a default.js file.
                // Skip this validation if the slot is UNDER a catch-all route (i.e., the
                // parallel route is a child of a catch-all segment).
                // For example:
                //   /[...catchAll]/@slot - is_inside_catchall = true (skip validation) ✓
                //   /@slot/[...catchAll] - is_inside_catchall = false (require default) ✓
                // The catch-all provides fallback behavior, so default.js is not required.
                //
                // Also skip validation if this is a leaf segment (no child routes).
                // Leaf segments don't need default.js because there are no child routes
                // that could cause the parallel slot to unmatch. For example:
                //   /repo-overview/@slot/page with no child routes - is_leaf_segment = true (skip
                // validation) ✓   /repo-overview/@slot/page with
                // /repo-overview/child/page - is_leaf_segment = false (require default) ✓
                // This also handles route groups correctly by filtering them out.
                let is_leaf_segment = !has_child_routes(directory_tree);

                if key != "children"
                    && subdirectory.modules.default.is_none()
                    && !is_inside_catchall
                    && !is_leaf_segment
                {
                    missing_default_parallel_route_issue(
                        app_dir.clone(),
                        app_page.clone(),
                        key.into(),
                    )
                    .to_resolved()
                    .await?
                    .emit();
                }

                tree.parallel_routes.insert(key.into(), subtree);
                continue;
            }

            // skip groups which don't have a page match.
            if is_group_route(subdir_name) && !subtree.has_page() {
                continue;
            }

            if subtree.has_page() {
                check_duplicate(&mut duplicate, &subtree, app_dir.clone()).await?;
            }

            if let Some(current_tree) = tree.parallel_routes.get("children") {
                if current_tree.has_only_catchall()
                    && (!subtree.has_only_catchall()
                        || current_tree.get_specificity() < subtree.get_specificity())
                {
                    tree.parallel_routes
                        .insert(rcstr!("children"), subtree.clone());
                }
            } else {
                tree.parallel_routes.insert(rcstr!("children"), subtree);
            }
        } else if let Some(key) = parallel_route_key {
            bail!(
                "missing page or default for parallel route `{}` (page: {})",
                key,
                app_page
            );
        }
    }

    // make sure we don't have a match for other slots if there's an intercepting route match
    // we only check subtrees as the current level could trigger `is_intercepting`
    if tree
        .parallel_routes
        .iter()
        .any(|(_, parallel_tree)| parallel_tree.is_intercepting())
    {
        let mut keys_to_replace = Vec::new();

        for (key, parallel_tree) in &tree.parallel_routes {
            if !parallel_tree.is_intercepting() {
                keys_to_replace.push(key.clone());
            }
        }

        for key in keys_to_replace {
            let subdir_name: RcStr = format!("@{key}").into();

            let default = if key == "children" {
                modules.default.clone()
            } else if let Some(subdirectory) = directory_tree.subdirectories.get(&subdir_name) {
                subdirectory.modules.default.clone()
            } else {
                None
            };

            let is_inside_catchall = app_page.is_catchall();

            // Check if this is a leaf segment (no child routes).
            let is_leaf_segment = !has_child_routes(directory_tree);

            // Only emit the issue if this is not the children slot and there's no default
            // component. The children slot is implicit and doesn't require a default.js
            // file. Also skip validation if the slot is UNDER a catch-all route or if
            // this is a leaf segment (no child routes).
            if default.is_none() && key != "children" && !is_inside_catchall && !is_leaf_segment {
                missing_default_parallel_route_issue(
                    app_dir.clone(),
                    app_page.clone(),
                    key.clone(),
                )
                .to_resolved()
                .await?
                .emit();
            }

            tree.parallel_routes.insert(
                key.clone(),
                default_route_tree(app_dir.clone(), global_metadata, app_page.clone(), default)
                    .await?,
            );
        }
    }

    if tree.parallel_routes.is_empty() {
        if modules.default.is_some() || current_level_is_parallel_route {
            tree = default_route_tree(
                app_dir.clone(),
                global_metadata,
                app_page,
                modules.default.clone(),
            )
            .await?;
        } else {
            return Ok(None);
        }
    } else if tree.parallel_routes.get("children").is_none() {
        tree.parallel_routes.insert(
            rcstr!("children"),
            default_route_tree(
                app_dir.clone(),
                global_metadata,
                app_page,
                modules.default.clone(),
            )
            .await?,
        );
    }

    if tree.parallel_routes.len() > 1
        && tree.parallel_routes.keys().next().map(|s| s.as_str()) != Some("children")
    {
        // children must go first for next.js to work correctly
        tree.parallel_routes
            .move_index(tree.parallel_routes.len() - 1, 0);
    }

    Ok(Some(tree))
}

async fn default_route_tree(
    app_dir: FileSystemPath,
    global_metadata: Vc<GlobalMetadata>,
    app_page: AppPage,
    default_component: Option<FileSystemPath>,
) -> Result<AppPageLoaderTree> {
    Ok(AppPageLoaderTree {
        page: app_page.clone(),
        segment: rcstr!("__DEFAULT__"),
        parallel_routes: FxIndexMap::default(),
        modules: if let Some(default) = default_component {
            AppDirModules {
                default: Some(default),
                ..Default::default()
            }
        } else {
            // default fallback component
            AppDirModules {
                default: Some(
                    get_next_package(app_dir)
                        .await?
                        .join("dist/client/components/builtin/default.js")?,
                ),
                ..Default::default()
            }
        },
        global_metadata: global_metadata.to_resolved().await?,
    })
}

#[turbo_tasks::function]
async fn directory_tree_to_entrypoints_internal(
    app_dir: FileSystemPath,
    global_metadata: ResolvedVc<GlobalMetadata>,
    is_global_not_found_enabled: Vc<bool>,
    next_mode: Vc<NextMode>,
    directory_name: RcStr,
    directory_tree: Vc<DirectoryTree>,
    app_page: AppPage,
    root_layouts: ResolvedVc<FileSystemPathVec>,
    root_params: ResolvedVc<RootParamVecOption>,
) -> Result<Vc<Entrypoints>> {
    let span = tracing::info_span!("build layout trees", name = display(&app_page));
    directory_tree_to_entrypoints_internal_untraced(
        app_dir,
        global_metadata,
        is_global_not_found_enabled,
        next_mode,
        directory_name,
        directory_tree,
        app_page,
        root_layouts,
        root_params,
    )
    .instrument(span)
    .await
}

async fn directory_tree_to_entrypoints_internal_untraced(
    app_dir: FileSystemPath,
    global_metadata: ResolvedVc<GlobalMetadata>,
    is_global_not_found_enabled: Vc<bool>,
    next_mode: Vc<NextMode>,
    directory_name: RcStr,
    directory_tree: Vc<DirectoryTree>,
    app_page: AppPage,
    root_layouts: ResolvedVc<FileSystemPathVec>,
    root_params: ResolvedVc<RootParamVecOption>,
) -> Result<Vc<Entrypoints>> {
    let mut result = FxIndexMap::default();

    let directory_tree_vc = directory_tree;
    let directory_tree = &*directory_tree.await?;

    let subdirectories = &directory_tree.subdirectories;
    let modules = &directory_tree.modules;
    // Route can have its own segment config, also can inherit from the layout root
    // segment config. https://nextjs.org/docs/app/building-your-application/rendering/edge-and-nodejs-runtimes#segment-runtime-option
    // Pass down layouts from each tree to apply segment config when adding route.
    let root_layouts = if let Some(layout) = &modules.layout {
        let mut layouts = root_layouts.owned().await?;
        layouts.push(layout.clone());
        ResolvedVc::cell(layouts)
    } else {
        root_layouts
    };

    // TODO: `root_layouts` is a misnomer, they're just parent layouts
    let root_params = if root_params.await?.is_none() && (*root_layouts.await?).len() == 1 {
        // found a root layout. the params up-to-and-including this point are the root params
        // for all child segments
        ResolvedVc::cell(Some(
            app_page
                .0
                .iter()
                .filter_map(|segment| match segment {
                    PageSegment::Dynamic(param)
                    | PageSegment::CatchAll(param)
                    | PageSegment::OptionalCatchAll(param) => Some(param.clone()),
                    _ => None,
                })
                .collect::<Vec<RcStr>>(),
        ))
    } else {
        root_params
    };

    if modules.page.is_some() {
        let app_path = AppPath::from(app_page.clone());

        let loader_tree = *directory_tree_to_loader_tree(
            app_dir.clone(),
            *global_metadata,
            directory_name.clone(),
            directory_tree_vc,
            app_page.clone(),
            app_path,
        )
        .await?;

        add_app_page(
            app_dir.clone(),
            &mut result,
            app_page.complete(PageType::Page)?,
            loader_tree.context("loader tree should be created for a page/default")?,
            root_params,
        );
    }

    if let Some(route) = &modules.route {
        add_app_route(
            app_dir.clone(),
            &mut result,
            app_page.complete(PageType::Route)?,
            route.clone(),
            root_layouts,
            root_params,
        );
    }

    let Metadata {
        icon,
        apple,
        twitter,
        open_graph,
        sitemap,
        base_page: _,
    } = &modules.metadata;

    for meta in sitemap
        .iter()
        .cloned()
        .chain(icon.iter().cloned().map(MetadataItem::from))
        .chain(apple.iter().cloned().map(MetadataItem::from))
        .chain(twitter.iter().cloned().map(MetadataItem::from))
        .chain(open_graph.iter().cloned().map(MetadataItem::from))
    {
        let app_page = app_page.clone_push_str(&get_metadata_route_name(meta.clone()).await?)?;

        add_app_metadata_route(
            app_dir.clone(),
            &mut result,
            normalize_metadata_route(app_page)?,
            meta,
            root_params,
        );
    }

    // root path: /
    if app_page.is_root() {
        let GlobalMetadata {
            favicon,
            robots,
            manifest,
        } = &*global_metadata.await?;

        for meta in favicon.iter().chain(robots.iter()).chain(manifest.iter()) {
            let app_page =
                app_page.clone_push_str(&get_metadata_route_name(meta.clone()).await?)?;

            add_app_metadata_route(
                app_dir.clone(),
                &mut result,
                normalize_metadata_route(app_page)?,
                meta.clone(),
                root_params,
            );
        }

        let mut modules = directory_tree.modules.clone();

        // fill in the default modules for the not-found entrypoint
        if modules.layout.is_none() {
            modules.layout = Some(
                get_next_package(app_dir.clone())
                    .await?
                    .join("dist/client/components/builtin/layout.js")?,
            );
        }

        if modules.not_found.is_none() {
            modules.not_found = Some(
                get_next_package(app_dir.clone())
                    .await?
                    .join("dist/client/components/builtin/not-found.js")?,
            );
        }
        if modules.forbidden.is_none() {
            modules.forbidden = Some(
                get_next_package(app_dir.clone())
                    .await?
                    .join("dist/client/components/builtin/forbidden.js")?,
            );
        }
        if modules.unauthorized.is_none() {
            modules.unauthorized = Some(
                get_next_package(app_dir.clone())
                    .await?
                    .join("dist/client/components/builtin/unauthorized.js")?,
            );
        }

        // Next.js has this logic in "collect-app-paths", where the root not-found page
        // is considered as its own entry point.

        // Determine if we enable the global not-found feature.
        let is_global_not_found_enabled = *is_global_not_found_enabled.await?;
        let use_global_not_found =
            is_global_not_found_enabled || modules.global_not_found.is_some();

        let not_found_root_modules = modules.without_leaves();
        let not_found_tree = AppPageLoaderTree {
            page: app_page.clone(),
            segment: directory_name.clone(),
            parallel_routes: fxindexmap! {
                rcstr!("children") => AppPageLoaderTree {
                    page: app_page.clone(),
                    segment: rcstr!("/_not-found"),
                    parallel_routes: fxindexmap! {
                        rcstr!("children") => AppPageLoaderTree {
                            page: app_page.clone(),
                            segment: rcstr!("__PAGE__"),
                            parallel_routes: FxIndexMap::default(),
                            modules: if use_global_not_found {
                                // if global-not-found.js is present:
                                // leaf module only keeps page pointing to empty-stub
                                AppDirModules {
                                    // page is built-in/empty-stub
                                    page: Some(get_next_package(app_dir.clone())
                                        .await?
                                        .join("dist/client/components/builtin/empty-stub.js")?,
                                    ),
                                    ..Default::default()
                                }
                            } else {
                                // if global-not-found.js is not present:
                                // we search if we can compose root layout with the root not-found.js;
                                AppDirModules {
                                    page: match modules.not_found {
                                        Some(v) => Some(v),
                                        None => Some(get_next_package(app_dir.clone())
                                            .await?
                                            .join("dist/client/components/builtin/not-found.js")?,
                                        ),
                                    },
                                    ..Default::default()
                                }
                            },
                            global_metadata,
                        }
                    },
                    modules: AppDirModules {
                        ..Default::default()
                    },
                    global_metadata,
                },
            },
            modules: AppDirModules {
                // `global-not-found.js` does not need a layout since it's included.
                // Skip it if it's present.
                // Otherwise, we need to compose it with the root layout to compose with
                // not-found.js boundary.
                layout: if use_global_not_found {
                    match modules.global_not_found {
                        Some(v) => Some(v),
                        None => Some(
                            get_next_package(app_dir.clone())
                                .await?
                                .join("dist/client/components/builtin/global-not-found.js")?,
                        ),
                    }
                } else {
                    modules.layout
                },
                ..not_found_root_modules
            },
            global_metadata,
        }
        .resolved_cell();

        {
            let app_page = app_page
                .clone_push_str("_not-found")?
                .complete(PageType::Page)?;

            add_app_page(
                app_dir.clone(),
                &mut result,
                app_page,
                not_found_tree,
                root_params,
            );
        }

        // Create production global error page only in build mode
        // This aligns with webpack: default Pages entries (including /_error) are only added when
        // the build isn't app-only. If the build is app-only (no user pages/api), we should still
        // expose the app global error so runtime errors render, but we shouldn't emit it otherwise.
        if matches!(*next_mode.await?, NextMode::Build) {
            // Use built-in global-error.js to create a `_global-error/page` route.
            let global_error_tree = AppPageLoaderTree {
                page: app_page.clone(),
                segment: directory_name.clone(),
                parallel_routes: fxindexmap! {
                    rcstr!("children") => AppPageLoaderTree {
                        page: app_page.clone(),
                        segment: rcstr!("__PAGE__"),
                        parallel_routes: FxIndexMap::default(),
                        modules: AppDirModules {
                            page: Some(get_next_package(app_dir.clone())
                                .await?
                                .join("dist/client/components/builtin/app-error.js")?),
                            ..Default::default()
                        },
                        global_metadata,
                    }
                },
                modules: AppDirModules::default(),
                global_metadata,
            }
            .resolved_cell();

            let app_global_error_page = app_page
                .clone_push_str("_global-error")?
                .complete(PageType::Page)?;
            add_app_page(
                app_dir.clone(),
                &mut result,
                app_global_error_page,
                global_error_tree,
                root_params,
            );
        }
    }

    let app_page = &app_page;
    let directory_name = &directory_name;
    let subdirectories = subdirectories
        .iter()
        .map(|(subdir_name, &subdirectory)| {
            let app_dir = app_dir.clone();

            async move {
                let mut child_app_page = app_page.clone();
                let mut illegal_path = None;

                // When constructing the app_page fails (e. g. due to limitations of the order),
                // we only want to emit the error when there are actual pages below that
                // directory.
                if let Err(e) = child_app_page.push_str(&normalize_underscore(subdir_name)) {
                    illegal_path = Some(e);
                }

                let map = directory_tree_to_entrypoints_internal(
                    app_dir.clone(),
                    *global_metadata,
                    is_global_not_found_enabled,
                    next_mode,
                    subdir_name.clone(),
                    *subdirectory,
                    child_app_page.clone(),
                    *root_layouts,
                    *root_params,
                )
                .await?;

                if let Some(illegal_path) = illegal_path
                    && !map.is_empty()
                {
                    return Err(illegal_path);
                }

                let mut loader_trees = Vec::new();

                for (_, entrypoint) in map.iter() {
                    if let Entrypoint::AppPage { ref pages, .. } = *entrypoint {
                        for page in pages {
                            let app_path = AppPath::from(page.clone());

                            let loader_tree = directory_tree_to_loader_tree(
                                app_dir.clone(),
                                *global_metadata,
                                directory_name.clone(),
                                directory_tree_vc,
                                app_page.clone(),
                                app_path,
                            );
                            loader_trees.push(loader_tree);
                        }
                    }
                }
                Ok((map, loader_trees))
            }
        })
        .try_join()
        .await?;

    for (map, loader_trees) in subdirectories.iter() {
        let mut i = 0;
        for (_, entrypoint) in map.iter() {
            match entrypoint {
                Entrypoint::AppPage {
                    pages,
                    loader_tree: _,
                    root_params,
                } => {
                    for page in pages {
                        let loader_tree = *loader_trees[i].await?;
                        i += 1;

                        add_app_page(
                            app_dir.clone(),
                            &mut result,
                            page.clone(),
                            loader_tree
                                .context("loader tree should be created for a page/default")?,
                            *root_params,
                        );
                    }
                }
                Entrypoint::AppRoute {
                    page,
                    path,
                    root_layouts,
                    root_params,
                } => {
                    add_app_route(
                        app_dir.clone(),
                        &mut result,
                        page.clone(),
                        path.clone(),
                        *root_layouts,
                        *root_params,
                    );
                }
                Entrypoint::AppMetadata {
                    page,
                    metadata,
                    root_params,
                } => {
                    add_app_metadata_route(
                        app_dir.clone(),
                        &mut result,
                        page.clone(),
                        metadata.clone(),
                        *root_params,
                    );
                }
            }
        }
    }
    Ok(Vc::cell(result))
}

/// Returns the global metadata for an app directory.
#[turbo_tasks::function]
pub async fn get_global_metadata(
    app_dir: FileSystemPath,
    page_extensions: Vc<Vec<RcStr>>,
) -> Result<Vc<GlobalMetadata>> {
    let DirectoryContent::Entries(entries) = &*app_dir.read_dir().await? else {
        bail!("app_dir must be a directory")
    };
    let mut metadata = GlobalMetadata::default();

    for (basename, entry) in entries {
        let DirectoryEntry::File(file) = entry else {
            continue;
        };

        let Some(GlobalMetadataFileMatch {
            metadata_type,
            dynamic,
        }) = match_global_metadata_file(basename, &page_extensions.await?)
        else {
            continue;
        };

        let entry = match metadata_type {
            "favicon" => &mut metadata.favicon,
            "manifest" => &mut metadata.manifest,
            "robots" => &mut metadata.robots,
            _ => continue,
        };

        if dynamic {
            *entry = Some(MetadataItem::Dynamic { path: file.clone() });
        } else {
            *entry = Some(MetadataItem::Static { path: file.clone() });
        }
        // TODO(WEB-952) handle symlinks in app dir
    }

    Ok(metadata.cell())
}

#[turbo_tasks::value(shared)]
struct DirectoryTreeIssue {
    pub severity: IssueSeverity,
    pub app_dir: FileSystemPath,
    pub message: ResolvedVc<StyledString>,
}

#[turbo_tasks::value_impl]
impl Issue for DirectoryTreeIssue {
    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text(rcstr!("An issue occurred while preparing your Next.js app")).cell()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::AppStructure.cell()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.app_dir.clone().cell()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(self.message))
    }
}
