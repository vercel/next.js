use anyhow::{Context, Result, bail};
use bincode::{Decode, Encode};
use indoc::formatdoc;
use serde::Deserialize;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    Completion, Completions, ResolvedVc, Vc, fxindexmap, trace::TraceRawVcs, turbofmt,
};
use turbo_tasks_fs::{
    File, FileContent, FileSystemEntryType, FileSystemPath, json::parse_json_with_source_context,
};
use turbopack_core::{
    asset::{Asset, AssetContent},
    changed::any_source_content_changed_of_module,
    context::{AssetContext, ProcessResult},
    file_source::FileSource,
    ident::AssetIdent,
    module_graph::{ModuleGraph, SingleModuleGraph},
    reference_type::{EntryReferenceSubType, InnerAssets, ReferenceType},
    resolve::{FindContextFileResult, find_context_file_or_package_key, options::ImportMapping},
    source::Source,
    source_map::GenerateSourceMap,
    source_transform::SourceTransform,
    virtual_source::VirtualSource,
};
use turbopack_ecmascript::runtime_functions::TURBOPACK_EXTERNAL_IMPORT;

use crate::{
    embed_js::embed_file_path,
    evaluate::get_evaluate_entries,
    execution_context::ExecutionContext,
    transforms::{
        util::{EmittedAsset, emitted_assets_to_virtual_sources},
        webpack::{WebpackLoaderContext, evaluate_webpack_loader},
    },
};

#[derive(Debug, Clone, Deserialize)]
#[turbo_tasks::value]
#[serde(rename_all = "camelCase")]
struct PostCssProcessingResult {
    css: String,
    map: Option<String>,
    assets: Option<Vec<EmittedAsset>>,
}

#[turbo_tasks::task_input]
#[derive(Default, Copy, Clone, PartialEq, Eq, Hash, Debug, TraceRawVcs, Encode, Decode)]
pub enum PostCssConfigLocation {
    /// Searches for postcss config only starting from the project root directory.
    /// Used for foreign code (node_modules) where per-directory configs should be ignored.
    #[default]
    ProjectPath,
    /// Searches for postcss config starting from the project root directory first,
    /// then falls back to searching from the CSS file's parent directory if not found
    /// at the project root.
    ProjectPathOrLocalPath,
    /// Searches for postcss config starting from the CSS file's parent directory first,
    /// then falls back to the project root if not found locally. This allows per-directory
    /// postcss.config.js files to override the project root config.
    LocalPathOrProjectPath,
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
    Vc::cell(vec![
        rcstr!(".postcssrc"),
        rcstr!(".postcssrc.json"),
        rcstr!(".postcssrc.yaml"),
        rcstr!(".postcssrc.yml"),
        rcstr!(".postcssrc.js"),
        rcstr!(".postcssrc.mjs"),
        rcstr!(".postcssrc.cjs"),
        rcstr!(".postcssrc.ts"),
        rcstr!(".postcssrc.mts"),
        rcstr!(".postcssrc.cts"),
        rcstr!(".config/postcssrc"),
        rcstr!(".config/postcssrc.json"),
        rcstr!(".config/postcssrc.yaml"),
        rcstr!(".config/postcssrc.yml"),
        rcstr!(".config/postcssrc.js"),
        rcstr!(".config/postcssrc.mjs"),
        rcstr!(".config/postcssrc.cjs"),
        rcstr!(".config/postcssrc.ts"),
        rcstr!(".config/postcssrc.mts"),
        rcstr!(".config/postcssrc.cts"),
        rcstr!("postcss.config.js"),
        rcstr!("postcss.config.mjs"),
        rcstr!("postcss.config.cjs"),
        rcstr!("postcss.config.ts"),
        rcstr!("postcss.config.mts"),
        rcstr!("postcss.config.cts"),
        rcstr!("postcss.config.json"),
    ])
}

