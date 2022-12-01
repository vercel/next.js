use anyhow::Result;
use indexmap::indexmap;
use serde_json::json;
use turbo_tasks_env::{
    CommandLineProcessEnvVc, CustomProcessEnvVc, EnvMapVc, FilterProcessEnvVc, ProcessEnvVc,
};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_env::{EmbeddableProcessEnvVc, TryDotenvProcessEnvVc};

/// Loads a series of dotenv files according to the precedence rules set by
/// https://nextjs.org/docs/basic-features/environment-variables#environment-variable-load-order
#[turbo_tasks::function]
pub async fn load_env(project_path: FileSystemPathVc) -> Result<ProcessEnvVc> {
    let env = CommandLineProcessEnvVc::new().as_process_env();

    let node_env = env.read("NODE_ENV").await?;
    let node_env = node_env.as_deref().unwrap_or("development");

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
pub fn env_for_js(env: ProcessEnvVc, client: bool) -> ProcessEnvVc {
    let env = if client {
        FilterProcessEnvVc::new(env, "NEXT_PUBLIC_".to_string()).into()
    } else {
        env
    };
    let env = EmbeddableProcessEnvVc::new(env).into();

    CustomProcessEnvVc::new(
        env,
        EnvMapVc::cell(indexmap! {
            // We need to overload the __NEXT_IMAGE_OPTS to override the default remotePatterns field.
            // This allows us to support loading from remote hostnames until we properly support reading
            // the next.config.js file.
            "__NEXT_IMAGE_OPTS".to_string() => json!({
                "deviceSizes": [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
                "imageSizes": [16, 32, 48, 64, 96, 128, 256, 384],
                "path": "/_next/image",
                "loader": "default",
                "domains": [],
                "disableStaticImages": false,
                "minimumCacheTTL": 60,
                "formats": ["image/webp"],
                "dangerouslyAllowSVG": false,
                "contentSecurityPolicy": "script-src 'none'; frame-src 'none'; sandbox;",
                "remotePatterns": [{ "hostname": "**" }],
                "unoptimized": false,
            }).to_string()
        }),
    )
    .into()
}
