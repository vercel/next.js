use std::mem::take;

use anyhow::{bail, Context, Result};
use async_trait::async_trait;
use either::Either;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};
use serde_with::serde_as;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    trace::TraceRawVcs, Completion, ResolvedVc, TaskInput, TryJoinIterExt, Value, ValueToString, Vc,
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
    source_map::{GenerateSourceMap, OptionSourceMap, SourceMap},
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
        compute, custom_evaluate, get_evaluate_pool, EnvVarTracking, EvaluateContext,
        EvaluationIssue, JavaScriptEvaluation, JavaScriptStreamSender,
    },
    execution_context::ExecutionContext,
    pool::{FormattingMode, NodeJsPool},
    source_map::{StackFrame, StructuredError},
    AssetsForSourceMapping,
};

#[serde_as]
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
struct BytesBase64 {
    #[serde_as(as = "serde_with::base64::Base64")]
    binary: Vec<u8>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
#[turbo_tasks::value(serialization = "custom")]
struct WebpackLoadersProcessingResult {
    #[serde(with = "either::serde_untagged")]
    #[turbo_tasks(debug_ignore, trace_ignore)]
    source: Either<RcStr, BytesBase64>,
    map: Option<RcStr>,
    #[turbo_tasks(trace_ignore)]
    assets: Option<Vec<EmittedAsset>>,
}

#[derive(Clone, PartialEq, Eq, Debug, TraceRawVcs, Serialize, Deserialize)]
pub struct WebpackLoaderItem {
    pub loader: RcStr,
    #[turbo_tasks(trace_ignore)]
    pub options: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone)]
#[turbo_tasks::value(shared, transparent)]
pub struct WebpackLoaderItems(pub Vec<WebpackLoaderItem>);

#[turbo_tasks::value]
pub struct WebpackLoaders {
    evaluate_context: ResolvedVc<Box<dyn AssetContext>>,
    execution_context: ResolvedVc<ExecutionContext>,
    loaders: ResolvedVc<WebpackLoaderItems>,
    rename_as: Option<RcStr>,
    resolve_options_context: ResolvedVc<ResolveOptionsContext>,
}

