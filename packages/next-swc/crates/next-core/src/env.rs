use anyhow::Result;
use indexmap::indexmap;
use turbopack_binding::{
    turbo::tasks_env::{
        CustomProcessEnvVc, EnvMapVc, FilterProcessEnvVc, ProcessEnvVc,
    },
    turbopack::env::EmbeddableProcessEnvVc,
};

use crate::next_config::NextConfigVc;

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
    let env = if client {
        FilterProcessEnvVc::new(
            env,
            vec![
                "__NEXT_".to_string(),
                "NEXT_PUBLIC_".to_string(),
                "NODE_ENV".to_string(),
                "PORT".to_string(),
            ],
        )
        .into()
    } else {
        // Server doesn't need to have env vars injected since it will have them in the
        // real process.env.
        EnvMapVc::cell(Default::default()).into()
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

    Ok(CustomProcessEnvVc::new(env, EnvMapVc::cell(map)).into())
}
