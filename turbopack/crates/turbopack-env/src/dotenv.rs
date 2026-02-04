use anyhow::Result;
use turbo_rcstr::rcstr;
use turbo_tasks::{Vc, fxindexmap};
use turbo_tasks_env::{CommandLineProcessEnv, CustomProcessEnv, ProcessEnv};
use turbo_tasks_fs::FileSystemPath;

use crate::TryDotenvProcessEnv;

/// Loads a series of dotenv files according to the precedence rules set by
/// https://nextjs.org/docs/app/building-your-application/configuring/environment-variables#environment-variable-load-order
#[turbo_tasks::function]
pub async fn load_env(project_path: FileSystemPath) -> Result<Vc<Box<dyn ProcessEnv>>> {
    let env: Vc<Box<dyn ProcessEnv>> = Vc::upcast(CommandLineProcessEnv::new());

    let node_env = env.read(rcstr!("NODE_ENV")).owned().await?;
    let node_env = node_env.unwrap_or(rcstr!("development"));

    let env = Vc::upcast(CustomProcessEnv::new(
        env,
        Vc::cell(fxindexmap! {
            rcstr!("NODE_ENV") => node_env.clone(),
        }),
    ));

    let mut files = [
        Some(format!(".env.{node_env}.local").into()),
        if node_env == "test" {
            None
        } else {
            Some(rcstr!(".env.local"))
        },
        Some(format!(".env.{node_env}").into()),
        Some(rcstr!(".env")),
    ]
    .into_iter()
    .flatten();

    let env = files.try_fold(env, |prior, f| {
        let path = project_path.join(&f)?;
        anyhow::Ok(Vc::upcast(TryDotenvProcessEnv::new(prior, path)))
    })?;

    Ok(env)
}
