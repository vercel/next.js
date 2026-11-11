//! Shared native module identities across ordered setup/spec compiler contexts.
//! The manifest observes actual chunk IDs without evaluating any module.
use std::collections::HashSet;

use anyhow::{Result, bail};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexMap, ResolvedVc, Vc, fxindexmap};
use turbo_tasks_fs::{FileSystemEntryType, FileSystemPath};
use turbopack::ModuleAssetContext;
use turbopack_core::{
    context::AssetContext,
    file_source::FileSource,
    ident::{AssetIdent, Layer},
    module::Module,
    reference::primary_referenced_modules,
    reference_type::ReferenceType,
    source::Source,
};
use turbopack_ecmascript::chunk::EcmascriptChunkPlaceable;

use crate::{
    project::Project,
    testing::{
        PreparedTestModule, node_test_input_context, prepare_test_module_with_inputs,
        setup_module_source, snapshot_serializer_source, static_mock_plan, test_entry_source,
        test_input_error, test_source,
    },
};

/// Only complete native identities of authored sources or compiler-issued mock
/// generations may join modules from different input layers.
pub(crate) async fn manifest(
    project: ResolvedVc<Project>,
    context: ResolvedVc<ModuleAssetContext>,
    roots: &[ResolvedVc<Box<dyn Module>>],
    input_paths: &[FileSystemPath],
    wrapper_sources: &HashSet<ResolvedVc<Box<dyn Source>>>,
) -> Result<ResolvedVc<Box<dyn Module>>> {
    if input_paths.len() < 2 || roots.len() < input_paths.len() {
        bail!("Compiled mock inputs require an ordered setup/spec graph");
    }
    let next_package = next_core::get_next_package(project.project_path().owned().await?).await?;
    let mut queue = roots.to_vec();
    let mut seen = HashSet::new();
    let mut sources: FxIndexMap<ResolvedVc<AssetIdent>, Vec<ResolvedVc<Box<dyn Module>>>> =
        FxIndexMap::default();
    let mut protected = Vec::new();
    let mut input_layers = Vec::new();
    for module in roots {
        input_layers.push(module.ident().await?.layer.clone());
    }
    while let Some(module) = queue.pop() {
        if !seen.insert(module) {
            continue;
        }
        let ident = module.ident().await?;
        let placeable =
            ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(module).is_some();
        if next_package.get_path_to(&ident.path).is_some() {
            if placeable {
                protected.push(module);
            }
            continue;
        }
        queue.extend(primary_referenced_modules(*module).await?.iter().copied());
        // Resolver metadata (e.g. package.json) participates in the graph but has
        // no JavaScript factory or module-cache ID. The pseudo import would emit
        // null for it, so it must never enter either side of this cache manifest.
        if !placeable {
            continue;
        }
        let source = *module.source().await?;
        if let Some(source) = source {
            let path = source.ident().await?.path.clone();
            // An existing same-name disk file cannot turn a virtual mock wrapper
            // into an authored source. Both admitted source types are compiler-owned.
            let authored = ResolvedVc::try_downcast_type::<FileSource>(source).is_some()
                || ResolvedVc::try_downcast_type::<crate::testing::TestSource>(source).is_some();
            if input_layers.contains(&ident.layer)
                && (wrapper_sources.contains(&source)
                    || (authored && matches!(&*path.get_type().await?, FileSystemEntryType::File)))
            {
                // Preserve every native part/modifier/query identity. Only our
                // explicit input layer differs between these resolver contexts.
                let mut shared_ident = (*ident).clone();
                shared_ident.layer = None;
                sources
                    .entry(shared_ident.into_vc().to_resolved().await?)
                    .or_default()
                    .push(module);
            } else {
                protected.push(module);
            }
        } else {
            protected.push(module);
        }
    }
    let mut aliases = Vec::new();
    for (_, modules) in sources {
        if modules.len() > 1 {
            aliases.push(modules);
        } else {
            protected.extend(modules);
        }
    }
    let mut assets = fxindexmap! {};
    let mut code = String::new();
    let mut groups = Vec::new();
    for (group, modules) in aliases.iter().enumerate() {
        let mut names = Vec::new();
        for (index, module) in modules.iter().enumerate() {
            let name = format!("alias_{group}_{index}");
            let request = format!("INNER_MOCK_INPUT_{name}");
            assets.insert(request.clone().into(), *module);
            code.push_str(&format!(
                "import {{ __turbopack_module_id__ as {name} }} from '{request}' with {{ \
                 \"turbopack-chunking-type\":\"none\" }};\n"
            ));
            names.push(name);
        }
        groups.push(format!("[{}]", names.join(",")));
    }
    let mut protected_names = Vec::new();
    let mut protected_seen = HashSet::new();
    for module in protected {
        if !protected_seen.insert(module) {
            continue;
        }
        let name = format!("protected_{}", protected_names.len());
        let request = format!("INNER_MOCK_INPUT_{name}");
        assets.insert(request.clone().into(), module);
        code.push_str(&format!(
            "import {{ __turbopack_module_id__ as {name} }} from '{request}' with {{ \
             \"turbopack-chunking-type\":\"none\" }};\n"
        ));
        protected_names.push(name);
    }
    code.push_str(&format!(
        "export const manifest = {{version:1,inputs:{},aliases:[{}],protected:[{}]}};\n",
        input_paths.len(),
        groups.join(","),
        protected_names.join(",")
    ));
    let source = test_source(
        input_paths.last().unwrap().clone(),
        Some(rcstr!("next-test-mock-input-manifest")),
        code,
    )
    .await?;
    Ok(context
        .process(*source, ReferenceType::Internal(ResolvedVc::cell(assets)))
        .module()
        .to_resolved()
        .await?)
}

