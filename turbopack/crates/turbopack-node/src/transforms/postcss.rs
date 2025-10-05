use anyhow::{Context, Result, bail};
use indoc::formatdoc;
use serde::{Deserialize, Serialize};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    Completion, Completions, NonLocalValue, ResolvedVc, TaskInput, TryFlatJoinIterExt, Vc,
    fxindexmap, trace::TraceRawVcs,
};
use turbo_tasks_bytes::stream::SingleValue;
use turbo_tasks_fs::{
    File, FileContent, FileSystemEntryType, FileSystemPath, json::parse_json_with_source_context,
};
use turbopack_core::{
    asset::{Asset, AssetContent},
    changed::any_content_changed_of_module,
    context::{AssetContext, ProcessResult},
    file_source::FileSource,
    ident::AssetIdent,
    reference_type::{EntryReferenceSubType, InnerAssets, ReferenceType},
    resolve::{FindContextFileResult, find_context_file_or_package_key, options::ImportMapping},
    source::Source,
    source_map::{GenerateSourceMap, OptionStringifiedSourceMap},
    source_transform::SourceTransform,
    virtual_source::VirtualSource,
};
use turbopack_ecmascript::runtime_functions::TURBOPACK_EXTERNAL_IMPORT;

use super::{
    util::{EmittedAsset, emitted_assets_to_virtual_sources},
    webpack::WebpackLoaderContext,
};
use crate::{
    embed_js::embed_file_path, execution_context::ExecutionContext,
    transforms::webpack::evaluate_webpack_loader,
};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
#[turbo_tasks::value(serialization = "custom")]
struct PostCssProcessingResult {
    css: String,
    map: Option<String>,
    assets: Option<Vec<EmittedAsset>>,
}

#[derive(
    Default,
    Copy,
    Clone,
    PartialEq,
    Eq,
    Hash,
    Debug,
    TraceRawVcs,
    Serialize,
    Deserialize,
    TaskInput,
    NonLocalValue,
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
    source_maps: bool,
}

