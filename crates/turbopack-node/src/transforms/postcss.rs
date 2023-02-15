use std::collections::HashMap;

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    primitives::{JsonValueVc, StringsVc},
    TryJoinIterExt, Value,
};
use turbo_tasks_fs::{
    json::parse_json_rope_with_source_context, File, FileContent, FileSystemEntryType,
    FileSystemPathVc,
};
use turbopack_core::{
    asset::{Asset, AssetContent, AssetContentVc, AssetVc},
    context::{AssetContext, AssetContextVc},
    reference_type::{EntryReferenceSubType, ReferenceType},
    resolve::{find_context_file, FindContextFileResult},
    source_asset::SourceAssetVc,
    source_transform::{SourceTransform, SourceTransformVc},
    virtual_asset::VirtualAssetVc,
};
use turbopack_ecmascript::{
    chunk::EcmascriptChunkPlaceablesVc, EcmascriptInputTransform, EcmascriptInputTransformsVc,
    EcmascriptModuleAssetType, EcmascriptModuleAssetVc, InnerAssetsVc,
};

use super::util::{emitted_assets_to_virtual_assets, EmittedAsset};
use crate::{
    embed_js::embed_file,
    evaluate::{evaluate, JavaScriptValue},
    execution_context::{ExecutionContext, ExecutionContextVc},
};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
#[turbo_tasks::value(transparent, serialization = "custom")]
struct PostCssProcessingResult {
    css: String,
    map: Option<String>,
    #[turbo_tasks(trace_ignore)]
    assets: Option<Vec<EmittedAsset>>,
}

#[turbo_tasks::function]
fn postcss_configs() -> StringsVc {
    StringsVc::cell(
        [
            ".postcssrc",
            ".postcssrc.json",
            ".postcssrc.yaml",
            ".postcssrc.yml",
            ".postcssrc.js",
            ".postcssrc.mjs",
            ".postcssrc.cjs",
            ".config/postcssrc",
            ".config/postcssrc.json",
            ".config/postcssrc.yaml",
            ".config/postcssrc.yml",
            ".config/postcssrc.js",
            ".config/postcssrc.mjs",
            ".config/postcssrc.cjs",
            "postcss.config.js",
            "postcss.config.mjs",
            "postcss.config.cjs",
        ]
        .into_iter()
        .map(ToOwned::to_owned)
        .collect(),
    )
}

#[turbo_tasks::value]
pub struct PostCssTransform {
    evaluate_context: AssetContextVc,
    execution_context: ExecutionContextVc,
}

