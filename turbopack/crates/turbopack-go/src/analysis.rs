//! Cached Go syntax queries. Frameworks interpret declarations and generate their own entrypoints.
use std::{collections::BTreeMap, sync::atomic::Ordering};

use anyhow::{Context, Result, ensure};
use serde::Deserialize;
use turbo_rcstr::RcStr;
use turbo_tasks::{Completion, ResolvedVc, Vc};
use turbo_tasks_fs::{File, Permissions};

use crate::{GO_ACTIONS, GoBuildSession, GoSourceSet, process};

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug, Deserialize)]
pub struct GoDeclarations {
    pub functions: Vec<RcStr>,
    /// Parsing errors are retained without preventing the compiler from emitting its normal
    /// diagnostics. Callers can still generate an entrypoint from valid declarations.
    pub syntax_errors: Vec<RcStr>,
}

#[turbo_tasks::function]
pub async fn go_declarations(
    sources: ResolvedVc<GoSourceSet>,
    host_session: ResolvedVc<GoBuildSession>,
) -> Result<Vc<GoDeclarations>> {
    Ok(declarations(sources.await?.files.clone(), *host_session))
}

// Identity is source content, not live stamps or the route/directory that requested the query.
#[turbo_tasks::function]
async fn declarations(
    sources: BTreeMap<RcStr, RcStr>,
    host_session: ResolvedVc<GoBuildSession>,
) -> Result<Vc<GoDeclarations>> {
    let executable = parser(*host_session).await?;
    let context = &host_session.await?.go_context;
    let temp = tempfile::Builder::new()
        .prefix("turbopack-go-analysis-")
        .tempdir()?;
    let path = temp.path().join(format!("parser{}", context.exe_suffix));
    std::io::copy(&mut executable.read(), &mut std::fs::File::create(&path)?)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700))?;
    }
    let input = temp.path().join("sources.json");
    std::fs::write(&input, serde_json::to_vec(&sources)?)?;
    let report = match context.run_executable(&path, &[&input]).await {
        Ok(report) => report,
        Err(error) => {
            Completion::session_dependent().await?;
            return Err(error);
        }
    };
    if !report.status.success() {
        Completion::session_dependent().await?;
        anyhow::bail!("{}", String::from_utf8_lossy(&report.stderr));
    }
    Ok(serde_json::from_slice::<GoDeclarations>(&report.stdout)?.cell())
}

// Only immutable SDK files and this crate's generated source are compiler inputs. This tool
// does not import application packages or execute application code. One tool serves every
// source set for this host session, independently of its project/module configuration.
#[turbo_tasks::function]
async fn parser(host_session: ResolvedVc<GoBuildSession>) -> Result<Vc<File>> {
    let context = &host_session.await?.go_context;
    let _permit = tokio::select! {
        permit = GO_ACTIONS.acquire() => permit?,
        _ = context.cancelled() => anyhow::bail!("Go analysis cancelled"),
    };
    let temp = tempfile::Builder::new()
        .prefix("turbopack-go-parser-")
        .tempdir()?;
    let source = temp.path().join("main.go");
    let executable = temp.path().join(format!("parser{}", context.exe_suffix));
    std::fs::write(&source, include_str!("declarations.go"))?;
    let mut command = context.command(temp.path());
    command
        .env("GO111MODULE", "off")
        .args(["build", "-trimpath", "-o"])
        .arg(&executable)
        .arg(&source);
    context.cancellation.builds.fetch_add(1, Ordering::Relaxed);
    let report = match process::output(command, &context.cancellation.token).await {
        Ok(report) => report,
        Err(error) => {
            Completion::session_dependent().await?;
            return Err(error);
        }
    };
    if !report.status.success() {
        Completion::session_dependent().await?;
    }
    ensure!(
        report.status.success(),
        "{}",
        String::from_utf8_lossy(&report.stderr)
    );
    Ok(
        File::from(std::fs::read(executable).context("reading Go analysis tool")?)
            .with_permissions(Permissions::Executable)
            .cell(),
    )
}