#[turbo_tasks::value_impl]
impl WebpackLoaders {
    #[turbo_tasks::function]
    pub fn new(
        evaluate_context: ResolvedVc<Box<dyn AssetContext>>,
        execution_context: ResolvedVc<ExecutionContext>,
        loaders: ResolvedVc<WebpackLoaderItems>,
        rename_as: Option<RcStr>,
        resolve_options_context: ResolvedVc<ResolveOptionsContext>,
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
    fn transform(
        self: ResolvedVc<Self>,
        source: ResolvedVc<Box<dyn Source>>,
    ) -> Vc<Box<dyn Source>> {
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
    transform: ResolvedVc<WebpackLoaders>,
    source: ResolvedVc<Box<dyn Source>>,
}

#[turbo_tasks::value_impl]
impl Source for WebpackLoadersProcessedAsset {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(
            if let Some(rename_as) = self.transform.await?.rename_as.as_deref() {
                self.source.ident().rename_as(rename_as.into())
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
        Ok(*self.process().await?.content)
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for WebpackLoadersProcessedAsset {
    #[turbo_tasks::function]
    async fn generate_source_map(self: Vc<Self>) -> Result<Vc<OptionSourceMap>> {
        Ok(Vc::cell(self.process().await?.source_map.map(|v| *v)))
    }
}

#[turbo_tasks::value]
struct ProcessWebpackLoadersResult {
    content: ResolvedVc<AssetContent>,
    source_map: Option<ResolvedVc<SourceMap>>,
    assets: Vec<ResolvedVc<VirtualSource>>,
}

#[turbo_tasks::function]
async fn webpack_loaders_executor(
    evaluate_context: Vc<Box<dyn AssetContext>>,
) -> Result<Vc<ProcessResult>> {
    Ok(evaluate_context.process(
        Vc::upcast(FileSource::new(embed_file_path(
            "transforms/webpack-loaders.ts".into(),
        ))),
        Value::new(ReferenceType::Internal(
            InnerAssets::empty().to_resolved().await?,
        )),
    ))
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
                content: AssetContent::File(FileContent::NotFound.resolved_cell()).resolved_cell(),
                assets: Vec::new(),
                source_map: None,
            }
            .cell());
        };
        let content = content.content().to_str()?;
        let evaluate_context = transform.evaluate_context;

        let webpack_loaders_executor = webpack_loaders_executor(*evaluate_context)
            .module()
            .to_resolved()
            .await?;
        let resource_fs_path = this.source.ident().path();
        let resource_fs_path_ref = resource_fs_path.await?;
        let Some(resource_path) = project_path
            .await?
            .get_relative_path_to(&resource_fs_path_ref)
        else {
            bail!(format!(
                "Resource path \"{}\" need to be on project filesystem \"{}\"",
                resource_fs_path_ref,
                project_path.await?
            ));
        };
        let loaders = transform.loaders.await?;
        let config_value = evaluate_webpack_loader(WebpackLoaderContext {
            module_asset: webpack_loaders_executor,
            cwd: project_path,
            env,
            context_ident_for_issue: this.source.ident().to_resolved().await?,
            asset_context: evaluate_context,
            chunking_context,
            resolve_options_context: Some(transform.resolve_options_context),
            args: vec![
                ResolvedVc::cell(content.into()),
                // We need to pass the query string to the loader
                ResolvedVc::cell(resource_path.to_string().into()),
                ResolvedVc::cell(this.source.ident().query().await?.to_string().into()),
                ResolvedVc::cell(json!(*loaders)),
            ],
            additional_invalidation: Completion::immutable().to_resolved().await?,
        })
        .await?;

        let SingleValue::Single(val) = config_value.try_into_single().await? else {
            // An error happened, which has already been converted into an issue.
            return Ok(ProcessWebpackLoadersResult {
                content: AssetContent::File(FileContent::NotFound.resolved_cell()).resolved_cell(),
                assets: Vec::new(),
                source_map: None,
            }
            .cell());
        };
        let processed: WebpackLoadersProcessingResult = parse_json_with_source_context(
            val.to_str()?,
        )
        .context("Unable to deserializate response from webpack loaders transform operation")?;

        // handle SourceMap
        let source_map = if let Some(source_map) = processed.map {
            SourceMap::new_from_file_content(FileContent::Content(File::from(source_map)).cell())
                .await?
                .map(|source_map| source_map.resolved_cell())
        } else {
            None
        };
        let file = match processed.source {
            Either::Left(str) => File::from(str),
            Either::Right(bytes) => File::from(bytes.binary),
        };
        let assets = emitted_assets_to_virtual_sources(processed.assets).await?;

        let content =
            AssetContent::File(FileContent::Content(file).resolved_cell()).resolved_cell();
        Ok(ProcessWebpackLoadersResult {
            content,
            assets,
            source_map,
        }
        .cell())
    }
}

#[turbo_tasks::function]
pub(crate) fn evaluate_webpack_loader(
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

#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum LogType {
    Error,
    Warn,
    Info,
    Log,
    Debug,
    Trace,
    Group,
    GroupCollapsed,
    GroupEnd,
    Profile,
    ProfileEnd,
    Time,
    Clear,
    Status,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LogInfo {
    time: u64,
    log_type: LogType,
    args: Vec<JsonValue>,
    trace: Option<Vec<StackFrame<'static>>>,
}

#[derive(Deserialize, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum InfoMessage {
    FileDependency {
        path: RcStr,
    },
    BuildDependency {
        path: RcStr,
    },
    DirDependency {
        path: RcStr,
        glob: RcStr,
    },
    EnvDependency {
        name: RcStr,
    },
    EmittedError {
        severity: IssueSeverity,
        error: StructuredError,
    },
    Log(LogInfo),
}

#[derive(Debug, Clone, TaskInput, Hash, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebpackResolveOptions {
    alias_fields: Option<Vec<RcStr>>,
    condition_names: Option<Vec<RcStr>>,
    no_package_json: bool,
    extensions: Option<Vec<RcStr>>,
    main_fields: Option<Vec<RcStr>>,
    no_exports_field: bool,
    main_files: Option<Vec<RcStr>>,
    no_modules: bool,
    prefer_relative: bool,
}

#[derive(Deserialize, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum RequestMessage {
    #[serde(rename_all = "camelCase")]
    Resolve {
        options: WebpackResolveOptions,
        lookup_path: RcStr,
        request: RcStr,
    },
}

#[derive(Serialize, Debug)]
#[serde(untagged)]
pub enum ResponseMessage {
    Resolve { path: RcStr },
}

