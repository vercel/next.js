use std::{collections::HashMap, thread::available_parallelism};

use anyhow::{bail, Result};
use turbo_tasks::{primitives::JsonValueVc, TryJoinIterExt, Value};
use turbo_tasks_fs::{rope::Rope, to_sys_path, File, FileSystemPathVc};
use turbopack_core::{
    asset::AssetVc,
    chunk::{dev::DevChunkingContextVc, ChunkGroupVc},
    context::AssetContextVc,
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
    pool::{NodeJsOperation, NodeJsPool, NodeJsPoolVc},
    EvalJavaScriptIncomingMessage, EvalJavaScriptOutgoingMessage,
};

#[turbo_tasks::value(shared)]
#[derive(Clone)]
pub enum JavaScriptValue {
    Value(Rope),
    // TODO, support stream in the future
    Stream(#[turbo_tasks(trace_ignore)] Vec<u8>),
}

async fn eval_js_operation(
    operation: &mut NodeJsOperation,
    content: EvalJavaScriptOutgoingMessage<'_>,
) -> Result<String> {
    operation.send(content).await?;
    match operation.recv().await? {
        EvalJavaScriptIncomingMessage::Error(err) => {
            bail!(err.print(Default::default(), None).await?);
        }
        EvalJavaScriptIncomingMessage::JsonValue { data } => Ok(data),
    }
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

#[turbo_tasks::function]
/// Pass the file you cared as `runtime_entries` to invalidate and reload the
/// evaluated result automatically.
pub async fn evaluate(
    context_path: FileSystemPathVc,
    module_asset: AssetVc,
    cwd: FileSystemPathVc,
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
    let args = args.into_iter().map(|v| v).try_join().await?;
    let output = eval_js_operation(
        &mut operation,
        EvalJavaScriptOutgoingMessage::Evaluate {
            args: args.iter().map(|v| &**v).collect(),
        },
    )
    .await?;
    if args.is_empty() {
        // Assume this is a one-off operation, so we can kill the process
        // TODO use a better way to decide that.
        operation.wait_or_kill().await?;
    }
    Ok(JavaScriptValue::Value(output.into()).cell())
}
