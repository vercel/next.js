//! Explicit testing entries into the existing Next.js compiler. This does
//! not alter route discovery or add test entries to ordinary application builds.

use std::collections::HashSet;

use anyhow::{Context, Result, bail};
use async_trait::async_trait;
use next_core::{
    app_structure::FileSystemPathVec,
    get_next_package,
    util::{file_content_rope, load_next_js_template_no_imports},
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{Completion, FxIndexMap, OperationVc, ResolvedVc, ValueToString, Vc, fxindexmap};
use turbo_tasks_fs::{File, FileContent, FileSystemEntryType, FileSystemPath};
use turbopack::{ModuleAssetContext, module_options::ModuleOptionsContext};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        ChunkingContext, EntryChunkGroupResult, SourceMapSourceType,
        availability_info::AvailabilityInfo,
    },
    context::AssetContext,
    file_source::FileSource,
    ident::{AssetIdent, Layer},
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, StyledString},
    module::Module,
    module_graph::{
        GraphEntries,
        binding_usage_info::ModuleExportUsageInfo,
        chunk_group_info::{ChunkGroup, ChunkGroupEntry, EntryHeuristics},
    },
    output::{OutputAsset, OutputAssets},
    reference::{all_assets_from_entries, primary_referenced_modules},
    reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
    resolve::{
        ResolveErrorMode, ResolveResult,
        options::{ImportMap, ImportMapping},
        origin::PlainResolveOrigin,
        parse::Request,
    },
    source::Source,
    source_map::{structured::StructuredSourceMap, utils::absolute_fileify_source_map},
    virtual_output::VirtualOutputAsset,
    virtual_source::VirtualSource,
};
use turbopack_ecmascript::{
    chunk::{EcmascriptChunkPlaceable, EcmascriptExports},
    references::external_module::CachedExternalModule,
};
use turbopack_resolve::{ecmascript::esm_resolve, resolve_options_context::ResolveOptionsContext};

use crate::{
    operation::OptionEndpoint,
    paths::all_asset_paths,
    project::{Project, ProjectContainer},
    route::{Endpoint, EndpointOutput, EndpointOutputPaths, ModuleGraphs},
    testing_mock_graph::{
        MockActualSource, MockGraphTarget, MockGraphTargets, MockHoistedSource,
        MockRegistrationSource, MockResolvePlugin, mock_registration_source_with_helpers,
        mock_spec_source_with_imports, mock_wrapper_source,
    },
    testing_mock_source::{StaticMockPlan, extract_test_mocks},
};

/// An unsupported test input is a compilation issue, not an engine failure.
#[turbo_tasks::value(shared)]
struct TestInputIssue {
    path: FileSystemPath,
    message: RcStr,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for TestInputIssue {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }
    fn stage(&self) -> IssueStage {
        IssueStage::ProcessModule
    }
    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.path.clone())
    }
    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(self.message.clone()))
    }
}

/// Call only at a known user-input validation failure. The existing issue
/// collector turns this failed operation into diagnostics; unrelated engine
/// and IO failures must continue propagating without this issue.
pub(crate) fn test_input_error(path: FileSystemPath, message: impl Into<RcStr>) -> anyhow::Error {
    let message = message.into();
    TestInputIssue {
        path,
        message: message.clone(),
    }
    .resolved_cell()
    .emit();
    anyhow::anyhow!(message.to_string())
}

/// Test API ownership must not fall back to a user-installed runner, including
/// when an import originates in a foreign-code resolve context.
#[turbo_tasks::function]
pub(crate) async fn test_resolve_options_context(
    context: Vc<ResolveOptionsContext>,
    project_path: FileSystemPath,
    browser: bool,
) -> Result<Vc<ResolveOptionsContext>> {
    let next_package = get_next_package(project_path.clone()).await?;
    let mut imports = ImportMap::empty();
    let unsupported = ImportMapping::Error(ResolvedVc::upcast(
        TestInputIssue {
            path: project_path.clone(),
            message: rcstr!(
                "Unsupported Vitest subpath in a Next-owned test. Public subpath adapters are not \
                 implemented; importing a Vitest controller, worker or Vite runtime is never a \
                 fallback. Import supported test-authoring APIs from 'vitest'."
            ),
        }
        .resolved_cell(),
    ))
    .resolved_cell();
    imports.insert_wildcard_alias(rcstr!("vitest/"), unsupported);
    let mut aliases = vec![
        ("vitest", "dist/experimental/testing/vitest.js"),
        ("vitest/config", "dist/experimental/testing/config-api.js"),
    ];
    if browser {
        aliases.push((
            "next/experimental/testing/browser",
            "dist/experimental/testing/browser/index.js",
        ));
    }
    for (request, target) in aliases {
        let target_path = next_package.join(target)?;
        if matches!(&*target_path.read().await?, FileContent::NotFound) {
            bail!("Next test facade for {request} is missing: {target}");
        }
        let source = FileSource::new(target_path).to_resolved().await?;
        imports.insert_exact_alias(
            request,
            ImportMapping::Direct(
                ResolveResult::source(ResolvedVc::upcast(source)).resolved_cell(),
            )
            .resolved_cell(),
        );
    }
    let mut extended = context
        .with_extended_import_map(imports.cell())
        .owned()
        .await?;
    for (_, nested) in &mut extended.rules {
        *nested = test_resolve_options_context(**nested, project_path.clone(), browser)
            .to_resolved()
            .await?;
    }
    Ok(extended.cell())
}

#[turbo_tasks::function(operation, root)]
pub async fn test_endpoint_operation(
    container: ResolvedVc<ProjectContainer>,
    file: RcStr,
    id: RcStr,
    environment: RcStr,
    setup_files: Vec<RcStr>,
    snapshot_serializers: Vec<RcStr>,
    cohort_files: Vec<RcStr>,
    runtime_env: bool,
    route: Option<RcStr>,
    dependency_plan: bool,
    browser_client: bool,
) -> Result<Vc<OptionEndpoint>> {
    let entry = TestEntryOptions {
        file,
        id,
        environment,
        setup_files,
        snapshot_serializers,
        cohort_files,
        runtime_env,
        route,
        dependency_plan,
        browser_client,
    }
    .resolved_cell();
    let project = container
        .project()
        .with_test_entry(*entry)
        .to_resolved()
        .await?;
    Ok(Vc::cell(Some(
        test_endpoint(*project, *entry).to_resolved().await?,
    )))
}

/// Explicit roots belong to a cloned compiler project, never route discovery.
#[turbo_tasks::value(shared)]
pub(crate) struct TestEntryOptions {
    pub file: RcStr,
    pub id: RcStr,
    pub environment: RcStr,
    pub setup_files: Vec<RcStr>,
    pub snapshot_serializers: Vec<RcStr>,
    pub cohort_files: Vec<RcStr>,
    pub runtime_env: bool,
    pub route: Option<RcStr>,
    pub dependency_plan: bool,
    pub browser_client: bool,
}

