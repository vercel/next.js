use std::mem::take;

use anyhow::{Context, Result, bail};
use base64::Engine;
use either::Either;
use futures::try_join;
use serde::{Deserialize, Serialize};
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use serde_with::serde_as;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    Completion, NonLocalValue, OperationValue, OperationVc, ResolvedVc, TaskInput, TryJoinIterExt,
    ValueToString, Vc, trace::TraceRawVcs,
};
use turbo_tasks_bytes::stream::SingleValue;
use turbo_tasks_env::ProcessEnv;
use turbo_tasks_fs::{
    File, FileContent, FileSystemPath,
    glob::{Glob, GlobOptions},
    json::parse_json_with_source_context,
    rope::Rope,
};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::ChunkingContext,
    context::{AssetContext, ProcessResult},
    file_source::FileSource,
    ident::AssetIdent,
    issue::{
        Issue, IssueExt, IssueSeverity, IssueSource, IssueStage, OptionIssueSource,
        OptionStyledString, StyledString,
    },
    module::Module,
    reference_type::{InnerAssets, ReferenceType},
    resolve::{
        options::{ConditionValue, ResolveInPackage, ResolveIntoPackage, ResolveOptions},
        parse::Request,
        pattern::Pattern,
        resolve,
    },
    source::Source,
    source_map::{
        GenerateSourceMap, OptionStringifiedSourceMap, utils::resolve_source_map_sources,
    },
    source_transform::SourceTransform,
    virtual_source::VirtualSource,
};
use turbopack_resolve::{
    ecmascript::get_condition_maps, resolve::resolve_options,
    resolve_options_context::ResolveOptionsContext,
};

use super::util::{EmittedAsset, emitted_assets_to_virtual_sources};
use crate::{
    AssetsForSourceMapping,
    debug::should_debug,
    embed_js::embed_file_path,
    evaluate::{
        EnvVarTracking, EvaluateContext, EvaluationIssue, JavaScriptEvaluation,
        JavaScriptStreamSender, compute, custom_evaluate, get_evaluate_pool,
    },
    execution_context::ExecutionContext,
    pool::{FormattingMode, NodeJsPool},
    source_map::{StackFrame, StructuredError},
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

#[derive(
    Clone, PartialEq, Eq, Debug, TraceRawVcs, Serialize, Deserialize, NonLocalValue, OperationValue,
)]
pub struct WebpackLoaderItem {
    pub loader: RcStr,
    #[serde(default)]
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
    source_maps: bool,
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
        source_maps: bool,
    ) -> Vc<Self> {
        WebpackLoaders {
            evaluate_context,
            execution_context,
            loaders,
            rename_as,
            resolve_options_context,
            source_maps,
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
    async fn generate_source_map(self: Vc<Self>) -> Result<Vc<OptionStringifiedSourceMap>> {
        Ok(*self.process().await?.source_map)
    }
}

#[turbo_tasks::value]
struct ProcessWebpackLoadersResult {
    content: ResolvedVc<AssetContent>,
    source_map: ResolvedVc<OptionStringifiedSourceMap>,
    assets: Vec<ResolvedVc<VirtualSource>>,
}

#[turbo_tasks::function]
async fn webpack_loaders_executor(
    evaluate_context: Vc<Box<dyn AssetContext>>,
) -> Result<Vc<ProcessResult>> {
    Ok(evaluate_context.process(
        Vc::upcast(FileSource::new(
            embed_file_path(rcstr!("transforms/webpack-loaders.ts"))
                .owned()
                .await?,
        )),
        ReferenceType::Internal(InnerAssets::empty().to_resolved().await?),
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
        } = &*transform.execution_context.await?;
        let source_content = this.source.content();
        let AssetContent::File(file) = *source_content.await? else {
            bail!("Webpack Loaders transform only support transforming files");
        };
        let FileContent::Content(file_content) = &*file.await? else {
            return Ok(ProcessWebpackLoadersResult {
                content: AssetContent::File(FileContent::NotFound.resolved_cell()).resolved_cell(),
                assets: Vec::new(),
                source_map: ResolvedVc::cell(None),
            }
            .cell());
        };

        // If the content is not a valid string (e.g. binary file), handle the error and pass a
        // Buffer to Webpack instead of a Base64 string so the build process doesn't crash.
        let content: JsonValue = match file_content.content().to_str() {
            Ok(utf8_str) => utf8_str.to_string().into(),
            Err(_) => JsonValue::Object(JsonMap::from_iter(std::iter::once((
                "binary".to_string(),
                JsonValue::from(
                    base64::engine::general_purpose::STANDARD
                        .encode(file_content.content().to_bytes()),
                ),
            )))),
        };
        let evaluate_context = transform.evaluate_context;

        let webpack_loaders_executor = webpack_loaders_executor(*evaluate_context)
            .module()
            .to_resolved()
            .await?;

        let resource_fs_path = this.source.ident().path().await?;
        let Some(resource_path) = project_path.get_relative_path_to(&resource_fs_path) else {
            bail!(format!(
                "Resource path \"{}\" need to be on project filesystem \"{}\"",
                resource_fs_path, project_path
            ));
        };
        let loaders = transform.loaders.await?;
        let config_value = evaluate_webpack_loader(WebpackLoaderContext {
            module_asset: webpack_loaders_executor,
            cwd: project_path.clone(),
            env: *env,
            context_source_for_issue: this.source,
            asset_context: evaluate_context,
            chunking_context: *chunking_context,
            resolve_options_context: Some(transform.resolve_options_context),
            args: vec![
                ResolvedVc::cell(content),
                // We need to pass the query string to the loader
                ResolvedVc::cell(resource_path.to_string().into()),
                ResolvedVc::cell(this.source.ident().await?.query.to_string().into()),
                ResolvedVc::cell(json!(*loaders)),
                ResolvedVc::cell(transform.source_maps.into()),
            ],
            additional_invalidation: Completion::immutable().to_resolved().await?,
        })
        .await?;

        let SingleValue::Single(val) = config_value.try_into_single().await? else {
            // An error happened, which has already been converted into an issue.
            return Ok(ProcessWebpackLoadersResult {
                content: AssetContent::File(FileContent::NotFound.resolved_cell()).resolved_cell(),
                assets: Vec::new(),
                source_map: ResolvedVc::cell(None),
            }
            .cell());
        };
        let processed: WebpackLoadersProcessingResult = parse_json_with_source_context(
            val.to_str()?,
        )
        .context("Unable to deserializate response from webpack loaders transform operation")?;

        // handle SourceMap
        let source_map = if !transform.source_maps {
            None
        } else {
            processed
                .map
                .map(|source_map| Rope::from(source_map.into_owned()))
        };
        let source_map = resolve_source_map_sources(source_map.as_ref(), &resource_fs_path).await?;

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
            source_map: ResolvedVc::cell(source_map),
        }
        .cell())
    }
}

