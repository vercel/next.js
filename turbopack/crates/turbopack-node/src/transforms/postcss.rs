use anyhow::{bail, Context, Result};
use indoc::formatdoc;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    fxindexmap, trace::TraceRawVcs, Completion, Completions, ResolvedVc, TaskInput,
    TryFlatJoinIterExt, Value, Vc,
};
use turbo_tasks_bytes::stream::SingleValue;
use turbo_tasks_fs::{
    json::parse_json_with_source_context, File, FileContent, FileSystemEntryType, FileSystemPath,
};
use turbopack_core::{
    asset::{Asset, AssetContent},
    changed::any_content_changed_of_module,
    context::{AssetContext, ProcessResult},
    file_source::FileSource,
    ident::AssetIdent,
    issue::{
        Issue, IssueDescriptionExt, IssueSeverity, IssueStage, OptionStyledString, StyledString,
    },
    reference_type::{EntryReferenceSubType, InnerAssets, ReferenceType},
    resolve::{find_context_file_or_package_key, options::ImportMapping, FindContextFileResult},
    source::Source,
    source_map::{GenerateSourceMap, OptionSourceMap},
    source_transform::SourceTransform,
    virtual_source::VirtualSource,
};

use super::{
    util::{emitted_assets_to_virtual_sources, EmittedAsset},
    webpack::WebpackLoaderContext,
};
use crate::{
    embed_js::embed_file, execution_context::ExecutionContext,
    transforms::webpack::evaluate_webpack_loader,
};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
#[turbo_tasks::value(serialization = "custom")]
struct PostCssProcessingResult {
    css: String,
    map: Option<String>,
    #[turbo_tasks(trace_ignore)]
    assets: Option<Vec<EmittedAsset>>,
}

#[derive(
    Default, Copy, Clone, PartialEq, Eq, Hash, Debug, TraceRawVcs, Serialize, Deserialize, TaskInput,
)]
pub enum PostCssConfigLocation {
    #[default]
    ProjectPath,
    ProjectPathOrLocalPath,
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Default)]
pub struct PostCssTransformOptions {
    pub postcss_package: Option<ResolvedVc<ImportMapping>>,
    pub config_location: PostCssConfigLocation,
    pub placeholder_for_future_extensions: u8,
}

#[turbo_tasks::function]
fn postcss_configs() -> Vc<Vec<RcStr>> {
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
            "postcss.config.json",
        ]
        .into_iter()
        .map(RcStr::from)
        .collect(),
    )
}

#[turbo_tasks::value]
pub struct PostCssTransform {
    evaluate_context: ResolvedVc<Box<dyn AssetContext>>,
    execution_context: ResolvedVc<ExecutionContext>,
    config_location: PostCssConfigLocation,
}

