//! Next-specific native route convention and output. Compilation remains in turbopack-go.
use std::{collections::BTreeMap, io::Read, path::Path};

use anyhow::{Context, Result, bail, ensure};
use async_trait::async_trait;
use next_core::{
    app_structure::FileSystemPathVec,
    next_app::{AppPage, AppPath},
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{Completion, ResolvedVc, Vc, get_invalidator, turbo_tasks};
use turbo_tasks_fs::{
    DirectoryContent, DirectoryEntry, DiskFileSystem, File, FileContent, FileSystemPath,
    to_sys_path,
};
use turbo_tasks_hash::HashAlgorithm;
use turbopack_core::{
    asset::{AssetContent, no_hash_salt},
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, StyledString},
    module_graph::GraphEntries,
    output::OutputAssets,
    virtual_output::VirtualOutputAsset,
};
use turbopack_go::{
    GoBuildContext, GoBuildOutcome, GoBuildSession, filesystem_with_poll_interval,
    go_bundle_with_session,
};

use crate::{
    app::create_app_paths_manifest,
    project::Project,
    route::{Endpoint, EndpointOutput, EndpointOutputPaths, ModuleGraphs},
};

#[turbo_tasks::value(evict = "never", eq = "manual")]
pub(crate) struct GoSessions {
    #[turbo_tasks(debug_ignore, unsafe_ignore)]
    #[bincode(skip)]
    pub go_context: tokio::sync::Mutex<Option<GoBuildContext>>,
    #[turbo_tasks(debug_ignore, unsafe_ignore)]
    #[bincode(skip)]
    pub host_context: tokio::sync::Mutex<Option<GoBuildContext>>,
}
impl PartialEq for GoSessions {
    fn eq(&self, other: &Self) -> bool {
        std::ptr::eq(self, other)
    }
}
impl Eq for GoSessions {}
impl GoSessions {
    pub fn new() -> ResolvedVc<Self> {
        Self {
            go_context: Default::default(),
            host_context: Default::default(),
        }
        .resolved_cell()
    }
}

#[turbo_tasks::value(shared)]
pub struct GoRouteEndpoint {
    pub project: ResolvedVc<Project>,
    pub path: FileSystemPath,
    pub page: AppPage,
}

async fn is_adapter_build(project: ResolvedVc<Project>) -> Result<bool> {
    Ok(project.next_mode().await?.is_production()
        && *project.next_config().is_using_adapter().await?)
}

// Lazily resolve a session toolchain. Go-free projects never execute a Go command.
#[turbo_tasks::function(session_dependent)]
async fn go_build_session(project: ResolvedVc<Project>) -> Result<Vc<GoBuildSession>> {
    let project_value = project.await?;
    let sessions = project_value
        .go_sessions
        .context("native Go compilation is not enabled")?
        .await?;
    let scope = to_sys_path(project.project_root_path().owned().await?)
        .await?
        .context("native Go compilation requires a disk filesystem")?;
    let scope: RcStr = scope.to_str().context("non-UTF8 Go project")?.into();
    let mut session = sessions.go_context.lock().await;
    if let Some(go_context) = &*session {
        return Ok(GoBuildSession::persistent(
            scope,
            go_context.options.clone(),
        ));
    }
    let mut go_context = host_go_build_session(*project).await?.go_context.clone();
    if is_adapter_build(project).await?
        && let Some(target) = std::env::var_os("NEXT_ADAPTER_VERCEL_GO_TARGET")
    {
        let target: serde_json::Value = serde_json::from_str(
            target
                .to_str()
                .context("NEXT_ADAPTER_VERCEL_GO_TARGET must be UTF-8 JSON")?,
        )
        .context("Invalid NEXT_ADAPTER_VERCEL_GO_TARGET JSON")?;
        ensure!(
            target.get("os").and_then(serde_json::Value::as_str) == Some("linux")
                && target
                    .get("architecture")
                    .and_then(serde_json::Value::as_str)
                    == Some("x86_64")
                && target.get("linking").and_then(serde_json::Value::as_str) == Some("static"),
            "NEXT_ADAPTER_VERCEL_GO_TARGET only supports static Linux x86_64 executables"
        );
        go_context.goos = rcstr!("linux");
        go_context.goarch = rcstr!("amd64");
        go_context.exe_suffix = rcstr!("");
    }
    let persistent = GoBuildSession::persistent(scope, go_context.options);
    // The session may have been decoded from the task cache. Its fresh runtime state is the
    // one used by compiler tasks, and must also be the one cancelled during shutdown.
    let go_context = persistent.await?.go_context.clone();
    *session = Some(go_context.clone());
    Ok(persistent)
}

