use std::mem::take;

use anyhow::{bail, Context, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};
use turbo_tasks::{
    trace::TraceRawVcs, Completion, TaskInput, TryJoinIterExt, Value, ValueToString, Vc,
};
use turbo_tasks_bytes::stream::SingleValue;
use turbo_tasks_env::ProcessEnv;
use turbo_tasks_fs::{
    glob::Glob, json::parse_json_with_source_context, DirectoryEntry, File, FileContent,
    FileSystemPath, ReadGlobResult,
};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::ChunkingContext,
    context::{AssetContext, ProcessResult},
    file_source::FileSource,
    ident::AssetIdent,
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, OptionStyledString, StyledString},
    module::Module,
    reference_type::{InnerAssets, ReferenceType},
    resolve::{
        options::{ConditionValue, ResolveInPackage, ResolveIntoPackage, ResolveOptions},
        parse::Request,
        pattern::Pattern,
        resolve,
    },
    source::Source,
    source_transform::SourceTransform,
    virtual_source::VirtualSource,
};
use turbopack_resolve::{
    ecmascript::get_condition_maps, resolve::resolve_options,
    resolve_options_context::ResolveOptionsContext,
};

use super::util::{emitted_assets_to_virtual_sources, EmittedAsset};
use crate::{
    debug::should_debug,
    embed_js::embed_file_path,
    evaluate::{
        compute, custom_evaluate, get_evaluate_pool, EvaluateContext, EvaluationIssue,
        JavaScriptEvaluation, JavaScriptStreamSender,
    },
    execution_context::ExecutionContext,
    pool::{FormattingMode, NodeJsPool},
    source_map::StructuredError,
    AssetsForSourceMapping,
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
    evaluate_context: Vc<Box<dyn AssetContext>>,
    execution_context: Vc<ExecutionContext>,
    loaders: Vc<WebpackLoaderItems>,
    rename_as: Option<String>,
    resolve_options_context: Vc<ResolveOptionsContext>,
}

#[turbo_tasks::value_impl]
impl WebpackLoaders {
    #[turbo_tasks::function]
    pub fn new(
        evaluate_context: Vc<Box<dyn AssetContext>>,
        execution_context: Vc<ExecutionContext>,
        loaders: Vc<WebpackLoaderItems>,
        rename_as: Option<String>,
        resolve_options_context: Vc<ResolveOptionsContext>,
    ) -> Vc<Self> {
        WebpackLoaders {
            evaluate_context,
            execution_context,
            loaders,
            rename_as,
            resolve_options_context,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl SourceTransform for WebpackLoaders {
    #[turbo_tasks::function]
    fn transform(self: Vc<Self>, source: Vc<Box<dyn Source>>) -> Vc<Box<dyn Source>> {
        Vc::upcast(
            WebpackLoadersProcessedAsset {
                transform: self,
                source,
            }
            .cell(),
        )
    }
}

#[turbo_tasks::value]
struct WebpackLoadersProcessedAsset {
    transform: Vc<WebpackLoaders>,
    source: Vc<Box<dyn Source>>,
}

#[turbo_tasks::value_impl]
impl Source for WebpackLoadersProcessedAsset {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(
            if let Some(rename_as) = self.transform.await?.rename_as.as_deref() {
                self.source.ident().rename_as(rename_as.to_string())
            } else {
                self.source.ident()
            },
        )
    }
}

#[turbo_tasks::value_impl]
impl Asset for WebpackLoadersProcessedAsset {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        Ok(self.process().await?.content)
    }
}

#[turbo_tasks::value]
struct ProcessWebpackLoadersResult {
    content: Vc<AssetContent>,
    assets: Vec<Vc<VirtualSource>>,
}

#[turbo_tasks::function]
fn webpack_loaders_executor(evaluate_context: Vc<Box<dyn AssetContext>>) -> Vc<ProcessResult> {
    evaluate_context.process(
        Vc::upcast(FileSource::new(embed_file_path(
            "transforms/webpack-loaders.ts".to_string(),
        ))),
        Value::new(ReferenceType::Internal(InnerAssets::empty())),
    )
}

#[turbo_tasks::value_impl]
impl WebpackLoadersProcessedAsset {
    #[turbo_tasks::function]
    async fn process(self: Vc<Self>) -> Result<Vc<ProcessWebpackLoadersResult>> {
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
        let evaluate_context = transform.evaluate_context;

        let webpack_loaders_executor = webpack_loaders_executor(evaluate_context).module();
        let resource_fs_path = this.source.ident().path().await?;
        let Some(resource_path) = project_path.await?.get_relative_path_to(&resource_fs_path)
        else {
            bail!("Resource path need to be on project filesystem");
        };
        let loaders = transform.loaders.await?;
        let config_value = custom_evaluate(WebpackLoaderContext {
            module_asset: webpack_loaders_executor,
            cwd: project_path,
            env,
            context_ident_for_issue: this.source.ident(),
            asset_context: evaluate_context,
            chunking_context,
            resolve_options_context: Some(transform.resolve_options_context),
            args: vec![
                Vc::cell(content.into()),
                Vc::cell(resource_path.into()),
                Vc::cell(json!(*loaders)),
            ],
            additional_invalidation: Completion::immutable(),
        })
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
        let assets = emitted_assets_to_virtual_sources(processed.assets);
        let content = AssetContent::File(FileContent::Content(file).cell()).cell();
        Ok(ProcessWebpackLoadersResult { content, assets }.cell())
    }
}

#[turbo_tasks::function]
fn evaluate_webpack_loader(
    webpack_loader_context: WebpackLoaderContext,
) -> Vc<JavaScriptEvaluation> {
    custom_evaluate(webpack_loader_context)
}

#[turbo_tasks::function]
async fn compute_webpack_loader_evaluation(
    webpack_loader_context: WebpackLoaderContext,
    sender: Vc<JavaScriptStreamSender>,
) -> Result<Vc<()>> {
    compute(webpack_loader_context, sender).await
}

#[derive(Deserialize, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum InfoMessage {
    FileDependency {
        path: String,
    },
    BuildDependency {
        path: String,
    },
    DirDependency {
        path: String,
        glob: String,
    },
    EmittedError {
        severity: IssueSeverity,
        error: StructuredError,
    },
}

