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
use turbo_tasks::{Completion, FxIndexMap, OperationVc, ResolvedVc, Vc, fxindexmap};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbopack::{ModuleAssetContext, module_options::ModuleOptionsContext};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkingContext, EntryChunkGroupResult, availability_info::AvailabilityInfo},
    context::AssetContext,
    file_source::FileSource,
    ident::AssetIdent,
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
    virtual_output::VirtualOutputAsset,
    virtual_source::VirtualSource,
};
use turbopack_ecmascript::chunk::{EcmascriptChunkPlaceable, EcmascriptExports};
use turbopack_resolve::{ecmascript::esm_resolve, resolve_options_context::ResolveOptionsContext};

use crate::{
    operation::OptionEndpoint,
    paths::all_asset_paths,
    project::{Project, ProjectContainer},
    route::{Endpoint, EndpointOutput, EndpointOutputPaths, ModuleGraphs},
    testing_mock_graph::{
        MockGraphTarget, MockGraphTargets, MockRegistrationSource, MockResolvePlugin,
        mock_registration_source, mock_spec_source, mock_wrapper_source,
    },
    testing_mock_source::{StaticMockPlan, extract_static_mocks},
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
    let mut aliases = vec![("vitest", "dist/experimental/testing/vitest.js")];
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
) -> Result<Vc<OptionEndpoint>> {
    let entry = TestEntryOptions {
        file,
        id,
        environment,
        setup_files,
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
    } = &*entry.await?;
    let file = file.clone();
    let id = id.clone();
    let environment = environment.clone();
    if !matches!(&*environment, "rsc" | "node" | "browser") {
        bail!("Unknown test compilation environment: {}", environment);
    }
    if id.is_empty()
        || !id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
    {
        bail!("Test entry IDs must contain only ASCII letters, digits, '-' and '_'");
    }
    for file in std::iter::once(&file).chain(setup_files.iter()) {
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
    let project_path = project.project_path().owned().await?;
    let setup_paths = setup_files
        .iter()
        .map(|file| project_path.join(file))
        .collect::<Result<Vec<_>>>()?;
    let path = project_path.join(&file)?;
    if project.next_mode().await?.is_production()
        && !static_mock_plan(&path).await?.declarations.is_empty()
    {
        return Err(test_input_error(
            path.clone(),
            "Static module mocks are not supported in production test profiles",
        ));
    }
    if &*environment != "node" && !static_mock_plan(&path).await?.declarations.is_empty() {
        return Err(test_input_error(
            path.clone(),
            "Static module mocks currently support Node test entries only",
        ));
    }
    for setup_path in &setup_paths {
        if !static_mock_plan(setup_path).await?.declarations.is_empty() {
            return Err(test_input_error(
                setup_path.clone(),
                "Static module mocks in setup files are not supported yet",
            ));
        }
    }
    if &*environment != "rsc" {
        let path = project.project_path().owned().await?.join(&file)?;
        return Ok(Vc::upcast(
            NodeTestEndpoint {
                project,
                path,
                setup_paths,
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
    Ok(app.test_endpoint(file, id, setup_paths))
}

async fn static_mock_plan(path: &FileSystemPath) -> Result<StaticMockPlan> {
    let source = file_content_rope(path.read()).await?.to_str()?.into_owned();
    // This pure analyzer returns only syntax/unsupported-input errors. Do not
    // include file reads, graph resolution, or generated-map invariants here.
    extract_static_mocks(&source, path.file_name())
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

async fn test_source(
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

struct PreparedNodeTest {
    context: ResolvedVc<ModuleAssetContext>,
    source: ResolvedVc<Box<dyn Source>>,
    registration: Option<ResolvedVc<Box<dyn Module>>>,
}

async fn prepare_node_test(
    project: ResolvedVc<Project>,
    path: &FileSystemPath,
    id: &RcStr,
    setup_paths: &[FileSystemPath],
) -> Result<PreparedNodeTest> {
    let context = project.node_test_context().to_resolved().await?;
    let plan = static_mock_plan(path).await?;
    if plan.declarations.is_empty() {
        return Ok(PreparedNodeTest {
            context,
            source: ResolvedVc::upcast(FileSource::new(path.clone()).to_resolved().await?),
            registration: None,
        });
    }
    if !setup_paths.is_empty() {
        return Err(test_input_error(
            path.clone(),
            "Static module mocks with setup files are not supported yet",
        ));
    }
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
        (String, String, ResolvedVc<Box<dyn Module>>, Vec<String>),
    > = FxIndexMap::default();
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
            )
        });
        entry.3 = declaration.export_names.clone();
        if declaration.has_spread || !declaration.has_object_return {
            entry
                .3
                .extend(expanded.exports.keys().map(|name| name.to_string()));
        }
        entry.3.sort();
        entry.3.dedup();
        registrations.push((
            entry.0.clone(),
            entry.1.clone(),
            declaration.factory_source.clone(),
            declaration.factory_start,
        ));
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
    query_queue.extend(targets.values().map(|(_, _, original, _)| *original));
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
    for (target_path, (_, _, original, _)) in &targets {
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
    let runtime_request = "next/dist/experimental/testing/mocking/runtime";
    let mut graph_targets = Vec::new();
    for (target_path, (key, original_request, _, exports)) in targets {
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
        let wrapper_source = virtual_test_source(
            target_path.append(".next-test-mock.js")?,
            mock_wrapper_source(runtime_request, &key, &exports)?,
        )
        .await?;
        graph_targets.push(
            MockGraphTarget {
                path: target_path,
                original_request: original_request.into(),
                wrapper_source,
            }
            .resolved_cell(),
        );
    }
    let plugin = MockResolvePlugin::new(MockGraphTargets(graph_targets).cell())
        .to_resolved()
        .await?;
    let base = context.await?;
    let context = ModuleAssetContext::new(
        *base.transitions,
        *base.compile_time_info,
        mock_module_options(*base.module_options_context),
        mock_resolve_options(*base.resolve_options_context, imports.cell(), *plugin),
        base.layer.clone(),
    )
    .to_resolved()
    .await?;
    let original_source = file_content_rope(path.read()).await?.to_str()?.into_owned();
    let original_source_url = format!("turbopack:///{}", path.path);
    let registration_source = test_source(
        path.clone(),
        Some(rcstr!("next-test-mock-registration")),
        mock_registration_source(
            runtime_request,
            &original_source_url,
            &original_source,
            &registrations
                .iter()
                .map(|(key, original_request, factory_source, factory_start)| {
                    MockRegistrationSource {
                        key,
                        original_request,
                        factory_source,
                        factory_start: *factory_start,
                    }
                })
                .collect::<Vec<_>>(),
        )?,
    )
    .await?;
    let registration = context
        .process(
            *registration_source,
            ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
        )
        .module()
        .to_resolved()
        .await?;
    Ok(PreparedNodeTest {
        context,
        source: test_source(
            path.clone(),
            None,
            mock_spec_source(&original_source_url, &original_source, &plan.source)?,
        )
        .await?,
        registration: Some(registration),
    })
}

/// The spec is a Node module; neither routes nor App RSC transitions participate.
#[turbo_tasks::value]
struct NodeTestEndpoint {
    project: ResolvedVc<Project>,
    path: FileSystemPath,
    setup_paths: Vec<FileSystemPath>,
    id: RcStr,
}

#[turbo_tasks::value_impl]
impl NodeTestEndpoint {
    #[turbo_tasks::function]
    async fn entry_module(&self) -> Result<Vc<Box<dyn Module>>> {
        let prepared =
            prepare_node_test(self.project, &self.path, &self.id, &self.setup_paths).await?;
        let context = prepared.context;
        let module = context
            .process(
                *prepared.source,
                ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
            )
            .module()
            .to_resolved()
            .await?;
        let mut internal_assets = fxindexmap! { rcstr!("INNER_TEST_MODULE") => module };
        let mut setup_loads = String::new();
        for (index, path) in self.setup_paths.iter().enumerate() {
            let name = format!("INNER_TEST_SETUP_{index}");
            let module = context
                .process(
                    Vc::upcast(FileSource::new(path.clone())),
                    ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
                )
                .module()
                .to_resolved()
                .await?;
            internal_assets.insert(name.clone().into(), module);
            setup_loads.push_str(&format!(
                "await require(/*turbopackChunkingType: shared*/ '{name}');\n"
            ));
        }
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
                ("__next_test_mock_runtime__", mock_runtime),
                ("__next_test_mock_load__", mock_load),
            ],
            &[],
        )
        .await?;
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
        if !static_mock_plan(&this.path).await?.declarations.is_empty() {
            assets.push(ResolvedVc::upcast(
                VirtualOutputAsset::new(
                    this.project
                        .node_root()
                        .await?
                        .join(&format!("server/next-test/{}.metadata.json", this.id))?,
                    AssetContent::file(
                        FileContent::Content(File::from(
                            "{\"moduleMocking\":{\"version\":1}}".to_string(),
                        ))
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
