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

    map.insert(
        "__NEXT_MANUAL_TRAILING_SLASH".to_string(),
        if next_config.skip_trailing_slash_redirect.unwrap_or(false) {
            "true".to_string()
        } else {
            "false".to_string()
        },
    );

    map.insert(
        "__NEXT_NO_MIDDLEWARE_URL_NORMALIZE".to_string(),
        if next_config.skip_middleware_url_normalize.unwrap_or(false) {
            "true".to_string()
        } else {
            "false".to_string()
        },
    );

    map.insert(
        "__NEXT_EXTERNAL_MIDDLEWARE_REWRITE_RESOLVE".to_string(),
        if next_config
            .experimental
            .external_middleware_rewrites_resolve
            .unwrap_or(false)
        {
            "true".to_string()
        } else {
            "false".to_string()
        },
    );

    map.insert(
        "__NEXT_SCROLL_RESTORATION".to_string(),
        if next_config.experimental.scroll_restoration.unwrap_or(false) {
            "true".to_string()
        } else {
            "false".to_string()
        },
    );

    map.insert(
        "__NEXT_I18N_SUPPORT".to_string(),
        if next_config.i18n.is_none() {
            "false".to_string()
        } else {
            "true".to_string()
        },
    );

    map.insert(
        "__NEXT_I18N_DOMAINS".to_string(),
        // Don't stringify undefined
        match next_config.i18n.as_ref() {
            Some(i18n) => match i18n.domains.as_ref() {
                Some(domains) => serde_json::to_string(domains)?,
                None => "undefined".to_string(),
            },
            None => "undefined".to_string(),
        },
    );

    map.insert(
        "NEXT_MINIMAL".to_string(),
        // Don't stringify undefined
        "\"\"".to_string(),
    );

    map.insert(
        "__NEXT_ACTIONS_DEPLOYMENT_ID".to_string(),
        if next_config
            .experimental
            .use_deployment_id_server_actions
            .unwrap_or(false)
        {
            "true".to_string()
        } else {
            "false".to_string()
        },
    );

    map.insert(
        "NEXT_DEPLOYMENT_ID".to_string(),
        // Don't stringify undefined
        if let Some(deployment_id) = next_config.experimental.deployment_id.as_ref() {
            serde_json::to_string(deployment_id)?
        } else {
            "undefined".to_string()
        },
    );

    map.insert(
        "__NEXT_MANUAL_CLIENT_BASE_PATH".to_string(),
        if next_config
            .experimental
            .manual_client_base_path
            .unwrap_or(false)
        {
            "true".to_string()
        } else {
            "false".to_string()
        },
    );

    map.insert(
        "__NEXT_OPTIMISTIC_CLIENT_CACHE".to_string(),
        if next_config
            .experimental
            .optimistic_client_cache
            .unwrap_or(false)
        {
            "true".to_string()
        } else {
            "false".to_string()
        },
    );

    map.insert(
        "__NEXT_MIDDLEWARE_PREFETCH".to_string(),
        // Don't stringify undefined
        if let Some(middleware_prefetch) = next_config.experimental.middleware_prefetch.as_ref() {
            serde_json::to_string(middleware_prefetch)?
        } else {
            "undefined".to_string()
        },
    );

    // TODO: Implement crossOrigin in Turbopack script injection
    map.insert(
        "__NEXT_CROSS_ORIGIN".to_string(),
        // Don't stringify undefined
        if let Some(cross_origin) = next_config.cross_origin.as_ref() {
            serde_json::to_string(cross_origin)?
        } else {
            "undefined".to_string()
        },
    );

    map.insert(
        "__NEXT_BUILD_INDICATOR".to_string(),
        // Don't stringify undefined
        match next_config.dev_indicators.as_ref() {
            Some(dev_indicators) => match dev_indicators.build_activity.as_ref() {
                Some(build_activity) => serde_json::to_string(build_activity)?,
                None => "false".to_string(),
            },
            None => "false".to_string(),
        },
    );

    map.insert(
        "__NEXT_BUILD_INDICATOR_POSITION".to_string(),
        // Don't stringify undefined
        match next_config.dev_indicators.as_ref() {
            Some(dev_indicators) => match dev_indicators.build_activity_position.as_ref() {
                Some(build_activity_position) => serde_json::to_string(build_activity_position)?,
                None => "undefined".to_string(),
            },
            None => "undefined".to_string(),
        },
    );

    map.insert(
        "__NEXT_OPTIMIZE_FONTS".to_string(),
        if next_config.optimize_fonts.unwrap_or(true) {
            "true".to_string()
        } else {
            "false".to_string()
        },
    );

    map.insert(
        "__NEXT_OPTIMIZE_CSS".to_string(),
        // Don't stringify undefined
        if let Some(optimize_css) = next_config.experimental.optimize_css.as_ref() {
            serde_json::to_string(optimize_css)?
        } else {
            "false".to_string()
        },
    );

    map.insert(
        "__NEXT_SCRIPT_WORKERS".to_string(),
        // TODO: This should be true in production mode
        // if next_config
        //     .experimental
        //     .next_script_workers
        //     .unwrap_or(false)
        // {
        //     "false".to_string()
        // } else {
        //     "false".to_string()
        // },
        "false".to_string(),
    );

    map.insert(
        "__NEXT_CONFIG_OUTPUT".to_string(),
        // Don't stringify undefined
        if let Some(output) = next_config.output.as_ref() {
            serde_json::to_string(output)?
        } else {
            "undefined".to_string()
        },
    );

    map.insert(
        "__NEXT_ANALYTICS_ID".to_string(),
        // Don't stringify undefined
        if let Some(analytics_id) = next_config.analytics_id.as_ref() {
            serde_json::to_string(analytics_id)?
        } else {
            "undefined".to_string()
        },
    );

    map.insert(
        "__NEXT_HAS_WEB_VITALS_ATTRIBUTION".to_string(),
        if next_config.experimental.web_vitals_attribution.is_none() {
            "false".to_string()
        } else {
            "true".to_string()
        },
    );

    map.insert(
        "__NEXT_WEB_VITALS_ATTRIBUTION".to_string(),
        // Don't stringify undefined
        if let Some(web_vitals_attribution) =
            next_config.experimental.web_vitals_attribution.as_ref()
        {
            serde_json::to_string(web_vitals_attribution)?
        } else {
            "undefined".to_string()
        },
    );

    // TODO: Implement
    // map.insert(
    //     "__NEXT_FETCH_CACHE_KEY_PREFIX".to_string(),
    // );

    // TODO: Implement
    // map.insert(
    //     "__NEXT_HAS_REWRITES".to_string(),
    // );

    // TODO: Implement for node server only?
    // map.insert(
    //     "__NEXT_EXPERIMENTAL_REACT".to_string(),
    // );

    if !test_mode.is_empty() {
        map.insert("__NEXT_TEST_MODE".to_string(), "true".to_string());
    }

    Ok(Vc::upcast(CustomProcessEnv::new(env, Vc::cell(map))))
}
