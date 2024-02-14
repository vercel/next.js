use std::collections::HashMap;

use anyhow::{anyhow, Result};
use next_core::app_structure::{
    Components, Entrypoint, Entrypoints, LoaderTree, MetadataItem, MetadataWithAltItem,
};
use serde::{Deserialize, Serialize};
use turbo_tasks::{ReadRef, Vc};
use turbopack_binding::{
    turbo::{
        tasks::{debug::ValueDebugFormat, trace::TraceRawVcs, TryJoinIterExt, ValueToString},
        tasks_fs::{DiskFileSystem, FileSystem, FileSystemPath},
    },
    turbopack::core::PROJECT_FILESYSTEM_NAME,
};

#[turbo_tasks::value]
#[serde(rename_all = "camelCase")]
struct LoaderTreeForJs {
    segment: String,
    parallel_routes: HashMap<String, ReadRef<LoaderTreeForJs>>,
    #[turbo_tasks(trace_ignore)]
    components: ComponentsForJs,
    #[turbo_tasks(trace_ignore)]
    global_metadata: GlobalMetadataForJs,
}

#[derive(PartialEq, Eq, Serialize, Deserialize, ValueDebugFormat, TraceRawVcs)]
#[serde(rename_all = "camelCase")]
enum EntrypointForJs {
    AppPage {
        loader_tree: ReadRef<LoaderTreeForJs>,
    },
    AppRoute {
        path: String,
    },
}

#[turbo_tasks::value(transparent)]
#[serde(rename_all = "camelCase")]
struct EntrypointsForJs(HashMap<String, EntrypointForJs>);

#[turbo_tasks::value(transparent)]
struct OptionEntrypointsForJs(Option<Vc<EntrypointsForJs>>);

async fn fs_path_to_path(
    project_path: Vc<FileSystemPath>,
    path: Vc<FileSystemPath>,
) -> Result<String> {
    match project_path.await?.get_path_to(&*path.await?) {
        None => Err(anyhow!(
            "Path {} is not inside of the project path {}",
            path.to_string().await?,
            project_path.to_string().await?
        )),
        Some(p) => Ok(p.to_string()),
    }
}

#[derive(Default, Deserialize, Serialize, PartialEq, Eq, ValueDebugFormat)]
#[serde(rename_all = "camelCase")]
struct ComponentsForJs {
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
    #[serde(skip_serializing_if = "Option::is_none", rename = "not-found")]
    not_found: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    default: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    route: Option<String>,
    metadata: MetadataForJs,
}

#[derive(Default, Deserialize, Serialize, PartialEq, Eq, ValueDebugFormat)]
#[serde(rename_all = "camelCase")]
struct MetadataForJs {
    #[serde(skip_serializing_if = "Vec::is_empty")]
    icon: Vec<MetadataWithAltItemForJs>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    apple: Vec<MetadataWithAltItemForJs>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    twitter: Vec<MetadataWithAltItemForJs>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    open_graph: Vec<MetadataWithAltItemForJs>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sitemap: Option<MetadataItemForJs>,
}

#[derive(Default, Deserialize, Serialize, PartialEq, Eq, ValueDebugFormat)]
#[serde(rename_all = "camelCase")]
struct GlobalMetadataForJs {
    #[serde(skip_serializing_if = "Option::is_none")]
    favicon: Option<MetadataItemForJs>,
    #[serde(skip_serializing_if = "Option::is_none")]
    robots: Option<MetadataItemForJs>,
    #[serde(skip_serializing_if = "Option::is_none")]
    manifest: Option<MetadataItemForJs>,
}

#[derive(Deserialize, Serialize, PartialEq, Eq, ValueDebugFormat)]
#[serde(tag = "type", rename_all = "camelCase")]
enum MetadataWithAltItemForJs {
    Static {
        path: String,
        alt_path: Option<String>,
    },
    Dynamic {
        path: String,
    },
}

#[derive(Deserialize, Serialize, PartialEq, Eq, ValueDebugFormat)]
#[serde(tag = "type", rename_all = "camelCase")]
enum MetadataItemForJs {
    Static { path: String },
    Dynamic { path: String },
}