#[derive(Clone, PartialEq, Eq, Hash, TaskInput, Serialize, Deserialize, Debug)]
pub struct WebpackLoaderContext {
    pub module_asset: ResolvedVc<Box<dyn Module>>,
    pub cwd: ResolvedVc<FileSystemPath>,
    pub env: ResolvedVc<Box<dyn ProcessEnv>>,
    pub context_ident_for_issue: ResolvedVc<AssetIdent>,
    pub asset_context: ResolvedVc<Box<dyn AssetContext>>,
    pub chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    pub resolve_options_context: Option<ResolvedVc<ResolveOptionsContext>>,
    pub args: Vec<ResolvedVc<JsonValue>>,
    pub additional_invalidation: ResolvedVc<Completion>,
}

#[async_trait]
impl EvaluateContext for WebpackLoaderContext {
    type InfoMessage = InfoMessage;
    type RequestMessage = RequestMessage;
    type ResponseMessage = ResponseMessage;
    type State = Vec<LogInfo>;

    fn compute(self, sender: Vc<JavaScriptStreamSender>) {
        let _ = compute_webpack_loader_evaluation(self, sender);
    }

    fn pool(&self) -> Vc<crate::pool::NodeJsPool> {
        get_evaluate_pool(
            *self.module_asset,
            *self.cwd,
            *self.env,
            *self.asset_context,
            *self.chunking_context,
            None,
            *self.additional_invalidation,
            should_debug("webpack_loader"),
            // Env vars are read untracked, since we want a more granular dependency on certain env
            // vars only. So the runtime code tracks which env vars are read and send a dependency
            // message for them.
            EnvVarTracking::Untracked,
        )
    }

    fn args(&self) -> &[ResolvedVc<serde_json::Value>] {
        &self.args
    }

    fn cwd(&self) -> Vc<turbo_tasks_fs::FileSystemPath> {
        *self.cwd
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
            project_dir: self
                .chunking_context
                .context_path()
                .root()
                .to_resolved()
                .await?,
        }
        .cell()
        .emit();
        Ok(())
    }

    async fn info(
        &self,
        state: &mut Self::State,
        data: Self::InfoMessage,
        pool: &NodeJsPool,
    ) -> Result<()> {
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
                    path: self.cwd.join(path).to_resolved().await?,
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
            InfoMessage::EnvDependency { name } => {
                self.env.read(name).await?;
            }
            InfoMessage::EmittedError { error, severity } => {
                EvaluateEmittedErrorIssue {
                    file_path: self.context_ident_for_issue.path().to_resolved().await?,
                    error,
                    severity: severity.resolved_cell(),
                    assets_for_source_mapping: pool.assets_for_source_mapping,
                    assets_root: pool.assets_root,
                    project_dir: self
                        .chunking_context
                        .context_path()
                        .root()
                        .to_resolved()
                        .await?,
                }
                .cell()
                .emit();
            }
            InfoMessage::Log(log) => {
                state.push(log);
            }
        }
        Ok(())
    }

    async fn request(
        &self,
        _state: &mut Self::State,
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
                let options = resolve_options(lookup_path, *resolve_options_context);

                let options = apply_webpack_resolve_options(options, webpack_options);

                let resolved = resolve(
                    lookup_path,
                    Value::new(ReferenceType::Undefined),
                    request,
                    options,
                );

                let request_str = request.to_string().await?;
                let lookup_path_str = lookup_path.to_string().await?;
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
                            request_str,
                            lookup_path_str
                        );
                    }
                } else {
                    bail!("Unable to resolve {} in {}", request_str, lookup_path_str);
                }
            }
        }
    }

    async fn finish(&self, state: Self::State, pool: &NodeJsPool) -> Result<()> {
        let has_errors = state.iter().any(|log| log.log_type == LogType::Error);
        let has_warnings = state.iter().any(|log| log.log_type == LogType::Warn);
        if has_errors || has_warnings {
            let logs = state
                .into_iter()
                .filter(|log| {
                    matches!(
                        log.log_type,
                        LogType::Error
                            | LogType::Warn
                            | LogType::Info
                            | LogType::Log
                            | LogType::Clear,
                    )
                })
                .collect();

            EvaluateErrorLoggingIssue {
                file_path: self.context_ident_for_issue.path().to_resolved().await?,
                logging: logs,
                severity: if has_errors {
                    IssueSeverity::Error.resolved_cell()
                } else {
                    IssueSeverity::Warning.resolved_cell()
                },
                assets_for_source_mapping: pool.assets_for_source_mapping,
                assets_root: pool.assets_root,
                project_dir: self
                    .chunking_context
                    .context_path()
                    .root()
                    .to_resolved()
                    .await?,
            }
            .cell()
            .emit();
        }
        Ok(())
    }
}