pub(crate) async fn has_mock_setups(paths: &[FileSystemPath]) -> Result<bool> {
    for path in paths {
        if !static_mock_plan(path).await?.is_empty() {
            return Ok(true);
        }
    }
    Ok(false)
}

struct Inputs {
    paths: Vec<FileSystemPath>,
    prepared: Vec<PreparedTestModule>,
    modules: Vec<ResolvedVc<Box<dyn Module>>>,
}

async fn prepare(
    project: ResolvedVc<Project>,
    path: &FileSystemPath,
    id: &RcStr,
    setup_paths: &[FileSystemPath],
    runtime_env: bool,
) -> Result<Inputs> {
    let mut paths = setup_paths.to_vec();
    paths.push(path.clone());
    let mut prepared = Vec::new();
    let mut modules = Vec::new();
    for (index, input_path) in paths.iter().enumerate() {
        let plan = static_mock_plan(input_path).await?;
        if plan.reset_modules || !plan.runtime_requests.is_empty() {
            return Err(test_input_error(
                input_path.clone(),
                "Compiled setup mocks cannot reset or register runtime modules yet",
            ));
        }
        let context = node_test_input_context(
            project,
            path,
            runtime_env,
            Some(Layer::new_with_user_friendly_name(
                format!("next-test-node-input:{id}:{index}").into(),
                rcstr!("Node Test Input"),
            )),
        )
        .await?;
        let input = prepare_test_module_with_inputs(
            project,
            input_path,
            id,
            context,
            false,
            true,
            &paths[..index],
        )
        .await?;
        let module = input
            .context
            .process(
                *input.source,
                ReferenceType::EcmaScriptModules(
                    turbopack_core::reference_type::EcmaScriptModulesReferenceSubType::Undefined,
                ),
            )
            .module()
            .to_resolved()
            .await?;
        prepared.push(input);
        modules.push(module);
    }
    Ok(Inputs {
        paths,
        prepared,
        modules,
    })
}

pub(crate) async fn metadata(
    project: ResolvedVc<Project>,
    path: &FileSystemPath,
    id: &RcStr,
    setup_paths: &[FileSystemPath],
    runtime_env: bool,
) -> Result<String> {
    let inputs = prepare(project, path, id, setup_paths, runtime_env).await?;
    let mut sources: FxIndexMap<String, String> = FxIndexMap::default();
    let mut compatible_sources = true;
    for input in inputs.prepared {
        for source in input.coverage_sources {
            if let Some(existing) = sources.get(&source.source)
                && *existing != source.code
            {
                compatible_sources = false;
            }
            sources.insert(source.source, source.code);
        }
    }
    let mut module_mocking = serde_json::json!({"version":1,"setupInputs":1});
    if compatible_sources {
        module_mocking["coverage"] = serde_json::json!({
            "version":1,
            "sources":sources.into_iter().map(|(source,code)|serde_json::json!({"source":source,"code":code})).collect::<Vec<_>>(),
        });
    }
    Ok(serde_json::to_string(
        &serde_json::json!({"moduleMocking":module_mocking}),
    )?)
}

