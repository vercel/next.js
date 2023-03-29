use async_recursion::async_recursion;
use serde::{Deserialize, Serialize};
use std::time::Instant;
use std::{collections::HashMap, fs, path::Path};
use tokio;

#[derive(Default, Debug, Clone, Serialize, Deserialize)]
struct Components {
    #[serde(skip_serializing_if = "Option::is_none")]
    page: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    layout: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    loading: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    template: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    default: Option<String>,
    #[serde(skip_serializing_if = "Metadata::is_empty")]
    metadata: Metadata,
}

#[derive(Default, Debug)]
struct DirectoryTree {
    /// e.g. "dashboard", "(dashboard)", "@slot"
    directory_name: String,
    subdirectories: Vec<DirectoryTree>,
    components: Components,
}

#[derive(Default, Serialize, Deserialize)]
struct Metadata {
    #[serde(skip_serializing_if = "Vec::is_empty")]
    icon: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    apple: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    twitter: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    open_graph: Vec<String>,
}

#[derive(Default, Debug, Clone, Serialize, Deserialize)]
struct LoaderTree {
    segment: String,
    parallel_routes: HashMap<String, LoaderTree>,
    components: Components,
}

const FILE_TYPES: [&str; 6] = ["page", "layout", "error", "loading", "template", "default"];

fn match_file_types(file: &Path, page_extensions: &[&str]) -> Option<String> {
    let file_stem = file.file_stem()?.to_str()?;
    let file_ext = file.extension()?.to_str()?.trim_start_matches('.');

    if FILE_TYPES.contains(&file_stem) && page_extensions.contains(&file_ext) {
        Some(file_stem.to_string())
    } else {
        None
    }
}

const STATIC_METADATA_IMAGES: [(&str, &[&str]); 5] = [
    ("icon", &["ico", "jpg", "jpeg", "png", "svg"]),
    ("apple-icon", &["jpg", "jpeg", "png"]),
    ("favicon", &["ico"]),
    ("opengraph-image", &["jpg", "jpeg", "png", "gif"]),
    ("twitter-image", &["jpg", "jpeg", "png", "gif"]),
];

fn match_metadata_file(file: &Path) -> Option<String> {
    let file_stem = file.file_stem()?.to_str()?;
    let file_ext = file.extension()?.to_str()?.trim_start_matches('.');

    for (key, extensions) in STATIC_METADATA_IMAGES.iter() {
        if file_stem == *key && extensions.contains(&file_ext) {
            return Some(key.to_string());
        }
    }

    None
}
#[async_recursion]
async fn resolve_app_tree(
    dir: &Path,
    page_extensions: &[&str],
    directory_name: String,
) -> Result<DirectoryTree, std::io::Error> {
    let dir_items = fs::read_dir(dir)?.collect::<Vec<_>>();
    let mut children = vec![];
    let mut components = Components::default();

    for dir_item in dir_items {
        let dir_item = dir_item?;
        let file_name = dir_item.file_name();
        let file_path = dir_item.path();
        let metadata = fs::metadata(&file_path)?;

        if metadata.is_file() {
            if let Some(file_type) = match_file_types(&file_path, page_extensions) {
                match file_type.as_str() {
                    "page" => components.page = Some(file_path.to_string_lossy().to_string()),
                    "layout" => components.layout = Some(file_path.to_string_lossy().to_string()),
                    "error" => components.error = Some(file_path.to_string_lossy().to_string()),
                    "loading" => components.loading = Some(file_path.to_string_lossy().to_string()),
                    "template" => {
                        components.template = Some(file_path.to_string_lossy().to_string())
                    }
                    "default" => components.default = Some(file_path.to_string_lossy().to_string()),
                    _ => {}
                }
            } else if let Some(metadata_type) = match_metadata_file(&file_path) {
                let metadata = components.metadata.get_or_insert_with(HashMap::default);

                match metadata_type.as_str() {
                    "icon" => {
                        metadata
                            .entry("icon".to_string())
                            .or_insert_with(Vec::new)
                            .push(file_path.to_string_lossy().to_string());
                    }
                    "apple-icon" => {
                        metadata
                            .entry("apple".to_string())
                            .or_insert_with(Vec::new)
                            .push(file_path.to_string_lossy().to_string());
                    }
                    "twitter-image" => {
                        metadata
                            .entry("twitter".to_string())
                            .or_insert_with(Vec::new)
                            .push(file_path.to_string_lossy().to_string());
                    }
                    "opengraph-image" => {
                        metadata
                            .entry("open_graph".to_string())
                            .or_insert_with(Vec::new)
                            .push(file_path.to_string_lossy().to_string());
                    }
                    _ => {}
                }
            }
        } else if metadata.is_dir() {
            let sub_dir = file_path;
            let result = resolve_app_tree(
                &sub_dir,
                page_extensions,
                file_name.to_string_lossy().to_string(),
            )
            .await?;
            children.push(result);
        }
    }

    Ok(DirectoryTree {
        directory_name,
        subdirectories: children.into_iter().map(Box::new).collect(),
        components,
    })
}

