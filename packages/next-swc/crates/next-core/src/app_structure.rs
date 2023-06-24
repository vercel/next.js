use std::{
    borrow::Cow,
    collections::{BTreeMap, HashMap},
};

use anyhow::{bail, Result};
use indexmap::{indexmap, map::Entry, IndexMap};
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    debug::ValueDebugFormat,
    primitives::{StringVc, StringsVc},
    trace::TraceRawVcs,
    CompletionVc, CompletionsVc,
};
use turbopack_binding::{
    turbo::tasks_fs::{DirectoryContent, DirectoryEntry, FileSystemEntryType, FileSystemPathVc},
    turbopack::core::issue::{Issue, IssueSeverity, IssueSeverityVc, IssueVc},
};

use crate::next_config::NextConfigVc;

/// A final route in the app directory.
#[turbo_tasks::value]
#[derive(Default, Debug, Clone)]
pub struct Components {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<FileSystemPathVc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layout: Option<FileSystemPathVc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<FileSystemPathVc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loading: Option<FileSystemPathVc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template: Option<FileSystemPathVc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub not_found: Option<FileSystemPathVc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default: Option<FileSystemPathVc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route: Option<FileSystemPathVc>,
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
impl ComponentsVc {
    /// Returns a completion that changes when any route in the components
    /// changes.
    #[turbo_tasks::function]
    pub async fn routes_changed(self) -> Result<CompletionVc> {
        self.await?;
        Ok(CompletionVc::new())
    }
}

/// A single metadata file plus an optional "alt" text file.
#[derive(Copy, Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TraceRawVcs)]
pub enum MetadataWithAltItem {
    Static {
        path: FileSystemPathVc,
        alt_path: Option<FileSystemPathVc>,
    },
    Dynamic {
        path: FileSystemPathVc,
    },
}

/// A single metadata file.
#[derive(Copy, Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TraceRawVcs)]
pub enum MetadataItem {
    Static { path: FileSystemPathVc },
    Dynamic { path: FileSystemPathVc },
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
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub favicon: Vec<MetadataWithAltItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manifest: Option<MetadataItem>,
}

impl Metadata {
    pub fn is_empty(&self) -> bool {
        let Metadata {
            icon,
            apple,
            twitter,
            open_graph,
            favicon,
            manifest,
        } = self;
        icon.is_empty()
            && apple.is_empty()
            && twitter.is_empty()
            && open_graph.is_empty()
            && favicon.is_empty()
            && manifest.is_none()
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
            favicon: a.favicon.iter().chain(b.favicon.iter()).copied().collect(),
            manifest: a.manifest.or(b.manifest),
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
    pub sitemap: Option<MetadataItem>,
}

impl GlobalMetadata {
    pub fn is_empty(&self) -> bool {
        let GlobalMetadata {
            favicon,
            robots,
            sitemap,
        } = self;
        favicon.is_none() && robots.is_none() && sitemap.is_none()
    }
}

#[turbo_tasks::value]
#[derive(Debug)]
pub struct DirectoryTree {
    /// key is e.g. "dashboard", "(dashboard)", "@slot"
    pub subdirectories: BTreeMap<String, DirectoryTreeVc>,
    pub components: ComponentsVc,
}

#[turbo_tasks::value_impl]
impl DirectoryTreeVc {
    /// Returns a completion that changes when any route in the whole tree
    /// changes.
    #[turbo_tasks::function]
    pub async fn routes_changed(self) -> Result<CompletionVc> {
        let DirectoryTree {
            subdirectories,
            components,
        } = &*self.await?;
        let mut children = Vec::new();
        children.push(components.routes_changed());
        for child in subdirectories.values() {
            children.push(child.routes_changed());
        }
        Ok(CompletionsVc::cell(children).completed())
    }
}

#[turbo_tasks::value(transparent)]
pub struct OptionAppDir(Option<FileSystemPathVc>);

#[turbo_tasks::value_impl]
impl OptionAppDirVc {
    /// Returns a completion that changes when any route in the whole tree
    /// changes.
    #[turbo_tasks::function]
    pub async fn routes_changed(self, next_config: NextConfigVc) -> Result<CompletionVc> {
        if let Some(app_dir) = *self.await? {
            let directory_tree = get_directory_tree(app_dir, next_config.page_extensions());
            directory_tree.routes_changed().await?;
        }
        Ok(CompletionVc::new())
    }
}

/// Finds and returns the [DirectoryTree] of the app directory if existing.
#[turbo_tasks::function]
pub async fn find_app_dir(project_path: FileSystemPathVc) -> Result<OptionAppDirVc> {
    let app = project_path.join("app");
    let src_app = project_path.join("src/app");
    let app_dir = if *app.get_type().await? == FileSystemEntryType::Directory {
        app
    } else if *src_app.get_type().await? == FileSystemEntryType::Directory {
        src_app
    } else {
        return Ok(OptionAppDirVc::cell(None));
    }
    .resolve()
    .await?;

    Ok(OptionAppDirVc::cell(Some(app_dir)))
}

/// Finds and returns the [DirectoryTree] of the app directory if enabled and
/// existing.
#[turbo_tasks::function]
pub async fn find_app_dir_if_enabled(
    project_path: FileSystemPathVc,
    next_config: NextConfigVc,
) -> Result<OptionAppDirVc> {
    if !*next_config.app_dir().await? {
        return Ok(OptionAppDirVc::cell(None));
    }
    Ok(find_app_dir(project_path))
}

static STATIC_LOCAL_METADATA: Lazy<HashMap<&'static str, &'static [&'static str]>> =
    Lazy::new(|| {
        HashMap::from([
            (
                "icon",
                &["ico", "jpg", "jpeg", "png", "svg"] as &'static [&'static str],
            ),
            ("apple-icon", &["jpg", "jpeg", "png"]),
            ("opengraph-image", &["jpg", "jpeg", "png", "gif"]),
            ("twitter-image", &["jpg", "jpeg", "png", "gif"]),
            ("favicon", &["ico"]),
            ("manifest", &["webmanifest", "json"]),
        ])
    });

static STATIC_GLOBAL_METADATA: Lazy<HashMap<&'static str, &'static [&'static str]>> =
    Lazy::new(|| {
        HashMap::from([
            ("favicon", &["ico"] as &'static [&'static str]),
            ("robots", &["txt"]),
            ("sitemap", &["xml"]),
        ])
    });

fn match_metadata_file<'a>(
    basename: &'a str,
    page_extensions: &[String],
) -> Option<(&'a str, i32, bool)> {
    let (stem, ext) = basename.split_once('.')?;
    static REGEX: Lazy<Regex> = Lazy::new(|| Regex::new("^(.*?)(\\d*)$").unwrap());
    let captures = REGEX.captures(stem).expect("the regex will always match");
    let stem = captures.get(1).unwrap().as_str();
    let num: i32 = captures.get(2).unwrap().as_str().parse().unwrap_or(-1);
    if page_extensions.iter().any(|e| e == ext) {
        return Some((stem, num, true));
    }
    let exts = STATIC_LOCAL_METADATA.get(stem)?;
    exts.contains(&ext).then_some((stem, num, false))
}

#[turbo_tasks::function]
async fn get_directory_tree(
    app_dir: FileSystemPathVc,
    page_extensions: StringsVc,
) -> Result<DirectoryTreeVc> {
    let DirectoryContent::Entries(entries) = &*app_dir.read_dir().await? else {
        bail!("app_dir must be a directory")
    };
    let page_extensions_value = page_extensions.await?;

    let mut subdirectories = BTreeMap::new();
    let mut components = Components::default();

    let mut metadata_icon = Vec::new();
    let mut metadata_apple = Vec::new();
    let mut metadata_open_graph = Vec::new();
    let mut metadata_twitter = Vec::new();
    let mut metadata_favicon = Vec::new();

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
                            "manifest" => {
                                components.metadata.manifest =
                                    Some(MetadataItem::Dynamic { path: file });
                                continue;
                            }
                            _ => {}
                        }
                    }
                }

                if let Some((metadata_type, num, dynamic)) =
                    match_metadata_file(basename.as_str(), &page_extensions_value)
                {
                    if metadata_type == "manifest" {
                        if num == -1 {
                            components.metadata.manifest =
                                Some(MetadataItem::Static { path: file });
                        }
                        continue;
                    }

                    let entry = match metadata_type {
                        "icon" => Some(&mut metadata_icon),
                        "apple-icon" => Some(&mut metadata_apple),
                        "twitter-image" => Some(&mut metadata_twitter),
                        "opengraph-image" => Some(&mut metadata_open_graph),
                        "favicon" => Some(&mut metadata_favicon),
                        _ => None,
                    };

                    if let Some(entry) = entry {
                        if dynamic {
                            entry.push((num, MetadataWithAltItem::Dynamic { path: file }));
                        } else {
                            let file_value = file.await?;
                            let file_name = file_value.file_name();
                            let basename = file_name
                                .rsplit_once('.')
                                .map_or(file_name, |(basename, _)| basename);
                            let alt_path = file.parent().join(&format!("{}.alt.txt", basename));
                            let alt_path =
                                matches!(&*alt_path.get_type().await?, FileSystemEntryType::File)
                                    .then_some(alt_path);
                            entry.push((
                                num,
                                MetadataWithAltItem::Static {
                                    path: file,
                                    alt_path,
                                },
                            ));
                        }
                    }
                }
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

    fn sort<T>(mut list: Vec<(i32, T)>) -> Vec<T> {
        list.sort_by_key(|(num, _)| *num);
        list.into_iter().map(|(_, item)| item).collect()
    }

    components.metadata.icon = sort(metadata_icon);
    components.metadata.apple = sort(metadata_apple);
    components.metadata.twitter = sort(metadata_twitter);
    components.metadata.open_graph = sort(metadata_open_graph);
    components.metadata.favicon = sort(metadata_favicon);

    Ok(DirectoryTree {
        subdirectories,
        components: components.cell(),
    }
    .cell())
}

