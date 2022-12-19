use std::collections::HashMap;

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    primitives::{JsonValueVc, StringsVc},
    TryJoinIterExt, Value,
};
use turbo_tasks_fs::{rope::Rope, File, FileContent, FileSystemEntryType, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetContent, AssetContentVc, AssetVc},
    context::AssetContextVc,
    reference_type::{EntryReferenceSubType, ReferenceType},
    resolve::{find_context_file, FindContextFileResult},
    source_asset::SourceAssetVc,
    source_transform::{SourceTransform, SourceTransformVc},
    virtual_asset::VirtualAssetVc,
};
use turbopack_ecmascript::{
    chunk::EcmascriptChunkPlaceablesVc, EcmascriptInputTransformsVc, EcmascriptModuleAssetType,
    EcmascriptModuleAssetVc, InnerAssetsVc,
};

use crate::{
    embed_js::embed_file,
    evaluate::{evaluate, JavaScriptValue},
    execution_context::{ExecutionContext, ExecutionContextVc},
};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
#[turbo_tasks::value(transparent, serialization = "custom")]
struct ProcessedCSS {
    css: String,
    map: Option<String>,
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
    async fn content(&self) -> Result<AssetContentVc> {
        let find_config_result = find_context_file(self.source.path().parent(), postcss_configs());
        let FindContextFileResult::Found(config_path, _) = *find_config_result.await? else {
            return Ok(self.source.content())
        };

        let ExecutionContext {
            project_root,
            intermediate_output_path,
        } = *self.execution_context.await?;
        let content = self.source.content().await?;
        let AssetContent::File(file) = *content else {
            bail!("PostCSS transform only support transforming files");
        };
        let FileContent::Content(content) = &*file.await? else {
            return Ok(AssetContent::File(FileContent::NotFound.cell()).cell());
        };
        let content = content.content().to_str()?;
        let context = self.evaluate_context;
        // TODO this is a hack to get these files watched.
        let config_paths = [config_path.parent().join("tailwind.config.js")];
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
                            context.environment(),
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

        let config_asset = context.process(
            SourceAssetVc::new(config_path).into(),
            Value::new(ReferenceType::Entry(EntryReferenceSubType::Undefined)),
        );

        let postcss_executor = EcmascriptModuleAssetVc::new_with_inner_assets(
            VirtualAssetVc::new(
                config_path.join("transform.js"),
                AssetContent::File(embed_file("transforms/postcss.js")).cell(),
            )
            .into(),
            context,
            Value::new(EcmascriptModuleAssetType::Ecmascript),
            EcmascriptInputTransformsVc::cell(Default::default()),
            context.environment(),
            InnerAssetsVc::cell(HashMap::from([("CONFIG".to_string(), config_asset)])),
        );
        let css_fs_path = self.source.path().await?;
        let css_path = css_fs_path.path.as_str();
        let config_value = evaluate(
            project_root,
            postcss_executor.into(),
            project_root,
            context,
            intermediate_output_path,
            Some(EcmascriptChunkPlaceablesVc::cell(configs)),
            vec![
                JsonValueVc::cell(content.into()),
                JsonValueVc::cell(css_path.into()),
            ],
        )
        .await?;
        let JavaScriptValue::Value(val) = &*config_value else {
            bail!("Expected a value from PostCSS transform");
        };
        let processed_css: ProcessedCSS = serde_json::from_reader(val.read())
            .context("Unable to deserializate response from PostCSS transform operation")?;
        let new_content = Rope::from(processed_css.css.clone());
        let file = File::from(new_content);
        // TODO handle SourceMap
        Ok(AssetContent::File(FileContent::Content(file).cell()).cell())
    }
}
