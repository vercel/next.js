//! Next-specific native route convention and output. Compilation remains in turbopack-go.
use std::collections::BTreeMap;

use anyhow::{Context, Result, bail, ensure};
use async_trait::async_trait;
use next_core::{
    app_structure::FileSystemPathVec,
    next_app::{AppPage, AppPath},
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{Completion, ResolvedVc, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath, to_sys_path};
use turbo_tasks_hash::HashAlgorithm;
use turbopack_core::{
    asset::{AssetContent, no_hash_salt},
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, StyledString},
    module_graph::GraphEntries,
    output::OutputAssets,
    virtual_output::VirtualOutputAsset,
};
pub(crate) use turbopack_go::GoSessionPool as GoSessions;
use turbopack_go::{
    GoBuildOutcome, GoBuildSession, GoSessionPool, GoSourceSelection, GoTarget, GoToolchainOptions,
    go_bundle_from_sources, go_declarations, go_source_set,
};

use crate::{
    app::{AppProject, create_app_paths_manifest},
    project::Project,
    route::{Endpoint, EndpointOutput, EndpointOutputPaths, ModuleGraphs},
};

#[turbo_tasks::value(shared)]
pub struct GoRouteEndpoint {
    pub app_project: ResolvedVc<AppProject>,
    pub path: FileSystemPath,
    pub page: AppPage,
}

async fn is_adapter_build(project: ResolvedVc<Project>) -> Result<bool> {
    Ok(project.next_mode().await?.is_production()
        && *project.next_config().is_using_adapter().await?)
}

// The owner probes lazily and retains restored cancellation handles. Framework inputs
// are translated here; compiler lifecycle and target invariants belong to turbopack-go.
#[turbo_tasks::function(session_dependent)]
async fn managed_session(
    scope: RcStr,
    owner: ResolvedVc<GoSessionPool>,
    options: GoToolchainOptions,
    target: Option<GoTarget>,
    watch: bool,
) -> Result<Vc<GoBuildSession>> {
    Ok(*owner.await?.session(scope, options, target, watch).await?)
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
        let project = this.app_project.project().to_resolved().await?;
        ensure!(
            *project.next_config().go_routes().await?,
            "route.go requires experimental.goRoutes: true"
        );
        let source_root = project.project_root_path().owned().await?;
        let directory = this.path.parent();
        let owner = project
            .await?
            .go_sessions
            .context("native Go compilation is not enabled")?;
        let scope = to_sys_path(source_root.clone())
            .await?
            .context("native Go compilation requires a disk filesystem")?;
        let scope: RcStr = scope.to_str().context("non-UTF8 Go project")?.into();
        let options = GoToolchainOptions {
            go: std::env::var("TURBOPACK_GO")
                .unwrap_or_else(|_| "go".into())
                .into(),
            tags: rcstr!(""),
            poll_interval_ms: *project.watch_poll_interval_ms().await?,
        };
        let watch = *project.is_watch_enabled().await?;
        let host = managed_session(scope.clone(), *owner, options.clone(), None, watch);
        let target = if is_adapter_build(project).await? {
            match &*project.next_config().adapter_go_target().await? {
                Some(target) => Some(GoTarget::new(target.os.clone(), target.arch.clone())?),
                None => None,
            }
        } else {
            None
        };
        let session = managed_session(scope, *owner, options, target, watch);
        let go_session = session.await?;
        let sources = go_source_set(
            source_root,
            directory.clone(),
            GoSourceSelection::Directory,
            host,
        )
        .to_resolved()
        .await?;
        let module_root = sources.await?.root.clone();
        let analysis = go_declarations(*sources, host).await?;
        let methods = analysis.functions.iter().filter(|name| {
            matches!(
                name.as_str(),
                "GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS"
            )
        });
        let declarations = methods
            .map(|method| format!("\t\"{method}\": {method},"))
            .collect::<Vec<_>>()
            .join("\n");
        let dispatch = include_str!("go_route_dispatch.go")
            .replace("\t// __NEXT_GO_ROUTE_METHODS__", &declarations);
        // Adapter builds emit an independent PORT-based HTTP server for one route, with
        // URL matching and parameter extraction owned by that executable. Development
        // and self-hosted builds emit a private worker: Next.js has already routed the
        // request and supplies its parameters, authentication token, and lifetime pipe.
        let wrapper = if is_adapter_build(project).await? {
            let pathname = AppPath::from(this.page.clone()).to_string();
            let base_path = project.next_config().base_path().await?;
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
        let result = go_bundle_from_sources(*sources, session, generated).await?;
        ensure!(
            result.is_current().await?,
            "Go route inputs changed during compilation; retry the request"
        );
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
                    project,
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
        let node_root = project.node_root().owned().await?;
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
            result.is_current().await?,
            "Go route inputs changed before publication"
        );
        Ok(EndpointOutput {
            project,
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
            .project()
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
        self.app_project.project()
    }
    #[turbo_tasks::function]
    fn traced_files(self: Vc<Self>) -> Vc<FileSystemPathVec> {
        Vc::cell(vec![])
    }
}
