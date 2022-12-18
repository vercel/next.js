use std::collections::HashMap;

use anyhow::{bail, Result};
use turbo_tasks::Value;
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
    bootstrap::NodeJsBootstrapAsset, embed_js::embed_file_path, emit, pool::NodeJsPool,
    EvalJavaScriptIncomingMessage, EvalJavaScriptOutgoingMessage, NodeJsOperation,
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
    content: EvalJavaScriptOutgoingMessage,
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
pub async fn evaluate(
    context_path: FileSystemPathVc,
    module_asset: AssetVc,
    cwd: FileSystemPathVc,
    context: AssetContextVc,
    intermediate_output_path: FileSystemPathVc,
    runtime_entries: Option<EcmascriptChunkPlaceablesVc>,
) -> Result<JavaScriptValueVc> {
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

    let path = intermediate_output_path.join("evaluate.js");
    let entry_module = EcmascriptModuleAssetVc::new_with_inner_assets(
        VirtualAssetVc::new(
            runtime_asset.path().join("evaluate.js"),
            File::from("import { run } from 'RUNTIME'; run(() => require('INNER'))").into(),
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
    let pool = NodeJsPool::new(cwd, entrypoint, HashMap::new(), 1);
    let mut operation = pool.operation().await?;
    let output = eval_js_operation(&mut operation, EvalJavaScriptOutgoingMessage::Evaluate).await?;
    Ok(JavaScriptValue::Value(output.into()).cell())
}