fn merge_loader_trees(tree1: LoaderTree, tree2: LoaderTree) -> LoaderTree {
    let segment = if !tree1.segment.is_empty() {
        tree1.segment
    } else {
        tree2.segment
    };

    let mut parallel_routes = tree1.parallel_routes.clone();
    for (key, tree2_route) in tree2.parallel_routes {
        parallel_routes
            .entry(key.clone())
            .and_modify(|tree1_route| {
                *tree1_route = merge_loader_trees(tree1_route.clone(), tree2_route.clone())
            })
            .or_insert(tree2_route);
    }

    let components = Components {
        page: tree1.components.page.or(tree2.components.page),
        layout: tree1.components.layout.or(tree2.components.layout),
        error: tree1.components.error.or(tree2.components.error),
        loading: tree1.components.loading.or(tree2.components.loading),
        template: tree1.components.template.or(tree2.components.template),
        default: tree1.components.default.or(tree2.components.default),
        metadata: tree1.components.metadata.or(tree2.components.metadata),
    };

    LoaderTree {
        segment,
        parallel_routes,
        components,
    }
}

fn omit_page_and_default(obj: &Components) -> Components {
    Components {
        page: None,
        layout: obj.layout.clone(),
        error: obj.error.clone(),
        loading: obj.loading.clone(),
        template: obj.template.clone(),
        default: None,
        metadata: obj.metadata.clone(),
    }
}

fn match_parallel_route(name: &str) -> Option<String> {
    if name.starts_with('@') {
        Some(name[1..].to_string())
    } else {
        None
    }
}

fn unbox<T>(value: Box<T>) -> T {
    *value
}