#[turbo_tasks::value]
pub struct PostCssTransform {
    evaluate_context: ResolvedVc<Box<dyn AssetContext>>,
    config_tracing_context: ResolvedVc<Box<dyn AssetContext>>,
    execution_context: ResolvedVc<ExecutionContext>,
    config_location: PostCssConfigLocation,
    source_maps: bool,
}

#[turbo_tasks::value_impl]
impl PostCssTransform {
    #[turbo_tasks::function]
    pub fn new(
        evaluate_context: ResolvedVc<Box<dyn AssetContext>>,
        config_tracing_context: ResolvedVc<Box<dyn AssetContext>>,
        execution_context: ResolvedVc<ExecutionContext>,
        config_location: PostCssConfigLocation,
        source_maps: bool,
    ) -> Vc<Self> {
        PostCssTransform {
            evaluate_context,
            config_tracing_context,
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
    fn transform(
        &self,
        source: ResolvedVc<Box<dyn Source>>,
        asset_context: ResolvedVc<Box<dyn AssetContext>>,
    ) -> Vc<Box<dyn Source>> {
        Vc::upcast(
            PostCssTransformedAsset {
                evaluate_context: self.evaluate_context,
                config_tracing_context: self.config_tracing_context,
                execution_context: self.execution_context,
                config_location: self.config_location,
                source,
                asset_context,
                source_map: self.source_maps,
            }
            .cell(),
        )
    }
}

#[turbo_tasks::value]
struct PostCssTransformedAsset {
    evaluate_context: ResolvedVc<Box<dyn AssetContext>>,
    config_tracing_context: ResolvedVc<Box<dyn AssetContext>>,
    execution_context: ResolvedVc<ExecutionContext>,
    config_location: PostCssConfigLocation,
    source: ResolvedVc<Box<dyn Source>>,
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
    source_map: bool,
}

#[turbo_tasks::value_impl]
impl Source for PostCssTransformedAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.source.ident()
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<RcStr>> {
        let inner = turbo_tasks::read!(self.source.description())?;
        Ok(Vc::cell(format!("PostCSS transform of {}", inner).into()))
    }
}

#[turbo_tasks::value_impl]
impl Asset for PostCssTransformedAsset {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        Ok(*turbo_tasks::read!(self.process())?.content)
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
            ReferenceType::Internal(turbo_tasks::read!(InnerAssets::empty().to_resolved())?),
        )
        .module();