// Source analysis runs on the host even when the route executable targets an adapter platform.
#[turbo_tasks::function(session_dependent)]
async fn host_go_build_session(project: ResolvedVc<Project>) -> Result<Vc<GoBuildSession>> {
    let project_value = project.await?;
    let sessions = project_value
        .go_sessions
        .context("native Go compilation is not enabled")?
        .await?;
    let mut session = sessions.host_context.lock().await;
    let scope = to_sys_path(project.project_root_path().owned().await?)
        .await?
        .context("native Go compilation requires a disk filesystem")?;
    let scope: RcStr = format!("{}:route-methods", scope.display()).into();
    if let Some(context) = &*session {
        return Ok(GoBuildSession::persistent(scope, context.options.clone()));
    }
    let go = std::env::var("TURBOPACK_GO").unwrap_or_else(|_| "go".into());
    let mut context = GoBuildContext::host(Path::new(&go), None, "").await?;
    context.poll_interval_ms = *project.watch_poll_interval_ms().await?;
    let persistent = GoBuildSession::persistent(scope, context.options);
    let context = persistent.await?.go_context.clone();
    if *project.is_watch_enabled().await? {
        filesystem_with_poll_interval(context.module_cache.clone(), context.poll_interval_ms)
            .connect()
            .await?
            .start_watching()
            .await?;
    }
    *session = Some(context);
    Ok(persistent)
}

#[turbo_tasks::value(transparent)]
struct GoRouteMethods(Vec<RcStr>);

// Both the helper executable and its result are persistent tasks. Unchanged routes do not
// spawn analysis processes, and source bytes are read through the project filesystem.
#[turbo_tasks::function]
async fn route_methods(
    root: FileSystemPath,
    directory: FileSystemPath,
    session: ResolvedVc<GoBuildSession>,
    sources: BTreeMap<RcStr, RcStr>,
) -> Result<Vc<GoRouteMethods>> {
    // Keep the generated-only tool in the route directory. The module root may contain
    // output directories hidden by the project's filesystem, which cannot be Go inputs.
    let path = directory.join("zz_next_route_methods.go")?;
    let generated = BTreeMap::from([(
        root.get_path_to(&path)
            .context("Go analysis helper outside module")?
            .into(),
        RcStr::from(include_str!("go_route_methods.go")),
    )]);
    let result = go_bundle_with_session(root, vec![], *session, generated).await?;
    ensure!(
        result.is_current()?,
        "Go analysis inputs changed; retry the request"
    );
    let executable = match &result.outcome {
        GoBuildOutcome::Success(content) => content.await?,
        GoBuildOutcome::Failed(message) => bail!("{message}"),
        GoBuildOutcome::Retry => bail!("Go analysis inputs changed; retry the request"),
        GoBuildOutcome::Cancelled => bail!("Go compilation cancelled"),
    };
    let FileContent::Content(executable) = &*executable else {
        bail!("missing Go analysis executable");
    };
    let context = &session.await?.go_context;
    let temp = tempfile::Builder::new()
        .prefix("next-go-route-methods-")
        .tempdir()?;
    let path = temp.path().join(format!("methods{}", context.exe_suffix));
    std::io::copy(&mut executable.read(), &mut std::fs::File::create(&path)?)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700))?;
    }
    let input = temp.path().join("sources.json");
    std::fs::write(&input, serde_json::to_vec(&sources)?)?;
    let report = context.run_executable(&path, &[&input]).await;
    let report = match report {
        Ok(report) => report,
        Err(error) => {
            Completion::session_dependent().await?;
            return Err(error);
        }
    };
    if !report.status.success() {
        Completion::session_dependent().await?;
        bail!("{}", String::from_utf8_lossy(&report.stderr));
    }
    Ok(GoRouteMethods(serde_json::from_slice(&report.stdout)?).cell())
}

// Method selection and compilation must observe the same source snapshot. In particular, a
// newly added sibling file must not be published with a method table from the old directory.
async fn ensure_route_sources_current(
    root: &FileSystemPath,
    directory: &FileSystemPath,
    sources: &BTreeMap<RcStr, RcStr>,
) -> Result<()> {
    let project = to_sys_path(root.clone())
        .await?
        .context("Go source requires a disk filesystem")?;
    let directory_path = to_sys_path(directory.clone())
        .await?
        .context("Go source requires a disk filesystem")?;
    let mut names = vec![];
    for entry in std::fs::read_dir(&directory_path)? {
        let entry = entry?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.ends_with(".go") && !name.ends_with("_test.go") && entry.file_type()?.is_file() {
            names.push(entry.path());
        }
    }
    let current = names.len() == sources.len()
        && sources.iter().all(|(name, content)| {
            std::fs::read(project.join(name.as_str())).is_ok_and(|live| live == content.as_bytes())
        });
    if !current {
        if let Some(fs) = ResolvedVc::try_downcast_type::<DiskFileSystem>(root.fs) {
            fs.await?.invalidate();
        }
        if let Some(invalidator) = get_invalidator() {
            invalidator.invalidate(&*turbo_tasks());
        }
        bail!("Go route sources changed during method discovery; retry the request");
    }
    Ok(())
}

