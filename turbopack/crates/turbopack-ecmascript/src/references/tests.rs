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
    EnvVarAccessMode, references::analyze_ecmascript_module,
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
            fixture_op(input.clone(), AnalyzeMode::code_generation())
                .read_strongly_consistent()
                .await?;
            fixture_op(input.clone(), AnalyzeMode::tracing())
                .read_strongly_consistent()
                .await?;
            fixture_op(input, AnalyzeMode::code_generation_and_tracing())
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

    let source = module.await?.source;
    let text = std::fs::read_to_string(&input)?;
    let lines: Vec<_> = text.lines().collect();
    let mut runtime_read = Vec::new();
    let mut runtime_existence = Vec::new();
    for (name, access) in &env_var_info.runtime {
        let issue_source = env_var_info
            .issue_source(access)
            .unwrap_or_else(|| panic!("missing source for {name}"));
        assert_eq!(issue_source.source(), source, "source of {name}");
        let position = issue_source
            .start_pos()
            .await?
            .unwrap_or_else(|| panic!("missing source location for {name}"));
        // Source positions use UTF-16 columns, not UTF-8 byte offsets.
        let line = lines[position.line as usize];
        let mut column = 0;
        let byte_offset = line
            .char_indices()
            .find_map(|(offset, ch)| {
                let current_column = column;
                column += ch.len_utf16();
                (current_column == position.column as usize).then_some(offset)
            })
            .unwrap_or_else(|| panic!("invalid source column for {name}"));
        let at_position = &line[byte_offset..];
        if at_position.starts_with("process.env[NAME]") {
            // Can't easily check the exact key for dynamic NAME access.
        } else {
            // Read the property or destructured key directly from the reported location.
            let key = at_position
                .trim_start_matches(['[', '\'', '"'])
                .split(|c: char| !c.is_ascii_alphanumeric() && !matches!(c, '_' | '$' | '.'))
                .next()
                .unwrap()
                .rsplit('.')
                .next()
                .unwrap();
            assert_eq!(
                key,
                name.as_str(),
                "source text at {}:{}",
                position.line + 1,
                position.column + 1
            );
        }
        match access.mode {
            EnvVarAccessMode::Read => runtime_read.push(name),
            EnvVarAccessMode::Existence => runtime_existence.push(name),
        }
    }

    let mut value = format!("runtime: {runtime_read:#?}");
    if !runtime_existence.is_empty() {
        value.push_str(&format!("\nruntime_existence: {runtime_existence:#?}"));
    }

    NormalizedOutput::from(value)
        .compare_to_file(input.with_file_name(format!(
            "env-vars{}.snapshot",
            match (analyze_mode.is_codegen, analyze_mode.trace_file_references,) {
                (true, true) => "",
                (true, false) => ".codegen",
                (false, true) => ".tracing",
                (false, false) => ".tracing-import-only",
            }
        )))
        .unwrap();

    Ok(())
}