#[turbo_tasks::function]
pub(crate) async fn test_endpoint(
    project: ResolvedVc<Project>,
    entry: ResolvedVc<TestEntryOptions>,
) -> Result<Vc<Box<dyn Endpoint>>> {
    let TestEntryOptions {
        file,
        id,
        environment,
        setup_files,
        snapshot_serializers,
        cohort_files,
        runtime_env,
        route,
        dependency_plan,
        browser_client,
    } = &*entry.await?;
    if *dependency_plan && (&**environment != "node" || !cohort_files.is_empty()) {
        return Err(test_input_error(
            project.project_path().owned().await?,
            "Dependency planning currently requires isolated Node entries",
        ));
    }
    if *browser_client
        && (&**environment != "browser"
            || !project.next_mode().await?.is_development()
            || !setup_files.is_empty()
            || !snapshot_serializers.is_empty()
            || !cohort_files.is_empty()
            || *runtime_env
            || *dependency_plan
            || route.is_some())
    {
        return Err(test_input_error(
            project.project_path().owned().await?,
            "Browser Mode requires an isolated development client entry without setup, \
             serializers, cohorts, routes or Node features",
        ));
    }
    let file = file.clone();
    let id = id.clone();
    let environment = environment.clone();
    if !matches!(&*environment, "rsc" | "node" | "browser") {
        bail!("Unknown test compilation environment: {}", environment);
    }
    crate::testing_env::validate_request(
        *runtime_env,
        &environment,
        project.next_mode().await?.is_development(),
    )?;
    if route.is_some()
        && (&*environment != "rsc"
            || project.next_mode().await?.is_production()
            || !cohort_files.is_empty())
    {
        bail!("Route-aware tests require one-shot development Node RSC entries");
    }
    if id.is_empty()
        || !id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
    {
        bail!("Test entry IDs must contain only ASCII letters, digits, '-' and '_'");
    }
    for file in std::iter::once(&file)
        .chain(setup_files.iter())
        .chain(cohort_files.iter())
    {
        if file.is_empty()
            || file
                .split('/')
                .any(|part| part.is_empty() || part == ".." || part == ".")
            || file.contains('\\')
            || file.contains(':')
        {
            bail!("Test entry file must be a normalized project-relative path");
        }
    }
    if !cohort_files.is_empty() {
        if &*environment != "node"
            || project.next_mode().await?.is_production()
            || !setup_files.is_empty()
            || !snapshot_serializers.is_empty()
        {
            bail!(
                "Shared test cohorts currently require development Node without setup or \
                 serializers"
            );
        }
        if cohort_files.first() != Some(&file)
            || cohort_files.iter().collect::<HashSet<_>>().len() != cohort_files.len()
        {
            bail!("Shared test cohort paths must be unique and start with the entry file");
        }
    }
    let project_path = project.project_path().owned().await?;
    let setup_paths = setup_files
        .iter()
        .map(|file| project_path.join(file))
        .collect::<Result<Vec<_>>>()?;
    let cohort_paths = cohort_files
        .iter()
        .map(|file| project_path.join(file))
        .collect::<Result<Vec<_>>>()?;
    for cohort_path in &cohort_paths {
        if !static_mock_plan(cohort_path).await?.is_empty() {
            return Err(test_input_error(
                cohort_path.clone(),
                "Shared test cohorts do not support static module mock plans yet",
            ));
        }
    }
    let path = project_path.join(&file)?;
    if !static_mock_plan(&path).await?.runtime_requests.is_empty()
        && (&*environment != "node"
            || !setup_paths.is_empty()
            || !snapshot_serializers.is_empty()
            || !cohort_files.is_empty())
    {
        return Err(test_input_error(
            path.clone(),
            "Runtime module mocks require isolated development Node without setup or serializers",
        ));
    }
    if project.next_mode().await?.is_production() && !static_mock_plan(&path).await?.is_empty() {
        return Err(test_input_error(
            path.clone(),
            "Static module mocks are not supported in production test profiles",
        ));
    }
    if &*environment != "node" {
        let plan = static_mock_plan(&path).await?;
        let rsc_mocks_supported = &*environment == "rsc"
            && project.next_mode().await?.is_development()
            && route.is_none()
            && setup_paths.is_empty()
            && snapshot_serializers.is_empty()
            && !plan.reset_modules;
        if !plan.is_empty() && !rsc_mocks_supported {
            return Err(test_input_error(
                path.clone(),
                "Static module mocks require route-less development Node or Node RSC without \
                 setup, serializers or resets",
            ));
        }
    }
    for setup_path in &setup_paths {
        if !static_mock_plan(setup_path).await?.is_empty() {
            return Err(test_input_error(
                setup_path.clone(),
                "Static module mocks in setup files are not supported yet",
            ));
        }
    }
    if *browser_client {
        return Ok(Vc::upcast(crate::testing_client::ClientTestEndpoint::new(
            *project, path, id,
        )));
    }
    if &*environment != "rsc" {
        let path = project.project_path().owned().await?.join(&file)?;
        return Ok(Vc::upcast(
            NodeTestEndpoint {
                project,
                path,
                setup_paths,
                snapshot_serializers: snapshot_serializers.clone(),
                cohort_paths,
                cohort_files: cohort_files.clone(),
                runtime_env: *runtime_env,
                dependency_plan: *dependency_plan,
                id,
            }
            .cell(),
        ));
    }
    let app = project
        .app_project()
        .await?
        .as_ref()
        .copied()
        .context("Test entries require an App Router project")?;
    Ok(app.test_endpoint(
        file,
        id,
        setup_paths,
        snapshot_serializers.clone(),
        route.clone(),
    ))
}

async fn static_mock_plan(path: &FileSystemPath) -> Result<StaticMockPlan> {
    let source = file_content_rope(path.read()).await?.to_str()?.into_owned();
    // This pure analyzer returns only syntax/unsupported-input errors. Do not
    // include file reads, graph resolution, or generated-map invariants here.
    extract_test_mocks(&source, path.file_name())
        .map_err(|error| test_input_error(path.clone(), error.to_string()))
}

async fn virtual_test_source(
    path: FileSystemPath,
    source: String,
) -> Result<ResolvedVc<Box<dyn Source>>> {
    Ok(ResolvedVc::upcast(
        VirtualSource::new(
            path,
            AssetContent::file(FileContent::Content(File::from(source)).cell()),
        )
        .to_resolved()
        .await?,
    ))
}

/// Issue the same source identity that this actual Node chunker writes to its maps.
/// This metadata-only map has no coordinates and cannot invent coverage ranges.
async fn emitted_test_source_identity(
    project: ResolvedVc<Project>,
    source: ResolvedVc<Box<dyn Source>>,
) -> Result<String> {
    let chunking_context = project.server_chunking_context(false);
    if !matches!(
        *chunking_context.source_map_source_type().await?,
        SourceMapSourceType::AbsoluteFileUri
    ) {
        bail!("Static mock source provenance requires absolute native source-map identities");
    }
    let source_ident = source.ident().to_string().await?;
    let map = StructuredSourceMap::from_json_slice(&serde_json::to_vec(&serde_json::json!({
        "version": 3,
        "sources": [format!("turbopack:///{}", &*source_ident)],
        "names": [],
        "mappings": "",
    }))?)?;
    let map =
        absolute_fileify_source_map(&map, chunking_context.root_path().owned().await?).await?;
    let map: serde_json::Value = serde_json::from_reader(map.to_rope().read())?;
    let sources = map["sources"]
        .as_array()
        .context("Native source identity transform omitted its sources")?;
    if sources.len() != 1 {
        bail!("Native source identity transform returned ambiguous sources");
    }
    let identity = sources[0]
        .as_str()
        .filter(|source| source.starts_with("file://"))
        .context("Native source identity transform did not return a file URI")?;
    Ok(identity.to_string())
}

/// Import through an ESM namespace so late require() waits for module evaluation
/// without awaiting a CommonJS module's exported promise. Keep the original
/// processed module as an internal reference to preserve its compiler context.
pub(crate) async fn setup_module_source(
    path: FileSystemPath,
) -> Result<ResolvedVc<Box<dyn Source>>> {
    virtual_test_source(
        path.append(".next-test-setup.mjs")?,
        "import * as setup from 'INNER_TEST_SETUP_SUBJECT' with { \"turbopack-chunking-type\": \
         \"shared\" };\nexport { setup };\n"
            .into(),
    )
    .await
}