    Ok(Vc::<Completions>::cell(vec![
        turbo_tasks::read!(any_source_content_changed_of_module(config_asset).to_resolved())?,
        turbo_tasks::read!(
            extra_configs_changed(asset_context, postcss_config_path).to_resolved()
        )?,
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

    // Only a handful of candidate paths — check them sequentially in both modes.
    let mut configs = Vec::new();
    for path in config_paths {
        if matches!(
            &*turbo_tasks::read!(path.get_type())?,
            FileSystemEntryType::File
        ) && let Some(module) = *turbo_tasks::read!(
            asset_context
                .process(
                    Vc::upcast(FileSource::new(path)),
                    ReferenceType::Internal(turbo_tasks::read!(
                        InnerAssets::empty().to_resolved()
                    )?),
                )
                .try_into_module()
        )? {
            configs.push(turbo_tasks::read!(
                any_source_content_changed_of_module(*module).to_resolved()
            )?);
        }
    }

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
    fn description(&self) -> Vc<RcStr> {
        Vc::cell(format!("JSON content of {}", self.path).into())
    }

    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        match &*turbo_tasks::read!(self.key)? {
            Some(key) => Ok(AssetIdent::from_path(
                self.path.append(".")?.append(key)?.append(".json")?,
            )
            .into_vc()),
            None => Ok(AssetIdent::from_path(self.path.append(".json")?).into_vc()),
        }
    }
}

#[turbo_tasks::value_impl]
impl Asset for JsonSource {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        let file_type = &*turbo_tasks::read!(self.path.get_type())?;
        match file_type {
            FileSystemEntryType::File => {
                let json = if self.allow_json5 {
                    turbo_tasks::read!(self.path.read_json5().content())?
                } else {
                    turbo_tasks::read!(self.path.read_json().content())?
                };
                let value = match &*turbo_tasks::read!(self.key)? {
                    Some(key) => {
                        let Some(value) = json.get(&**key) else {
                            anyhow::bail!("Invalid file type {:?}", file_type)
                        };
                        value
                    }
                    None => &*json,
                };
                Ok(AssetContent::file(
                    FileContent::Content(File::from(value.to_string())).cell(),
                ))
            }
            FileSystemEntryType::NotFound => {
                Ok(AssetContent::File(FileContent::NotFound.resolved_cell()).cell())
            }
            _ => bail!("Invalid file type {:?}", file_type),
        }
    }
}

#[turbo_tasks::function]
pub(crate) async fn config_loader_source(
    project_path: FileSystemPath,
    postcss_config_path: FileSystemPath,
) -> Result<Vc<Box<dyn Source>>> {
    let postcss_config_path_filename = postcss_config_path.file_name();

    if postcss_config_path_filename == "package.json" {
        return Ok(Vc::upcast(JsonSource::new(
            postcss_config_path,
            Vc::cell(Some(rcstr!("postcss"))),
            false,
        )));
    }

    if postcss_config_path.path.ends_with(".json") || postcss_config_path_filename == ".postcssrc" {
        return Ok(Vc::upcast(JsonSource::new(
            postcss_config_path,
            Vc::cell(None),
            true,
        )));
    }

    // We can only load js files with `import()`.
    if !postcss_config_path.path.ends_with(".js") {
        return Ok(Vc::upcast(FileSource::new(postcss_config_path)));
    }

    let Some(config_path) = project_path.get_relative_path_to(&postcss_config_path) else {
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
        AssetContent::file(FileContent::Content(File::from(code)).cell()),
    )))
}

#[turbo_tasks::function]
async fn postcss_executor(
    asset_context: Vc<Box<dyn AssetContext>>,
    project_path: FileSystemPath,
    postcss_config_path: FileSystemPath,
) -> Result<Vc<ProcessResult>> {
    let config_asset = turbo_tasks::read!(
        asset_context
            .process(
                config_loader_source(project_path, postcss_config_path.clone()),
                ReferenceType::Entry(EntryReferenceSubType::Undefined),
            )
            .module()
            .to_resolved()
    )?;

    Ok(asset_context.process(
        Vc::upcast(FileSource::new_with_query(
            turbo_tasks::read!(embed_file_path(rcstr!("transforms/postcss.ts")).owned())?,
            turbo_tasks::read!(turbofmt!("?config={postcss_config_path}"))?,
        )),
        ReferenceType::Internal(ResolvedVc::cell(fxindexmap! {
            rcstr!("CONFIG") => config_asset
        })),
    ))
}

