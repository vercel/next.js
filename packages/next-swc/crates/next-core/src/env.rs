use anyhow::Result;
use indexmap::indexmap;
use turbo_binding::{
    turbo::{
        tasks_env::{
            CommandLineProcessEnvVc, CustomProcessEnvVc, EnvMapVc, FilterProcessEnvVc, ProcessEnv,
            ProcessEnvVc,
        },
        tasks_fs::FileSystemPathVc,
    },
    turbopack::env::{EmbeddableProcessEnvVc, TryDotenvProcessEnvVc},
};

use crate::next_config::NextConfigVc;

/// Loads a series of dotenv files according to the precedence rules set by
/// https://nextjs.org/docs/basic-features/environment-variables#environment-variable-load-order
#[turbo_tasks::function]
pub async fn load_env(project_path: FileSystemPathVc) -> Result<ProcessEnvVc> {
    let env = CommandLineProcessEnvVc::new().as_process_env();

    let node_env = env.read("NODE_ENV").await?;
    let node_env = node_env.as_deref().unwrap_or("development");

    let env = CustomProcessEnvVc::new(
        env,
        EnvMapVc::cell(indexmap! {
            "NODE_ENV".to_string() => node_env.to_string(),
        }),
    )
    .as_process_env();

    let files = [
        Some(format!(".env.{node_env}.local")),
        if node_env == "test" {
            None
        } else {
            Some(".env.local".into())
        },
        Some(format!(".env.{node_env}")),
        Some(".env".into()),
    ]
    .into_iter()
    .flatten();

    let env = files.fold(env, |prior, f| {
        let path = project_path.join(&f);
        TryDotenvProcessEnvVc::new(prior, path).as_process_env()
    });

    Ok(env)
}

/// Creates a ProcessEnvVc safe to use in JS, by stringifying and encoding as
/// regular JS strings. Setting `client` to true will additionally filter the
/// env to just the keys that are acceptable for the client to access.
///
/// For now, it also injects overridden values as if they were real JS code, eg
/// an Object and not a String.
#[turbo_tasks::function]
pub async fn env_for_js(
    env: ProcessEnvVc,
    client: bool,
    next_config: NextConfigVc,
) -> Result<ProcessEnvVc> {
    let test_mode = env.read("__NEXT_TEST_MODE").await?;
    let test_mode = test_mode.as_deref().unwrap_or("");

    let env = if client {
        FilterProcessEnvVc::new(
            env,
            vec!["NEXT_PUBLIC_".to_string(), "NODE_ENV".to_string()],
        )
        .into()
    } else {
        env
    };

    let env =
        EmbeddableProcessEnvVc::new(CustomProcessEnvVc::new(env, next_config.env()).into()).into();

    let image_config = next_config.image_config().await?;
    let mut map = indexmap! {
        // We need to overload the __NEXT_IMAGE_OPTS to override the default remotePatterns field.
        // This allows us to support loading from remote hostnames until we properly support reading
        // the next.config.js file.
        "__NEXT_IMAGE_OPTS".to_string() => serde_json::to_string(&image_config)?,
    };

    let next_config = next_config.await?;

    if next_config.react_strict_mode.unwrap_or(false) {
        map.insert("__NEXT_STRICT_MODE".to_string(), "true".to_string());
    }

    if next_config.react_strict_mode.unwrap_or(true) {
        map.insert("__NEXT_STRICT_MODE_APP".to_string(), "true".to_string());
    }

    if !test_mode.is_empty() {
        map.insert("__NEXT_TEST_MODE".to_string(), "true".to_string());
    }

    Ok(CustomProcessEnvVc::new(env, EnvMapVc::cell(map)).into())
}