/// Expansion changes the template's lines and columns. Its distributed map
/// describes the unexpanded template, so let Turbopack map the generated harness
/// itself instead of composing user-source mappings with stale coordinates.
pub(crate) async fn test_entry_source(source: Vc<Box<dyn Source>>) -> Result<Vc<Box<dyn Source>>> {
    let content = file_content_rope(source.content().file_content()).await?;
    let content = content.to_str()?;
    let generated = content
        .split_inclusive('\n')
        .filter(|line| {
            let line = line.trim_start();
            !line.starts_with("//# sourceMappingURL=") && !line.starts_with("//@ sourceMappingURL=")
        })
        .collect::<String>();
    Ok(*virtual_test_source(source.ident().await?.path.clone(), generated).await?)
}

/// Configured modules resolve from the project root in the real test context.
pub(crate) async fn snapshot_serializer_source(
    project_path: FileSystemPath,
    serializers: &[RcStr],
) -> Result<ResolvedVc<Box<dyn Source>>> {
    let mut code = String::from("import { expect } from 'vitest';\n");
    for (index, specifier) in serializers.iter().enumerate() {
        if specifier.is_empty() {
            bail!("Snapshot serializer specifiers must be nonempty");
        }
        let request = serde_json::to_string(&**specifier)?;
        code.push_str(&format!(
            "const serializer_{index} = await \
             import({request});\nexpect.addSnapshotSerializer(serializer_{index}.default);\n"
        ));
    }
    virtual_test_source(
        project_path.join("__next_test_snapshot_serializers__.mjs")?,
        code,
    )
    .await
}

/// User-derived test source must participate in configured loader rules, which
/// intentionally exclude VirtualSource. Synthetic mock wrappers stay virtual.
#[turbo_tasks::value]
struct TestSource {
    ident: ResolvedVc<AssetIdent>,
    content: ResolvedVc<AssetContent>,
}

#[turbo_tasks::value_impl]
impl Source for TestSource {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        *self.ident
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("test source {}", self.ident.await?.path).into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl Asset for TestSource {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        *self.content
    }
}

pub(crate) async fn test_source(
    path: FileSystemPath,
    modifier: Option<RcStr>,
    source: String,
) -> Result<ResolvedVc<Box<dyn Source>>> {
    let mut ident = AssetIdent::from_path(path);
    if let Some(modifier) = modifier {
        ident = ident.with_modifier(modifier);
    }
    Ok(ResolvedVc::upcast(
        TestSource {
            ident: ident.into_vc().to_resolved().await?,
            content: AssetContent::file(FileContent::Content(File::from(source)).cell())
                .to_resolved()
                .await?,
        }
        .resolved_cell(),
    ))
}

/// Explicit test entries consume whole modules. Module fragments can publish
/// incomplete exports through this entry graph, including in an unmocked file.
#[turbo_tasks::function]
pub(crate) async fn test_module_options_context(
    options: Vc<ModuleOptionsContext>,
) -> Result<Vc<ModuleOptionsContext>> {
    let mut options = options.owned().await?;
    options.module_fragments_enabled = false;
    for (_, nested) in &mut options.rules {
        *nested = test_module_options_context(**nested).to_resolved().await?;
    }
    Ok(options.cell())
}

/// Recurse through foreign-code options as well as the main resolver. The normal
/// config/conditions/plugins stay intact; only explicit test substitutions append.
#[turbo_tasks::function]
async fn mock_resolve_options(
    options: Vc<ResolveOptionsContext>,
    imports: ResolvedVc<ImportMap>,
    plugin: ResolvedVc<MockResolvePlugin>,
) -> Result<Vc<ResolveOptionsContext>> {
    let mut extended = options.with_extended_import_map(*imports).owned().await?;
    extended
        .after_resolve_plugins
        .insert(0, ResolvedVc::upcast(plugin));
    for (_, nested) in &mut extended.rules {
        *nested = mock_resolve_options(**nested, *imports, *plugin)
            .to_resolved()
            .await?;
    }
    Ok(extended.cell())
}

#[turbo_tasks::function]
async fn mock_module_options(
    options: Vc<ModuleOptionsContext>,
) -> Result<Vc<ModuleOptionsContext>> {
    let mut options = options.owned().await?;
    options.ecmascript.cross_module_constants = false;
    options.ecmascript.mangle_export_names = false;
    options.ecmascript.cjs_scope_hoisting = false;
    options.ecmascript.cjs_tree_shaking = false;
    options.ecmascript.infer_module_side_effects = false;
    options.module_fragments_enabled = false;
    options.follow_reexports = false;
    options.side_effect_free_packages = None;
    for (_, nested) in &mut options.rules {
        *nested = mock_module_options(**nested).to_resolved().await?;
    }
    Ok(options.cell())
}

async fn prepare_manual_mock_source(
    context: ResolvedVc<ModuleAssetContext>,
    root: &FileSystemPath,
    path: FileSystemPath,
) -> Result<(ResolvedVc<Box<dyn Source>>, ResolvedVc<Box<dyn Module>>)> {
    if !matches!(&*path.get_type().await?, FileSystemEntryType::File) {
        return Err(test_input_error(
            path.clone(),
            "Manual module mocks currently require a regular project-local ESM file; directory \
             and symlink redirects are not implemented",
        ));
    }
    let text = file_content_rope(path.read()).await?.to_str()?.into_owned();
    crate::testing_mock_source::validate_manual_mock_source(&text, path.file_name())
        .map_err(|error| test_input_error(path.clone(), error.to_string()))?;
    let source = ResolvedVc::upcast(FileSource::new(path.clone()).to_resolved().await?);
    let module = context
        .process(
            *source,
            ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
        )
        .module()
        .to_resolved()
        .await?;
    let ident = module.ident().await?;
    let relative = root.get_path_to(&ident.path).ok_or_else(|| {
        test_input_error(
            path.clone(),
            "Manual mock sources must stay inside the Next project",
        )
    })?;
    if relative.split('/').any(|part| part == "node_modules")
        || !ident.query.is_empty()
        || !ident.fragment.is_empty()
    {
        return Err(test_input_error(
            path.clone(),
            "External manual mocks and resolved queries/fragments are not implemented",
        ));
    }
    let transformed = (*module.source().await?).ok_or_else(|| {
        test_input_error(
            path.clone(),
            "Manual mocks require an inspectable compiler source",
        )
    })?;
    let transformed_text = file_content_rope(transformed.content().file_content())
        .await?
        .to_str()?
        .into_owned();
    crate::testing_mock_source::validate_manual_mock_source(&transformed_text, path.file_name())
        .map_err(|error| test_input_error(path.clone(), error.to_string()))?;
    let placeable = ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(module)
        .ok_or_else(|| {
            test_input_error(path.clone(), "Manual mock must be a compiled ESM module")
        })?;
    let EcmascriptExports::EsmExports(exports) = *placeable.get_exports().await? else {
        return Err(test_input_error(
            path.clone(),
            "CommonJS and dynamic manual mock modules are not implemented",
        ));
    };
    if !exports
        .expand_exports(ModuleExportUsageInfo::all())
        .await?
        .dynamic_exports
        .is_empty()
    {
        return Err(test_input_error(
            path,
            "Manual mocks require statically known ESM exports",
        ));
    }
    Ok((source, module))
}

/// RSC test output retains its actual mock plan in the immutable asset closure.
pub(crate) async fn rsc_mock_metadata(
    path: &FileSystemPath,
    output_path: FileSystemPath,
) -> Result<Option<Vc<VirtualOutputAsset>>> {
    let plan = static_mock_plan(path).await?;
    if plan.is_empty() {
        return Ok(None);
    }
    if plan.reset_modules {
        bail!("RSC module cache resets are not supported yet");
    }
    Ok(Some(VirtualOutputAsset::new(
        output_path,
        AssetContent::file(
            FileContent::Content(File::from(
                "{\"moduleMocking\":{\"version\":1}}".to_string(),
            ))
            .cell(),
        ),
    )))
}

