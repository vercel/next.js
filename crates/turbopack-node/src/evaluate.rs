use std::{collections::HashMap, thread::available_parallelism};

use anyhow::Result;
use turbo_tasks::{
    primitives::{JsonValueVc, StringVc},
    CompletionVc, TryJoinIterExt, Value, ValueToString,
};
use turbo_tasks_fs::{
    glob::GlobVc, rope::Rope, to_sys_path, DirectoryEntry, File, FileSystemPathVc, ReadGlobResultVc,
};
use turbopack_core::{
    asset::AssetVc,
    chunk::{dev::DevChunkingContextVc, ChunkGroupVc},
    context::AssetContextVc,
    issue::{Issue, IssueSeverity, IssueSeverityVc, IssueVc},
    source_asset::SourceAssetVc,
    virtual_asset::VirtualAssetVc,
};
use turbopack_ecmascript::{
    chunk::EcmascriptChunkPlaceablesVc, EcmascriptInputTransform, EcmascriptInputTransformsVc,
    EcmascriptModuleAssetType, EcmascriptModuleAssetVc, InnerAssetsVc,
};

use crate::{
    bootstrap::NodeJsBootstrapAsset,
    embed_js::embed_file_path,
    emit,
    pool::{NodeJsPool, NodeJsPoolVc},
    EvalJavaScriptIncomingMessage, EvalJavaScriptOutgoingMessage, StructuredError,
};

#[turbo_tasks::value(shared)]
#[derive(Clone)]
pub enum JavaScriptValue {
    Error,
    Value(Rope),
    // TODO, support stream in the future
    Stream(#[turbo_tasks(trace_ignore)] Vec<u8>),
}

#[turbo_tasks::function]
/// Pass the file you cared as `runtime_entries` to invalidate and reload the
/// evaluated result automatically.
pub async fn get_evaluate_pool(
    context_path: FileSystemPathVc,
    module_asset: AssetVc,
    cwd: FileSystemPathVc,
    context: AssetContextVc,
    intermediate_output_path: FileSystemPathVc,
    runtime_entries: Option<EcmascriptChunkPlaceablesVc>,
) -> Result<NodeJsPoolVc> {
    let chunking_context = DevChunkingContextVc::builder(
        context_path,
        intermediate_output_path,
        intermediate_output_path.join("chunks"),
        intermediate_output_path.join("assets"),
        context.environment(),
    )
    .build();

    let runtime_asset = EcmascriptModuleAssetVc::new(
        SourceAssetVc::new(embed_file_path("ipc/evaluate.ts")).into(),
        context,
        Value::new(EcmascriptModuleAssetType::Typescript),
        EcmascriptInputTransformsVc::cell(vec![EcmascriptInputTransform::TypeScript]),
        context.environment(),
    )
    .as_asset();

    let module_path = module_asset.path().await?;
    let path = intermediate_output_path.join(module_path.file_name());
    let entry_module = EcmascriptModuleAssetVc::new_with_inner_assets(
        VirtualAssetVc::new(
            runtime_asset.path().join("evaluate.js"),
            File::from(
                "import { run } from 'RUNTIME'; run((...args) => \
                 (require('INNER').default(...args)))",
            )
            .into(),
        )
        .into(),
        context,
        Value::new(EcmascriptModuleAssetType::Typescript),
        EcmascriptInputTransformsVc::cell(vec![EcmascriptInputTransform::TypeScript]),
        context.environment(),
        InnerAssetsVc::cell(HashMap::from([
            ("INNER".to_string(), module_asset),
            ("RUNTIME".to_string(), runtime_asset),
        ])),
    );

    let (Some(cwd), Some(entrypoint)) = (to_sys_path(cwd).await?, to_sys_path(path).await?) else {
        panic!("can only evaluate from a disk filesystem");
    };
    let bootstrap = NodeJsBootstrapAsset {
        path,
        chunk_group: ChunkGroupVc::from_chunk(
            entry_module.as_evaluated_chunk(chunking_context, runtime_entries),
        ),
    };
    emit(bootstrap.cell().into(), intermediate_output_path).await?;
    let pool = NodeJsPool::new(
        cwd,
        entrypoint,
        HashMap::new(),
        available_parallelism().map_or(1, |v| v.get()),
    );
    Ok(pool.cell())
}

/// Pass the file you cared as `runtime_entries` to invalidate and reload the
/// evaluated result automatically.
#[turbo_tasks::function]
pub async fn evaluate(
    context_path: FileSystemPathVc,
    module_asset: AssetVc,
    cwd: FileSystemPathVc,
    context_path_for_issue: FileSystemPathVc,
    context: AssetContextVc,
    intermediate_output_path: FileSystemPathVc,
    runtime_entries: Option<EcmascriptChunkPlaceablesVc>,
    args: Vec<JsonValueVc>,
) -> Result<JavaScriptValueVc> {
    let pool = get_evaluate_pool(
        context_path,
        module_asset,
        cwd,
        context,
        intermediate_output_path,
        runtime_entries,
    )
    .await?;
    let mut operation = pool.operation().await?;
    let args = args.into_iter().try_join().await?;
    operation
        .send(EvalJavaScriptOutgoingMessage::Evaluate {
            args: args.iter().map(|v| &**v).collect(),
        })
        .await?;
    let mut file_dependencies = Vec::new();
    let mut dir_dependencies = Vec::new();
    let output = loop {
        match operation.recv().await? {
            EvalJavaScriptIncomingMessage::Error(error) => {
                EvaluationIssue {
                    error,
                    context_path: context_path_for_issue,
                }
                .cell()
                .as_issue()
                .emit();
                break JavaScriptValue::Error;
            }
            EvalJavaScriptIncomingMessage::JsonValue { data } => {
                break JavaScriptValue::Value(data.into())
            }
            EvalJavaScriptIncomingMessage::FileDependency { path } => {
                // TODO We might miss some changes that happened during execution
                file_dependencies.push(cwd.join(&path).read());
            }
            EvalJavaScriptIncomingMessage::BuildDependency { path } => {
                // TODO We might miss some changes that happened during execution
                BuildDependencyIssue {
                    context_path: context_path_for_issue,
                    path: cwd.join(&path),
                }
                .cell()
                .as_issue()
                .emit();
            }
            EvalJavaScriptIncomingMessage::DirDependency { path, glob } => {
                // TODO We might miss some changes that happened during execution
                dir_dependencies.push(dir_dependency(
                    cwd.join(&path).read_glob(GlobVc::new(&glob), false),
                ));
            }
        }
    };
    // Read dependencies to make them a dependencies of this task. This task will
    // execute again when they change.
    for dep in file_dependencies {
        dep.await?;
    }
    for dep in dir_dependencies {
        dep.await?;
    }
    if args.is_empty() {
        // Assume this is a one-off operation, so we can kill the process
        // TODO use a better way to decide that.
        operation.wait_or_kill().await?;
    }
    Ok(output.cell())
}

/// An issue that occurred while evaluating node code.
#[turbo_tasks::value(shared)]
pub struct EvaluationIssue {
    pub context_path: FileSystemPathVc,
    pub error: StructuredError,
}

#[turbo_tasks::value_impl]
impl Issue for EvaluationIssue {
    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        StringVc::cell("Error evaluating Node.js code".to_string())
    }

    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("build".to_string())
    }

    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.context_path
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<StringVc> {
        Ok(StringVc::cell(
            self.error.print(Default::default(), None).await?,
        ))
    }
}

