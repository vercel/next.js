use std::collections::BTreeMap;

use anyhow::{bail, Result};
use indexmap::{
    indexmap,
    map::{Entry, OccupiedEntry},
    IndexMap,
};
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    debug::ValueDebugFormat, trace::TraceRawVcs, Completion, Completions, TaskInput, ValueDefault,
    ValueToString, Vc,
};
use turbopack_binding::{
    turbo::tasks_fs::{DirectoryContent, DirectoryEntry, FileSystemEntryType, FileSystemPath},
    turbopack::core::issue::{Issue, IssueExt, IssueSeverity},
};

use crate::{
    next_app::{
        metadata::{
            match_global_metadata_file, match_local_metadata_file, normalize_metadata_route,
            GlobalMetadataFileMatch, MetadataFileMatch,
        },
        AppPage, AppPath, PageType,
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

    fn merge(a: &Self, b: &Self) -> Self {
        Self {
            page: a.page.or(b.page),
            layout: a.layout.or(b.layout),
            error: a.error.or(b.error),
            loading: a.loading.or(b.loading),
            template: a.template.or(b.template),
            not_found: a.not_found.or(b.not_found),
            default: a.default.or(b.default),
            route: a.route.or(b.route),
            metadata: Metadata::merge(&a.metadata, &b.metadata),
        }
    }
}

#[turbo_tasks::value_impl]
impl Components {
    /// Returns a completion that changes when any route in the components
    /// changes.
    #[turbo_tasks::function]
    pub async fn routes_changed(self: Vc<Self>) -> Result<Vc<Completion>> {
        self.await?;
        Ok(Completion::new())
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
pub async fn get_metadata_route_name(meta: MetadataItem) -> Result<Vc<String>> {
    Ok(match meta {
        MetadataItem::Static { path } => {
            let path_value = path.await?;
            Vc::cell(path_value.file_name().to_string())
        }
        MetadataItem::Dynamic { path } => {
            let Some(stem) = &*path.file_stem().await? else {
                bail!(
                    "unable to resolve file stem for metadata item at {}",
                    path.to_string().await?
                );
            };

            match stem.as_str() {
                "robots" => Vc::cell("robots.txt".to_string()),
                "manifest" => Vc::cell("manifest.webmanifest".to_string()),
                "sitemap" => Vc::cell("sitemap.xml".to_string()),
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
}

impl Metadata {
    pub fn is_empty(&self) -> bool {
        let Metadata {
            icon,
            apple,
            twitter,
            open_graph,
            sitemap,
        } = self;
        icon.is_empty()
            && apple.is_empty()
            && twitter.is_empty()
            && open_graph.is_empty()
            && sitemap.is_none()
    }

    fn merge(a: &Self, b: &Self) -> Self {
        Self {
            icon: a.icon.iter().chain(b.icon.iter()).copied().collect(),
            apple: a.apple.iter().chain(b.apple.iter()).copied().collect(),
            twitter: a.twitter.iter().chain(b.twitter.iter()).copied().collect(),
            open_graph: a
                .open_graph
                .iter()
                .chain(b.open_graph.iter())
                .copied()
                .collect(),
            sitemap: a.sitemap.or(b.sitemap),
        }
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
    pub subdirectories: BTreeMap<String, Vc<DirectoryTree>>,
    pub components: Vc<Components>,
}

#[turbo_tasks::value_impl]
impl DirectoryTree {
    /// Returns a completion that changes when any route in the whole tree
    /// changes.
    #[turbo_tasks::function]
    pub async fn routes_changed(self: Vc<Self>) -> Result<Vc<Completion>> {
        let DirectoryTree {
            subdirectories,
            components,
        } = &*self.await?;
        let mut children = Vec::new();
        children.push(components.routes_changed());
        for child in subdirectories.values() {
            children.push(child.routes_changed());
        }
        Ok(Vc::<Completions>::cell(children).completed())
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
    let app = project_path.join("app".to_string());
    let src_app = project_path.join("src/app".to_string());
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
    page_extensions: Vc<Vec<String>>,
) -> Result<Vc<DirectoryTree>> {
    let DirectoryContent::Entries(entries) = &*dir.read_dir().await? else {
        bail!("{} must be a directory", dir.to_string().await?);
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
                let alt_path = file.parent().join(format!("{}.alt.txt", basename));
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
                    let result = get_directory_tree(dir, page_extensions);
                    subdirectories.insert(get_underscore_normalized_path(basename), result);
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
        components: components.cell(),
    }
    .cell())
}

#[turbo_tasks::value]
#[derive(Debug, Clone)]
pub struct LoaderTree {
    pub page: AppPage,
    pub segment: String,
    pub parallel_routes: IndexMap<String, Vc<LoaderTree>>,
    pub components: Vc<Components>,
    pub global_metadata: Vc<GlobalMetadata>,
}

#[turbo_tasks::function]
async fn merge_loader_trees(
    app_dir: Vc<FileSystemPath>,
    tree1: Vc<LoaderTree>,
    tree2: Vc<LoaderTree>,
) -> Result<Vc<LoaderTree>> {
    let tree1 = tree1.await?;
    let tree2 = tree2.await?;

    let segment = if !tree1.segment.is_empty() {
        tree1.segment.to_string()
    } else {
        tree2.segment.to_string()
    };

    let mut parallel_routes = tree1.parallel_routes.clone();
    for (key, &tree2_route) in tree2.parallel_routes.iter() {
        add_parallel_route(app_dir, &mut parallel_routes, key.clone(), tree2_route).await?
    }

    let components = Components::merge(&*tree1.components.await?, &*tree2.components.await?).cell();

    Ok(LoaderTree {
        page: tree1.page.clone(),
        segment,
        parallel_routes,
        components,
        // this is always the same, no need to merge it
        global_metadata: tree1.global_metadata,
    }
    .cell())
}

#[derive(
    Clone, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat, Debug, TaskInput,
)]
pub enum Entrypoint {
    AppPage {
        page: AppPage,
        loader_tree: Vc<LoaderTree>,
    },
    AppRoute {
        page: AppPage,
        path: Vc<FileSystemPath>,
    },
    AppMetadata {
        page: AppPage,
        metadata: MetadataItem,
    },
}

#[turbo_tasks::value(transparent)]
pub struct Entrypoints(IndexMap<AppPath, Entrypoint>);

#[turbo_tasks::value_impl]
impl Entrypoints {
    #[turbo_tasks::function]
    pub fn paths(&self) -> Vc<EntrypointPaths> {
        Vc::cell(self.0.keys().cloned().collect())
    }
}

#[turbo_tasks::value(transparent)]
#[derive(Default)]
pub struct EntrypointPaths(Vec<AppPath>);

#[turbo_tasks::value_impl]
impl ValueDefault for EntrypointPaths {
    #[turbo_tasks::function]
    fn value_default() -> Vc<Self> {
        Self::default().cell()
    }
}

fn is_parallel_route(name: &str) -> bool {
    name.starts_with('@')
}

fn match_parallel_route(name: &str) -> Option<&str> {
    name.strip_prefix('@')
}

async fn add_parallel_route(
    app_dir: Vc<FileSystemPath>,
    result: &mut IndexMap<String, Vc<LoaderTree>>,
    key: String,
    loader_tree: Vc<LoaderTree>,
) -> Result<()> {
    match result.entry(key) {
        Entry::Occupied(mut e) => {
            let value = e.get_mut();
            *value = merge_loader_trees(app_dir, *value, loader_tree)
                .resolve()
                .await?;
        }
        Entry::Vacant(e) => {
            e.insert(loader_tree);
        }
    }
    Ok(())
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
        message: Vc::cell(format!(
            "Conflicting {} at {}: {a} at {value_a} and {b} at {value_b}",
            item_names,
            e.key(),
        )),
        severity: IssueSeverity::Error.cell(),
    }
    .cell()
    .emit();
}

async fn add_app_page(
    app_dir: Vc<FileSystemPath>,
    result: &mut IndexMap<AppPath, Entrypoint>,
    page: AppPage,
    loader_tree: Vc<LoaderTree>,
) -> Result<()> {
    let mut e = match result.entry(page.clone().into()) {
        Entry::Occupied(e) => e,
        Entry::Vacant(e) => {
            e.insert(Entrypoint::AppPage { page, loader_tree });
            return Ok(());
        }
    };

    let conflict = |existing_name: &str, existing_page: &AppPage| {
        conflict_issue(app_dir, &e, "page", existing_name, &page, existing_page);
    };

    let value = e.get();
    match value {
        Entrypoint::AppPage {
            page: existing_page,
            ..
        } => {
            if *existing_page != page {
                conflict("page", existing_page);
                return Ok(());
            }

            if let Entrypoint::AppPage {
                loader_tree: value, ..
            } = e.get_mut()
            {
                *value = merge_loader_trees(app_dir, *value, loader_tree)
                    .resolve()
                    .await?;
            }
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

    Ok(())
}

fn add_app_route(
    app_dir: Vc<FileSystemPath>,
    result: &mut IndexMap<AppPath, Entrypoint>,
    page: AppPage,
    path: Vc<FileSystemPath>,
) {
    let e = match result.entry(page.clone().into()) {
        Entry::Occupied(e) => e,
        Entry::Vacant(e) => {
            e.insert(Entrypoint::AppRoute { page, path });
            return;
        }
    };

    let conflict = |existing_name: &str, existing_page: &AppPage| {
        conflict_issue(app_dir, &e, "route", existing_name, &page, existing_page);
    };

    let value = e.get();
    match value {
        Entrypoint::AppPage {
            page: existing_page,
            ..
        } => {
            conflict("page", existing_page);
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
        Entrypoint::AppPage {
            page: existing_page,
            ..
        } => {
            conflict("page", existing_page);
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
    page_extensions: Vc<Vec<String>>,
) -> Vc<Entrypoints> {
    directory_tree_to_entrypoints(
        app_dir,
        get_directory_tree(app_dir, page_extensions),
        get_global_metadata(app_dir, page_extensions),
    )
}

#[turbo_tasks::function]
fn directory_tree_to_entrypoints(
    app_dir: Vc<FileSystemPath>,
    directory_tree: Vc<DirectoryTree>,
    global_metadata: Vc<GlobalMetadata>,
) -> Vc<Entrypoints> {
    directory_tree_to_entrypoints_internal(
        app_dir,
        global_metadata,
        "".to_string(),
        directory_tree,
        AppPage::new(),
    )
}

#[turbo_tasks::function]
async fn directory_tree_to_entrypoints_internal(
    app_dir: Vc<FileSystemPath>,
    global_metadata: Vc<GlobalMetadata>,
    directory_name: String,
    directory_tree: Vc<DirectoryTree>,
    app_page: AppPage,
) -> Result<Vc<Entrypoints>> {
    let mut result = IndexMap::new();

    let directory_tree = &*directory_tree.await?;

    let subdirectories = &directory_tree.subdirectories;
    let components = directory_tree.components.await?;

    let current_level_is_parallel_route = is_parallel_route(&directory_name);

    if let Some(page) = components.page {
        add_app_page(
            app_dir,
            &mut result,
            app_page.complete(PageType::Page)?,
            if current_level_is_parallel_route {
                LoaderTree {
                    page: app_page.clone(),
                    segment: "__PAGE__".to_string(),
                    parallel_routes: IndexMap::new(),
                    components: Components {
                        page: Some(page),
                        ..Default::default()
                    }
                    .cell(),
                    global_metadata,
                }
                .cell()
            } else {
                LoaderTree {
                    page: app_page.clone(),
                    segment: directory_name.to_string(),
                    parallel_routes: indexmap! {
                        "children".to_string() => LoaderTree {
                            page: app_page.clone(),
                            segment: "__PAGE__".to_string(),
                            parallel_routes: IndexMap::new(),
                            components: Components {
                                page: Some(page),
                                ..Default::default()
                            }
                            .cell(),
                            global_metadata,
                        }
                        .cell(),
                    },
                    components: components.without_leafs().cell(),
                    global_metadata,
                }
                .cell()
            },
        )
        .await?;
    }

    if let Some(default) = components.default {
        add_app_page(
            app_dir,
            &mut result,
            app_page.complete(PageType::Page)?,
            if current_level_is_parallel_route {
                LoaderTree {
                    page: app_page.clone(),
                    segment: "__DEFAULT__".to_string(),
                    parallel_routes: IndexMap::new(),
                    components: Components {
                        default: Some(default),
                        ..Default::default()
                    }
                    .cell(),
                    global_metadata,
                }
                .cell()
            } else {
                LoaderTree {
                    page: app_page.clone(),
                    segment: directory_name.to_string(),
                    parallel_routes: indexmap! {
                    "children".to_string() => LoaderTree {
                        page: app_page.clone(),
                        segment: "__DEFAULT__".to_string(),
                        parallel_routes: IndexMap::new(),
                        components: Components {
                            default: Some(default),
                            ..Default::default()
                        }
                        .cell(),
                        global_metadata,
                    }
                    .cell(),
                    },
                    components: components.without_leafs().cell(),
                    global_metadata,
                }
                .cell()
            },
        )
        .await?;
    }

    if let Some(route) = components.route {
        add_app_route(
            app_dir,
            &mut result,
            app_page.complete(PageType::Route)?,
            route,
        );
    }

    let Metadata {
        icon,
        apple,
        twitter,
        open_graph,
        sitemap,
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
        if let Some(_not_found) = components.not_found {
            let dev_not_found_tree = LoaderTree {
                page: app_page.clone(),
                segment: directory_name.to_string(),
                parallel_routes: indexmap! {
                    "children".to_string() => LoaderTree {
                        page: app_page.clone(),
                        segment: "__DEFAULT__".to_string(),
                        parallel_routes: IndexMap::new(),
                        components: Components {
                            default: Some(get_next_package(app_dir).join("dist/client/components/parallel-route-default.js".to_string())),
                            ..Default::default()
                        }
                        .cell(),
                global_metadata,
                    }
                    .cell(),
                },
                components: components.without_leafs().cell(),
                global_metadata,
            }
            .cell();

            {
                let app_page = app_page.clone_push_str("not-found")?;
                add_app_page(app_dir, &mut result, app_page, dev_not_found_tree).await?;
            }
            {
                let app_page = app_page.clone_push_str("_not-found")?;
                add_app_page(app_dir, &mut result, app_page, dev_not_found_tree).await?;
            }
        } else {
            // Create default not-found page for production if there's no customized
            // not-found
            let prod_not_found_tree = LoaderTree {
                page: app_page.clone(),
                segment: directory_name.to_string(),
                parallel_routes: indexmap! {
                    "children".to_string() => LoaderTree {
                        page: app_page.clone(),
                        segment: "__PAGE__".to_string(),
                        parallel_routes: IndexMap::new(),
                        components: Components {
                            page: Some(get_next_package(app_dir).join("dist/client/components/not-found-error.js".to_string())),
                            ..Default::default()
                        }
                        .cell(),
                global_metadata,
                    }
                    .cell(),
                },
                components: components.without_leafs().cell(),
                global_metadata,
            }
            .cell();

            let app_page = app_page.clone_push_str("_not-found")?;
            add_app_page(app_dir, &mut result, app_page, prod_not_found_tree).await?;
        }
    }

    for (subdir_name, &subdirectory) in subdirectories.iter() {
        let parallel_route_key = match_parallel_route(subdir_name);

        let mut app_page = app_page.clone();
        let mut illegal_path = None;
        if parallel_route_key.is_none() {
            // When constructing the app_page fails (e. g. due to limitations of the order),
            // we only want to emit the error when there are actual pages below that
            // directory.
            if let Err(e) = app_page.push_str(subdir_name) {
                illegal_path = Some(e);
            }
        }

        let map = directory_tree_to_entrypoints_internal(
            app_dir,
            global_metadata,
            subdir_name.to_string(),
            subdirectory,
            app_page.clone(),
        )
        .await?;

        if let Some(illegal_path) = illegal_path {
            if !map.is_empty() {
                return Err(illegal_path);
            }
        }

        for (_, entrypoint) in map.iter() {
            match *entrypoint {
                Entrypoint::AppPage {
                    ref page,
                    loader_tree,
                } => {
                    if current_level_is_parallel_route {
                        add_app_page(app_dir, &mut result, page.clone(), loader_tree).await?;
                    } else {
                        let key = parallel_route_key.unwrap_or("children").to_string();
                        let child_loader_tree = LoaderTree {
                            page: app_page.clone(),
                            segment: directory_name.to_string(),
                            parallel_routes: indexmap! {
                                key => loader_tree,
                            },
                            components: components.without_leafs().cell(),
                            global_metadata,
                        }
                        .cell();
                        add_app_page(app_dir, &mut result, page.clone(), child_loader_tree).await?;
                    }
                }
                Entrypoint::AppRoute { ref page, path } => {
                    add_app_route(app_dir, &mut result, page.clone(), path);
                }
                Entrypoint::AppMetadata { ref page, metadata } => {
                    add_app_metadata_route(app_dir, &mut result, page.clone(), metadata);
                }
            }
        }
    }
    Ok(Vc::cell(result))
}

/// ref: https://github.com/vercel/next.js/blob/c390c1662bc79e12cf7c037dcb382ef5ead6e492/packages/next/src/build/entries.ts#L119
/// if path contains %5F, replace it with _.
fn get_underscore_normalized_path(path: &str) -> String {
    path.replace("%5F", "_")
}

/// Returns the global metadata for an app directory.
#[turbo_tasks::function]
pub async fn get_global_metadata(
    app_dir: Vc<FileSystemPath>,
    page_extensions: Vc<Vec<String>>,
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
    pub message: Vc<String>,
}

#[turbo_tasks::value_impl]
impl Issue for DirectoryTreeIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        self.severity
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<String>> {
        Ok(Vc::cell(
            "An issue occurred while preparing your Next.js app".to_string(),
        ))
    }

    #[turbo_tasks::function]
    fn category(&self) -> Vc<String> {
        Vc::cell("next app".to_string())
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.app_dir
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<String> {
        self.message
    }
}