/// Produce IDs from the actual processed graph without evaluating any user module.
/// Framework boundaries are resolved compiler paths, never runtime ID text patterns.
async fn module_reset_manifest(
    project: ResolvedVc<Project>,
    context: ResolvedVc<ModuleAssetContext>,
    root_module: ResolvedVc<Box<dyn Module>>,
    path: &FileSystemPath,
) -> Result<ResolvedVc<Box<dyn Module>>> {
    let root = project.project_path().owned().await?;
    let next_package = get_next_package(root.clone()).await?;
    let mut queue = vec![root_module];
    let mut seen = HashSet::new();
    let mut resettable = Vec::new();
    let mut protected = Vec::new();
    while let Some(module) = queue.pop() {
        if !seen.insert(module) {
            continue;
        }
        let ident = module.ident().await?;
        if next_package.get_path_to(&ident.path).is_some() {
            protected.push(module);
            continue;
        }
        if let Some(external) = ResolvedVc::try_downcast_type::<CachedExternalModule>(module) {
            if external.await?.request().starts_with("node:") {
                protected.push(module);
                continue;
            }
            return Err(test_input_error(
                path.clone(),
                "Module cache resets do not support external package modules yet",
            ));
        }
        let relative = root.get_path_to(&ident.path).ok_or_else(|| {
            test_input_error(
                path.clone(),
                "Resettable modules must stay within the Next project",
            )
        })?;
        if relative.split('/').any(|part| part == "node_modules")
            || !ident.query.is_empty()
            || !ident.fragment.is_empty()
        {
            return Err(test_input_error(
                path.clone(),
                "Module cache resets require project-local ESM without package, query or fragment \
                 targets",
            ));
        }
        let placeable = ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(module)
            .ok_or_else(|| {
                test_input_error(path.clone(), "Resettable modules must be compiled ESM")
            })?;
        if !matches!(
            *placeable.get_exports().await?,
            EcmascriptExports::EsmExports(_)
        ) {
            return Err(test_input_error(
                path.clone(),
                "Module cache resets do not support CommonJS user modules",
            ));
        }
        let text = file_content_rope(ident.path.read())
            .await?
            .to_str()?
            .into_owned();
        crate::testing_mock_source::validate_mock_target_source(&text, ident.path.file_name())
            .map_err(|error| test_input_error(ident.path.clone(), error.to_string()))?;
        // Facade/locals/evaluation parts keep distinct actual factory IDs while
        // belonging to the same explicit source entry.
        if ident.path != *path && !static_mock_plan(&ident.path).await?.is_empty() {
            return Err(test_input_error(
                ident.path.clone(),
                "Module reset operations must currently belong to the explicit test entry",
            ));
        }
        resettable.push(module);
        queue.extend(primary_referenced_modules(*module).await?.iter().copied());
    }
    let mut code = String::new();
    let mut assets = fxindexmap! {};
    for (kind, modules) in [("resettable", &resettable), ("protected", &protected)] {
        for (index, module) in modules.iter().enumerate() {
            let request = format!("INNER_MODULE_CACHE_{kind}_{index}");
            assets.insert(request.clone().into(), *module);
            // None suppresses ESM side-effect imports: observing an ID must not
            // evaluate the subject or its transitive static dependencies.
            code.push_str(&format!(
                "import {{ __turbopack_module_id__ as {kind}_{index} }} from '{request}' with {{ \
                 \"turbopack-chunking-type\": \"none\" }};\n"
            ));
        }
    }
    code.push_str(&format!(
        "export const manifest = {{version:1,resettable:[{}],protected:[{}]}};\n",
        (0..resettable.len())
            .map(|index| format!("resettable_{index}"))
            .collect::<Vec<_>>()
            .join(","),
        (0..protected.len())
            .map(|index| format!("protected_{index}"))
            .collect::<Vec<_>>()
            .join(",")
    ));
    let source = test_source(
        path.clone(),
        Some(rcstr!("next-test-module-cache-manifest")),
        code,
    )
    .await?;
    Ok(context
        .process(*source, ReferenceType::Internal(ResolvedVc::cell(assets)))
        .module()
        .to_resolved()
        .await?)
}

#[derive(serde::Serialize)]
pub(crate) struct MockCoverageSource {
    pub source: String,
    pub code: String,
}

pub(crate) struct PreparedTestModule {
    pub context: ResolvedVc<ModuleAssetContext>,
    pub setup_context: ResolvedVc<ModuleAssetContext>,
    pub source: ResolvedVc<Box<dyn Source>>,
    pub registration: Option<ResolvedVc<Box<dyn Module>>>,
    pub module_reset: bool,
    pub coverage_sources: Vec<MockCoverageSource>,
    pub runtime_requests: Vec<String>,
}

async fn prepare_node_test(
    project: ResolvedVc<Project>,
    path: &FileSystemPath,
    id: &RcStr,
    runtime_env: bool,
) -> Result<PreparedTestModule> {
    let base_context = if runtime_env {
        crate::testing_env::context(*project).to_resolved().await?
    } else {
        project.node_test_context().to_resolved().await?
    };
    let base = base_context.await?;
    // Only this explicit entry exposes the active facade through import.meta.
    // Imported helpers retain ordinary application semantics, even if they are
    // separately discovered in-source entries in another file invocation.
    let context = ModuleAssetContext::new(
        *base.transitions,
        *base.compile_time_info,
        crate::testing_in_source::module_options(*base.module_options_context, path.clone()),
        *base.resolve_options_context,
        base.layer.clone(),
    )
    .to_resolved()
    .await?;
    prepare_test_module(project, path, id, context).await
}