pub(crate) async fn entry(
    project: ResolvedVc<Project>,
    path: &FileSystemPath,
    id: &RcStr,
    setup_paths: &[FileSystemPath],
    serializers: &[RcStr],
    runtime_env: bool,
    environment_bootstrap: &str,
) -> Result<Vc<Box<dyn Module>>> {
    let inputs = prepare(project, path, id, setup_paths, runtime_env).await?;
    let spec_index = inputs.paths.len() - 1;
    let context = inputs.prepared[spec_index].context;
    let mut graph_roots = inputs.modules.clone();
    let mut assets = fxindexmap! {
        rcstr!("INNER_TEST_MODULE") => inputs.modules[spec_index],
    };
    let mut setup = String::new();
    if !serializers.is_empty() {
        let unmocked = node_test_input_context(project, path, runtime_env, None).await?;
        let source =
            snapshot_serializer_source(project.project_path().owned().await?, serializers).await?;
        let module = unmocked
            .process(
                *source,
                ReferenceType::EcmaScriptModules(
                    turbopack_core::reference_type::EcmaScriptModulesReferenceSubType::Undefined,
                ),
            )
            .module()
            .to_resolved()
            .await?;
        assets.insert(rcstr!("INNER_TEST_SERIALIZERS"), module);
        graph_roots.push(module);
        setup.push_str(
            "await require(/*turbopackChunkingType: shared*/ 'INNER_TEST_SERIALIZERS');\n",
        );
    }
    let mut callbacks = Vec::new();
    for (index, input) in inputs.prepared.iter().enumerate() {
        let registration = if let Some(module) = input.registration {
            let request = format!("INNER_MOCK_INPUT_REGISTRATION_{index}");
            assets.insert(request.clone().into(), module);
            format!("await require(/*turbopackChunkingType: shared*/ '{request}');\n")
        } else {
            String::new()
        };
        if index == spec_index {
            callbacks.push(format!(
                "return await \
                 mockInputs.loadCompiledMockInput({index},async()=>{{{registration}return \
                 require(/*turbopackChunkingType: shared*/ 'INNER_TEST_MODULE');}});"
            ));
            continue;
        }
        let module = inputs.modules[index];
        let source = setup_module_source(inputs.paths[index].clone()).await?;
        let wrapper = input
            .context
            .process(
                *source,
                ReferenceType::Internal(ResolvedVc::cell(fxindexmap! {
                    rcstr!("INNER_TEST_SETUP_SUBJECT") => module,
                })),
            )
            .module()
            .to_resolved()
            .await?;
        let request = format!("INNER_MOCK_INPUT_SETUP_{index}");
        assets.insert(request.clone().into(), wrapper);
        callbacks.push(format!(
            "async()=>mockInputs.loadCompiledMockInput({index},async()=>{{{registration}return \
             require(/*turbopackChunkingType: shared*/ '{request}');}})"
        ));
    }
    let spec_load = callbacks.pop().unwrap();
    setup.push_str(&format!(
        "const setupLoaders=[{}];if(setupFilesSequence==='parallel'){{await \
         Promise.all(setupLoaders.map(load=>load()));}}else{{for(const load of setupLoaders)await \
         load();}}\n",
        callbacks.join(",")
    ));
    let wrapper_sources = inputs
        .prepared
        .iter()
        .flat_map(|input| input.mock_wrappers.iter().copied())
        .collect::<HashSet<_>>();
    let aliases = manifest(
        project,
        context,
        &graph_roots,
        &inputs.paths,
        &wrapper_sources,
    )
    .await?;
    assets.insert(rcstr!("INNER_TEST_MOCK_INPUTS"), aliases);
    let runtime = "const mockInputs=require('next/dist/experimental/testing/mocking/setup-inputs'\
                   );\nexport const mockTesting={initializeModuleMocking(options){return \
                   mockInputs.initializeCompiledMockInputs(__turbopack_context__,require(/*\
                   turbopackChunkingType: shared*/ 'INNER_TEST_MOCK_INPUTS').manifest,options);}};";
    let source = next_core::util::load_next_js_template_no_imports(
        "node-test.js",
        project.project_path().owned().await?,
        &[("VAR_TEST_MODULE", "INNER_TEST_MODULE")],
        &[
            ("__next_test_setup__", &setup),
            ("__next_test_environment__", environment_bootstrap),
            ("__next_test_mock_runtime__", runtime),
            ("__next_test_mock_load__", &spec_load),
        ],
        &[],
    )
    .await?;
    Ok(context
        .process(
            test_entry_source(source).await?,
            ReferenceType::Internal(ResolvedVc::cell(assets)),
        )
        .module())
}
