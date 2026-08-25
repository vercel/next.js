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
    free_var_references,
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
            fixture_op(input.clone(), AnalyzeMode::CodeGeneration)
                .read_strongly_consistent()
                .await?;
            fixture_op(input.clone(), AnalyzeMode::Tracing)
                .read_strongly_consistent()
                .await?;
            fixture_op(input, AnalyzeMode::CodeGenerationAndTracing)
                .read_strongly_consistent()
                .await?;
            anyhow::Ok(())
        })
        .await
        .unwrap();
    });
}

async fn setup(
    root_dir: &str,
    file: &str,
    analyze_mode: AnalyzeMode,
) -> Result<ResolvedVc<EcmascriptModuleAsset>> {
    let fs = DiskFileSystem::new(rcstr!("project"), Vc::cell(root_dir.into()));

    let environment = Environment::new(ExecutionEnvironment::NodeJsLambda(
        NodeJsEnvironment::default().resolved_cell(),
    ))
    .to_resolved()
    .await?;
    let compile_time_info = CompileTimeInfo::builder(environment)
        .free_var_references(
            free_var_references!(
                process.env.INLINED1 = "inlined1",
                process.env.INLINED2 = "inlined2",
                process.env.INLINED3 = "inlined3",
                process.env.INLINED4 = "inlined4",
                process.env.INLINED5 = "inlined5",
                process.env.INLINED6 = "inlined6",
            )
            .resolved_cell(),
        )
        .cell()
        .await?
        .to_resolved()
        .await?;
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
            analyze_mode,
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
async fn fixture_op(input: RcStr, analyze_mode: AnalyzeMode) -> anyhow::Result<()> {
    let input = PathBuf::from(input.as_str());
    let module = setup(
        input.parent().unwrap().to_str().unwrap(),
        input.file_name().unwrap().to_str().unwrap(),
        analyze_mode,
    )
    .await?;

    let analysis = analyze_ecmascript_module(*module, None).await?;

    let env_var_info = analysis.env_var_info.await?;

    NormalizedOutput::from(format!("runtime: {:#?}", env_var_info.runtime))
        .compare_to_file(input.with_file_name(format!(
            "env-vars{}.snapshot",
            match analyze_mode {
                AnalyzeMode::CodeGenerationAndTracing => "",
                AnalyzeMode::CodeGeneration => ".codegen",
                AnalyzeMode::Tracing => ".tracing",
            }
        )))
        .unwrap();

    Ok(())
}