/// Reuse the verified mock planner only within an explicitly supplied test context.
/// Ordinary App Page endpoints never call this function.
pub(crate) async fn prepare_test_module(
    project: ResolvedVc<Project>,
    path: &FileSystemPath,
    id: &RcStr,
    context: ResolvedVc<ModuleAssetContext>,
) -> Result<PreparedTestModule> {
    let plan = static_mock_plan(path).await?;
    if plan.is_empty() || plan.reset_modules || !plan.runtime_requests.is_empty() {
        return Ok(PreparedTestModule {
            context,
            setup_context: context,
            source: ResolvedVc::upcast(FileSource::new(path.clone()).to_resolved().await?),
            registration: None,
            module_reset: plan.reset_modules || !plan.runtime_requests.is_empty(),
            runtime_requests: plan.runtime_requests,
            coverage_sources: Vec::new(),
        });
    }
    // Node setup files retain the supplied context's unmocked graph while the
    // spec receives the per-file substitution context. The current RSC mock
    // profile rejects setup inputs before entering this shared planner.
    let setup_base = context.await?;
    let setup_context = ModuleAssetContext::new(
        *setup_base.transitions,
        *setup_base.compile_time_info,
        *setup_base.module_options_context,
        *setup_base.resolve_options_context,
        Layer::new_with_user_friendly_name(
            rcstr!("next-test-node-setup"),
            rcstr!("Node Test Setup"),
        ),
    )
    .to_resolved()
    .await?;
    // Resolve originals and validate cycles with the same unfragmented module
    // identities used by the replacement graph. Fragmented export parts can
    // hide a return edge to the whole original module.
    let base = context.await?;
    let context = ModuleAssetContext::new(
        *base.transitions,
        *base.compile_time_info,
        mock_module_options(*base.module_options_context),
        *base.resolve_options_context,
        base.layer.clone(),
    )
    .to_resolved()
    .await?;
    let root = project.project_path().owned().await?;
    let origin = PlainResolveOrigin::new(*ResolvedVc::upcast(context), path.clone());
    let mut imports = ImportMap::empty();
    let mut targets: FxIndexMap<
        FileSystemPath,
        (
            String,
            String,
            ResolvedVc<Box<dyn Module>>,
            Vec<String>,
            Vec<String>,
        ),
    > = FxIndexMap::default();
    let mut automatic_originals = FxIndexMap::default();
    let mut manual_redirects = FxIndexMap::default();
    let mut registrations = Vec::new();
    for declaration in &plan.declarations {
        let request = declaration.request.as_str();
        if matches!(request, "next" | "react" | "react-dom" | "vitest")
            || request.starts_with("next/")
            || request.starts_with("react/")
            || request.starts_with("react-dom/")
            || request.starts_with("node:")
        {
            return Err(test_input_error(
                path.clone(),
                format!("Framework and native module mock targets are not supported: {request}"),
            ));
        }
        let resolved = esm_resolve(
            Vc::upcast(origin),
            Request::parse(RcStr::from(request).into()),
            EcmaScriptModulesReferenceSubType::Import,
            ResolveErrorMode::Error,
            None,
        )
        .await?;
        let modules = resolved.await?.primary_modules().await?;
        if modules.len() != 1 {
            return Err(test_input_error(
                path.clone(),
                format!("Mock target must resolve to exactly one compiled ESM module: {request}"),
            ));
        }
        let original = modules[0];
        let ident = original.ident().await?;
        if !ident.query.is_empty() || !ident.fragment.is_empty() {
            return Err(test_input_error(
                path.clone(),
                format!(
                    "Module mock targets with resolved queries or fragments are unsupported: \
                     {request}"
                ),
            ));
        }
        let target_path = ident.path.clone();
        let relative = root.get_path_to(&target_path).ok_or_else(|| {
            test_input_error(path.clone(), "Mock targets must be inside the Next project")
        })?;
        if relative.split('/').any(|part| part == "node_modules") || target_path == *path {
            return Err(test_input_error(
                path.clone(),
                format!(
                    "External, framework, and spec module mock targets are not supported: \
                     {request}"
                ),
            ));
        }
        let manual_mock = if declaration.automatic && !declaration.spy {
            let candidate = target_path
                .parent()
                .join(&format!("__mocks__/{}", target_path.file_name()))?;
            if matches!(&*candidate.get_type().await?, FileSystemEntryType::NotFound) {
                None
            } else {
                Some(candidate)
            }
        } else {
            None
        };
        let target_source = file_content_rope(target_path.read())
            .await?
            .to_str()?
            .into_owned();
        // The isolated analyzer owns syntax-aware boundary validation.
        crate::testing_mock_source::validate_mock_target_source(
            &target_source,
            target_path.file_name(),
        )
        .map_err(|error| test_input_error(target_path.clone(), error.to_string()))?;
        let transformed_source = (*original.source().await?).ok_or_else(|| {
            test_input_error(
                path.clone(),
                "Mock targets require an inspectable compiler source",
            )
        })?;
        let transformed_text = file_content_rope(transformed_source.content().file_content())
            .await?
            .to_str()?
            .into_owned();
        crate::testing_mock_source::validate_mock_target_source(
            &transformed_text,
            target_path.file_name(),
        )
        .map_err(|error| test_input_error(target_path.clone(), error.to_string()))?;
        let placeable = ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(original)
            .ok_or_else(|| {
                test_input_error(path.clone(), "Mock target must be a compiled ESM module")
            })?;
        let EcmascriptExports::EsmExports(exports) = *placeable.get_exports().await? else {
            return Err(test_input_error(
                path.clone(),
                format!("CommonJS and dynamic module mock targets are not supported: {request}"),
            ));
        };
        let expanded = exports.expand_exports(ModuleExportUsageInfo::all()).await?;
        if !expanded.dynamic_exports.is_empty() {
            return Err(test_input_error(
                path.clone(),
                format!("Mock targets require statically known exports: {request}"),
            ));
        }
        let index = targets.len();
        let entry = targets.entry(target_path.clone()).or_insert_with(|| {
            (
                format!("next-test-node:{id}:{index}"),
                format!("next-test-original:{id}:{index}"),
                original,
                Vec::new(),
                Vec::new(),
            )
        });
        entry.3 = declaration.export_names.clone();
        entry.4 = declaration.export_names.clone();
        if declaration.has_spread || !declaration.has_object_return {
            entry
                .3
                .extend(expanded.exports.keys().map(|name| name.to_string()));
        }
        entry.3.sort();
        entry.3.dedup();
        if declaration.has_spread || declaration.automatic {
            // Spread and automatic factories materialize an exports object.
            // Read those copied values after the factory resolves, without adding
            // eager imports or live bindings to the original module.
            entry.4 = entry.3.clone();
        }
        if let Some(manual_mock) = manual_mock {
            if plan
                .hoisted
                .iter()
                .any(|helper| helper.has_dynamic_import && helper.start < declaration.factory_start)
            {
                return Err(test_input_error(
                    path.clone(),
                    "Dynamic import() inside an earlier vi.hoisted callback is not yet supported \
                     with manual mock redirects; literal vi.importActual remains available for \
                     actual imports",
                ));
            }
            let redirect = prepare_manual_mock_source(context, &root, manual_mock).await?;
            manual_redirects.insert(target_path.clone(), redirect);
            continue;
        }
        manual_redirects.shift_remove(&target_path);
        let factory_original_request = if declaration.automatic {
            let automatic_request = format!("{}:automatic", entry.1);
            let automatic_source = test_source(
                target_path.clone(),
                Some(rcstr!("next-test-automatic-original")),
                target_source,
            )
            .await?;
            automatic_originals.insert(
                target_path.clone(),
                (automatic_request.clone(), automatic_source),
            );
            automatic_request
        } else {
            entry.1.clone()
        };
        registrations.push((
            entry.0.clone(),
            factory_original_request,
            declaration.factory_source.clone(),
            declaration.factory_start,
            declaration.original_factory_source.clone(),
            declaration.automatic,
            declaration.spy,
        ));
    }
    let mut actual_loaders = Vec::new();
    for (index, import) in plan.actual_imports.iter().enumerate() {
        let request = import.request.as_str();
        if matches!(request, "next" | "react" | "react-dom" | "vitest")
            || request.starts_with("next/")
            || request.starts_with("react/")
            || request.starts_with("react-dom/")
            || request.starts_with("node:")
        {
            return Err(test_input_error(
                path.clone(),
                format!(
                    "vi.importActual currently requires project-local ESM targets; \
                     framework/native targets are unsupported: {request}"
                ),
            ));
        }
        let resolved = esm_resolve(
            Vc::upcast(origin),
            Request::parse(RcStr::from(request).into()),
            EcmaScriptModulesReferenceSubType::Import,
            ResolveErrorMode::Error,
            None,
        )
        .await?;
        let modules = resolved.await?.primary_modules().await?;
        if modules.len() != 1 {
            return Err(test_input_error(
                path.clone(),
                format!(
                    "vi.importActual target must resolve to exactly one compiled ESM module: \
                     {request}"
                ),
            ));
        }
        let original = modules[0];
        let ident = original.ident().await?;
        let target_path = ident.path.clone();
        if !ident.query.is_empty() || !ident.fragment.is_empty() {
            return Err(test_input_error(
                path.clone(),
                format!("vi.importActual resolved queries/fragments are unsupported: {request}"),
            ));
        }
        let relative = root.get_path_to(&target_path).ok_or_else(|| {
            test_input_error(
                path.clone(),
                "vi.importActual targets must be inside the Next project",
            )
        })?;
        if target_path == *path || relative.split('/').any(|part| part == "node_modules") {
            return Err(test_input_error(
                path.clone(),
                format!("External and spec vi.importActual targets are unsupported: {request}"),
            ));
        }
        let target_source = file_content_rope(target_path.read())
            .await?
            .to_str()?
            .into_owned();
        crate::testing_mock_source::validate_mock_target_source(
            &target_source,
            target_path.file_name(),
        )
        .map_err(|error| test_input_error(target_path.clone(), error.to_string()))?;
        let transformed_source = (*original.source().await?).ok_or_else(|| {
            test_input_error(
                path.clone(),
                "vi.importActual targets require an inspectable compiler source",
            )
        })?;
        let transformed_text = file_content_rope(transformed_source.content().file_content())
            .await?
            .to_str()?
            .into_owned();
        crate::testing_mock_source::validate_mock_target_source(
            &transformed_text,
            target_path.file_name(),
        )
        .map_err(|error| test_input_error(target_path.clone(), error.to_string()))?;
        let placeable = ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(original)
            .ok_or_else(|| {
                test_input_error(
                    path.clone(),
                    "vi.importActual target must be a compiled ESM module",
                )
            })?;
        if !matches!(
            *placeable.get_exports().await?,
            EcmascriptExports::EsmExports(_)
        ) {
            return Err(test_input_error(
                path.clone(),
                format!("CommonJS/dynamic vi.importActual targets are unsupported: {request}"),
            ));
        }
        let original_request = if let Some(target) = targets.get(&target_path) {
            target.1.clone()
        } else {
            let original_request = format!("next-test-actual:{id}:{index}");
            imports.insert_exact_alias(
                original_request.clone(),
                ImportMapping::Direct(
                    ResolveResult::source(ResolvedVc::upcast(
                        FileSource::new(target_path).to_resolved().await?,
                    ))
                    .resolved_cell(),
                )
                .resolved_cell(),
            );
            original_request
        };
        actual_loaders.push((import.local.clone(), original_request));
    }
    // After-resolve plugins receive the original request and a bare path, so
    // aliases can hide an effective query. Inspect the actual unspecialized
    // graph before replacing sources rather than collapsing distinct modules.
    let spec = context
        .process(
            Vc::upcast(FileSource::new(path.clone())),
            ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
        )
        .module()
        .to_resolved()
        .await?;
    let mut query_seen = HashSet::new();
    let mut query_queue = vec![spec];
    query_queue.extend(targets.values().map(|(_, _, original, _, _)| *original));
    query_queue.extend(manual_redirects.values().map(|(_, module)| *module));
    while let Some(module) = query_queue.pop() {
        if !query_seen.insert(module) {
            continue;
        }
        let ident = module.ident().await?;
        if targets.contains_key(&ident.path)
            && (!ident.query.is_empty() || !ident.fragment.is_empty())
        {
            return Err(test_input_error(
                path.clone(),
                "Resolved imports of module mock targets with queries or fragments are unsupported",
            ));
        }
        query_queue.extend(primary_referenced_modules(*module).await?.iter().copied());
    }
    // Reject cycles involving mocked originals before creating asynchronous
    // substitutions, which could otherwise turn a module cycle into a deadlock.
    for (target_path, (_, _, original, _, _)) in &targets {
        let mut seen = HashSet::new();
        let mut queue = primary_referenced_modules(**original).await?.to_vec();
        while let Some(module) = queue.pop() {
            if !seen.insert(module) {
                continue;
            }
            if module == *original {
                return Err(test_input_error(
                    path.clone(),
                    format!(
                        "Cyclic module mock targets are not supported: {}",
                        target_path.path
                    ),
                ));
            }
            // Foreign-code contexts are also substituted. A compiled package
            // can lead back to a mocked original just like a project module.
            queue.extend(primary_referenced_modules(*module).await?.iter().copied());
        }
    }
    // Overlay redirect edges while checking manual graphs, so A -> manual B ->
    // A cannot silently become an asynchronous module deadlock after resolution.
    for (target_path, (_, manual)) in &manual_redirects {
        let mut seen = HashSet::new();
        let mut queue = primary_referenced_modules(**manual).await?.to_vec();
        while let Some(module) = queue.pop() {
            if !seen.insert(module) {
                continue;
            }
            let ident = module.ident().await?;
            if module == *manual || ident.path == *target_path {
                return Err(test_input_error(
                    path.clone(),
                    format!(
                        "Cyclic manual module mocks are not implemented: {}",
                        target_path.path
                    ),
                ));
            }
            if let Some((_, redirect)) = manual_redirects.get(&ident.path) {
                queue.push(*redirect);
            } else {
                queue.extend(primary_referenced_modules(*module).await?.iter().copied());
            }
        }
    }
    let runtime_request = "next/dist/experimental/testing/mocking/runtime";
    let mut graph_targets = Vec::new();
    let mut coverage_sources = Vec::new();
    for (target_path, (key, original_request, _, exports, mocked_exports)) in targets {
        imports.insert_exact_alias(
            original_request.clone(),
            ImportMapping::Direct(
                ResolveResult::source(ResolvedVc::upcast(
                    FileSource::new(target_path.clone()).to_resolved().await?,
                ))
                .resolved_cell(),
            )
            .resolved_cell(),
        );
        let mut additional_original_requests = Vec::new();
        if let Some((automatic_request, automatic_source)) =
            automatic_originals.shift_remove(&target_path)
        {
            imports.insert_exact_alias(
                automatic_request.clone(),
                ImportMapping::Direct(ResolveResult::source(automatic_source).resolved_cell())
                    .resolved_cell(),
            );
            additional_original_requests.push(automatic_request.into());
        }
        let wrapper_source = if let Some((source, _)) = manual_redirects.shift_remove(&target_path)
        {
            // Redirect to the source itself: an export-copy wrapper would lose
            // live ESM bindings and namespace identity with direct manual imports.
            source
        } else {
            let wrapper_path = target_path.append(".next-test-mock.js")?;
            let code = mock_wrapper_source(
                runtime_request,
                &key,
                &original_request,
                &exports,
                &mocked_exports,
            )?;
            let wrapper_source = virtual_test_source(wrapper_path, code.clone()).await?;
            coverage_sources.push(MockCoverageSource {
                source: emitted_test_source_identity(project, wrapper_source).await?,
                code,
            });
            wrapper_source
        };
        graph_targets.push(
            MockGraphTarget {
                path: target_path,
                original_request: original_request.into(),
                additional_original_requests,
                wrapper_source,
            }
            .resolved_cell(),
        );
    }
    let original_source = file_content_rope(path.read()).await?.to_str()?.into_owned();
    let original_source_url = emitted_test_source_identity(
        project,
        ResolvedVc::upcast(FileSource::new(path.clone()).to_resolved().await?),
    )
    .await?;
    let registration_request = format!("next-test-registration:{id}");
    let registration_source = test_source(
        path.clone(),
        Some(rcstr!("next-test-mock-registration")),
        mock_registration_source_with_helpers(
            runtime_request,
            &original_source_url,
            &original_source,
            &registrations
                .iter()
                .map(
                    |(
                        key,
                        original_request,
                        factory_source,
                        factory_start,
                        original_factory_source,
                        automatic,
                        spy,
                    )| MockRegistrationSource {
                        key,
                        original_request,
                        factory_source,
                        factory_start: *factory_start,
                        original_factory_source: Some(original_factory_source),
                        automatic: *automatic,
                        spy: *spy,
                    },
                )
                .collect::<Vec<_>>(),
            &plan
                .hoisted
                .iter()
                .map(|declaration| MockHoistedSource {
                    source: &declaration.source,
                    original_source: &declaration.original_source,
                    start: declaration.start,
                    bindings: &declaration.bindings,
                })
                .collect::<Vec<_>>(),
            &actual_loaders
                .iter()
                .map(|(local, original_request)| MockActualSource {
                    local,
                    original_request,
                })
                .collect::<Vec<_>>(),
            &plan.api_bindings,
        )?,
    )
    .await?;
    imports.insert_exact_alias(
        registration_request.clone(),
        ImportMapping::Direct(ResolveResult::source(registration_source).resolved_cell())
            .resolved_cell(),
    );
    let imports = imports.cell().to_resolved().await?;
    let base = context.await?;
    let resolve_options = if graph_targets.is_empty() {
        (*base.resolve_options_context).with_extended_import_map(*imports)
    } else {
        let plugin = MockResolvePlugin::new(MockGraphTargets(graph_targets).cell())
            .to_resolved()
            .await?;
        mock_resolve_options(*base.resolve_options_context, *imports, *plugin)
    };
    let context = ModuleAssetContext::new(
        *base.transitions,
        *base.compile_time_info,
        mock_module_options(*base.module_options_context),
        resolve_options,
        base.layer.clone(),
    )
    .to_resolved()
    .await?;
    let registration = context
        .process(
            *registration_source,
            ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
        )
        .module()
        .to_resolved()
        .await?;
    Ok(PreparedTestModule {
        context,
        setup_context,
        source: test_source(
            path.clone(),
            None,
            mock_spec_source_with_imports(
                &original_source_url,
                &original_source,
                &plan.source,
                &registration_request,
                &plan
                    .hoisted
                    .iter()
                    .flat_map(|declaration| declaration.bindings.iter().cloned())
                    .chain(
                        plan.actual_imports
                            .iter()
                            .map(|import| import.local.clone()),
                    )
                    .collect::<Vec<_>>(),
            )?,
        )
        .await?,
        registration: Some(registration),
        module_reset: false,
        coverage_sources,
        runtime_requests: Vec::new(),
    })
}

