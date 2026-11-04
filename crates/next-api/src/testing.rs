//! Explicit testing entries into the existing Next.js compiler. This does
//! not alter route discovery or add test entries to ordinary application builds.

use std::collections::{HashMap, HashSet};

use anyhow::{Context, Result, bail};
use async_trait::async_trait;
use next_core::{
    app_structure::FileSystemPathVec,
    get_next_package,
    util::{file_content_rope, load_next_js_template_no_imports},
};
use next_taskless::NODE_EXTERNALS;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{Completion, FxIndexMap, OperationVc, ResolvedVc, ValueToString, Vc, fxindexmap};
use turbo_tasks_fs::{File, FileContent, FileSystemEntryType, FileSystemPath};
use turbo_tasks_hash::HashAlgorithm;
use turbopack::{
    ModuleAssetContext,
    module_options::{ModuleOptionsContext, RuleCondition, transition_rule::TransitionRule},
    transition::{FullContextTransition, TransitionOptions},
};
use turbopack_core::{
    asset::{Asset, AssetContent, no_hash_salt},
    chunk::{
        ChunkingContext, ChunkingType, EntryChunkGroupResult, SourceMapSourceType,
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
        runtime_import_demands::{
            RuntimeImportDemandGraph, RuntimeImportNamespaceCertificate, RuntimeImportNamespaceKind,
        },
    },
    output::{OutputAsset, OutputAssets},
    reference::{
        ModuleReference, all_assets_from_entries, primary_chunkable_referenced_modules,
        primary_referenced_modules,
    },
    reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
    resolve::{
        ResolveErrorMode, ResolveResult,
        options::{ImportMap, ImportMapping},
        origin::PlainResolveOrigin,
        parse::Request,
    },
    source::Source,
    source_map::{
        GenerateSourceMap, structured::StructuredSourceMap, utils::absolute_fileify_source_map,
    },
    virtual_output::VirtualOutputAsset,
    virtual_source::VirtualSource,
};
use turbopack_ecmascript::{
    EcmascriptModuleAsset,
    chunk::{EcmascriptChunkPlaceable, EcmascriptExports},
    cjs_reset_export::{CommonJsResetExportShape, commonjs_callable_publication_certificate},
    code_gen::CodeGen,
    module_fragments::part::module::EcmascriptModulePartAsset,
    references::{
        cjs::CjsRequireAssetReference,
        esm::EsmAsyncAssetReference,
        external_module::{CachedExternalModule, ExternalsSymlinkAsset},
    },
    side_effect_optimization::locals::module::EcmascriptModuleLocalsModule,
};
use turbopack_resolve::{ecmascript::esm_resolve, resolve_options_context::ResolveOptionsContext};

use crate::{
    operation::OptionEndpoint,
    paths::all_asset_paths,
    project::{Project, ProjectContainer},
    route::{Endpoint, EndpointOutput, EndpointOutputPaths, ModuleGraphs},
    testing_mock_graph::{
        MockActualSource, MockBuiltinFactoryTarget, MockBuiltinResolvePlugin, MockGraphTarget,
        MockGraphTargets, MockHoistedSource, MockImportKind, MockImportSource, MockOriginalSource,
        MockRegistrationSource, MockResolvePlugin, compiled_commonjs_namespace_wrapper_source,
        mock_registration_source_with_paired_native_helpers, mock_spec_source_with_imports,
        mock_wrapper_source_with_original_cycle, virtual_mock_wrapper_source,
    },
    testing_mock_source::{
        NativeUnmockTarget, StaticMockPlan, extract_test_mocks, native_unmock_original_is_available,
    },
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
    // Vitest resolves a real JavaScript file first, then tries the corresponding
    // TypeScript source. Keep this separate from NodeNext's TS-first resolver.
    let mut fallbacks = ImportMap::empty();
    for prefix in ["./", "../"] {
        for (extension, replacements) in [
            (".js", &[".ts", ".tsx"][..]),
            (".mjs", &[".mts"][..]),
            (".cjs", &[".cts"][..]),
        ] {
            fallbacks.insert_wildcard_alias_with_suffix(
                prefix,
                extension,
                ImportMapping::primary_alternatives(
                    replacements
                        .iter()
                        .map(|replacement| format!("{prefix}*{replacement}").into())
                        .collect(),
                    None,
                )
                .resolved_cell(),
            );
        }
    }
    let mut extended = context
        .with_extended_import_map(imports.cell())
        .with_extended_fallback_import_map(fallbacks.cell())
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
    compiler_features: (
        bool,
        bool,
        bool,
        Vec<RcStr>,
        bool,
        Option<RcStr>,
        bool,
        bool,
    ),
) -> Result<Vc<OptionEndpoint>> {
    // Keep the operation within turbo-tasks' twelve-argument input tuple limit.
    let (
        dependency_plan,
        browser_client,
        source_coverage,
        alias_finds,
        import_coverage_roles,
        tsconfig_input_revision,
        browser_source_coverage,
        preserve_coverage_sources,
    ) = compiler_features;
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
        source_coverage,
        alias_finds,
        import_coverage_roles,
        tsconfig_input_revision,
        browser_source_coverage,
        preserve_coverage_sources,
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
    pub source_coverage: bool,
    pub browser_source_coverage: bool,
    pub preserve_coverage_sources: bool,
    pub import_coverage_roles: bool,
    pub tsconfig_input_revision: Option<RcStr>,
    pub alias_finds: Vec<RcStr>,
}