/// An issue that occurred while evaluating node code.
#[turbo_tasks::value(shared)]
pub struct BuildDependencyIssue {
    pub context_path: FileSystemPathVc,
    pub path: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl Issue for BuildDependencyIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> IssueSeverityVc {
        IssueSeverity::Warning.into()
    }

    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        StringVc::cell("Build dependencies are not yet supported".to_string())
    }

    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("build".to_string())
    }

    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.context_path
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<StringVc> {
        Ok(StringVc::cell(
            format!("The file at {} is a build dependency, which is not yet implemented.
Changing this file or any dependency will not be recognized and might require restarting the server", self.path.to_string().await?)
        ))
    }
}

/// A hack to invalidate when any file in a directory changes. Need to be
/// awaited before files are accessed.
#[turbo_tasks::function]
async fn dir_dependency(glob: ReadGlobResultVc) -> Result<CompletionVc> {
    let shallow = dir_dependency_shallow(glob);
    let glob = glob.await?;
    glob.inner
        .values()
        .map(|&inner| dir_dependency(inner))
        .try_join()
        .await?;
    shallow.await?;
    Ok(CompletionVc::new())
}

#[turbo_tasks::function]
async fn dir_dependency_shallow(glob: ReadGlobResultVc) -> Result<CompletionVc> {
    let glob = glob.await?;
    for item in glob.results.values() {
        // Reading all files to add itself as dependency
        match *item {
            DirectoryEntry::File(file) => {
                file.read().await?;
            }
            DirectoryEntry::Directory(dir) => {
                dir_dependency(dir.read_glob(GlobVc::new("**"), false)).await?;
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
    Ok(CompletionVc::new())
}