#[turbo_tasks::function]
pub(crate) async fn evaluate_webpack_loader(
    webpack_loader_context: WebpackLoaderContext,
) -> Result<Vc<JavaScriptEvaluation>> {
    custom_evaluate(webpack_loader_context).await
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
    // Sent to inform Turbopack about the dependencies of the task.
    // All fields are `default` since it is ok for the client to
    // simply omit instead of sending empty arrays.
    #[serde(rename_all = "camelCase")]
    Dependencies {
        #[serde(default)]
        env_variables: Vec<RcStr>,
        #[serde(default)]
        file_paths: Vec<RcStr>,
        #[serde(default)]
        directories: Vec<(RcStr, RcStr)>,
        #[serde(default)]
        build_file_paths: Vec<RcStr>,
    },
    EmittedError {
        severity: IssueSeverity,
        error: StructuredError,
    },
    Log {
        logs: Vec<LogInfo>,
    },
}

#[derive(Debug, Clone, TaskInput, Hash, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs)]
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
    #[serde(rename_all = "camelCase")]
    TrackFileRead { file: RcStr },
}

#[derive(Serialize, Debug)]
#[serde(untagged)]
pub enum ResponseMessage {
    Resolve { path: RcStr },
    // Only used for tracking invalidations, no content is returned.
    TrackFileRead {},
}