turbo_tasks::dual_fn! {
    fn find_config_in_location(
        project_path: FileSystemPath,
        location: PostCssConfigLocation,
        source: Vc<Box<dyn Source>>,
    ) -> Result<Option<FileSystemPath>> {
        // Build an ordered list of directories to search based on the location strategy.
        let search_paths = match location {
            // Only check project root (used for foreign/node_modules code).
            PostCssConfigLocation::ProjectPath => {
                vec![project_path]
            }
            // Check project root first, fall back to the CSS file's directory.
            PostCssConfigLocation::ProjectPathOrLocalPath => {
                vec![
                    project_path,
                    turbo_tasks::read!(source.ident())?.path.parent(),
                ]
            }
            // Check the CSS file's directory first, fall back to the project root.
            PostCssConfigLocation::LocalPathOrProjectPath => {
                vec![
                    turbo_tasks::read!(source.ident())?.path.parent(),
                    project_path,
                ]
            }
        };

        for path in search_paths {
            if let FindContextFileResult::Found(config_path, _) = &*turbo_tasks::read!(
                find_context_file_or_package_key(path, postcss_configs(), rcstr!("postcss"))
            )? {
                return Ok(Some(config_path.clone()));
            }
        }

        Ok(None)
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for PostCssTransformedAsset {
    #[turbo_tasks::function]
    async fn generate_source_map(&self) -> Result<Vc<FileContent>> {
        let source = ResolvedVc::try_sidecast::<Box<dyn GenerateSourceMap>>(self.source);
        match source {
            Some(source) => Ok(source.generate_source_map()),
            None => Ok(FileContent::NotFound.cell()),
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
            node_backend,
        } = &*turbo_tasks::read!(self.execution_context)?;

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
        let Some(config_path) = turbo_tasks::read!(find_config_in_location(
            project_path.clone(),
            self.config_location,
            *self.source
        ))?
        else {
            return Ok(ProcessPostCssResult {
                content: turbo_tasks::read!(self.source.content().to_resolved())?,
                assets: Vec::new(),
            }
            .cell());
        };

        let source_content = self.source.content();
        let AssetContent::File(file) = *turbo_tasks::read!(source_content)? else {
            bail!("PostCSS transform only support transforming files");
        };
        let FileContent::Content(content) = &*turbo_tasks::read!(file)? else {
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
        let config_changed = turbo_tasks::read!(
            config_changed(*self.config_tracing_context, config_path.clone()).to_resolved()
        )?;

        let postcss_executor =
            postcss_executor(*evaluate_context, project_path.clone(), config_path).module();

        let entries = turbo_tasks::read!(
            get_evaluate_entries(postcss_executor, *evaluate_context, **node_backend, None)
                .to_resolved()
        )?;

        let module_graph = turbo_tasks::read!(
            ModuleGraph::from_graphs(
                vec![SingleModuleGraph::new_with_entries(
                    turbo_tasks::read!(entries.graph_entries().to_resolved())?,
                    false,
                    false,
                )],
                None,
            )
            .connect()
            .to_resolved()
        )?;

        let source_ident = turbo_tasks::read!(self.source.ident())?;

        // We need to get a path relative to the project because the postcss loader
        // runs with the project as the current working directory.
        let css_path = if let Some(css_path) = project_path.get_relative_path_to(&source_ident.path)
        {
            css_path.into_owned()
        } else {
            // This shouldn't be an error since it can happen on virtual assets
            "".into()
        };

        let config_value = turbo_tasks::read!(evaluate_webpack_loader(WebpackLoaderContext {
            entries,
            cwd: project_path.clone(),
            env: *env,
            node_backend: *node_backend,
            context_source_for_issue: self.source,
            chunking_context: *chunking_context,
            evaluate_context: self.evaluate_context,
            module_graph,
            resolve_options_context: None,
            asset_context: self.asset_context,
            args: vec![
                ResolvedVc::cell(content.into()),
                ResolvedVc::cell(css_path.into()),
                ResolvedVc::cell(source_map.into()),
            ],
            additional_invalidation: config_changed,
            loader_names: vec![turbo_rcstr::rcstr!("postcss")],
        }))?;

        let Some(val) = &*config_value else {
            // An error happened, which has already been converted into an issue.
            return Ok(ProcessPostCssResult {
                content: AssetContent::File(FileContent::NotFound.resolved_cell()).resolved_cell(),
                assets: Vec::new(),
            }
            .cell());
        };
        let processed_css: PostCssProcessingResult = parse_json_with_source_context(val)
            .context("Unable to deserializate response from PostCSS transform operation")?;

        // TODO handle SourceMap
        let file = File::from(processed_css.css);
        let assets = turbo_tasks::read!(emitted_assets_to_virtual_sources(processed_css.assets))?;
        let content =
            AssetContent::File(FileContent::Content(file).resolved_cell()).resolved_cell();
        Ok(ProcessPostCssResult { content, assets }.cell())
    }
}