#[turbo_tasks::value_impl]
impl PostCssTransform {
    #[turbo_tasks::function]
    pub fn new(
        evaluate_context: ResolvedVc<Box<dyn AssetContext>>,
        execution_context: ResolvedVc<ExecutionContext>,
        config_location: PostCssConfigLocation,
        source_maps: bool,
    ) -> Vc<Self> {
        PostCssTransform {
            evaluate_context,
            execution_context,
            config_location,
            source_maps,
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
                source_map: self.source_maps,
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
    source_map: bool,
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
        Ok(*self.process().await?.content)
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
    postcss_config_path: FileSystemPath,
) -> Result<Vc<Completion>> {
    let config_asset = asset_context
        .process(
            Vc::upcast(FileSource::new(postcss_config_path.clone())),
            ReferenceType::Internal(InnerAssets::empty().to_resolved().await?),
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
    postcss_config_path: FileSystemPath,
) -> Result<Vc<Completion>> {
    let parent_path = postcss_config_path.parent();

    let config_paths = [
        parent_path.join("tailwind.config.js")?,
        parent_path.join("tailwind.config.mjs")?,
        parent_path.join("tailwind.config.ts")?,
    ];

    let configs = config_paths
        .into_iter()
        .map(|path| async move {
            Ok(
                if matches!(&*path.get_type().await?, FileSystemEntryType::File) {
                    match *asset_context
                        .process(
                            Vc::upcast(FileSource::new(path)),
                            ReferenceType::Internal(InnerAssets::empty().to_resolved().await?),
                        )
                        .try_into_module()
                        .await?
                    {
                        Some(module) => {
                            Some(any_content_changed_of_module(*module).to_resolved().await?)
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
    pub path: FileSystemPath,
    pub key: ResolvedVc<Option<RcStr>>,
    pub allow_json5: bool,
}

#[turbo_tasks::value_impl]
impl JsonSource {
    #[turbo_tasks::function]
    pub fn new(
        path: FileSystemPath,
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
                self.path.append(".")?.append(key)?.append(".json")?,
            )),
            None => Ok(AssetIdent::from_path(self.path.append(".json")?)),
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
    project_path: FileSystemPath,
    postcss_config_path: FileSystemPath,
) -> Result<Vc<Box<dyn Source>>> {
    let postcss_config_path_value = postcss_config_path.clone();
    let postcss_config_path_filename = postcss_config_path_value.file_name();

    if postcss_config_path_filename == "package.json" {
        return Ok(Vc::upcast(JsonSource::new(
            postcss_config_path,
            Vc::cell(Some(rcstr!("postcss"))),
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

    let Some(config_path) = project_path.get_relative_path_to(&postcss_config_path_value) else {
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
            const mod = await {TURBOPACK_EXTERNAL_IMPORT}(configUrl);

            export default mod.default ?? mod;
        "#,
        config_path = serde_json::to_string(&config_path).expect("a string should be serializable"),
    };

    Ok(Vc::upcast(VirtualSource::new(
        postcss_config_path.append("_.loader.mjs")?,
        AssetContent::file(File::from(code).into()),
    )))
}

#[turbo_tasks::function]
async fn postcss_executor(
    asset_context: Vc<Box<dyn AssetContext>>,
    project_path: FileSystemPath,
    postcss_config_path: FileSystemPath,
) -> Result<Vc<ProcessResult>> {
    let config_asset = asset_context
        .process(
            config_loader_source(project_path, postcss_config_path),
            ReferenceType::Entry(EntryReferenceSubType::Undefined),
        )
        .module()
        .to_resolved()
        .await?;

    Ok(asset_context.process(
        Vc::upcast(FileSource::new(
            embed_file_path(rcstr!("transforms/postcss.ts"))
                .owned()
                .await?,
        )),
        ReferenceType::Internal(ResolvedVc::cell(fxindexmap! {
            rcstr!("CONFIG") => config_asset
        })),
    ))
}

async fn find_config_in_location(
    project_path: FileSystemPath,
    location: PostCssConfigLocation,
    source: Vc<Box<dyn Source>>,
) -> Result<Option<FileSystemPath>> {
    if let FindContextFileResult::Found(config_path, _) =
        &*find_context_file_or_package_key(project_path, postcss_configs(), rcstr!("postcss"))
            .await?
    {
        return Ok(Some(config_path.clone()));
    }

    if matches!(location, PostCssConfigLocation::ProjectPathOrLocalPath)
        && let FindContextFileResult::Found(config_path, _) = &*find_context_file_or_package_key(
            source.ident().path().await?.parent(),
            postcss_configs(),
            rcstr!("postcss"),
        )
        .await?
    {
        return Ok(Some(config_path.clone()));
    }

    Ok(None)
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for PostCssTransformedAsset {
    #[turbo_tasks::function]
    async fn generate_source_map(&self) -> Result<Vc<OptionStringifiedSourceMap>> {
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

        // For this postcss transform, there is no guarantee that looking up for the
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
            find_config_in_location(project_path.clone(), self.config_location, *self.source)
                .await?
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
        let source_map = self.source_map;

        // This invalidates the transform when the config changes.
        let config_changed = config_changed(*evaluate_context, config_path.clone())
            .to_resolved()
            .await?;

        let postcss_executor =
            postcss_executor(*evaluate_context, project_path.clone(), config_path)
                .module()
                .to_resolved()
                .await?;
        let css_fs_path = self.source.ident().path();

        // We need to get a path relative to the project because the postcss loader
        // runs with the project as the current working directory.
        let css_path =
            if let Some(css_path) = project_path.get_relative_path_to(&*css_fs_path.await?) {
                css_path.into_owned()
            } else {
                // This shouldn't be an error since it can happen on virtual assets
                "".into()
            };

        let config_value = evaluate_webpack_loader(WebpackLoaderContext {
            module_asset: postcss_executor,
            cwd: project_path.clone(),
            env: *env,
            context_source_for_issue: self.source,
            asset_context: evaluate_context,
            chunking_context: *chunking_context,
            resolve_options_context: None,
            args: vec![
                ResolvedVc::cell(content.into()),
                ResolvedVc::cell(css_path.into()),
                ResolvedVc::cell(source_map.into()),
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