#[derive(Deserialize, Debug, Clone, TaskInput)]
#[serde(rename_all = "camelCase")]

pub struct WebpackResolveOptions {
    no_alias: bool,
    alias_fields: Option<Vec<String>>,
    condition_names: Option<Vec<String>>,
    no_package_json: bool,
    extensions: Option<Vec<String>>,
    main_fields: Option<Vec<String>>,
    no_exports_field: bool,
    main_files: Option<Vec<String>>,
    no_modules: bool,
    prefer_relative: bool,
}

#[derive(Deserialize, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum RequestMessage {
    Resolve {
        options: WebpackResolveOptions,
        lookup_path: String,
        request: String,
    },
}

#[derive(Serialize, Debug)]
#[serde(untagged)]
pub enum ResponseMessage {
    Resolve { path: String },
}

#[derive(Clone, PartialEq, Eq, TaskInput)]
pub struct WebpackLoaderContext {
    pub module_asset: Vc<Box<dyn Module>>,
    pub cwd: Vc<FileSystemPath>,
    pub env: Vc<Box<dyn ProcessEnv>>,
    pub context_ident_for_issue: Vc<AssetIdent>,
    pub asset_context: Vc<Box<dyn AssetContext>>,
    pub chunking_context: Vc<Box<dyn ChunkingContext>>,
    pub resolve_options_context: Option<Vc<ResolveOptionsContext>>,
    pub args: Vec<Vc<JsonValue>>,
    pub additional_invalidation: Vc<Completion>,
}

#[async_trait]
impl EvaluateContext for WebpackLoaderContext {
    type InfoMessage = InfoMessage;
    type RequestMessage = RequestMessage;
    type ResponseMessage = ResponseMessage;

    fn compute(self, sender: Vc<JavaScriptStreamSender>) {
        let _ = compute_webpack_loader_evaluation(self, sender);
    }

    fn pool(&self) -> Vc<crate::pool::NodeJsPool> {
        get_evaluate_pool(
            self.module_asset,
            self.cwd,
            self.env,
            self.asset_context,
            self.chunking_context,
            None,
            self.additional_invalidation,
            should_debug("webpack_loader"),
        )
    }

    fn args(&self) -> &[Vc<serde_json::Value>] {
        &self.args
    }

    fn cwd(&self) -> Vc<turbo_tasks_fs::FileSystemPath> {
        self.cwd
    }

    fn keep_alive(&self) -> bool {
        true
    }

