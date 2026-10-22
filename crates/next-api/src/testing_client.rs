//! Explicit client test roots reuse real Next client resolution and chunking.
//! Ordinary browser application builds and Node application drivers are unchanged.

use std::collections::HashSet;

use anyhow::{Context, Result, bail};
use next_core::{
    app_structure::FileSystemPathVec,
    get_next_package,
    next_client::{
        ClientContextType, get_client_module_options_context, get_client_resolve_options_context,
    },
    util::load_next_js_template_no_imports,
};
use swc_core::ecma::{
    ast::{ArrowExpr, AwaitExpr, Function},
    visit::{Visit, VisitWith},
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{Completion, ResolvedVc, ValueToString, Vc, fxindexmap};
use turbo_tasks_fs::{
    File, FileContent, FileSystemPath,
    glob::{Glob, GlobOptions},
};
use turbo_tasks_hash::HashAlgorithm;
use turbopack::{
    ModuleAssetContext,
    module_options::{ModuleOptionsContext, RuleCondition, transition_rule::TransitionRule},
    transition::{FullContextTransition, TransitionOptions},
};
use turbopack_browser::ecmascript::is_ecmascript_bookkeeping_asset;
use turbopack_core::{
    asset::{Asset, AssetContent, no_hash_salt},
    chunk::{ChunkGroupResult, ChunkingContext, availability_info::AvailabilityInfo},
    compile_time_info::{CompileTimeInfo, DefinableNameSegment, FreeVarReferences},
    context::AssetContext,
    file_source::FileSource,
    ident::{AssetIdent, Layer},
    module::Module,
    module_graph::{
        GraphEntries,
        chunk_group_info::{ChunkGroup, ChunkGroupEntry, EntryHeuristics},
    },
    output::{OutputAsset, OutputAssets},
    reference::{ModuleReference, all_assets_from_entries},
    reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
    resolve::{
        ModuleResolveResultItem, ResolveResult,
        options::{ImportMap, ImportMapping, ResolvedMap},
    },
    source::Source,
    virtual_output::VirtualOutputAsset,
};
use turbopack_ecmascript::{
    EcmascriptModuleAsset, EcmascriptParsable, ImportMetaEnvRuntime,
    module_fragments::part::module::EcmascriptModulePartAsset,
    parse::ParseResult,
    references::{esm::EsmAssetReference, external_module::CachedExternalModule},
    side_effect_optimization::locals::module::EcmascriptModuleLocalsModule,
    transform::PresetEnvConfig,
};
use turbopack_resolve::resolve_options_context::ResolveOptionsContext;

use crate::{
    paths::{all_asset_paths, all_paths_in_root},
    project::Project,
    route::{Endpoint, EndpointOutput, EndpointOutputPaths, ModuleGraphs},
};

fn is_bare_node_global(segments: &[DefinableNameSegment]) -> bool {
    matches!(segments, [DefinableNameSegment::Name(name)] if matches!(name.as_str(), "process" | "Buffer"))
        || matches!(segments, [DefinableNameSegment::Name(name), DefinableNameSegment::TypeOf] if matches!(name.as_str(), "process" | "Buffer"))
}

/// Resolved-path platform seams apply only to this explicit test context. The
/// same collector/lifecycle/assertions run in the client, without Node imports.
#[turbo_tasks::function]
async fn resolve_context(
    base: Vc<ResolveOptionsContext>,
    project_path: FileSystemPath,
) -> Result<Vc<ResolveOptionsContext>> {
    let next = get_next_package(project_path.clone()).await?;
    let mut imports = ImportMap::empty();
    for (request, target) in [
        ("vitest", "dist/experimental/testing/client/vitest.js"),
        (
            "private-next-test-creator-scope",
            "dist/experimental/testing/client/async-context.js",
        ),
        (
            "@swc/helpers/_/_async_to_generator",
            "dist/experimental/testing/client/async-helper.js",
        ),
        (
            "@swc/helpers/_/_async_generator",
            "dist/experimental/testing/client/async-generator.js",
        ),
        (
            "@swc/helpers/_/_overload_yield",
            "dist/experimental/testing/client/overload-yield.js",
        ),
        (
            "vitest/browser",
            "dist/experimental/testing/client/browser-context.js",
        ),
        (
            "@vitest/browser/context",
            "dist/experimental/testing/client/browser-context.js",
        ),
        (
            "next/experimental/testing/browser",
            "dist/experimental/testing/client/unsupported-driver.js",
        ),
    ] {
        let target = next.join(target)?;
        if matches!(&*target.read().await?, FileContent::NotFound) {
            bail!("Next Browser Mode facade is missing: {}", target.path);
        }
        imports.insert_exact_alias(
            request,
            ImportMapping::Direct(
                ResolveResult::source(ResolvedVc::upcast(
                    FileSource::new(target).to_resolved().await?,
                ))
                .resolved_cell(),
            )
            .resolved_cell(),
        );
    }
    let context = crate::testing::test_resolve_options_context(base, project_path.clone(), false);
    let mut extended = context
        .with_extended_import_map(imports.cell())
        .owned()
        .await?;
    let mut mappings = match extended.resolved_map {
        Some(map) => map.await?.by_glob.clone(),
        None => vec![],
    };
    for (original, replacement) in [
        (
            "experimental/testing/client/engine-brand-contract.js",
            "experimental/testing/client/engine-brand-creator.js",
        ),
        (
            "experimental/testing/assertions/assertion-platform.js",
            "experimental/testing/client/assertion-platform.js",
        ),
        (
            "experimental/testing/runner/async-context.js",
            "experimental/testing/client/async-context.js",
        ),
        (
            "experimental/testing/runner/collector-platform.js",
            "experimental/testing/client/collector-platform.js",
        ),
        (
            "experimental/testing/runner/invocation-platform.js",
            "experimental/testing/client/invocation-platform.js",
        ),
        (
            "experimental/testing/runner/task-path.js",
            "experimental/testing/client/task-path.js",
        ),
        (
            "experimental/testing/runner/annotations.js",
            "experimental/testing/client/annotations.js",
        ),
        (
            "experimental/testing/assertions/fake-timers.js",
            "experimental/testing/client/fake-timers.js",
        ),
        (
            "experimental/testing/assertions/snapshot-environment.js",
            "experimental/testing/client/snapshot-environment.js",
        ),
        (
            "compiled/next-test-primitives/index.js",
            "compiled/next-test-primitives/browser/index.js",
        ),
    ] {
        let replacement = next.join(&format!("dist/{replacement}"))?;
        if matches!(&*replacement.read().await?, FileContent::NotFound) {
            bail!(
                "Next Browser Mode platform module is missing: {}",
                replacement.path
            );
        }
        mappings.insert(
            0,
            (
                None,
                Glob::new(
                    format!("**/next/dist/{original}").into(),
                    GlobOptions::default(),
                )
                .to_resolved()
                .await?,
                ImportMapping::Direct(
                    ResolveResult::source(ResolvedVc::upcast(
                        FileSource::new(replacement).to_resolved().await?,
                    ))
                    .resolved_cell(),
                )
                .resolved_cell(),
            ),
        );
    }
    for (original, helper) in [
        (
            "**/@swc/helpers/esm/_async_to_generator.js",
            "async-helper.js",
        ),
        (
            "**/@swc/helpers/cjs/_async_to_generator.cjs",
            "async-helper.js",
        ),
        (
            "**/@swc/helpers/esm/_async_generator.js",
            "async-generator.js",
        ),
        (
            "**/@swc/helpers/cjs/_async_generator.cjs",
            "async-generator.js",
        ),
        (
            "**/@swc/helpers/esm/_overload_yield.js",
            "overload-yield.js",
        ),
        (
            "**/@swc/helpers/cjs/_overload_yield.cjs",
            "overload-yield.js",
        ),
    ] {
        let replacement = next.join(&format!("dist/experimental/testing/client/{helper}"))?;
        mappings.insert(
            0,
            (
                None,
                Glob::new(original.into(), GlobOptions::default())
                    .to_resolved()
                    .await?,
                ImportMapping::Direct(
                    ResolveResult::source(ResolvedVc::upcast(
                        FileSource::new(replacement).to_resolved().await?,
                    ))
                    .resolved_cell(),
                )
                .resolved_cell(),
            ),
        );
    }
    extended.resolved_map = Some(ResolvedMap { by_glob: mappings }.resolved_cell());
    for (_, nested) in &mut extended.rules {
        *nested = resolve_context(**nested, project_path.clone())
            .to_resolved()
            .await?;
    }
    Ok(extended.cell())
}

/// The authored graph lowers to generators; a separate owned context preserves
/// native await for the exact continuation bridge selected by its source rule.
#[turbo_tasks::function]
async fn module_options(
    options: Vc<ModuleOptionsContext>,
    lower_async: bool,
    project_path: FileSystemPath,
    framework_path: FileSystemPath,
) -> Result<Vc<ModuleOptionsContext>> {
    let mut options = options.owned().await?;
    options.ecmascript.lower_async_to_generator = lower_async;
    options.ecmascript.browser_creator_scope = lower_async;
    options.ecmascript.import_meta_env_runtime = lower_async.then(|| {
        ImportMetaEnvRuntime {
            request: rcstr!("next/dist/experimental/testing/client/env"),
            export: rcstr!("getBrowserEnv"),
        }
        .resolved_cell()
    });
    if lower_async {
        options.module_rules.push(
            next_core::get_browser_creator_scope_rule(project_path.clone(), framework_path.clone())
                .await?,
        );
    }
    options.ecmascript.inline_helpers = false;
    let mut preset = match options.ecmascript.preset_env_config {
        Some(config) => config.owned().await?,
        None => PresetEnvConfig::default(),
    };
    let required = [
        rcstr!("transform-async-to-generator"),
        rcstr!("transform-async-generator-functions"),
    ];
    if lower_async {
        let include = preset.include.get_or_insert_with(Vec::new);
        for name in &required {
            if !include.contains(name) {
                include.push(name.clone());
            }
        }
        if let Some(exclude) = &mut preset.exclude {
            exclude.retain(|name| !required.contains(name));
        }
        if let Some(skip) = &mut preset.skip {
            skip.retain(|name| !required.contains(name));
        }
    } else {
        if let Some(include) = &mut preset.include {
            include.retain(|name| !required.contains(name));
        }
        for excluded in [&mut preset.exclude, &mut preset.skip] {
            let excluded = excluded.get_or_insert_with(Vec::new);
            for name in &required {
                if !excluded.contains(name) {
                    excluded.push(name.clone());
                }
            }
        }
    }
    options.ecmascript.preset_env_config = Some(preset.resolved_cell());
    for (_, nested) in &mut options.rules {
        *nested = module_options(
            **nested,
            lower_async,
            project_path.clone(),
            framework_path.clone(),
        )
        .to_resolved()
        .await?;
    }
    Ok(options.cell())
}

#[derive(Default)]
struct ClientAsyncSyntax {
    functions: usize,
    awaits: usize,
}

impl Visit for ClientAsyncSyntax {
    fn visit_function(&mut self, function: &Function) {
        self.functions += usize::from(function.is_async);
        function.visit_children_with(self);
    }

    fn visit_arrow_expr(&mut self, arrow: &ArrowExpr) {
        self.functions += usize::from(arrow.is_async);
        arrow.visit_children_with(self);
    }

    fn visit_await_expr(&mut self, expression: &AwaitExpr) {
        self.awaits += 1;
        expression.visit_children_with(self);
    }
}

async fn full_client_module(
    module: ResolvedVc<Box<dyn Module>>,
) -> Result<Option<ResolvedVc<EcmascriptModuleAsset>>> {
    Ok(
        if let Some(full) = ResolvedVc::try_downcast_type::<EcmascriptModuleAsset>(module) {
            Some(full)
        } else if let Some(part) =
            ResolvedVc::try_downcast_type::<EcmascriptModulePartAsset>(module)
        {
            Some(part.await?.full_module)
        } else if let Some(locals) =
            ResolvedVc::try_downcast_type::<EcmascriptModuleLocalsModule>(module)
        {
            Some(locals.await?.module)
        } else {
            None
        },
    )
}

// Certify the actual resolved compiler assets and transformed syntax, rather
// than the intended context configuration. Unsupported imports retain issuers.
async fn validate_client_graph(
    entry: ResolvedVc<Box<dyn Module>>,
    native_continuation: &FileSystemPath,
    framework: &FileSystemPath,
) -> Result<()> {
    let mut queue = vec![entry];
    let mut visited = HashSet::new();
    let mut checked = HashSet::new();
    let mut bridge_seen = false;
    let mut creator_brand_seen = false;
    let creator_brand =
        framework.join("dist/experimental/testing/client/engine-brand-creator.js")?;
    let legacy_brand =
        framework.join("dist/experimental/testing/client/engine-brand-contract.js")?;
    let creator_helper = framework.join("dist/experimental/testing/client/async-context.js")?;
    while let Some(module) = queue.pop() {
        if !visited.insert(module) {
            continue;
        }
        let full = full_client_module(module).await?;
        if let Some(full) = full.filter(|full| checked.insert(*full)) {
            let source = full.await?.source;
            let path = source.ident().await?.path.clone();
            if path == legacy_brand {
                bail!("Browser creator graph refuses the legacy Promise classifier route");
            }
            if path == creator_brand {
                creator_brand_seen = true;
            }
            let native_bridge = &path == native_continuation;
            let lowered = full.await?.options.await?.lower_async_to_generator;
            if full.await?.options.await?.browser_creator_scope != !native_bridge {
                bail!(
                    "Browser creator certificate requires the actual native pass selection: {}",
                    path.path
                );
            }
            if lowered == native_bridge {
                bail!(
                    "Browser Mode continuation certificate requires {} async lowering for {}",
                    if native_bridge { "disabled" } else { "enabled" },
                    path.path
                );
            }
            let parsed = full.failsafe_parse().await?;
            let ParseResult::Ok { program, .. } = &*parsed else {
                bail!(
                    "Browser Mode continuation source cannot be certified: {}",
                    path.path
                );
            };
            next_core::validate_browser_creator_import(program)?;
            let mut syntax = ClientAsyncSyntax::default();
            program.visit_with(&mut syntax);
            if native_bridge {
                if syntax.functions != 1 || syntax.awaits != 1 {
                    bail!(
                        "Browser Mode native continuation must retain exactly one native async \
                         function and await: {}",
                        path.path
                    );
                }
                bridge_seen = true;
            } else if syntax.functions != 0 {
                bail!(
                    "Browser Mode authored continuation source retains native async functions: {}",
                    path.path
                );
            }
        }
        for reference in module.references().await?.iter() {
            let resolved = reference.resolve_reference().await?;
            for (_, item) in resolved.primary.iter() {
                if let ModuleResolveResultItem::External { name, .. } = item {
                    let issuer = module.ident().to_string().await?;
                    bail!(
                        "Browser Mode native graph contains unsupported external module {} \
                         imported by {}",
                        name,
                        issuer
                    );
                }
            }
            for dependency in resolved.primary_modules_raw_iter() {
                if let Some(external) =
                    ResolvedVc::try_downcast_type::<CachedExternalModule>(dependency)
                {
                    let external = external.await?;
                    let issuer = module.ident().to_string().await?;
                    bail!(
                        "Browser Mode native graph contains unsupported external module {} \
                         imported by {}",
                        external.request(),
                        issuer
                    );
                }
                if let Some(target) = full_client_module(dependency).await? {
                    let target_path = target.await?.source.ident().await?.path.clone();
                    if target_path == creator_brand {
                        let issuer = full_client_module(module).await?;
                        let Some(issuer) = issuer else {
                            bail!("Browser creator classifier requires a framework source issuer");
                        };
                        let issuer_path = issuer.await?.source.ident().await?.path.clone();
                        if framework.get_path_to(&issuer_path).is_none() {
                            bail!("Browser creator classifier refuses an authored/foreign issuer");
                        }
                    }
                    if target_path == creator_helper {
                        let issuer = full_client_module(module).await?;
                        let Some(issuer) = issuer else {
                            bail!("Browser creator certificate refuses a non-source helper issuer");
                        };
                        let issuer_path = issuer.await?.source.ident().await?.path.clone();
                        if framework.get_path_to(&issuer_path).is_none() {
                            let Some(issued) =
                                ResolvedVc::try_downcast_type::<EsmAssetReference>(*reference)
                            else {
                                bail!(
                                    "Browser creator certificate refuses an unissued private \
                                     helper reference"
                                );
                            };
                            if issued.await?.module != issuer
                                || issued.await?.request != "private-next-test-creator-scope"
                            {
                                bail!(
                                    "Browser creator certificate refuses an indirect private \
                                     helper request"
                                );
                            }
                            let parsed = issuer.failsafe_parse().await?;
                            let ParseResult::Ok { program, .. } = &*parsed else {
                                bail!("Browser creator certificate requires the actual issuer AST");
                            };
                            if !next_core::validate_browser_creator_import(program)? {
                                bail!(
                                    "Browser creator certificate requires an issued private import"
                                );
                            }
                        }
                    }
                }
                queue.push(dependency);
            }
        }
    }
    if !creator_brand_seen {
        bail!("Browser creator graph is missing its actual native Promise classifier");
    }
    if !bridge_seen {
        bail!(
            "Browser Mode continuation graph is missing its exact native bridge: {}",
            native_continuation.path
        );
    }
    Ok(())
}

#[turbo_tasks::function]
pub(crate) async fn context(project: ResolvedVc<Project>) -> Result<Vc<ModuleAssetContext>> {
    let config = project.next_config();
    if !config.experimental_swc_plugins().await?.is_empty()
        || !config
            .webpack_rules(project.project_path().owned().await?)
            .await?
            .is_empty()
    {
        bail!("Browser creator source admission cannot compose with custom loader/SWC transforms");
    }
    let base = project.client_compile_time_info().await?;
    let mut free_vars = base.free_var_references.owned().await?;
    // A client test runs in the actual browser global realm. Keep precise env
    // substitutions, but do not synthesize Node globals for guarded libraries.
    free_vars.retain(|name, _| !is_bare_node_global(name));
    let info = CompileTimeInfo {
        environment: base.environment,
        defines: base.defines,
        free_var_references: FreeVarReferences(free_vars).resolved_cell(),
        hot_module_replacement_enabled: false,
        import_meta_env_base_url: base.import_meta_env_base_url.clone(),
    }
    .cell();
    let base_options = crate::testing::test_module_options_context(
        get_client_module_options_context(
            project.project_path().owned().await?,
            project.execution_context(),
            info.environment(),
            ClientContextType::Other,
            project.next_mode(),
            project.next_config(),
            project.encryption_key(),
        ),
        false,
    );
    let resolve = resolve_context(
        get_client_resolve_options_context(
            project.project_path().owned().await?,
            ClientContextType::Other,
            project.next_mode(),
            project.next_config(),
            project.execution_context(),
        ),
        project.project_path().owned().await?,
    );
    let layer =
        Layer::new_with_user_friendly_name(rcstr!("next-test-client"), rcstr!("Browser Test"));
    let native_context = ModuleAssetContext::new(
        TransitionOptions::default().cell(),
        info,
        module_options(
            base_options,
            false,
            project.project_path().owned().await?,
            get_next_package(project.project_path().owned().await?).await?,
        ),
        resolve,
        layer.clone(),
    )
    .to_resolved()
    .await?;
    let native_continuation = get_next_package(project.project_path().owned().await?)
        .await?
        .join("dist/experimental/testing/client/native-continuation.js")?;
    let transitions = TransitionOptions {
        transition_rules: vec![TransitionRule::new_all(
            RuleCondition::ResourcePathEquals(native_continuation),
            ResolvedVc::upcast(
                FullContextTransition::new(*native_context)
                    .to_resolved()
                    .await?,
            ),
        )],
        ..Default::default()
    }
    .cell();
    Ok(ModuleAssetContext::new(
        transitions,
        info,
        module_options(
            base_options,
            true,
            project.project_path().owned().await?,
            get_next_package(project.project_path().owned().await?).await?,
        ),
        resolve,
        layer,
    ))
}

/// Carry the selected source through existing directory-context rules. The
/// ECMAScript asset compares this target with its actual origin, so sibling
/// dependencies retain their original module format.
#[turbo_tasks::function]
async fn entry_module_options(
    options: Vc<ModuleOptionsContext>,
    path: FileSystemPath,
) -> Result<Vc<ModuleOptionsContext>> {
    let mut options = options.owned().await?;
    options.ecmascript.browser_test_entry = Some(path.clone().resolved_cell());
    for (_, nested) in &mut options.rules {
        *nested = entry_module_options(**nested, path.clone())
            .to_resolved()
            .await?;
    }
    Ok(options.cell())
}

#[turbo_tasks::value]
pub(crate) struct ClientTestEndpoint {
    pub project: ResolvedVc<Project>,
    pub path: FileSystemPath,
    pub id: RcStr,
    pub setup_paths: Vec<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl ClientTestEndpoint {
    #[turbo_tasks::function]
    pub fn new(
        project: ResolvedVc<Project>,
        path: FileSystemPath,
        id: RcStr,
        setup_paths: Vec<FileSystemPath>,
    ) -> Vc<Self> {
        Self {
            project,
            path,
            id,
            setup_paths,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn entry_module(self: Vc<Self>) -> Result<Vc<Box<dyn Module>>> {
        let this = self.await?;
        let base_context = this.project.client_test_context().to_resolved().await?;
        let base = base_context.await?;
        let entry_context = ModuleAssetContext::new(
            *base.transitions,
            *base.compile_time_info,
            entry_module_options(*base.module_options_context, this.path.clone()),
            *base.resolve_options_context,
            base.layer.clone(),
        )
        .to_resolved()
        .await?;
        let prepared = crate::testing::prepare_browser_test_module(
            this.project,
            &this.path,
            &this.id,
            entry_context,
        )
        .await?;
        if prepared.module_reset {
            bail!(
                "Browser Mode module cache resets and runtime mock registration are not \
                 implemented"
            );
        }
        let context = *prepared.context;
        let module = context
            .process(
                *prepared.source,
                ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
            )
            .module()
            .to_resolved()
            .await?;
        let mut internal_assets = fxindexmap! { rcstr!("INNER_TEST_MODULE") => module };
        let mock_runtime = if let Some(registration) = prepared.registration {
            internal_assets.insert(rcstr!("INNER_TEST_MOCKS"), registration);
            "moduleMocks = { initialize: onLateFailure => \
             require('next/dist/experimental/testing/mocking/runtime').\
             initializeModuleMocking({onLateFailure, captureAutomock: () => \
             require('next/dist/experimental/testing/runner').getAssertionRuntime().\
             captureFileMockObject()}), register: () => require(/*turbopackChunkingType: shared*/ \
             'INNER_TEST_MOCKS') };"
        } else {
            ""
        };
        let mut setup_loads = String::new();
        for (index, path) in this.setup_paths.iter().enumerate() {
            let name = format!("INNER_TEST_SETUP_{index}");
            let module = prepared
                .setup_context
                .process(
                    Vc::upcast(FileSource::new(path.clone())),
                    ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
                )
                .module()
                .to_resolved()
                .await?;
            let source = crate::testing::setup_module_source(path.clone()).await?;
            let wrapper = prepared
                .setup_context
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
            setup_loads.push_str(&format!(
                "await require(/*turbopackChunkingType: shared*/ '{name}');\n"
            ));
        }
        let setup_runtime = if setup_loads.is_empty() {
            String::new()
        } else {
            format!("loadSetupModules = async () => {{\n{setup_loads}}};")
        };
        let source = load_next_js_template_no_imports(
            "client-test.js",
            this.project.project_path().owned().await?,
            &[("VAR_TEST_MODULE", "INNER_TEST_MODULE")],
            &[
                ("__next_test_client_mocks__", mock_runtime),
                ("__next_test_client_setup__", setup_runtime.as_str()),
            ],
            &[],
        )
        .await?;
        let source = crate::testing::test_entry_source(source).await?;
        Ok(context
            .process(
                source,
                ReferenceType::Internal(ResolvedVc::cell(internal_assets)),
            )
            .module())
    }

    #[turbo_tasks::function]
    async fn chunk_group(self: Vc<Self>) -> Result<Vc<ChunkGroupResult>> {
        let this = self.await?;
        let module = self.entry_module().to_resolved().await?;
        let native_continuation = get_next_package(this.project.project_path().owned().await?)
            .await?
            .join("dist/experimental/testing/client/native-continuation.js")?;
        validate_client_graph(
            module,
            &native_continuation,
            &get_next_package(this.project.project_path().owned().await?).await?,
        )
        .await?;
        Ok(this
            .project
            .client_chunking_context()
            .evaluated_chunk_group(
                AssetIdent::from_path(this.path.clone()).into_vc(),
                ChunkGroup::Entry(vec![module]),
                this.project.module_graph(*module),
                OutputAssets::empty(),
                AvailabilityInfo::root(),
            ))
    }

    #[turbo_tasks::function]
    async fn output_assets(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;
        let group = self.chunk_group().await?;
        let client_root = this.project.client_relative_path().owned().await?;
        let mut assets = group.assets.owned().await?;
        if let Some(params) = &group.chunk_group_bootstrap_params {
            // Shared-runtime production entries normally inline these params in the app HTML.
            // The isolated test document instead loads an owned script before the final runtime,
            // preserving the ordinary evaluated entry graph and its production chunk options.
            let bootstrap = VirtualOutputAsset::new(
                client_root.join(&format!("static/chunks/next-test-{}.bootstrap.js", this.id))?,
                AssetContent::file(
                    FileContent::Content(File::from(format!(
                        "(globalThis.TURBOPACK || (globalThis.TURBOPACK = \
                         [])).push([document.currentScript,{params}]);"
                    )))
                    .cell(),
                ),
            )
            .to_resolved()
            .await?;
            let runtime_index = assets
                .len()
                .checked_sub(1)
                .context("Shared Browser runtime asset is missing")?;
            assets.insert(runtime_index, ResolvedVc::upcast(bootstrap));
        }
        let mut scripts = Vec::new();
        let mut styles = Vec::new();
        for asset in assets.iter() {
            let path = asset.path().await?;
            let relative = client_root
                .get_path_to(&path)
                .context("Browser test bootstrap asset escaped client output root")?;
            if relative.ends_with(".js") {
                scripts.push(relative.to_string());
            } else if relative.ends_with(".css") {
                styles.push(relative.to_string());
            } else {
                bail!("Unsupported Browser Mode bootstrap asset: {relative}");
            }
        }
        if scripts.is_empty() {
            bail!("Browser test compiler emitted no evaluated client entry");
        }
        let metadata =
            serde_json::json!({"version":1,"asyncScope":"promise-continuations-v1","creatorScope":"synchronous-source-v1","creatorPromiseRoute":"native-engine-v1","scripts":scripts,"styles":styles}).to_string();
        assets.extend(group.referenced_assets.await?.iter().copied());
        let mut generated_scripts = Vec::new();
        let mut generated_paths = HashSet::new();
        for asset in all_assets_from_entries(Vc::cell(assets.clone()))
            .await?
            .iter()
        {
            if !is_ecmascript_bookkeeping_asset(*asset).await? {
                continue;
            }
            let path = asset.path().await?;
            let relative = client_root
                .get_path_to(&path)
                .context("Browser bookkeeping asset escaped client output root")?;
            if relative.is_empty() || !relative.ends_with(".js") {
                bail!("Browser bookkeeping asset must be a JavaScript output");
            }
            if !generated_paths.insert(relative.to_string()) {
                bail!("Duplicate Browser bookkeeping asset identity");
            }
            let hash = asset
                .content()
                .content_hash(no_hash_salt(), HashAlgorithm::Sha256Base64)
                .owned()
                .await?
                .context("Browser bookkeeping asset content is missing")?;
            let sha256 =
                data_encoding::HEXLOWER.encode(&data_encoding::BASE64.decode(hash.as_bytes())?);
            generated_scripts.push(serde_json::json!({
                "path": relative,
                "sha256": sha256,
                "role": "native-ecmascript-bookkeeping",
            }));
        }
        generated_scripts.sort_by(|left, right| left["path"].as_str().cmp(&right["path"].as_str()));
        assets.push(ResolvedVc::upcast(
            VirtualOutputAsset::new(
                this.project.node_root().await?.join(&format!(
                    "server/next-test/{}.browser-coverage.json",
                    this.id
                ))?,
                AssetContent::file(
                    FileContent::Content(File::from(
                        serde_json::json!({"version": 1, "scripts": generated_scripts}).to_string(),
                    ))
                    .cell(),
                ),
            )
            .to_resolved()
            .await?,
        ));
        assets.push(ResolvedVc::upcast(
            VirtualOutputAsset::new(
                this.project
                    .node_root()
                    .await?
                    .join(&format!("server/next-test/{}.client.json", this.id))?,
                AssetContent::file(FileContent::Content(File::from(metadata)).cell()),
            )
            .to_resolved()
            .await?,
        ));
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
        if this.project.next_mode().await?.is_production() {
            let plan = crate::testing::static_mock_plan(&this.path).await?;
            if !plan.is_empty() {
                if !this.setup_paths.is_empty() || !crate::testing::production_factory_plan(&plan) {
                    bail!("Production Browser mocks require isolated static relative factories");
                }
                assets.push(ResolvedVc::upcast(
                    VirtualOutputAsset::new(
                        this.project
                            .node_root()
                            .await?
                            .join(&format!("server/next-test/{}.metadata.json", this.id))?,
                        AssetContent::file(
                            FileContent::Content(File::from(
                                serde_json::json!({"moduleMocking": {
                                    "version": 1, "productionStaticFactory": 1
                                }})
                                .to_string(),
                            ))
                            .cell(),
                        ),
                    )
                    .to_resolved()
                    .await?,
                ));
            }
        }
        Ok(Vc::cell(assets))
    }
}

#[turbo_tasks::value_impl]
impl Endpoint for ClientTestEndpoint {
    #[turbo_tasks::function]
    async fn output(self: ResolvedVc<Self>) -> Result<Vc<EndpointOutput>> {
        let this = self.await?;
        let assets = self.output_assets();
        Ok(EndpointOutput {
            output_assets: assets.to_resolved().await?,
            output_paths: EndpointOutputPaths::NodeJs {
                // Existing snapshot transport carries a descriptor, never Node-executed code.
                server_entry_path: format!("server/next-test/{}.client.json", this.id).into(),
                server_hmr_entry_paths: vec![],
                server_paths: all_asset_paths(
                    assets,
                    this.project.node_root().owned().await?,
                    None,
                )
                .owned()
                .await?,
                client_paths: all_paths_in_root(
                    assets,
                    this.project.client_relative_path().owned().await?,
                )
                .owned()
                .await?,
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

#[cfg(test)]
mod tests {
    use anyhow::{Context, Result, bail};
    use swc_core::ecma::ast::Program;
    use turbo_rcstr::rcstr;
    use turbo_tasks::{ResolvedVc, TurboTasks, Vc};
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
    use turbo_tasks_fs::{DiskFileSystem, File, FileContent, FileSystem, FileSystemPath};
    use turbopack::{
        ModuleAssetContext,
        module_options::{
            EcmascriptOptionsContext, ModuleOptions, ModuleOptionsContext, ModuleRuleEffect,
            ModuleType,
        },
        transition::TransitionOptions,
    };
    use turbopack_core::{
        asset::AssetContent,
        compile_time_info::{
            CompileTimeInfo,
            DefinableNameSegment::{Name, TypeOf},
        },
        condition::ContextCondition,
        context::AssetContext,
        environment::{Environment, ExecutionEnvironment, NodeJsEnvironment},
        file_source::FileSource,
        ident::Layer,
        reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
        virtual_source::VirtualSource,
    };
    use turbopack_ecmascript::{
        EcmascriptAnalyzable, EcmascriptModuleAsset, EcmascriptOptions,
        chunk::{EcmascriptChunkPlaceable, EcmascriptExports},
        parse::ParseResult,
        references::node::PackageJsonReference,
    };
    use turbopack_resolve::resolve_options_context::ResolveOptionsContext;

    use super::{entry_module_options, full_client_module, is_bare_node_global};

    #[test]
    fn releases_only_bare_node_global_bindings() {
        assert!(is_bare_node_global(&[Name(rcstr!("process"))]));
        assert!(is_bare_node_global(&[Name(rcstr!("process")), TypeOf]));
        assert!(!is_bare_node_global(&[
            Name(rcstr!("process")),
            Name(rcstr!("env")),
            Name(rcstr!("NODE_ENV"))
        ]));
        assert!(is_bare_node_global(&[Name(rcstr!("Buffer"))]));
        assert!(is_bare_node_global(&[Name(rcstr!("Buffer")), TypeOf]));
        assert!(!is_bare_node_global(&[
            Name(rcstr!("Buffer")),
            Name(rcstr!("from"))
        ]));
        assert!(!is_bare_node_global(&[Name(rcstr!("window"))]));
    }
    async fn process_source(
        options: Vc<ModuleOptionsContext>,
        path: FileSystemPath,
    ) -> Result<ResolvedVc<EcmascriptModuleAsset>> {
        let environment = Environment::new(ExecutionEnvironment::NodeJsLambda(
            NodeJsEnvironment::default().resolved_cell(),
        ))
        .to_resolved()
        .await?;
        let info = CompileTimeInfo::new(*environment).to_resolved().await?;
        let context = ModuleAssetContext::new(
            TransitionOptions::default().cell(),
            *info,
            options,
            ResolveOptionsContext::default().cell(),
            Layer::new(rcstr!("browser-entry-grammar")),
        );
        let module = context
            .process(
                Vc::upcast(FileSource::new(path)),
                ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
            )
            .module()
            .to_resolved()
            .await?;
        full_client_module(module)
            .await?
            .context("Actual processing must retain a full ECMAScript module")
    }

    async fn options_for_source(
        context: Vc<ModuleOptionsContext>,
        path: FileSystemPath,
    ) -> Result<ResolvedVc<EcmascriptOptions>> {
        let source = ResolvedVc::upcast(
            VirtualSource::new(
                path.clone(),
                AssetContent::file(FileContent::Content(File::from("")).cell()),
            )
            .to_resolved()
            .await?,
        );
        let rules = ModuleOptions::new(
            path.parent(),
            context,
            ResolveOptionsContext::default().cell(),
        )
        .await?;
        let mut selected = None;
        for rule in &rules.rules {
            if rule
                .matches(
                    source,
                    &path,
                    &ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
                )
                .await?
            {
                for effect in rule.effects() {
                    if let ModuleRuleEffect::ModuleType(ModuleType::Ecmascript {
                        options, ..
                    }) = effect
                    {
                        selected = Some(*options);
                    }
                }
            }
        }
        selected.context("Expected the actual JavaScript module rule")
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn setup_namespace_wrapper_retains_the_original_authored_context() -> Result<()> {
        #[turbo_tasks::function(operation, root)]
        async fn operation(disk_root: turbo_rcstr::RcStr) -> Result<()> {
            let root = DiskFileSystem::new(rcstr!("browser-setup-wrapper"), Vc::cell(disk_root))
                .root()
                .owned()
                .await?;
            let path = root.join("nested/setup.mjs")?;
            let nested = ModuleOptionsContext {
                module_fragments_enabled: true,
                follow_reexports: true,
                ecmascript: EcmascriptOptionsContext {
                    lower_async_to_generator: true,
                    browser_creator_scope: true,
                    ..Default::default()
                },
                ..Default::default()
            }
            .resolved_cell();
            let options = ModuleOptionsContext {
                module_fragments_enabled: true,
                follow_reexports: true,
                rules: vec![(ContextCondition::InPath(root.join("nested")?), nested)],
                ..Default::default()
            }
            .resolved_cell();
            let environment = Environment::new(ExecutionEnvironment::NodeJsLambda(
                NodeJsEnvironment::default().resolved_cell(),
            ));
            let context = ModuleAssetContext::new(
                TransitionOptions::default().cell(),
                CompileTimeInfo::new(environment),
                *options,
                ResolveOptionsContext::default().cell(),
                Layer::new(rcstr!("next-test-client")),
            )
            .to_resolved()
            .await?;
            let authored = context
                .process(
                    Vc::upcast(FileSource::new(path.clone())),
                    ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
                )
                .module()
                .to_resolved()
                .await?;
            let original = full_client_module(authored)
                .await?
                .context("Authored module")?;
            let source = crate::testing::setup_module_source(path.clone()).await?;
            let wrapper = context
                .process(
                    *source,
                    ReferenceType::Internal(ResolvedVc::cell(turbo_tasks::fxindexmap! {
                        rcstr!("INNER_TEST_SETUP_SUBJECT") => authored
                    })),
                )
                .module()
                .to_resolved()
                .await?;
            let wrapper_module = full_client_module(wrapper)
                .await?
                .context("Whole synthetic wrapper")?;
            let wrapper_options = wrapper_module.await?.options.await?;
            assert!(wrapper_options.module_fragments_enabled);
            assert!(wrapper_options.follow_reexports);
            assert!(wrapper_options.lower_async_to_generator);
            assert!(wrapper_options.browser_creator_scope);
            assert!(original.await?.options.await?.module_fragments_enabled);
            assert!(original.await?.options.await?.follow_reexports);
            assert!(options.await?.module_fragments_enabled);
            assert!(options.await?.follow_reexports);
            assert!(nested.await?.module_fragments_enabled);
            assert!(nested.await?.follow_reexports);
            let original_context: ResolvedVc<Box<dyn AssetContext>> = ResolvedVc::upcast(context);
            assert_eq!(original.await?.asset_context, original_context);
            assert_eq!(wrapper_module.await?.asset_context, original_context);
            assert_eq!(
                wrapper_module
                    .await?
                    .inner_assets
                    .context("Internal setup reference")?
                    .await?
                    .get("INNER_TEST_SETUP_SUBJECT"),
                Some(&authored),
                "Wrapper must retain the exact processed setup"
            );
            Ok(())
        }
        let tasks = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        let directory = tempfile::tempdir()?;
        std::fs::create_dir(directory.path().join("nested"))?;
        std::fs::write(
            directory.path().join("nested/setup.mjs"),
            "export const value = 1;\n",
        )?;
        let disk_root = directory.path().canonicalize()?;
        let disk_root = disk_root.to_str().context("UTF-8 temporary path")?.into();
        tasks
            .run_once(async move { operation(disk_root).read_strongly_consistent().await })
            .await?;
        Ok(())
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn browser_entry_options_preserve_nested_precedence_and_dependencies() -> Result<()> {
        #[turbo_tasks::function(operation, root)]
        async fn operation(disk_root: turbo_rcstr::RcStr) -> Result<()> {
            let root = DiskFileSystem::new(rcstr!("browser-entry-options"), Vc::cell(disk_root))
                .root()
                .owned()
                .await?;
            let nested = root.join("nested")?;
            let selected = nested.join("entry.test.js")?;
            let first = ModuleOptionsContext {
                ecmascript: EcmascriptOptionsContext {
                    browser_creator_scope: true,
                    inline_helpers: true,
                    ..Default::default()
                },
                ..Default::default()
            }
            .resolved_cell();
            let second = ModuleOptionsContext {
                ecmascript: EcmascriptOptionsContext {
                    browser_creator_scope: true,
                    cjs_tree_shaking: true,
                    ..Default::default()
                },
                ..Default::default()
            }
            .resolved_cell();
            let base = ModuleOptionsContext {
                ecmascript: EcmascriptOptionsContext {
                    browser_creator_scope: true,
                    ..Default::default()
                },
                rules: vec![
                    (ContextCondition::InPath(nested.clone()), first),
                    (ContextCondition::InPath(nested.clone()), second),
                ],
                ..Default::default()
            }
            .resolved_cell();
            let decorated = entry_module_options(*base, selected.clone());
            for (path, is_entry, inline_helpers) in [
                (selected.clone(), true, true),
                (nested.join("dependency.js")?, false, true),
                (root.join("outside.js")?, false, false),
            ] {
                let rule_options = options_for_source(decorated, path.clone()).await?.await?;
                let module = process_source(decorated, path).await?;
                let actual = module.await?.options.await?;
                assert_eq!(actual.inline_helpers, rule_options.inline_helpers);
                assert_eq!(actual.inline_helpers, inline_helpers);
                assert!(actual.browser_creator_scope);
                assert!(
                    !actual.cjs_tree_shaking,
                    "The first nested rule must still win"
                );
                assert_eq!(
                    &*actual
                        .browser_test_entry
                        .context("Selected source target")?
                        .await?,
                    &selected
                );
                let parsed = module.await?.parse().await?.await?;
                let ParseResult::Ok { program, .. } = &*parsed else {
                    bail!("The actual processed source must parse");
                };
                assert_eq!(matches!(program, Program::Module(_)), is_entry);
            }
            let original = options_for_source(*base, selected).await?.await?;
            assert!(original.browser_test_entry.is_none());
            assert!(original.inline_helpers);
            assert!(base.await?.ecmascript.browser_test_entry.is_none());
            assert!(first.await?.ecmascript.browser_test_entry.is_none());
            Ok(())
        }
        let tasks = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        let directory = tempfile::tempdir()?;
        std::fs::create_dir(directory.path().join("nested"))?;
        std::fs::write(
            directory.path().join("package.json"),
            "{\"private\":true}\n",
        )?;
        for file in ["nested/entry.test.js", "nested/dependency.js", "outside.js"] {
            std::fs::write(directory.path().join(file), "globalThis.result = 1;\n")?;
        }
        let disk_root = directory.path().canonicalize()?;
        let disk_root = disk_root.to_str().context("UTF-8 temporary path")?.into();
        tasks
            .run_once(async move { operation(disk_root).read_strongly_consistent().await })
            .await?;
        Ok(())
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn browser_entry_grammar_keeps_dependency_and_explicit_formats() -> Result<()> {
        #[turbo_tasks::function(operation, root)]
        async fn operation(disk_root: turbo_rcstr::RcStr) -> Result<()> {
            let root = DiskFileSystem::new(rcstr!("browser-entry-grammar"), Vc::cell(disk_root))
                .root()
                .owned()
                .await?;
            let base = ModuleOptionsContext {
                ecmascript: EcmascriptOptionsContext {
                    browser_creator_scope: true,
                    ..Default::default()
                },
                ..Default::default()
            }
            .resolved_cell();
            let selected = root.join("entry.test.js")?;
            for (file, creator, entry, is_module, no_analysis_esm) in [
                ("entry.test.js", true, true, true, true),
                ("dependency.js", true, false, false, false),
                ("entry.test.cjs", true, true, true, true),
                ("dependency.cjs", true, false, false, false),
                ("dependency.mjs", true, false, true, true),
                ("commonjs/entry.test.js", true, true, true, true),
                ("commonjs/dependency.js", true, false, false, false),
                // Ordinary no-analysis codegen retains the specified Automatic type.
                ("module/dependency.js", true, false, true, false),
                ("entry.test.js", false, true, false, false),
            ] {
                let path = root.join(file)?;
                let options_context = if creator {
                    *base
                } else {
                    ModuleOptionsContext::default().cell()
                };
                let options_context = if entry {
                    entry_module_options(options_context, path.clone())
                } else {
                    entry_module_options(options_context, selected.clone())
                };
                let module = process_source(options_context, path).await?;
                let parsed = module.await?.parse().await?.await?;
                let ParseResult::Ok { program, .. } = &*parsed else {
                    bail!("The unchanged block-function subject must parse: {file}");
                };
                assert_eq!(matches!(program, Program::Module(_)), is_module, "{file}");
                let exports = module.get_exports().await?;
                assert_eq!(
                    matches!(&*exports, EcmascriptExports::EsmExports(_)),
                    is_module,
                    "Analysis must agree with grammar for {file}"
                );
                let references = module.analyze().references().await?;
                let mut package_paths = vec![];
                for reference in references.iter() {
                    if let Some(reference) =
                        ResolvedVc::try_downcast_type::<PackageJsonReference>(*reference)
                    {
                        package_paths.push(reference.await?.package_json.clone());
                    }
                }
                let package = if file.ends_with(".cjs") || file.ends_with(".mjs") {
                    None
                } else if file.starts_with("commonjs/") {
                    Some(root.join("commonjs/package.json")?)
                } else if file.starts_with("module/") {
                    Some(root.join("module/package.json")?)
                } else {
                    Some(root.join("package.json")?)
                };
                assert_eq!(
                    package_paths,
                    package.into_iter().collect::<Vec<_>>(),
                    "Analysis must retain actual package metadata for {file}"
                );
                let content = module.module_content_without_analysis(false).await?;
                assert_eq!(
                    content.is_esm, no_analysis_esm,
                    "No-analysis type for {file}"
                );
                // This field records directives; ESM factory strictness is separate.
                assert!(
                    !content.strict,
                    "The subject has no strict directive: {file}"
                );
            }
            Ok(())
        }
        let directory = tempfile::tempdir()?;
        let subject = "{ function block() {} } globalThis.result = typeof block;\n";
        std::fs::write(
            directory.path().join("package.json"),
            "{\"private\":true}\n",
        )?;
        for file in [
            "entry.test.js",
            "dependency.js",
            "entry.test.cjs",
            "dependency.cjs",
            "dependency.mjs",
        ] {
            std::fs::write(directory.path().join(file), subject)?;
        }
        for (name, kind) in [("commonjs", "commonjs"), ("module", "module")] {
            let path = directory.path().join(name);
            std::fs::create_dir(&path)?;
            std::fs::write(
                path.join("package.json"),
                format!("{{\"type\":\"{kind}\"}}\n"),
            )?;
            std::fs::write(path.join("entry.test.js"), subject)?;
            std::fs::write(path.join("dependency.js"), subject)?;
        }
        let disk_root = directory.path().canonicalize()?;
        let disk_root = disk_root.to_str().context("UTF-8 temporary path")?.into();
        let tasks = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tasks
            .run_once(async move { operation(disk_root).read_strongly_consistent().await })
            .await?;
        Ok(())
    }
}

#[cfg(test)]
mod browser_env_binding_tests {
    use anyhow::{Context, Result};
    use swc_core::{
        common::{FileName, SourceMap},
        ecma::{
            ast::{Callee, EsVersion, Expr, GetterProp, IfStmt, Lit, MemberProp, PropName, Stmt},
            parser::{Syntax, parse_file_as_program},
            visit::{Visit, VisitWith},
        },
    };
    use turbo_rcstr::rcstr;
    use turbo_tasks::{TurboTasks, Vc};
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
    use turbo_tasks_fs::{DiskFileSystem, FileSystem};
    use turbopack::{
        ModuleAssetContext,
        module_options::{EcmascriptOptionsContext, ModuleOptionsContext},
        transition::TransitionOptions,
    };
    use turbopack_browser::BrowserChunkingContext;
    use turbopack_core::{
        chunk::ChunkingContext,
        compile_time_info::CompileTimeInfo,
        context::AssetContext,
        environment::{BrowserEnvironment, Environment, ExecutionEnvironment, NodeJsEnvironment},
        file_source::FileSource,
        ident::Layer,
        module::Module,
        reference::ModuleReference,
        reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
    };
    use turbopack_ecmascript::{EcmascriptAnalyzableExt, ImportMetaEnvRuntime};
    use turbopack_resolve::resolve_options_context::ResolveOptionsContext;

    use crate::testing_client::full_client_module;

    #[derive(Debug, PartialEq, Eq)]
    enum EnvCondition {
        MutableDev,
        Constant(bool),
        Other,
    }

    #[derive(Debug, Default, PartialEq, Eq)]
    struct ImportMetaGetters {
        url: bool,
        hmr: bool,
        conditions: Vec<EnvCondition>,
    }

    fn env_condition(expression: &Expr) -> EnvCondition {
        match expression {
            Expr::Paren(parenthesized) => env_condition(&parenthesized.expr),
            Expr::Seq(sequence) => sequence
                .exprs
                .last()
                .map_or(EnvCondition::Other, |last| env_condition(last)),
            Expr::Member(member)
                if matches!(&member.prop, MemberProp::Ident(name) if name.sym == "DEV")
                    && matches!(&*member.obj, Expr::Member(env)
                        if matches!(&env.prop, MemberProp::Ident(name) if name.sym == "env")
                            && matches!(&*env.obj, Expr::Ident(_))) =>
            {
                EnvCondition::MutableDev
            }
            Expr::Lit(Lit::Bool(value)) => EnvCondition::Constant(value.value),
            Expr::Lit(Lit::Num(value)) => {
                EnvCondition::Constant(value.value != 0.0 && !value.value.is_nan())
            }
            _ => EnvCondition::Other,
        }
    }

    fn context_member(expression: &Expr, property: &str) -> bool {
        matches!(expression, Expr::Member(member)
            if matches!(&member.prop, MemberProp::Ident(name) if name.sym == property)
                && matches!(&*member.obj, Expr::Ident(name) if name.sym == "__turbopack_context__"))
    }

    impl Visit for ImportMetaGetters {
        fn visit_if_stmt(&mut self, statement: &IfStmt) {
            self.conditions.push(env_condition(&statement.test));
            statement.visit_children_with(self);
        }

        fn visit_getter_prop(&mut self, getter: &GetterProp) {
            if let PropName::Ident(name) = &getter.key
                && let Some(body) = &getter.function.body
                && let [Stmt::Return(returned)] = body.stmts.as_slice()
                && let Some(expression) = &returned.arg
            {
                if name.sym == "url"
                    && let Expr::Call(call) = &**expression
                    && let Callee::Expr(callee) = &call.callee
                    && context_member(callee, "F")
                {
                    self.url = true;
                }
                if name.sym == "turbopackHot"
                    && let Expr::Member(member) = &**expression
                    && matches!(&member.prop, MemberProp::Ident(name) if name.sym == "hot")
                    && context_member(&member.obj, "m")
                {
                    self.hmr = true;
                }
            }
            getter.visit_children_with(self);
        }
    }

    fn import_meta_getters(source: &str) -> ImportMetaGetters {
        let map = SourceMap::default();
        let file = map.new_source_file(
            FileName::Custom("emitted-env-module.mjs".into()).into(),
            source.to_string(),
        );
        let mut errors = Vec::new();
        let program = parse_file_as_program(
            &file,
            Syntax::Es(Default::default()),
            EsVersion::EsNext,
            None,
            &mut errors,
        )
        .expect("Actual emitted env module must parse");
        assert!(errors.is_empty(), "{errors:?}");
        let mut getters = ImportMetaGetters::default();
        program.visit_with(&mut getters);
        getters
    }

    #[test]
    fn emitted_import_meta_getters_are_structural_and_printer_independent() {
        let expected = ImportMetaGetters {
            url: true,
            hmr: true,
            ..Default::default()
        };
        for source in [
            "const meta={get url(){return __turbopack_context__.F('spec.mjs')},get \
             turbopackHot(){return __turbopack_context__.m.hot}};",
            "const meta = { get url () { return __turbopack_context__.F('spec.mjs'); }, get \
             turbopackHot () { return __turbopack_context__.m.hot; } };",
        ] {
            assert_eq!(import_meta_getters(source), expected);
        }
        for source in [
            "const text = \"get url () { return __turbopack_context__.F('spec.mjs') } get \
             turbopackHot () { return __turbopack_context__.m.hot }\";",
            "const meta={url:__turbopack_context__.F('spec.mjs'),turbopackHot:\
             __turbopack_context__.m.hot};",
        ] {
            assert_eq!(import_meta_getters(source), ImportMetaGetters::default());
        }
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn browser_env_binding_uses_processed_modules_and_keeps_direct_reads_mutable()
    -> Result<()> {
        #[turbo_tasks::function(operation, root)]
        async fn operation(disk_root: turbo_rcstr::RcStr) -> Result<()> {
            let root = DiskFileSystem::new(rcstr!("browser-env-binding"), Vc::cell(disk_root))
                .root()
                .owned()
                .await?;
            let leaf_path =
                root.join("node_modules/next/dist/experimental/testing/client/env.js")?;
            let alternate_path = root.join("node_modules/fixture-env-runtime/index.js")?;
            let browser_runtime = ImportMetaEnvRuntime {
                request: rcstr!("next/dist/experimental/testing/client/env"),
                export: rcstr!("getBrowserEnv"),
            }
            .resolved_cell();
            let alternate_runtime = ImportMetaEnvRuntime {
                request: rcstr!("fixture-env-runtime"),
                export: rcstr!("supplyEnv"),
            }
            .resolved_cell();
            for (label, creator, server, runtime, expected_path, expected_export) in [
                (
                    "browser-test",
                    true,
                    false,
                    Some(browser_runtime),
                    Some(leaf_path.clone()),
                    "getBrowserEnv",
                ),
                (
                    "generic-runtime",
                    false,
                    false,
                    Some(alternate_runtime),
                    Some(alternate_path.clone()),
                    "supplyEnv",
                ),
                ("ordinary-app", false, false, None, None, ""),
                ("ordinary-node", false, true, None, None, ""),
            ] {
                let execution = if server {
                    ExecutionEnvironment::NodeJsLambda(NodeJsEnvironment::default().resolved_cell())
                } else {
                    ExecutionEnvironment::Browser(
                        BrowserEnvironment {
                            dom: true,
                            web_worker: false,
                            service_worker: false,
                            browserslist_query: rcstr!("Chrome 130"),
                        }
                        .resolved_cell(),
                    )
                };
                let environment = Environment::new(execution).to_resolved().await?;
                let info = CompileTimeInfo::builder(environment)
                    .hot_module_replacement_enabled(true)
                    .import_meta_env_base_url(rcstr!("/env-base/"))
                    .build()
                    .await?
                    .resolved_cell();
                let context = ModuleAssetContext::new(
                    TransitionOptions::default().cell(),
                    *info,
                    ModuleOptionsContext {
                        ecmascript: EcmascriptOptionsContext {
                            browser_creator_scope: creator,
                            import_meta_env_runtime: runtime,
                            ..Default::default()
                        },
                        ..Default::default()
                    }
                    .cell(),
                    ResolveOptionsContext {
                        enable_node_modules: Some(root.clone()),
                        ..Default::default()
                    }
                    .cell(),
                    Layer::new(label.into()),
                );
                let chunking: Vc<Box<dyn ChunkingContext>> = Vc::upcast(
                    BrowserChunkingContext::builder(
                        root.clone(),
                        root.clone(),
                        rcstr!(""),
                        root.clone(),
                        root.join("chunks")?,
                        root.join("assets")?,
                        environment,
                        serde_json::from_str(r#""Development""#)?,
                    )
                    .hot_module_replacement()
                    .build(),
                );
                let mut leaf_modules = Vec::new();
                let mut imported_helper = None;
                for file in ["spec.mjs", "helper.mjs"] {
                    // This is the actual context.process path, including analysis and
                    // module_content's real chunking/scope-hoisting pipeline.
                    let full = if file == "spec.mjs" {
                        let module = context
                            .process(
                                Vc::upcast(FileSource::new(root.join(file)?)),
                                ReferenceType::EcmaScriptModules(
                                    EcmaScriptModulesReferenceSubType::Undefined,
                                ),
                            )
                            .module()
                            .to_resolved()
                            .await?;
                        full_client_module(module)
                            .await?
                            .context("Processed spec")?
                    } else {
                        imported_helper
                            .take()
                            .context("Actual helper from the spec's resolved import")?
                    };
                    let analysis = full.analyze();
                    assert!(analysis.await?.successful);
                    let mut selected = Vec::new();
                    for reference in analysis.references().await?.iter() {
                        for target in reference
                            .resolve_reference()
                            .await?
                            .primary_modules()
                            .await?
                            .iter()
                        {
                            let path = target.ident().await?.path.clone();
                            if path == leaf_path || path == alternate_path {
                                selected.push(*target);
                            }
                            if file == "spec.mjs" && path == root.join("helper.mjs")? {
                                imported_helper = full_client_module(*target).await?;
                            }
                        }
                    }
                    let content = full.module_content(chunking, None).await?;
                    let code = content.inner_code.to_str()?;
                    let getters = import_meta_getters(&code);
                    assert!(
                        getters.url,
                        "lazy import.meta.url for {label}/{file}: {code}"
                    );
                    assert!(getters.hmr, "HMR getter for {label}/{file}: {code}");
                    if let Some(expected_path) = &expected_path {
                        assert_eq!(selected.len(), 1, "One real env reference for {file}");
                        assert_eq!(&selected[0].ident().await?.path, expected_path);
                        leaf_modules.push(selected[0]);
                        assert!(
                            code.contains(expected_export),
                            "Actual configured getter for {file}: {code}"
                        );
                        assert_eq!(
                            getters.conditions,
                            vec![EnvCondition::MutableDev],
                            "Configured env must keep the actual DEV branch mutable for \
                             {label}/{file}: {code}"
                        );
                        for property in ["DEV", "CONFIGURED", "REMOVED"] {
                            assert!(
                                code.contains(&format!(".env.{property}")),
                                "Direct {property} must not fold: {code}"
                            );
                        }
                        assert!(
                            code.contains("alias.DEV"),
                            "Aliased env remains mutable: {code}"
                        );
                    } else {
                        assert!(selected.is_empty(), "No test env leaf in {label}");
                        assert!(
                            !code.contains("getBrowserEnv") && !code.contains("supplyEnv"),
                            "No configured env getter in {label}: {code}"
                        );
                        assert_eq!(
                            getters.conditions,
                            vec![EnvCondition::Constant(true)],
                            "Unconfigured env must keep existing DEV branch folding for \
                             {label}/{file}: {code}"
                        );
                    }
                }
                if runtime.is_some() {
                    assert_eq!(
                        leaf_modules[0], leaf_modules[1],
                        "Spec/helper resolve the same actual leaf module"
                    );
                }
            }
            Ok(())
        }
        let directory = tempfile::tempdir()?;
        let leaf = directory
            .path()
            .join("node_modules/next/dist/experimental/testing/client");
        std::fs::create_dir_all(&leaf)?;
        std::fs::write(
            directory.path().join("node_modules/next/package.json"),
            "{\"name\":\"next\",\"type\":\"module\"}\n",
        )?;
        // The native control proves ordinary resolution/binding identity. The actual
        // Browser env backend and literal genuine subjects have separate JS controls.
        std::fs::write(
            leaf.join("env.js"),
            "export function getBrowserEnv(defaults) { return defaults; }\n",
        )?;
        let alternate = directory.path().join("node_modules/fixture-env-runtime");
        std::fs::create_dir_all(&alternate)?;
        std::fs::write(
            alternate.join("package.json"),
            "{\"name\":\"fixture-env-runtime\",\"type\":\"module\",\"main\":\"index.js\"}\n",
        )?;
        std::fs::write(
            alternate.join("index.js"),
            "export function supplyEnv(defaults) { return defaults; }\n",
        )?;
        let subject = "const alias = import.meta.env; export const observed = \
                       [import.meta.env.DEV, import.meta.env.CONFIGURED, import.meta.env.REMOVED, \
                       alias.DEV, alias['CONFIGURED'], import.meta.url, \
                       import.meta.turbopackHot]; if (import.meta.env.DEV) globalThis.branch = \
                       'dev'; else globalThis.branch = 'other';\n";
        std::fs::write(
            directory.path().join("spec.mjs"),
            format!(
                "import {{ helper }} from './helper.mjs'; globalThis.helperEnv = \
                 helper();\n{subject}"
            ),
        )?;
        std::fs::write(
            directory.path().join("helper.mjs"),
            format!("export function helper() {{ return import.meta.env; }}\n{subject}"),
        )?;
        let disk_root = directory.path().canonicalize()?;
        let disk_root = disk_root.to_str().context("UTF-8 env control path")?.into();
        let tasks = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tasks
            .run_once(async move { operation(disk_root).read_strongly_consistent().await })
            .await?;
        Ok(())
    }
}