/// The spec is a Node module; neither routes nor App RSC transitions participate.
#[turbo_tasks::value]
struct NodeTestEndpoint {
    project: ResolvedVc<Project>,
    path: FileSystemPath,
    setup_paths: Vec<FileSystemPath>,
    snapshot_serializers: Vec<RcStr>,
    id: RcStr,
    cohort_paths: Vec<FileSystemPath>,
    cohort_files: Vec<RcStr>,
    runtime_env: bool,
    dependency_plan: bool,
}

#[turbo_tasks::value_impl]
impl NodeTestEndpoint {
    #[turbo_tasks::function]
    async fn entry_module(&self) -> Result<Vc<Box<dyn Module>>> {
        let environment_bootstrap = if self.runtime_env {
            crate::testing_env::bootstrap(self.project).await?
        } else {
            String::new()
        };
        if !self.cohort_paths.is_empty() {
            let context = if self.runtime_env {
                crate::testing_env::context(*self.project)
                    .to_resolved()
                    .await?
            } else {
                self.project.node_test_context().to_resolved().await?
            };
            let mut internal_assets = fxindexmap! {};
            let mut loads = String::new();
            for (index, path) in self.cohort_paths.iter().enumerate() {
                let request = format!("INNER_TEST_COHORT_{index}");
                let module = context
                    .process(
                        Vc::upcast(FileSource::new(path.clone())),
                        ReferenceType::EcmaScriptModules(
                            EcmaScriptModulesReferenceSubType::Undefined,
                        ),
                    )
                    .module()
                    .to_resolved()
                    .await?;
                internal_assets.insert(request.clone().into(), module);
                loads.push_str(&format!(
                    "case {index}: return require(/*turbopackChunkingType: shared*/ \
                     '{request}');\n"
                ));
            }
            let source = load_next_js_template_no_imports(
                "node-test-cohort.js",
                self.project.project_path().owned().await?,
                &[],
                &[
                    ("__next_test_cohort_load__", &loads),
                    ("__next_test_environment__", &environment_bootstrap),
                ],
                &[],
            )
            .await?;
            let source = test_entry_source(source).await?;
            return Ok(context
                .process(
                    source,
                    ReferenceType::Internal(ResolvedVc::cell(internal_assets)),
                )
                .module());
        }
        if static_mock_plan(&self.path).await?.reset_modules
            && (!self.setup_paths.is_empty() || !self.snapshot_serializers.is_empty())
        {
            return Err(test_input_error(
                self.path.clone(),
                "Module cache resets do not support setup files or serializers yet",
            ));
        }
        let prepared =
            prepare_node_test(self.project, &self.path, &self.id, self.runtime_env).await?;
        let context = prepared.context;
        let setup_context = prepared.setup_context;
        let module = context
            .process(
                *prepared.source,
                ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
            )
            .module()
            .to_resolved()
            .await?;
        let mut internal_assets = fxindexmap! { rcstr!("INNER_TEST_MODULE") => module };
        let module_runtime = if prepared.module_reset {
            let manifest = module_reset_manifest(self.project, context, module, &self.path).await?;
            internal_assets.insert(rcstr!("INNER_TEST_MODULE_CACHE"), manifest);
            "export const moduleTesting = \
             require('next/dist/experimental/testing/mocking/module-cache');\nexport function \
             initializeModuleCache(retire) { return \
             moduleTesting.initializeModuleCache(__turbopack_context__, \
             require(/*turbopackChunkingType: shared*/ 'INNER_TEST_MODULE_CACHE').manifest, \
             retire); }"
        } else {
            ""
        };

        let dynamic_runtime = if !prepared.runtime_requests.is_empty() {
            let manifest = crate::testing_dynamic_mock::manifest(
                self.project,
                context,
                module,
                &self.path,
                &prepared.runtime_requests,
            )
            .await?;
            internal_assets.insert(rcstr!("INNER_TEST_DYNAMIC_MOCKS"), manifest);
            "export function initializeDynamicModuleMocking(options) { return \
             require('next/dist/experimental/testing/mocking/dynamic').\
             initializeDynamicModuleMocking(__turbopack_context__, \
             require(/*turbopackChunkingType: shared*/ 'INNER_TEST_DYNAMIC_MOCKS').manifest, \
             options); }"
        } else {
            ""
        };
        let mut setup_loads = String::new();
        let mut setup_callbacks = String::new();
        if !self.snapshot_serializers.is_empty() {
            let source = snapshot_serializer_source(
                self.project.project_path().owned().await?,
                &self.snapshot_serializers,
            )
            .await?;
            let module = setup_context
                .process(
                    *source,
                    ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
                )
                .module()
                .to_resolved()
                .await?;
            internal_assets.insert(rcstr!("INNER_TEST_SERIALIZERS"), module);
            setup_loads.push_str(
                "await require(/*turbopackChunkingType: shared*/ 'INNER_TEST_SERIALIZERS');\n",
            );
        }
        for (index, path) in self.setup_paths.iter().enumerate() {
            let name = format!("INNER_TEST_SETUP_{index}");
            let module = setup_context
                .process(
                    Vc::upcast(FileSource::new(path.clone())),
                    ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
                )
                .module()
                .to_resolved()
                .await?;
            let source = setup_module_source(path.clone()).await?;
            let wrapper = setup_context
                .process(
                    *source,
                    ReferenceType::Internal(ResolvedVc::cell(fxindexmap! {
                        rcstr!("INNER_TEST_SETUP_SUBJECT") => module
                    })),
                )
                .module()
                .to_resolved()
                .await?;
            internal_assets.insert(name.clone().into(), wrapper);
            setup_callbacks.push_str(&format!(
                "async () => require(/*turbopackChunkingType: shared*/ '{name}'),\n"
            ));
        }
        setup_loads.push_str(&format!(
            "const setupLoaders = [{setup_callbacks}];\nif (setupFilesSequence === 'parallel') \
             {{\nawait Promise.all(setupLoaders.map(load => load()));\n}} else {{ for (const load \
             of setupLoaders) await load(); }}\n"
        ));
        let mock_runtime = if let Some(registration) = prepared.registration {
            internal_assets.insert(rcstr!("INNER_TEST_MOCKS"), registration);
            "export const mockTesting = require('next/dist/experimental/testing/mocking/runtime');"
        } else {
            ""
        };
        let mock_load = if prepared.registration.is_some() {
            "await require(/*turbopackChunkingType: shared*/ 'INNER_TEST_MOCKS');"
        } else {
            ""
        };
        let source = load_next_js_template_no_imports(
            "node-test.js",
            self.project.project_path().owned().await?,
            &[("VAR_TEST_MODULE", "INNER_TEST_MODULE")],
            &[
                ("__next_test_setup__", &setup_loads),
                ("__next_test_environment__", &environment_bootstrap),
                (
                    "__next_test_mock_runtime__",
                    &format!("{mock_runtime}\n{module_runtime}\n{dynamic_runtime}"),
                ),
                ("__next_test_mock_load__", mock_load),
            ],
            &[],
        )
        .await?;
        let source = test_entry_source(source).await?;
        Ok(context
            .process(
                source,
                ReferenceType::Internal(ResolvedVc::cell(internal_assets)),
            )
            .module())
    }