async fn prepare_components_for_js(
    project_path: Vc<FileSystemPath>,
    components: Vc<Components>,
) -> Result<ComponentsForJs> {
    let Components {
        page,
        layout,
        error,
        loading,
        template,
        not_found,
        default,
        route,
        metadata,
    } = &*components.await?;
    let mut result = ComponentsForJs::default();
    async fn add(
        result: &mut Option<String>,
        project_path: Vc<FileSystemPath>,
        value: &Option<Vc<FileSystemPath>>,
    ) -> Result<()> {
        if let Some(value) = value {
            *result = Some(fs_path_to_path(project_path, *value).await?);
        }
        Ok::<_, anyhow::Error>(())
    }
    add(&mut result.page, project_path, page).await?;
    add(&mut result.layout, project_path, layout).await?;
    add(&mut result.error, project_path, error).await?;
    add(&mut result.loading, project_path, loading).await?;
    add(&mut result.template, project_path, template).await?;
    add(&mut result.not_found, project_path, not_found).await?;
    add(&mut result.default, project_path, default).await?;
    add(&mut result.route, project_path, route).await?;

    let meta = &mut result.metadata;
    add_meta_vec(&mut meta.icon, project_path, metadata.icon.iter()).await?;
    add_meta_vec(&mut meta.apple, project_path, metadata.apple.iter()).await?;
    add_meta_vec(&mut meta.twitter, project_path, metadata.twitter.iter()).await?;
    add_meta_vec(
        &mut meta.open_graph,
        project_path,
        metadata.open_graph.iter(),
    )
    .await?;
    add_meta(&mut meta.sitemap, project_path, metadata.sitemap).await?;
    Ok(result)
}

async fn add_meta_vec<'a>(
    meta: &mut Vec<MetadataWithAltItemForJs>,
    project_path: Vc<FileSystemPath>,
    value: impl Iterator<Item = &'a MetadataWithAltItem>,
) -> Result<()> {
    let mut value = value.peekable();
    if value.peek().is_some() {
        *meta = value
            .map(|value| async move {
                Ok(match value {
                    MetadataWithAltItem::Static { path, alt_path } => {
                        let path = fs_path_to_path(project_path, *path).await?;
                        let alt_path = if let Some(alt_path) = alt_path {
                            Some(fs_path_to_path(project_path, *alt_path).await?)
                        } else {
                            None
                        };
                        MetadataWithAltItemForJs::Static { path, alt_path }
                    }
                    MetadataWithAltItem::Dynamic { path } => {
                        let path = fs_path_to_path(project_path, *path).await?;
                        MetadataWithAltItemForJs::Dynamic { path }
                    }
                })
            })
            .try_join()
            .await?;
    }

    Ok(())
}

async fn add_meta<'a>(
    meta: &mut Option<MetadataItemForJs>,
    project_path: Vc<FileSystemPath>,
    value: Option<MetadataItem>,
) -> Result<()> {
    if value.is_some() {
        *meta = match value {
            Some(MetadataItem::Static { path }) => {
                let path = fs_path_to_path(project_path, path).await?;
                Some(MetadataItemForJs::Static { path })
            }
            Some(MetadataItem::Dynamic { path }) => {
                let path = fs_path_to_path(project_path, path).await?;
                Some(MetadataItemForJs::Dynamic { path })
            }
            None => None,
        };
    }

    Ok(())
}

#[turbo_tasks::function]
async fn prepare_loader_tree_for_js(
    project_path: Vc<FileSystemPath>,
    loader_tree: Vc<LoaderTree>,
) -> Result<Vc<LoaderTreeForJs>> {
    let LoaderTree {
        page: _,
        segment,
        parallel_routes,
        components,
        global_metadata,
    } = &*loader_tree.await?;

    let parallel_routes = parallel_routes
        .iter()
        .map(|(key, &value)| async move {
            Ok((
                key.clone(),
                prepare_loader_tree_for_js(project_path, value).await?,
            ))
        })
        .try_join()
        .await?
        .into_iter()
        .collect();

    let components = prepare_components_for_js(project_path, *components).await?;

    let global_metadata = global_metadata.await?;

    let mut meta = GlobalMetadataForJs::default();
    add_meta(&mut meta.favicon, project_path, global_metadata.favicon).await?;
    add_meta(&mut meta.manifest, project_path, global_metadata.manifest).await?;
    add_meta(&mut meta.robots, project_path, global_metadata.robots).await?;

    Ok(LoaderTreeForJs {
        segment: segment.clone(),
        parallel_routes,
        components,
        global_metadata: meta,
    }
    .cell())
}

#[turbo_tasks::function]
async fn prepare_entrypoints_for_js(
    project_path: Vc<FileSystemPath>,
    entrypoints: Vc<Entrypoints>,
) -> Result<Vc<EntrypointsForJs>> {
    let entrypoints = entrypoints
        .await?
        .iter()
        .map(|(key, value)| {
            let key = key.to_string();
            async move {
                let value = match *value {
                    Entrypoint::AppPage { loader_tree, .. } => EntrypointForJs::AppPage {
                        loader_tree: prepare_loader_tree_for_js(project_path, loader_tree).await?,
                    },
                    Entrypoint::AppRoute { path, .. } => EntrypointForJs::AppRoute {
                        path: fs_path_to_path(project_path, path).await?,
                    },
                    Entrypoint::AppMetadata { metadata, .. } => EntrypointForJs::AppRoute {
                        path: fs_path_to_path(project_path, metadata.into_path()).await?,
                    },
                };
                Ok((key, value))
            }
        })
        .try_join()
        .await?
        .into_iter()
        .collect();
    Ok(Vc::cell(entrypoints))
}