#[turbo_tasks::value]
#[derive(Debug, Clone)]
pub struct LoaderTree {
    pub segment: String,
    pub parallel_routes: IndexMap<String, LoaderTreeVc>,
    pub components: ComponentsVc,
}

#[turbo_tasks::function]
async fn merge_loader_trees(
    app_dir: FileSystemPathVc,
    tree1: LoaderTreeVc,
    tree2: LoaderTreeVc,
) -> Result<LoaderTreeVc> {
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
        segment,
        parallel_routes,
        components,
    }
    .cell())
}

#[derive(
    Copy, Clone, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat, Debug,
)]
pub enum Entrypoint {
    AppPage { loader_tree: LoaderTreeVc },
    AppRoute { path: FileSystemPathVc },
}

#[turbo_tasks::value(transparent)]
pub struct Entrypoints(IndexMap<String, Entrypoint>);

fn is_parallel_route(name: &str) -> bool {
    name.starts_with('@')
}

fn match_parallel_route(name: &str) -> Option<&str> {
    name.strip_prefix('@')
}

fn is_optional_segment(name: &str) -> bool {
    name.starts_with('(') && name.ends_with(')')
}

async fn add_parallel_route(
    app_dir: FileSystemPathVc,
    result: &mut IndexMap<String, LoaderTreeVc>,
    key: String,
    loader_tree: LoaderTreeVc,
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

async fn add_app_page(
    app_dir: FileSystemPathVc,
    result: &mut IndexMap<String, Entrypoint>,
    key: String,
    loader_tree: LoaderTreeVc,
) -> Result<()> {
    match result.entry(key) {
        Entry::Occupied(mut e) => {
            let value = e.get_mut();
            let Entrypoint::AppPage { loader_tree: value } = value else {
                DirectoryTreeIssue {
                    app_dir,
                    message: StringVc::cell(format!("Conflicting route at {}", e.key())),
                    severity: IssueSeverity::Error.cell(),
                }.cell().as_issue().emit();
                return Ok(());
            };
            *value = merge_loader_trees(app_dir, *value, loader_tree)
                .resolve()
                .await?;
        }
        Entry::Vacant(e) => {
            e.insert(Entrypoint::AppPage { loader_tree });
        }
    }
    Ok(())
}

async fn add_app_route(
    app_dir: FileSystemPathVc,
    result: &mut IndexMap<String, Entrypoint>,
    key: String,
    path: FileSystemPathVc,
) -> Result<()> {
    match result.entry(key) {
        Entry::Occupied(mut e) => {
            DirectoryTreeIssue {
                app_dir,
                message: StringVc::cell(format!("Conflicting route at {}", e.key())),
                severity: IssueSeverity::Error.cell(),
            }
            .cell()
            .as_issue()
            .emit();
            *e.get_mut() = Entrypoint::AppRoute { path };
        }
        Entry::Vacant(e) => {
            e.insert(Entrypoint::AppRoute { path });
        }
    }
    Ok(())
}

#[turbo_tasks::function]
pub fn get_entrypoints(app_dir: FileSystemPathVc, page_extensions: StringsVc) -> EntrypointsVc {
    directory_tree_to_entrypoints(app_dir, get_directory_tree(app_dir, page_extensions))
}

#[turbo_tasks::function]
fn directory_tree_to_entrypoints(
    app_dir: FileSystemPathVc,
    directory_tree: DirectoryTreeVc,
) -> EntrypointsVc {
    directory_tree_to_entrypoints_internal(app_dir, "", directory_tree, "/")
}

#[turbo_tasks::function]
async fn directory_tree_to_entrypoints_internal(
    app_dir: FileSystemPathVc,
    directory_name: &str,
    directory_tree: DirectoryTreeVc,
    path_prefix: &str,
) -> Result<EntrypointsVc> {
    let mut result = IndexMap::new();

    let directory_tree = &*directory_tree.await?;

    let subdirectories = &directory_tree.subdirectories;
    let components = directory_tree.components.await?;

    let current_level_is_parallel_route = is_parallel_route(directory_name);

    if let Some(page) = components.page {
        add_app_page(
            app_dir,
            &mut result,
            path_prefix.to_string(),
            if current_level_is_parallel_route {
                LoaderTree {
                    segment: "__PAGE__".to_string(),
                    parallel_routes: IndexMap::new(),
                    components: Components {
                        page: Some(page),
                        ..Default::default()
                    }
                    .cell(),
                }
                .cell()
            } else {
                LoaderTree {
                    segment: directory_name.to_string(),
                    parallel_routes: indexmap! {
                        "children".to_string() => LoaderTree {
                            segment: "__PAGE__".to_string(),
                            parallel_routes: IndexMap::new(),
                            components: Components {
                                page: Some(page),
                                ..Default::default()
                            }
                            .cell(),
                        }
                        .cell(),
                    },
                    components: components.without_leafs().cell(),
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
            path_prefix.to_string(),
            if current_level_is_parallel_route {
                LoaderTree {
                    segment: "__DEFAULT__".to_string(),
                    parallel_routes: IndexMap::new(),
                    components: Components {
                        default: Some(default),
                        ..Default::default()
                    }
                    .cell(),
                }
                .cell()
            } else {
                LoaderTree {
                    segment: directory_name.to_string(),
                    parallel_routes: indexmap! {
                        "children".to_string() => LoaderTree {
                            segment: "__DEFAULT__".to_string(),
                            parallel_routes: IndexMap::new(),
                            components: Components {
                                default: Some(default),
                                ..Default::default()
                            }
                            .cell(),
                        }
                        .cell(),
                    },
                    components: components.without_leafs().cell(),
                }
                .cell()
            },
        )
        .await?;
    }

    if let Some(route) = components.route {
        add_app_route(app_dir, &mut result, path_prefix.to_string(), route).await?;
    }

    for (subdir_name, &subdirectory) in subdirectories.iter() {
        let parallel_route_key = match_parallel_route(subdir_name);
        let optional_segment = is_optional_segment(subdir_name);
        let map = directory_tree_to_entrypoints_internal(
            app_dir,
            subdir_name,
            subdirectory,
            if parallel_route_key.is_some() || optional_segment {
                Cow::Borrowed(path_prefix)
            } else if path_prefix == "/" {
                format!("/{subdir_name}").into()
            } else {
                format!("{path_prefix}/{subdir_name}").into()
            }
            .as_ref(),
        )
        .await?;
        for (full_path, &entrypoint) in map.iter() {
            match entrypoint {
                Entrypoint::AppPage { loader_tree } => {
                    if current_level_is_parallel_route {
                        add_app_page(app_dir, &mut result, full_path.clone(), loader_tree).await?;
                    } else {
                        let key = parallel_route_key.unwrap_or("children").to_string();
                        let child_loader_tree = LoaderTree {
                            segment: directory_name.to_string(),
                            parallel_routes: indexmap! {
                                key => loader_tree,
                            },
                            components: components.without_leafs().cell(),
                        }
                        .cell();
                        add_app_page(app_dir, &mut result, full_path.clone(), child_loader_tree)
                            .await?;
                    }
                }
                Entrypoint::AppRoute { path } => {
                    add_app_route(app_dir, &mut result, full_path.clone(), path).await?;
                }
            }
        }
    }
    Ok(EntrypointsVc::cell(result))
}

/// ref: https://github.com/vercel/next.js/blob/c390c1662bc79e12cf7c037dcb382ef5ead6e492/packages/next/src/build/entries.ts#L119
/// if path contains %5F, replace it with _.
fn get_underscore_normalized_path(path: &str) -> String {
    path.replace("%5F", "_")
}

/// Returns the global metadata for an app directory.
#[turbo_tasks::function]
pub async fn get_global_metadata(
    app_dir: FileSystemPathVc,
    page_extensions: StringsVc,
) -> Result<GlobalMetadataVc> {
    let DirectoryContent::Entries(entries) = &*app_dir.read_dir().await? else {
        bail!("app_dir must be a directory")
    };
    let mut metadata = GlobalMetadata::default();

    for (basename, entry) in entries {
        if let DirectoryEntry::File(file) = *entry {
            if let Some((stem, ext)) = basename.split_once('.') {
                let list = match stem {
                    "favicon" => Some(&mut metadata.favicon),
                    "sitemap" => Some(&mut metadata.sitemap),
                    "robots" => Some(&mut metadata.robots),
                    _ => None,
                };
                if let Some(list) = list {
                    if page_extensions.await?.iter().any(|e| e == ext) {
                        *list = Some(MetadataItem::Dynamic { path: file });
                    }
                    if STATIC_GLOBAL_METADATA.get(stem).unwrap().contains(&ext) {
                        *list = Some(MetadataItem::Static { path: file });
                    }
                }
            }
        }
        // TODO(WEB-952) handle symlinks in app dir
    }

    Ok(metadata.cell())
}

#[turbo_tasks::value(shared)]
struct DirectoryTreeIssue {
    pub severity: IssueSeverityVc,
    pub app_dir: FileSystemPathVc,
    pub message: StringVc,
}

#[turbo_tasks::value_impl]
impl Issue for DirectoryTreeIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> IssueSeverityVc {
        self.severity
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<StringVc> {
        Ok(StringVc::cell(
            "An issue occurred while preparing your Next.js app".to_string(),
        ))
    }

    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("next app".to_string())
    }

    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.app_dir
    }

    #[turbo_tasks::function]
    fn description(&self) -> StringVc {
        self.message
    }
}