    #[turbo_tasks::function]
    async fn output_assets(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;
        let module = self.entry_module().to_resolved().await?;
        let EntryChunkGroupResult { asset, .. } = *this
            .project
            .server_chunking_context(false)
            .entry_chunk_group(
                this.project
                    .node_root()
                    .await?
                    .join(&format!("server/next-test/{}.js", this.id))?,
                ChunkGroup::Entry(vec![module]),
                this.project.module_graph(*module),
                OutputAssets::empty(),
                OutputAssets::empty(),
                AvailabilityInfo::root(),
            )
            .await?;
        let mut assets = vec![asset];
        if this.dependency_plan {
            assets.push(ResolvedVc::upcast(
                crate::testing_dependencies::dependency_asset(
                    this.project,
                    module,
                    this.path.clone(),
                    this.project
                        .node_root()
                        .await?
                        .join(&format!("server/next-test/{}.dependencies.json", this.id))?,
                )
                .await?,
            ));
        }
        assets.push(ResolvedVc::upcast(
            crate::testing_in_source::source_hash_asset(
                this.path.clone(),
                this.project
                    .node_root()
                    .await?
                    .join(&format!("server/next-test/{}.source.json", this.id))?,
            )
            .await?,
        ));
        if !this.cohort_files.is_empty() {
            let metadata = format!(
                "{{\"cohort\":{{\"version\":1,\"files\":{}}}}}",
                serde_json::to_string(&this.cohort_files)?
            );
            assets.push(ResolvedVc::upcast(
                VirtualOutputAsset::new(
                    this.project
                        .node_root()
                        .await?
                        .join(&format!("server/next-test/{}.cohort.json", this.id))?,
                    AssetContent::file(FileContent::Content(File::from(metadata)).cell()),
                )
                .to_resolved()
                .await?,
            ));
        }
        let plan = static_mock_plan(&this.path).await?;
        if !plan.is_empty() {
            assets.push(ResolvedVc::upcast(
                VirtualOutputAsset::new(
                    this.project
                        .node_root()
                        .await?
                        .join(&format!("server/next-test/{}.metadata.json", this.id))?,
                    AssetContent::file(
                        FileContent::Content(File::from(if !plan.runtime_requests.is_empty() {
                            "{\"moduleCache\":{\"version\":1},\"dynamicModuleMocking\":{\"version\"\
                             :1}}"
                                .to_string()
                        } else if plan.reset_modules {
                            "{\"moduleCache\":{\"version\":1}}".to_string()
                        } else {
                            let prepared = prepare_node_test(
                                this.project,
                                &this.path,
                                &this.id,
                                this.runtime_env,
                            )
                            .await?;
                            serde_json::to_string(&serde_json::json!({
                                "moduleMocking": {
                                    "version": 1,
                                    "coverage": {
                                        "version": 1,
                                        "sources": prepared.coverage_sources,
                                    },
                                },
                            }))?
                        }))
                        .cell(),
                    ),
                )
                .to_resolved()
                .await?,
            ));
        }
        Ok(Vc::cell(assets))
    }
}

