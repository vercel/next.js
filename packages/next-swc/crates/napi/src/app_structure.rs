use std::{collections::HashMap, path::MAIN_SEPARATOR, sync::Arc};

use anyhow::{anyhow, Result};
use napi::{
    bindgen_prelude::External,
    threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode},
    JsFunction,
};
use next_core::app_structure::{
    find_app_dir, get_entrypoints as get_entrypoints_impl, Components, Entrypoint, Entrypoints,
    LoaderTree, MetadataItem, MetadataWithAltItem,
};
use serde::{Deserialize, Serialize};
use turbo_tasks::{ReadRef, Vc};
use turbopack_binding::{
    turbo::{
        tasks::{
            debug::ValueDebugFormat, trace::TraceRawVcs, TryJoinIterExt, TurboTasks, ValueToString,
        },
        tasks_fs::{DiskFileSystem, FileSystem, FileSystemPath},
        tasks_memory::MemoryBackend,
    },
    turbopack::core::PROJECT_FILESYSTEM_NAME,
};

use crate::register;

#[turbo_tasks::function]
async fn project_fs(project_dir: String, watching: bool) -> Result<Vc<Box<dyn FileSystem>>> {
    let disk_fs = DiskFileSystem::new(
        PROJECT_FILESYSTEM_NAME.to_string(),
        project_dir.to_string(),
        vec![],
    );
    if watching {
        disk_fs.await?.start_watching_with_invalidation_reason()?;
    }
    Ok(Vc::upcast(disk_fs))
}

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

#[turbo_tasks::function]
async fn get_value(
    root_dir: String,
    project_dir: String,
    page_extensions: Vec<String>,
    watching: bool,
) -> Result<Vc<OptionEntrypointsForJs>> {
    let page_extensions = Vc::cell(page_extensions);
    let fs = project_fs(root_dir.clone(), watching);
    let project_relative = project_dir.strip_prefix(&root_dir).unwrap();
    let project_relative = project_relative
        .strip_prefix(MAIN_SEPARATOR)
        .unwrap_or(project_relative)
        .replace(MAIN_SEPARATOR, "/");
    let project_path = fs.root().join(project_relative);

    let app_dir = find_app_dir(project_path);

    let result = if let Some(app_dir) = *app_dir.await? {
        let entrypoints = get_entrypoints_impl(app_dir, page_extensions);
        let entrypoints_for_js = prepare_entrypoints_for_js(project_path, entrypoints);

        Some(entrypoints_for_js)
    } else {
        None
    };

    Ok(Vc::cell(result))
}

#[napi]
pub fn stream_entrypoints(
    turbo_tasks: External<Arc<TurboTasks<MemoryBackend>>>,
    root_dir: String,
    project_dir: String,
    page_extensions: Vec<String>,
    func: JsFunction,
) -> napi::Result<()> {
    register();
    let func: ThreadsafeFunction<Option<ReadRef<EntrypointsForJs>>, ErrorStrategy::CalleeHandled> =
        func.create_threadsafe_function(0, |ctx| {
            let value = ctx.value;
            let value = serde_json::to_value(value)?;
            Ok(vec![value])
        })?;
    let root_dir = Arc::new(root_dir);
    let project_dir = Arc::new(project_dir);
    let page_extensions = Arc::new(page_extensions);
    turbo_tasks.spawn_root_task(move || {
        let func: ThreadsafeFunction<Option<ReadRef<EntrypointsForJs>>> = func.clone();
        let project_dir = project_dir.clone();
        let root_dir = root_dir.clone();
        let page_extensions: Arc<Vec<String>> = page_extensions.clone();
        Box::pin(async move {
            if let Some(entrypoints) = &*get_value(
                (*root_dir).clone(),
                (*project_dir).clone(),
                page_extensions.iter().map(|s| s.to_string()).collect(),
                true,
            )
            .await?
            {
                func.call(
                    Ok(Some(entrypoints.await?)),
                    ThreadsafeFunctionCallMode::NonBlocking,
                );
            } else {
                func.call(Ok(None), ThreadsafeFunctionCallMode::NonBlocking);
            }

            Ok::<Vc<()>, _>(Default::default())
        })
    });
    Ok(())
}

#[napi]
pub async fn get_entrypoints(
    turbo_tasks: External<Arc<TurboTasks<MemoryBackend>>>,
    root_dir: String,
    project_dir: String,
    page_extensions: Vec<String>,
) -> napi::Result<serde_json::Value> {
    register();
    let result = turbo_tasks
        .run_once(async move {
            let value = if let Some(entrypoints) = &*get_value(
                root_dir,
                project_dir,
                page_extensions.iter().map(|s| s.to_string()).collect(),
                false,
            )
            .await?
            {
                Some(entrypoints.await?)
            } else {
                None
            };

            let value = serde_json::to_value(value)?;
            Ok(value)
        })
        .await?;
    Ok(result)
}