#[derive(Clone, PartialEq, Eq, Hash, TaskInput, Serialize, Deserialize, Debug, TraceRawVcs)]
pub struct WebpackLoaderContext {
    pub module_asset: ResolvedVc<Box<dyn Module>>,
    pub cwd: FileSystemPath,
    pub env: ResolvedVc<Box<dyn ProcessEnv>>,
    pub context_source_for_issue: ResolvedVc<Box<dyn Source>>,
    pub asset_context: ResolvedVc<Box<dyn AssetContext>>,
    pub chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    pub resolve_options_context: Option<ResolvedVc<ResolveOptionsContext>>,
    pub args: Vec<ResolvedVc<JsonValue>>,
    pub additional_invalidation: ResolvedVc<Completion>,
}

impl EvaluateContext for WebpackLoaderContext {
    type InfoMessage = InfoMessage;
    type RequestMessage = RequestMessage;
    type ResponseMessage = ResponseMessage;
    type State = Vec<LogInfo>;

    async fn compute(self, sender: Vc<JavaScriptStreamSender>) -> Result<()> {
        compute_webpack_loader_evaluation(self, sender)
            .as_side_effect()
            .await
    }

    fn pool(&self) -> OperationVc<crate::pool::NodeJsPool> {
        get_evaluate_pool(
            self.module_asset,
            self.cwd.clone(),
            self.env,
            self.asset_context,
            self.chunking_context,
            None,
            self.additional_invalidation,
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
        self.cwd.clone().cell()
    }

    fn keep_alive(&self) -> bool {
        true
    }

    async fn emit_error(&self, error: StructuredError, pool: &NodeJsPool) -> Result<()> {
        EvaluationIssue {
            error,
            source: IssueSource::from_source_only(self.context_source_for_issue),
            assets_for_source_mapping: pool.assets_for_source_mapping,
            assets_root: pool.assets_root.clone(),
            root_path: self.chunking_context.root_path().owned().await?,
        }
        .resolved_cell()
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
            InfoMessage::Dependencies {
                env_variables,
                file_paths,
                directories,
                build_file_paths,
            } => {
                // We only process these dependencies to help with tracking, so if it is disabled
                // dont bother.
                if turbo_tasks::turbo_tasks().is_tracking_dependencies() {
                    // Track dependencies of the loader task
                    // TODO: Because these are reported _after_ the loader actually read the
                    // dependency there is a race condition where we may miss
                    // updates that race with the loader execution.

                    // Track all the subscriptions in parallel, since certain loaders like tailwind
                    // might add thousands of subscriptions.
                    let env_subscriptions = env_variables
                        .iter()
                        .map(|e| self.env.read(e.clone()))
                        .try_join();
                    let file_subscriptions = file_paths
                        .iter()
                        .map(|p| async move { self.cwd.join(p)?.read().await })
                        .try_join();
                    let directory_subscriptions = directories
                        .iter()
                        .map(|(dir, glob)| async move {
                            self.cwd
                                .join(dir)?
                                .track_glob(Glob::new(glob.clone(), GlobOptions::default()), false)
                                .await
                        })
                        .try_join();
                    try_join!(
                        env_subscriptions,
                        file_subscriptions,
                        directory_subscriptions
                    )?;

                    for build_path in build_file_paths {
                        let build_path = self.cwd.join(&build_path)?;
                        BuildDependencyIssue {
                            source: IssueSource::from_source_only(self.context_source_for_issue),
                            path: build_path,
                        }
                        .resolved_cell()
                        .emit();
                    }
                }
            }
            InfoMessage::EmittedError { error, severity } => {
                EvaluateEmittedErrorIssue {
                    source: IssueSource::from_source_only(self.context_source_for_issue),
                    error,
                    severity,
                    assets_for_source_mapping: pool.assets_for_source_mapping,
                    assets_root: pool.assets_root.clone(),
                    project_dir: self.chunking_context.root_path().owned().await?,
                }
                .resolved_cell()
                .emit();
            }
            InfoMessage::Log { logs } => {
                state.extend(logs);
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
                let lookup_path = self.cwd.join(&lookup_path)?;
                let request = Request::parse(Pattern::Constant(request));
                let options = resolve_options(lookup_path.clone(), *resolve_options_context);

                let options = apply_webpack_resolve_options(options, webpack_options);

                let resolved = resolve(
                    lookup_path.clone(),
                    ReferenceType::Undefined,
                    request,
                    options,
                );

                if let Some(source) = *resolved.first_source().await? {
                    if let Some(path) = self
                        .cwd
                        .get_relative_path_to(&*source.ident().path().await?)
                    {
                        Ok(ResponseMessage::Resolve { path })
                    } else {
                        bail!(
                            "Resolving {} in {} ends up on a different filesystem",
                            request.to_string().await?,
                            lookup_path.value_to_string().await?
                        );
                    }
                } else {
                    bail!(
                        "Unable to resolve {} in {}",
                        request.to_string().await?,
                        lookup_path.value_to_string().await?
                    );
                }
            }
            RequestMessage::TrackFileRead { file } => {
                // Ignore result, we read on the JS side again to prevent some IPC overhead. Still
                // await the read though to cover at least one class of race conditions.
                let _ = &*self.cwd.join(&file)?.read().await?;
                Ok(ResponseMessage::TrackFileRead {})
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
                source: IssueSource::from_source_only(self.context_source_for_issue),
                logging: logs,
                severity: if has_errors {
                    IssueSeverity::Error
                } else {
                    IssueSeverity::Warning
                },
                assets_for_source_mapping: pool.assets_for_source_mapping,
                assets_root: pool.assets_root.clone(),
                project_dir: self.chunking_context.root_path().owned().await?,
            }
            .resolved_cell()
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
    let mut resolve_options = resolve_options.owned().await?;
    if let Some(alias_fields) = webpack_resolve_options.alias_fields {
        let mut old = resolve_options
            .in_package
            .extract_if(0.., |field| {
                matches!(field, ResolveInPackage::AliasField(..))
            })
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
            .extract_if(0.., |field| {
                matches!(field, ResolveIntoPackage::MainField { .. })
            })
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
    pub path: FileSystemPath,
    pub source: IssueSource,
}

#[turbo_tasks::value_impl]
impl Issue for BuildDependencyIssue {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Warning
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text(rcstr!("Build dependencies are not yet supported")).cell()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Unsupported.cell()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.source.file_path()
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<OptionStyledString>> {
        Ok(Vc::cell(Some(
            StyledString::Line(vec![
                StyledString::Text(rcstr!("The file at ")),
                StyledString::Code(self.path.to_string().into()),
                StyledString::Text(
                    " is a build dependency, which is not yet implemented.
    Changing this file or any dependency will not be recognized and might require restarting the \
                     server"
                        .into(),
                ),
            ])
            .resolved_cell(),
        )))
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionIssueSource> {
        Vc::cell(Some(self.source))
    }
}

#[turbo_tasks::value(shared)]
pub struct EvaluateEmittedErrorIssue {
    pub source: IssueSource,
    pub severity: IssueSeverity,
    pub error: StructuredError,
    pub assets_for_source_mapping: ResolvedVc<AssetsForSourceMapping>,
    pub assets_root: FileSystemPath,
    pub project_dir: FileSystemPath,
}

#[turbo_tasks::value_impl]
impl Issue for EvaluateEmittedErrorIssue {
    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.source.file_path()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Transform.cell()
    }

    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text(rcstr!("Issue while running loader")).cell()
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<OptionStyledString>> {
        Ok(Vc::cell(Some(
            StyledString::Text(
                self.error
                    .print(
                        *self.assets_for_source_mapping,
                        self.assets_root.clone(),
                        self.project_dir.clone(),
                        FormattingMode::Plain,
                    )
                    .await?
                    .into(),
            )
            .resolved_cell(),
        )))
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionIssueSource> {
        Vc::cell(Some(self.source))
    }
}

#[turbo_tasks::value(shared)]
pub struct EvaluateErrorLoggingIssue {
    pub source: IssueSource,
    pub severity: IssueSeverity,
    #[turbo_tasks(trace_ignore)]
    pub logging: Vec<LogInfo>,
    pub assets_for_source_mapping: ResolvedVc<AssetsForSourceMapping>,
    pub assets_root: FileSystemPath,
    pub project_dir: FileSystemPath,
}

#[turbo_tasks::value_impl]
impl Issue for EvaluateErrorLoggingIssue {
    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.source.file_path()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Transform.cell()
    }

    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text(rcstr!("Error logging while running loader")).cell()
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
                LogType::Clear => StyledString::Strong(rcstr!("---")),
                _ => {
                    unimplemented!("{:?} is not implemented", log.log_type)
                }
            })
            .collect::<Vec<_>>();
        Vc::cell(Some(StyledString::Stack(lines).resolved_cell()))
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionIssueSource> {
        Vc::cell(Some(self.source))
    }
}
