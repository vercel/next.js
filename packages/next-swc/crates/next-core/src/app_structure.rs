use std::collections::BTreeMap;

use anyhow::{bail, Context, Result};
use indexmap::{
    indexmap,
    map::{Entry, OccupiedEntry},
    IndexMap,
};
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use tracing::Instrument;
use turbo_tasks::{
    debug::ValueDebugFormat, trace::TraceRawVcs, Completion, Completions, RcStr, TaskInput,
    TryJoinIterExt, ValueToString, Vc,
};
use turbopack_binding::{
    turbo::tasks_fs::{DirectoryContent, DirectoryEntry, FileSystemEntryType, FileSystemPath},
    turbopack::core::issue::{
        Issue, IssueExt, IssueSeverity, IssueStage, OptionStyledString, StyledString,
    },
};

use crate::{
    next_app::{
        metadata::{
            match_global_metadata_file, match_local_metadata_file, normalize_metadata_route,
            GlobalMetadataFileMatch, MetadataFileMatch,
        },
        AppPage, AppPath, PageSegment, PageType,
    },
    next_config::NextConfig,
    next_import_map::get_next_package,
};

/// A final route in the app directory.
#[turbo_tasks::value]
#[derive(Default, Debug, Clone)]
pub struct Components {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<Vc<FileSystemPath>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layout: Option<Vc<FileSystemPath>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<Vc<FileSystemPath>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loading: Option<Vc<FileSystemPath>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template: Option<Vc<FileSystemPath>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub not_found: Option<Vc<FileSystemPath>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default: Option<Vc<FileSystemPath>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route: Option<Vc<FileSystemPath>>,
    #[serde(skip_serializing_if = "Metadata::is_empty")]
    pub metadata: Metadata,
}

impl Components {
    fn without_leafs(&self) -> Self {
        Self {
            page: None,
            layout: self.layout,
            error: self.error,
            loading: self.loading,
            template: self.template,
            not_found: self.not_found,
            default: None,
            route: None,
            metadata: self.metadata.clone(),
        }
    }
}

/// A single metadata file plus an optional "alt" text file.
#[derive(Copy, Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TraceRawVcs)]
pub enum MetadataWithAltItem {
    Static {
        path: Vc<FileSystemPath>,
        alt_path: Option<Vc<FileSystemPath>>,
    },
    Dynamic {
        path: Vc<FileSystemPath>,
    },
}

/// A single metadata file.
#[derive(Copy, Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TaskInput, TraceRawVcs)]
pub enum MetadataItem {
    Static { path: Vc<FileSystemPath> },
    Dynamic { path: Vc<FileSystemPath> },
}

#[turbo_tasks::function]
pub async fn get_metadata_route_name(meta: MetadataItem) -> Result<Vc<RcStr>> {
    Ok(match meta {
        MetadataItem::Static { path } => {
            let path_value = path.await?;
            Vc::cell(path_value.file_name().into())
        }
        MetadataItem::Dynamic { path } => {
            let Some(stem) = &*path.file_stem().await? else {
                bail!(
                    "unable to resolve file stem for metadata item at {}",
                    path.to_string().await?
                );
            };

            match stem.as_str() {
                "manifest" => Vc::cell("manifest.webmanifest".into()),
                _ => Vc::cell(stem.clone()),
            }
        }
    })
}

