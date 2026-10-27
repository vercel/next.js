use std::{borrow::Cow, collections::BTreeMap, sync::LazyLock};

use anyhow::{Context, Result, bail};
use bincode::{Decode, Encode};
use either::Either;
use itertools::Itertools;
use next_core::{
    get_next_package,
    next_client_reference::{CssClientReferenceModule, EcmascriptClientReferenceModule},
    next_manifests::{
        ActionManifestEntry, ActionManifestWorkerEntry, ActionManifestWorkerEntryDurability,
        ServerReferenceManifest,
    },
    root_param_getters_path,
    util::NextRuntime,
};
use smallvec::SmallVec;
use swc_core::{
    atoms::{Atom, atom},
    common::comments::Comments,
    ecma::{
        ast::{
            Decl, ExportSpecifier, Id, ModuleDecl, ModuleItem, ObjectLit, Program,
            PropOrSpread::Prop,
        },
        utils::find_pat_ids,
    },
};
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxIndexMap, FxIndexSet, NonLocalValue, ReadRef, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt,
    ValueToStringRef, Vc, turbofmt,
};
use turbo_tasks_fs::{self, File, FileContent, FileSystem, FileSystemPath, VirtualFileSystem};
use turbo_tasks_hash::{HashAlgorithm, deterministic_hash};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        AsyncModuleInfo, ChunkGroupResult, ChunkItem, ChunkableModule, ChunkingConfigs,
        ChunkingContext, ChunkingType, EntryChunkGroupResult, EvaluatableAsset, HmrChunkListSource,
        MinifyType, ModuleId, SourceMapSourceType, UnusedReferences, UrlBehavior,
        WorkerConfigurationOptions, availability_info::AvailabilityInfo,
        chunk_id_strategy::ModuleIdStrategy,
    },
    compile_time_info::CompileTimeDefineValue,
    context::AssetContext,
    emit_collect::{CollectingModule, EmittedModuleReference},
    environment::{ChunkLoading, Environment},
    file_source::FileSource,
    ident::AssetIdent,
    module::{Module, ModuleSideEffects, Modules},
    module_graph::{
        GraphTraversalAction, ModuleGraph, async_module_info::AsyncModulesInfo,
        binding_usage_info::ModuleExportUsage, chunk_group_info::ChunkGroupKey,
    },
    output::{OutputAsset, OutputAssets, OutputAssetsReference},
    reference::ModuleReferences,
    reference_type::ReferenceType,
    resolve::ModulePart,
    source::OptionSource,
};
use turbopack_ecmascript::{
    EcmascriptAnalyzable, EcmascriptParsable, EnvVarAccessMode, EnvVarInfo,
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemExt,
        EcmascriptChunkPlaceable, EcmascriptExports, ecmascript_chunk_item,
    },
    module_fragments::part::module::EcmascriptModulePartAsset,
    parse::ParseResult,
};

use crate::project::Project;

#[turbo_tasks::value]
pub(crate) struct ServerActionsManifest {
    pub loader: ResolvedVc<Box<dyn EvaluatableAsset>>,
    pub manifest: ResolvedVc<Box<dyn OutputAsset>>,
}

