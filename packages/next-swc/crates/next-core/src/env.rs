use anyhow::Result;
use indexmap::indexmap;
use turbo_tasks::Vc;
use turbopack_binding::{
    turbo::tasks_env::{CustomProcessEnv, EnvMap, FilterProcessEnv, ProcessEnv},
    turbopack::env::EmbeddableProcessEnv,
};

use crate::next_config::NextConfig;

/// Creates a Vc<Box<dyn ProcessEnv>> safe to use in JS, by stringifying and
/// encoding as regular JS strings. Setting `client` to true will additionally
/// filter the env to just the keys that are acceptable for the client to
/// access.
///
/// For now, it also injects overridden values as if they were real JS code, eg
/// an Object and not a String.
#[turbo_tasks::function]
pub async fn env_for_js(
    env: Vc<Box<dyn ProcessEnv>>,
    client: bool,
    next_config: Vc<NextConfig>,
) -> Result<Vc<Box<dyn ProcessEnv>>> {
    let test_mode = env.read("__NEXT_TEST_MODE".to_string()).await?;
    let test_mode = test_mode.as_deref().unwrap_or("");

    let env = if client {
        Vc::upcast(FilterProcessEnv::new(
            env,
            vec![
                "NEXT_PUBLIC_".to_string(),
                "NODE_ENV".to_string(),
                "PORT".to_string(),
            ],
        ))
    } else {
        // Server doesn't need to have env vars injected since it will have them in the
        // real process.env.
        Vc::upcast(EnvMap::empty())
    };

    let env = Vc::upcast(EmbeddableProcessEnv::new(Vc::upcast(
        CustomProcessEnv::new(env, next_config.env()),
    )));

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

    map.insert(
        "__NEXT_STRICT_NEXT_HEAD".to_string(),
        if next_config.experimental.strict_next_head.unwrap_or(false) {
            "true".to_string()
        } else {
            "false".to_string()
        },
    );

    map.insert(
        "__NEXT_TRAILING_SLASH".to_string(),
        if next_config.trailing_slash.unwrap_or(false) {
            "true".to_string()
        } else {
            "false".to_string()
        },
    );

    map.insert(
        "__NEXT_ROUTER_BASEPATH".to_string(),
        // Don't stringify undefined
        if let Some(base_path) = next_config.base_path.as_ref() {
            serde_json::to_string(base_path)?
        } else {
            "undefined".to_string()
        },
    );

    map.insert(
        "__NEXT_ASSET_PREFIX".to_string(),
        // Don't stringify undefined
        if let Some(asset_prefix) = next_config.asset_prefix.as_ref() {
            serde_json::to_string(asset_prefix)?
        } else {
            "undefined".to_string()
        },
    );

    if !test_mode.is_empty() {
        map.insert("__NEXT_TEST_MODE".to_string(), "true".to_string());
    }

    Ok(Vc::upcast(CustomProcessEnv::new(env, Vc::cell(map))))
}
