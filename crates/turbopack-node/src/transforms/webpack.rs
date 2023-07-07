use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::json;
use turbo_tasks::{primitives::JsonValueVc, trace::TraceRawVcs, CompletionVc, Value};
use turbo_tasks_bytes::stream::SingleValue;
use turbo_tasks_fs::{json::parse_json_with_source_context, File, FileContent};
use turbopack_core::{
    asset::{Asset, AssetContent, AssetContentVc, AssetVc},
    context::{AssetContext, AssetContextVc},
    ident::AssetIdentVc,
    reference_type::{InnerAssetsVc, ReferenceType},
    source_asset::SourceAssetVc,
    source_transform::{SourceTransform, SourceTransformVc},
    virtual_asset::VirtualAssetVc,
};

use super::util::{emitted_assets_to_virtual_assets, EmittedAsset};
use crate::{
    debug::should_debug,
    embed_js::embed_file_path,
    evaluate::evaluate,
    execution_context::{ExecutionContext, ExecutionContextVc},
};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
#[turbo_tasks::value(transparent, serialization = "custom")]
struct WebpackLoadersProcessingResult {
    source: String,
    map: Option<String>,
    #[turbo_tasks(trace_ignore)]
    assets: Option<Vec<EmittedAsset>>,
}

#[derive(Clone, PartialEq, Eq, Debug, TraceRawVcs, Serialize, Deserialize)]
pub struct WebpackLoaderItem {
    pub loader: String,
    #[turbo_tasks(trace_ignore)]
    pub options: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone)]
#[turbo_tasks::value(shared, transparent)]
pub struct WebpackLoaderItems(pub Vec<WebpackLoaderItem>);

#[turbo_tasks::value]
pub struct WebpackLoaders {
    evaluate_context: AssetContextVc,
    execution_context: ExecutionContextVc,
    loaders: WebpackLoaderItemsVc,
    rename_as: Option<String>,
}

#[turbo_tasks::value_impl]
impl WebpackLoadersVc {
    #[turbo_tasks::function]
    pub fn new(
        evaluate_context: AssetContextVc,
        execution_context: ExecutionContextVc,
        loaders: WebpackLoaderItemsVc,
        rename_as: Option<String>,
    ) -> Self {
        WebpackLoaders {
            evaluate_context,
            execution_context,
            loaders,
            rename_as,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl SourceTransform for WebpackLoaders {
    #[turbo_tasks::function]
    fn transform(self_vc: WebpackLoadersVc, source: AssetVc) -> AssetVc {
        WebpackLoadersProcessedAsset {
            transform: self_vc,
            source,
        }
        .cell()
        .into()
    }
}

#[turbo_tasks::value]
struct WebpackLoadersProcessedAsset {
    transform: WebpackLoadersVc,
    source: AssetVc,
}

#[turbo_tasks::value_impl]
impl Asset for WebpackLoadersProcessedAsset {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<AssetIdentVc> {
        Ok(
            if let Some(rename_as) = self.transform.await?.rename_as.as_deref() {
                self.source.ident().rename_as(rename_as)
            } else {
                self.source.ident()
            },
        )
    }

    #[turbo_tasks::function]
    async fn content(self_vc: WebpackLoadersProcessedAssetVc) -> Result<AssetContentVc> {
        Ok(self_vc.process().await?.content)
    }
}

#[turbo_tasks::value]
struct ProcessWebpackLoadersResult {
    content: AssetContentVc,
    assets: Vec<VirtualAssetVc>,
}

#[turbo_tasks::function]
fn webpack_loaders_executor(context: AssetContextVc) -> AssetVc {
    context.process(
        SourceAssetVc::new(embed_file_path("transforms/webpack-loaders.ts")).into(),
        Value::new(ReferenceType::Internal(InnerAssetsVc::empty())),
    )
}

#[turbo_tasks::value_impl]
impl WebpackLoadersProcessedAssetVc {
    #[turbo_tasks::function]
    async fn process(self) -> Result<ProcessWebpackLoadersResultVc> {
        let this = self.await?;
        let transform = this.transform.await?;

        let ExecutionContext {
            project_path,
            chunking_context,
            env,
        } = *transform.execution_context.await?;
        let source_content = this.source.content();
        let AssetContent::File(file) = *source_content.await? else {
            bail!("Webpack Loaders transform only support transforming files");
        };
        let FileContent::Content(content) = &*file.await? else {
            return Ok(ProcessWebpackLoadersResult {
                content: AssetContent::File(FileContent::NotFound.cell()).cell(),
                assets: Vec::new(),
            }
            .cell());
        };
        let content = content.content().to_str()?;
        let context = transform.evaluate_context;

        let webpack_loaders_executor = webpack_loaders_executor(context);
        let resource_fs_path = this.source.ident().path().await?;
        let resource_path = resource_fs_path.path.as_str();
        let loaders = transform.loaders.await?;
        let config_value = evaluate(
            webpack_loaders_executor,
            project_path,
            env,
            this.source.ident(),
            context,
            chunking_context,
            None,
            vec![
                JsonValueVc::cell(content.into()),
                JsonValueVc::cell(resource_path.into()),
                JsonValueVc::cell(json!(*loaders)),
            ],
            CompletionVc::immutable(),
            should_debug("webpack_loader"),
        )
        .await?;

        let SingleValue::Single(val) = config_value.try_into_single().await? else {
            // An error happened, which has already been converted into an issue.
            return Ok(ProcessWebpackLoadersResult {
                content: AssetContent::File(FileContent::NotFound.cell()).cell(),
                assets: Vec::new(),
            }
            .cell());
        };
        let processed: WebpackLoadersProcessingResult = parse_json_with_source_context(
            val.to_str()?,
        )
        .context("Unable to deserializate response from webpack loaders transform operation")?;

        // TODO handle SourceMap
        let file = File::from(processed.source);
        let assets = emitted_assets_to_virtual_assets(processed.assets);
        let content = AssetContent::File(FileContent::Content(file).cell()).cell();
        Ok(ProcessWebpackLoadersResult { content, assets }.cell())
    }
}
