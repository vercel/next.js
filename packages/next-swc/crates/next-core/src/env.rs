use anyhow::Result;
use turbo_tasks_env::{CommandLineProcessEnvVc, FilterProcessEnvVc, ProcessEnvVc};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_env::TryDotenvProcessEnvVc;

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

pub fn filter_for_client(env: ProcessEnvVc) -> ProcessEnvVc {
    FilterProcessEnvVc::new(env, "NEXT_PUBLIC_".to_string()).into()
}