#[turbo_tasks::value_impl]
impl Endpoint for NodeTestEndpoint {
    #[turbo_tasks::function]
    async fn output(self: ResolvedVc<Self>) -> Result<Vc<EndpointOutput>> {
        let this = self.await?;
        let assets = self.output_assets();
        let server_paths = all_asset_paths(assets, this.project.node_root().owned().await?, None)
            .owned()
            .await?;
        Ok(EndpointOutput {
            output_assets: assets.to_resolved().await?,
            output_paths: EndpointOutputPaths::NodeJs {
                server_entry_path: format!("server/next-test/{}.js", this.id).into(),
                server_hmr_entry_paths: vec![],
                server_paths,
                client_paths: vec![],
            }
            .resolved_cell(),
            project: this.project,
        }
        .cell())
    }

    #[turbo_tasks::function]
    async fn server_changed(self: Vc<Self>) -> Result<Vc<Completion>> {
        Ok(self.await?.project.server_changed(self.output_assets()))
    }

    #[turbo_tasks::function]
    fn client_changed(self: Vc<Self>) -> Vc<Completion> {
        Completion::immutable()
    }

    #[turbo_tasks::function]
    async fn entries(self: Vc<Self>) -> Result<Vc<GraphEntries>> {
        Ok(
            GraphEntries::from_chunk_groups(vec![ChunkGroupEntry::Entry {
                modules: vec![self.entry_module().to_resolved().await?],
                heuristics: EntryHeuristics::high_priority(),
            }])
            .cell(),
        )
    }

    #[turbo_tasks::function]
    async fn module_graphs(self: Vc<Self>) -> Result<Vc<ModuleGraphs>> {
        Ok(Vc::cell(vec![
            self.await?
                .project
                .module_graph(self.entry_module())
                .to_resolved()
                .await?,
        ]))
    }

    #[turbo_tasks::function]
    fn project(&self) -> Vc<Project> {
        *self.project
    }

    #[turbo_tasks::function]
    fn traced_files(self: Vc<Self>) -> Vc<FileSystemPathVec> {
        Vc::cell(vec![])
    }
}

/// Emit a strongly consistent graph into a fresh sibling of the normal output
/// directory. Keeping its depth preserves the runtime's relative project root.
#[turbo_tasks::function(operation, root)]
pub async fn snapshot_endpoint_operation(
    endpoint: OperationVc<OptionEndpoint>,
    directory: RcStr,
) -> Result<Vc<crate::route::EndpointOutputPaths>> {
    if !directory.starts_with(".next-test-")
        || !directory
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'.')
    {
        bail!("Test snapshot directory must be a generated .next-test-* basename");
    }
    let endpoint = (*endpoint.connect().await?).context("Missing test endpoint")?;
    let output = endpoint.output().await?;
    let project = output.project;
    let node_root = project.node_root().owned().await?;
    if node_root.file_name() == &*directory {
        bail!("Test snapshots must not overwrite the active output directory");
    }
    let client_root = project.client_relative_path().owned().await?;
    let destination = node_root.parent().join(&directory)?;
    let mut assets = vec![];
    for asset in all_assets_from_entries(*output.output_assets).await?.iter() {
        let path = asset.path().await?;
        let relative = node_root
            .get_path_to(&path)
            .or_else(|| client_root.get_path_to(&path));
        let relative = relative.with_context(|| {
            format!(
                "Test artifacts do not yet support reachable output assets outside the server and \
                 client output roots: {}. No runnable artifact was published.",
                path.path,
            )
        })?;
        let content = asset.content();
        if matches!(&*content.await?, AssetContent::Redirect(_)) {
            bail!(
                "Test artifacts do not yet support external package links or other symbolic-link \
                 output assets: {}. Pinning external dependency contents is required before this \
                 entry can be published.",
                path.path,
            );
        }
        assets.push(ResolvedVc::upcast(
            VirtualOutputAsset::new(destination.join(relative)?, content)
                .to_resolved()
                .await?,
        ));
    }
    next_core::emit_assets(
        Vc::cell(assets),
        destination.clone(),
        client_root,
        destination,
    )
    .as_side_effect()
    .await?;
    Ok(*output.output_paths)
}
