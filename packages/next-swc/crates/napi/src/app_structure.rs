use std::{collections::HashMap, path::MAIN_SEPARATOR, sync::Arc};

use anyhow::{anyhow, Result};
use napi::{
    bindgen_prelude::External,
    threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode},
    JsFunction,
};
use next_core::app_structure::{
    find_app_dir, get_entrypoints as get_entrypoints_impl, Components, ComponentsVc, Entrypoint,
    EntrypointsVc, LoaderTree, LoaderTreeVc,
};
use serde::{Deserialize, Serialize};
use turbo_binding::{
    turbo::{
        tasks,
        tasks::{
            debug::ValueDebugFormat, primitives::StringsVc, trace::TraceRawVcs, NothingVc,
            TryJoinIterExt, TurboTasks, ValueToString,
        },
        tasks_fs::{DiskFileSystemVc, FileSystem, FileSystemPathVc, FileSystemVc},
        tasks_memory::MemoryBackend,
    },
    turbopack::core::PROJECT_FILESYSTEM_NAME,
};

use crate::register;

#[tasks::function]
async fn project_fs(project_dir: &str, watching: bool) -> Result<FileSystemVc> {
    let disk_fs =
        DiskFileSystemVc::new(PROJECT_FILESYSTEM_NAME.to_string(), project_dir.to_string());
    if watching {
        disk_fs.await?.start_watching_with_invalidation_reason()?;
    }
    Ok(disk_fs.into())
}

#[tasks::value]
#[serde(rename_all = "camelCase")]
struct LoaderTreeForJs {
    segment: String,
    parallel_routes: HashMap<String, LoaderTreeForJsReadRef>,
    components: serde_json::Value,
}

#[derive(PartialEq, Eq, Serialize, Deserialize, ValueDebugFormat, TraceRawVcs)]
#[serde(rename_all = "camelCase")]
enum EntrypointForJs {
    AppPage { loader_tree: LoaderTreeForJsReadRef },
    AppRoute { path: String },
}

#[tasks::value(transparent)]
#[serde(rename_all = "camelCase")]
struct EntrypointsForJs(HashMap<String, EntrypointForJs>);

#[tasks::value(transparent)]
struct OptionEntrypointsForJs(Option<EntrypointsForJsVc>);

async fn fs_path_to_path(project_path: FileSystemPathVc, path: FileSystemPathVc) -> Result<String> {
    match project_path.await?.get_path_to(&*path.await?) {
        None => Err(anyhow!(
            "Path {} is not inside of the project path {}",
            path.to_string().await?,
            project_path.to_string().await?
        )),
        Some(p) => Ok(p.to_string()),
    }
}

async fn prepare_components_for_js(
    project_path: FileSystemPathVc,
    components: ComponentsVc,
) -> Result<serde_json::Value> {
    let Components {
        page,
        layout,
        error,
        loading,
        template,
        default,
        route,
        metadata,
    } = &*components.await?;
    let mut map = serde_json::value::Map::new();
    async fn add(
        map: &mut serde_json::value::Map<String, serde_json::Value>,
        project_path: FileSystemPathVc,
        key: &str,
        value: &Option<FileSystemPathVc>,
    ) -> Result<()> {
        if let Some(value) = value {
            map.insert(
                key.to_string(),
                fs_path_to_path(project_path, *value).await?.into(),
            );
        }
        Ok::<_, anyhow::Error>(())
    }
    add(&mut map, project_path, "page", page).await?;
    add(&mut map, project_path, "layout", layout).await?;
    add(&mut map, project_path, "error", error).await?;
    add(&mut map, project_path, "loading", loading).await?;
    add(&mut map, project_path, "template", template).await?;
    add(&mut map, project_path, "default", default).await?;
    add(&mut map, project_path, "route", route).await?;
    let mut meta = serde_json::value::Map::new();
    async fn add_meta(
        meta: &mut serde_json::value::Map<String, serde_json::Value>,
        project_path: FileSystemPathVc,
        key: &str,
        value: &Vec<FileSystemPathVc>,
    ) -> Result<()> {
        if !value.is_empty() {
            meta.insert(
                key.to_string(),
                value
                    .iter()
                    .map(|value| async move {
                        Ok(serde_json::Value::from(
                            fs_path_to_path(project_path, *value).await?,
                        ))
                    })
                    .try_join()
                    .await?
                    .into(),
            );
        }
        Ok::<_, anyhow::Error>(())
    }
    add_meta(&mut meta, project_path, "icon", &metadata.icon).await?;
    add_meta(&mut meta, project_path, "apple", &metadata.apple).await?;
    add_meta(&mut meta, project_path, "twitter", &metadata.twitter).await?;
    add_meta(&mut meta, project_path, "openGraph", &metadata.open_graph).await?;
    add_meta(&mut meta, project_path, "favicon", &metadata.favicon).await?;
    map.insert("metadata".to_string(), meta.into());
    Ok(map.into())
}