/// Initial source-file URL compatibility is limited to actual isolated Node graphs.
/// Browser, route rendering, shared cohorts and coverage retain their own options.
pub(crate) fn test_entry_source_file_urls(entry: &TestEntryOptions) -> bool {
    &*entry.environment == "node"
        && !entry.browser_client
        && entry.route.is_none()
        && entry.cohort_files.is_empty()
        && !entry.source_coverage
        && !entry.browser_source_coverage
        && !entry.preserve_coverage_sources
        && !entry.import_coverage_roles
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
        source_coverage,
        browser_source_coverage,
        preserve_coverage_sources,
        alias_finds,
        import_coverage_roles,
        tsconfig_input_revision,
    } = &*entry.await?;
    if !alias_finds.is_empty()
        && (&**environment != "node"
            || project.next_mode().await?.is_production()
            || *browser_client
            || route.is_some())
    {
        return Err(test_input_error(
            project.project_path().owned().await?,
            "Mapped compiler aliases currently require a route-less development Node profile",
        ));
    }
    if let Some(revision) = tsconfig_input_revision {
        if revision.is_empty()
            || revision.len() > 256
            || revision.contains('\0')
            || *browser_client
            || &*environment != "node"
            || route.is_some()
        {
            bail!(
                "Native TypeScript config provenance requires an opaque parent revision and \
                 isolated Node test entry"
            );
        }
    }
    if *import_coverage_roles && (*browser_client || &*environment != "node" || route.is_some()) {
        bail!("Native import coverage roles require an isolated Node test entry");
    }
    if *preserve_coverage_sources
        && (&**environment != "node"
            || !project.next_mode().await?.is_development()
            || *browser_client
            || *source_coverage
            || *browser_source_coverage
            || *dependency_plan
            || route.is_some()
            || !cohort_files.is_empty())
    {
        return Err(test_input_error(
            project.project_path().owned().await?,
            "Source preservation requires an isolated development Node entry",
        ));
    }
    if *source_coverage
        && (&**environment != "node"
            || !project.next_mode().await?.is_production()
            || *browser_client
            || *runtime_env
            || *dependency_plan
            || route.is_some()
            || !cohort_files.is_empty())
    {
        return Err(test_input_error(
            project.project_path().owned().await?,
            "Source coverage requires an isolated production Node entry",
        ));
    }
    if *browser_source_coverage
        && (!*browser_client
            || &**environment != "browser"
            || !(project.next_mode().await?.is_production()
                || project.next_mode().await?.is_development())
            || *source_coverage
            || *runtime_env
            || *dependency_plan
            || *import_coverage_roles
            || route.is_some()
            || !setup_files.is_empty()
            || !snapshot_serializers.is_empty()
            || !cohort_files.is_empty())
    {
        return Err(test_input_error(
            project.project_path().owned().await?,
            "Browser source coverage requires an isolated development or production Browser \
             client entry",
        ));
    }
    if *dependency_plan
        && ((&**environment != "node" && !(*browser_client && &**environment == "browser"))
            || !cohort_files.is_empty())
    {
        return Err(test_input_error(
            project.project_path().owned().await?,
            "Dependency planning currently requires isolated Node entries",
        ));
    }
    if *browser_client
        && (&**environment != "browser"
            || !snapshot_serializers.is_empty()
            || !cohort_files.is_empty()
            || *runtime_env
            || route.is_some())
    {
        return Err(test_input_error(
            project.project_path().owned().await?,
            "Browser Mode requires an isolated client entry without serializers, cohorts, routes \
             or Node features",
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
    if route.is_some() && &*environment != "rsc" {
        bail!("Route-aware tests require one-shot Node RSC entries");
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
        if (&*environment != "node" && (&*environment != "rsc" || route.is_none()))
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
    let production_plan = static_mock_plan(&path).await?;
    let browser_helpers = *browser_client
        && project.next_mode().await?.is_development()
        && route.is_none()
        && setup_paths.is_empty()
        && snapshot_serializers.is_empty()
        && !production_plan.reset_modules;
    if (!production_plan.mock_imports.is_empty() || !production_plan.unmocks.is_empty())
        && ((&*environment != "node" && !browser_helpers)
            || !project.next_mode().await?.is_development()
            || route.is_some())
        && !(&*environment == "node"
            && project.next_mode().await?.is_production()
            && route.is_none()
            && production_plan.native_unmock_targets().is_some()
            && production_paired_native_actual_plan(&production_plan))
    {
        return Err(test_input_error(
            path.clone(),
            "vi.importMock and vi.unmock currently require route-less development Node or Browser",
        ));
    }
    if project.next_mode().await?.is_production()
        && !production_plan.is_empty()
        && ((&*environment != "node" && !*browser_client)
            || route.is_some()
            || !setup_paths.is_empty()
            || !snapshot_serializers.is_empty()
            || !cohort_files.is_empty()
            || !(if *browser_client {
                production_browser_mock_plan(&production_plan)
            } else {
                production_factory_plan(&production_plan)
                    || production_reset_plan(&production_plan)
                    || production_paired_native_actual_plan(&production_plan)
                    || production_native_runtime_plan(&production_plan)
                    || production_original_require_reset_plan(&production_plan)
            }))
    {
        return Err(test_input_error(
            path.clone(),
            "Production module mocks require isolated static relative factory or Browser spy \
             declarations without setup, serializers, in-source entries or other mock features",
        ));
    }
    if &*environment != "node" {
        let plan = static_mock_plan(&path).await?;
        let rsc_mocks_supported = ((&*environment == "rsc" || *browser_client)
            && project.next_mode().await?.is_development()
            || *browser_client
                && project.next_mode().await?.is_production()
                && production_browser_mock_plan(&plan))
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
        if !static_mock_plan(setup_path).await?.is_empty()
            && (&*environment != "node"
                || !project.next_mode().await?.is_development()
                || route.is_some()
                || !cohort_files.is_empty())
        {
            return Err(test_input_error(
                setup_path.clone(),
                "Setup module mocks require isolated development Node without routes or cohorts",
            ));
        }
    }
    if *browser_client {
        return Ok(Vc::upcast(crate::testing_client::ClientTestEndpoint::new(
            *project,
            path,
            id,
            setup_paths,
            *dependency_plan,
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
                source_coverage: *source_coverage,
                import_coverage_roles: *import_coverage_roles,
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
        cohort_files.clone(),
    ))
}

pub(crate) async fn static_mock_plan(path: &FileSystemPath) -> Result<StaticMockPlan> {
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

pub(crate) fn production_factory_plan(plan: &StaticMockPlan) -> bool {
    production_static_mock_plan(plan, false)
}

pub(crate) fn production_browser_mock_plan(plan: &StaticMockPlan) -> bool {
    production_static_mock_plan(plan, true)
}

fn native_unmock_group_matches(
    target: &NativeUnmockTarget,
    registrations: usize,
    external: bool,
    actuals: usize,
    expected_actuals: usize,
) -> bool {
    registrations == target.surviving_factories
        && external == target.retained
        && if target.retained {
            registrations > 0
        } else {
            registrations == 0
        }
        && expected_actuals > 0
        && actuals == expected_actuals
}

// This is only a syntax candidate. Assembly still requires the same resolved
// external originals, actual native certificates and static namespace pairs.
fn production_paired_native_actual_plan(plan: &StaticMockPlan) -> bool {
    !plan.declarations.is_empty()
        && !plan.runtime_requests.is_empty()
        && !plan.actual_imports.is_empty()
        && plan.hoisted.is_empty()
        && plan.mock_imports.is_empty()
        && (plan.unmocks.is_empty() || plan.native_unmock_targets().is_some())
        && plan.declarations.iter().all(|declaration| {
            !declaration.automatic
                && !declaration.spy
                && declaration.has_object_return
                && !declaration.has_spread
                && !declaration.request.starts_with('.')
                && !declaration.request.starts_with('/')
                && !declaration.request.contains(':')
                && plan.runtime_requests.contains(&declaration.request)
        })
        && plan.runtime_requests.iter().all(|request| {
            plan.declarations
                .iter()
                .any(|declaration| &declaration.request == request)
        })
        && plan.actual_imports.iter().all(|actual| {
            plan.runtime_requests.contains(&actual.request)
                && plan
                    .declarations
                    .iter()
                    .any(|declaration| declaration.request == actual.request)
        })
}

// Syntax admission only: production assembly still needs actual native certificates.
fn production_native_runtime_plan(plan: &StaticMockPlan) -> bool {
    let native_request = |request: &str| {
        !request.is_empty()
            && !request.starts_with(['.', '/', '#', '\\'])
            && !request.contains('?')
            && !request.contains('#')
            && (!request.contains(':') || request.starts_with("node:"))
    };
    !plan.runtime_requests.is_empty()
        && plan.actual_imports.is_empty()
        && plan.mock_imports.is_empty()
        && plan.unmocks.is_empty()
        && plan
            .runtime_requests
            .iter()
            .all(|request| native_request(request))
        && plan.declarations.iter().all(|declaration| {
            !declaration.automatic
                && !declaration.spy
                && declaration.has_object_return
                && !declaration.has_spread
                && native_request(&declaration.request)
        })
}

fn production_reset_plan(plan: &StaticMockPlan) -> bool {
    plan.reset_modules
        && plan.declarations.is_empty()
        && plan.hoisted.is_empty()
        && plan.mock_imports.is_empty()
        && plan.unmocks.is_empty()
        && plan.runtime_requests.is_empty()
}

// Syntax admission only. Production preparation still requires the actual
// captured local leaf, one compiled consumer and their resolved require edge.
fn production_original_require_reset_plan(plan: &StaticMockPlan) -> bool {
    plan.commonjs_original_reset_candidate() && plan.declarations[0].request.ends_with(".cjs")
}

fn original_require_reset_context(
    development: bool,
    production: bool,
    runtime_env: bool,
    production_candidate: bool,
) -> bool {
    development != production
        && ((development && runtime_env) || (production && !runtime_env && production_candidate))
}

fn production_static_mock_plan(plan: &StaticMockPlan, browser_spies: bool) -> bool {
    !plan.declarations.is_empty()
        && plan.hoisted.is_empty()
        && plan.actual_imports.is_empty()
        && plan.mock_imports.is_empty()
        && plan.unmocks.is_empty()
        && !plan.reset_modules
        && plan.runtime_requests.is_empty()
        && plan.declarations.iter().all(|declaration| {
            (declaration.request.starts_with("./") || declaration.request.starts_with("../"))
                && ((!declaration.automatic
                    && !declaration.spy
                    && declaration.has_object_return
                    && !declaration.has_spread)
                    || (browser_spies && declaration.automatic && declaration.spy))
        })
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
    canonical_test_source_identity(project, source).await
}

/// Authored inline maps use a canonical source URI before production codegen.
/// The final native relative-map transform only rewrites Turbopack identities,
/// so this preserves exact spec/factory locations without changing optimization.
pub(crate) async fn canonical_test_source_identity(
    project: ResolvedVc<Project>,
    source: ResolvedVc<Box<dyn Source>>,
) -> Result<String> {
    let source_ident = source.ident().to_string().await?;
    let map = StructuredSourceMap::from_json_slice(&serde_json::to_vec(&serde_json::json!({
        "version": 3,
        "sources": [format!("turbopack:///{}", &*source_ident)],
        "names": [],
        "mappings": "",
    }))?)?;
    let map = absolute_fileify_source_map(&map, project.project_root_path().owned().await?).await?;
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

/// Preserve the exact generated Source identity and bytes used by the entry.
/// Coverage readers can then distinguish these wrappers from authored sources.
async fn node_test_harness_source(
    project: ResolvedVc<Project>,
    source: ResolvedVc<Box<dyn Source>>,
    kind: &str,
) -> Result<serde_json::Value> {
    let code = file_content_rope(source.content().file_content()).await?;
    Ok(serde_json::json!({
        "kind": kind,
        "source": canonical_test_source_identity(project, source).await?,
        "code": code.to_str()?.to_string(),
    }))
}

fn push_node_test_harness_source(
    sources: &mut Vec<serde_json::Value>,
    source: serde_json::Value,
) -> Result<()> {
    if let Some(previous) = sources
        .iter()
        .find(|value| value["source"] == source["source"])
    {
        if previous != &source {
            bail!("Conflicting generated test harness source identity");
        }
    } else {
        sources.push(source);
    }
    Ok(())
}

/// User-derived test source must participate in configured loader rules, which
/// intentionally exclude VirtualSource. Synthetic mock wrappers stay virtual.
#[turbo_tasks::value]
pub(crate) struct TestSource {
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

/// This is the same FileSource selected by the protected authoring import map.
#[turbo_tasks::function]
pub(crate) async fn test_authoring_source(
    project_path: FileSystemPath,
    browser: bool,
) -> Result<Vc<Box<dyn Source>>> {
    let next = get_next_package(project_path).await?;
    let target = if browser {
        "dist/experimental/testing/client/vitest.js"
    } else {
        "dist/experimental/testing/vitest.js"
    };
    Ok(Vc::upcast(FileSource::new(next.join(target)?)))
}

/// Explicit test entries consume whole modules. Module fragments can publish
/// incomplete exports through this entry graph, including in an unmocked file.
#[turbo_tasks::function]
pub(crate) async fn test_module_options_context(
    options: Vc<ModuleOptionsContext>,
    preserve_coverage_source: bool,
    authoring_adapter: ResolvedVc<Box<dyn Source>>,
    inject_commonjs_exports: bool,
    source_file_urls: bool,
) -> Result<Vc<ModuleOptionsContext>> {
    let mut options = options.owned().await?;
    options.module_fragments_enabled = false;
    options.ecmascript.test_declaration_call_adapter = Some(authoring_adapter);
    options.ecmascript.test_injected_commonjs_exports = inject_commonjs_exports;
    options.ecmascript.test_source_file_urls = source_file_urls;
    // Test modules observe the window supplied by their actual execution realm.
    // Normal application server/client contexts keep their own constant folding.
    options.ecmascript.enable_typeof_window_inlining = None;
    if preserve_coverage_source {
        options.ecmascript.cross_module_constants = false;
        options.ecmascript.mangle_export_names = false;
        options.ecmascript.cjs_scope_hoisting = false;
        options.ecmascript.cjs_tree_shaking = false;
        options.ecmascript.infer_module_side_effects = false;
        options.follow_reexports = false;
        options.side_effect_free_packages = None;
    }
    for (_, nested) in &mut options.rules {
        *nested = test_module_options_context(
            **nested,
            preserve_coverage_source,
            *authoring_adapter,
            inject_commonjs_exports,
            source_file_urls,
        )
        .to_resolved()
        .await?;
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
async fn builtin_mock_resolve_options(
    options: Vc<ResolveOptionsContext>,
    plugin: ResolvedVc<MockBuiltinResolvePlugin>,
) -> Result<Vc<ResolveOptionsContext>> {
    let mut extended = options.owned().await?;
    extended
        .before_resolve_plugins
        .insert(0, ResolvedVc::upcast(plugin));
    for (_, nested) in &mut extended.rules {
        *nested = builtin_mock_resolve_options(**nested, *plugin)
            .to_resolved()
            .await?;
    }
    Ok(extended.cell())
}

#[turbo_tasks::function]
pub(crate) async fn registration_module_resolve_options(
    options: Vc<ResolveOptionsContext>,
    imports: ResolvedVc<ImportMap>,
) -> Result<Vc<ResolveOptionsContext>> {
    let mut options = options.with_extended_import_map(*imports).owned().await?;
    for (_, nested) in &mut options.rules {
        *nested = registration_module_resolve_options(**nested, *imports)
            .to_resolved()
            .await?;
    }
    Ok(options.cell())
}

pub(crate) fn builtin_factory_name(request: &str) -> Option<&str> {
    let name = request.strip_prefix("node:").unwrap_or(request);
    NODE_EXTERNALS.binary_search(&name).is_ok().then_some(name)
}

async fn builtin_factory_requests(
    context: ResolvedVc<ModuleAssetContext>,
    importer: &FileSystemPath,
    authored_request: &str,
    name: &str,
) -> Result<Vec<RcStr>> {
    let origin = PlainResolveOrigin::new(*ResolvedVc::upcast(context), importer.clone());
    let mut requests = Vec::new();
    for request in [
        authored_request.to_owned(),
        name.to_owned(),
        format!("node:{name}"),
    ] {
        let request = RcStr::from(request);
        if requests.contains(&request) {
            continue;
        }
        let resolved = esm_resolve(
            Vc::upcast(origin),
            Request::parse(request.clone().into()),
            EcmaScriptModulesReferenceSubType::Import,
            ResolveErrorMode::Ignore,
            None,
        )
        .await?;
        let modules = resolved.await?.primary_modules().await?;
        if modules.len() == 1
            && let Some(external) =
                ResolvedVc::try_downcast_type::<CachedExternalModule>(modules[0])
            && builtin_factory_name(&external.await?.request()) == Some(name)
        {
            requests.push(request);
        }
    }
    Ok(requests)
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

/// Use the same actual full leaf owner at manifest production and final codegen.
/// The module type/extension never supplies an executable-dependency exemption.
async fn commonjs_leaf_promise_namespace(
    module: ResolvedVc<Box<dyn Module>>,
    enabled: bool,
) -> Result<Option<ResolvedVc<RuntimeImportNamespaceCertificate>>> {
    if !enabled {
        return Ok(None);
    }
    let Some(full) = ResolvedVc::try_downcast_type::<EcmascriptModuleAsset>(module) else {
        return Ok(None);
    };
    if !matches!(*full.get_exports().await?, EcmascriptExports::CommonJs(_))
        || !primary_chunkable_referenced_modules(*module, false, false)
            .await?
            .is_empty()
    {
        return Ok(None);
    }
    let analysis = full.analyze().await?;
    if !analysis.successful
        || analysis
            .code_generation
            .await?
            .code_gens
            .iter()
            .any(|code| matches!(code, CodeGen::DynamicExpression(_)))
    {
        return Ok(None);
    }
    Ok(Some(
        RuntimeImportNamespaceCertificate {
            kind: RuntimeImportNamespaceKind::CommonJsLeafPromise,
            module,
            export_order: Vec::new(),
        }
        .resolved_cell(),
    ))
}

/// Produce IDs from the actual processed graph without evaluating any user module.
/// Framework boundaries are resolved compiler paths, never runtime ID text patterns.
async fn module_reset_manifest(
    project: ResolvedVc<Project>,
    context: ResolvedVc<ModuleAssetContext>,
    root_module: ResolvedVc<Box<dyn Module>>,
    path: &FileSystemPath,
    native_modules: &[crate::testing_external_modules::NativeExternalCertificate],
    native_protected: &[crate::testing_external_modules::NativeExternalCertificate],
    compiled_modules: &[ResolvedVc<Box<dyn Module>>],
    original_require_protected: &[ResolvedVc<Box<dyn Module>>],
    static_pairs: &[crate::testing_static_runtime::StaticMockPair],
    original_initials: &[crate::testing_static_runtime::NativeOriginalInitial],
    commonjs_reset: Option<&crate::testing_cjs_reset::CommonJsResetPreparation>,
    publish_leaf_promises: bool,
) -> Result<(
    ResolvedVc<Box<dyn Module>>,
    Vec<ResolvedVc<RuntimeImportNamespaceCertificate>>,
)> {
    let root = project.project_path().owned().await?;
    let next_package = get_next_package(root.clone()).await?;
    let mut queue = vec![root_module];
    queue.extend(native_modules.iter().map(|known| known.module));
    queue.extend(
        native_protected
            .iter()
            .flat_map(|known| [known.module, known.native]),
    );
    queue.extend(compiled_modules.iter().copied());
    queue.extend(original_require_protected.iter().copied());
    if let Some(commonjs) = commonjs_reset {
        queue.extend(commonjs.protected.iter().copied());
        queue.extend(commonjs.mock_protected.iter().copied());
        queue.extend(commonjs.actual_seeds());
        queue.extend(commonjs.runtime_seeds());
    }
    let static_protected = static_pairs
        .iter()
        .flat_map(|pair| pair.protected.iter().copied())
        .chain(
            original_initials
                .iter()
                .flat_map(|original| original.protected.iter().copied()),
        )
        .collect::<HashSet<_>>();
    queue.extend(static_protected.iter().copied());
    if original_initials.iter().any(|original| {
        static_protected.contains(&original.provider)
            || !native_modules.iter().any(|known| {
                known.original == original.original
                    && known.module == original.provider
                    && ((known.kind
                        == crate::testing_external_modules::NativeOriginalKind::CommonJs)
                        || (known.builtin.is_some()
                            && known.module == known.native
                            && known.kind
                                == crate::testing_external_modules::NativeOriginalKind::Esm))
            })
    }) {
        return Err(test_input_error(
            path.clone(),
            "Original-initial resets require the actual unprotected native CommonJS provider",
        ));
    }
    if static_pairs
        .iter()
        .any(|pair| pair.initial == pair.provider || static_protected.contains(&pair.provider))
    {
        return Err(test_input_error(
            path.clone(),
            "Static namespace protection overlaps a native provider",
        ));
    }
    let mut seen = HashSet::new();
    let mut resettable = Vec::new();
    let mut protected = Vec::new();
    let mut namespaces = Vec::new();
    while let Some(module) = queue.pop() {
        if !seen.insert(module) {
            continue;
        }
        let ident = module.ident().await?;
        if original_require_protected.contains(&module)
            || static_protected.contains(&module)
            || next_package.get_path_to(&ident.path).is_some()
        {
            protected.push(module);
            continue;
        }
        if let Some(commonjs) = commonjs_reset {
            if commonjs.protected.contains(&module) || commonjs.mock_protected.contains(&module) {
                protected.push(module);
                continue;
            }
            if commonjs.contains_resettable(module) {
                resettable.push(module);
                queue.extend(primary_referenced_modules(*module).await?.iter().copied());
                continue;
            }
        }
        if let Some(certificate) = native_protected
            .iter()
            .find(|known| known.module == module || known.native == module)
        {
            let external =
                ResolvedVc::try_downcast_type::<CachedExternalModule>(certificate.native)
                    .ok_or_else(|| {
                        test_input_error(
                            path.clone(),
                            "Protected native graph requires an actual external clone",
                        )
                    })?;
            let native = external
                .await?
                .native_import_module()
                .ok_or_else(|| {
                    test_input_error(
                        path.clone(),
                        "Protected native graph has no native import factory",
                    )
                })?
                .to_resolved()
                .await?;
            if ResolvedVc::upcast::<Box<dyn Module>>(native) != certificate.native
                || certificate.builtin.is_none()
                || (certificate.module != certificate.native
                    && (certificate.kind
                        != crate::testing_external_modules::NativeOriginalKind::CommonJs
                        || !primary_referenced_modules(*certificate.module)
                            .await?
                            .contains(&certificate.native)))
            {
                return Err(test_input_error(
                    path.clone(),
                    "Protected native graph must retain its exact original provider edge",
                ));
            }
            protected.push(module);
            continue;
        }
        if let Some(certificate) = native_modules.iter().find(|known| known.module == module) {
            let Some(external) =
                ResolvedVc::try_downcast_type::<CachedExternalModule>(certificate.native)
            else {
                return Err(test_input_error(
                    path.clone(),
                    "Native reset allowlist requires actual external modules",
                ));
            };
            let native = external
                .await?
                .native_import_module()
                .ok_or_else(|| {
                    test_input_error(
                        path.clone(),
                        "Native reset target has no native import factory",
                    )
                })?
                .to_resolved()
                .await?;
            if ResolvedVc::upcast::<Box<dyn Module>>(native) != certificate.native {
                return Err(test_input_error(
                    path.clone(),
                    "Native reset target is not its certified import module",
                ));
            }
            if module != certificate.native
                && (certificate.kind
                    != crate::testing_external_modules::NativeOriginalKind::CommonJs
                    || !primary_referenced_modules(*module)
                        .await?
                        .contains(&certificate.native))
            {
                return Err(test_input_error(
                    path.clone(),
                    "Native reset wrapper has no actual certified original edge",
                ));
            }
            resettable.push(module);
            continue;
        }
        if let Some(external) = ResolvedVc::try_downcast_type::<CachedExternalModule>(module) {
            if crate::testing_dynamic_mock::original_builtin_external(&external.await?.request()) {
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
        match *placeable.get_exports().await? {
            EcmascriptExports::EsmExports(_) => {}
            EcmascriptExports::CommonJs(_) | EcmascriptExports::EmptyCommonJs => {
                // A require-backed dependency has a different cache lifetime in
                // the reference runner. Only admit a leaf certified by the real
                // compiled references, including unresolved executable edges.
                // File-tracing and resolution metadata do not evaluate modules.
                if !primary_chunkable_referenced_modules(*module, false, false)
                    .await?
                    .is_empty()
                {
                    return Err(test_input_error(
                        ident.path.clone(),
                        "Module cache resets currently require leaf CommonJS modules without \
                         executable dependencies",
                    ));
                }
            }
            _ => {
                return Err(test_input_error(
                    path.clone(),
                    "Module cache resets require compiled ESM or leaf CommonJS modules",
                ));
            }
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
        if let Some(namespace) =
            commonjs_leaf_promise_namespace(module, publish_leaf_promises).await?
        {
            namespaces.push(namespace);
        }
        resettable.push(module);
        queue.extend(primary_referenced_modules(*module).await?.iter().copied());
    }
    if !original_require_protected.is_empty() {
        anyhow::ensure!(
            resettable.contains(&root_module) && !protected.contains(&root_module),
            "Original reset must leave the actual authored entry resettable"
        );
    }
    let mut code = String::new();
    let mut assets = fxindexmap! {};
    for (kind, modules) in [("resettable", &resettable), ("protected", &protected)] {
        for (index, module) in modules.iter().enumerate() {
            let request = format!("INNER_MODULE_CACHE_{kind}_{index}");
            assets.insert(request.clone().into(), *module);
            if static_pairs
                .iter()
                .any(|pair| pair.initial == *module || pair.provider == *module)
                || commonjs_reset.is_some_and(|commonjs| {
                    commonjs.protected.contains(module)
                        || commonjs.mock_protected.contains(module)
                        || commonjs.contains_resettable(*module)
                })
            {
                // require.resolve emits this exact ID and a Parallel factory
                // edge without evaluating the retained static/native module.
                code.push_str(&format!(
                    "const {kind}_{index} = require.resolve('{request}');\n"
                ));
            } else {
                // None suppresses ESM side-effect imports: observing an ID must not
                // evaluate the subject or its transitive static dependencies.
                code.push_str(&format!(
                    "import {{ __turbopack_module_id__ as {kind}_{index} }} from '{request}' with \
                     {{ \"turbopack-chunking-type\": \"none\" }};\n"
                ));
            }
        }
    }
    let static_pairs_source = if static_pairs.is_empty() {
        String::new()
    } else {
        format!(
            ",staticMocks:[{}]",
            static_pairs
                .iter()
                .map(|pair| {
                    let initial = protected
                        .iter()
                        .position(|module| *module == pair.initial)
                        .context("Static namespace must be compiler-protected")?;
                    let provider = resettable
                        .iter()
                        .position(|module| *module == pair.provider)
                        .context("Native static provider must be compiler-resettable")?;
                    Ok(format!(
                        "{{initial:protected_{initial},provider:resettable_{provider}}}"
                    ))
                })
                .collect::<Result<Vec<_>>>()?
                .join(",")
        )
    };
    code.push_str(&format!(
        "export const manifest = {{version:1,resettable:[{}],protected:[{}]{}}};\n",
        (0..resettable.len())
            .map(|index| format!("resettable_{index}"))
            .collect::<Vec<_>>()
            .join(","),
        (0..protected.len())
            .map(|index| format!("protected_{index}"))
            .collect::<Vec<_>>()
            .join(","),
        static_pairs_source
    ));
    let source = test_source(
        path.clone(),
        Some(rcstr!("next-test-module-cache-manifest")),
        code,
    )
    .await?;
    let manifest = context
        .process(*source, ReferenceType::Internal(ResolvedVc::cell(assets)))
        .module()
        .to_resolved()
        .await?;
    Ok((manifest, namespaces))
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
    /// Every actual helper reuses its paired resolved native original.
    pub paired_native_actuals: bool,
    pub coverage_sources: Vec<MockCoverageSource>,
    pub runtime_requests: Vec<String>,
    pub static_runtime_origin: Option<ResolvedVc<ModuleAssetContext>>,
    pub cjs_named_spy: bool,
    pub mock_wrappers: Vec<ResolvedVc<Box<dyn Source>>>,
    pub callable_originals: Vec<(String, ResolvedVc<EcmascriptModuleAsset>, bool)>,
    /// Actual issued leaf owner, never an inferred module ID or native certificate.
    pub commonjs_original_require: Vec<ResolvedVc<Box<dyn Module>>>,
}

async fn prepare_node_test(
    project: ResolvedVc<Project>,
    path: &FileSystemPath,
    id: &RcStr,
    runtime_env: bool,
) -> Result<PreparedTestModule> {
    let context = node_test_input_context(project, path, runtime_env, None).await?;
    let mut prepared = prepare_test_module(project, path, id, context, true).await?;
    if let Some(entry) = project.await?.test_entry {
        let entry = entry.await?;
        let development = project.next_mode().await?.is_development();
        let production_builtins = project.next_mode().await?.is_production()
            && !entry.browser_client
            && entry.route.is_none()
            && !entry.import_coverage_roles
            && static_mock_plan(path).await?.is_empty();
        if (development || production_builtins)
            && &*entry.environment == "node"
            && entry.setup_files.is_empty()
            && entry.snapshot_serializers.is_empty()
            && entry.cohort_files.is_empty()
            && !entry.source_coverage
            && !entry.dependency_plan
            && !prepared.module_reset
        {
            prepared.context = if production_builtins {
                crate::testing_external_modules::native_builtin_context(
                    project.project_path().owned().await?,
                    prepared.context,
                    prepared.source,
                    &entry.id,
                )
                .await?
            } else {
                crate::testing_external_modules::native_external_context(
                    project.project_path().owned().await?,
                    prepared.context,
                    prepared.source,
                    prepared.registration,
                    &entry.id,
                )
                .await?
            };
        }
    }
    Ok(prepared)
}

pub(crate) async fn node_test_input_context(
    project: ResolvedVc<Project>,
    path: &FileSystemPath,
    runtime_env: bool,
    layer: Option<Layer>,
) -> Result<ResolvedVc<ModuleAssetContext>> {
    let base_context = if runtime_env {
        crate::testing_env::context(*project).to_resolved().await?
    } else {
        project.node_test_context().to_resolved().await?
    };
    let base = base_context.await?;
    let transitions = if layer.is_some() {
        // Each authored input has its own substitution layer, while the emitted
        // testing facade and runtime must retain one native file owner. Switch
        // only the resolved Next testing package boundary to the original test
        // context; its transitive runtime imports keep that same context too.
        let testing_runtime = get_next_package(project.project_path().owned().await?)
            .await?
            .join("dist/experimental/testing")?;
        let transition = FullContextTransition::new(*base_context)
            .to_resolved()
            .await?;
        let existing = base.transitions.await?;
        let mut rules = vec![TransitionRule::new_all(
            RuleCondition::ResourcePathInExactDirectory(testing_runtime),
            ResolvedVc::upcast(transition),
        )];
        rules.extend(existing.transition_rules.iter().cloned());
        TransitionOptions {
            named_transitions: existing.named_transitions.clone(),
            transition_rules: rules,
            ..Default::default()
        }
        .resolved_cell()
    } else {
        base.transitions
    };
    // Only this explicit entry exposes the active facade through import.meta.
    // Imported helpers retain ordinary application semantics, even if they are
    // separately discovered in-source entries in another file invocation.
    let context = ModuleAssetContext::new(
        *transitions,
        *base.compile_time_info,
        crate::testing_in_source::module_options(*base.module_options_context, path.clone()),
        *base.resolve_options_context,
        layer.unwrap_or_else(|| base.layer.clone()),
    )
    .to_resolved()
    .await?;
    Ok(context)
}

/// Certify the original's SCC from actual static ESM evaluation references.
/// Dynamic loaders and resolver metadata cannot authorize a pending backedge.
async fn static_original_cycle_members(
    original: ResolvedVc<Box<dyn Module>>,
    path: &FileSystemPath,
) -> Result<Vec<ResolvedVc<Box<dyn Source>>>> {
    let mut incoming: HashMap<ResolvedVc<Box<dyn Module>>, Vec<ResolvedVc<Box<dyn Module>>>> =
        HashMap::new();
    let mut queue = vec![original];
    let mut seen = HashSet::new();
    let mut self_edge = false;
    while let Some(module) = queue.pop() {
        if !seen.insert(module) {
            continue;
        }
        for reference in module.references().await?.iter() {
            if !matches!(
                reference.into_trait_ref().await?.chunking_type(),
                Some(ChunkingType::Parallel {
                    inherit_async: true,
                    ..
                })
            ) {
                continue;
            }
            for dependency in reference
                .resolve_reference()
                .await?
                .primary_modules()
                .await?
            {
                self_edge |= module == original && dependency == original;
                incoming.entry(dependency).or_default().push(module);
                queue.push(dependency);
            }
        }
    }
    let mut members = HashSet::new();
    let mut queue = vec![original];
    while let Some(module) = queue.pop() {
        if !members.insert(module) {
            continue;
        }
        if let Some(parents) = incoming.get(&module) {
            queue.extend(parents.iter().copied());
        }
    }
    if members.len() < 2 && !self_edge {
        return Err(test_input_error(
            path.clone(),
            "Cyclic factory originals require a compiler-certified static ESM cycle",
        ));
    }
    let mut sources = Vec::new();
    for module in members {
        let ident = module.ident().await?;
        let placeable = ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(module)
            .ok_or_else(|| {
                test_input_error(path.clone(), "Cyclic originals require compiled ESM")
            })?;
        if !ident.query.is_empty()
            || !ident.fragment.is_empty()
            || !matches!(
                *placeable.get_exports().await?,
                EcmascriptExports::EsmExports(_)
            )
        {
            return Err(test_input_error(
                path.clone(),
                "Cyclic original members require concrete ESM identities without queries/fragments",
            ));
        }
        let source = (*module.source().await?).ok_or_else(|| {
            test_input_error(
                path.clone(),
                "Cyclic originals require native source identities",
            )
        })?;
        if module != original && !sources.contains(&source) {
            sources.push(source);
        }
    }
    // Stable generation order follows the full native source identity.
    let mut keyed = Vec::new();
    for source in sources {
        keyed.push((source.ident().to_string().await?.to_string(), source));
    }
    keyed.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(keyed.into_iter().map(|(_, source)| source).collect())
}

/// Reuse the verified mock planner only within an explicitly supplied test context.
/// Ordinary App Page endpoints never call this function.
pub(crate) async fn prepare_test_module(
    project: ResolvedVc<Project>,
    path: &FileSystemPath,
    id: &RcStr,
    context: ResolvedVc<ModuleAssetContext>,
    allow_cjs_named_spy: bool,
) -> Result<PreparedTestModule> {
    prepare_test_module_with_inputs(project, path, id, context, allow_cjs_named_spy, false, &[])
        .await
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum MockImportLoading {
    CachedOriginal,
    BrowserStampedOriginal,
}

pub(crate) async fn prepare_browser_test_module(
    project: ResolvedVc<Project>,
    path: &FileSystemPath,
    id: &RcStr,
    context: ResolvedVc<ModuleAssetContext>,
) -> Result<PreparedTestModule> {
    prepare_test_module_with_loading(
        project,
        path,
        id,
        context,
        false,
        false,
        &[],
        MockImportLoading::BrowserStampedOriginal,
    )
    .await
}

/// Keep actual full-source owners separate from compiler parts and consumers.
async fn commonjs_full_owner(
    module: ResolvedVc<Box<dyn Module>>,
) -> Result<Option<ResolvedVc<EcmascriptModuleAsset>>> {
    if let Some(full) = ResolvedVc::try_downcast_type::<EcmascriptModuleAsset>(module) {
        return Ok(Some(full));
    }
    if let Some(part) = ResolvedVc::try_downcast_type::<EcmascriptModulePartAsset>(module) {
        return Ok(Some(part.await?.full_module));
    }
    if let Some(locals) = ResolvedVc::try_downcast_type::<EcmascriptModuleLocalsModule>(module) {
        return Ok(Some(locals.await?.module));
    }
    Ok(None)
}

/// This bridge retains an actual unspecialized local CommonJS leaf module.
/// It never derives module identity from an emitted ID or evaluates an original.
pub(crate) async fn commonjs_original_require_module(
    root: &FileSystemPath,
    path: &FileSystemPath,
    original: ResolvedVc<Box<dyn Module>>,
) -> Result<Option<ResolvedVc<Box<dyn Module>>>> {
    let Some(relative) = root.get_path_to(path) else {
        return Ok(None);
    };
    if relative.split('/').any(|part| part == "node_modules") {
        return Ok(None);
    }
    let Some(full) = commonjs_full_owner(original).await? else {
        return Ok(None);
    };
    if original != ResolvedVc::upcast(full)
        || full.ident().await?.path != *path
        || !matches!(
            *full.get_exports().await?,
            EcmascriptExports::CommonJs(_) | EcmascriptExports::EmptyCommonJs
        )
    {
        return Ok(None);
    }
    let analysis = full.analyze().await?;
    if !analysis.successful
        || analysis
            .code_generation
            .await?
            .code_gens
            .iter()
            .any(|code| matches!(code, CodeGen::DynamicExpression(_)))
    {
        return Ok(None);
    }
    for dependency in primary_referenced_modules(*original).await?.iter() {
        let Some(external) = ResolvedVc::try_downcast_type::<CachedExternalModule>(*dependency)
        else {
            return Ok(None);
        };
        if builtin_factory_name(&external.await?.request()).is_none() {
            return Ok(None);
        }
    }
    Ok(Some(original))
}

/// Optional exact leaf publication proof. Unsupported owners retain old codegen.
async fn commonjs_callable_publication_source(
    module: ResolvedVc<Box<dyn Module>>,
) -> Result<Option<ResolvedVc<EcmascriptModuleAsset>>> {
    let Some(full) = commonjs_full_owner(module).await? else {
        return Ok(None);
    };
    if !matches!(*full.get_exports().await?, EcmascriptExports::CommonJs(_)) {
        return Ok(None);
    }
    let certificate = commonjs_callable_publication_certificate(*full).await?;
    if certificate.module != full || certificate.shape != CommonJsResetExportShape::FunctionBinding
    {
        return Ok(None);
    }
    let analysis = full.analyze().await?;
    if !analysis.successful
        || analysis
            .code_generation
            .await?
            .code_gens
            .iter()
            .any(|code| matches!(code, CodeGen::DynamicExpression(_)))
        || !primary_chunkable_referenced_modules(Vc::upcast(*full), false, false)
            .await?
            .is_empty()
    {
        return Ok(None);
    }
    Ok(Some(full))
}

/// Match compiler-owned original helper reads by actual module/reference pointers.
/// An authored require consumer keeps the old namespace path for this first slice.
async fn commonjs_callable_namespaces(
    entry: ResolvedVc<Box<dyn Module>>,
    registration: ResolvedVc<Box<dyn Module>>,
    originals: &[(String, ResolvedVc<EcmascriptModuleAsset>, bool)],
) -> Result<Vec<ResolvedVc<RuntimeImportNamespaceCertificate>>> {
    if originals.is_empty() {
        return Ok(Vec::new());
    }
    let mut helper_owners = HashSet::new();
    let mut queue = vec![registration];
    let mut seen = HashSet::new();
    while let Some(owner) = queue.pop() {
        if !seen.insert(owner) {
            continue;
        }
        if let Some(full) = commonjs_full_owner(owner).await? {
            helper_owners.insert(full);
        }
        for (reference, resolved) in primary_chunkable_referenced_modules(*owner, false, false)
            .await?
            .iter()
        {
            if ResolvedVc::try_downcast_type::<turbopack_ecmascript::EcmascriptModulePartReference>(
                *reference,
            )
            .is_some()
            {
                queue.extend(resolved.modules.iter().copied());
            }
        }
    }
    let mut expected = Vec::new();
    for (request, original, raw_required) in originals {
        expected.push((
            Request::parse(RcStr::from(request.as_str()).into())
                .to_resolved()
                .await?,
            *original,
            *raw_required,
        ));
    }
    let mut dynamic = Vec::new();
    let mut helper_requires = HashSet::new();
    let mut helper_resolves = HashSet::new();
    let mut authored_requires = HashSet::new();
    queue.push(entry);
    seen.clear();
    while let Some(owner) = queue.pop() {
        if !seen.insert(owner) {
            continue;
        }
        let helper = commonjs_full_owner(owner)
            .await?
            .is_some_and(|full| helper_owners.contains(&full));
        for (reference, resolved) in primary_chunkable_referenced_modules(*owner, false, false)
            .await?
            .iter()
        {
            if helper {
                if let Some(reference) =
                    ResolvedVc::try_downcast_type::<EsmAsyncAssetReference>(*reference)
                {
                    let request = reference.await?.request;
                    if let Some((_, original, _)) =
                        expected.iter().find(|(known, _, _)| *known == request)
                    {
                        anyhow::ensure!(
                            resolved.modules.len() == 1,
                            "Callable original helper requires one actual module"
                        );
                        let actual = resolved.modules[0];
                        let full = commonjs_callable_publication_source(actual)
                            .await?
                            .context(
                                "Callable original helper lost its exact leaf publication proof",
                            )?;
                        anyhow::ensure!(
                            actual == ResolvedVc::upcast(full)
                                && full.await?.source == original.await?.source,
                            "Callable original helper must retain its actual full source owner"
                        );
                        dynamic.push((owner, request, full));
                    }
                }
            }
            if helper
                && let Some(reference) = ResolvedVc::try_downcast_type::<
                    turbopack_ecmascript::references::cjs::CjsRequireResolveAssetReference,
                >(*reference)
            {
                let request = reference.await?.request();
                if expected
                    .iter()
                    .any(|(known, _, raw_required)| *raw_required && *known == request)
                {
                    anyhow::ensure!(
                        resolved.modules.len() == 1,
                        "Callable original helper requires one actual module"
                    );
                    let actual = resolved.modules[0];
                    let full = commonjs_full_owner(actual)
                        .await?
                        .context("Callable original resolve must retain its actual full owner")?;
                    anyhow::ensure!(
                        actual == ResolvedVc::upcast(full),
                        "Callable original resolve must retain its actual full owner"
                    );
                    helper_resolves.insert((owner, request, full));
                }
            }
            if let Some(reference) =
                ResolvedVc::try_downcast_type::<CjsRequireAssetReference>(*reference)
            {
                if helper {
                    let request = reference.await?.request();
                    if expected
                        .iter()
                        .any(|(known, _, raw_required)| *raw_required && *known == request)
                    {
                        anyhow::ensure!(
                            resolved.modules.len() == 1,
                            "Callable original helper requires one actual module"
                        );
                        let actual = resolved.modules[0];
                        let full = commonjs_full_owner(actual).await?.context(
                            "Callable original require must retain its actual full owner",
                        )?;
                        anyhow::ensure!(
                            actual == ResolvedVc::upcast(full),
                            "Callable original require must retain its actual full owner"
                        );
                        helper_requires.insert((owner, request, full));
                    }
                } else {
                    for actual in &resolved.modules {
                        if let Some(full) = commonjs_full_owner(*actual).await? {
                            authored_requires.insert(full);
                        }
                    }
                }
            }
            queue.extend(resolved.modules.iter().copied());
        }
    }
    let mut namespaces = Vec::new();
    let mut certified = HashSet::new();
    for (request, _, raw_required) in expected {
        let sites = dynamic
            .iter()
            .filter(|(_, known, _)| *known == request)
            .collect::<Vec<_>>();
        anyhow::ensure!(
            !sites.is_empty(),
            "Callable original helper must retain its actual dynamic readsite"
        );
        let actual = sites[0].2;
        anyhow::ensure!(
            sites.iter().all(|(_, _, target)| *target == actual),
            "Callable original request must retain one actual full target across its helpers"
        );
        for (owner, _, target) in sites {
            anyhow::ensure!(
                !raw_required
                    || (helper_requires.contains(&(*owner, request, *target))
                        && helper_resolves.contains(&(*owner, request, *target))),
                "Callable original helper must retain its exact raw require target"
            );
        }
        if authored_requires.contains(&actual) || !certified.insert(actual) {
            continue;
        }
        namespaces.push(
            RuntimeImportNamespaceCertificate {
                kind: RuntimeImportNamespaceKind::CommonJsCallable,
                module: ResolvedVc::upcast(actual),
                export_order: Vec::new(),
            }
            .resolved_cell(),
        );
    }
    Ok(namespaces)
}

/// Resolve new literal helpers from their authored input, before graph substitution.
async fn resolve_mock_helper_target(
    context: ResolvedVc<ModuleAssetContext>,
    importer: &FileSystemPath,
    request: &str,
    api: &str,
    allow_commonjs: bool,
    allow_native: bool,
) -> Result<(FileSystemPath, ResolvedVc<Box<dyn Module>>)> {
    if matches!(request, "next" | "react" | "react-dom" | "vitest")
        || request.starts_with("next/")
        || request.starts_with("react/")
        || request.starts_with("react-dom/")
        || (request.starts_with("node:") && !allow_native)
    {
        return Err(test_input_error(
            importer.clone(),
            format!(
                "{api} currently requires compiled ESM targets; framework/native targets are \
                 unsupported: {request}"
            ),
        ));
    }
    let origin = PlainResolveOrigin::new(*ResolvedVc::upcast(context), importer.clone());
    let parsed_request = Request::parse(RcStr::from(request).into())
        .to_resolved()
        .await?;
    let resolved = esm_resolve(
        Vc::upcast(origin),
        *parsed_request,
        EcmaScriptModulesReferenceSubType::Import,
        ResolveErrorMode::Error,
        None,
    )
    .await?;
    let modules = resolved.await?.primary_modules().await?;
    if modules.len() != 1 {
        return Err(test_input_error(
            importer.clone(),
            format!("{api} target must resolve to exactly one compiled ESM module: {request}"),
        ));
    }
    let original = modules[0];
    let ident = original.ident().await?;
    let target_path = ident.path.clone();
    if !ident.query.is_empty() || !ident.fragment.is_empty() {
        return Err(test_input_error(
            importer.clone(),
            format!("{api} resolved queries/fragments are unsupported: {request}"),
        ));
    }
    if target_path == *importer {
        return Err(test_input_error(
            importer.clone(),
            format!("The spec module cannot be its own {api} target: {request}"),
        ));
    }
    if let Some(external) = ResolvedVc::try_downcast_type::<CachedExternalModule>(original) {
        let external = external.await?;
        let builtin = builtin_factory_name(&external.request()).is_some();
        if allow_native
            && (matches!(&*parsed_request.await?, Request::Module {query, fragment, ..}
                if query.is_empty() && fragment.is_empty())
                || (builtin
                    && request.starts_with("node:")
                    && matches!(&*parsed_request.await?, Request::Uri {query, fragment, ..}
                        if query.is_empty() && fragment.is_empty())))
            && external.native_import_module().is_some()
        {
            return Ok((target_path, original));
        }
        return Err(test_input_error(
            importer.clone(),
            format!(
                "{api} targets must be compiled by Next; configure the external package for \
                 compilation: {request}"
            ),
        ));
    }
    if request.starts_with("node:") {
        return Err(test_input_error(
            importer.clone(),
            format!("{api} node: targets require a certified native builtin: {request}"),
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
            importer.clone(),
            format!("{api} targets require an inspectable compiler source"),
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
                importer.clone(),
                format!("{api} target must be a compiled ESM module"),
            )
        })?;
    let exports = placeable.get_exports().await?;
    if !matches!(*exports, EcmascriptExports::EsmExports(_))
        && !(allow_commonjs
            && matches!(
                *exports,
                EcmascriptExports::CommonJs(_) | EcmascriptExports::EmptyCommonJs
            ))
    {
        return Err(test_input_error(
            importer.clone(),
            format!("CommonJS/dynamic {api} targets are unsupported: {request}"),
        ));
    }
    Ok((target_path, original))
}

/// Each declaration resolves from its own authored importer. Prefixes preserve
/// target insertion order, so inherited targets retain their compiler-owned keys.
pub(crate) async fn prepare_test_module_with_inputs(
    project: ResolvedVc<Project>,
    path: &FileSystemPath,
    id: &RcStr,
    context: ResolvedVc<ModuleAssetContext>,
    allow_cjs_named_spy: bool,
    layered_inputs: bool,
    inherited: &[FileSystemPath],
) -> Result<PreparedTestModule> {
    prepare_test_module_with_loading(
        project,
        path,
        id,
        context,
        allow_cjs_named_spy,
        layered_inputs,
        inherited,
        MockImportLoading::CachedOriginal,
    )
    .await
}

async fn prepare_test_module_with_loading(
    project: ResolvedVc<Project>,
    path: &FileSystemPath,
    id: &RcStr,
    context: ResolvedVc<ModuleAssetContext>,
    allow_cjs_named_spy: bool,
    layered_inputs: bool,
    inherited: &[FileSystemPath],
    loading: MockImportLoading,
) -> Result<PreparedTestModule> {
    let plan = static_mock_plan(path).await?;
    let original_require_reset = plan.commonjs_original_reset_candidate();
    let mut earlier_plans = Vec::new();
    for input_path in inherited {
        let input_plan = static_mock_plan(input_path).await?;
        if input_plan.reset_modules || !input_plan.runtime_requests.is_empty() {
            return Err(test_input_error(
                input_path.clone(),
                "Setup module mocks cannot reset or register runtime modules yet",
            ));
        }
        earlier_plans.push((input_path, input_plan));
    }
    if !inherited.is_empty() && (plan.reset_modules || !plan.runtime_requests.is_empty()) {
        return Err(test_input_error(
            path.clone(),
            "Setup module mocks cannot reset or register runtime modules yet",
        ));
    }
    let has_inherited = earlier_plans.iter().any(|(_, plan)| !plan.is_empty());
    let static_runtime = (!plan.declarations.is_empty() || !plan.hoisted.is_empty())
        && !plan.runtime_requests.is_empty();
    let context = if static_runtime {
        // Every captured replacement, registration and native-provider factory
        // retains the same actual runtime owner before any derived contexts.
        let root = project.project_path().owned().await?;
        let base = context.await?;
        let existing = base.transitions.await?;
        let mut rules = existing.transition_rules.clone();
        rules.push(crate::testing_external_modules::runtime_boundary_rule(root, context).await?);
        let transitions = TransitionOptions {
            named_transitions: existing.named_transitions.clone(),
            transition_rules: rules,
            ..Default::default()
        }
        .resolved_cell();
        ModuleAssetContext::new(
            *transitions,
            *base.compile_time_info,
            *base.module_options_context,
            *base.resolve_options_context,
            base.layer.clone(),
        )
        .to_resolved()
        .await?
    } else {
        context
    };
    let static_runtime_origin = static_runtime.then_some(context);
    if (plan.is_empty() && !has_inherited)
        || (!static_runtime
            && !original_require_reset
            && (plan.reset_modules || !plan.runtime_requests.is_empty()))
    {
        return Ok(PreparedTestModule {
            context,
            setup_context: context,
            source: ResolvedVc::upcast(FileSource::new(path.clone()).to_resolved().await?),
            registration: None,
            module_reset: plan.reset_modules || !plan.runtime_requests.is_empty(),
            paired_native_actuals: false,
            runtime_requests: plan.runtime_requests,
            static_runtime_origin: None,
            coverage_sources: Vec::new(),
            cjs_named_spy: false,
            mock_wrappers: Vec::new(),
            callable_originals: Vec::new(),
            commonjs_original_require: Vec::new(),
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
    let mut virtual_keys = FxIndexMap::default();
    let mut builtin_keys = FxIndexMap::default();
    let mut builtin_canonical_keys = FxIndexMap::default();
    let mut builtin_targets = Vec::new();
    let mut external_keys = FxIndexMap::default();
    let mut external_originals = fxindexmap! {};
    let mut external_modules: HashMap<ResolvedVc<Box<dyn Module>>, (String, String)> =
        HashMap::new();
    let mut cjs_named_spy = false;
    let mut target_generations = FxIndexMap::default();
    let mut import_mock_modes = FxIndexMap::default();
    let inputs = earlier_plans
        .iter()
        .map(|(input_path, input_plan)| (*input_path, input_plan))
        .chain(std::iter::once((path, &plan)))
        .collect::<Vec<_>>();
    let mut unmock_cuts = FxIndexMap::default();
    let mut target_indexes = FxIndexMap::default();
    let mut native_unmock_cuts = HashMap::new();
    let native_unmock_targets = plan.native_unmock_targets();
    let native_unmock = native_unmock_targets.is_some();
    let mut native_unmock_originals: HashMap<ResolvedVc<Box<dyn Module>>, NativeUnmockTarget> =
        HashMap::new();
    let mut native_unmock_runtime_targets = HashMap::new();
    let mut builtin_unmock_cuts = HashMap::new();
    // The original-require bridge is a separate, bounded ordinary Node fact.
    // Actual mode and test-entry facts establish the profile; named-spy alone does not.
    let allow_commonjs_original_require = if allow_cjs_named_spy
        && inherited.is_empty()
        && !layered_inputs
        && (!plan.reset_modules || original_require_reset)
        && plan.runtime_requests.is_empty()
        && plan.declarations.len() == 1
        && crate::testing_mock_graph::is_commonjs_original_require_request(
            &*Request::parse(RcStr::from(plan.declarations[0].request.as_str()).into()).await?,
        )
        && !plan.declarations[0].automatic
        && !plan.declarations[0].has_parameters
        && plan.declarations[0].has_object_return
        && !plan.declarations[0].has_spread
        && plan.actual_imports.is_empty()
        && plan.mock_imports.is_empty()
        && plan.unmocks.is_empty()
        && (project.next_mode().await?.is_development()
            || (project.next_mode().await?.is_production()
                && ((!plan.reset_modules && production_factory_plan(&plan))
                    || production_original_require_reset_plan(&plan))))
        && let Some(entry) = project.await?.test_entry
    {
        let entry = entry.await?;
        &*entry.environment == "node"
            && !entry.browser_client
            && entry.route.is_none()
            && entry.setup_files.is_empty()
            && entry.snapshot_serializers.is_empty()
            && entry.cohort_files.is_empty()
            && !entry.source_coverage
            && !entry.import_coverage_roles
            && !entry.dependency_plan
    } else {
        false
    };
    if original_require_reset && !allow_commonjs_original_require {
        return Err(test_input_error(
            path.clone(),
            "Original CommonJS require resets require one isolated development Node leaf factory",
        ));
    }
    let cache_actual_imports = allow_cjs_named_spy && inherited.is_empty();
    let paired_native_actual_candidate = static_runtime && !plan.actual_imports.is_empty();
    let allow_native_actual_imports = if cache_actual_imports
        && !layered_inputs
        && loading == MockImportLoading::CachedOriginal
        && (project.next_mode().await?.is_development() || paired_native_actual_candidate)
        && let Some(entry) = project.await?.test_entry
    {
        let entry = entry.await?;
        &*entry.environment == "node"
            && !entry.browser_client
            && entry.route.is_none()
            && entry.setup_files.is_empty()
            && entry.snapshot_serializers.is_empty()
            && entry.cohort_files.is_empty()
            && !entry.source_coverage
            && !entry.import_coverage_roles
            && !entry.dependency_plan
    } else {
        false
    };
    if native_unmock && (!allow_native_actual_imports || inputs.len() != 1) {
        return Err(test_input_error(
            path.clone(),
            "Retained native unmock pairs require the isolated actual-import owner",
        ));
    }
    if inputs.iter().any(|(_, input)| !input.unmocks.is_empty()) {
        for (input_index, (input_path, input)) in inputs.iter().enumerate() {
            // Retain first declaration indices even for cancelled targets. Setup
            // namespaces already evaluated under those keys remain unchanged.
            for declaration in &input.declarations {
                let (target, original) = resolve_mock_helper_target(
                    context,
                    input_path,
                    &declaration.request,
                    "vi.mock",
                    false,
                    allow_native_actual_imports,
                )
                .await?;
                if ResolvedVc::try_downcast_type::<CachedExternalModule>(original).is_none() {
                    let next = target_indexes.len();
                    target_indexes.entry(target).or_insert(next);
                }
            }
            for unmock in &input.unmocks {
                let (target, original) = resolve_mock_helper_target(
                    context,
                    input_path,
                    &unmock.request,
                    "vi.unmock",
                    false,
                    allow_native_actual_imports,
                )
                .await?;
                if native_unmock {
                    let Some(external) =
                        ResolvedVc::try_downcast_type::<CachedExternalModule>(original)
                    else {
                        return Err(test_input_error(
                            path.clone(),
                            "Retained native unmock must resolve to the actual external original",
                        ));
                    };
                    if builtin_factory_name(&external.await?.request()).is_some() {
                        return Err(test_input_error(
                            path.clone(),
                            "Retained native unmock pairs do not include builtin targets",
                        ));
                    }
                    let Some(target) = native_unmock_targets.as_ref().and_then(|targets| {
                        targets
                            .iter()
                            .find(|target| target.request == unmock.request)
                    }) else {
                        return Err(test_input_error(
                            path.clone(),
                            "Native cut has no paired syntax owner",
                        ));
                    };
                    let native_request = external.await?.request().into_owned();
                    if !native_unmock_original_is_available(
                        &native_unmock_originals,
                        &original,
                        &target.request,
                    ) || !native_unmock_original_is_available(
                        &native_unmock_runtime_targets,
                        &native_request,
                        &target.request,
                    ) {
                        return Err(test_input_error(
                            path.clone(),
                            "Native cut targets require distinct stable canonical originals",
                        ));
                    }
                    native_unmock_originals.insert(original, target.clone());
                    native_unmock_runtime_targets.insert(native_request, target.clone());
                }
                if let Some(external) =
                    ResolvedVc::try_downcast_type::<CachedExternalModule>(original)
                {
                    if let Some(name) = builtin_factory_name(&external.await?.request()) {
                        builtin_unmock_cuts.insert(name.to_owned(), (input_index, unmock.start));
                    } else {
                        native_unmock_cuts.insert(original, (input_index, unmock.start));
                    }
                } else {
                    unmock_cuts.insert(target, (input_index, unmock.start));
                }
            }
        }
    }
    for (input_index, (declaration_path, declaration_plan)) in inputs.into_iter().enumerate() {
        let declaration_origin =
            PlainResolveOrigin::new(*ResolvedVc::upcast(context), declaration_path.clone());
        for declaration in &declaration_plan.declarations {
            let request = declaration.request.as_str();
            let explicit_node_factory = allow_cjs_named_spy
                && !layered_inputs
                && inherited.is_empty()
                && !declaration.automatic
                && declaration.has_object_return
                && !declaration.has_spread;
            if matches!(request, "next" | "react" | "react-dom" | "vitest")
                || request.starts_with("next/")
                || request.starts_with("react/")
                || request.starts_with("react-dom/")
                || (request.starts_with("node:") && !explicit_node_factory)
            {
                return Err(test_input_error(
                    path.clone(),
                    format!(
                        "Framework and native module mock targets are not supported: {request}"
                    ),
                ));
            }
            let parsed_request = Request::parse(RcStr::from(request).into());
            let allow_virtual_factory = explicit_node_factory
                && matches!(&*parsed_request.await?, Request::Module { query, fragment, .. }
                    if query.is_empty() && fragment.is_empty());
            let allow_builtin_factory = explicit_node_factory
                && matches!(&*parsed_request.await?,
                    Request::Module { query, fragment, .. } |
                    Request::Uri { query, fragment, .. }
                    if query.is_empty() && fragment.is_empty());
            let resolved = esm_resolve(
                Vc::upcast(declaration_origin),
                parsed_request,
                EcmaScriptModulesReferenceSubType::Import,
                if allow_virtual_factory {
                    ResolveErrorMode::Ignore
                } else {
                    ResolveErrorMode::Error
                },
                None,
            )
            .await?;
            let resolved = resolved.await?;
            let modules = resolved.primary_modules().await?;
            // Earlier factories cancelled by the actual last cut do not register.
            // Resolve each to the same original before omitting it; the surviving
            // factory still passes the strict preceding-cut check below.
            if native_unmock
                && modules.len() == 1
                && native_unmock_originals
                    .get(&modules[0])
                    .is_some_and(|target| target.request == request)
                && native_unmock_cuts
                    .get(&modules[0])
                    .is_some_and(|cut| cut.0 == input_index && cut.1 > declaration.factory_start)
            {
                continue;
            }
            if native_unmock {
                let corresponding = modules.len() == 1
                    && native_unmock_originals
                        .get(&modules[0])
                        .is_some_and(|target| target.request == request && target.retained)
                    && native_unmock_cuts.get(&modules[0]).is_some_and(|cut| {
                        cut.0 == input_index && cut.1 < declaration.factory_start
                    });
                if !corresponding {
                    return Err(test_input_error(
                        path.clone(),
                        "Retained native unmock must precede the same actual surviving factory",
                    ));
                }
            }
            if allow_virtual_factory && resolved.primary.is_empty() {
                let index = virtual_keys.len();
                let key = virtual_keys
                    .entry(request.to_owned())
                    .or_insert_with(|| format!("next-test-node:{id}:virtual:{index}"))
                    .clone();
                let source = test_source(
                    path.clone(),
                    Some(format!("next-test-virtual-mock:{request}").into()),
                    virtual_mock_wrapper_source(
                        "next/dist/experimental/testing/mocking/runtime",
                        &key,
                    )?,
                )
                .await?;
                imports.insert_exact_alias(
                    request.to_owned(),
                    ImportMapping::Direct(ResolveResult::source(source).resolved_cell())
                        .resolved_cell(),
                );
                registrations.push((
                    key,
                    request.to_owned(),
                    declaration.factory_source.clone(),
                    declaration.factory_start,
                    declaration.original_factory_source.clone(),
                    false,
                    false,
                    true,
                ));
                continue;
            }
            if modules.len() != 1 {
                return Err(test_input_error(
                    path.clone(),
                    format!(
                        "Mock target must resolve to exactly one compiled ESM module: {request}"
                    ),
                ));
            }
            let original = modules[0];
            if native_unmock_cuts
                .get(&original)
                .is_some_and(|cut| *cut > (input_index, declaration.factory_start))
            {
                continue;
            }
            if allow_builtin_factory
                && let Some(external) =
                    ResolvedVc::try_downcast_type::<CachedExternalModule>(original)
            {
                let external_request = external.await?.request().into_owned();
                if let Some(name) = builtin_factory_name(&external_request) {
                    if builtin_unmock_cuts
                        .get(name)
                        .is_some_and(|cut| *cut > (input_index, declaration.factory_start))
                    {
                        continue;
                    }
                    let requests =
                        builtin_factory_requests(context, declaration_path, request, name).await?;
                    let index = builtin_canonical_keys.len();
                    let key = builtin_canonical_keys
                        .entry(name.to_owned())
                        .or_insert_with(|| format!("next-test-node:{id}:builtin:{index}"))
                        .clone();
                    for request in &requests {
                        builtin_keys.insert(request.to_string(), key.clone());
                    }
                    let source = test_source(
                        path.clone(),
                        Some(format!("next-test-builtin-mock:{name}").into()),
                        virtual_mock_wrapper_source(
                            "next/dist/experimental/testing/mocking/runtime",
                            &key,
                        )?,
                    )
                    .await?;
                    builtin_targets.push(
                        MockBuiltinFactoryTarget {
                            requests,
                            wrapper_source: source,
                        }
                        .resolved_cell(),
                    );
                    registrations.push((
                        key,
                        external_request,
                        declaration.factory_source.clone(),
                        declaration.factory_start,
                        declaration.original_factory_source.clone(),
                        false,
                        false,
                        true,
                    ));
                    continue;
                }
            }
            if allow_virtual_factory
                && let Some(external) =
                    ResolvedVc::try_downcast_type::<CachedExternalModule>(original)
            {
                let index = external_modules.len();
                let (key, original_request) =
                    if let Some(existing) = external_modules.get(&original) {
                        existing.clone()
                    } else {
                        let native_original = external
                            .await?
                            .native_import_module()
                            .ok_or_else(|| {
                                test_input_error(
                                    path.clone(),
                                    "External factory originals require a native CJS or ESM module",
                                )
                            })?
                            .to_resolved()
                            .await?;
                        let key = format!("next-test-node:{id}:external:{index}");
                        let original_request = format!("next-test-external-original:{id}:{index}");
                        external_originals.insert(
                            RcStr::from(original_request.clone()),
                            ResolvedVc::upcast(native_original),
                        );
                        external_modules.insert(original, (key.clone(), original_request.clone()));
                        (key, original_request)
                    };
                external_keys.insert(request.to_owned(), key.clone());
                let source = test_source(
                    path.clone(),
                    Some(format!("next-test-external-mock:{request}").into()),
                    virtual_mock_wrapper_source(
                        "next/dist/experimental/testing/mocking/runtime",
                        &key,
                    )?,
                )
                .await?;
                builtin_targets.push(
                    MockBuiltinFactoryTarget {
                        requests: vec![RcStr::from(request)],
                        wrapper_source: source,
                    }
                    .resolved_cell(),
                );
                registrations.push((
                    key,
                    if paired_native_actual_candidate {
                        request.to_owned()
                    } else {
                        original_request
                    },
                    declaration.factory_source.clone(),
                    declaration.factory_start,
                    declaration.original_factory_source.clone(),
                    false,
                    false,
                    false,
                ));
                continue;
            }
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
            if unmock_cuts
                .get(&target_path)
                .is_some_and(|cut| *cut > (input_index, declaration.factory_start))
            {
                continue;
            }
            if target_path == *path {
                return Err(test_input_error(
                    path.clone(),
                    format!("The spec module cannot be its own mock target: {request}"),
                ));
            }
            // Resolution, source transforms and export analysis below are the same
            // for authored and package ESM. A node_modules path is not an external
            // runtime boundary; the actual resolved module decides that boundary.
            if ResolvedVc::try_downcast_type::<CachedExternalModule>(original).is_some() {
                return Err(test_input_error(
                    path.clone(),
                    format!(
                        "Mock targets must be compiled by Next; configure the external package \
                         for compilation: {request}"
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
            let original_exports = match &*placeable.get_exports().await? {
                EcmascriptExports::EsmExports(exports) => {
                    let expanded = exports.expand_exports(ModuleExportUsageInfo::all()).await?;
                    if !expanded.dynamic_exports.is_empty() {
                        return Err(test_input_error(
                            path.clone(),
                            format!("Mock targets require statically known exports: {request}"),
                        ));
                    }
                    expanded
                        .exports
                        .keys()
                        .map(|name| name.to_string())
                        .collect::<Vec<_>>()
                }
                EcmascriptExports::CommonJs(_)
                    if allow_cjs_named_spy
                        && inherited.is_empty()
                        && declaration.automatic
                        && declaration.spy
                        && plan.declarations.len() == 1
                        && plan.hoisted.is_empty()
                        && plan.actual_imports.is_empty()
                        && plan.mock_imports.is_empty()
                        && plan.unmocks.is_empty() =>
                {
                    cjs_named_spy = true;
                    crate::testing_cjs_mock::named_spy_exports(project, context, path, original)
                        .await?
                }
                EcmascriptExports::CommonJs(_) | EcmascriptExports::EmptyCommonJs
                    if allow_cjs_named_spy
                        && inherited.is_empty()
                        && !declaration.automatic
                        && declaration.has_object_return
                        && !declaration.has_spread =>
                {
                    // The explicit object factory declares every replacement export.
                    // Keep the actual compiled original behind its existing lazy thunk.
                    Vec::new()
                }
                _ => {
                    return Err(test_input_error(
                        path.clone(),
                        format!(
                            "CommonJS and dynamic module mock targets are not supported: {request}"
                        ),
                    ));
                }
            };
            if layered_inputs {
                target_generations.insert(
                    target_path.clone(),
                    RcStr::from(format!(
                        "next-test-mock-generation:{declaration_path}:{}",
                        declaration.factory_start
                    )),
                );
            }
            let index = target_indexes
                .get(&target_path)
                .copied()
                .unwrap_or(targets.len());
            import_mock_modes.insert(
                target_path.clone(),
                (declaration.automatic, declaration.spy),
            );
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
                entry.3.extend(original_exports);
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
                if declaration_plan.hoisted.iter().any(|helper| {
                    helper.has_dynamic_import && helper.start < declaration.factory_start
                }) {
                    return Err(test_input_error(
                        path.clone(),
                        "Dynamic import() inside an earlier vi.hoisted callback is not yet \
                         supported with manual mock redirects; literal vi.importActual remains \
                         available for actual imports",
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
            if declaration_path == path {
                registrations.push((
                    entry.0.clone(),
                    factory_original_request,
                    declaration.factory_source.clone(),
                    declaration.factory_start,
                    declaration.original_factory_source.clone(),
                    declaration.automatic,
                    declaration.spy,
                    false,
                ));
            }
        }
    }
    let mut actual_loaders = Vec::new();
    let mut paired_native_actual_count = 0usize;
    let mut native_unmock_actual_links: HashMap<ResolvedVc<Box<dyn Module>>, usize> =
        HashMap::new();
    let mut callable_originals = Vec::new();
    let mut actual_requests: HashMap<ResolvedVc<Box<dyn Module>>, String> = HashMap::new();
    for (index, import) in plan.actual_imports.iter().enumerate() {
        let request = import.request.as_str();
        if matches!(request, "next" | "react" | "react-dom" | "vitest")
            || request.starts_with("next/")
            || request.starts_with("react/")
            || request.starts_with("react-dom/")
            || (request.starts_with("node:") && !allow_native_actual_imports)
        {
            return Err(test_input_error(
                path.clone(),
                format!(
                    "vi.importActual currently requires compiled ESM targets; framework/native \
                     targets are unsupported: {request}"
                ),
            ));
        }
        let parsed_request = Request::parse(RcStr::from(request).into())
            .to_resolved()
            .await?;
        let resolved = esm_resolve(
            Vc::upcast(origin),
            *parsed_request,
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
        if target_path == *path {
            return Err(test_input_error(
                path.clone(),
                format!("The spec module cannot be its own vi.importActual target: {request}"),
            ));
        }
        let native_cut_target = native_unmock_originals.get(&original);
        if native_unmock && native_cut_target.is_none_or(|target| target.request != request) {
            return Err(test_input_error(
                path.clone(),
                "Native cut actual helpers require their same canonical request owner",
            ));
        }
        let cancelled_original = native_cut_target.is_some_and(|target| !target.retained);
        if paired_native_actual_candidate
            && !(external_modules.contains_key(&original) || cancelled_original)
        {
            return Err(test_input_error(
                path.clone(),
                "Native mixed actual helpers must reuse their paired external original",
            ));
        }
        if let Some(external) = ResolvedVc::try_downcast_type::<CachedExternalModule>(original) {
            let external = external.await?;
            let builtin = builtin_factory_name(&external.request()).is_some();
            if allow_native_actual_imports
                && (matches!(&*parsed_request.await?, Request::Module {query, fragment, ..}
                    if query.is_empty() && fragment.is_empty())
                    || (builtin
                        && request.starts_with("node:")
                        && matches!(&*parsed_request.await?, Request::Uri {query, fragment, ..}
                            if query.is_empty() && fragment.is_empty())))
            {
                if native_unmock {
                    *native_unmock_actual_links.entry(original).or_insert(0) += 1;
                }
                if cancelled_original {
                    paired_native_actual_count += 1;
                }
                let original_request = if let Some((_, request)) = external_modules.get(&original) {
                    paired_native_actual_count += 1;
                    request.clone()
                } else if let Some(request) = actual_requests.get(&original) {
                    request.clone()
                } else {
                    let native_original = external
                        .native_import_module()
                        .ok_or_else(|| {
                            test_input_error(
                                path.clone(),
                                "External importActual requires a native CJS or ESM module",
                            )
                        })?
                        .to_resolved()
                        .await?;
                    let request = format!("next-test-external-actual:{id}:{index}");
                    external_originals.insert(
                        RcStr::from(request.clone()),
                        ResolvedVc::upcast(native_original),
                    );
                    request
                };
                actual_requests.insert(original, original_request.clone());
                actual_loaders.push((
                    import.local.clone(),
                    if paired_native_actual_candidate {
                        request.to_owned()
                    } else {
                        original_request
                    },
                ));
                continue;
            }
            return Err(test_input_error(
                path.clone(),
                format!(
                    "vi.importActual targets must be compiled by Next; configure the external \
                     package for compilation: {request}"
                ),
            ));
        }
        if request.starts_with("node:") {
            return Err(test_input_error(
                path.clone(),
                format!(
                    "vi.importActual native URI targets require a certified Node builtin: \
                     {request}"
                ),
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
        let exports = placeable.get_exports().await?;
        if !matches!(*exports, EcmascriptExports::EsmExports(_))
            && !(allow_cjs_named_spy
                && inherited.is_empty()
                && matches!(
                    *exports,
                    EcmascriptExports::CommonJs(_) | EcmascriptExports::EmptyCommonJs
                ))
        {
            return Err(test_input_error(
                path.clone(),
                format!("CommonJS/dynamic vi.importActual targets are unsupported: {request}"),
            ));
        }
        let original_request = if let Some(target) = targets.get(&target_path) {
            target.1.clone()
        } else if cache_actual_imports && let Some(request) = actual_requests.get(&original) {
            request.clone()
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
        if cache_actual_imports {
            actual_requests.insert(original, original_request.clone());
        }
        if cache_actual_imports
            && inherited.is_empty()
            && project.next_mode().await?.is_development()
            && plan.declarations.is_empty()
            && plan.unmocks.is_empty()
            && plan.hoisted.is_empty()
            && plan.runtime_requests.is_empty()
            && matches!(
                *exports,
                EcmascriptExports::CommonJs(_) | EcmascriptExports::EmptyCommonJs
            )
        {
            if let Some(full) = commonjs_callable_publication_source(original).await? {
                callable_originals.push((original_request.clone(), full, false));
            }
        }
        actual_loaders.push((import.local.clone(), original_request));
    }
    let mut mock_import_loaders = Vec::new();
    let mut commonjs_originals = HashMap::new();
    // One dedicated source/request per resolved target keeps the native adapter
    // function stable across aliases and repeated helper callsites.
    let mut browser_originals: FxIndexMap<FileSystemPath, String> = FxIndexMap::default();
    for (index, import) in plan.mock_imports.iter().enumerate() {
        if let Some(key) = virtual_keys
            .get(&import.request)
            .or_else(|| builtin_keys.get(&import.request))
            .or_else(|| external_keys.get(&import.request))
        {
            mock_import_loaders.push((
                import.local.clone(),
                import.request.clone(),
                (Some(key.clone()), None),
                false,
            ));
            continue;
        }
        let (target_path, original) = resolve_mock_helper_target(
            context,
            path,
            &import.request,
            "vi.importMock",
            allow_cjs_named_spy && inherited.is_empty(),
            false,
        )
        .await?;
        let commonjs = matches!(
            *ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(original)
                .context("The resolved mock target must remain chunk-placeable")?
                .get_exports()
                .await?,
            EcmascriptExports::CommonJs(_) | EcmascriptExports::EmptyCommonJs
        );
        let (request, kind) = if let Some(target) = targets.get(&target_path) {
            if let Some((manual_source, _)) = manual_redirects.get(&target_path) {
                let request = format!("next-test-import-mock:{id}:{index}:manual");
                imports.insert_exact_alias(
                    request.clone(),
                    ImportMapping::Direct(ResolveResult::source(*manual_source).resolved_cell())
                        .resolved_cell(),
                );
                (request, (None, None))
            } else if let Some((true, spy)) = import_mock_modes.get(&target_path) {
                // Ordinary automock materialization has its own original edge.
                // importMock loads the actual edge and freshly mocks it per call.
                let request = target.1.clone();
                (request, (None, Some(*spy)))
            } else {
                (target.1.clone(), (Some(target.0.clone()), None))
            }
        } else {
            let manual_path = target_path
                .parent()
                .join(&format!("__mocks__/{}", target_path.file_name()))?;
            let request = format!("next-test-import-mock:{id}:{index}");
            let (source, mode) = if matches!(
                &*manual_path.get_type().await?,
                FileSystemEntryType::NotFound
            ) {
                (
                    ResolvedVc::upcast(FileSource::new(target_path.clone()).to_resolved().await?),
                    Some(false),
                )
            } else {
                (
                    prepare_manual_mock_source(context, &root, manual_path)
                        .await?
                        .0,
                    None,
                )
            };
            imports.insert_exact_alias(
                request.clone(),
                ImportMapping::Direct(ResolveResult::source(source).resolved_cell())
                    .resolved_cell(),
            );
            (request, (None, mode))
        };
        let request = if loading == MockImportLoading::BrowserStampedOriginal && kind.1.is_some() {
            if let Some(request) = browser_originals.get(&target_path) {
                request.clone()
            } else {
                let request = format!(
                    "next-test-browser-import-mock:{id}:{}",
                    browser_originals.len()
                );
                let source = test_source(
                    target_path.clone(),
                    Some(rcstr!("next-test-browser-import-mock-original")),
                    file_content_rope(target_path.read())
                        .await?
                        .to_str()?
                        .into_owned(),
                )
                .await?;
                imports.insert_exact_alias(
                    request.clone(),
                    ImportMapping::Direct(ResolveResult::source(source).resolved_cell())
                        .resolved_cell(),
                );
                browser_originals.insert(target_path.clone(), request.clone());
                request
            }
        } else {
            request
        };
        let request = if commonjs && kind.1.is_some() {
            commonjs_originals
                .entry(original)
                .or_insert(request)
                .clone()
        } else {
            request
        };
        if commonjs
            && kind.1.is_some()
            && loading != MockImportLoading::BrowserStampedOriginal
            && project.next_mode().await?.is_development()
            && plan.declarations.is_empty()
            && plan.unmocks.is_empty()
            && plan.hoisted.is_empty()
            && plan.runtime_requests.is_empty()
        {
            if let Some(full) = commonjs_callable_publication_source(original).await? {
                callable_originals.push((request.clone(), full, true));
            }
        }
        mock_import_loaders.push((import.local.clone(), request, kind, commonjs));
    }
    // After-resolve plugins receive the original request and a bare path, so
    // aliases can hide an effective query. Inspect the actual unspecialized
    // graph before replacing sources rather than collapsing distinct modules.
    let builtin_plugin = if builtin_targets.is_empty() {
        None
    } else {
        Some(
            MockBuiltinResolvePlugin {
                root: root.clone(),
                next_package: get_next_package(root.clone()).await?,
                targets: builtin_targets,
            }
            .resolved_cell(),
        )
    };
    let inspection_context = if virtual_keys.is_empty() && builtin_plugin.is_none() {
        context
    } else {
        let base = context.await?;
        let mut options =
            (*base.resolve_options_context).with_extended_import_map(imports.clone().cell());
        if let Some(plugin) = builtin_plugin {
            options = builtin_mock_resolve_options(options, *plugin);
        }
        ModuleAssetContext::new(
            *base.transitions,
            *base.compile_time_info,
            *base.module_options_context,
            options,
            base.layer.clone(),
        )
        .to_resolved()
        .await?
    };
    let spec = inspection_context
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
    // A deferred actual import may bind static SCC ancestors through the native
    // async runtime. Other cycles still fail before asynchronous substitution.
    let mut deferred_members = FxIndexMap::default();
    for (target_path, (_, _, original, _, _)) in &targets {
        let mut seen = HashSet::new();
        let mut queue = primary_referenced_modules(**original).await?.to_vec();
        let mut cyclic = false;
        while let Some(module) = queue.pop() {
            if !seen.insert(module) {
                continue;
            }
            if module == *original {
                cyclic = true;
                break;
            }
            // Foreign-code contexts are also substituted. A compiled package
            // can lead back to a mocked original just like a project module.
            queue.extend(primary_referenced_modules(*module).await?.iter().copied());
        }
        if cyclic {
            if targets.len() != 1
                || !manual_redirects.is_empty()
                || !plan.actual_imports.is_empty()
                || !plan.mock_imports.is_empty()
                || !plan.unmocks.is_empty()
                || !plan.hoisted.is_empty()
                || layered_inputs
            {
                return Err(test_input_error(
                    path.clone(),
                    "Cyclic factory originals currently require one target without competing \
                     actual imports, hoisted helpers, manual redirects or setup input layers",
                ));
            }
            deferred_members.insert(
                target_path.clone(),
                static_original_cycle_members(*original, path).await?,
            );
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
    let mut mock_wrappers = Vec::new();
    let mut commonjs_original_require_rules = Vec::new();
    let mut commonjs_original_require = Vec::new();
    for (target_path, (key, original_request, original, exports, mocked_exports)) in targets {
        let commonjs_original_require_source = if allow_commonjs_original_require
            && let Some(original) =
                commonjs_original_require_module(&root, &target_path, original).await?
        {
            let (source, rule) = crate::testing_external_modules::resolved_module_bridge(
                original,
                &format!("{id}/commonjs-original-require.mjs"),
            )
            .await?;
            commonjs_original_require_rules.push(rule);
            if original_require_reset {
                commonjs_original_require.push(original);
            }
            Some(source)
        } else {
            None
        };
        // Both original consumers must select this same issued bridge. Reprocessing
        // the FileSource in the mock context would create a second Module with the
        // same ident as the captured original.
        let original_mapping_source = if let Some(source) = commonjs_original_require_source {
            source
        } else {
            ResolvedVc::upcast(FileSource::new(target_path.clone()).to_resolved().await?)
        };
        if let Some(issued) = commonjs_original_require_source {
            anyhow::ensure!(
                original_mapping_source == issued,
                "CommonJS original consumers must retain the same issued module bridge"
            );
        }
        let original_mapping =
            ImportMapping::Direct(ResolveResult::source(original_mapping_source).resolved_cell())
                .resolved_cell();
        imports.insert_exact_alias(original_request.clone(), original_mapping);
        let deferred_original_request = if deferred_members.contains_key(&target_path) {
            let request = format!("{original_request}:deferred");
            imports.insert_exact_alias(request.clone(), original_mapping);
            Some(request.into())
        } else {
            None
        };
        let mut additional_original_requests = Vec::new();
        if let Some(request) = browser_originals.get(&target_path) {
            additional_original_requests.push(request.clone().into());
        }
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
            let cycle_requests = if let Some(members) = deferred_members.shift_remove(&target_path)
            {
                let mut requests = Vec::new();
                for (index, source) in members.into_iter().enumerate() {
                    let request = format!("next-test-cycle-member:{id}:{index}");
                    imports.insert_exact_alias(
                        request.clone(),
                        ImportMapping::Direct(ResolveResult::source(source).resolved_cell())
                            .resolved_cell(),
                    );
                    requests.push(request);
                }
                Some(requests)
            } else {
                None
            };
            let code = if commonjs_original_require_source.is_some() {
                anyhow::ensure!(
                    cycle_requests.is_none(),
                    "Leaf CommonJS namespace cannot use a cyclic original wrapper"
                );
                // The real cached factory Proxy owns key order/descriptors and
                // missing-export access. An eager union-key check or export-value
                // capture would reject unused missing fields or invoke getters.
                compiled_commonjs_namespace_wrapper_source(
                    runtime_request,
                    &key,
                    &plan.declarations[0].request,
                )?
            } else {
                mock_wrapper_source_with_original_cycle(
                    runtime_request,
                    &key,
                    &original_request,
                    &exports,
                    &mocked_exports,
                    cycle_requests.as_deref(),
                )?
            };
            let wrapper_source = if let Some(generation) =
                target_generations.shift_remove(&target_path)
            {
                ResolvedVc::upcast(
                    VirtualSource::new_with_ident(
                        AssetIdent::from_path(wrapper_path)
                            .with_modifier(generation)
                            .into_vc(),
                        AssetContent::file(FileContent::Content(File::from(code.clone())).cell()),
                    )
                    .to_resolved()
                    .await?,
                )
            } else {
                virtual_test_source(wrapper_path, code.clone()).await?
            };
            if layered_inputs || original_require_reset {
                mock_wrappers.push(wrapper_source);
            }
            if project.next_mode().await?.is_development() {
                coverage_sources.push(MockCoverageSource {
                    source: emitted_test_source_identity(project, wrapper_source).await?,
                    code,
                });
            }
            wrapper_source
        };
        graph_targets.push(
            MockGraphTarget {
                path: target_path,
                original_request: original_request.into(),
                additional_original_requests,
                deferred_original_request,
                commonjs_original_require_source,
                wrapper_source,
            }
            .resolved_cell(),
        );
    }
    let original_source = file_content_rope(path.read()).await?.to_str()?.into_owned();
    let original_source_url = canonical_test_source_identity(
        project,
        ResolvedVc::upcast(FileSource::new(path.clone()).to_resolved().await?),
    )
    .await?;
    let registration_request = format!("next-test-registration:{id}");
    // Each resolved original owns its own cut, surviving registrations and
    // actual-helper links. A cut for one target cannot cancel a sibling target.
    if let Some(targets) = &native_unmock_targets {
        if native_unmock_originals.len() != targets.len()
            || native_unmock_runtime_targets.len() != targets.len()
            || external_modules.len() != targets.iter().filter(|target| target.retained).count()
            || registrations.len()
                != targets
                    .iter()
                    .map(|target| target.surviving_factories)
                    .sum::<usize>()
            || paired_native_actual_count != plan.actual_imports.len()
            || native_unmock_originals.iter().any(|(original, target)| {
                let key = external_modules.get(original).map(|(key, _)| key);
                let registered = key.map_or(0, |key| {
                    registrations
                        .iter()
                        .filter(|registration| &registration.0 == key)
                        .count()
                });
                let expected_actuals = plan
                    .actual_imports
                    .iter()
                    .filter(|actual| actual.request == target.request)
                    .count();
                !native_unmock_group_matches(
                    target,
                    registered,
                    key.is_some(),
                    *native_unmock_actual_links.get(original).unwrap_or(&0),
                    expected_actuals,
                )
            })
        {
            return Err(test_input_error(
                path.clone(),
                if targets.iter().any(|target| target.retained) {
                    "Retained native unmock requires its actual registration and original-import \
                     links"
                } else {
                    "Cancelled native factories require only their actual original-import links"
                },
            ));
        }
    }
    if original_require_reset && commonjs_original_require.len() != 1 {
        return Err(test_input_error(
            path.clone(),
            "Original CommonJS require resets need the actual captured local leaf module",
        ));
    }
    let registration_source = test_source(
        path.clone(),
        Some(rcstr!("next-test-mock-registration")),
        mock_registration_source_with_paired_native_helpers(
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
                        native_external,
                    )| MockRegistrationSource {
                        key,
                        original_request: if paired_native_actual_candidate {
                            MockOriginalSource::NativeRuntime(original_request)
                        } else if *native_external {
                            MockOriginalSource::NativeExternal(original_request)
                        } else {
                            MockOriginalSource::Compiled(original_request)
                        },
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
                    cache: cache_actual_imports,
                })
                .collect::<Vec<_>>(),
            &mock_import_loaders
                .iter()
                .map(
                    |(local, request, (factory, spy), commonjs)| MockImportSource {
                        local,
                        original_request: request,
                        kind: if let Some(key) = factory {
                            MockImportKind::Factory(key)
                        } else if let Some(spy) = spy {
                            if loading == MockImportLoading::BrowserStampedOriginal {
                                MockImportKind::BrowserAutomatic { spy: *spy }
                            } else if *commonjs
                                && callable_originals.iter().any(
                                    |(original_request, _, raw_required)| {
                                        *raw_required && original_request == request
                                    },
                                )
                            {
                                MockImportKind::CommonJsPublishedAutomatic { spy: *spy }
                            } else if *commonjs {
                                MockImportKind::CommonJsAutomatic { spy: *spy }
                            } else {
                                MockImportKind::Automatic { spy: *spy }
                            }
                        } else {
                            MockImportKind::Redirect
                        },
                    },
                )
                .collect::<Vec<_>>(),
            &plan.api_bindings,
            paired_native_actual_candidate
                && paired_native_actual_count == plan.actual_imports.len(),
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
    let mut resolve_options = if graph_targets.is_empty() {
        (*base.resolve_options_context).with_extended_import_map(*imports)
    } else {
        let plugin = MockResolvePlugin::new(MockGraphTargets(graph_targets).cell())
            .to_resolved()
            .await?;
        mock_resolve_options(*base.resolve_options_context, *imports, *plugin)
    };
    if let Some(plugin) = builtin_plugin {
        resolve_options = builtin_mock_resolve_options(resolve_options, *plugin);
    }
    let transitions = if browser_originals.is_empty() && commonjs_original_require_rules.is_empty()
    {
        base.transitions
    } else {
        let existing = base.transitions.await?;
        let mut named_transitions = existing.named_transitions.clone();
        if !browser_originals.is_empty() {
            named_transitions.insert(
                crate::testing_browser_mock_import::TRANSITION_NAME.into(),
                ResolvedVc::upcast(
                    crate::testing_browser_mock_import::BrowserMockOriginalTransition::new()
                        .to_resolved()
                        .await?,
                ),
            );
        }
        let mut rules = existing.transition_rules.clone();
        rules.extend(commonjs_original_require_rules);
        TransitionOptions {
            named_transitions,
            transition_rules: rules,
            ..Default::default()
        }
        .resolved_cell()
    };
    let context = ModuleAssetContext::new(
        *transitions,
        *base.compile_time_info,
        mock_module_options(*base.module_options_context),
        resolve_options,
        base.layer.clone(),
    )
    .to_resolved()
    .await?;
    let has_native_registration = original_require_reset
        || static_runtime
        || !external_originals.is_empty()
        || !native_unmock_cuts.is_empty()
        || !builtin_unmock_cuts.is_empty();
    let context = if has_native_registration {
        // The eager registration and every derived spec context share this actual runtime owner.
        let base = context.await?;
        let existing = base.transitions.await?;
        let mut rules = existing.transition_rules.clone();
        rules.push(
            crate::testing_external_modules::runtime_boundary_rule(root.clone(), context).await?,
        );
        let transitions = TransitionOptions {
            named_transitions: existing.named_transitions.clone(),
            transition_rules: rules,
            ..Default::default()
        }
        .resolved_cell();
        ModuleAssetContext::new(
            *transitions,
            *base.compile_time_info,
            *base.module_options_context,
            *base.resolve_options_context,
            base.layer.clone(),
        )
        .to_resolved()
        .await?
    } else {
        context
    };
    let registration = context
        .process(
            *registration_source,
            if external_originals.is_empty() {
                ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined)
            } else {
                ReferenceType::Internal(ResolvedVc::cell(external_originals))
            },
        )
        .module()
        .to_resolved()
        .await?;
    let context = if has_native_registration {
        let mut registration_import = ImportMap::empty();
        let (registration_bridge, rule) = crate::testing_external_modules::resolved_module_bridge(
            registration,
            &format!("{id}/registration.mjs"),
        )
        .await?;
        registration_import.insert_exact_alias(
            registration_request.clone(),
            ImportMapping::Direct(ResolveResult::source(registration_bridge).resolved_cell())
                .resolved_cell(),
        );
        let base = context.await?;
        let existing = base.transitions.await?;
        let mut rules = vec![rule];
        rules.extend(existing.transition_rules.iter().cloned());
        let transitions = TransitionOptions {
            named_transitions: existing.named_transitions.clone(),
            transition_rules: rules,
            ..Default::default()
        }
        .resolved_cell();
        ModuleAssetContext::new(
            *transitions,
            *base.compile_time_info,
            *base.module_options_context,
            registration_module_resolve_options(
                *base.resolve_options_context,
                registration_import.cell(),
            ),
            base.layer.clone(),
        )
        .to_resolved()
        .await?
    } else {
        context
    };
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
                    .chain(plan.mock_imports.iter().map(|import| import.local.clone()))
                    .collect::<Vec<_>>(),
            )?,
        )
        .await?,
        registration: Some(registration),
        module_reset: plan.reset_modules || !plan.runtime_requests.is_empty(),
        paired_native_actuals: paired_native_actual_candidate
            && paired_native_actual_count == plan.actual_imports.len(),
        coverage_sources,
        runtime_requests: plan.runtime_requests,
        static_runtime_origin,
        cjs_named_spy,
        mock_wrappers,
        callable_originals,
        commonjs_original_require,
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
    source_coverage: bool,
    import_coverage_roles: bool,
}

#[turbo_tasks::value(shared)]
struct PreparedNodeTestEntry {
    module: ResolvedVc<Box<dyn Module>>,
    demand_graph: Option<ResolvedVc<RuntimeImportDemandGraph>>,
    harness_coverage: Option<RcStr>,
    original_require_registration: Option<ResolvedVc<Box<dyn Module>>>,
}

#[turbo_tasks::value_impl]
impl NodeTestEndpoint {
    #[turbo_tasks::function]
    async fn entry_module(self: Vc<Self>) -> Result<Vc<Box<dyn Module>>> {
        Ok(*self.prepared_entry().await?.module)
    }

    #[turbo_tasks::function]
    async fn prepared_entry(&self) -> Result<Vc<PreparedNodeTestEntry>> {
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
            let module = context
                .process(
                    source,
                    ReferenceType::Internal(ResolvedVc::cell(internal_assets)),
                )
                .module()
                .to_resolved()
                .await?;
            return Ok(PreparedNodeTestEntry {
                module,
                demand_graph: None,
                harness_coverage: None,
                original_require_registration: None,
            }
            .cell());
        }
        if crate::testing_mock_inputs::has_mock_setups(&self.setup_paths).await? {
            let module = crate::testing_mock_inputs::entry(
                self.project,
                &self.path,
                &self.id,
                &self.setup_paths,
                &self.snapshot_serializers,
                self.runtime_env,
                &environment_bootstrap,
            )
            .await?
            .to_resolved()
            .await?;
            return Ok(PreparedNodeTestEntry {
                module,
                demand_graph: None,
                harness_coverage: None,
                original_require_registration: None,
            }
            .cell());
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
        if prepared.cjs_named_spy
            && (!self.setup_paths.is_empty() || !self.snapshot_serializers.is_empty())
        {
            return Err(test_input_error(
                self.path.clone(),
                "CommonJS named-import spies do not support setup or serializers yet",
            ));
        }
        let plan = static_mock_plan(&self.path).await?;
        let isolated_node_runtime = if let Some(entry) = self.project.await?.test_entry {
            let entry = entry.await?;
            &*entry.environment == "node"
                && !entry.browser_client
                && entry.route.is_none()
                && entry.setup_files.is_empty()
                && entry.snapshot_serializers.is_empty()
                && entry.cohort_files.is_empty()
                && !entry.source_coverage
                && !entry.import_coverage_roles
                && !entry.dependency_plan
        } else {
            false
        };
        let commonjs_runtime = if prepared.module_reset
            && !prepared.runtime_requests.is_empty()
            && prepared.registration.is_none()
            && plan.declarations.is_empty()
            && plan.hoisted.is_empty()
            && plan.mock_imports.is_empty()
            && plan.actual_imports.is_empty()
            && plan.unmocks.is_empty()
            && isolated_node_runtime
            && self.project.next_mode().await?.is_development()
            && self.runtime_env
            && self.setup_paths.is_empty()
            && self.snapshot_serializers.is_empty()
            && self.cohort_paths.is_empty()
            && !self.source_coverage
            && !self.dependency_plan
        {
            crate::testing_cjs_reset::prepare_runtime(
                self.project,
                prepared.context,
                prepared.source,
                &prepared.runtime_requests,
                &self.id,
            )
            .await?
        } else {
            None
        };
        let native_runtime = if commonjs_runtime.is_none()
            && !prepared.runtime_requests.is_empty()
            && (self.project.next_mode().await?.is_development()
                || prepared.paired_native_actuals
                || production_native_runtime_plan(&plan))
            && let Some(entry) = self.project.await?.test_entry
        {
            let entry = entry.await?;
            if &*entry.environment == "node"
                && !entry.browser_client
                && entry.route.is_none()
                && entry.setup_files.is_empty()
                && entry.snapshot_serializers.is_empty()
                && entry.cohort_files.is_empty()
                && !entry.source_coverage
                && !entry.import_coverage_roles
                && !entry.dependency_plan
            {
                Some(if let Some(origin) = prepared.static_runtime_origin {
                    let static_native = crate::testing_static_runtime::prepare(
                        self.project.project_path().owned().await?,
                        origin,
                        prepared.context,
                        prepared.source,
                        prepared
                            .registration
                            .context("Static runtime requires actual eager registration")?,
                        &self.path,
                        &prepared.runtime_requests,
                        &self.id,
                        prepared.paired_native_actuals,
                    )
                    .await?;
                    (
                        static_native.context,
                        static_native.certificates,
                        static_native.pairs,
                        static_native.original_initials,
                    )
                } else {
                    let native = crate::testing_external_modules::runtime_native_external_context(
                        self.project.project_path().owned().await?,
                        prepared.context,
                        prepared.source,
                        &self.id,
                        &self.path,
                        &prepared.runtime_requests,
                    )
                    .await?;
                    let native = if native.certificates.is_empty() {
                        if self.project.next_mode().await?.is_production() {
                            return Err(test_input_error(
                                self.path.clone(),
                                "Production runtime factories require actual certified native \
                                 targets",
                            ));
                        }
                        crate::testing_dynamic_mock::graph_native_external_context(
                            self.project.project_path().owned().await?,
                            native.context,
                            prepared.source,
                            &self.path,
                            &prepared.runtime_requests,
                            &self.id,
                        )
                        .await?
                    } else {
                        native
                    };
                    (native.context, native.certificates, Vec::new(), Vec::new())
                })
            } else {
                None
            }
        } else {
            None
        };
        let context = native_runtime
            .as_ref()
            .map_or(prepared.context, |native| native.0);
        let native_certificates = native_runtime
            .as_ref()
            .map_or(&[][..], |native| native.1.as_slice());
        let static_pairs = native_runtime
            .as_ref()
            .map_or(&[][..], |native| native.2.as_slice());
        let original_initials = native_runtime
            .as_ref()
            .map_or(&[][..], |native| native.3.as_slice());
        let production_reset = isolated_node_runtime
            && self.project.next_mode().await?.is_production()
            && production_reset_plan(&plan);
        let commonjs_reset = if commonjs_runtime.is_some() {
            commonjs_runtime
        } else if !prepared.commonjs_original_require.is_empty() {
            let production_original = isolated_node_runtime
                && self.project.next_mode().await?.is_production()
                && production_original_require_reset_plan(&plan);
            if !isolated_node_runtime
                || !original_require_reset_context(
                    self.project.next_mode().await?.is_development(),
                    self.project.next_mode().await?.is_production(),
                    self.runtime_env,
                    production_original,
                )
            {
                return Err(test_input_error(
                    self.path.clone(),
                    "Original CommonJS require resets require isolated development Node execution",
                ));
            }
            let registration = prepared
                .registration
                .context("Original reset requires its actual registration")?;
            if production_original {
                crate::testing_cjs_reset::prepare_production_original_require(
                    self.project,
                    context,
                    prepared.source,
                    &self.id,
                    &prepared.commonjs_original_require,
                    registration,
                    &prepared.mock_wrappers,
                )
                .await?
            } else {
                crate::testing_cjs_reset::prepare_original_require(
                    self.project,
                    context,
                    prepared.source,
                    &self.id,
                    &prepared.commonjs_original_require,
                    registration,
                    &prepared.mock_wrappers,
                )
                .await?
            }
        } else if prepared.module_reset
            && prepared.runtime_requests.is_empty()
            && prepared.registration.is_none()
            && plan.declarations.is_empty()
            && plan.hoisted.is_empty()
            && plan.mock_imports.is_empty()
            && plan.unmocks.is_empty()
            && (self.project.next_mode().await?.is_development() || production_reset)
            && (self.runtime_env || production_reset)
            && self.setup_paths.is_empty()
            && self.snapshot_serializers.is_empty()
            && self.cohort_paths.is_empty()
            && !self.source_coverage
            && !self.dependency_plan
        {
            crate::testing_cjs_reset::prepare(self.project, context, prepared.source, &self.id)
                .await?
        } else {
            None
        };
        if !plan.actual_imports.is_empty()
            && prepared.module_reset
            && commonjs_reset.is_none()
            && !(prepared.paired_native_actuals
                && !native_certificates.is_empty()
                && (!static_pairs.is_empty() || !original_initials.is_empty()))
        {
            return Err(test_input_error(
                self.path.clone(),
                "CommonJS actual-import resets require an isolated development Node certified \
                 nonleaf object or callable graph",
            ));
        }
        let context = commonjs_reset
            .as_ref()
            .map_or(context, |commonjs| commonjs.context);
        let setup_context = prepared.setup_context;
        let module = context
            .process(
                *commonjs_reset
                    .as_ref()
                    .map_or(prepared.source, |commonjs| commonjs.source),
                ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
            )
            .module()
            .to_resolved()
            .await?;
        if let Some(commonjs) = &commonjs_reset {
            commonjs.validate_owner(module).await?;
        }
        let mut internal_assets = fxindexmap! { rcstr!("INNER_TEST_MODULE") => module };
        let dynamic_manifest = if !prepared.runtime_requests.is_empty() {
            Some(
                crate::testing_dynamic_mock::manifest(
                    self.project,
                    context,
                    module,
                    &self.path,
                    &prepared.runtime_requests,
                    native_certificates,
                    static_pairs,
                    original_initials,
                    commonjs_reset.as_ref(),
                    if prepared.paired_native_actuals {
                        prepared.registration
                    } else {
                        None
                    },
                )
                .await?,
            )
        } else {
            None
        };
        let native_resettable = dynamic_manifest
            .as_ref()
            .map_or(&[][..], |manifest| manifest.native_resettable.as_slice());
        let mut leaf_promise_namespaces = Vec::new();
        let module_runtime = if prepared.module_reset {
            let publish_leaf_promises = isolated_node_runtime
                && (self.runtime_env || production_reset)
                && prepared.runtime_requests.is_empty()
                && prepared.registration.is_none()
                && plan.declarations.is_empty()
                && plan.hoisted.is_empty()
                && plan.mock_imports.is_empty()
                && plan.actual_imports.is_empty()
                && plan.unmocks.is_empty()
                && commonjs_reset.is_none();
            let (manifest, namespaces) = module_reset_manifest(
                self.project,
                context,
                module,
                &self.path,
                native_resettable,
                dynamic_manifest
                    .as_ref()
                    .map_or(&[][..], |manifest| manifest.native_protected.as_slice()),
                dynamic_manifest
                    .as_ref()
                    .map_or(&[][..], |manifest| manifest.compiled_resettable.as_slice()),
                &prepared.commonjs_original_require,
                static_pairs,
                original_initials,
                commonjs_reset.as_ref(),
                publish_leaf_promises,
            )
            .await?;
            leaf_promise_namespaces = namespaces;
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

        let mut demand_graph = dynamic_manifest
            .as_ref()
            .and_then(|manifest| manifest.demand_graph);
        if !prepared.callable_originals.is_empty()
            && self.runtime_env
            && self.project.next_mode().await?.is_development()
            && self.setup_paths.is_empty()
            && self.snapshot_serializers.is_empty()
            && self.cohort_paths.is_empty()
            && !self.source_coverage
            && !self.dependency_plan
        {
            let certificates = commonjs_callable_namespaces(
                module,
                prepared
                    .registration
                    .context("Callable namespace requires its actual compiler helper")?,
                &prepared.callable_originals,
            )
            .await?;
            if !certificates.is_empty() {
                let (edges, native_imports, mut namespaces) = if let Some(graph) = demand_graph {
                    let graph = graph.await?;
                    (
                        graph.edges.clone(),
                        graph.native_imports.clone(),
                        graph.namespaces.clone(),
                    )
                } else {
                    (Vec::new(), Vec::new(), Vec::new())
                };
                namespaces.extend(certificates);
                demand_graph = Some(
                    RuntimeImportDemandGraph {
                        edges,
                        native_imports,
                        namespaces,
                    }
                    .resolved_cell(),
                );
            }
        }
        if !leaf_promise_namespaces.is_empty() {
            let (edges, native_imports, mut namespaces) = if let Some(graph) = demand_graph {
                let graph = graph.await?;
                (
                    graph.edges.clone(),
                    graph.native_imports.clone(),
                    graph.namespaces.clone(),
                )
            } else {
                (Vec::new(), Vec::new(), Vec::new())
            };
            namespaces.extend(leaf_promise_namespaces);
            demand_graph = Some(
                RuntimeImportDemandGraph {
                    edges,
                    native_imports,
                    namespaces,
                }
                .resolved_cell(),
            );
        }
        let dynamic_runtime = if let Some(manifest) = dynamic_manifest {
            internal_assets.insert(rcstr!("INNER_TEST_DYNAMIC_MOCKS"), manifest.module);
            "export function initializeDynamicModuleMocking(options) { return \
             require('next/dist/experimental/testing/mocking/dynamic').\
             initializeDynamicModuleMocking(__turbopack_context__, \
             require(/*turbopackChunkingType: shared*/ 'INNER_TEST_DYNAMIC_MOCKS').manifest, \
             options); }"
        } else {
            ""
        };
        let mut harness_sources = Vec::new();
        let mut setup_loads = String::new();
        let mut setup_callbacks = String::new();
        if !self.snapshot_serializers.is_empty() {
            let source = snapshot_serializer_source(
                self.project.project_path().owned().await?,
                &self.snapshot_serializers,
            )
            .await?;
            let mut harness =
                node_test_harness_source(self.project, source, "snapshot-serializers").await?;
            harness["serializers"] = serde_json::to_value(&self.snapshot_serializers)?;
            push_node_test_harness_source(&mut harness_sources, harness)?;
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
            let setup_source: ResolvedVc<Box<dyn Source>> =
                Vc::upcast::<Box<dyn Source>>(FileSource::new(path.clone()))
                    .to_resolved()
                    .await?;
            let module = setup_context
                .process(
                    *setup_source,
                    ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
                )
                .module()
                .to_resolved()
                .await?;
            let source = setup_module_source(path.clone()).await?;
            let mut harness = node_test_harness_source(self.project, source, "setup").await?;
            harness["setup"] = serde_json::Value::String(
                canonical_test_source_identity(self.project, setup_source).await?,
            );
            push_node_test_harness_source(&mut harness_sources, harness)?;
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
        let authored_entry = module;
        let module = context
            .process(
                source,
                ReferenceType::Internal(ResolvedVc::cell(internal_assets)),
            )
            .module()
            .to_resolved()
            .await?;
        if let Some(commonjs) = &commonjs_reset {
            commonjs
                .validate_harness_owners(module, authored_entry)
                .await?;
        }
        let harness_coverage = if harness_sources.is_empty() {
            None
        } else {
            Some(
                serde_json::json!({
                    "version": 1,
                    "kind": "node-test-harness",
                    "entryPath": format!("server/next-test/{}.js", self.id),
                    "sources": harness_sources,
                })
                .to_string()
                .into(),
            )
        };
        Ok(PreparedNodeTestEntry {
            module,
            demand_graph,
            harness_coverage,
            original_require_registration: commonjs_reset
                .as_ref()
                .and_then(|commonjs| commonjs.original_require_registration()),
        }
        .cell())
    }

    #[turbo_tasks::function]
    async fn output_assets(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;
        let prepared = self.prepared_entry().await?;
        let module = prepared.module;
        let graph = this.project.module_graph(*module);
        let graph = if let Some(demands) = prepared.demand_graph {
            graph.with_runtime_import_demands(*demands)
        } else {
            graph
        };
        let mut native_test_commonjs_promise_namespaces = false;
        if let Some(demands) = prepared.demand_graph {
            let demands = demands.await?;
            for namespace in &demands.namespaces {
                if namespace.await?.kind == RuntimeImportNamespaceKind::CommonJsLeafPromise {
                    native_test_commonjs_promise_namespaces = true;
                    break;
                }
            }
        }
        let chunking_context = this.project.server_chunking_context(false);
        let chunking_context = if this.source_coverage {
            chunking_context.with_source_coverage()
        } else {
            chunking_context
        };
        let chunking_context = if this.import_coverage_roles {
            chunking_context.with_native_test_import_coverage_roles()
        } else {
            chunking_context
        };
        let chunking_context = if native_test_commonjs_promise_namespaces {
            chunking_context.with_native_test_commonjs_promise_namespaces()
        } else {
            chunking_context
        };
        let EntryChunkGroupResult { asset, .. } = *chunking_context
            .entry_chunk_group(
                this.project
                    .node_root()
                    .await?
                    .join(&format!("server/next-test/{}.js", this.id))?,
                ChunkGroup::Entry(vec![module]),
                graph,
                OutputAssets::empty(),
                OutputAssets::empty(),
                AvailabilityInfo::root(),
            )
            .await?;
        let mut assets = vec![asset];
        if let Some(metadata) = &prepared.harness_coverage {
            assets.push(ResolvedVc::upcast(
                VirtualOutputAsset::new(
                    this.project.node_root().await?.join(&format!(
                        "server/next-test/{}.harness-coverage.json",
                        this.id
                    ))?,
                    AssetContent::file(
                        FileContent::Content(File::from(metadata.to_string())).cell(),
                    ),
                )
                .to_resolved()
                .await?,
            ));
        }
        if this.import_coverage_roles {
            let mode = if this.project.next_mode().await?.is_production() {
                "production"
            } else {
                "development"
            };
            let node_root = this.project.node_root().owned().await?;
            let mut scripts = Vec::new();
            let mut seen = HashSet::new();
            for output in all_assets_from_entries(Vc::cell(assets.clone()))
                .await?
                .iter()
            {
                let Some(generator) =
                    ResolvedVc::try_sidecast::<Box<dyn GenerateSourceMap>>(*output)
                else {
                    continue;
                };
                let owned = generator.native_test_import_coverage_roles().await?;
                let FileContent::Content(file) = &*owned else {
                    continue;
                };
                let sections: serde_json::Value =
                    serde_json::from_slice(&file.content().to_bytes())?;
                let path = output.path().await?;
                let relative = node_root
                    .get_path_to(&path)
                    .context("Native coverage role asset escaped output root")?;
                if relative.is_empty()
                    || !relative.ends_with(".js")
                    || !seen.insert(relative.to_string())
                {
                    bail!("Invalid native coverage role asset identity");
                }
                let script_hash = output
                    .content()
                    .content_hash(no_hash_salt(), HashAlgorithm::Sha256Base64)
                    .owned()
                    .await?
                    .context("Native coverage role code is absent")?;
                let map_hash = AssetContent::file(generator.generate_source_map())
                    .content_hash(no_hash_salt(), HashAlgorithm::Sha256Base64)
                    .owned()
                    .await?
                    .context("Native coverage role map is absent")?;
                let hex = |value: &str| -> Result<String> {
                    Ok(data_encoding::HEXLOWER
                        .encode(&data_encoding::BASE64.decode(value.as_bytes())?))
                };
                scripts.push(serde_json::json!({"path":relative,"sha256":hex(&script_hash)?,"mapPath":format!("{relative}.map"),"mapSha256":hex(&map_hash)?,"sections":sections}));
            }
            scripts.sort_by(|a, b| a["path"].as_str().cmp(&b["path"].as_str()));
            let entry_path = format!("server/next-test/{}.js", this.id);
            assets.push(ResolvedVc::upcast(VirtualOutputAsset::new(
                node_root.join(&format!("server/next-test/{}.import-coverage.json", this.id))?,
                AssetContent::file(FileContent::Content(File::from(
                    serde_json::json!({"version":1,"kind":"native-import-initializer-coverage","mode":mode,"entryPath":entry_path,"scripts":scripts}).to_string()
                )).cell()),
            ).to_resolved().await?));
        }
        if this.source_coverage {
            assets.push(ResolvedVc::upcast(VirtualOutputAsset::new(
                this.project.node_root().await?.join(&format!("server/next-test/{}.source-coverage.json", this.id))?,
                AssetContent::file(FileContent::Content(File::from(
                    serde_json::json!({"version":1,"kind":"node-source-coverage","mode":"production","sourceMaps":"absolute-file-uri","preserveOriginalSyntax":true}).to_string()
                )).cell()),
            ).to_resolved().await?));
        }
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
        let setup_mocks = crate::testing_mock_inputs::has_mock_setups(&this.setup_paths).await?;
        if !plan.is_empty() || setup_mocks {
            assets.push(ResolvedVc::upcast(
                VirtualOutputAsset::new(
                    this.project
                        .node_root()
                        .await?
                        .join(&format!("server/next-test/{}.metadata.json", this.id))?,
                    AssetContent::file(
                        FileContent::Content(File::from(if setup_mocks {
                            crate::testing_mock_inputs::metadata(this.project, &this.path, &this.id, &this.setup_paths, this.runtime_env).await?
                        } else if !plan.runtime_requests.is_empty() {
                            if plan.declarations.is_empty() {
                                "{\"moduleCache\":{\"version\":1},\"dynamicModuleMocking\":{\"version\"\
                                 :1}}".to_string()
                            } else {
                                let prepared = prepare_node_test(
                                    this.project,
                                    &this.path,
                                    &this.id,
                                    this.runtime_env,
                                ).await?;
                                let paired = crate::testing_static_runtime::prepare(
                                    this.project.project_path().owned().await?,
                                    prepared.static_runtime_origin.context("Static runtime requires the original compiler context")?,
                                    prepared.context,
                                    prepared.source,
                                    prepared.registration.context("Static runtime requires actual eager registration")?,
                                    &this.path,
                                    &prepared.runtime_requests,
                                    &this.id,
                                    prepared.paired_native_actuals,
                                ).await?;
                                // A mixed target set still has actual static pairs. Cancelled
                                // targets retain their own original-initial manifest entries.
                                if !paired.pairs.is_empty() {
                                    "{\"moduleCache\":{\"version\":1},\"dynamicModuleMocking\":{\"version\":1,\"staticMocks\":1},\"moduleMocking\":{\"version\":1}}".to_string()
                                } else if paired.pairs.is_empty() && !paired.original_initials.is_empty() {
                                    "{\"moduleCache\":{\"version\":1},\"dynamicModuleMocking\":{\"version\":1,\"nativeOriginalInitial\":1},\"moduleMocking\":{\"version\":1}}".to_string()
                                } else {
                                    return Err(test_input_error(this.path.clone(), "Static runtime activation requires actual compiler pairs or original-initial providers"));
                                }
                            }
                        } else if plan.reset_modules {
                            if prepared.original_require_registration.is_some() {
                                "{\"moduleCache\":{\"version\":1},\"moduleMocking\":{\"version\":1,\"originalCommonJsRequireReset\":1}}".to_string()
                            } else {
                                "{\"moduleCache\":{\"version\":1}}".to_string()
                            }
                        } else {
                            if this.project.next_mode().await?.is_production() {
                                // No synthetic coverage inventory is claimed for production.
                                // Admission above certifies only the static factory lane.
                                serde_json::to_string(&serde_json::json!({
                                    "moduleMocking": {
                                        "version": 1,
                                        "productionStaticFactory": 1,
                                    },
                                }))?
                            } else {
                            let prepared = prepare_node_test(
                                this.project,
                                &this.path,
                                &this.id,
                                this.runtime_env,
                            )
                            .await?;
                            if prepared.cjs_named_spy {
                                serde_json::to_string(&serde_json::json!({"moduleMocking":{"version":1,"cjsNamedSpy":1}}))?
                            } else {
                                serde_json::to_string(&serde_json::json!({
                                    "moduleMocking": {
                                        "version": 1,
                                        "coverage": {
                                            "version": 1,
                                            "sources": prepared.coverage_sources,
                                        },
                                    },
                                }))?
                            }
                            }
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
    let endpoint_value = (*endpoint.connect().await?).context("Missing test endpoint")?;
    let endpoint_project = endpoint_value.project();
    let config_entry = endpoint_project.await?.test_entry;
    let config_revision = if let Some(entry) = config_entry {
        entry.await?.tsconfig_input_revision.clone()
    } else {
        None
    };
    let observed_output = config_revision
        .as_ref()
        .map(|_| crate::testing_tsconfig_inputs::actual_endpoint_output_operation(endpoint));
    let output = if let Some(operation) = observed_output {
        operation.read_strongly_consistent().await?
    } else {
        endpoint_value.output().await?
    };
    let project = output.project;
    let node_root = project.node_root().owned().await?;
    if node_root.file_name() == &*directory {
        bail!("Test snapshots must not overwrite the active output directory");
    }
    let client_root = project.client_relative_path().owned().await?;
    let destination = node_root.parent().join(&directory)?;
    let mut assets = vec![];
    let mut external_links = vec![];
    let mut replaced_external_paths = HashSet::new();
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
        if let AssetContent::Redirect(link) = &*content.await? {
            if ResolvedVc::try_downcast_type::<ExternalsSymlinkAsset>(*asset).is_some() {
                external_links.push((relative.to_owned(), link.target.clone()));
                replaced_external_paths.insert(relative.to_owned());
                continue;
            }
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
    let mut snapshot_output_paths = None;
    if !external_links.is_empty() {
        let entry =
            config_entry.context("External package capture requires a native test entry")?;
        let external_assets = crate::testing_external_packages::capture_external_packages(
            external_links,
            &destination,
            &entry.await?.id,
        )
        .await?;
        let captured_paths = all_asset_paths(
            Vc::cell(external_assets.clone()),
            destination.clone(),
            Some(HashAlgorithm::Sha256Base64),
        )
        .owned()
        .await?;
        let mut output_paths = output.output_paths.owned().await?;
        let EndpointOutputPaths::NodeJs { server_paths, .. } = &mut output_paths else {
            bail!("External package capture requires a Node snapshot output");
        };
        server_paths.retain(|path| !replaced_external_paths.contains(path.path.as_str()));
        for captured in captured_paths {
            if server_paths.iter().any(|path| path.path == captured.path) {
                bail!("Captured external package duplicates an existing output asset");
            }
            server_paths.push(captured);
        }
        snapshot_output_paths = Some(output_paths.cell());
        assets.extend(external_assets);
    }
    if let Some(operation) = observed_output {
        use turbo_tasks::CollectiblesSource;
        let entry = config_entry.context("Native config input entry disappeared")?;
        let receipt = crate::testing_tsconfig_inputs::receipt_asset(
            &output,
            entry,
            operation.peek_collectibles::<Box<dyn turbopack_core::resolve::tsconfig_provenance::NativeTsConfigObservation>>().into_iter().collect(),
            destination.join(&format!("server/next-test/{}.tsconfig-inputs.json", entry.await?.id))?,
        ).await?;
        let receipt_paths =
            crate::testing_tsconfig_inputs::receipt_asset_paths(receipt, destination.clone())
                .owned()
                .await?;
        if receipt_paths.len() != 1 {
            bail!("Native config receipt must expose exactly one actual output asset");
        }
        let mut output_paths = snapshot_output_paths
            .unwrap_or(*output.output_paths)
            .owned()
            .await?;
        let EndpointOutputPaths::NodeJs { server_paths, .. } = &mut output_paths else {
            bail!("Native config receipt requires a Node snapshot output");
        };
        for receipt_path in receipt_paths {
            if server_paths
                .iter()
                .any(|path| path.path == receipt_path.path)
            {
                bail!("Native config receipt duplicates an existing output asset");
            }
            server_paths.push(receipt_path);
        }
        snapshot_output_paths = Some(output_paths.cell());
        assets.push(receipt);
    }
    next_core::emit_assets(
        Vc::cell(assets),
        destination.clone(),
        client_root,
        destination,
    )
    .as_side_effect()
    .await?;
    Ok(snapshot_output_paths.unwrap_or(*output.output_paths))
}

#[cfg(test)]
mod production_factory_tests {
    #[test]
    fn admits_only_paired_native_actual_syntax_candidates() {
        for reset in ["", "vi.resetModules();"] {
            let source = format!(
                "import {{vi}} from \
                 'vitest';vi.mock('package',()=>({{value:5}}));vi.doMock('package',()=>({{value:\
                 73}}));{reset}vi.importActual('package')"
            );
            let plan = crate::testing::extract_test_mocks(&source, "entry.mjs").unwrap();
            assert!(crate::testing::production_paired_native_actual_plan(&plan));
        }
        for body in [
            "vi.mock('./dep',()=>({value:5}));vi.doMock('./dep',()=>({value:73}));vi.\
             importActual('./dep')",
            "vi.mock('package',()=>({value:5}));vi.importActual('package')",
            "vi.doMock('package',()=>({value:73}));vi.importActual('package')",
            "vi.mock('package',()=>({value:5}));vi.doMock('package',()=>({value:73}));vi.\
             importActual('other')",
            "vi.mock('package',()=>({value:5}));vi.doMock('package',()=>({value:73}));vi.\
             importMock('package')",
            "vi.mock('package',()=>({value:5}));vi.doMock('package',()=>({value:73}));vi.\
             hoisted(()=>1);vi.importActual('package')",
        ] {
            let source = format!("import {{vi}} from 'vitest';{body}");
            if let Ok(plan) = crate::testing::extract_test_mocks(&source, "entry.mjs") {
                assert!(
                    !crate::testing::production_paired_native_actual_plan(&plan),
                    "{body}"
                );
            }
        }
    }
    use crate::testing::{
        extract_test_mocks, production_browser_mock_plan, production_factory_plan,
        production_reset_plan,
    };

    #[test]
    fn production_original_require_resets_keep_one_explicit_leaf_plan() {
        for body in [
            "vi.mock('./target.cjs',()=>({value:1}));vi.resetModules()",
            "const reset=vi.resetModules;vi.mock('./target.cjs',()=>({value:1}));reset()",
        ] {
            let plan =
                extract_test_mocks(&format!("import {{vi}} from 'vitest';{body}"), "entry.mjs")
                    .unwrap();
            assert!(
                crate::testing::production_original_require_reset_plan(&plan),
                "{body}"
            );
            assert!(!production_factory_plan(&plan), "{body}");
            assert!(!production_reset_plan(&plan), "{body}");
        }
        for body in [
            "vi.mock('./target',()=>({value:1}));vi.resetModules()",
            "vi.mock('./target.js',()=>({value:1}));vi.resetModules()",
            "vi.mock('./target.cjs',()=>({value:1}))",
            "vi.resetModules()",
            "vi.mock('./target.cjs',(original)=>({value:1}));vi.resetModules()",
            "vi.mock('./target.cjs',()=>({value:1}));vi.mock('./other.cjs',()=>({value:2}));vi.\
             resetModules()",
            "vi.mock('package',()=>({value:1}));vi.resetModules()",
            "vi.doMock('./target.cjs',()=>({value:1}));vi.resetModules()",
            "vi.hoisted(()=>1);vi.mock('./target.cjs',()=>({value:1}));vi.resetModules()",
            "Object.getOwnPropertyDescriptor(vi,'resetModules');vi.mock('./target.cjs',\
             ()=>({value:1}))",
        ] {
            if let Ok(plan) =
                extract_test_mocks(&format!("import {{vi}} from 'vitest';{body}"), "entry.mjs")
            {
                assert!(
                    !crate::testing::production_original_require_reset_plan(&plan),
                    "{body}"
                );
            }
        }
    }

    #[test]
    fn original_require_reset_context_retains_real_production_environment() {
        for development in [false, true] {
            for production in [false, true] {
                for runtime_env in [false, true] {
                    for candidate in [false, true] {
                        assert_eq!(
                            crate::testing::original_require_reset_context(
                                development,
                                production,
                                runtime_env,
                                candidate
                            ),
                            (development && !production && runtime_env)
                                || (!development && production && !runtime_env && candidate),
                            "development={development}, production={production}, \
                             runtime_env={runtime_env}, candidate={candidate}"
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn admits_production_reset_plans_without_mock_registrations() {
        for body in [
            "vi.resetModules()",
            "vi.resetModules(); const actual = await vi.importActual('./dependency.cjs')",
            "const actual = await vi.importActual('../dependency.cjs'); vi.resetModules()",
        ] {
            let source = format!("import {{ vi }} from 'vitest'; {body}");
            let plan = extract_test_mocks(&source, "entry.js").unwrap();
            assert!(production_reset_plan(&plan), "{body}");
            assert!(!production_factory_plan(&plan), "{body}");
            assert!(!production_browser_mock_plan(&plan), "{body}");
        }
        for body in [
            "const actual = await vi.importActual('./dependency.cjs')",
            "vi.resetModules(); vi.mock('./dependency', () => ({ value: 42 }))",
            "vi.resetModules(); vi.mock('./dependency', { spy: true })",
            "vi.resetModules(); vi.doMock('./dependency', () => ({ value: 42 }))",
            "vi.resetModules(); vi.unmock('./dependency')",
            "vi.resetModules(); const mocked = await vi.importMock('./dependency')",
            "const value = vi.hoisted(() => 42); vi.resetModules()",
        ] {
            let source = format!("import {{ vi }} from 'vitest'; {body}");
            match extract_test_mocks(&source, "entry.js") {
                Ok(plan) => assert!(!production_reset_plan(&plan), "{body}"),
                Err(error) => assert!(
                    error
                        .to_string()
                        .contains("vi.resetModules cannot currently combine"),
                    "{body}: {error}"
                ),
            }
        }
    }

    #[test]
    fn admits_relative_browser_spies_and_factory_composition() {
        for body in [
            "vi.mock('./dep', { spy: true })",
            "vi.mock('../dep', { spy: true })",
            "vi.mock('./dep', { spy: true }); vi.mock('./other', () => ({ value: 42 }))",
        ] {
            let source = format!("import {{ vi }} from 'vitest'; {body}");
            let plan = extract_test_mocks(&source, "entry.js").unwrap();
            assert!(production_browser_mock_plan(&plan), "{body}");
            assert!(!production_factory_plan(&plan), "{body}");
        }
    }

    #[test]
    fn rejects_other_browser_mock_features_in_production() {
        for body in [
            "vi.mock('./dep')",
            "vi.mock('dependency', { spy: true })",
            "const state = vi.hoisted(() => ({})); vi.mock('./dep', { spy: true })",
            "vi.resetModules(); vi.mock('./dep', { spy: true })",
            "vi.doMock('./other', () => ({ value: 42 })); vi.mock('./dep', { spy: true })",
            "const actual = await vi.importActual('./dep'); vi.mock('./dep', { spy: true })",
            "const mocked = await vi.importMock('./dep'); vi.mock('./dep', { spy: true })",
            "vi.unmock('./other'); vi.mock('./dep', { spy: true })",
        ] {
            let source = format!("import {{ vi }} from 'vitest'; {body}");
            // Some combinations are already rejected by the syntax planner.
            // A parsed plan must still be refused by production admission.
            if let Ok(plan) = extract_test_mocks(&source, "entry.js") {
                assert!(!production_browser_mock_plan(&plan), "{body}");
            }
        }
    }

    #[test]
    fn admits_only_relative_static_factory_plans_for_production() {
        for body in [
            "vi.mock('./dep', () => ({ value: 42 }))",
            "vi.mock('../dep', () => { return { value: () => 42 } })",
        ] {
            let source = format!("import {{ vi }} from 'vitest'; {body}");
            assert!(production_factory_plan(
                &extract_test_mocks(&source, "entry.js").unwrap()
            ));
        }
        for body in [
            "vi.mock('./dep')",
            "vi.mock('./dep', { spy: true })",
            "vi.mock('./dep', () => ({ ...original, value: 42 }))",
            "vi.mock('dependency', () => ({ value: 42 }))",
            "const state = vi.hoisted(() => ({ value: 42 })); vi.mock('./dep', () => ({ value: \
             state.value }))",
            "vi.resetModules(); vi.mock('./dep', () => ({ value: 42 }))",
            "vi.doMock('./dep', () => ({ value: 42 }))",
            "const original = await vi.importActual('./dep'); vi.mock('./dep', () => ({ value: 42 \
             }))",
        ] {
            let source = format!("import {{ vi }} from 'vitest'; {body}");
            if let Ok(plan) = extract_test_mocks(&source, "entry.js") {
                assert!(!production_factory_plan(&plan), "{body}");
            }
        }
    }
}

#[cfg(test)]
mod typescript_fallback_tests {
    use anyhow::{Context, Result};
    use turbo_rcstr::{RcStr, rcstr};
    use turbo_tasks::{TurboTasks, Vc};
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
    use turbo_tasks_fs::{DiskFileSystem, FileSystem};
    use turbopack::{
        ModuleAssetContext,
        module_options::{
            EcmascriptOptionsContext, ModuleOptionsContext, TypescriptTransformOptions,
        },
        transition::TransitionOptions,
    };
    use turbopack_core::{
        compile_time_info::CompileTimeInfo,
        condition::ContextCondition,
        environment::{Environment, ExecutionEnvironment, NodeJsEnvironment},
        ident::Layer,
        module::Module,
        reference_type::EcmaScriptModulesReferenceSubType,
        resolve::{
            ResolveErrorMode,
            options::{ImportMap, ImportMapping},
            origin::PlainResolveOrigin,
            parse::Request,
        },
    };
    use turbopack_resolve::{
        ecmascript::esm_resolve, resolve_options_context::ResolveOptionsContext,
    };

    use crate::testing::test_resolve_options_context;

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn relative_typescript_fallbacks_use_actual_test_context_and_keep_javascript()
    -> Result<()> {
        #[turbo_tasks::function(operation, root)]
        async fn operation(disk_root: RcStr, project_name: RcStr) -> Result<()> {
            let root =
                DiskFileSystem::new(rcstr!("test-typescript-fallbacks"), Vc::cell(disk_root))
                    .root()
                    .owned()
                    .await?;
            let project = root.join(&project_name)?;
            let nested = project.join("nested")?;
            let mut existing = ImportMap::empty();
            existing.insert_exact_alias(
                "./configured.js",
                ImportMapping::PrimaryAlternative(rcstr!("./override.ts"), None).resolved_cell(),
            );
            let leaf = ResolveOptionsContext {
                enable_typescript: true,
                enable_react: true,
                fallback_import_map: Some(existing.resolved_cell()),
                ..Default::default()
            }
            .resolved_cell();
            let base = ResolveOptionsContext {
                enable_typescript: true,
                enable_react: true,
                rules: vec![(ContextCondition::InPath(nested.clone()), leaf)],
                ..Default::default()
            }
            .resolved_cell();
            let environment = Environment::new(ExecutionEnvironment::NodeJsLambda(
                NodeJsEnvironment::default().resolved_cell(),
            ));
            let info = CompileTimeInfo::new(environment).to_resolved().await?;
            for decorated in [false, true] {
                let options = if decorated {
                    test_resolve_options_context(*base, project.clone(), false)
                } else {
                    *base
                };
                let context = ModuleAssetContext::new(
                    TransitionOptions::default().cell(),
                    *info,
                    ModuleOptionsContext {
                        ecmascript: EcmascriptOptionsContext {
                            enable_typescript_transform: Some(
                                TypescriptTransformOptions::default().resolved_cell(),
                            ),
                            ..Default::default()
                        },
                        ..Default::default()
                    }
                    .cell(),
                    options,
                    Layer::new(rcstr!("test-typescript-fallbacks")),
                )
                .to_resolved()
                .await?;
                for (directory, requests) in [
                    (
                        project.clone(),
                        vec![
                            ("./both.js", Some("both.js")),
                            ("./prefer-ts.js", decorated.then_some("prefer-ts.ts")),
                            ("./only-tsx.js", decorated.then_some("only-tsx.tsx")),
                            ("./only-mts.mjs", decorated.then_some("only-mts.mts")),
                            ("./only-cts.cjs", decorated.then_some("only-cts.cts")),
                            ("./missing.js", None),
                        ],
                    ),
                    (
                        nested.clone(),
                        vec![
                            ("./configured.js", Some("override.ts")),
                            ("../prefer-ts.js", decorated.then_some("../prefer-ts.ts")),
                            ("../both.js", Some("../both.js")),
                        ],
                    ),
                ] {
                    let origin = PlainResolveOrigin::new(
                        Vc::upcast(*context),
                        directory.join("entry.test.ts")?,
                    );
                    for (request, expected) in requests {
                        // This is the production ESM import path: it asks the actual
                        // ModuleAssetContext for parent-directory resolve options.
                        let resolved = esm_resolve(
                            Vc::upcast(origin),
                            Request::parse_string(request.into()),
                            EcmaScriptModulesReferenceSubType::Import,
                            ResolveErrorMode::Ignore,
                            None,
                        )
                        .await?;
                        let modules = resolved.await?.primary_modules().await?;
                        if let Some(expected) = expected {
                            assert_eq!(modules.len(), 1, "{decorated}: {request}");
                            assert_eq!(
                                modules[0].ident().await?.path,
                                directory.join(expected)?,
                                "{decorated}: {request}"
                            );
                        } else {
                            assert!(modules.is_empty(), "{decorated}: {request}");
                        }
                    }
                }
            }
            Ok(())
        }
        let repository = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .context("crates directory")?
            .parent()
            .context("repository directory")?;
        let directory = tempfile::Builder::new()
            .prefix(".next-test-ts-fallback-")
            .tempdir_in(repository)?;
        std::fs::create_dir(directory.path().join("nested"))?;
        std::fs::write(
            directory.path().join("package.json"),
            "{\"private\":true,\"type\":\"module\"}\n",
        )?;
        std::fs::write(
            directory.path().join("tsconfig.json"),
            "{\"compilerOptions\":{\"moduleResolution\":\"bundler\"}}\n",
        )?;
        for file in [
            "entry.test.ts",
            "both.js",
            "both.ts",
            "prefer-ts.ts",
            "prefer-ts.tsx",
            "only-tsx.tsx",
            "only-mts.mts",
            "only-cts.cts",
            "nested/entry.test.ts",
            "nested/configured.ts",
            "nested/override.ts",
        ] {
            std::fs::write(directory.path().join(file), "export const source = 1;\n")?;
        }
        let disk_root = repository
            .canonicalize()?
            .to_str()
            .context("UTF-8 repository")?
            .into();
        let project_name = directory
            .path()
            .file_name()
            .context("fixture name")?
            .to_str()
            .context("UTF-8 fixture name")?
            .into();
        let tasks = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tasks
            .run_once(async move {
                operation(disk_root, project_name)
                    .read_strongly_consistent()
                    .await
            })
            .await?;
        Ok(())
    }
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn callable_publication_keeps_actual_strict_certificate_identity() -> Result<()> {
        #[turbo_tasks::function(operation, root)]
        async fn operation(disk_root: RcStr, project_name: RcStr) -> Result<()> {
            let root = DiskFileSystem::new(
                rcstr!("test-callable-publication-certificate"),
                Vc::cell(disk_root),
            )
            .root()
            .owned()
            .await?;
            let project = root.join(&project_name)?;
            let info = CompileTimeInfo::new(Environment::new(ExecutionEnvironment::NodeJsLambda(
                NodeJsEnvironment::default().resolved_cell(),
            )))
            .to_resolved()
            .await?;
            let context = ModuleAssetContext::new(
                TransitionOptions::default().cell(),
                *info,
                ModuleOptionsContext::default().cell(),
                ResolveOptionsContext::default().cell(),
                Layer::new(rcstr!("test-callable-publication-certificate")),
            )
            .to_resolved()
            .await?;
            for (request, expected_strict, extended) in [
                ("./ordinary.cjs", turbopack_ecmascript::cjs_reset_export::CommonJsResetExportShape::FunctionBinding, false),
                ("./object.cjs", turbopack_ecmascript::cjs_reset_export::CommonJsResetExportShape::ObjectLiteral, false),
                ("./unknown.cjs", turbopack_ecmascript::cjs_reset_export::CommonJsResetExportShape::Unsupported, false),
                ("./self.cjs", turbopack_ecmascript::cjs_reset_export::CommonJsResetExportShape::Unsupported, true),
                ("./hidden.cjs", turbopack_ecmascript::cjs_reset_export::CommonJsResetExportShape::Unsupported, true),
                ("./hidden-unproven.cjs", turbopack_ecmascript::cjs_reset_export::CommonJsResetExportShape::Unsupported, false),
                ("./getter.cjs", turbopack_ecmascript::cjs_reset_export::CommonJsResetExportShape::Unsupported, true),
                ("./hidden-default.cjs", turbopack_ecmascript::cjs_reset_export::CommonJsResetExportShape::Unsupported, true),
                ("./getter-unproven.cjs", turbopack_ecmascript::cjs_reset_export::CommonJsResetExportShape::Unsupported, false),
                ("./hidden-default-extra.cjs", turbopack_ecmascript::cjs_reset_export::CommonJsResetExportShape::Unsupported, false),
            ] {
                let origin = PlainResolveOrigin::new(Vc::upcast(*context), project.join("entry.test.mjs")?);
                let resolved = esm_resolve(Vc::upcast(origin), Request::parse_string(request.into()), EcmaScriptModulesReferenceSubType::Import, ResolveErrorMode::Ignore, None).await?;
                let modules = resolved.await?.primary_modules().await?;
                assert_eq!(modules.len(), 1, "{request}");
                let full = crate::testing::commonjs_full_owner(modules[0]).await?.context("actual resolved CJS full owner")?;
                let strict = turbopack_ecmascript::cjs_reset_export::commonjs_reset_export_certificate(*full).to_resolved().await?;
                let optional = turbopack_ecmascript::cjs_reset_export::commonjs_callable_publication_certificate(*full).to_resolved().await?;
                let strict_again = turbopack_ecmascript::cjs_reset_export::commonjs_reset_export_certificate(*full).to_resolved().await?;
                assert_eq!(strict, strict_again, "{request}: strict task identity changed");
                assert_eq!(strict.await?.shape, expected_strict, "{request}");
                assert_eq!(strict.await?.module, full);
                assert_eq!(optional.await?.module, full);
                assert_eq!(strict == optional, !extended, "{request}: optional certificate replaced an existing result");
                assert_eq!(optional.await?.shape, if extended { turbopack_ecmascript::cjs_reset_export::CommonJsResetExportShape::FunctionBinding } else { expected_strict });
            }
            Ok(())
        }
        let repository = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .context("crates directory")?
            .parent()
            .context("repository directory")?;
        let directory = tempfile::Builder::new()
            .prefix(".next-test-cjs-certificate-")
            .tempdir_in(repository)?;
        for (file, source) in [
            ("package.json", "{\"private\":true,\"type\":\"module\"}\n"),
            ("entry.test.mjs", "export {};\n"),
            (
                "ordinary.cjs",
                "function exported(value) { return value }; exported.label='root'; \
                 module.exports=exported;\n",
            ),
            ("object.cjs", "module.exports={value:1};\n"),
            ("unknown.cjs", "module.exports=Promise.resolve(1);\n"),
            (
                "self.cjs",
                "function exported(value) { return value }; exported.__esModule=true; \
                 exported.default=exported; module.exports=exported;\n",
            ),
            (
                "hidden.cjs",
                "function exported(value) { return value }; \
                 Object.defineProperty(exported,'__esModule',{value:true,writable:true,\
                 configurable:true}); exported.default=exported; module.exports=exported;\n",
            ),
            (
                "hidden-unproven.cjs",
                "function exported(value) { return value }; \
                 Object.defineProperty(exported,'__esModule',{value:true}); \
                 exported.default=exported; module.exports=exported;\n",
            ),
            (
                "getter.cjs",
                "function exported(value) { return value }; \
                 Object.defineProperty(exported,'__esModule',{enumerable:true,configurable:true,\
                 get(){globalThis.trace.push(this);return true}}); exported.default=exported; \
                 module.exports=exported;\n",
            ),
            (
                "hidden-default.cjs",
                "function exported(value) { return value }; exported.__esModule=true; \
                 Object.defineProperty(exported,'default',{value:function nested(value){return \
                 value+1},writable:true,configurable:true}); module.exports=exported;\n",
            ),
            (
                "getter-unproven.cjs",
                "function exported(value) { return value }; \
                 Object.defineProperty(exported,'__esModule',{enumerable:true,configurable:true,\
                 get(){if(globalThis.flag)return false;return true}}); exported.default=exported; \
                 module.exports=exported;\n",
            ),
            (
                "hidden-default-extra.cjs",
                "function exported(value) { return value }; exported.__esModule=true; \
                 Object.defineProperty(exported,'default',{value:function nested(value){return \
                 value+1},writable:true,configurable:true}); exported.default=7; \
                 module.exports=exported;\n",
            ),
        ] {
            std::fs::write(directory.path().join(file), source)?;
        }
        let disk_root = repository
            .canonicalize()?
            .to_str()
            .context("UTF-8 repository")?
            .into();
        let project_name = directory
            .path()
            .file_name()
            .context("fixture name")?
            .to_str()
            .context("UTF-8 fixture name")?
            .into();
        let tasks = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tasks
            .run_once(async move {
                operation(disk_root, project_name)
                    .read_strongly_consistent()
                    .await
            })
            .await?;
        Ok(())
    }
}

#[cfg(test)]
mod injected_commonjs_producer_tests {
    use anyhow::{Context, Result};
    use turbo_rcstr::{RcStr, rcstr};
    use turbo_tasks::{TurboTasks, ValueToString, Vc};
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
    use turbo_tasks_fs::{DiskFileSystem, FileSystem};
    use turbopack::{
        ModuleAssetContext, module_options::ModuleOptionsContext, transition::TransitionOptions,
    };
    use turbopack_core::{
        compile_time_info::{
            CompileTimeDefineValue, CompileTimeDefines, CompileTimeInfo, DefinableNameSegment,
            FreeVarReferences,
        },
        context::AssetContext,
        environment::{Environment, ExecutionEnvironment, NodeJsEnvironment},
        file_source::FileSource,
        ident::Layer,
        reference::primary_chunkable_referenced_modules,
        reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
        resolve::{ResolveErrorMode, origin::PlainResolveOrigin, parse::Request},
    };
    use turbopack_ecmascript::{
        EcmascriptOptions,
        chunk::{EcmascriptChunkPlaceable, EcmascriptExports},
        code_gen::CodeGen,
        references::esm::{EsmAssetReference, EsmAsyncAssetReference},
    };
    use turbopack_resolve::{
        ecmascript::esm_resolve, resolve_options_context::ResolveOptionsContext,
    };

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn injected_commonjs_producer_keeps_actual_graph_owner_and_context() -> Result<()> {
        #[turbo_tasks::function(operation, root)]
        async fn operation(disk_root: RcStr, project_name: RcStr) -> Result<()> {
            assert!(!EcmascriptOptions::default().test_injected_commonjs_exports);
            let root = DiskFileSystem::new(
                rcstr!("test-injected-commonjs-producer"),
                Vc::cell(disk_root),
            )
            .root()
            .owned()
            .await?;
            let project = root.join(&project_name)?;
            let info = CompileTimeInfo::new(Environment::new(ExecutionEnvironment::NodeJsLambda(
                NodeJsEnvironment::default().resolved_cell(),
            )))
            .to_resolved()
            .await?;
            let authoring = FileSource::new(project.join("authoring.mjs")?)
                .to_resolved()
                .await?;
            for injected in [false, true] {
                let options = crate::testing::test_module_options_context(
                    ModuleOptionsContext::default().cell(),
                    false,
                    *turbo_tasks::ResolvedVc::upcast(authoring),
                    injected,
                    false,
                )
                .to_resolved()
                .await?;
                assert_eq!(
                    options.await?.ecmascript.test_injected_commonjs_exports,
                    injected
                );
                let context = ModuleAssetContext::new(
                    TransitionOptions::default().cell(),
                    *info,
                    *options,
                    ResolveOptionsContext::default().cell(),
                    Layer::new(rcstr!("test-injected-commonjs-producer")),
                )
                .to_resolved()
                .await?;
                for (request, ordinary_cjs, injected_cjs, leaf) in [
                    ("./plain.mjs", false, true, true),
                    ("./shadow.mjs", false, false, true),
                    ("./named.mjs", false, false, true),
                    ("./marker.mjs", false, false, true),
                    ("./dynamic.mjs", false, false, true),
                    ("./require.mjs", false, false, true),
                    ("./plain.cjs", true, true, true),
                    ("./nonleaf.cjs", true, true, false),
                ] {
                    let origin = PlainResolveOrigin::new(
                        Vc::upcast(*context),
                        project.join("entry.test.mjs")?,
                    );
                    let resolved = esm_resolve(
                        Vc::upcast(origin),
                        Request::parse_string(request.into()),
                        EcmaScriptModulesReferenceSubType::Import,
                        ResolveErrorMode::Ignore,
                        None,
                    )
                    .await?;
                    let modules = resolved.await?.primary_modules().await?;
                    assert_eq!(modules.len(), 1, "{injected}: {request}");
                    let full = crate::testing::commonjs_full_owner(modules[0])
                        .await?
                        .context("actual full analysis owner")?;
                    assert_eq!(
                        turbo_tasks::ResolvedVc::upcast::<Box<dyn turbopack_core::module::Module>>(
                            full
                        ),
                        modules[0]
                    );
                    let commonjs =
                        matches!(*full.get_exports().await?, EcmascriptExports::CommonJs(_));
                    assert_eq!(
                        commonjs,
                        if injected { injected_cjs } else { ordinary_cjs },
                        "{injected}: {request}"
                    );
                    let namespace =
                        crate::testing::commonjs_leaf_promise_namespace(modules[0], true).await?;
                    assert_eq!(
                        namespace.is_some(),
                        commonjs && leaf,
                        "{injected}: {request}: namespace producer"
                    );
                    assert!(
                        crate::testing::commonjs_leaf_promise_namespace(modules[0], false)
                            .await?
                            .is_none()
                    );
                    if let Some(namespace) = namespace {
                        let namespace = namespace.await?;
                        assert_eq!(namespace.module, modules[0]);
                        assert_eq!(namespace.kind, turbopack_core::module_graph::runtime_import_demands::RuntimeImportNamespaceKind::CommonJsLeafPromise);
                        assert!(namespace.export_order.is_empty());
                    }
                    let analysis = full.analyze().await?;
                    assert!(analysis.successful, "{injected}: {request}");
                    if request == "./plain.mjs" {
                        assert!(
                            primary_chunkable_referenced_modules(*modules[0], false, false)
                                .await?
                                .is_empty()
                        );
                        let bound_module = analysis
                            .code_generation
                            .await?
                            .code_gens
                            .iter()
                            .filter(|code| matches!(code, CodeGen::MemberReplacement(_)))
                            .count();
                        assert_eq!(
                            bound_module,
                            usize::from(injected),
                            "actual injected module binding"
                        );
                        let consumer = context
                            .process(
                                Vc::upcast(FileSource::new(project.join("consumer.mjs")?)),
                                ReferenceType::EcmaScriptModules(
                                    EcmaScriptModulesReferenceSubType::Undefined,
                                ),
                            )
                            .module()
                            .to_resolved()
                            .await?;
                        let readsites =
                            primary_chunkable_referenced_modules(*consumer, false, false).await?;
                        let mut observed_references = Vec::new();
                        for (reference, resolved) in readsites.iter() {
                            observed_references.push((
                                reference.to_string().await?.to_string(),
                                resolved.modules.len(),
                            ));
                        }
                        assert_eq!(
                            readsites.len(),
                            3,
                            "actual static and dynamic consumer references: \
                             {observed_references:?}"
                        );
                        let mut static_count = 0;
                        let mut dynamic_count = 0;
                        for (reference, resolved) in readsites.iter() {
                            assert_eq!(resolved.modules.as_slice(), [modules[0]]);
                            static_count += usize::from(
                                turbo_tasks::ResolvedVc::try_downcast_type::<EsmAssetReference>(
                                    *reference,
                                )
                                .is_some(),
                            );
                            dynamic_count +=
                                usize::from(
                                    turbo_tasks::ResolvedVc::try_downcast_type::<
                                        EsmAsyncAssetReference,
                                    >(*reference)
                                    .is_some(),
                                );
                        }
                        // Static evaluation and the namespace binding have separate references.
                        assert_eq!((static_count, dynamic_count), (2, 1));
                    }
                }
                if injected {
                    for (free_var, root_name, member, eligible) in [
                        (false, "module", false, false),
                        (false, "module", true, false),
                        (false, "exports", false, false),
                        (true, "module", false, false),
                        (true, "exports", true, false),
                        (false, "unrelated", true, true),
                    ] {
                        let mut key = vec![DefinableNameSegment::Name(root_name.into())];
                        if member {
                            key.push(DefinableNameSegment::Name("exports".into()));
                        }
                        let original = info.await?;
                        let mut defines = original.defines.owned().await?;
                        let mut free_vars = original.free_var_references.owned().await?;
                        if free_var {
                            free_vars.insert(key, CompileTimeDefineValue::Null.into());
                        } else {
                            defines.insert(key, CompileTimeDefineValue::Null);
                        }
                        let authority = CompileTimeInfo {
                            defines: CompileTimeDefines(defines).resolved_cell(),
                            free_var_references: FreeVarReferences(free_vars).resolved_cell(),
                            ..(*original).clone()
                        }
                        .resolved_cell();
                        let defined_context = ModuleAssetContext::new(
                            TransitionOptions::default().cell(),
                            *authority,
                            *options,
                            ResolveOptionsContext::default().cell(),
                            Layer::new(rcstr!("test-injected-commonjs-defined-authority")),
                        )
                        .to_resolved()
                        .await?;
                        let origin = PlainResolveOrigin::new(
                            Vc::upcast(*defined_context),
                            project.join("entry.test.mjs")?,
                        );
                        let resolved = esm_resolve(
                            Vc::upcast(origin),
                            Request::parse_string("./plain.mjs".into()),
                            EcmaScriptModulesReferenceSubType::Import,
                            ResolveErrorMode::Ignore,
                            None,
                        )
                        .await?;
                        let modules = resolved.await?.primary_modules().await?;
                        assert_eq!(modules.len(), 1);
                        let full = crate::testing::commonjs_full_owner(modules[0])
                            .await?
                            .context("defined actual full owner")?;
                        assert_eq!(
                            matches!(*full.get_exports().await?, EcmascriptExports::CommonJs(_)),
                            eligible,
                            "existing compiler authority: {free_var}/{root_name}/{member}"
                        );
                        assert_eq!(
                            crate::testing::commonjs_leaf_promise_namespace(modules[0], true)
                                .await?
                                .is_some(),
                            eligible
                        );
                    }
                }
            }
            Ok(())
        }
        let repository = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .context("crates directory")?
            .parent()
            .context("repository directory")?;
        let directory = tempfile::Builder::new()
            .prefix(".next-test-injected-cjs-")
            .tempdir_in(repository)?;
        for (file, source) in [
            ("package.json", "{\"private\":true,\"type\":\"module\"}\n"),
            ("authoring.mjs", "export {};\n"),
            ("entry.test.mjs", "export {};\n"),
            (
                "consumer.mjs",
                "import * as value from './plain.mjs';globalThis.value=value;export function \
                 later(){return import('./plain.mjs')}\n",
            ),
            ("nonleaf.cjs", "module.exports=require('./plain.cjs');\n"),
            (
                "plain.mjs",
                "const value=Promise.resolve(1);module.exports=value;\n",
            ),
            (
                "plain.cjs",
                "const value=Promise.resolve(1);module.exports=value;\n",
            ),
            (
                "shadow.mjs",
                "const module={};module.exports=Promise.resolve(1);\n",
            ),
            (
                "named.mjs",
                "export const named=1;module.exports=Promise.resolve(1);\n",
            ),
            (
                "marker.mjs",
                "export {};module.exports=Promise.resolve(1);\n",
            ),
            (
                "dynamic.mjs",
                "const value=import('./plain.mjs');module.exports=value;\n",
            ),
            (
                "require.mjs",
                "const value=require('./plain.cjs');module.exports=value;\n",
            ),
        ] {
            std::fs::write(directory.path().join(file), source)?;
        }
        let disk_root = repository
            .canonicalize()?
            .to_str()
            .context("UTF-8 repository")?
            .into();
        let project_name = directory
            .path()
            .file_name()
            .context("fixture name")?
            .to_str()
            .context("UTF-8 fixture name")?
            .into();
        let tasks = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tasks
            .run_once(async move {
                operation(disk_root, project_name)
                    .read_strongly_consistent()
                    .await
            })
            .await?;
        Ok(())
    }
    #[test]
    fn source_file_url_admission_uses_the_actual_node_entry_profile() {
        let entry = || crate::testing::TestEntryOptions {
            file: rcstr!("entry.test.mjs"),
            id: rcstr!("source-file-urls"),
            environment: rcstr!("node"),
            setup_files: vec![],
            snapshot_serializers: vec![],
            cohort_files: vec![],
            runtime_env: false,
            route: None,
            dependency_plan: false,
            browser_client: false,
            source_coverage: false,
            browser_source_coverage: false,
            preserve_coverage_sources: false,
            import_coverage_roles: false,
            tsconfig_input_revision: None,
            alias_finds: vec![],
        };
        assert!(crate::testing::test_entry_source_file_urls(&entry()));
        let mut configured = entry();
        configured.setup_files.push(rcstr!("setup.mjs"));
        configured
            .snapshot_serializers
            .push(rcstr!("serializer.mjs"));
        configured.runtime_env = true;
        assert!(crate::testing::test_entry_source_file_urls(&configured));
        for excluded in 0..9 {
            let mut actual = entry();
            match excluded {
                0 => actual.environment = rcstr!("rsc"),
                1 => actual.environment = rcstr!("jsdom"),
                2 => actual.browser_client = true,
                3 => actual.route = Some(rcstr!("/page")),
                4 => actual.cohort_files.push(rcstr!("other.test.mjs")),
                5 => actual.source_coverage = true,
                6 => actual.browser_source_coverage = true,
                7 => actual.preserve_coverage_sources = true,
                8 => actual.import_coverage_roles = true,
                _ => unreachable!(),
            }
            assert!(
                !crate::testing::test_entry_source_file_urls(&actual),
                "profile change {excluded}"
            );
        }
        let mut dependency_plan = entry();
        dependency_plan.dependency_plan = true;
        assert!(crate::testing::test_entry_source_file_urls(
            &dependency_plan
        ));
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn source_file_urls_keep_real_processed_calls_and_source_metadata() -> Result<()> {
        use swc_core::{
            common::{FileName, SourceMap},
            ecma::{
                ast::{
                    Callee, EsVersion, Expr, GetterProp, Lit, MemberProp, NewExpr, PropName, Stmt,
                },
                parser::{Syntax, parse_file_as_program},
                visit::{Visit, VisitWith},
            },
        };
        use turbo_tasks::ResolvedVc;
        use turbopack::module_options::EcmascriptOptionsContext;
        use turbopack_core::{chunk::ChunkingContext, condition::ContextCondition};
        use turbopack_ecmascript::{
            EcmascriptAnalyzableExt,
            references::esm::{UrlAssetReference, UrlRewriteBehavior},
        };
        use turbopack_nodejs::NodeJsChunkingContext;

        assert!(!EcmascriptOptionsContext::default().test_source_file_urls);
        assert!(!EcmascriptOptions::default().test_source_file_urls);

        #[derive(Debug, Default)]
        struct EmittedUrls {
            constructors: usize,
            metadata_bases: usize,
            lower_case_calls: usize,
            suffixes: Vec<String>,
            source_paths: Vec<String>,
        }
        impl Visit for EmittedUrls {
            fn visit_new_expr(&mut self, expression: &NewExpr) {
                if matches!(&*expression.callee, Expr::Ident(name) if name.sym == "URL") {
                    self.constructors += 1;
                    if let Some(arguments) = &expression.args
                        && let Some(path) = arguments.first()
                        && let Expr::Bin(path) = &*path.expr
                        && let Expr::Lit(Lit::Str(suffix)) = &*path.right
                    {
                        self.suffixes
                            .push(suffix.value.to_string_lossy().into_owned());
                    }
                    if let Some(arguments) = &expression.args
                        && let Some(base) = arguments.get(1)
                        && matches!(&*base.expr, Expr::Member(member)
                            if matches!(&member.prop, MemberProp::Ident(name) if name.sym == "url"))
                    {
                        self.metadata_bases += 1;
                    }
                }
                expression.visit_children_with(self);
            }
            fn visit_call_expr(&mut self, expression: &swc_core::ecma::ast::CallExpr) {
                if let Callee::Expr(callee) = &expression.callee
                    && matches!(&**callee, Expr::Member(member)
                        if matches!(&member.prop, MemberProp::Ident(name) if name.sym == "toLowerCase"))
                {
                    self.lower_case_calls += 1;
                }
                expression.visit_children_with(self);
            }
            fn visit_getter_prop(&mut self, getter: &GetterProp) {
                if matches!(&getter.key, PropName::Ident(name) if name.sym == "url")
                    && let Some(body) = &getter.function.body
                    && let [Stmt::Return(returned)] = body.stmts.as_slice()
                    && let Some(expression) = &returned.arg
                    && let Expr::Call(call) = &**expression
                    && let Callee::Expr(callee) = &call.callee
                    && matches!(&**callee, Expr::Member(member)
                        if matches!(&member.prop, MemberProp::Ident(name) if name.sym == "F")
                            && matches!(&*member.obj, Expr::Ident(name) if name.sym == "__turbopack_context__"))
                    && let [path] = call.args.as_slice()
                    && let Expr::Lit(Lit::Str(path)) = &*path.expr
                {
                    self.source_paths
                        .push(path.value.to_string_lossy().into_owned());
                }
                getter.visit_children_with(self);
            }
        }
        fn emitted_urls(code: &str) -> EmittedUrls {
            let map = SourceMap::default();
            let file = map.new_source_file(
                FileName::Custom("actual-source-file-url-output.mjs".into()).into(),
                code.to_owned(),
            );
            let mut errors = vec![];
            let program = parse_file_as_program(
                &file,
                Syntax::Es(Default::default()),
                EsVersion::EsNext,
                None,
                &mut errors,
            )
            .expect("actual emitted source-file URL module must parse");
            assert!(errors.is_empty(), "{errors:?}");
            let mut observed = EmittedUrls::default();
            program.visit_with(&mut observed);
            observed
        }

        #[turbo_tasks::function(operation, root)]
        async fn operation(disk_root: RcStr) -> Result<()> {
            let root =
                DiskFileSystem::new(rcstr!("node-source-file-urls"), Vc::cell(disk_root.clone()))
                    .root()
                    .owned()
                    .await?;
            let foreign =
                DiskFileSystem::new(rcstr!("additional-source-file-urls"), Vc::cell(disk_root))
                    .root()
                    .owned()
                    .await?;
            assert_ne!(root.fs, foreign.fs, "real named filesystem identities");
            let authoring = FileSource::new(root.join("authoring.mjs")?)
                .to_resolved()
                .await?;
            for (label, enabled, foreign_source, has_cwd, rewrite, expected_assets) in [
                ("enabled", true, false, true, UrlRewriteBehavior::Full, 0),
                (
                    "ordinary-full",
                    false,
                    false,
                    true,
                    UrlRewriteBehavior::Full,
                    4,
                ),
                (
                    "ordinary-relative",
                    false,
                    false,
                    true,
                    UrlRewriteBehavior::Relative,
                    4,
                ),
                (
                    "ordinary-none",
                    false,
                    false,
                    true,
                    UrlRewriteBehavior::None,
                    4,
                ),
                (
                    "foreign-filesystem",
                    true,
                    true,
                    true,
                    UrlRewriteBehavior::Full,
                    4,
                ),
                (
                    "missing-cwd",
                    true,
                    false,
                    false,
                    UrlRewriteBehavior::Full,
                    4,
                ),
            ] {
                let source_root = if foreign_source { &foreign } else { &root };
                let environment = Environment::new(ExecutionEnvironment::NodeJsLambda(
                    NodeJsEnvironment {
                        cwd: ResolvedVc::cell(
                            has_cwd.then(|| root.join("working-directory").unwrap()),
                        ),
                        ..Default::default()
                    }
                    .resolved_cell(),
                ))
                .to_resolved()
                .await?;
                let info = CompileTimeInfo::new(*environment).to_resolved().await?;
                let nested = ModuleOptionsContext {
                    ecmascript: EcmascriptOptionsContext {
                        esm_url_rewrite_behavior: Some(rewrite),
                        ..Default::default()
                    },
                    ..Default::default()
                }
                .resolved_cell();
                let options = crate::testing::test_module_options_context(
                    ModuleOptionsContext {
                        ecmascript: EcmascriptOptionsContext {
                            esm_url_rewrite_behavior: Some(rewrite),
                            ..Default::default()
                        },
                        rules: vec![(ContextCondition::InDirectory("nested".into()), nested)],
                        ..Default::default()
                    }
                    .cell(),
                    false,
                    *ResolvedVc::upcast(authoring),
                    true,
                    enabled,
                )
                .to_resolved()
                .await?;
                assert_eq!(options.await?.ecmascript.test_source_file_urls, enabled);
                assert_eq!(
                    options.await?.rules[0]
                        .1
                        .await?
                        .ecmascript
                        .test_source_file_urls,
                    enabled
                );
                let context = ModuleAssetContext::new(
                    TransitionOptions::default().cell(),
                    *info,
                    *options,
                    ResolveOptionsContext::default().cell(),
                    Layer::new(label.into()),
                );
                let chunking: Vc<Box<dyn ChunkingContext>> = Vc::upcast(
                    NodeJsChunkingContext::builder(
                        root.clone(),
                        root.join("output")?,
                        rcstr!(".."),
                        root.join("output/client")?,
                        root.join("output/chunks")?,
                        root.join("output/assets")?,
                        environment,
                        serde_json::from_str(r#""Development""#)?,
                    )
                    .build(),
                );
                for file in ["source space#é/spec.mjs", "nested/helper.mjs"] {
                    let module = context
                        .process(
                            Vc::upcast(FileSource::new(source_root.join(file)?)),
                            ReferenceType::EcmaScriptModules(
                                EcmaScriptModulesReferenceSubType::Undefined,
                            ),
                        )
                        .module()
                        .to_resolved()
                        .await?;
                    let full = crate::testing::commonjs_full_owner(module)
                        .await?
                        .context("actual processed URL module")?;
                    assert_eq!(full.await?.options.await?.test_source_file_urls, enabled);
                    let analysis = full.analyze();
                    assert!(analysis.await?.successful, "{label}/{file}");
                    let assets = analysis
                        .references()
                        .await?
                        .iter()
                        .filter(|reference| {
                            ResolvedVc::try_downcast_type::<UrlAssetReference>(**reference)
                                .is_some()
                        })
                        .count();
                    assert_eq!(assets, expected_assets, "actual references {label}/{file}");
                    let generations = analysis.await?.code_generation.await?;
                    assert_eq!(
                        generations
                            .code_gens
                            .iter()
                            .filter(|generation| matches!(
                                generation,
                                CodeGen::UrlAssetReferenceCodeGen(_)
                            ))
                            .count(),
                        expected_assets,
                        "actual rewrites {label}/{file}"
                    );
                    assert_eq!(
                        generations
                            .code_gens
                            .iter()
                            .filter(|generation| matches!(
                                generation,
                                CodeGen::ImportMetaBinding(_)
                            ))
                            .count(),
                        1,
                        "actual source metadata owner {label}/{file}"
                    );
                    if expected_assets == 0 {
                        // This is actual module_content output from the normal processing,
                        // analysis, scope-hoisting and Node chunking path, not synthesized code.
                        let content = full.module_content(chunking, None).await?;
                        let code = content.inner_code.to_str()?;
                        let actual = emitted_urls(&code);
                        assert_eq!(actual.constructors, 4, "{label}/{file}: {code}");
                        assert_eq!(actual.metadata_bases, 4, "{label}/{file}: {code}");
                        assert_eq!(actual.lower_case_calls, 4, "{label}/{file}: {code}");
                        assert_eq!(
                            actual.suffixes,
                            [".value.txt", ".hold.txt", ".release.txt", ".cleanup.txt"],
                            "{label}/{file}: {code}"
                        );
                        assert_eq!(actual.source_paths, [file], "{label}/{file}: {code}");
                    }
                }
            }
            Ok(())
        }
        let directory = tempfile::tempdir()?;
        for name in ["source space#é", "nested", "working-directory"] {
            std::fs::create_dir(directory.path().join(name))?;
        }
        let subject =
            "const label=globalThis.label;export const source=import.meta.url;export const \
             file=new URL('./'+label.toLowerCase()+'.value.txt',import.meta.url);export function \
             controls(){return [new URL('./'+label.toLowerCase()+'.hold.txt',import.meta.url),new \
             URL('./'+label.toLowerCase()+'.release.txt',import.meta.url),new \
             URL('./'+label.toLowerCase()+'.cleanup.txt',import.meta.url)]}";
        for (file, source) in [
            ("package.json", "{\"type\":\"module\"}"),
            ("authoring.mjs", "export {}"),
            ("source space#é/spec.mjs", subject),
            ("nested/helper.mjs", subject),
        ] {
            std::fs::write(directory.path().join(file), source)?;
        }
        // No value/hold/release/cleanup file exists: construction is a runtime
        // operation and must not acquire a compiler asset dependency.
        let disk_root = directory
            .path()
            .canonicalize()?
            .to_str()
            .context("UTF-8 source URL fixture")?
            .into();
        let tasks = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tasks
            .run_once(async move { operation(disk_root).read_strongly_consistent().await })
            .await?;
        Ok(())
    }

    #[test]
    fn production_unmock_candidate_keeps_one_real_retained_pair_shape() {
        let source = "import{vi}from'vitest';vi.unmock('package');vi.mock('package',()=>({value:\
                      5}));vi.doMock('package',()=>({value:73}));vi.importActual('package');vi.\
                      resetModules();vi.doUnmock('package');";
        let plan = crate::testing_mock_source::extract_test_mocks(source, "entry.mjs").unwrap();
        assert!(crate::testing::production_paired_native_actual_plan(&plan));
        for change in 0..9 {
            let mut plan =
                crate::testing_mock_source::extract_test_mocks(source, "entry.mjs").unwrap();
            match change {
                0 => plan.unmocks[0].start = usize::MAX,
                1 => plan.unmocks[0].request = "alias".into(),
                2 => plan.runtime_requests.push("other".into()),
                3 => plan.actual_imports[0].request = "other".into(),
                4 => plan.declarations[0].spy = true,
                5 => plan.declarations[0].automatic = true,
                6 => plan.declarations[0].has_spread = true,
                7 => plan.reset_modules = false,
                8 => plan.actual_imports.clear(),
                _ => unreachable!(),
            }
            assert!(
                !crate::testing::production_paired_native_actual_plan(&plan),
                "change {change}"
            );
        }
    }
    #[test]
    fn production_later_unmock_keeps_exact_original_initial_shape() {
        let source = "import{vi}from'vitest';vi.mock('package',()=>({value:5}));vi.unmock('\
                      package');vi.doMock('package',()=>({value:73}));vi.importActual('package');\
                      vi.resetModules();";
        let plan = crate::testing_mock_source::extract_test_mocks(source, "entry.mjs").unwrap();
        assert!(crate::testing::production_paired_native_actual_plan(&plan));
        for change in 0..7 {
            let mut plan =
                crate::testing_mock_source::extract_test_mocks(source, "entry.mjs").unwrap();
            match change {
                0 => plan.unmocks[0].start = usize::MAX,
                1 => plan.unmocks[0].request = "alias".into(),
                2 => plan.runtime_requests.push("other".into()),
                3 => plan.actual_imports[0].request = "other".into(),
                4 => plan.declarations[0].spy = true,
                5 => plan.reset_modules = false,
                6 => plan.actual_imports.clear(),
                _ => unreachable!(),
            }
            assert!(
                !crate::testing::production_paired_native_actual_plan(&plan),
                "{change}"
            );
        }
    }
}

#[cfg(test)]
mod native_multi_target_assembly_tests {
    use super::{
        NativeUnmockTarget, native_unmock_group_matches, production_paired_native_actual_plan,
    };
    use crate::testing_mock_source::extract_test_mocks;

    #[test]
    fn each_genuine_layout_keeps_the_production_paired_actual_candidate() {
        for source in [
            include_str!("../tests/fixtures/native-multi-target/both-survive-interleaved.mjs"),
            include_str!("../tests/fixtures/native-multi-target/a-cancelled-b-survives.mjs"),
            include_str!("../tests/fixtures/native-multi-target/a-survives-b-cancelled.mjs"),
            include_str!("../tests/fixtures/native-multi-target/both-cancelled-interleaved.mjs"),
            include_str!("../tests/fixtures/native-multi-target/mirror-before-between.mjs"),
        ] {
            let plan = extract_test_mocks(source, "entry.mjs").unwrap();
            assert!(production_paired_native_actual_plan(&plan));
        }
    }

    #[test]
    fn checks_registration_and_actual_link_totals_per_original() {
        for (retained, expected, registered, external, actual, expected_actual, valid) in [
            (true, 2, 2, true, 2, 2, true),
            (false, 0, 0, false, 2, 2, true),
            (true, 2, 1, true, 2, 2, false),
            (true, 2, 3, true, 2, 2, false),
            (true, 2, 2, false, 2, 2, false),
            (false, 0, 0, true, 2, 2, false),
            (false, 0, 1, false, 2, 2, false),
            (true, 0, 0, true, 2, 2, false),
            (true, 2, 2, true, 1, 2, false),
            (true, 2, 2, true, 0, 0, false),
            (false, 0, 0, false, 0, 0, false),
        ] {
            let target = NativeUnmockTarget {
                request: "package".into(),
                retained,
                surviving_factories: expected,
            };
            assert_eq!(
                native_unmock_group_matches(&target, registered, external, actual, expected_actual),
                valid
            );
        }
    }
}

#[cfg(test)]
mod native_hoisted_runtime_composition_tests {
    use crate::{testing::production_native_runtime_plan, testing_mock_source::extract_test_mocks};

    #[test]
    fn retains_measured_independent_native_factories_hoisting_and_reset() {
        let source = r####"import { test, expect, vi } from 'vitest'
import { createRequire } from 'node:module'
import { appendFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
const counts = vi.hoisted(() => ({ path: 0, os: 0 }))
vi.mock('node:path', () => { counts.path++; return { basename: () => 'unused-path-mock' } })
const row = (name, value) => appendFileSync(process.env.NEXT_MOCK_REQUIRE_ROWS, JSON.stringify({ name, ...value })+'\n')
test('a static mock leaves a CommonJS builtin require original and lazy', () => {
 const value = require('node:path')
 expect(value.basename('/one/two')).toBe('two')
 expect(counts.path).toBe(0)
 row('unused-static-require', { value: value.basename('/one/two'), factoryCalls: counts.path, stableAlias: value === require('path') })
})
test('runtime mocking changes ESM import while CommonJS require stays original', async () => {
 vi.doMock('node:os', () => { counts.os++; return { platform: () => 'runtime-platform' } })
 const value = require('node:os'), before = counts.os
 expect(value.platform()).toBe(process.platform)
 const mocked = await import('node:os')
 expect(mocked.platform()).toBe('runtime-platform')
 row('runtime-native-require', { requireValue: value.platform(), importedValue: mocked.platform(), before, factoryCalls: counts.os, stableAlias: value === require('os') })
})
test('module reset retains the actual required builtin object', async () => {
 const before = require('node:os')
 vi.resetModules()
 const after = require('node:os'), imported = await import('node:os')
 expect(after).toBe(before)
 expect(after.platform()).toBe(process.platform)
 expect(imported.platform()).toBe('runtime-platform')
 row('reset-native-require', { originalObjectHeld: before === after, requireValue: after.platform(), importedValue: imported.platform(), factoryCalls: counts.os, unusedPathCalls: counts.path })
})
"####;
        let plan = extract_test_mocks(source, "require.test.mjs").unwrap();
        assert_eq!(plan.declarations.len(), 1);
        assert_eq!(plan.declarations[0].request, "node:path");
        assert_eq!(plan.hoisted.len(), 1);
        assert_eq!(plan.hoisted[0].bindings, ["counts"]);
        assert_eq!(plan.runtime_requests, ["node:os"]);
        assert!(plan.reset_modules);
        assert!(production_native_runtime_plan(&plan));
        let independent = extract_test_mocks(
            "import {vi} from \
             'vitest';vi.mock('package',()=>({value:5}));vi.doMock('other',()=>({value:73}))",
            "independent.mjs",
        )
        .unwrap();
        assert_eq!(independent.declarations.len(), 1);
        assert_eq!(independent.declarations[0].request, "package");
        assert_eq!(independent.runtime_requests, ["other"]);
        assert!(production_native_runtime_plan(&independent));
    }

    #[test]
    fn retains_a_real_hoisted_owner_for_a_native_runtime_only_target() {
        let plan = extract_test_mocks(
            "import {vi} from 'vitest'; const value = vi.hoisted(() => ({calls:0})); \
             vi.doMock('node:os', () => ({platform: () => ++value.calls})); vi.resetModules()",
            "entry.mjs",
        )
        .unwrap();
        assert!(plan.declarations.is_empty());
        assert_eq!(plan.hoisted.len(), 1);
        assert_eq!(plan.hoisted[0].bindings, ["value"]);
        assert_eq!(plan.runtime_requests, ["node:os"]);
        assert!(production_native_runtime_plan(&plan));
    }

    #[test]
    fn leaves_compiled_relative_runtime_requests_out_of_the_native_candidate() {
        let plan = extract_test_mocks(
            "import {vi} from 'vitest'; vi.doMock('./dependency.mjs', () => ({value:1})); \
             vi.resetModules()",
            "entry.mjs",
        )
        .unwrap();
        assert!(!production_native_runtime_plan(&plan));
        assert!(
            extract_test_mocks(
                "import {vi} from 'vitest'; const value=vi.hoisted(() => 42); vi.resetModules()",
                "entry.mjs",
            )
            .is_err()
        );
    }
}