/// Scans the RSC entry point's full module graph looking for exported Server
/// Actions (identifiable by a magic comment in the transformed module's
/// output), and constructs a evaluatable "action loader" entry point and
/// manifest describing the found actions.
///
/// If Server Actions are not enabled, this returns an empty manifest and a None
/// loader.
#[turbo_tasks::function]
pub(crate) async fn create_server_actions_manifest(
    server_action_loader_modules: Vc<Modules>,
    project: Vc<Project>,
    node_root: FileSystemPath,
    page_name: RcStr,
    runtime: NextRuntime,
    module_graph: Vc<ModuleGraph>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<Vc<Box<dyn OutputAsset>>> {
    let actions = collect_actions(server_action_loader_modules, module_graph);

    let manifest = Vc::upcast(ServerActionManifestAsset::new(
        node_root,
        page_name,
        runtime,
        actions,
        module_graph,
        chunking_context,
        project,
    ));
    Ok(manifest)
}

#[turbo_tasks::function]
async fn collect_actions(
    server_action_loader_modules: Vc<Modules>,
    module_graph: Vc<ModuleGraph>,
) -> Result<Vc<AllActions>> {
    // This mirrors what the ServerActionCollectModule ends up chunking into the chunk.
    let collected_modules = module_graph.collected_modules();
    let server_action_loader_modules = server_action_loader_modules.await?;
    let [loader_module1, loader_module2] = &**server_action_loader_modules else {
        bail!(
            "Expected exactly two server action loader modules, but got {}",
            server_action_loader_modules.len()
        );
    };

    let actions1 = collected_modules.get(loader_module1).await?;
    let actions2 = collected_modules.get(loader_module2).await?;

    let actions = actions1
        .iter()
        .chain(actions2.iter())
        .flat_map(|v| v.iter())
        // No need to filter on entry_group_modules. Each page (ChunkGroup::Entry) has its own
        // loader module anyway.
        .flat_map(|(_, refs)| refs.iter());

    Ok(Vc::cell(
        actions
            .map(async |(data, module)| {
                if cfg!(debug_assertions) {
                    match &data.chunking_type {
                        ChunkingType::Collected { namespace, .. } => match namespace.as_str() {
                            "next/server-actions/rsc-edge"
                            | "next/server-actions/rsc-nodejs"
                            | "next/server-actions/browser-edge"
                            | "next/server-actions/browser-nodejs" => {}
                            _ => bail!("unexpected namespace {namespace} for collected reference"),
                        },
                        _ => bail!("unexpected chunking type for collected reference"),
                    };
                }

                let data =
                    ResolvedVc::try_sidecast::<Box<dyn EmittedModuleReference>>(data.reference)
                        .context(
                            "Expected collected server action reference to be a \
                             EmittedModuleReference",
                        )?
                        .data()
                        .await?;
                let data = match &*data {
                    CompileTimeDefineValue::String(s) => s.as_str(),
                    _ => bail!("Expected emitted module reference data to be string"),
                };
                let mut data = data.split("|");
                let hash = data.next().context("expected more data")?;
                let name = data.next().context("expected more data")?;

                Ok((
                    hash.to_string(),
                    (
                        ActionMeta {
                            name: name.to_string(),
                            // TODO set properly
                            source_path: "".to_string(),
                        },
                        *module,
                    ),
                ))
            })
            .try_join()
            .await?,
    ))
}

/// Builds a manifest containing every action's hashed id, with an internal
/// module id which exports a function using that hashed name.
#[turbo_tasks::value]
struct ServerActionManifestAsset {
    node_root: FileSystemPath,
    page_name: RcStr,
    runtime: NextRuntime,
    actions: ResolvedVc<AllActions>,
    module_graph: ResolvedVc<ModuleGraph>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    project: ResolvedVc<Project>,
}

#[turbo_tasks::value_impl]
impl ServerActionManifestAsset {
    #[turbo_tasks::function]
    pub fn new(
        node_root: FileSystemPath,
        page_name: RcStr,
        runtime: NextRuntime,
        actions: ResolvedVc<AllActions>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        project: ResolvedVc<Project>,
    ) -> Vc<Self> {
        Self {
            node_root,
            page_name,
            runtime,
            actions,
            module_graph,
            chunking_context,
            project,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for ServerActionManifestAsset {
    #[turbo_tasks::function]
    fn path(&self) -> Result<Vc<FileSystemPath>> {
        let manifest_path_prefix = &self.page_name;
        let manifest_path = self.node_root.join(&format!(
            "server/app{manifest_path_prefix}/server-reference-manifest.json",
        ))?;
        Ok(manifest_path.cell())
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for ServerActionManifestAsset {}

#[turbo_tasks::value_impl]
impl Asset for ServerActionManifestAsset {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        let mut manifest: ServerReferenceManifest = Default::default();

        let key = format!("app{}", self.page_name);

        let actions_value = self.actions.await?;
        let async_module_info = self.module_graph.async_module_info();
        let next_config = self.project.next_config();
        let durable_use_cache_entries = *next_config
            .enable_durable_use_cache_entries(self.project.next_mode())
            .await?;
        let static_root_param_tracking_enabled = *next_config
            .enable_use_cache_static_root_param_tracking(self.project.next_mode())
            .await?;
        let hash_salt = next_config.output_hash_salt();

        let mapping = match self.runtime {
            NextRuntime::Edge => &mut manifest.edge,
            NextRuntime::NodeJs => &mut manifest.node,
        };
        let chunk_item_id_strategy = self.chunking_context.chunk_item_id_strategy().await?;

        // These modules end up pulling in a lot of env vars and would always cause invalidations.
        // But they don't actually read the env vars for the imports that are used. Their code is
        // versioned anyway via the Next.js version in the cache key.
        //
        // `module.compiled.js -> app-page-turbo.runtime.prod.js` is imported by the following
        // modules. But none of them have values whose runtime value depends on the runtime env
        // vars.
        // - react
        // - react-dom
        // - react-server-dom-*
        // - next/dist/shared/lib/app-router-context.shared-runtime
        // - next/dist/shared/lib/head-manager-context.shared-runtime
        // - next/dist/shared/lib/hooks-client-context.shared-runtime
        // - next/dist/shared/lib/image-config-context.shared-runtime
        // - next/dist/shared/lib/router-context.shared-runtime
        // - next/dist/shared/lib/server-inserted-html.shared-runtime
        let modules_to_ignore = (durable_use_cache_entries || static_root_param_tracking_enabled)
            .then(|| get_use_cache_modules_to_ignore(*self.project));

        struct ActionMetadata<'a> {
            exported_name: &'a str,
            filename: Cow<'a, str>,
            data: Option<ReadRef<ModulesInformation>>,
            root_param_dependencies: Option<ReadRef<Vec<RcStr>>>,
            module_id: ModuleId,
            is_async: bool,
        }

        // Keep module ids in the hashed factory independent of the rest of the build.
        let chunking_context_for_content_hash = ResolvedVc::upcast(
            UseCacheContentHashChunkingContext::new(*self.chunking_context)
                .to_resolved()
                .await?,
        );

        let action_metadata: Vec<(&str, ActionMetadata<'_>)> = actions_value
            .iter()
            .map(async |(hash_id, (meta, module))| {
                // Use source_path from the action comment if available (contains original .ts/.tsx
                // path), otherwise fall back to module.ident().path() (may be compiled .js
                // path)
                let filename = if !meta.source_path.is_empty() {
                    Cow::Borrowed(&*meta.source_path)
                } else {
                    Cow::Owned(module.ident().await?.path.to_string())
                };

                let data = if durable_use_cache_entries
                    && extract_type_from_server_reference_id(hash_id)
                        == ServerReferenceType::UseCache
                {
                    Some(
                        compute_subtree_content_hash(
                            *self.module_graph,
                            **module,
                            *chunking_context_for_content_hash,
                            hash_salt,
                            modules_to_ignore
                                .expect("cache metadata collection requires module exclusions"),
                        )
                        .await?,
                    )
                } else {
                    None
                };
                let root_param_dependencies = if static_root_param_tracking_enabled
                    && extract_type_from_server_reference_id(hash_id)
                        == ServerReferenceType::UseCache
                {
                    Some(
                        collect_root_param_dependencies_from_graph(
                            *self.module_graph,
                            **module,
                            modules_to_ignore
                                .expect("cache metadata collection requires module exclusions"),
                        )
                        .await?,
                    )
                } else {
                    None
                };

                Ok((
                    &**hash_id,
                    ActionMetadata {
                        exported_name: &meta.name,
                        filename,
                        data,
                        root_param_dependencies,
                        module_id: chunk_item_id_strategy.get_id_from_module(**module).await?,
                        is_async: async_module_info.is_async(*module).await?,
                    },
                ))
            })
            .try_join()
            .await?;

        // Now create the manifest entries
        for (
            hash_id,
            ActionMetadata {
                exported_name,
                filename,
                data,
                root_param_dependencies,
                module_id,
                is_async,
            },
        ) in &action_metadata
        {
            let entry = mapping
                .entry(hash_id)
                .or_insert_with(|| ActionManifestEntry {
                    workers: Default::default(),
                    // Hoist the filename and exported_name to the entry level
                    exported_name,
                    filename,
                    line: None,
                    col: None,
                });
            entry.workers.insert(
                &key,
                ActionManifestWorkerEntry {
                    exported_name,
                    module_id: module_id.into(),
                    is_async: *is_async,
                    durability: data.as_ref().map(|d| ActionManifestWorkerEntryDurability {
                        code_hash: d.path_code_hash.as_str(),
                        runtime_env_vars_read: d.runtime_env_vars_read.as_slice(),
                        runtime_env_vars_existence: d.runtime_env_vars_existence.as_slice(),
                    }),
                    root_param_dependencies: root_param_dependencies
                        .as_ref()
                        .map(|names| names.as_slice()),
                },
            );
        }

        Ok(AssetContent::file(
            FileContent::Content(File::from(serde_json::to_string_pretty(&manifest)?)).cell(),
        ))
    }
}

/// Merged information about a module graph subgraph
#[turbo_tasks::value]
#[derive(Debug)]
struct ModulesInformation {
    /// The combined code hash of all modules in the subgraph.
    pub path_code_hash: RcStr,
    /// The merged and deduplicated list of all runtime env vars read in the subgraph.
    pub runtime_env_vars_read: Vec<RcStr>,
    /// The merged and deduplicated list of runtime env vars used only checked for set/falsy/truthy
    /// in the subgraph.
    pub runtime_env_vars_existence: Vec<RcStr>,
}

#[turbo_tasks::function]
async fn get_use_cache_modules_to_ignore(project: ResolvedVc<Project>) -> Result<Vc<Modules>> {
    let app_project = project.app_project().await?.unwrap();
    let next_dir = get_next_package(project.project_path().owned().await?).await?;
    let source_to_ignore =
        FileSource::new(next_dir.join("dist/server/route-modules/app-page/module.compiled.js")?);
    Ok(Vc::cell(
        [
            app_project.rsc_module_context(),
            app_project.route_module_context(),
        ]
        .iter()
        .map(|c| {
            c.process(Vc::upcast(source_to_ignore), ReferenceType::Undefined)
                .module()
                .to_resolved()
        })
        .try_join()
        .await?,
    ))
}

fn collect_cache_modules(
    graph: &ModuleGraph,
    entry: ResolvedVc<Box<dyn Module>>,
    ignored: &[ResolvedVc<Box<dyn Module>>],
) -> Result<FxIndexSet<ResolvedVc<Box<dyn Module>>>> {
    let mut modules = FxIndexSet::default();
    graph.traverse_edges_dfs(
        std::iter::once(entry),
        &mut (),
        |_, target, _| {
            if ignored.contains(&target) {
                return Ok(GraphTraversalAction::Exclude);
            }
            if ResolvedVc::try_downcast_type::<CssClientReferenceModule>(target).is_some() {
                // CSS client references do not execute code on the server.
                return Ok(GraphTraversalAction::Exclude);
            }
            if ResolvedVc::try_downcast_type::<EcmascriptClientReferenceModule>(target).is_some() {
                // Include the proxy, but do not traverse client
                // implementations.
                modules.insert(target);
                return Ok(GraphTraversalAction::Exclude);
            }
            modules.insert(target);
            Ok(GraphTraversalAction::Continue)
        },
        |_, _, _| Ok(()),
        // Include traced modules, they still affect runtime behavior.
        true,
        // Collect the full dependency subtree, binding usage can differ between entry points and
        // would cause the hashes to change unnecessarily.
        true,
    )?;
    Ok(modules)
}

// Returns the sorted root param dependencies from this cache module's graph. A
// callable received at runtime can read other root params. The runtime must
// check reads against this list when it uses the list for upfront cache keys.
#[turbo_tasks::function]
async fn collect_root_param_dependencies_from_graph(
    module_graph: ResolvedVc<ModuleGraph>,
    entry: ResolvedVc<Box<dyn Module>>,
    modules_to_ignore: Vc<Modules>,
) -> Result<Vc<Vec<RcStr>>> {
    let span = tracing::info_span!(
        "collect use-cache root param dependencies",
        entry = display(entry.ident_string().await?)
    );
    async {
        let graph = module_graph.await?;
        let ignored = modules_to_ignore.await?;
        let modules = collect_cache_modules(&graph, entry, &ignored)?;
        let getters_path = root_param_getters_path().await?;
        let mut names = modules
            .iter()
            .map(async |module| {
                let ident = module.ident().await?;
                if let Some(filename) = getters_path.get_path_to(&ident.path)
                    && let Some(name) = filename.strip_suffix(".js")
                    && !name.is_empty()
                    && !name.contains('/')
                {
                    Ok(Some(RcStr::from(name)))
                } else {
                    Ok(None)
                }
            })
            .try_flat_join()
            .await?;
        names.sort_unstable();
        names.dedup();
        anyhow::Ok(Vc::cell(names))
    }
    .instrument(span)
    .await
}

#[turbo_tasks::function]
async fn compute_subtree_content_hash(
    module_graph: ResolvedVc<ModuleGraph>,
    entry: ResolvedVc<Box<dyn Module>>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    hash_salt: Vc<RcStr>,
    modules_to_ignore: Vc<Modules>,
) -> Result<Vc<ModulesInformation>> {
    let span = tracing::info_span!(
        "compute use-cache code hash",
        entry = display(entry.ident_string().await?)
    );
    match async {
        let module_graph_value = module_graph.await?;
        let async_module_info = module_graph.async_module_info();

        let modules_to_ignore = modules_to_ignore.await?;
        let modules = collect_cache_modules(&module_graph_value, entry, &modules_to_ignore)?;

        let data = modules
            .into_iter()
            .map(async |m| {
                Ok((
                    m,
                    module_hash(
                        *module_graph,
                        chunking_context,
                        async_module_info,
                        *m,
                        hash_salt,
                    )
                    .await?,
                ))
            })
            .try_join()
            .await?;

        static PRINT_USE_CACHE_SUBTREE: LazyLock<bool> = LazyLock::new(|| {
            std::env::var_os("TURBOPACK_PRINT_USE_CACHE_SUBTREE")
                .is_some_and(|v| v == "1" || v == "true")
        });
        if *PRINT_USE_CACHE_SUBTREE {
            println!(
                "Modules in subtree for {}:\n{}",
                entry.ident_string().await?,
                data.iter()
                    .map(async |(m, data)| {
                        Ok(format!(
                            "  '{}': {}{}{}",
                            m.ident().await?.path.to_string_ref().await?,
                            data.path_code_hash,
                            if data
                                .env_var_info
                                .as_ref()
                                .is_some_and(|e| !e.runtime.is_empty())
                            {
                                " with env: "
                            } else {
                                ""
                            },
                            data.env_var_info
                                .as_ref()
                                .map(|e| {
                                    e.runtime
                                        .iter()
                                        .map(|(name, mode)| match mode {
                                            EnvVarAccessMode::Read => format!("read {name}"),
                                            EnvVarAccessMode::Existence => {
                                                format!("exists {name}")
                                            }
                                        })
                                        .collect::<Vec<_>>()
                                })
                                .unwrap_or_default()
                                .join(",")
                        ))
                    })
                    .try_join()
                    .await?
                    .join("\n")
            );
        }

        let mut hashes = Vec::with_capacity(data.len());
        let mut runtime_env_vars = FxIndexMap::default();

        for (_m, data) in &data {
            hashes.push(&data.path_code_hash);
            if let Some(env) = &data.env_var_info {
                for (name, mode) in &env.runtime {
                    match mode {
                        EnvVarAccessMode::Read => {
                            // Overwrite
                            runtime_env_vars.insert(name.clone(), EnvVarAccessMode::Read);
                        }
                        EnvVarAccessMode::Existence => {
                            // Keep EnvVarAccessMode::Read if it already exists
                            runtime_env_vars
                                .entry(name.clone())
                                .or_insert(EnvVarAccessMode::Existence);
                        }
                    }
                }
            }
        }

        let hash = deterministic_hash("", hashes, HashAlgorithm::Xxh3Hash128Hex).into();
        let (mut runtime_read, mut runtime_existence): (Vec<_>, Vec<_>) =
            runtime_env_vars.into_iter().partition_map(|(name, mode)| {
                if mode == EnvVarAccessMode::Read {
                    Either::Left(name)
                } else {
                    Either::Right(name)
                }
            });

        // Sort for more stable return values (less invalidation)
        runtime_read.sort_unstable();
        runtime_existence.sort_unstable();
        anyhow::Ok(
            ModulesInformation {
                path_code_hash: hash,
                runtime_env_vars_read: runtime_read,
                runtime_env_vars_existence: runtime_existence,
            }
            .cell(),
        )
    }
    .instrument(span)
    .await
    {
        Ok(hash) => Ok(hash),
        // ast-grep-ignore: no-context-turbofmt
        Err(e) => Err(e.context(
            turbofmt!(
                "Failed to compute use-cache code hash {}",
                entry.ident_string()
            )
            .await?,
        )),
    }
}

#[turbo_tasks::value]
#[derive(Debug)]
struct ModuleInformation {
    pub path_code_hash: RcStr,
    pub env_var_info: Option<ReadRef<EnvVarInfo>>,
}

#[turbo_tasks::function]
async fn module_hash(
    module_graph: ResolvedVc<ModuleGraph>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    async_module_info: ResolvedVc<AsyncModulesInfo>,
    m: ResolvedVc<Box<dyn Module>>,
    hash_salt: Vc<RcStr>,
) -> Result<Vc<ModuleInformation>> {
    let ident = m.ident();
    let ident_value = ident.await?;
    let ident_str = ident.to_string_without_layer().await?;

    if cfg!(debug_assertions)
        && (ident_str
            .contains("next/dist/compiled/next-server/app-page-turbo-experimental.runtime.dev.js")
            || ident_str.contains(
                "next/dist/compiled/next-server/app-page-turbo-experimental.runtime.prod.js",
            )
            || ident_str.contains("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js")
            || ident_str.contains("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))
    {
        // This isn't exactly a fatal error, but it makes cross-deployment caching completely
        // ineffective.
        bail!("use cache subtree shouldn't contain {}", ident_str);
    }

    let env_var_info =
        if let Some(module) = ResolvedVc::try_downcast::<Box<dyn EcmascriptAnalyzable>>(m) {
            Some(module.env_var_info().await?)
        } else {
            None
        };

    let path_code_hash = if let Some(placeable_module) =
        ResolvedVc::try_downcast::<Box<dyn EcmascriptChunkPlaceable>>(m)
        && !ident_value
            .layer
            .as_ref()
            .is_some_and(|l| l.name() == "externals-tracing")
    {
        // A bundled JS module
        let chunk_item = placeable_module
            .as_chunk_item(*module_graph, *chunking_context)
            .to_resolved()
            .await?;
        let chunk_item = ResolvedVc::try_downcast::<Box<dyn EcmascriptChunkItem>>(chunk_item)
            .context("expected EcmascriptChunkItem")?;
        let async_info = if async_module_info.is_async(m).await? {
            Some(module_graph.referenced_async_modules(*m))
        } else {
            None
        };
        let factory = chunk_item.code(async_info).await?;
        RcStr::from(deterministic_hash(
            "",
            (ident_str, factory.code.to_code().source_code_hash().await?),
            HashAlgorithm::Xxh3Hash128Hex,
        ))
    } else {
        // A non-JS static file or an external module
        let content_hash = m
            .source()
            .await?
            .with_context(|| format!("failed to get source for module {ident_str}"))?
            .content()
            .hash(hash_salt, HashAlgorithm::Xxh3Hash128Hex)
            .await?;
        RcStr::from(deterministic_hash(
            "",
            (ident_str, content_hash),
            HashAlgorithm::Xxh3Hash128Hex,
        ))
    };

    Ok(ModuleInformation {
        path_code_hash,
        env_var_info,
    }
    .cell())
}

/// Server action info for JSON parsing
#[derive(Clone, Debug, serde::Deserialize)]
#[serde(untagged)]
enum ServerActionInfoRaw {
    /// Old format: just the export name as a string
    Name(String),
    /// New format: object with name
    WithName { name: String },
}

impl ServerActionInfoRaw {
    fn into_action_entry(self) -> ActionEntry {
        match self {
            ServerActionInfoRaw::Name(name) => ActionEntry { name },
            ServerActionInfoRaw::WithName { name } => ActionEntry { name },
        }
    }
}

/// Simplified action entry for storage in turbo_tasks values
#[derive(Clone, Debug, PartialEq, Eq, NonLocalValue, Encode, Decode)]
pub struct ActionEntry {
    pub name: String,
}

/// Parses the Server Actions comment for all exported action function names.
///
/// Action names are stored in a leading BlockComment prefixed by
/// `__next_internal_action_entry_do_not_use__`.
pub fn parse_server_actions(
    program: &Program,
    comments: &dyn Comments,
) -> Option<(BTreeMap<String, ActionEntry>, String, String)> {
    let byte_pos = match program {
        Program::Module(m) => m.span.lo,
        Program::Script(s) => s.span.lo,
    };
    comments.get_leading(byte_pos).and_then(|comments| {
        comments.iter().find_map(|c| {
            c.text
                .split_once("__next_internal_action_entry_do_not_use__")
                .and_then(|(_, actions)| {
                    // Try to parse as tuple format: (actions_map, entry_path, entry_query)
                    if let Ok((raw, entry_path, entry_query)) = serde_json::from_str::<(
                        BTreeMap<String, ServerActionInfoRaw>,
                        String,
                        String,
                    )>(actions)
                    {
                        let converted: BTreeMap<String, ActionEntry> = raw
                            .into_iter()
                            .map(|(k, v)| (k, v.into_action_entry()))
                            .collect();
                        return Some((converted, entry_path, entry_query));
                    }
                    // Fall back to just actions map (old format without entry path/query)
                    let raw: BTreeMap<String, ServerActionInfoRaw> =
                        serde_json::from_str(actions).ok()?;
                    let converted: BTreeMap<String, ActionEntry> = raw
                        .into_iter()
                        .map(|(k, v)| (k, v.into_action_entry()))
                        .collect();
                    Some((converted, String::new(), String::new()))
                })
        })
    })
}
/// Inspects the comments inside [Module] looking for the magic actions comment.
/// If found, we return the mapping of every action's hashed id to the name of
/// the exported action function. If not, we return a None.
#[turbo_tasks::function]
async fn parse_actions(module: ResolvedVc<Box<dyn Module>>) -> Result<Vc<OptionActionMap>> {
    let Some(ecmascript_asset) = ResolvedVc::try_sidecast::<Box<dyn EcmascriptParsable>>(module)
    else {
        return Ok(Vc::cell(None));
    };

    let original_asset =
        if let Some(module) = ResolvedVc::try_downcast_type::<EcmascriptModulePartAsset>(module) {
            let module = module.await?;
            if matches!(module.part, ModulePart::Evaluation | ModulePart::Facade) {
                return Ok(Vc::cell(None));
            }
            ResolvedVc::upcast(module.full_module)
        } else {
            ecmascript_asset
        };

    let original_parsed = original_asset.failsafe_parse().to_resolved().await?;

    let ParseResult::Ok {
        program: original,
        comments,
        ..
    } = &*original_parsed.await?
    else {
        // The file might be parse-able, but this is reported separately.
        return Ok(Vc::cell(None));
    };

    let Some((mut actions, entry_path, entry_query)) = parse_server_actions(original, comments)
    else {
        return Ok(Vc::cell(None));
    };

    // If this is a module-fragment, filter the exports
    if original_asset != ecmascript_asset {
        let fragment = ecmascript_asset.failsafe_parse().to_resolved().await?;
        let ParseResult::Ok {
            program: fragment, ..
        } = &*fragment.await?
        else {
            // The file might be be parse-able, but this is reported separately.
            return Ok(Vc::cell(None));
        };

        let all_exports = all_export_names(fragment);
        actions.retain(|_, entry| all_exports.iter().any(|export| export == &entry.name));
    }

    let mut actions = FxIndexMap::from_iter(actions.into_iter());
    actions.sort_keys();
    Ok(Vc::cell(Some(
        ActionMap {
            actions,
            entry_path,
            entry_query,
        }
        .resolved_cell(),
    )))
}

fn all_export_names(program: &Program) -> Vec<Atom> {
    match program {
        Program::Module(m) => {
            let mut exports = Vec::new();
            for item in m.body.iter() {
                match item {
                    ModuleItem::ModuleDecl(
                        ModuleDecl::ExportDefaultExpr(..) | ModuleDecl::ExportDefaultDecl(..),
                    ) => {
                        exports.push(atom!("default"));
                    }
                    ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(decl)) => match &decl.decl {
                        Decl::Class(c) => {
                            exports.push(c.ident.sym.clone());
                        }
                        Decl::Fn(f) => {
                            exports.push(f.ident.sym.clone());
                        }
                        Decl::Var(v) => {
                            let ids: Vec<Id> = find_pat_ids(v);
                            exports.extend(ids.into_iter().map(|id| id.0));
                        }
                        _ => {}
                    },
                    ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(decl)) => {
                        if is_turbopack_internal_var(&decl.with) {
                            continue;
                        }

                        for s in decl.specifiers.iter() {
                            match s {
                                ExportSpecifier::Named(named) => {
                                    exports.push(
                                        named
                                            .exported
                                            .as_ref()
                                            .unwrap_or(&named.orig)
                                            .atom()
                                            .into_owned(),
                                    );
                                }
                                ExportSpecifier::Default(_) => {
                                    exports.push(atom!("default"));
                                }
                                ExportSpecifier::Namespace(e) => {
                                    exports.push(e.name.atom().into_owned());
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
            exports
        }

        _ => {
            vec![]
        }
    }
}

fn is_turbopack_internal_var(with: &Option<Box<ObjectLit>>) -> bool {
    with.as_deref()
        .and_then(|v| {
            v.props.iter().find_map(|p| match p {
                Prop(prop) => match &**prop {
                    swc_core::ecma::ast::Prop::KeyValue(key_value_prop) => {
                        if key_value_prop.key.as_ident()?.sym == "__turbopack_var__" {
                            Some(key_value_prop.value.as_lit()?.as_bool()?.value)
                        } else {
                            None
                        }
                    }
                    _ => None,
                },
                _ => None,
            })
        })
        .unwrap_or(false)
}

/// Action metadata including name and source path
#[derive(Clone, Debug, PartialEq, Eq, NonLocalValue, Encode, Decode)]
pub struct ActionMeta {
    pub name: String,
    /// The original source file path (from entry_path in the action comment)
    pub source_path: String,
}

type HashToAction = Vec<(String, (ActionMeta, ResolvedVc<Box<dyn Module>>))>;

/// A mapping of every module which exports a Server Action, with the hashed id
/// and exported name of each found action.
#[turbo_tasks::value(transparent)]
pub struct AllActions(HashToAction);

#[turbo_tasks::value_impl]
impl AllActions {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Vc::cell(Default::default())
    }
}

/// Maps the hashed action id to the action's exported function name and location.
#[turbo_tasks::value]
#[derive(Debug)]
pub struct ActionMap {
    #[bincode(with = "turbo_bincode::indexmap")]
    pub actions: FxIndexMap<String, ActionEntry>,
    pub entry_path: String,
    pub entry_query: String,
}

/// An Option wrapper around [ActionMap].
#[turbo_tasks::value(transparent)]
struct OptionActionMap(Option<ResolvedVc<ActionMap>>);

/// A mapping of every module module containing Server Actions, mapping to its layer and actions.
#[turbo_tasks::value(transparent)]
pub struct AllModuleActions(
    #[bincode(with = "turbo_bincode::indexmap")]
    FxIndexMap<ResolvedVc<Box<dyn Module>>, ResolvedVc<ActionMap>>,
);

#[turbo_tasks::function]
fn server_actions_collect_virtual_fs() -> Vc<VirtualFileSystem> {
    VirtualFileSystem::new_with_name(rcstr!("next-server-actions-collect"))
}

/// This module performs what `__turbopack_collect__({namespace: 'next/server-actions/*'})` would
/// do chunking-wise. Except that we collect the list manually into a separate JSON, so
/// __turbopack_collect__ would unnecessarily codegen a big list of server actions.
#[turbo_tasks::value]
pub struct ServerActionCollectModule {
    namespace: RcStr,
    page: RcStr,
}

#[turbo_tasks::value_impl]
impl ServerActionCollectModule {
    #[turbo_tasks::function]
    pub fn new(namespace: RcStr, page: RcStr) -> Vc<Self> {
        ServerActionCollectModule { namespace, page }.cell()
    }
}

#[turbo_tasks::value_impl]
impl Module for ServerActionCollectModule {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(
            AssetIdent::from_path(server_actions_collect_virtual_fs().root().owned().await?)
                .with_modifier(self.namespace.clone())
                .with_modifier(self.page.clone())
                .into_vc(),
        )
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionSource> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<ModuleReferences> {
        ModuleReferences::empty()
    }

    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        ModuleSideEffects::SideEffectful.cell()
    }
}

#[turbo_tasks::value_impl]
impl CollectingModule for ServerActionCollectModule {
    #[turbo_tasks::function]
    fn namespace(&self) -> Vc<RcStr> {
        Vc::cell(self.namespace.clone())
    }

    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        _entry_chunk_group: Vc<Modules>,
    ) -> Vc<Box<dyn ChunkItem>> {
        ecmascript_chunk_item(ResolvedVc::upcast(self), module_graph, chunking_context)
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for ServerActionCollectModule {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn ChunkItem>> {
        ecmascript_chunk_item(ResolvedVc::upcast(self), module_graph, chunking_context)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for ServerActionCollectModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::None.cell()
    }

    #[turbo_tasks::function]
    async fn chunk_item_content(
        self: Vc<Self>,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
        _module_graph: Vc<ModuleGraph>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
        _estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        // There is no runtime behavior needed here.
        // - __turbopack_collect__ causes all modules to chunked together with this one
        // - server-reference-manifest.json will contains all the module ids from above. It will do
        //   the loading itself
        // In the future, when server-reference-manifest might be loaded/handled by the templates
        // themselves, then it could happen here instead.
        Ok(EcmascriptChunkItemContent {
            ..Default::default()
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl EvaluatableAsset for ServerActionCollectModule {}

#[derive(Clone, Debug, PartialEq, Eq)]
enum ServerReferenceType {
    ServerAction,
    UseCache,
}

fn extract_type_from_server_reference_id(id: &str) -> ServerReferenceType {
    // Mirrors extractInfoFromServerReferenceId in
    // packages/next/src/shared/lib/server-reference-info.ts
    let info_byte = u8::from_str_radix(&id[0..2], 16).unwrap_or(0);
    let type_bit = (info_byte >> 7) & 0x1;

    if type_bit == 1 {
        ServerReferenceType::UseCache
    } else {
        ServerReferenceType::ServerAction
    }
}

/// Wrap an inner chunking context and override certain behaviors for use cache content hashing.
///
/// Be careful when overriding anything here, to not normalize anything that might actually have a
/// behavior effect on the use-cache return value.
#[turbo_tasks::value]
struct UseCacheContentHashChunkingContext {
    inner: ResolvedVc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl UseCacheContentHashChunkingContext {
    #[turbo_tasks::function]
    pub fn new(inner: ResolvedVc<Box<dyn ChunkingContext>>) -> Vc<Self> {
        Self { inner }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkingContext for UseCacheContentHashChunkingContext {
    #[turbo_tasks::function]
    fn name(&self) -> Vc<RcStr> {
        Vc::cell(rcstr!("UseCacheContentHashChunkingContext"))
    }

    #[turbo_tasks::function]
    fn root_path(&self) -> Vc<FileSystemPath> {
        self.inner.root_path()
    }

    #[turbo_tasks::function]
    fn output_root(&self) -> Vc<FileSystemPath> {
        self.inner.output_root()
    }

    #[turbo_tasks::function]
    fn output_root_to_root_path(&self) -> Vc<RcStr> {
        self.inner.output_root_to_root_path()
    }

    #[turbo_tasks::function]
    fn environment(&self) -> Vc<Environment> {
        self.inner.environment()
    }

    #[turbo_tasks::function]
    fn chunk_root_path(&self) -> Vc<FileSystemPath> {
        self.inner.chunk_root_path()
    }

    #[turbo_tasks::function]
    async fn chunk_path(
        &self,
        asset: Option<Vc<Box<dyn Asset>>>,
        ident: Vc<AssetIdent>,
        prefix: Option<RcStr>,
        extension: RcStr,
    ) -> Vc<FileSystemPath> {
        self.inner.chunk_path(asset, ident, prefix, extension)
    }

    #[turbo_tasks::function]
    async fn asset_url(&self, ident: FileSystemPath, tag: Option<RcStr>) -> Vc<RcStr> {
        self.inner.asset_url(ident, tag)
    }

    #[turbo_tasks::function]
    fn service_worker_scope_base_path(&self) -> Vc<RcStr> {
        self.inner.service_worker_scope_base_path()
    }

    #[turbo_tasks::function]
    fn reference_chunk_source_maps(
        self: Vc<Self>,
        _chunk: Vc<Box<dyn OutputAsset>>,
    ) -> Result<Vc<bool>> {
        bail!(
            "reference_chunk_source_maps should not be called in \
             UseCacheContentHashChunkingContext"
        )
    }

    #[turbo_tasks::function]
    fn reference_module_source_maps(&self, module: Vc<Box<dyn Module>>) -> Vc<bool> {
        self.inner.reference_module_source_maps(module)
    }

    #[turbo_tasks::function]
    async fn asset_path(
        &self,
        content: Vc<AssetContent>,
        original_asset_ident: Vc<AssetIdent>,
        tag: Option<RcStr>,
    ) -> Vc<FileSystemPath> {
        self.inner.asset_path(content, original_asset_ident, tag)
    }

    #[turbo_tasks::function]
    fn url_behavior(&self, tag: Option<RcStr>) -> Vc<UrlBehavior> {
        self.inner.url_behavior(tag)
    }

    #[turbo_tasks::function]
    fn chunking_configs(self: Vc<Self>) -> Result<Vc<ChunkingConfigs>> {
        bail!("chunking_configs should not be called in UseCacheContentHashChunkingContext")
    }

    #[turbo_tasks::function]
    fn source_map_source_type(&self) -> Vc<SourceMapSourceType> {
        self.inner.source_map_source_type()
    }

    #[turbo_tasks::function]
    fn is_nested_async_availability_enabled(self: Vc<Self>) -> Result<Vc<bool>> {
        bail!(
            "is_nested_async_availability_enabled should not be called in \
             UseCacheContentHashChunkingContext"
        )
    }

    #[turbo_tasks::function]
    fn is_module_merging_enabled(self: Vc<Self>) -> Result<Vc<bool>> {
        bail!(
            "is_module_merging_enabled should not be called in UseCacheContentHashChunkingContext"
        )
    }

    #[turbo_tasks::function]
    fn is_dynamic_chunk_content_loading_enabled(self: Vc<Self>) -> Result<Vc<bool>> {
        bail!(
            "is_dynamic_chunk_content_loading_enabled should not be called in \
             UseCacheContentHashChunkingContext"
        )
    }

    #[turbo_tasks::function]
    pub fn minify_type(&self) -> Vc<MinifyType> {
        // Intentionally override: we are not performing chunking, so minify_type is only used for
        // generating less whitespace during AST emitting (which means less data and thus slightly
        // faster)
        MinifyType::default().cell()
    }

    #[turbo_tasks::function]
    fn should_use_absolute_url_references(self: Vc<Self>) -> Result<Vc<bool>> {
        bail!(
            "should_use_absolute_url_references should not be called in \
             UseCacheContentHashChunkingContext"
        )
    }

    #[turbo_tasks::function]
    async fn chunk_group(
        self: Vc<Self>,
        _ident: Vc<AssetIdent>,
        _chunk_groups: SmallVec<[ChunkGroupKey; 1]>,
        _module_graph: ResolvedVc<ModuleGraph>,
        _availability_info: AvailabilityInfo,
    ) -> Result<Vc<ChunkGroupResult>> {
        bail!("chunk_group should not be called in UseCacheContentHashChunkingContext");
    }

    #[turbo_tasks::function]
    async fn evaluated_chunk_group(
        self: Vc<Self>,
        _ident: Vc<AssetIdent>,
        _chunk_group: ChunkGroupKey,
        _module_graph: ResolvedVc<ModuleGraph>,
        _extra_chunks: Vc<OutputAssets>,
        _input_availability_info: AvailabilityInfo,
    ) -> Result<Vc<ChunkGroupResult>> {
        bail!("evaluated_chunk_group should not be called in UseCacheContentHashChunkingContext");
    }

    #[turbo_tasks::function]
    async fn hmr_chunk_list(
        self: Vc<Self>,
        _ident: Vc<AssetIdent>,
        _chunks: Vc<OutputAssets>,
        _source: HmrChunkListSource,
    ) -> Result<Vc<OutputAssets>> {
        bail!("hmr_chunk_list should not be called in UseCacheContentHashChunkingContext");
    }

    #[turbo_tasks::function]
    async fn entry_chunk_group(
        self: Vc<Self>,
        _path: FileSystemPath,
        _chunk_group: ChunkGroupKey,
        _module_graph: ResolvedVc<ModuleGraph>,
        _extra_chunks: Vc<OutputAssets>,
        _extra_referenced_assets: Vc<OutputAssets>,
        _availability_info: AvailabilityInfo,
    ) -> Result<Vc<EntryChunkGroupResult>> {
        bail!("entry_chunk_group should not be called in UseCacheContentHashChunkingContext");
    }

    #[turbo_tasks::function]
    fn chunk_item_id_strategy(&self) -> Vc<ModuleIdStrategy> {
        // Intentionally make this return only paths to
        // 1. more stable module IDs even as the short numeric ones might change
        // 2. ensure that app-rsc and app-route codegen reference the same module ids (=paths) in
        //    imports
        ModuleIdStrategy::new_ident_without_layer()
    }

    #[turbo_tasks::function]
    async fn async_loader_chunk_item(
        self: Vc<Self>,
        _module: Vc<Box<dyn ChunkableModule>>,
        _module_graph: Vc<ModuleGraph>,
        _availability_info: AvailabilityInfo,
    ) -> Result<Vc<Box<dyn ChunkItem>>> {
        bail!("async_loader_chunk_item should not be called in UseCacheContentHashChunkingContext")
    }

    #[turbo_tasks::function]
    async fn standalone_chunk(
        self: Vc<Self>,
        _chunk_item: Vc<Box<dyn ChunkItem>>,
    ) -> Result<Vc<Box<dyn OutputAsset>>> {
        bail!("standalone_chunk should not be called in UseCacheContentHashChunkingContext")
    }

    #[turbo_tasks::function]
    async fn async_loader_chunk_item_ident(
        &self,
        module: Vc<Box<dyn ChunkableModule>>,
    ) -> Vc<AssetIdent> {
        self.inner.async_loader_chunk_item_ident(module)
    }

    #[turbo_tasks::function]
    async fn module_export_usage(
        self: Vc<Self>,
        _module: ResolvedVc<Box<dyn Module>>,
    ) -> Vc<ModuleExportUsage> {
        // Intentionally empty for more stable hashes
        ModuleExportUsage::unknown()
    }

    #[turbo_tasks::function]
    fn unused_references(self: Vc<Self>) -> Vc<UnusedReferences> {
        // Intentionally empty for more stable hashes
        Vc::cell(Default::default())
    }

    #[turbo_tasks::function]
    async fn debug_ids_enabled(self: Vc<Self>) -> Result<Vc<bool>> {
        bail!("debug_ids_enabled should not be called in UseCacheContentHashChunkingContext")
    }

    #[turbo_tasks::function]
    fn worker_configuration_options(&self) -> Vc<WorkerConfigurationOptions> {
        self.inner.worker_configuration_options()
    }

    #[turbo_tasks::function]
    async fn worker_entrypoint(&self) -> Vc<Box<dyn OutputAsset>> {
        self.inner.worker_entrypoint()
    }

    #[turbo_tasks::function]
    fn chunk_loading(&self) -> Vc<ChunkLoading> {
        self.inner.chunk_loading()
    }
}

#[cfg(test)]
mod tests {
    use crate::server_actions::{ServerReferenceType, extract_type_from_server_reference_id};

    #[test]
    fn test_should_parse_id_with_type_bit_0_no_args() {
        let id = "00xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"; // 0b00000000

        assert_eq!(
            extract_type_from_server_reference_id(id),
            ServerReferenceType::ServerAction
        );
    }

    #[test]
    fn test_should_parse_id_with_type_bit_1_all_args_used_rest_args_true() {
        let id = "ffxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"; // 0b11111111

        assert_eq!(
            extract_type_from_server_reference_id(id),
            ServerReferenceType::UseCache
        );
    }

    #[test]
    fn test_should_parse_id_with_type_bit_0_arg_mask_0b101010_rest_args_false() {
        let id = "54xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"; // 0b01010100

        assert_eq!(
            extract_type_from_server_reference_id(id),
            ServerReferenceType::ServerAction
        );
    }

    #[test]
    fn test_should_parse_id_with_type_bit_1_arg_mask_0b000101_rest_args_true() {
        let id = "8bxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"; // 0b10001011

        assert_eq!(
            extract_type_from_server_reference_id(id),
            ServerReferenceType::UseCache
        );
    }
}