#[turbo_tasks::value_impl]
impl PostCssTransformVc {
    #[turbo_tasks::function]
    pub fn new(evaluate_context: AssetContextVc, execution_context: ExecutionContextVc) -> Self {
        PostCssTransform {
            evaluate_context,
            execution_context,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl SourceTransform for PostCssTransform {
    #[turbo_tasks::function]
    fn transform(&self, source: AssetVc) -> AssetVc {
        PostCssTransformedAsset {
            evaluate_context: self.evaluate_context,
            execution_context: self.execution_context,
            source,
        }
        .cell()
        .into()
    }
}

#[turbo_tasks::value]
struct PostCssTransformedAsset {
    evaluate_context: AssetContextVc,
    execution_context: ExecutionContextVc,
    source: AssetVc,
}

#[turbo_tasks::value_impl]
impl Asset for PostCssTransformedAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.source.path()
    }

    #[turbo_tasks::function]
    async fn content(self_vc: PostCssTransformedAssetVc) -> Result<AssetContentVc> {
        Ok(self_vc.process().await?.content)
    }
}

#[turbo_tasks::value]
struct ProcessPostCssResult {
    content: AssetContentVc,
    assets: Vec<VirtualAssetVc>,
}

#[turbo_tasks::function]
async fn extra_configs(
    context: AssetContextVc,
    postcss_config_path: FileSystemPathVc,
) -> Result<EcmascriptChunkPlaceablesVc> {
    let config_paths = [postcss_config_path.parent().join("tailwind.config.js")];
    let configs = config_paths
        .into_iter()
        .map(|path| async move {
            Ok(
                matches!(&*path.get_type().await?, FileSystemEntryType::File).then(|| {
                    EcmascriptModuleAssetVc::new(
                        SourceAssetVc::new(path).into(),
                        context,
                        Value::new(EcmascriptModuleAssetType::Ecmascript),
                        EcmascriptInputTransformsVc::cell(vec![]),
                        context.compile_time_info(),
                    )
                    .as_ecmascript_chunk_placeable()
                }),
            )
        })
        .try_join()
        .await?
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();

    Ok(EcmascriptChunkPlaceablesVc::cell(configs))
}

#[turbo_tasks::function]
fn postcss_executor(context: AssetContextVc, postcss_config_path: FileSystemPathVc) -> AssetVc {
    let config_asset = context.process(
        SourceAssetVc::new(postcss_config_path).into(),
        Value::new(ReferenceType::Entry(EntryReferenceSubType::Undefined)),
    );

    EcmascriptModuleAssetVc::new_with_inner_assets(
        VirtualAssetVc::new(
            postcss_config_path.join("transform.js"),
            AssetContent::File(embed_file("transforms/postcss.ts")).cell(),
        )
        .into(),
        context,
        Value::new(EcmascriptModuleAssetType::Typescript),
        EcmascriptInputTransformsVc::cell(vec![EcmascriptInputTransform::TypeScript]),
        context.compile_time_info(),
        InnerAssetsVc::cell(HashMap::from([("CONFIG".to_string(), config_asset)])),
    )
    .into()
}

#[turbo_tasks::value_impl]
impl PostCssTransformedAssetVc {
    #[turbo_tasks::function]
    async fn process(self) -> Result<ProcessPostCssResultVc> {
        let this = self.await?;
        let find_config_result = find_context_file(this.source.path().parent(), postcss_configs());
        let FindContextFileResult::Found(config_path, _) = *find_config_result.await? else {
            return Ok(ProcessPostCssResult {
                content: this.source.content(),
                assets: Vec::new()
            }.cell())
        };

        let ExecutionContext {
            project_root,
            intermediate_output_path,
        } = *this.execution_context.await?;
        let source_content = this.source.content();
        let AssetContent::File(file) = *source_content.await? else {
            bail!("PostCSS transform only support transforming files");
        };
        let FileContent::Content(content) = &*file.await? else {
            return Ok(ProcessPostCssResult {
                content: AssetContent::File(FileContent::NotFound.cell()).cell(),
                assets: Vec::new()
            }.cell());
        };
        let content = content.content().to_str()?;
        let context = this.evaluate_context;

        // TODO this is a hack to get these files watched.
        let extra_configs = extra_configs(context, config_path);

        let postcss_executor = postcss_executor(context, config_path);
        let css_fs_path = this.source.path().await?;
        let css_path = css_fs_path.path.as_str();
        let config_value = evaluate(
            project_root,
            postcss_executor,
            project_root,
            this.source.path(),
            context,
            intermediate_output_path,
            Some(extra_configs),
            vec![
                JsonValueVc::cell(content.into()),
                JsonValueVc::cell(css_path.into()),
            ],
            /* debug */ false,
        )
        .await?;
        let JavaScriptValue::Value(val) = &*config_value else {
            // An error happened, which has already been converted into an issue.
            return Ok(ProcessPostCssResult {
                content: AssetContent::File(FileContent::NotFound.cell()).cell(),
                assets: Vec::new()
            }.cell());
        };
        let processed_css: PostCssProcessingResult = parse_json_rope_with_source_context(val)
            .context("Unable to deserializate response from PostCSS transform operation")?;
        // TODO handle SourceMap
        let file = File::from(processed_css.css);
        let assets = emitted_assets_to_virtual_assets(processed_css.assets);
        let content = AssetContent::File(FileContent::Content(file).cell()).cell();
        Ok(ProcessPostCssResult { content, assets }.cell())
    }
}
