use anyhow::Result;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_env::ProcessEnvVc;

/// Loads a series of dotenv files according to the precedence rules set by
/// https://nextjs.org/docs/basic-features/environment-variables#environment-variable-load-order
#[turbo_tasks::function]
pub async fn load_env(project_path: FileSystemPathVc) -> Result<ProcessEnvVc> {
    let node_env = std::env::var("NODE_ENV").unwrap_or_else(|_| "development".into());

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

    let env = files.fold(ProcessEnvVc::from_command_line(), |prior, f| {
        let path = project_path.join(&f);
        ProcessEnvVc::from_dotenv_file(path, Some(prior))
    });

    Ok(env)
}

pub fn filter_for_client(env: ProcessEnvVc) -> ProcessEnvVc {
    ProcessEnvVc::filter(env, "NEXT_PUBLIC_".to_string())
}