impl MetadataItem {
    pub fn into_path(self) -> Vc<FileSystemPath> {
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
#[derive(Default, Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TraceRawVcs)]
pub struct Metadata {
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub icon: Vec<MetadataWithAltItem>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub apple: Vec<MetadataWithAltItem>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub twitter: Vec<MetadataWithAltItem>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
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
    pub subdirectories: BTreeMap<RcStr, Vc<DirectoryTree>>,
    pub components: Components,
}

#[turbo_tasks::value]
#[derive(Clone, Debug)]
struct PlainDirectoryTree {
    /// key is e.g. "dashboard", "(dashboard)", "@slot"
    pub subdirectories: BTreeMap<RcStr, PlainDirectoryTree>,
    pub components: Components,
}

#[turbo_tasks::value_impl]
impl DirectoryTree {
    /// Returns a completion that changes when any route in the whole tree
    /// changes.
    #[turbo_tasks::function]
    pub async fn routes_changed(&self) -> Result<Vc<Completion>> {
        let mut children = Vec::new();
        children.push(Completion::new());
        for child in self.subdirectories.values() {
            children.push(child.routes_changed());
        }
        Ok(Vc::<Completions>::cell(children).completed())
    }

    #[turbo_tasks::function]
    pub async fn into_plain(&self) -> Result<Vc<PlainDirectoryTree>> {
        let mut subdirectories = BTreeMap::new();

        for (name, subdirectory) in &self.subdirectories {
            subdirectories.insert(name.clone(), subdirectory.into_plain().await?.clone_value());
        }

        Ok(PlainDirectoryTree {
            subdirectories,
            components: self.components.clone(),
        }
        .cell())
    }
}

#[turbo_tasks::value(transparent)]
pub struct OptionAppDir(Option<Vc<FileSystemPath>>);

#[turbo_tasks::value_impl]
impl OptionAppDir {
    /// Returns a completion that changes when any route in the whole tree
    /// changes.
    #[turbo_tasks::function]
    pub async fn routes_changed(
        self: Vc<Self>,
        next_config: Vc<NextConfig>,
    ) -> Result<Vc<Completion>> {
        if let Some(app_dir) = *self.await? {
            let directory_tree = get_directory_tree(app_dir, next_config.page_extensions());
            directory_tree.routes_changed().await?;
        }
        Ok(Completion::new())
    }
}

/// Finds and returns the [DirectoryTree] of the app directory if existing.
#[turbo_tasks::function]
pub async fn find_app_dir(project_path: Vc<FileSystemPath>) -> Result<Vc<OptionAppDir>> {
    let app = project_path.join("app".into());
    let src_app = project_path.join("src/app".into());
    let app_dir = if *app.get_type().await? == FileSystemEntryType::Directory {
        app
    } else if *src_app.get_type().await? == FileSystemEntryType::Directory {
        src_app
    } else {
        return Ok(Vc::cell(None));
    }
    .resolve()
    .await?;

    Ok(Vc::cell(Some(app_dir)))
}

/// Finds and returns the [DirectoryTree] of the app directory if enabled and
/// existing.
#[turbo_tasks::function]
pub async fn find_app_dir_if_enabled(project_path: Vc<FileSystemPath>) -> Result<Vc<OptionAppDir>> {
    Ok(find_app_dir(project_path))
}

#[turbo_tasks::function]
async fn get_directory_tree(
    dir: Vc<FileSystemPath>,
    page_extensions: Vc<Vec<RcStr>>,
) -> Result<Vc<DirectoryTree>> {
    let span = {
        let dir = dir.to_string().await?.to_string();
        tracing::info_span!("read app directory tree", name = dir)
    };
    get_directory_tree_internal(dir, page_extensions)
        .instrument(span)
        .await
}

async fn get_directory_tree_internal(
    dir: Vc<FileSystemPath>,
    page_extensions: Vc<Vec<RcStr>>,
) -> Result<Vc<DirectoryTree>> {
    let DirectoryContent::Entries(entries) = &*dir.read_dir().await? else {
        // the file watcher might invalidate things in the wrong order,
        // and we have to account for the eventual consistency of turbo-tasks
        // so we just return an empty tree here.
        return Ok(DirectoryTree {
            subdirectories: Default::default(),
            components: Components::default(),
        }
        .cell());
    };
    let page_extensions_value = page_extensions.await?;

    let mut subdirectories = BTreeMap::new();
    let mut components = Components::default();

    let mut metadata_icon = Vec::new();
    let mut metadata_apple = Vec::new();
    let mut metadata_open_graph = Vec::new();
    let mut metadata_twitter = Vec::new();

    for (basename, entry) in entries {
        match *entry {
            DirectoryEntry::File(file) => {
                let file = file.resolve().await?;
                if let Some((stem, ext)) = basename.split_once('.') {
                    if page_extensions_value.iter().any(|e| e == ext) {
                        match stem {
                            "page" => components.page = Some(file),
                            "layout" => components.layout = Some(file),
                            "error" => components.error = Some(file),
                            "loading" => components.loading = Some(file),
                            "template" => components.template = Some(file),
                            "not-found" => components.not_found = Some(file),
                            "default" => components.default = Some(file),
                            "route" => components.route = Some(file),
                            _ => {}
                        }
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
                            components.metadata.sitemap =
                                Some(MetadataItem::Dynamic { path: file });
                        } else {
                            components.metadata.sitemap = Some(MetadataItem::Static { path: file });
                        }
                        continue;
                    }
                    _ => continue,
                };

                if dynamic {
                    entry.push((number, MetadataWithAltItem::Dynamic { path: file }));
                    continue;
                }

                let file_value = file.await?;
                let file_name = file_value.file_name();
                let basename = file_name
                    .rsplit_once('.')
                    .map_or(file_name, |(basename, _)| basename);
                let alt_path = file.parent().join(format!("{}.alt.txt", basename).into());
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
                let dir = dir.resolve().await?;
                // appDir ignores paths starting with an underscore
                if !basename.starts_with('_') {
                    let result = get_directory_tree(dir, page_extensions);
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

    components.metadata.icon = sort(metadata_icon);
    components.metadata.apple = sort(metadata_apple);
    components.metadata.twitter = sort(metadata_twitter);
    components.metadata.open_graph = sort(metadata_open_graph);

    Ok(DirectoryTree {
        subdirectories,
        components,
    }
    .cell())
}

#[turbo_tasks::value]
#[derive(Debug, Clone)]
pub struct LoaderTree {
    pub page: AppPage,
    pub segment: RcStr,
    pub parallel_routes: IndexMap<RcStr, LoaderTree>,
    pub components: Components,
    pub global_metadata: Vc<GlobalMetadata>,
}

impl LoaderTree {
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

    /// Returns whether or not the only match in this tree is for a catch-all
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
}

#[derive(
    Clone, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat, Debug, TaskInput,
)]
pub enum Entrypoint {
    AppPage {
        pages: Vec<AppPage>,
        loader_tree: Vc<LoaderTree>,
    },
    AppRoute {
        page: AppPage,
        path: Vc<FileSystemPath>,
        root_layouts: Vc<Vec<Vc<FileSystemPath>>>,
    },
    AppMetadata {
        page: AppPage,
        metadata: MetadataItem,
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
}

#[turbo_tasks::value(transparent)]
pub struct Entrypoints(IndexMap<AppPath, Entrypoint>);

fn is_parallel_route(name: &str) -> bool {
    name.starts_with('@')
}

fn is_group_route(name: &str) -> bool {
    name.starts_with('(') && name.ends_with(')')
}

fn is_catchall_route(name: &str) -> bool {
    name.starts_with("[...") && name.ends_with(']')
}

fn match_parallel_route(name: &str) -> Option<&str> {
    name.strip_prefix('@')
}

fn conflict_issue(
    app_dir: Vc<FileSystemPath>,
    e: &OccupiedEntry<AppPath, Entrypoint>,
    a: &str,
    b: &str,
    value_a: &AppPage,
    value_b: &AppPage,
) {
    let item_names = if a == b {
        format!("{}s", a)
    } else {
        format!("{} and {}", a, b)
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
        .cell(),
        severity: IssueSeverity::Error.cell(),
    }
    .cell()
    .emit();
}

fn add_app_page(
    app_dir: Vc<FileSystemPath>,
    result: &mut IndexMap<AppPath, Entrypoint>,
    page: AppPage,
    loader_tree: Vc<LoaderTree>,
) {
    let mut e = match result.entry(page.clone().into()) {
        Entry::Occupied(e) => e,
        Entry::Vacant(e) => {
            e.insert(Entrypoint::AppPage {
                pages: vec![page],
                loader_tree,
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
    app_dir: Vc<FileSystemPath>,
    result: &mut IndexMap<AppPath, Entrypoint>,
    page: AppPage,
    path: Vc<FileSystemPath>,
    root_layouts: Vc<Vec<Vc<FileSystemPath>>>,
) {
    let e = match result.entry(page.clone().into()) {
        Entry::Occupied(e) => e,
        Entry::Vacant(e) => {
            e.insert(Entrypoint::AppRoute {
                page,
                path,
                root_layouts,
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
    app_dir: Vc<FileSystemPath>,
    result: &mut IndexMap<AppPath, Entrypoint>,
    page: AppPage,
    metadata: MetadataItem,
) {
    let e = match result.entry(page.clone().into()) {
        Entry::Occupied(e) => e,
        Entry::Vacant(e) => {
            e.insert(Entrypoint::AppMetadata { page, metadata });
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
    app_dir: Vc<FileSystemPath>,
    page_extensions: Vc<Vec<RcStr>>,
) -> Vc<Entrypoints> {
    directory_tree_to_entrypoints(
        app_dir,
        get_directory_tree(app_dir, page_extensions),
        get_global_metadata(app_dir, page_extensions),
        Default::default(),
    )
}

#[turbo_tasks::function]
fn directory_tree_to_entrypoints(
    app_dir: Vc<FileSystemPath>,
    directory_tree: Vc<DirectoryTree>,
    global_metadata: Vc<GlobalMetadata>,
    root_layouts: Vc<Vec<Vc<FileSystemPath>>>,
) -> Vc<Entrypoints> {
    directory_tree_to_entrypoints_internal(
        app_dir,
        global_metadata,
        "".into(),
        directory_tree,
        AppPage::new(),
        root_layouts,
    )
}

#[turbo_tasks::value]
struct DuplicateParallelRouteIssue {
    app_dir: Vc<FileSystemPath>,
    page: AppPage,
}

#[turbo_tasks::value_impl]
impl Issue for DuplicateParallelRouteIssue {
    #[turbo_tasks::function]
    async fn file_path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        let this = self.await?;
        Ok(this.app_dir.join(this.page.to_string().into()))
    }

    #[turbo_tasks::function]
    fn stage(self: Vc<Self>) -> Vc<IssueStage> {
        IssueStage::ProcessModule.cell()
    }

    #[turbo_tasks::function]
    fn title(self: Vc<Self>) -> Vc<StyledString> {
        StyledString::Text(
            "You cannot have two parallel pages that resolve to the same path.".into(),
        )
        .cell()
    }
}

fn page_path_except_parallel(loader_tree: &LoaderTree) -> Option<AppPage> {
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

    if loader_tree.components.page.is_some() {
        return Some(loader_tree.page.clone());
    }

    if let Some(children) = loader_tree.parallel_routes.get("children") {
        return page_path_except_parallel(children);
    }

    None
}

fn check_duplicate(
    duplicate: &mut FxHashMap<AppPath, AppPage>,
    loader_tree: &LoaderTree,
    app_dir: Vc<FileSystemPath>,
) {
    let page_path = page_path_except_parallel(loader_tree);

    if let Some(page_path) = page_path {
        if let Some(prev) = duplicate.insert(AppPath::from(page_path.clone()), page_path.clone()) {
            if prev != page_path {
                DuplicateParallelRouteIssue {
                    app_dir,
                    page: loader_tree.page.clone(),
                }
                .cell()
                .emit();
            }
        }
    }
}

/// creates the loader tree for a specific route (pathname / [AppPath])
#[turbo_tasks::function]
async fn directory_tree_to_loader_tree(
    app_dir: Vc<FileSystemPath>,
    global_metadata: Vc<GlobalMetadata>,
    directory_name: RcStr,
    directory_tree: Vc<DirectoryTree>,
    app_page: AppPage,
    // the page this loader tree is constructed for
    for_app_path: AppPath,
) -> Result<Vc<Option<Vc<LoaderTree>>>> {
    let plain_tree = &*directory_tree.into_plain().await?;

    let tree = directory_tree_to_loader_tree_internal(
        app_dir,
        global_metadata,
        directory_name,
        plain_tree,
        app_page,
        for_app_path,
    )?;

    Ok(Vc::cell(tree.map(|tree| tree.cell())))
}

fn directory_tree_to_loader_tree_internal(
    app_dir: Vc<FileSystemPath>,
    global_metadata: Vc<GlobalMetadata>,
    directory_name: RcStr,
    directory_tree: &PlainDirectoryTree,
    app_page: AppPage,
    // the page this loader tree is constructed for
    for_app_path: AppPath,
) -> Result<Option<LoaderTree>> {
    let app_path = AppPath::from(app_page.clone());

    if !for_app_path.contains(&app_path) {
        return Ok(None);
    }

    let mut components = directory_tree.components.clone();

    // Capture the current page for the metadata to calculate segment relative to
    // the corresponding page for the static metadata files.
    /*
    let metadata = Metadata {
        base_page: Some(app_page.clone()),
        ..components.metadata.clone()
    }; */

    components.metadata.base_page = Some(app_page.clone());

    // the root directory in the app dir.
    let is_root_directory = app_page.is_root();
    // an alternative root layout (in a route group which affects the page, but not
    // the path).
    let is_root_layout = app_path.is_root() && components.layout.is_some();

    if (is_root_directory || is_root_layout) && components.not_found.is_none() {
        components.not_found = Some(
            get_next_package(app_dir).join("dist/client/components/not-found-error.js".into()),
        );
    }

    let mut tree = LoaderTree {
        page: app_page.clone(),
        segment: directory_name.clone(),
        parallel_routes: IndexMap::new(),
        components: components.without_leafs(),
        global_metadata,
    };

    let current_level_is_parallel_route = is_parallel_route(&directory_name);

    if current_level_is_parallel_route {
        tree.segment = "children".into();
    }

    if let Some(page) = (app_path == for_app_path || app_path.is_catchall())
        .then_some(components.page)
        .flatten()
    {
        // When resolving metadata with corresponding module
        // (https://github.com/vercel/next.js/blob/aa1ee5995cdd92cc9a2236ce4b6aa2b67c9d32b2/packages/next/src/lib/metadata/resolve-metadata.ts#L340)
        // layout takes precedence over page (https://github.com/vercel/next.js/blob/aa1ee5995cdd92cc9a2236ce4b6aa2b67c9d32b2/packages/next/src/server/lib/app-dir-module.ts#L22)
        // If the component have layout and page both, do not attach same metadata to
        // the page.
        let metadata = if components.layout.is_some() {
            Default::default()
        } else {
            components.metadata.clone()
        };

        tree.parallel_routes.insert(
            "children".into(),
            LoaderTree {
                page: app_page.clone(),
                segment: "__PAGE__".into(),
                parallel_routes: IndexMap::new(),
                components: Components {
                    page: Some(page),
                    metadata,
                    ..Default::default()
                },
                global_metadata,
            },
        );

        if current_level_is_parallel_route {
            tree.segment = "page$".into();
        }
    }

    let mut duplicate = FxHashMap::default();

    for (subdir_name, subdirectory) in &directory_tree.subdirectories {
        let parallel_route_key = match_parallel_route(subdir_name);

        let mut child_app_page = app_page.clone();
        let mut illegal_path_error = None;
        let is_current_directory_catchall = is_catchall_route(subdir_name);

        // When constructing the app_page fails (e. g. due to limitations of the order),
        // we only want to emit the error when there are actual pages below that
        // directory.
        if let Err(e) = child_app_page.push_str(subdir_name) {
            illegal_path_error = Some(e);
        }

        let subtree = directory_tree_to_loader_tree_internal(
            app_dir,
            global_metadata,
            subdir_name.clone(),
            subdirectory,
            child_app_page.clone(),
            for_app_path.clone(),
        )?;

        if let Some(illegal_path) = subtree.as_ref().and(illegal_path_error) {
            return Err(illegal_path);
        }

        if let Some(subtree) = subtree {
            if let Some(key) = parallel_route_key {
                tree.parallel_routes.insert(key.into(), subtree);
                continue;
            }

            // skip groups which don't have a page match.
            if is_group_route(subdir_name) && !subtree.has_page() {
                continue;
            }

            if subtree.has_page() {
                check_duplicate(&mut duplicate, &subtree, app_dir);
            }

            if let Some(current_tree) = tree.parallel_routes.get("children") {
                if is_current_directory_catchall && subtree.has_only_catchall() {
                    // there's probably already a more specific page in the
                    // slot.
                } else if current_tree.has_only_catchall() {
                    tree.parallel_routes.insert("children".into(), subtree);
                } else {
                    // TODO: Investigate if this is still needed. Emitting the
                    // error causes the test "should
                    // gracefully handle when two page
                    // segments match the `children`
                    // parallel slot" to fail
                    // DirectoryTreeIssue {
                    //     app_dir,
                    //     message: StyledString::Text(format!(
                    //         "You cannot have two parallel pages that resolve
                    // to the same path. \          Route {}
                    // has multiple matches in {}",
                    //         for_app_path, app_page
                    //     ))
                    //     .cell(),
                    //     severity: IssueSeverity::Error.cell(),
                    // }
                    // .cell()
                    // .emit();
                }
            } else {
                tree.parallel_routes.insert("children".into(), subtree);
            }
        } else if let Some(key) = parallel_route_key {
            bail!(
                "missing page or default for parallel route `{}` (page: {})",
                key,
                app_page
            );
        }
    }

    if tree.parallel_routes.is_empty() {
        tree.segment = "__DEFAULT__".into();
        if let Some(default) = components.default {
            tree.components = Components {
                default: Some(default),
                ..Default::default()
            };
        } else if current_level_is_parallel_route {
            // default fallback component
            tree.components = Components {
                default: Some(
                    get_next_package(app_dir)
                        .join("dist/client/components/parallel-route-default.js".into()),
                ),
                ..Default::default()
            };
        } else {
            return Ok(None);
        }
    } else if tree.parallel_routes.get("children").is_none() {
        tree.parallel_routes.insert(
            "children".into(),
            LoaderTree {
                page: app_page.clone(),
                segment: "__DEFAULT__".into(),
                parallel_routes: IndexMap::new(),
                components: if let Some(default) = components.default {
                    Components {
                        default: Some(default),
                        ..Default::default()
                    }
                } else {
                    // default fallback component
                    Components {
                        default: Some(
                            get_next_package(app_dir)
                                .join("dist/client/components/parallel-route-default.js".into()),
                        ),
                        ..Default::default()
                    }
                },
                global_metadata,
            },
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

#[turbo_tasks::function]
async fn directory_tree_to_entrypoints_internal(
    app_dir: Vc<FileSystemPath>,
    global_metadata: Vc<GlobalMetadata>,
    directory_name: RcStr,
    directory_tree: Vc<DirectoryTree>,
    app_page: AppPage,
    root_layouts: Vc<Vec<Vc<FileSystemPath>>>,
) -> Result<Vc<Entrypoints>> {
    let span = tracing::info_span!("build layout trees", name = display(&app_page));
    directory_tree_to_entrypoints_internal_untraced(
        app_dir,
        global_metadata,
        directory_name,
        directory_tree,
        app_page,
        root_layouts,
    )
    .instrument(span)
    .await
}

async fn directory_tree_to_entrypoints_internal_untraced(
    app_dir: Vc<FileSystemPath>,
    global_metadata: Vc<GlobalMetadata>,
    directory_name: RcStr,
    directory_tree: Vc<DirectoryTree>,
    app_page: AppPage,
    root_layouts: Vc<Vec<Vc<FileSystemPath>>>,
) -> Result<Vc<Entrypoints>> {
    let mut result = IndexMap::new();

    let directory_tree_vc = directory_tree;
    let directory_tree = &*directory_tree.await?;

    let subdirectories = &directory_tree.subdirectories;
    let components = &directory_tree.components;
    // Route can have its own segment config, also can inherit from the layout root
    // segment config. https://nextjs.org/docs/app/building-your-application/rendering/edge-and-nodejs-runtimes#segment-runtime-option
    // Pass down layouts from each tree to apply segment config when adding route.
    let root_layouts = if let Some(layout) = components.layout {
        let mut layouts = (*root_layouts.await?).clone();
        layouts.push(layout);
        Vc::cell(layouts)
    } else {
        root_layouts
    };

    if components.page.is_some() {
        let app_path = AppPath::from(app_page.clone());

        let loader_tree = *directory_tree_to_loader_tree(
            app_dir,
            global_metadata,
            directory_name.clone(),
            directory_tree_vc,
            app_page.clone(),
            app_path,
        )
        .await?;

        add_app_page(
            app_dir,
            &mut result,
            app_page.complete(PageType::Page)?,
            loader_tree.context("loader tree should be created for a page/default")?,
        );
    }

    if let Some(route) = components.route {
        add_app_route(
            app_dir,
            &mut result,
            app_page.complete(PageType::Route)?,
            route,
            root_layouts,
        );
    }

    let Metadata {
        icon,
        apple,
        twitter,
        open_graph,
        sitemap,
        base_page: _,
    } = &components.metadata;

    for meta in sitemap
        .iter()
        .copied()
        .chain(icon.iter().copied().map(MetadataItem::from))
        .chain(apple.iter().copied().map(MetadataItem::from))
        .chain(twitter.iter().copied().map(MetadataItem::from))
        .chain(open_graph.iter().copied().map(MetadataItem::from))
    {
        let app_page = app_page.clone_push_str(&get_metadata_route_name(meta).await?)?;

        add_app_metadata_route(
            app_dir,
            &mut result,
            normalize_metadata_route(app_page)?,
            meta,
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
            let app_page = app_page.clone_push_str(&get_metadata_route_name(*meta).await?)?;

            add_app_metadata_route(
                app_dir,
                &mut result,
                normalize_metadata_route(app_page)?,
                *meta,
            );
        }

        // Next.js has this logic in "collect-app-paths", where the root not-found page
        // is considered as its own entry point.
        let not_found_tree = LoaderTree {
                page: app_page.clone(),
                segment: directory_name.clone(),
                parallel_routes: indexmap! {
                    "children".into() => LoaderTree {
                        page: app_page.clone(),
                        segment: "/_not-found".into(),
                        parallel_routes: indexmap! {
                            "children".into() => LoaderTree {
                                page: app_page.clone(),
                                segment: "__PAGE__".into(),
                                parallel_routes: IndexMap::new(),
                                components: Components {
                                    page: components.not_found.or_else(|| Some(get_next_package(app_dir).join("dist/client/components/not-found-error.js".into()))),
                                    ..Default::default()
                                },
                                global_metadata
                            }
                        },
                        components: Components::default(),
                        global_metadata,
                    },
                },
                components: components.without_leafs(),
                global_metadata,
            }.cell();

        {
            let app_page = app_page
                .clone_push_str("_not-found")?
                .complete(PageType::Page)?;

            add_app_page(app_dir, &mut result, app_page, not_found_tree);
        }
    }

    let app_page = &app_page;
    let directory_name = &directory_name;
    let subdirectories = subdirectories
        .iter()
        .map(|(subdir_name, &subdirectory)| async move {
            let mut child_app_page = app_page.clone();
            let mut illegal_path = None;

            // When constructing the app_page fails (e. g. due to limitations of the order),
            // we only want to emit the error when there are actual pages below that
            // directory.
            if let Err(e) = child_app_page.push_str(subdir_name) {
                illegal_path = Some(e);
            }

            let map = directory_tree_to_entrypoints_internal(
                app_dir,
                global_metadata,
                subdir_name.clone(),
                subdirectory,
                child_app_page.clone(),
                root_layouts,
            )
            .await?;

            if let Some(illegal_path) = illegal_path {
                if !map.is_empty() {
                    return Err(illegal_path);
                }
            }

            let mut loader_trees = Vec::new();

            for (_, entrypoint) in map.iter() {
                if let Entrypoint::AppPage {
                    ref pages,
                    loader_tree: _,
                } = *entrypoint
                {
                    for page in pages {
                        let app_path = AppPath::from(page.clone());

                        let loader_tree = directory_tree_to_loader_tree(
                            app_dir,
                            global_metadata,
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
        })
        .try_join()
        .await?;

    for (map, loader_trees) in subdirectories.iter() {
        let mut i = 0;
        for (_, entrypoint) in map.iter() {
            match *entrypoint {
                Entrypoint::AppPage {
                    ref pages,
                    loader_tree: _,
                } => {
                    for page in pages {
                        let loader_tree = *loader_trees[i].await?;
                        i += 1;

                        add_app_page(
                            app_dir,
                            &mut result,
                            page.clone(),
                            loader_tree
                                .context("loader tree should be created for a page/default")?,
                        );
                    }
                }
                Entrypoint::AppRoute {
                    ref page,
                    path,
                    root_layouts,
                } => {
                    add_app_route(app_dir, &mut result, page.clone(), path, root_layouts);
                }
                Entrypoint::AppMetadata { ref page, metadata } => {
                    add_app_metadata_route(app_dir, &mut result, page.clone(), metadata);
                }
            }
        }
    }
    Ok(Vc::cell(result))
}

/// Returns the global metadata for an app directory.
#[turbo_tasks::function]
pub async fn get_global_metadata(
    app_dir: Vc<FileSystemPath>,
    page_extensions: Vc<Vec<RcStr>>,
) -> Result<Vc<GlobalMetadata>> {
    let DirectoryContent::Entries(entries) = &*app_dir.read_dir().await? else {
        bail!("app_dir must be a directory")
    };
    let mut metadata = GlobalMetadata::default();

    for (basename, entry) in entries {
        let DirectoryEntry::File(file) = *entry else {
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
            *entry = Some(MetadataItem::Dynamic { path: file });
        } else {
            *entry = Some(MetadataItem::Static { path: file });
        }
        // TODO(WEB-952) handle symlinks in app dir
    }

    Ok(metadata.cell())
}

#[turbo_tasks::value(shared)]
struct DirectoryTreeIssue {
    pub severity: Vc<IssueSeverity>,
    pub app_dir: Vc<FileSystemPath>,
    pub message: Vc<StyledString>,
}

#[turbo_tasks::value_impl]
impl Issue for DirectoryTreeIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        self.severity
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<StyledString>> {
        Ok(StyledString::Text("An issue occurred while preparing your Next.js app".into()).cell())
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::AppStructure.cell()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.app_dir
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(self.message))
    }
}