#[turbo_tasks::function]
async fn apply_webpack_resolve_options(
    resolve_options: Vc<ResolveOptions>,
    webpack_resolve_options: WebpackResolveOptions,
) -> Result<Vc<ResolveOptions>> {
    let mut resolve_options = resolve_options.await?.clone_value();
    if let Some(alias_fields) = webpack_resolve_options.alias_fields {
        let mut old = resolve_options
            .in_package
            .extract_if(|field| matches!(field, ResolveInPackage::AliasField(..)))
            .collect::<Vec<_>>();
        for field in alias_fields {
            if &*field == "..." {
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
            if &*field == "..." {
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
    pub context_ident: ResolvedVc<AssetIdent>,
    pub path: ResolvedVc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl Issue for BuildDependencyIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        IssueSeverity::Warning.into()
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text("Build dependencies are not yet supported".into()).cell()
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
        Ok(Vc::cell(Some(
            StyledString::Line(vec![
                StyledString::Text("The file at ".into()),
                StyledString::Code(self.path.await?.to_string().into()),
                StyledString::Text(
                    " is a build dependency, which is not yet implemented.
    Changing this file or any dependency will not be recognized and might require restarting the \
                     server"
                        .into(),
                ),
            ])
            .cell(),
        )))
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
        .map(|&inner| dir_dependency(*inner))
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
                file.read().await?;
            }
            DirectoryEntry::Directory(dir) => {
                dir_dependency(dir.read_glob(Glob::new("**".into()), false)).await?;
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
    pub file_path: ResolvedVc<FileSystemPath>,
    pub severity: ResolvedVc<IssueSeverity>,
    pub error: StructuredError,
    pub assets_for_source_mapping: ResolvedVc<AssetsForSourceMapping>,
    pub assets_root: ResolvedVc<FileSystemPath>,
    pub project_dir: ResolvedVc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl Issue for EvaluateEmittedErrorIssue {
    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        *self.file_path
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Transform.cell()
    }

    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        *self.severity
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text("Issue while running loader".into()).cell()
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<OptionStyledString>> {
        Ok(Vc::cell(Some(
            StyledString::Text(
                self.error
                    .print(
                        *self.assets_for_source_mapping,
                        *self.assets_root,
                        *self.project_dir,
                        FormattingMode::Plain,
                    )
                    .await?
                    .into(),
            )
            .cell(),
        )))
    }
}

#[turbo_tasks::value(shared)]
pub struct EvaluateErrorLoggingIssue {
    pub file_path: ResolvedVc<FileSystemPath>,
    pub severity: ResolvedVc<IssueSeverity>,
    #[turbo_tasks(trace_ignore)]
    pub logging: Vec<LogInfo>,
    pub assets_for_source_mapping: ResolvedVc<AssetsForSourceMapping>,
    pub assets_root: ResolvedVc<FileSystemPath>,
    pub project_dir: ResolvedVc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl Issue for EvaluateErrorLoggingIssue {
    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        *self.file_path
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Transform.cell()
    }

    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        *self.severity
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text("Error logging while running loader".into()).cell()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        fn fmt_args(prefix: String, args: &[JsonValue]) -> String {
            let mut iter = args.iter();
            let Some(first) = iter.next() else {
                return "".to_string();
            };
            let mut result = prefix;
            if let JsonValue::String(s) = first {
                result.push_str(s);
            } else {
                result.push_str(&first.to_string());
            }
            for arg in iter {
                result.push(' ');
                result.push_str(&arg.to_string());
            }
            result
        }
        let lines = self
            .logging
            .iter()
            .map(|log| match log.log_type {
                LogType::Error => {
                    StyledString::Strong(fmt_args("<e> ".to_string(), &log.args).into())
                }
                LogType::Warn => StyledString::Text(fmt_args("<w> ".to_string(), &log.args).into()),
                LogType::Info => StyledString::Text(fmt_args("<i> ".to_string(), &log.args).into()),
                LogType::Log => StyledString::Text(fmt_args("<l> ".to_string(), &log.args).into()),
                LogType::Clear => StyledString::Strong("---".into()),
                _ => {
                    unimplemented!("{:?} is not implemented", log.log_type)
                }
            })
            .collect::<Vec<_>>();
        Vc::cell(Some(StyledString::Stack(lines).cell()))
    }
}