    async fn emit_error(&self, error: StructuredError, pool: &NodeJsPool) -> Result<()> {
        EvaluationIssue {
            error,
            context_ident: self.context_ident_for_issue,
            assets_for_source_mapping: pool.assets_for_source_mapping,
            assets_root: pool.assets_root,
            project_dir: self.chunking_context.context_path().root(),
        }
        .cell()
        .emit();
        Ok(())
    }

    async fn info(&self, data: Self::InfoMessage, pool: &NodeJsPool) -> Result<()> {
        match data {
            InfoMessage::FileDependency { path } => {
                // TODO We might miss some changes that happened during execution
                // Read dependencies to make them a dependencies of this task. This task will
                // execute again when they change.
                self.cwd.join(path).read().await?;
            }
            InfoMessage::BuildDependency { path } => {
                // TODO We might miss some changes that happened during execution
                BuildDependencyIssue {
                    context_ident: self.context_ident_for_issue,
                    path: self.cwd.join(path),
                }
                .cell()
                .emit();
            }
            InfoMessage::DirDependency { path, glob } => {
                // TODO We might miss some changes that happened during execution
                // Read dependencies to make them a dependencies of this task. This task will
                // execute again when they change.
                dir_dependency(self.cwd.join(path).read_glob(Glob::new(glob), false)).await?;
            }
            InfoMessage::EmittedError { error, severity } => {
                EvaluateEmittedErrorIssue {
                    file_path: self.context_ident_for_issue.path(),
                    error,
                    severity: severity.cell(),
                    assets_for_source_mapping: pool.assets_for_source_mapping,
                    assets_root: pool.assets_root,
                    project_dir: self.chunking_context.context_path().root(),
                }
                .cell()
                .emit();
            }
        }
        Ok(())
    }

    async fn request(
        &self,
        data: Self::RequestMessage,
        _pool: &NodeJsPool,
    ) -> Result<Self::ResponseMessage> {
        match data {
            RequestMessage::Resolve {
                options: webpack_options,
                lookup_path,
                request,
            } => {
                let Some(resolve_options_context) = self.resolve_options_context else {
                    bail!("Resolve options are not available in this context");
                };
                let lookup_path = self.cwd.join(lookup_path);
                let request = Request::parse(Value::new(Pattern::Constant(request)));
                let options = resolve_options(lookup_path, resolve_options_context);

                let options = apply_webpack_resolve_options(options, webpack_options);

                let resolved = resolve(
                    lookup_path,
                    Value::new(ReferenceType::Undefined),
                    request,
                    options,
                );
                if let Some(source) = *resolved.first_source().await? {
                    if let Some(path) = self
                        .cwd
                        .await?
                        .get_relative_path_to(&*source.ident().path().await?)
                    {
                        Ok(ResponseMessage::Resolve { path })
                    } else {
                        bail!(
                            "Resolving {} in {} ends up on a different filesystem",
                            request.to_string().await?,
                            lookup_path.to_string().await?
                        );
                    }
                } else {
                    bail!(
                        "Unable to resolve {} in {}",
                        request.to_string().await?,
                        lookup_path.to_string().await?
                    );
                }
            }
        }
    }
}