fn directory_tree_to_loader_tree(
    directory_name: &str,
    directory_tree: DirectoryTree,
    path_prefix: String,
    add_loader_tree: &mut dyn FnMut(String, LoaderTree),
) {
    let subdirectories = directory_tree.subdirectories;
    let components = directory_tree.components;

    let current_level_is_parallel_route = match_parallel_route(&directory_name);
    let components_without_page_and_default = omit_page_and_default(&components);

    if let Some(page) = &components.page {
        if let Some(_) = &current_level_is_parallel_route {
            add_loader_tree(
                path_prefix.to_string(),
                LoaderTree {
                    segment: "__PAGE__".to_string(),
                    parallel_routes: HashMap::new(),
                    components: Components {
                        page: Some(page.clone()),
                        ..Default::default()
                    },
                },
            );
        } else {
            let item = LoaderTree {
                segment: directory_name.clone(),
                parallel_routes: {
                    let mut map = HashMap::new();
                    map.insert(
                        "children".to_string(),
                        LoaderTree {
                            segment: "__PAGE__".to_string(),
                            parallel_routes: HashMap::new(),
                            components: Components {
                                page: Some(page.clone()),
                                ..Default::default()
                            },
                        },
                    );
                    map
                },
                components: components_without_page_and_default.clone(),
            };
            add_loader_tree(path_prefix.to_string(), item);
        }
    }

    if let Some(default) = &components.default {
        if let Some(_) = &current_level_is_parallel_route {
            add_loader_tree(
                path_prefix.to_string(),
                LoaderTree {
                    segment: "__DEFAULT__".to_string(),
                    parallel_routes: HashMap::new(),
                    components: Components {
                        default: Some(default.clone()),
                        ..Default::default()
                    },
                },
            );
        } else {
            let item = LoaderTree {
                segment: directory_name.clone(),
                parallel_routes: {
                    let mut map = HashMap::new();
                    map.insert(
                        "children".to_string(),
                        LoaderTree {
                            segment: "__DEFAULT__".to_string(),
                            parallel_routes: HashMap::new(),
                            components: Components {
                                default: Some(default.clone()),
                                ..Default::default()
                            },
                        },
                    );
                    map
                },
                components: components_without_page_and_default.clone(),
            };
            add_loader_tree(path_prefix.to_string(), item);
        }
    }

    for (subdir_name, subdirectory) in subdirectories.into_iter() {
        let parallel_route_key: Option<String> = match_parallel_route(&subdirectory.directory_name);
        let subdir = unbox(subdirectory);
        directory_tree_to_loader_tree(
            subdir_name,
            subdir,
            format!(
                "{}{}",
                path_prefix,
                if let Some(_) = parallel_route_key {
                    format!("")
                } else {
                    format!(
                        "{}{}",
                        if path_prefix == "/" { "" } else { "/" },
                        subdir_name
                    )
                },
            ),
            &mut |full_path: String, loader_tree: LoaderTree| {
                if let Some(_) = current_level_is_parallel_route {
                    add_loader_tree(full_path, loader_tree);
                } else {
                    let default_key = "children".to_string();
                    let child_loader_tree = LoaderTree {
                        segment: directory_name.clone(),
                        parallel_routes: {
                            let mut map: HashMap<String, LoaderTree> = HashMap::new();
                            map.insert(
                                parallel_route_key
                                    .as_ref()
                                    .unwrap_or_else(|| &default_key)
                                    .clone(),
                                loader_tree,
                            );
                            map
                        },
                        components: components_without_page_and_default.clone(),
                    };
                    add_loader_tree(full_path, child_loader_tree);
                }
            },
        );
    }
}

// The rest of the code deals with LoaderTree, mergeLoaderTrees, omitKeys, omitPageAndDefault, matchParallelRoute, directoryTreeToLoaderTree,
// collectLoaderTreeByEntrypoint functions and their respective implementations in Rust.
// Due to the complexity of these implementations, it is advised to split the code conversion into smaller parts and perform step-by-step conversion.

// Add this at the end of your `resolve.rs` file
#[tokio::main]
async fn main() {
    // Call the necessary functions here or test the functions implemented above
    // For example, you can call `resolve_app_tree` function and print the result
    let dir = std::path::Path::new(
        "/Users/timneutkens/projects/next.js/test/e2e/app-dir/app/app",
    );
    let page_extensions = vec!["js", "jsx", "ts", "tsx", "mdx"];

    let result = resolve_app_tree(dir, &page_extensions, String::new()).await;

    match result {
        Ok(result) => {
            let mut entrypoints: HashMap<String, LoaderTree> = HashMap::new();

            directory_tree_to_loader_tree(
                "",
                result,
                String::new(),
                &mut |full_path: String, loader_tree: LoaderTree| {
                    let key = full_path;
                    if let Some(value) = entrypoints.get(&key) {
                        entrypoints.insert(key, merge_loader_trees(value.clone(), loader_tree));
                    } else {
                        entrypoints.insert(key, loader_tree);
                    }
                },
            );

            let entrypoints_json = serde_json::to_string_pretty(&entrypoints)
                .expect("Failed to convert entrypoints to JSON");

            println!("Entrypoints JSON: {}", entrypoints_json);
            println!("Function took: {} microseconds", duration.as_micros());
        }
        Err(e) => eprintln!("Error: {:?}", e),
    }
}