#[tasks::function]
async fn prepare_loader_tree_for_js(
    project_path: FileSystemPathVc,
    loader_tree: LoaderTreeVc,
) -> Result<LoaderTreeForJsVc> {
    let LoaderTree {
        segment,
        parallel_routes,
        components,
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
    Ok(LoaderTreeForJs {
        segment: segment.clone(),
        parallel_routes,
        components,
    }
    .cell())
}

#[tasks::function]
async fn prepare_entrypoints_for_js(
    project_path: FileSystemPathVc,
    entrypoints: EntrypointsVc,
) -> Result<EntrypointsForJsVc> {
    let entrypoints = entrypoints
        .await?
        .iter()
        .map(|(key, &value)| {
            let key = key.to_string();
            async move {
                let value = match value {
                    Entrypoint::AppPage { loader_tree } => EntrypointForJs::AppPage {
                        loader_tree: prepare_loader_tree_for_js(project_path, loader_tree).await?,
                    },
                    Entrypoint::AppRoute { path } => EntrypointForJs::AppRoute {
                        path: fs_path_to_path(project_path, path).await?,
                    },
                };
                Ok((key, value))
            }
        })
        .try_join()
        .await?
        .into_iter()
        .collect();
    Ok(EntrypointsForJsVc::cell(entrypoints))
}

#[tasks::function]
async fn get_value(
    root_dir: &str,
    project_dir: &str,
    page_extensions: Vec<String>,
    watching: bool,
) -> Result<OptionEntrypointsForJsVc> {
    let page_extensions = StringsVc::cell(page_extensions);
    let fs = project_fs(root_dir, watching);
    let project_relative = project_dir.strip_prefix(root_dir).unwrap();
    let project_relative = project_relative
        .strip_prefix(MAIN_SEPARATOR)
        .unwrap_or(project_relative)
        .replace(MAIN_SEPARATOR, "/");
    let project_path = fs.root().join(&project_relative);

    let app_dir = find_app_dir(project_path);

    let result = if let Some(app_dir) = *app_dir.await? {
        let entrypoints = get_entrypoints_impl(app_dir, page_extensions);
        let entrypoints_for_js = prepare_entrypoints_for_js(project_path, entrypoints);

        Some(entrypoints_for_js)
    } else {
        None
    };

    Ok(OptionEntrypointsForJsVc::cell(result))
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
    let func: ThreadsafeFunction<Option<EntrypointsForJsReadRef>, ErrorStrategy::CalleeHandled> =
        func.create_threadsafe_function(0, |ctx| {
            let value = ctx.value;
            let value = serde_json::to_value(value)?;
            Ok(vec![value])
        })?;
    let root_dir = Arc::new(root_dir);
    let project_dir = Arc::new(project_dir);
    let page_extensions = Arc::new(page_extensions);
    turbo_tasks.spawn_root_task(move || {
        let func = func.clone();
        let project_dir = project_dir.clone();
        let root_dir = root_dir.clone();
        let page_extensions = page_extensions.clone();
        Box::pin(async move {
            if let Some(entrypoints) = &*get_value(
                &root_dir,
                &project_dir,
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

            Ok(NothingVc::new().into())
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
                &root_dir,
                &project_dir,
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
