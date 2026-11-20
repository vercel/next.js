//! Cached Go syntax queries. Frameworks interpret declarations and generate their own entrypoints.
use std::{io::Read, sync::atomic::Ordering};

use anyhow::{Context, Result, ensure};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    Completion, ResolvedVc, Vc, resolve_strongly_consistent_and_take_and_apply_effects,
};
use turbo_tasks_fs::{
    DiskFileSystem, File, FileContent, FileSystem, FileSystemPath, Permissions, to_sys_path,
};

use crate::{GO_ACTIONS, GoBuildSession, GoSourceSet, process};

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug, Deserialize)]
pub struct GoDeclarations {
    /// All package-level functions, including unexported names such as `main`. Methods are
    /// excluded.
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
    let session_failure = Completion::session_dependent().to_resolved().await?;
    let executable = create_parser_operation(host_session)
        .read_strongly_consistent()
        .await?;
    let path = to_sys_path((*executable).clone())
        .await?
        .context("Go parser requires a disk filesystem")?;
    let go_context = &host_session.await?.go_context;
    let input = serde_json::to_vec(&sources.await?.files)?;
    let report = match go_context
        .run_executable_with_input(&path, &[], Some(&input))
        .await
    {
        Ok(report) => report,
        Err(error) => {
            session_failure.await?;
            return Err(error);
        }
    };
    if !report.status.success() {
        session_failure.await?;
        anyhow::bail!("{}", String::from_utf8_lossy(&report.stderr));
    }
    Ok(serde_json::from_slice::<GoDeclarations>(&report.stdout)?.cell())
}

// Write the cached executable through filesystem effects, then apply them before a query
// runs it. Content addressing lets every source set reuse the same host parser on disk.
#[turbo_tasks::function(operation, root)]
async fn emit_parser_operation(
    host_session: ResolvedVc<GoBuildSession>,
) -> Result<Vc<FileSystemPath>> {
    let executable = parser(*host_session).await?;
    let go_context = &host_session.await?.go_context;
    let mut bytes = Vec::new();
    executable.read().read_to_end(&mut bytes)?;
    let digest = Sha256::digest(&bytes);
    let fs = DiskFileSystem::new(
        rcstr!("Go analysis output"),
        Vc::cell(go_context.cache.clone()),
    );
    let path = fs.root().owned().await?.join(&format!(
        "turbopack-go/parser-{digest:x}{}",
        go_context.exe_suffix
    ))?;
    path.write(FileContent::Content((*executable).clone()).cell())
        .as_side_effect()
        .await?;
    Ok(path.cell())
}

#[turbo_tasks::function(operation, root, session_dependent)]
async fn create_parser_operation(
    host_session: ResolvedVc<GoBuildSession>,
) -> Result<Vc<FileSystemPath>> {
    let path =
        resolve_strongly_consistent_and_take_and_apply_effects(emit_parser_operation(host_session))
            .await?;
    Ok(*path)
}

// Only immutable SDK files and this crate's generated source are compiler inputs. This tool
// does not import application packages or execute application code. One tool serves every
// source set for this host session, independently of its project/module configuration.
#[turbo_tasks::function]
async fn parser(host_session: ResolvedVc<GoBuildSession>) -> Result<Vc<File>> {
    let session_failure = Completion::session_dependent().to_resolved().await?;
    let go_context = &host_session.await?.go_context;
    let _permit = tokio::select! {
        permit = GO_ACTIONS.acquire() => permit?,
        _ = go_context.cancelled() => {
            session_failure.await?;
            anyhow::bail!("Go analysis cancelled");
        },
    };
    let temp = tempfile::Builder::new()
        .prefix("turbopack-go-parser-")
        .tempdir()?;
    let source = temp.path().join("main.go");
    let executable = temp.path().join(format!("parser{}", go_context.exe_suffix));
    std::fs::write(&source, include_str!("declarations.go"))?;
    let mut command = go_context.command(temp.path());
    command
        .env("GO111MODULE", "off")
        .args(["build", "-trimpath", "-o"])
        .arg(&executable)
        .arg(&source);
    go_context
        .cancellation
        .builds
        .fetch_add(1, Ordering::Relaxed);
    let report = match process::output(command, &go_context.cancellation.token).await {
        Ok(report) => report,
        Err(error) => {
            session_failure.await?;
            return Err(error);
        }
    };
    if !report.status.success() {
        session_failure.await?;
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
