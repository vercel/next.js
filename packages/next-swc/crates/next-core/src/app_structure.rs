use std::{
    borrow::Cow,
    collections::{BTreeMap, HashMap},
};

use anyhow::{bail, Result};
use indexmap::{indexmap, map::Entry, IndexMap};
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use turbo_binding::{
    turbo::tasks_fs::{DirectoryContent, DirectoryEntry, FileSystemEntryType, FileSystemPathVc},
    turbopack::core::issue::{Issue, IssueSeverity, IssueSeverityVc, IssueVc},
};
use turbo_tasks::{
    debug::ValueDebugFormat,
    primitives::{StringVc, StringsVc},
    trace::TraceRawVcs,
    CompletionVc, CompletionsVc,
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
            default: a.default.or(b.default),
            route: a.default.or(b.route),
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

#[derive(Default, Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TraceRawVcs)]
pub struct Metadata {
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub icon: Vec<FileSystemPathVc>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub apple: Vec<FileSystemPathVc>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub twitter: Vec<FileSystemPathVc>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub open_graph: Vec<FileSystemPathVc>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub favicon: Vec<FileSystemPathVc>,
}

impl Metadata {
    pub fn is_empty(&self) -> bool {
        let Metadata {
            icon,
            apple,
            twitter,
            open_graph,
            favicon,
        } = self;
        icon.is_empty()
            && apple.is_empty()
            && twitter.is_empty()
            && open_graph.is_empty()
            && favicon.is_empty()
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
        }
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

static STATIC_METADATA_IMAGES: Lazy<HashMap<&'static str, &'static [&'static str]>> =
    Lazy::new(|| {
        HashMap::from([
            (
                "icon",
                &["ico", "jpg", "jpeg", "png", "svg"] as &'static [&'static str],
            ),
            ("apple-icon", &["jpg", "jpeg", "png"]),
            ("favicon", &["ico"]),
            ("opengraph-image", &["jpg", "jpeg", "png", "gif"]),
            ("twitter-image", &["jpg", "jpeg", "png", "gif"]),
        ])
    });

fn match_metadata_file(basename: &str) -> Option<&'static str> {
    let (stem, ext) = basename.split_once('.')?;
    static REGEX: Lazy<Regex> = Lazy::new(|| Regex::new("\\d*$").unwrap());
    let stem = REGEX.replace(stem, "");
    let (key, exts) = STATIC_METADATA_IMAGES.get_key_value(stem.as_ref())?;
    exts.contains(&ext).then_some(key)
}

#[turbo_tasks::function]
async fn get_directory_tree(
    app_dir: FileSystemPathVc,
    page_extensions: StringsVc,
) -> Result<DirectoryTreeVc> {
    let DirectoryContent::Entries(entries) = &*app_dir.read_dir().await? else {
        bail!("app_dir must be a directory")
    };
    let mut subdirectories = BTreeMap::new();
    let mut components = Components::default();

    for (basename, entry) in entries {
        match *entry {
            DirectoryEntry::File(file) => {
                if let Some((stem, ext)) = basename.split_once('.') {
                    if page_extensions.await?.iter().any(|e| e == ext) {
                        match stem {
                            "page" => components.page = Some(file),
                            "layout" => components.layout = Some(file),
                            "error" => components.error = Some(file),
                            "loading" => components.loading = Some(file),
                            "template" => components.template = Some(file),
                            "default" => components.default = Some(file),
                            "route" => components.route = Some(file),
                            _ => {}
                        }
                    }
                }
                if let Some(metadata_type) = match_metadata_file(basename.as_str()) {
                    let metadata = &mut components.metadata;

                    let entry = match metadata_type {
                        "icon" => Some(&mut metadata.icon),
                        "apple-icon" => Some(&mut metadata.apple),
                        "twitter-image" => Some(&mut metadata.twitter),
                        "opengraph-image" => Some(&mut metadata.open_graph),
                        "favicon" => Some(&mut metadata.favicon),
                        _ => None,
                    };

                    if let Some(entry) = entry {
                        entry.push(file)
                    }
                }
            }
            DirectoryEntry::Directory(dir) => {
                let result = get_directory_tree(dir, page_extensions);
                subdirectories.insert(basename.to_string(), result);
            }
            // TODO handle symlinks in app dir
            _ => {}
        }
    }

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
pub fn directory_tree_to_entrypoints(
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
