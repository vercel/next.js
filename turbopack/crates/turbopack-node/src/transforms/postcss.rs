use anyhow::{Context, Result, bail};
use bincode::{Decode, Encode};
use indoc::formatdoc;
use serde::Deserialize;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    Completion, Completions, ResolvedVc, TryFlatJoinIterExt, Vc, fxindexmap,
    resolve_strongly_consistent_and_take_and_apply_effects, trace::TraceRawVcs,
};
use turbo_tasks_fs::{
    File, FileContent, FileSystemEntryType, FileSystemPath, json::parse_json_with_source_context,
    to_sys_path,
};
use turbopack_core::{
    asset::{Asset, AssetContent},
    changed::any_source_content_changed_of_module,
    chunk::{ChunkingContext, ChunkingContextExt, EvaluatableAsset},
    context::AssetContext,
    file_source::FileSource,
    ident::AssetIdent,
    module::Module,
    module_graph::{
        ModuleGraph, SingleModuleGraph,
        chunk_group_info::{ChunkGroup, ChunkGroupEntry},
    },
    output::OutputAssets,
    reference_type::{EntryReferenceSubType, InnerAssets, ReferenceType},
    resolve::{FindContextFileResult, find_context_file_or_package_key, options::ImportMapping},
    source::Source,
    source_map::GenerateSourceMap,
    source_transform::SourceTransform,
    virtual_source::VirtualSource,
};
use turbopack_ecmascript::runtime_functions::TURBOPACK_EXTERNAL_IMPORT;