#[turbo_tasks::value]
struct GoRouteIssue {
    path: FileSystemPath,
    message: RcStr,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for GoRouteIssue {
    fn stage(&self) -> IssueStage {
        IssueStage::CodeGen
    }
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }
    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.path.clone())
    }
    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(rcstr!("Unable to compile route.go")))
    }
    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Text(self.message.clone())))
    }
}

#[turbo_tasks::value_impl]
impl Endpoint for GoRouteEndpoint {
    #[turbo_tasks::function]
    async fn output(self: Vc<Self>) -> Result<Vc<EndpointOutput>> {
        let this = self.await?;
        ensure!(
            *this.project.next_config().go_routes().await?,
            "route.go requires experimental.goRoutes: true"
        );
        let session = go_build_session(*this.project);
        let go_session = session.await?;
        let source_root = this.project.project_root_path().owned().await?;
        let directory = this.path.parent();
        // Named-file mode supports Next's brackets and groups without importing those paths.
        // The route package deliberately uses package main; shared packages retain Go imports.
        let mut module_root = directory.clone();
        loop {
            if module_root.join("go.mod")?.read().await?.is_content() {
                break;
            }
            if module_root == source_root {
                module_root = directory.clone();
                break;
            }
            module_root = module_root.parent();
        }
        let mut sources = BTreeMap::new();
        if let DirectoryContent::Entries(entries) = &*directory.read_dir().await? {
            for (name, entry) in entries {
                if name.ends_with(".go")
                    && !name.ends_with("_test.go")
                    && let DirectoryEntry::File(path) = entry
                {
                    let content = path.read().await?;
                    let FileContent::Content(content) = &*content else {
                        bail!("Go source disappeared during method discovery");
                    };
                    let mut source = String::new();
                    content.read().read_to_string(&mut source)?;
                    sources.insert(
                        RcStr::from(
                            module_root
                                .get_path_to(path)
                                .context("Go source outside module")?,
                        ),
                        RcStr::from(source),
                    );
                }
            }
        }
        let methods = route_methods(
            module_root.clone(),
            directory.clone(),
            host_go_build_session(*this.project),
            sources.clone(),
        )
        .await?;
        ensure_route_sources_current(&module_root, &directory, &sources).await?;
        let declarations = methods
            .iter()
            .map(|method| format!("\t\"{method}\": {method},"))
            .collect::<Vec<_>>()
            .join("\n");
        let dispatch = include_str!("go_route_dispatch.go")
            .replace("\t// __NEXT_GO_ROUTE_METHODS__", &declarations);
        let wrapper = if is_adapter_build(this.project).await? {
            let pathname = AppPath::from(this.page.clone()).to_string();
            let base_path = this.project.next_config().base_path().await?;
            let route_pattern = format!("{}{pathname}", base_path.as_deref().unwrap_or(""));
            include_str!("go_route_adapter_main.go").replace(
                "\"__NEXT_GO_ROUTE_PATTERN__\"",
                &serde_json::to_string(&route_pattern)?,
            )
        } else {
            include_str!("go_route_main.go").to_owned()
        };
        let generated_path = directory.join("zz_next_route_main.go")?;
        let dispatch_path = directory.join("zz_next_route_dispatch.go")?;
        let generated = BTreeMap::from([
            (
                module_root
                    .get_path_to(&generated_path)
                    .context("Go wrapper outside module")?
                    .into(),
                RcStr::from(wrapper),
            ),
            (
                module_root
                    .get_path_to(&dispatch_path)
                    .context("Go dispatch outside module")?
                    .into(),
                RcStr::from(dispatch),
            ),
        ]);
        let files = sources.keys().cloned().collect();
        let result = go_bundle_with_session(module_root.clone(), files, session, generated).await?;
        ensure!(
            result.is_current()?,
            "Go route inputs changed during compilation; retry the request"
        );
        ensure_route_sources_current(&module_root, &directory, &sources).await?;
        let content = match &result.outcome {
            GoBuildOutcome::Success(content) => *content,
            GoBuildOutcome::Failed(message) => {
                GoRouteIssue {
                    path: this.path.clone(),
                    message: message.clone(),
                }
                .resolved_cell()
                .emit();
                return Ok(EndpointOutput {
                    project: this.project,
                    output_assets: OutputAssets::empty().to_resolved().await?,
                    output_paths: EndpointOutputPaths::NativeFailed {
                        build: (*result).clone(),
                    }
                    .resolved_cell(),
                }
                .cell());
            }
            GoBuildOutcome::Retry => {
                bail!("Go inputs changed during compilation; retry the request")
            }
            GoBuildOutcome::Cancelled => bail!("Go compilation cancelled"),
        };
        let hash = AssetContent::file(*content)
            .hash(no_hash_salt(), HashAlgorithm::Xxh3Hash128Hex)
            .await?;
        let original_name = this.page.to_string();
        let entry = format!("app{original_name}.native.json");
        let executable = format!(
            "app{original_name}-{hash}{}",
            go_session.go_context.exe_suffix
        );
        let node_root = this.project.node_root().owned().await?;
        let descriptor = serde_json::json!({ "version": 1, "executable": executable, "goos": go_session.go_context.goos, "goarch": go_session.go_context.goarch });
        let output_root = to_sys_path(node_root.clone())
            .await?
            .context("native Go output requires a disk filesystem")?;
        for path in [
            format!("server/{executable}"),
            format!("server/{entry}"),
            format!("server/{entry}.nft.json"),
            format!("server/app{original_name}/app-paths-manifest.json"),
        ] {
            ensure!(
                !result.is_input(&output_root.join(path))?,
                "native output would overwrite a Go input"
            );
        }
        let descriptor_path = node_root.join(&format!("server/{entry}"))?;
        let executable_path = node_root.join(&format!("server/{executable}"))?;
        let trace = serde_json::json!({ "version": 1, "files": [descriptor_path.parent().get_path_to(&executable_path).context("native executable outside descriptor directory")?] });
        let assets = vec![
            ResolvedVc::upcast(
                VirtualOutputAsset::new(
                    node_root.join(&format!("server/{entry}.nft.json"))?,
                    AssetContent::file(
                        FileContent::Content(File::from(serde_json::to_string(&trace)?)).cell(),
                    ),
                )
                .to_resolved()
                .await?,
            ),
            ResolvedVc::upcast(
                VirtualOutputAsset::new(
                    node_root.join(&format!("server/{executable}"))?,
                    AssetContent::file(*content),
                )
                .to_resolved()
                .await?,
            ),
            ResolvedVc::upcast(
                VirtualOutputAsset::new(
                    node_root.join(&format!("server/{entry}"))?,
                    AssetContent::file(
                        FileContent::Content(File::from(serde_json::to_string(&descriptor)?))
                            .cell(),
                    ),
                )
                .to_resolved()
                .await?,
            ),
            create_app_paths_manifest(node_root, &original_name, entry.into()).await?,
        ];
        // Validate again before these assets are offered to the output writer.
        ensure!(
            result.is_current()?,
            "Go route inputs changed before publication"
        );
        ensure_route_sources_current(&module_root, &directory, &sources).await?;
        Ok(EndpointOutput {
            project: this.project,
            output_assets: Vc::<OutputAssets>::cell(assets).to_resolved().await?,
            output_paths: EndpointOutputPaths::Native {
                executable_path: executable.into(),
                build: (*result).clone(),
            }
            .resolved_cell(),
        }
        .cell())
    }
    #[turbo_tasks::function]
    async fn server_changed(self: Vc<Self>) -> Result<Vc<Completion>> {
        Ok(self
            .await?
            .project
            .server_changed(*self.output().await?.output_assets))
    }
    #[turbo_tasks::function]
    fn client_changed(self: Vc<Self>) -> Vc<Completion> {
        Completion::immutable()
    }
    #[turbo_tasks::function]
    fn entries(self: Vc<Self>) -> Vc<GraphEntries> {
        GraphEntries::empty()
    }
    #[turbo_tasks::function]
    fn module_graphs(self: Vc<Self>) -> Vc<ModuleGraphs> {
        Vc::cell(vec![])
    }
    #[turbo_tasks::function]
    fn project(&self) -> Vc<Project> {
        *self.project
    }
    #[turbo_tasks::function]
    fn traced_files(self: Vc<Self>) -> Vc<FileSystemPathVec> {
        Vc::cell(vec![])
    }
}
