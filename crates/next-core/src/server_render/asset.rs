use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
};

use anyhow::{anyhow, Result};
use futures::{stream::FuturesUnordered, TryStreamExt};
use mime::TEXT_HTML_UTF_8;
use turbo_tasks::{
    primitives::StringVc, spawn_blocking, CompletionVc, CompletionsVc, Value, ValueToString,
};
use turbo_tasks_fs::{DiskFileSystemVc, File, FileContent, FileContentVc, FileSystemPathVc};
use turbopack::ecmascript::{
    EcmascriptInputTransform, EcmascriptInputTransformsVc, EcmascriptModuleAssetVc, ModuleAssetType,
};
use turbopack_core::{
    asset::{Asset, AssetVc},
    chunk::{
        dev::{DevChunkingContext, DevChunkingContextVc},
        ChunkGroupVc,
    },
    context::AssetContextVc,
    reference::{AssetReference, AssetReferenceVc, AssetReferencesVc},
    resolve::{ResolveResult, ResolveResultVc},
    wrapper_asset::WrapperAssetVc,
};

use super::{
    nodejs_bootstrap::NodeJsBootstrapAsset,
    nodejs_pool::{NodeJsPool, NodeJsPoolVc},
};
use crate::server_render::issue::RenderingIssue;

/// This is an asset which content is determined by running
/// `React.renderToString` on the default export of [entry_asset] in a Node.js
/// context.
///
/// For that the [entry_asset] is bundled and emitted into
/// [intermediate_output_path] and a pool of Node.js processes is used to run
/// that. [request_data] is passed to the [entry_asset] component as props. When
/// only [path] and [request_data] differs multiple [ServerRenderedAsset]s will
/// share the Node.js worker pool.
#[turbo_tasks::value]
pub struct ServerRenderedAsset {
    path: FileSystemPathVc,
    context: AssetContextVc,
    entry_asset: AssetVc,
    context_path: FileSystemPathVc,
    intermediate_output_path: FileSystemPathVc,
    request_data: String,
}

#[turbo_tasks::value_impl]
impl ServerRenderedAssetVc {
    #[turbo_tasks::function]
    pub fn new(
        path: FileSystemPathVc,
        context: AssetContextVc,
        entry_asset: AssetVc,
        context_path: FileSystemPathVc,
        intermediate_output_path: FileSystemPathVc,
        request_data: String,
    ) -> Self {
        ServerRenderedAsset {
            path,
            context,
            entry_asset,
            context_path,
            intermediate_output_path,
            request_data,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl Asset for ServerRenderedAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.path
    }

    #[turbo_tasks::function]
    fn content(&self) -> FileContentVc {
        render(
            self.path,
            get_renderer_pool(
                get_intermediate_asset(
                    self.context,
                    self.entry_asset,
                    self.context_path,
                    self.intermediate_output_path,
                ),
                self.intermediate_output_path,
            ),
            &self.request_data,
        )
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        Ok(AssetReferencesVc::cell(
            separate_assets(
                get_intermediate_asset(
                    self.context,
                    self.entry_asset,
                    self.context_path,
                    self.intermediate_output_path,
                ),
                self.intermediate_output_path,
            )
            .await?
            .external_asset_entrypoints
            .iter()
            .map(|a| {
                ServerRenderedClientAssetReference { asset: *a }
                    .cell()
                    .into()
            })
            .collect(),
        ))
    }
}

#[turbo_tasks::value]
pub struct ServerRenderedClientAssetReference {
    asset: AssetVc,
}

#[turbo_tasks::value_impl]
impl AssetReference for ServerRenderedClientAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        ResolveResult::Single(self.asset, Vec::new()).into()
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "client asset {}",
            self.asset.path().to_string().await?
        )))
    }
}

#[turbo_tasks::function]
fn get_server_renderer() -> FileContentVc {
    FileContent::Content(File::from_source(
        include_str!("server_renderer.js").to_string(),
    ))
    .cell()
}

#[turbo_tasks::function]
async fn get_intermediate_asset(
    context: AssetContextVc,
    entry_asset: AssetVc,
    context_path: FileSystemPathVc,
    intermediate_output_path: FileSystemPathVc,
) -> Result<AssetVc> {
    let chunking_context: DevChunkingContextVc = DevChunkingContext {
        context_path,
        chunk_root_path: intermediate_output_path.join("chunks"),
        asset_root_path: intermediate_output_path.join("assets"),
        enable_hot_module_replacement: false,
    }
    .into();
    let module = EcmascriptModuleAssetVc::new(
        WrapperAssetVc::new(entry_asset, "server-renderer.js", get_server_renderer()).into(),
        context.with_context_path(entry_asset.path()),
        Value::new(ModuleAssetType::Ecmascript),
        EcmascriptInputTransformsVc::cell(vec![EcmascriptInputTransform::React { refresh: false }]),
        context.environment(),
    );
    let chunk = module.as_evaluated_chunk(chunking_context.into(), None);
    let chunk_group = ChunkGroupVc::from_chunk(chunk);
    Ok(NodeJsBootstrapAsset {
        path: intermediate_output_path.join("index.js"),
        chunk_group,
    }
    .cell()
    .into())
}

