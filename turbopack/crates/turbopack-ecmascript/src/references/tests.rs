use std::path::PathBuf;

use anyhow::Result;
use swc_core::{
    self,
    testing::{NormalizedOutput, fixture},
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, TurboTasks, Vc};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
use turbo_tasks_fs::{DiskFileSystem, FileSystem};
use turbopack_core::{
    compile_time_info::CompileTimeInfo,
    environment::{Environment, ExecutionEnvironment, NodeJsEnvironment},
    file_source::FileSource,
    ident::Layer,
};
use turbopack_test_utils::noop_asset_context::NoopAssetContext;

use crate::{
    AnalyzeMode, EcmascriptInputTransforms, EcmascriptModuleAsset, EcmascriptOptions,
    references::analyze_ecmascript_module,
};

#[fixture("tests/references/**/input.js")]
fn fixture(input: PathBuf) {
    let input = RcStr::from(input.to_str().unwrap());
    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .unwrap();
    rt.block_on(async move {
        let tt = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async move {
            fixture_op(input).read_strongly_consistent().await?;
            anyhow::Ok(())
        })
        .await
        .unwrap();
    });
}

async fn setup(root_dir: &str, file: &str) -> Result<ResolvedVc<EcmascriptModuleAsset>> {
    let fs = DiskFileSystem::new(rcstr!("project"), Vc::cell(root_dir.into()));

    let environment = Environment::new(ExecutionEnvironment::NodeJsLambda(
        NodeJsEnvironment::default().resolved_cell(),
    ));
    let compile_time_info = CompileTimeInfo::new(environment).to_resolved().await?;
    let layer = Layer::new(rcstr!("test"));
    let module_asset_context = NoopAssetContext {
        compile_time_info,
        layer,
    }
    .resolved_cell();

    let module = EcmascriptModuleAsset::builder(
        ResolvedVc::upcast(
            FileSource::new(fs.root().await?.join(file).unwrap())
                .to_resolved()
                .await?,
        ),
        ResolvedVc::upcast(module_asset_context),
        EcmascriptInputTransforms::empty().to_resolved().await?,
        EcmascriptOptions {
            follow_reexports: true,
            analyze_mode: AnalyzeMode::CodeGenerationAndTracing,
            ..Default::default()
        }
        .resolved_cell(),
        compile_time_info,
        None,
    )
    .build()
    .to_resolved()
    .await?;
    Ok(module)
}

#[turbo_tasks::function(operation, root)]
async fn fixture_op(input: RcStr) -> anyhow::Result<()> {
    let input = PathBuf::from(input.as_str());
    let env_vars_path = input.with_file_name("env-vars.snapshot");

    let module = setup(
        input.parent().unwrap().to_str().unwrap(),
        input.file_name().unwrap().to_str().unwrap(),
    )
    .await?;

    let analysis = analyze_ecmascript_module(*module, None).await?;

    let env_var_references = analysis.env_var_references.await?;

    NormalizedOutput::from(format!(
        "runtime_all: {}\nruntime: {:#?}",
        env_var_references.runtime_all.is_some(),
        env_var_references.runtime
    ))
    .compare_to_file(&env_vars_path)
    .unwrap();

    Ok(())
}
