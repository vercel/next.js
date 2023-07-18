use anyhow::{bail, Context, Result};
use indexmap::indexmap;
use serde::{Deserialize, Serialize};
use turbo_tasks::{Completion, Completions, TryJoinIterExt, Value, Vc};
use turbo_tasks_bytes::stream::SingleValue;
use turbo_tasks_fs::{
    json::parse_json_with_source_context, File, FileContent, FileSystemEntryType, FileSystemPath,
};
use turbopack_core::{
    asset::{Asset, AssetContent},
    changed::any_content_changed_of_module,
    context::AssetContext,
    file_source::FileSource,
    ident::AssetIdent,
    issue::IssueContextExt,
    module::Module,
    reference_type::{EntryReferenceSubType, InnerAssets, ReferenceType},
    resolve::{find_context_file, FindContextFileResult},
    source::Source,
    source_transform::SourceTransform,
    virtual_source::VirtualSource,
};

use super::util::{emitted_assets_to_virtual_sources, EmittedAsset};
use crate::{
    debug::should_debug, embed_js::embed_file, evaluate::evaluate,
    execution_context::ExecutionContext,
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
fn postcss_configs() -> Vc<Vec<String>> {
    Vc::cell(
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
    evaluate_context: Vc<Box<dyn AssetContext>>,
    execution_context: Vc<ExecutionContext>,
}

#[turbo_tasks::value_impl]
impl PostCssTransform {
    #[turbo_tasks::function]
    pub fn new(
        evaluate_context: Vc<Box<dyn AssetContext>>,
        execution_context: Vc<ExecutionContext>,
    ) -> Vc<Self> {
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
    fn transform(&self, source: Vc<Box<dyn Source>>) -> Vc<Box<dyn Source>> {
        Vc::upcast(
            PostCssTransformedAsset {
                evaluate_context: self.evaluate_context,
                execution_context: self.execution_context,
                source,
            }
            .cell(),
        )
    }
}

#[turbo_tasks::value]
struct PostCssTransformedAsset {
    evaluate_context: Vc<Box<dyn AssetContext>>,
    execution_context: Vc<ExecutionContext>,
    source: Vc<Box<dyn Source>>,
}

#[turbo_tasks::value_impl]
impl Source for PostCssTransformedAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.source.ident()
    }
}

#[turbo_tasks::value_impl]
impl Asset for PostCssTransformedAsset {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        let this = self.await?;
        Ok(self
            .process()
            .issue_context(this.source.ident().path(), "PostCSS processing")
            .await?
            .await?
            .content)
    }
}

#[turbo_tasks::value]
struct ProcessPostCssResult {
    content: Vc<AssetContent>,
    assets: Vec<Vc<VirtualSource>>,
}

#[turbo_tasks::function]
async fn extra_configs(
    context: Vc<Box<dyn AssetContext>>,
    postcss_config_path: Vc<FileSystemPath>,
) -> Result<Vc<Completion>> {
    let config_paths = [postcss_config_path
        .parent()
        .join("tailwind.config.js".to_string())];
    let configs = config_paths
        .into_iter()
        .map(|path| async move {
            Ok(
                matches!(&*path.get_type().await?, FileSystemEntryType::File).then(|| {
                    any_content_changed_of_module(context.process(
                        Vc::upcast(FileSource::new(path)),
                        Value::new(ReferenceType::Internal(InnerAssets::empty())),
                    ))
                }),
            )
        })
        .try_join()
        .await?
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();

    Ok(Vc::<Completions>::cell(configs).completed())
}

#[turbo_tasks::function]
fn postcss_executor(
    context: Vc<Box<dyn AssetContext>>,
    postcss_config_path: Vc<FileSystemPath>,
) -> Vc<Box<dyn Module>> {
    let config_asset = context.process(
        Vc::upcast(FileSource::new(postcss_config_path)),
        Value::new(ReferenceType::Entry(EntryReferenceSubType::Undefined)),
    );

    context.process(
        Vc::upcast(VirtualSource::new(
            postcss_config_path.join("transform.ts".to_string()),
            AssetContent::File(embed_file("transforms/postcss.ts".to_string())).cell(),
        )),
        Value::new(ReferenceType::Internal(Vc::cell(indexmap! {
            "CONFIG".to_string() => config_asset
        }))),
    )
}

#[turbo_tasks::value_impl]
impl PostCssTransformedAsset {
    #[turbo_tasks::function]
    async fn process(self: Vc<Self>) -> Result<Vc<ProcessPostCssResult>> {
        let this = self.await?;
        let find_config_result =
            find_context_file(this.source.ident().path().parent(), postcss_configs());
        let FindContextFileResult::Found(config_path, _) = *find_config_result.await? else {
            return Ok(ProcessPostCssResult {
                content: this.source.content(),
                assets: Vec::new(),
            }
            .cell());
        };

        let ExecutionContext {
            project_path,
            chunking_context,
            env,
        } = *this.execution_context.await?;
        let source_content = this.source.content();
        let AssetContent::File(file) = *source_content.await? else {
            bail!("PostCSS transform only support transforming files");
        };
        let FileContent::Content(content) = &*file.await? else {
            return Ok(ProcessPostCssResult {
                content: AssetContent::File(FileContent::NotFound.cell()).cell(),
                assets: Vec::new(),
            }
            .cell());
        };
        let content = content.content().to_str()?;
        let context = this.evaluate_context;

        // This invalidates the transform when the config changes.
        let extra_configs_changed = extra_configs(context, config_path);

        let postcss_executor = postcss_executor(context, config_path);
        let css_fs_path = this.source.ident().path().await?;
        let css_path = css_fs_path.path.as_str();

        let config_value = evaluate(
            postcss_executor,
            project_path,
            env,
            this.source.ident(),
            context,
            chunking_context,
            None,
            vec![Vc::cell(content.into()), Vc::cell(css_path.into())],
            extra_configs_changed,
            should_debug("postcss_transform"),
        )
        .await?;

        let SingleValue::Single(val) = config_value.try_into_single().await? else {
            // An error happened, which has already been converted into an issue.
            return Ok(ProcessPostCssResult {
                content: AssetContent::File(FileContent::NotFound.cell()).cell(),
                assets: Vec::new(),
            }
            .cell());
        };
        let processed_css: PostCssProcessingResult = parse_json_with_source_context(val.to_str()?)
            .context("Unable to deserializate response from PostCSS transform operation")?;

        // TODO handle SourceMap
        let file = File::from(processed_css.css);
        let assets = emitted_assets_to_virtual_sources(processed_css.assets);
        let content = AssetContent::File(FileContent::Content(file).cell()).cell();
        Ok(ProcessPostCssResult { content, assets }.cell())
    }
}