#[turbo_tasks::value_impl]
impl PostCssTransform {
    #[turbo_tasks::function]
    pub fn new(
        evaluate_context: ResolvedVc<Box<dyn AssetContext>>,
        execution_context: ResolvedVc<ExecutionContext>,
        config_location: PostCssConfigLocation,
    ) -> Vc<Self> {
        PostCssTransform {
            evaluate_context,
            execution_context,
            config_location,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl SourceTransform for PostCssTransform {
    #[turbo_tasks::function]
    fn transform(&self, source: ResolvedVc<Box<dyn Source>>) -> Vc<Box<dyn Source>> {
        Vc::upcast(
            PostCssTransformedAsset {
                evaluate_context: self.evaluate_context,
                execution_context: self.execution_context,
                config_location: self.config_location,
                source,
            }
            .cell(),
        )
    }
}

#[turbo_tasks::value]
struct PostCssTransformedAsset {
    evaluate_context: ResolvedVc<Box<dyn AssetContext>>,
    execution_context: ResolvedVc<ExecutionContext>,
    config_location: PostCssConfigLocation,
    source: ResolvedVc<Box<dyn Source>>,
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
        Ok(*self
            .process()
            .issue_file_path(this.source.ident().path(), "PostCSS processing")
            .await?
            .await?
            .content)
    }
}

#[turbo_tasks::value]
struct ProcessPostCssResult {
    content: ResolvedVc<AssetContent>,
    assets: Vec<ResolvedVc<VirtualSource>>,
}

#[turbo_tasks::function]
async fn config_changed(
    asset_context: Vc<Box<dyn AssetContext>>,
    postcss_config_path: Vc<FileSystemPath>,
) -> Result<Vc<Completion>> {
    let config_asset = asset_context
        .process(
            Vc::upcast(FileSource::new(postcss_config_path)),
            Value::new(ReferenceType::Internal(
                InnerAssets::empty().to_resolved().await?,
            )),
        )
        .module();

    Ok(Vc::<Completions>::cell(vec![
        any_content_changed_of_module(config_asset)
            .to_resolved()
            .await?,
        extra_configs_changed(asset_context, postcss_config_path)
            .to_resolved()
            .await?,
    ])
    .completed())
}

#[turbo_tasks::function]
async fn extra_configs_changed(
    asset_context: Vc<Box<dyn AssetContext>>,
    postcss_config_path: Vc<FileSystemPath>,
) -> Result<Vc<Completion>> {
    let parent_path = postcss_config_path.parent();

    let config_paths = [
        parent_path.join("tailwind.config.js".into()),
        parent_path.join("tailwind.config.mjs".into()),
        parent_path.join("tailwind.config.ts".into()),
    ];

    let configs = config_paths
        .into_iter()
        .map(|path| async move {
            Ok(
                if matches!(&*path.get_type().await?, FileSystemEntryType::File) {
                    match asset_context
                        .process(
                            Vc::upcast(FileSource::new(path)),
                            Value::new(ReferenceType::Internal(
                                InnerAssets::empty().to_resolved().await?,
                            )),
                        )
                        .try_into_module()
                        .await?
                    {
                        Some(module) => {
                            Some(any_content_changed_of_module(module).to_resolved().await?)
                        }
                        None => None,
                    }
                } else {
                    None
                },
            )
        })
        .try_flat_join()
        .await?;

    Ok(Vc::<Completions>::cell(configs).completed())
}

#[turbo_tasks::value]
pub struct JsonSource {
    pub path: ResolvedVc<FileSystemPath>,
    pub key: ResolvedVc<Option<RcStr>>,
    pub allow_json5: bool,
}

#[turbo_tasks::value_impl]
impl JsonSource {
    #[turbo_tasks::function]
    pub fn new(
        path: ResolvedVc<FileSystemPath>,
        key: ResolvedVc<Option<RcStr>>,
        allow_json5: bool,
    ) -> Vc<Self> {
        JsonSource {
            path,
            key,
            allow_json5,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl Source for JsonSource {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        match &*self.key.await? {
            Some(key) => Ok(AssetIdent::from_path(
                self.path
                    .append(".".into())
                    .append(key.clone())
                    .append(".json".into()),
            )),
            None => Ok(AssetIdent::from_path(self.path.append(".json".into()))),
        }
    }
}

#[turbo_tasks::value_impl]
impl Asset for JsonSource {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        let file_type = &*self.path.get_type().await?;
        match file_type {
            FileSystemEntryType::File => {
                let json = if self.allow_json5 {
                    self.path.read_json5().content().await?
                } else {
                    self.path.read_json().content().await?
                };
                let value = match &*self.key.await? {
                    Some(key) => {
                        let Some(value) = json.get(&**key) else {
                            anyhow::bail!("Invalid file type {:?}", file_type)
                        };
                        value
                    }
                    None => &*json,
                };
                Ok(AssetContent::file(File::from(value.to_string()).into()))
            }
            FileSystemEntryType::NotFound => {
                Ok(AssetContent::File(FileContent::NotFound.resolved_cell()).cell())
            }
            _ => Err(anyhow::anyhow!("Invalid file type {:?}", file_type)),
        }
    }
}

#[turbo_tasks::function]
pub(crate) async fn config_loader_source(
    project_path: Vc<FileSystemPath>,
    postcss_config_path: Vc<FileSystemPath>,
) -> Result<Vc<Box<dyn Source>>> {
    let postcss_config_path_value = &*postcss_config_path.await?;
    let postcss_config_path_filename = postcss_config_path_value.file_name();

    if postcss_config_path_filename == "package.json" {
        return Ok(Vc::upcast(JsonSource::new(
            postcss_config_path,
            Vc::cell(Some("postcss".into())),
            false,
        )));
    }

    if postcss_config_path_value.path.ends_with(".json")
        || postcss_config_path_filename == ".postcssrc"
    {
        return Ok(Vc::upcast(JsonSource::new(
            postcss_config_path,
            Vc::cell(None),
            true,
        )));
    }

    // We can only load js files with `import()`.
    if !postcss_config_path_value.path.ends_with(".js") {
        return Ok(Vc::upcast(FileSource::new(postcss_config_path)));
    }

    let Some(config_path) = project_path
        .await?
        .get_relative_path_to(postcss_config_path_value)
    else {
        bail!("Unable to get relative path to postcss config");
    };

    // We don't want to bundle the config file, so we load it with `import()`.
    // Bundling would break the ability to use `require.resolve` in the config file.
    let code = formatdoc! {
        r#"
            import {{ pathToFileURL }} from 'node:url';
            import path from 'node:path';

            const configPath = path.join(process.cwd(), {config_path});
            // Absolute paths don't work with ESM imports on Windows:
            // https://github.com/nodejs/node/issues/31710
            // convert it to a file:// URL, which works on all platforms
            const configUrl = pathToFileURL(configPath).toString();
            const mod = await __turbopack_external_import__(configUrl);

            export default mod.default ?? mod;
        "#,
        config_path = serde_json::to_string(&config_path).expect("a string should be serializable"),
    };

    Ok(Vc::upcast(VirtualSource::new(
        postcss_config_path.append("_.loader.mjs".into()),
        AssetContent::file(File::from(code).into()),
    )))
}

#[turbo_tasks::function]
async fn postcss_executor(
    asset_context: Vc<Box<dyn AssetContext>>,
    project_path: Vc<FileSystemPath>,
    postcss_config_path: Vc<FileSystemPath>,
) -> Result<Vc<ProcessResult>> {
    let config_asset = asset_context
        .process(
            config_loader_source(project_path, postcss_config_path),
            Value::new(ReferenceType::Entry(EntryReferenceSubType::Undefined)),
        )
        .module()
        .to_resolved()
        .await?;

    Ok(asset_context.process(
        Vc::upcast(VirtualSource::new(
            postcss_config_path.join("transform.ts".into()),
            AssetContent::File(
                embed_file("transforms/postcss.ts".into())
                    .to_resolved()
                    .await?,
            )
            .cell(),
        )),
        Value::new(ReferenceType::Internal(ResolvedVc::cell(fxindexmap! {
            "CONFIG".into() => config_asset
        }))),
    ))
}

async fn find_config_in_location(
    project_path: Vc<FileSystemPath>,
    location: PostCssConfigLocation,
    source: Vc<Box<dyn Source>>,
) -> Result<Option<Vc<FileSystemPath>>> {
    if let FindContextFileResult::Found(config_path, _) = *find_context_file_or_package_key(
        project_path,
        postcss_configs(),
        Value::new("postcss".into()),
    )
    .await?
    {
        return Ok(Some(*config_path));
    }

    if matches!(location, PostCssConfigLocation::ProjectPathOrLocalPath) {
        if let FindContextFileResult::Found(config_path, _) = *find_context_file_or_package_key(
            source.ident().path().parent(),
            postcss_configs(),
            Value::new("postcss".into()),
        )
        .await?
        {
            return Ok(Some(*config_path));
        }
    }

    Ok(None)
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for PostCssTransformedAsset {
    #[turbo_tasks::function]
    async fn generate_source_map(&self) -> Result<Vc<OptionSourceMap>> {
        let source = Vc::try_resolve_sidecast::<Box<dyn GenerateSourceMap>>(*self.source).await?;
        match source {
            Some(source) => Ok(source.generate_source_map()),
            None => Ok(Vc::cell(None)),
        }
    }
}

#[turbo_tasks::value_impl]
impl PostCssTransformedAsset {
    #[turbo_tasks::function]
    async fn process(&self) -> Result<Vc<ProcessPostCssResult>> {
        let ExecutionContext {
            project_path,
            chunking_context,
            env,
        } = &*self.execution_context.await?;

        // For this postcss transform, there is no gaurantee that looking up for the
        // source path will arrives specific project config for the postcss.
        // i.e, this is possible
        // - root
        //  - node_modules
        //     - somepkg/(some.module.css, postcss.config.js) // this could be symlinked local, or
        //       actual remote pkg or anything
        //  - packages // root of workspace pkgs
        //     - pkg1/(postcss.config.js) // The actual config we're looking for
        //
        // We look for the config in the project path first, then the source path
        let Some(config_path) =
            find_config_in_location(**project_path, self.config_location, *self.source).await?
        else {
            return Ok(ProcessPostCssResult {
                content: self.source.content().to_resolved().await?,
                assets: Vec::new(),
            }
            .cell());
        };

        let source_content = self.source.content();
        let AssetContent::File(file) = *source_content.await? else {
            bail!("PostCSS transform only support transforming files");
        };
        let FileContent::Content(content) = &*file.await? else {
            return Ok(ProcessPostCssResult {
                content: AssetContent::File(FileContent::NotFound.resolved_cell()).resolved_cell(),
                assets: Vec::new(),
            }
            .cell());
        };
        let content = content.content().to_str()?;
        let evaluate_context = self.evaluate_context;

        // This invalidates the transform when the config changes.
        let config_changed = config_changed(*evaluate_context, config_path)
            .to_resolved()
            .await?;

        let postcss_executor = postcss_executor(*evaluate_context, **project_path, config_path)
            .module()
            .to_resolved()
            .await?;
        let css_fs_path = self.source.ident().path();

        // We need to get a path relative to the project because the postcss loader
        // runs with the project as the current working directory.
        let css_path = if let Some(css_path) = project_path
            .await?
            .get_relative_path_to(&*css_fs_path.await?)
        {
            css_path.into_owned()
        } else {
            // This shouldn't be an error since it can happen on virtual assets
            "".into()
        };

        let config_value = evaluate_webpack_loader(WebpackLoaderContext {
            module_asset: postcss_executor,
            cwd: *project_path,
            env: *env,
            context_ident_for_issue: self.source.ident().to_resolved().await?,
            asset_context: evaluate_context,
            chunking_context: *chunking_context,
            resolve_options_context: None,
            args: vec![
                ResolvedVc::cell(content.into()),
                ResolvedVc::cell(css_path.into()),
            ],
            additional_invalidation: config_changed,
        })
        .await?;

        let SingleValue::Single(val) = config_value.try_into_single().await? else {
            // An error happened, which has already been converted into an issue.
            return Ok(ProcessPostCssResult {
                content: AssetContent::File(FileContent::NotFound.resolved_cell()).resolved_cell(),
                assets: Vec::new(),
            }
            .cell());
        };
        let processed_css: PostCssProcessingResult = parse_json_with_source_context(val.to_str()?)
            .context("Unable to deserializate response from PostCSS transform operation")?;

        // TODO handle SourceMap
        let file = File::from(processed_css.css);
        let assets = emitted_assets_to_virtual_sources(processed_css.assets).await?;
        let content =
            AssetContent::File(FileContent::Content(file).resolved_cell()).resolved_cell();
        Ok(ProcessPostCssResult { content, assets }.cell())
    }
}

#[turbo_tasks::value]
struct PostCssTransformIssue {
    source: ResolvedVc<FileSystemPath>,
    description: RcStr,
    severity: ResolvedVc<IssueSeverity>,
    title: RcStr,
}

#[turbo_tasks::value_impl]
impl Issue for PostCssTransformIssue {
    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        *self.source
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text(self.title.clone()).cell()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(
            StyledString::Text(self.description.clone()).resolved_cell(),
        ))
    }

    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        *self.severity
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Transform.cell()
    }
}
