use anyhow::Result;
use indexmap::indexmap;
use turbo_tasks_env::{
    CommandLineProcessEnvVc, CustomProcessEnvVc, EnvMapVc, ProcessEnv, ProcessEnvVc,
};
use turbo_tasks_fs::FileSystemPathVc;

use crate::TryDotenvProcessEnvVc;

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