#[turbo_tasks::function]
async fn emit(
    intermediate_asset: AssetVc,
    intermediate_output_path: FileSystemPathVc,
) -> Result<CompletionVc> {
    Ok(CompletionsVc::cell(
        separate_assets(intermediate_asset, intermediate_output_path)
            .await?
            .internal_assets
            .iter()
            .map(|a| a.path().write(a.content()))
            .collect(),
    )
    .all())
}

#[turbo_tasks::value]
struct SeparatedAssets {
    internal_assets: HashSet<AssetVc>,
    external_asset_entrypoints: HashSet<AssetVc>,
}

#[turbo_tasks::function]
async fn separate_assets(
    intermediate_asset: AssetVc,
    intermediate_output_path: FileSystemPathVc,
) -> Result<SeparatedAssetsVc> {
    enum Type {
        Internal(AssetVc, Vec<AssetVc>),
        External(AssetVc),
    }
    let intermediate_output_path = intermediate_output_path.await?;
    let mut queue = FuturesUnordered::new();
    let process_asset = |asset: AssetVc| {
        let intermediate_output_path = &intermediate_output_path;
        async move {
            if asset.path().await?.is_inside(intermediate_output_path) {
                let mut assets = Vec::new();
                for reference in asset.references().await?.iter() {
                    for asset in reference.resolve_reference().primary_assets().await?.iter() {
                        assets.push(*asset);
                    }
                }
                Ok::<_, anyhow::Error>(Type::Internal(asset, assets))
            } else {
                Ok(Type::External(asset))
            }
        }
    };
    queue.push(process_asset(intermediate_asset));
    let mut processed = HashSet::new();
    let mut internal_assets = HashSet::new();
    let mut external_asset_entrypoints = HashSet::new();
    while let Some(item) = queue.try_next().await? {
        match item {
            Type::Internal(asset, assets) => {
                internal_assets.insert(asset);
                for asset in assets {
                    if processed.insert(asset) {
                        queue.push(process_asset(asset));
                    }
                }
            }
            Type::External(asset) => {
                // external
                external_asset_entrypoints.insert(asset);
            }
        }
    }
    Ok(SeparatedAssets {
        internal_assets,
        external_asset_entrypoints,
    }
    .cell())
}

#[turbo_tasks::function]
async fn get_renderer_pool(
    intermediate_asset: AssetVc,
    intermediate_output_path: FileSystemPathVc,
) -> Result<NodeJsPoolVc> {
    emit(intermediate_asset, intermediate_output_path).await?;
    let output = intermediate_output_path.await?;
    if let Some(disk) = DiskFileSystemVc::resolve_from(output.fs).await? {
        let dir = PathBuf::from(&disk.await?.root).join(&output.path);
        let entrypoint = dir.join("index.js");
        let pool = NodeJsPool::new(dir, entrypoint, HashMap::new(), 4);
        Ok(pool.cell())
    } else {
        Err(anyhow!("can only render from a disk filesystem"))
    }
}

#[turbo_tasks::function]
async fn render(
    path: FileSystemPathVc,
    renderer_pool: NodeJsPoolVc,
    request_data: &str,
) -> Result<FileContentVc> {
    fn into_result(content: String) -> Result<FileContentVc> {
        Ok(
            FileContent::Content(File::from_source(content).with_content_type(TEXT_HTML_UTF_8))
                .cell(),
        )
    }
    let pool = renderer_pool.await?;
    let mut op = pool.run(request_data.as_bytes()).await?;
    let lines = spawn_blocking(move || {
        let lines = op.read_lines()?;
        drop(op);
        Ok::<_, anyhow::Error>(lines)
    })
    .await?;
    let issue = if let Some(last_line) = lines.last() {
        if let Some(data) = last_line.strip_prefix("RESULT=") {
            let data = json::parse(data)?;
            if let Some(s) = data.as_str() {
                return into_result(s.to_string());
            } else {
                RenderingIssue {
                    context: path,
                    message: StringVc::cell(
                        "Result provided by Node.js rendering process was not a string".to_string(),
                    ),
                    logging: StringVc::cell(lines.join("\n")),
                }
            }
        } else if let Some(data) = last_line.strip_prefix("ERROR=") {
            let data = json::parse(data)?;
            if let Some(s) = data.as_str() {
                RenderingIssue {
                    context: path,
                    message: StringVc::cell(s.to_string()),
                    logging: StringVc::cell(lines[..lines.len() - 1].join("\n")),
                }
            } else {
                RenderingIssue {
                    context: path,
                    message: StringVc::cell(data.to_string()),
                    logging: StringVc::cell(lines[..lines.len() - 1].join("\n")),
                }
            }
        } else {
            RenderingIssue {
                context: path,
                message: StringVc::cell("No result provided by Node.js process".to_string()),
                logging: StringVc::cell(lines.join("\n")),
            }
        }
    } else {
        RenderingIssue {
            context: path,
            message: StringVc::cell("No content received from Node.js process.".to_string()),
            logging: StringVc::cell("".to_string()),
        }
    };

    // Show error page
    // TODO This need to include HMR handler to allow auto refresh
    let result = into_result(format!(
        "Error during rendering:\n{}\n\n{}",
        issue.message.await?,
        issue.logging.await?
    ));

    // Emit an issue for error reporting
    issue.cell().as_issue().emit();

    result
}