use crate::{
    emit, emit_package_json,
    evaluate::get_evaluate_entries,
    execution_context::ExecutionContext,
    transforms::{
        util::{EmittedAsset, emitted_assets_to_virtual_sources},
        webpack::{WebpackLoaderContext, evaluate_webpack_loader, transform_executor},
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
        let inner = self.source.description().await?;
        Ok(Vc::cell(format!("PostCSS transform of {}", inner).into()))
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
        any_source_content_changed_of_module(config_asset)
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
                        Some(module) => Some(
                            any_source_content_changed_of_module(*module)
                                .to_resolved()
                                .await?,
                        ),
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
    fn description(&self) -> Vc<RcStr> {
        Vc::cell(format!("JSON content of {}", self.path).into())
    }

    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        match &*self.key.await? {
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

/// The raw config source plus an optional inner config module that the loader
/// wrapper statically imports. See [`config_loader_source`].
struct ConfigLoader {
    /// The loader wrapper module. Always exports an async `loadPostcssConfig()`
    /// function so the emitted CommonJS entry chunk stays synchronous (a
    /// top-level `await` would make the module async and the entry chunk would
    /// read `module.exports` before it resolved, yielding an empty object).
    wrapper: Vc<Box<dyn Source>>,
    /// For bundled config kinds, the inner config module referenced by the
    /// wrapper as `CONFIG`. `None` for `.js` configs, which the wrapper loads
    /// dynamically via `import()` to avoid bundling (preserving `require.resolve`).
    inner: Option<Vc<Box<dyn Source>>>,
}

/// Builds a loader module for a PostCSS config that uniformly exports an async
/// `loadPostcssConfig()` returning the resolved config object, regardless of the
/// config file kind. The worker imports the emitted bundle and calls this
/// function. Centralizing the unwrap here (`mod.default ?? mod`) avoids
/// CJS↔ESM interop ambiguities in the worker.
async fn config_loader_source(
    project_path: FileSystemPath,
    postcss_config_path: FileSystemPath,
) -> Result<ConfigLoader> {
    let postcss_config_path_filename = postcss_config_path.file_name();

    let inner: Option<Vc<Box<dyn Source>>> = if postcss_config_path_filename == "package.json" {
        Some(Vc::upcast(JsonSource::new(
            postcss_config_path.clone(),
            Vc::cell(Some(rcstr!("postcss"))),
            false,
        )))
    } else if postcss_config_path.path.ends_with(".json")
        || postcss_config_path_filename == ".postcssrc"
    {
        Some(Vc::upcast(JsonSource::new(
            postcss_config_path.clone(),
            Vc::cell(None),
            true,
        )))
    } else if !postcss_config_path.path.ends_with(".js") {
        // .ts/.mts/.cts/.mjs/.cjs — bundled by Turbopack (it transpiles them).
        Some(Vc::upcast(FileSource::new(postcss_config_path.clone())))
    } else {
        // .js — loaded dynamically (not bundled) to preserve `require.resolve`.
        None
    };

    let wrapper = if inner.is_some() {
        // Statically import the (bundled) inner config and re-export it through
        // the loader function. The static import keeps the wrapper synchronous.
        let code = "import config from 'CONFIG';\nexport async function loadPostcssConfig() { \
                    return config; }\n";
        Vc::upcast(VirtualSource::new(
            postcss_config_path.append("_.loader.mjs")?,
            AssetContent::file(FileContent::Content(File::from(code)).cell()),
        ))
    } else {
        let Some(config_path) = project_path.get_relative_path_to(&postcss_config_path) else {
            bail!("Unable to get relative path to postcss config");
        };
        let code = formatdoc! {
            r#"
                import {{ pathToFileURL }} from 'node:url';
                import path from 'node:path';

                export async function loadPostcssConfig() {{
                    const configPath = path.join(process.cwd(), {config_path});
                    // Absolute paths don't work with ESM imports on Windows:
                    // https://github.com/nodejs/node/issues/31710
                    // convert it to a file:// URL, which works on all platforms
                    const configUrl = pathToFileURL(configPath).toString();
                    const mod = await {TURBOPACK_EXTERNAL_IMPORT}(configUrl);
                    return mod.default ?? mod;
                }}
            "#,
            config_path =
                serde_json::to_string(&config_path).expect("a string should be serializable"),
        };
        Vc::upcast(VirtualSource::new(
            postcss_config_path.append("_.loader.mjs")?,
            AssetContent::file(FileContent::Content(File::from(code)).cell()),
        ))
    };

    Ok(ConfigLoader { wrapper, inner })
}

/// Builds and emits the config bundle. Writing to disk happens via deferred
/// effects (see [`turbo_tasks_fs`] `write`), so this is an `operation` whose
/// effects are applied by [`emit_postcss_config_bundle`].
#[turbo_tasks::function(operation, root)]
async fn emit_postcss_config_bundle_operation(
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    project_path: FileSystemPath,
    postcss_config_path: FileSystemPath,
) -> Result<Vc<RcStr>> {
    let ConfigLoader { wrapper, inner } =
        config_loader_source(project_path.clone(), postcss_config_path.clone()).await?;

    // The wrapper statically imports the (bundled) inner config as `CONFIG`.
    let reference_type = if let Some(inner) = inner {
        let inner_module = asset_context
            .process(
                inner,
                ReferenceType::Entry(EntryReferenceSubType::Undefined),
            )
            .module()
            .to_resolved()
            .await?;
        ReferenceType::Internal(ResolvedVc::cell(fxindexmap! {
            rcstr!("CONFIG") => inner_module
        }))
    } else {
        ReferenceType::Entry(EntryReferenceSubType::Undefined)
    };

    let config_module = asset_context
        .process(wrapper, reference_type)
        .module()
        .to_resolved()
        .await?;

    let Some(evaluatable) = ResolvedVc::try_sidecast::<Box<dyn EvaluatableAsset>>(config_module)
    else {
        bail!("PostCSS config module is not evaluatable");
    };

    let module_graph = ModuleGraph::from_graphs(
        vec![SingleModuleGraph::new_with_entry(
            ChunkGroupEntry::Entry(vec![config_module]),
            false,
            false,
        )],
        None,
    )
    .connect()
    .to_resolved()
    .await?;

    let entrypoint = chunking_context
        .chunk_path(
            None,
            config_module.ident(),
            Some(rcstr!("postcss_config")),
            rcstr!(".js"),
        )
        .owned()
        .await?;

    let bootstrap = chunking_context.root_entry_chunk_group_asset(
        entrypoint.clone(),
        ChunkGroup::Entry(vec![ResolvedVc::upcast(evaluatable)]),
        *module_graph,
        OutputAssets::empty(),
        OutputAssets::empty(),
    );

    let output_root = chunking_context.output_root().owned().await?;
    emit_package_json(output_root.clone())?
        .as_side_effect()
        .await?;
    emit(bootstrap, output_root.clone())
        .as_side_effect()
        .await?;

    // The bundle lives under the output root, which may be a different
    // filesystem than the project, so pass the worker an absolute disk path it
    // can import directly rather than a project-relative one.
    let Some(bundled_sys_path) = to_sys_path(entrypoint.clone()).await? else {
        bail!("PostCSS config bundle can only be emitted to a disk filesystem");
    };

    Ok(Vc::cell(RcStr::from(
        bundled_sys_path.to_string_lossy().into_owned(),
    )))
}

/// Emits the PostCSS config as a standalone Node.js bundle to disk and returns
/// its path **relative to the project root** (the worker's cwd).
///
/// The config used to be bundled into the worker's entry module, which forced a
/// distinct entry — and therefore a distinct pool — per config. Instead we now
/// emit each config as its own bundle and pass its path to the shared worker,
/// which imports it on demand and caches the resulting `Processor` keyed by the
/// original config path (see `transforms/postcss.ts`).
///
/// The returned path is content-addressed (the chunk path embeds a content
/// hash), so editing a config produces a new path. That doubles as the worker's
/// staleness signal: the worker reloads when the bundled path for a given
/// original config path changes.
#[turbo_tasks::function(operation, root, session_dependent)]
async fn emit_postcss_config_bundle(
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    project_path: FileSystemPath,
    postcss_config_path: FileSystemPath,
) -> Result<Vc<RcStr>> {
    let operation = emit_postcss_config_bundle_operation(
        asset_context,
        chunking_context,
        project_path,
        postcss_config_path,
    );

    // HACK: mirror `create_evaluate_pool_assets_operation` — apply emit effects
    // even though we're not at the top level, since config bundles are produced
    // lazily during the transform. See that function's comment for details.
    let path = resolve_strongly_consistent_and_take_and_apply_effects(operation).await?;

    Ok(*path)
}

async fn find_config_in_location(
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
            vec![project_path, source.ident().await?.path.parent()]
        }
        // Check the CSS file's directory first, fall back to the project root.
        PostCssConfigLocation::LocalPathOrProjectPath => {
            vec![source.ident().await?.path.parent(), project_path]
        }
    };

    for path in search_paths {
        if let FindContextFileResult::Found(config_path, _) =
            &*find_context_file_or_package_key(path, postcss_configs(), rcstr!("postcss")).await?
        {
            return Ok(Some(config_path.clone()));
        }
    }

    Ok(None)
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

        // This invalidates the transform when the config changes. It is routed
        // through `transform_invalidation` (not the pool) so the shared worker
        // pool stays config-independent; only this transform's cached result
        // re-runs on a config edit.
        let config_changed = config_changed(*self.config_tracing_context, config_path.clone())
            .to_resolved()
            .await?;

        // The worker keys its cached PostCSS processor by the original config
        // path; the content-addressed bundled path is the staleness signal.
        let original_config_path = project_path
            .get_relative_path_to(&config_path)
            .map(|p| p.into_owned())
            .unwrap_or_default();
        let bundled_config_path = emit_postcss_config_bundle(
            evaluate_context,
            *chunking_context,
            project_path.clone(),
            config_path,
        )
        .read_strongly_consistent()
        .await?;

        // A single, config-independent runtime entry shared with webpack loaders,
        // so all JS transforms use one pool.
        let transform_executor = transform_executor(*evaluate_context).module();

        let entries =
            get_evaluate_entries(transform_executor, *evaluate_context, **node_backend, None)
                .to_resolved()
                .await?;

        let module_graph = ModuleGraph::from_graphs(
            vec![SingleModuleGraph::new_with_entries(
                entries.graph_entries().to_resolved().await?,
                false,
                false,
            )],
            None,
        )
        .connect()
        .to_resolved()
        .await?;

        let source_ident = self.source.ident().await?;

        // We need to get a path relative to the project because the postcss loader
        // runs with the project as the current working directory.
        let css_path = if let Some(css_path) = project_path.get_relative_path_to(&source_ident.path)
        {
            css_path.into_owned()
        } else {
            // This shouldn't be an error since it can happen on virtual assets
            "".into()
        };

        let config_value = evaluate_webpack_loader(WebpackLoaderContext {
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
                // Leading discriminator consumed by the shared dispatch.ts entry.
                ResolvedVc::cell("postcss".into()),
                ResolvedVc::cell(content.into()),
                ResolvedVc::cell(css_path.into()),
                ResolvedVc::cell(original_config_path.into()),
                ResolvedVc::cell(bundled_config_path.to_string().into()),
                ResolvedVc::cell(source_map.into()),
            ],
            // Keep the pool config-independent; route config invalidation to the
            // transform result instead.
            additional_invalidation: Completion::immutable().to_resolved().await?,
            transform_invalidation: config_changed,
            loader_names: vec![turbo_rcstr::rcstr!("postcss")],
        })
        .await?;

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
        let assets = emitted_assets_to_virtual_sources(processed_css.assets).await?;
        let content =
            AssetContent::File(FileContent::Content(file).resolved_cell()).resolved_cell();
        Ok(ProcessPostCssResult { content, assets }.cell())
    }
}