#[turbo_tasks::function]
async fn apply_webpack_resolve_options(
    resolve_options: Vc<ResolveOptions>,
    webpack_resolve_options: WebpackResolveOptions,
) -> Result<Vc<ResolveOptions>> {
    let mut resolve_options = resolve_options.await?.clone_value();
    if webpack_resolve_options.no_alias {
        resolve_options.import_map = None;
        resolve_options.fallback_import_map = None;
    }
    if let Some(alias_fields) = webpack_resolve_options.alias_fields {
        let mut old = resolve_options
            .in_package
            .extract_if(|field| matches!(field, ResolveInPackage::AliasField(..)))
            .collect::<Vec<_>>();
        for field in alias_fields {
            if field == "..." {
                resolve_options.in_package.extend(take(&mut old));
            } else {
                resolve_options
                    .in_package
                    .push(ResolveInPackage::AliasField(field));
            }
        }
    }
    if let Some(condition_names) = webpack_resolve_options.condition_names {
        for conditions in get_condition_maps(&mut resolve_options) {
            let mut old = take(conditions);
            for name in &condition_names {
                if name == "..." {
                    conditions.extend(take(&mut old));
                } else {
                    conditions.insert(name.clone(), ConditionValue::Set);
                }
            }
        }
    }
    if webpack_resolve_options.no_package_json {
        resolve_options.into_package.retain(|item| {
            !matches!(
                item,
                ResolveIntoPackage::ExportsField { .. } | ResolveIntoPackage::MainField { .. }
            )
        });
    }
    if let Some(mut extensions) = webpack_resolve_options.extensions {
        if let Some(pos) = extensions.iter().position(|ext| ext == "...") {
            extensions.splice(pos..=pos, take(&mut resolve_options.extensions));
        }
        resolve_options.extensions = extensions;
    }
    if let Some(main_fields) = webpack_resolve_options.main_fields {
        let mut old = resolve_options
            .into_package
            .extract_if(|field| matches!(field, ResolveIntoPackage::MainField { .. }))
            .collect::<Vec<_>>();
        for field in main_fields {
            if field == "..." {
                resolve_options.into_package.extend(take(&mut old));
            } else {
                resolve_options
                    .into_package
                    .push(ResolveIntoPackage::MainField { field });
            }
        }
    }
    if webpack_resolve_options.no_exports_field {
        resolve_options
            .into_package
            .retain(|field| !matches!(field, ResolveIntoPackage::ExportsField { .. }));
    }
    if let Some(main_files) = webpack_resolve_options.main_files {
        resolve_options.default_files = main_files;
    }
    if webpack_resolve_options.no_modules {
        resolve_options.modules.clear();
    }
    if webpack_resolve_options.prefer_relative {
        resolve_options.prefer_relative = true;
    }
    Ok(resolve_options.cell())
}

/// An issue that occurred while evaluating node code.
#[turbo_tasks::value(shared)]
pub struct BuildDependencyIssue {
    pub context_ident: Vc<AssetIdent>,
    pub path: Vc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl Issue for BuildDependencyIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        IssueSeverity::Warning.into()
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text("Build dependencies are not yet supported".to_string()).cell()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Unsupported.cell()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.context_ident.path()
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<OptionStyledString>> {
        Ok(Vc::cell(Some(StyledString::Line(vec![
            StyledString::Text("The file at ".to_string()),
            StyledString::Code(self.path.await?.to_string()),
            StyledString::Text(" is a build dependency, which is not yet implemented.
Changing this file or any dependency will not be recognized and might require restarting the server".to_string()),
        ]).cell())))
    }
}

/// A hack to invalidate when any file in a directory changes. Need to be
/// awaited before files are accessed.
#[turbo_tasks::function]
async fn dir_dependency(glob: Vc<ReadGlobResult>) -> Result<Vc<Completion>> {
    let shallow = dir_dependency_shallow(glob);
    let glob = glob.await?;
    glob.inner
        .values()
        .map(|&inner| dir_dependency(inner))
        .try_join()
        .await?;
    shallow.await?;
    Ok(Completion::new())
}

#[turbo_tasks::function]
async fn dir_dependency_shallow(glob: Vc<ReadGlobResult>) -> Result<Vc<Completion>> {
    let glob = glob.await?;
    for item in glob.results.values() {
        // Reading all files to add itself as dependency
        match *item {
            DirectoryEntry::File(file) => {
                file.track().await?;
            }
            DirectoryEntry::Directory(dir) => {
                dir_dependency(dir.read_glob(Glob::new("**".to_string()), false)).await?;
            }
            DirectoryEntry::Symlink(symlink) => {
                symlink.read_link().await?;
            }
            DirectoryEntry::Other(other) => {
                other.get_type().await?;
            }
            DirectoryEntry::Error => {}
        }
    }
    Ok(Completion::new())
}

#[turbo_tasks::value(shared)]
pub struct EvaluateEmittedErrorIssue {
    pub file_path: Vc<FileSystemPath>,
    pub severity: Vc<IssueSeverity>,
    pub error: StructuredError,
    pub assets_for_source_mapping: Vc<AssetsForSourceMapping>,
    pub assets_root: Vc<FileSystemPath>,
    pub project_dir: Vc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl Issue for EvaluateEmittedErrorIssue {
    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.file_path
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Transform.cell()
    }

    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        self.severity
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text("Issue while running loader".to_string()).cell()
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<OptionStyledString>> {
        Ok(Vc::cell(Some(
            StyledString::Text(
                self.error
                    .print(
                        self.assets_for_source_mapping,
                        self.assets_root,
                        self.project_dir,
                        FormattingMode::Plain,
                    )
                    .await?,
            )
            .cell(),
        )))
    }
}
