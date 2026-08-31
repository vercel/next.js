use std::collections::{BTreeSet, VecDeque};

use anyhow::{Context, Result};
use async_trait::async_trait;
use next_core::{app_structure::FileSystemPathVec, next_config::NextConfig};
use rustc_hash::{FxHashMap, FxHashSet};
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxIndexMap, FxIndexSet, ReadRef, ResolvedVc, TraitRef, TryFlatJoinIterExt, TryJoinIterExt, Vc,
};
use turbo_tasks_fs::{
    DirectoryEntry, FileSystemEntryType, FileSystemPath,
    glob::{Glob, GlobOptions},
};
use turbo_tasks_hash::HashAlgorithm;
use turbopack_core::{
    asset::Asset,
    chunk::{ChunkingType, TracedMode},
    file_source::FileSource,
    ident::AssetIdent,
    issue::{Issue, IssueExt, IssueSeverity, IssueSource, IssueStage, StyledString},
    module::{Module, Modules},
    module_graph::{GraphTraversalAction, ModuleGraph},
    raw_module::RawModule,
    reference::DynamicTraceReference,
};

use crate::project::Project;

#[turbo_tasks::value]
pub struct EndpointTraceResult {
    pub modules: Vec<ResolvedVc<Box<dyn Module>>>,
    pub includes: Vec<FileSystemPath>,
    pub module_data: ResolvedVc<TracedModuleData>,
}

#[turbo_tasks::value_impl]
impl EndpointTraceResult {
    #[turbo_tasks::function]
    pub async fn all_files(&self) -> Result<Vc<FileSystemPathVec>> {
        let module_data = self.module_data.await?;
        Ok(Vc::cell(
            self.includes
                .iter()
                .cloned()
                .chain(
                    self.modules
                        .iter()
                        .map(async |m| Ok(module_data.idents.get(m).await?.unwrap().path.clone()))
                        .try_join()
                        .await?,
                )
                .collect(),
        ))
    }
}

/// Traces the files an endpoint needs at runtime.
///
/// `traced_entries` are modules that have to be traced even though nothing in `entry_modules`
/// references them, i.e. [`Project::additional_traced_modules`] - or
/// [`Project::pages_traced_modules`] for pages endpoints, which additionally need the modules the
/// require hook resolves at runtime.
#[turbo_tasks::function]
pub async fn trace_endpoint(
    project: ResolvedVc<Project>,
    page_name: Option<RcStr>,
    module_graph: ResolvedVc<ModuleGraph>,
    entry_modules: Vc<Modules>,
    traced_entries: Vc<Modules>,
) -> Result<Vc<EndpointTraceResult>> {
    let span = tracing::info_span!("trace endpoint", path = debug(&page_name));
    async {
        let project_path = project.project_path().owned().await?;
        let next_config = project.next_config();
        let hash_salt = next_config.output_hash_salt();

        let output_file_tracing_includes = next_config
            .output_file_tracing_includes(project_path.clone())
            .await?;

        // Collect referenced assets and externals from module graph
        let all_modules = traced_modules_for_entries(
            *module_graph,
            entry_modules,
            traced_entries,
            tracing_exclude_glob(page_name.clone(), project_path.clone(), next_config)
                .await?
                .map(|v| *v),
            Some(next_config.config_file_path(project_path.clone())),
        )
        .await?;

        let module_data = traced_module_data_for_graph(*module_graph, traced_entries, hash_salt)
            .to_resolved()
            .await?;
        let module_paths = module_data.await?.idents;

        let modules = all_modules
            .iter()
            .copied()
            .map(async |module| {
                let entry = module_paths
                    .get(&module)
                    .await?
                    .context("missing path for module")?;
                let referenced_chunk_path = &entry.path;

                if referenced_chunk_path.has_extension(".map") {
                    return Ok(None);
                }

                #[cfg(debug_assertions)]
                {
                    // Verify that we there are no entries where a file is created inside of a
                    // symlink, as this can result in invalid ZIP files and deployment failures. For
                    // example
                    // node_modules/.pnpm/node_modules/@libsql/client/src/index.json
                    // where
                    // node_modules/.pnpm/node_modules/@libsql/client is a symlink
                    let parent_path = referenced_chunk_path.parent();
                    let resolved_parent_path = parent_path.realpath().await??;
                    if resolved_parent_path != parent_path {
                        turbo_tasks::turbobail!(
                            "Encountered file inside of symlink in NFT list: {parent_path} is a \
                             symlink, but {referenced_chunk_path} was created inside of it"
                        );
                    }
                }

                Ok(Some(module))
            })
            .try_flat_join()
            .await?;

        // Apply outputFileTracingIncludes
        // Extract route from chunk path for pattern matching
        let includes = if let Some(route) = &page_name {
            let mut combined_includes_by_root: FxIndexMap<FileSystemPath, Vec<&str>> =
                FxIndexMap::default();

            for (route_glob, include_patterns) in output_file_tracing_includes.iter() {
                if route_glob.await?.matches(route) {
                    for (glob, root) in include_patterns {
                        combined_includes_by_root
                            .entry(root.clone())
                            .or_default()
                            .push(glob);
                    }
                }
            }

            // Apply includes - find additional files that match the include patterns
            let includes = combined_includes_by_root
                .into_iter()
                .map(|(root, globs)| {
                    let glob = Glob::new(
                        format!("{{{}}}", globs.join(",")).into(),
                        GlobOptions {
                            contains: true,
                            ..Default::default()
                        },
                    );
                    get_glob_includes(root, glob)
                })
                .try_join()
                .await?;

            includes.into_iter().flatten().collect()
        } else {
            Default::default()
        };

        Ok(EndpointTraceResult {
            modules,
            includes,
            module_data,
        }
        .cell())
    }
    .instrument(span)
    .await
}

/// Apply outputFileTracingIncludes patterns to find additional files
async fn get_glob_includes(
    project_root_path: FileSystemPath,
    glob: Vc<Glob>,
) -> Result<Vec<FileSystemPath>> {
    // Read files matching the glob pattern from the project root
    // DETERMINISM: the sort_by call below ensures determinism.
    let glob_result = project_root_path.read_glob(glob).await?;

    // Walk the full glob_result using an explicit stack to avoid async recursion overheads.
    // Deduplicate symlinks shared by many matches. The return value of `read_glob` has random
    // order, so the result is sorted below.
    let mut result = FxHashSet::default();
    let mut stack = VecDeque::new();
    stack.push_back(glob_result);
    while let Some(glob_result) = stack.pop_back() {
        // Process direct results (files and directories at this level).
        for entry in glob_result.results.values() {
            let (DirectoryEntry::File(file_path) | DirectoryEntry::Symlink(file_path)) = entry
            else {
                continue;
            };

            // ReadGlobResult paths are logical by contract. Resolve each match here so the NFT
            // includes both the physical file and every symlink needed to reach it.
            let realpath = file_path.realpath_with_links().await?;
            result.extend(realpath.symlinks.iter().cloned());
            if let Ok(resolved_path) = &realpath.path_result
                && matches!(*resolved_path.get_type().await?, FileSystemEntryType::File)
            {
                result.insert(resolved_path.clone());
            }
        }

        for nested_result in glob_result.inner.values() {
            let nested_result_ref = nested_result.await?;
            stack.push_back(nested_result_ref);
        }
    }

    // All paths were matched from project_root_path, so they must all have the same `fs`. So it's
    // enough to sort by path.
    let mut result: Vec<_> = result.into_iter().collect();
    result.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(result)
}

#[turbo_tasks::value(transparent)]
pub struct OptionGlob(Option<ResolvedVc<Glob>>);

#[turbo_tasks::function]
pub async fn tracing_exclude_glob(
    page_name: Option<RcStr>,
    project_path: FileSystemPath,
    next_config: ResolvedVc<NextConfig>,
) -> Result<Vc<OptionGlob>> {
    Ok(if let Some(page_name) = &page_name {
        let route = format!("/{page_name}");
        let output_file_tracing_excludes = next_config
            .output_file_tracing_excludes(project_path)
            .await?;
        let mut combined_excludes = BTreeSet::new();

        for (route_glob, exclude_patterns) in output_file_tracing_excludes.iter() {
            if route_glob.await?.matches(&route) {
                for (glob, root) in exclude_patterns {
                    combined_excludes.insert(if root.path.is_empty() {
                        glob.to_string()
                    } else {
                        format!("{root}/{glob}")
                    });
                }
            }
        }

        if combined_excludes.is_empty() {
            Vc::cell(None)
        } else {
            let glob = Glob::new(
                format!(
                    "{{{}}}",
                    combined_excludes
                        .iter()
                        .map(|s| s.as_str())
                        .collect::<Vec<_>>()
                        .join(",")
                )
                .into(),
                GlobOptions {
                    contains: true,
                    ..Default::default()
                },
            )
            .to_resolved()
            .await?;

            Vc::cell(Some(glob))
        }
    } else {
        Vc::cell(None)
    })
}

#[turbo_tasks::function]
pub async fn traced_modules_for_entries(
    module_graph: Vc<ModuleGraph>,
    entry_modules: Vc<Modules>,
    traced_entries: Vc<Modules>,
    exclude_glob: Option<Vc<Glob>>,
    forbidden_path: Option<Vc<FileSystemPath>>,
) -> Result<Vc<Modules>> {
    let exclude_glob_and_module_idents = if let Some(exclude_glob) = exclude_glob {
        let exclude_glob = exclude_glob.await?;
        let idents = traced_module_idents_for_graph(module_graph, traced_entries).await?;
        Some((exclude_glob, idents))
    } else {
        None
    };

    let forbidden_module = if let Some(forbidden_path) = forbidden_path {
        Some(ResolvedVc::upcast(
            RawModule::new(Vc::upcast(FileSource::new(forbidden_path.owned().await?)))
                .to_resolved()
                .await?,
        ))
    } else {
        None
    };

    let mut forbidden_issues = vec![];
    let traced_entries = traced_entries.await?;
    let traced_entries_set = traced_entries.iter().copied().collect::<FxHashSet<_>>();

    let mut traced_modules = FxIndexSet::default();
    module_graph.await?.traverse_edges_dfs(
        entry_modules
            .await?
            .iter()
            .chain(traced_entries.iter())
            .copied(),
        &mut (),
        |parent, target, _| {
            let Some((parent, ref_data)) = parent else {
                if traced_entries_set.contains(&target) {
                    traced_modules.insert(target);
                }
                return Ok(GraphTraversalAction::Continue);
            };

            if forbidden_module.is_some_and(|m| m == target) {
                forbidden_issues.push((parent, ref_data.reference));
            }

            if should_visit_for_tracing(&ref_data.chunking_type, traced_modules.contains(&parent)) {
                if let Some((exclude_glob, module_idents)) = &exclude_glob_and_module_idents
                    && exclude_glob.matches(
                        &module_idents
                            .get(&target)
                            .context("missing path for module")?
                            .path
                            .path,
                    )
                {
                    return Ok(GraphTraversalAction::Skip);
                }
                traced_modules.insert(target);
            };
            Ok(GraphTraversalAction::Continue)
        },
        |_, _, _| Ok(()),
        true,
    )?;

    for (parent, reference) in forbidden_issues {
        let reference = reference.into_trait_ref().await?;
        let source = reference.source();
        let origin_fn_name = TraitRef::try_downcast::<Box<dyn DynamicTraceReference>>(reference)
            .map(|traced| traced.origin_fn_name());
        ForbiddenTracedFileIssue::new(parent.ident().await?.path.clone(), source, origin_fn_name)
            .to_resolved()
            .await?
            .emit();
    }

    Ok(Vc::cell(traced_modules.into_iter().collect()))
}

/// Ignore non-entry traced reference if not already in tracing mode.
///
/// ChunkingType::Traced{TracedMode::Entry}      => target is always traced
/// ChunkingType::Traced{TracedMode::Transitive} => target only traced if parent is traced
/// ChunkingType::*                              => target only traced if parent is traced
fn should_visit_for_tracing(chunking_type: &ChunkingType, parent_traced: bool) -> bool {
    matches!(
        chunking_type,
        ChunkingType::Traced {
            mode: TracedMode::Entry
        }
    ) || parent_traced
}

#[turbo_tasks::value(transparent, cell = "keyed")]
pub struct TracedModuleDataIdents(FxHashMap<ResolvedVc<Box<dyn Module>>, ReadRef<AssetIdent>>);

#[turbo_tasks::value(transparent, cell = "keyed")]
pub struct TracedModuleDataHashes(FxHashMap<ResolvedVc<Box<dyn Module>>, ReadRef<RcStr>>);

#[turbo_tasks::value]
pub struct TracedModuleData {
    pub idents: ResolvedVc<TracedModuleDataIdents>,
    pub hashes: ResolvedVc<TracedModuleDataHashes>,
}

/// This caches the paths for all modules in the graph without eagerly hashing their contents.
#[turbo_tasks::function]
async fn traced_module_idents_for_graph(
    module_graph: Vc<ModuleGraph>,
    traced_entries: Vc<Modules>,
) -> Result<Vc<TracedModuleDataIdents>> {
    // This function is very similar to traced_modules_for_entries, but doesn't apply the glob and
    // is executed only once for the whole graph.
    let module_graph = module_graph.await?;
    let entries = module_graph.all_entry_modules();

    let traced_entries = traced_entries.await?.into_iter().collect::<FxHashSet<_>>();

    let mut traced_modules = FxHashSet::default();
    module_graph.traverse_edges_dfs(
        entries,
        &mut (),
        |parent, target, _| {
            let Some((parent, ref_data)) = parent else {
                if traced_entries.contains(&target) {
                    traced_modules.insert(target);
                }
                return Ok(GraphTraversalAction::Continue);
            };

            if should_visit_for_tracing(&ref_data.chunking_type, traced_modules.contains(&parent)) {
                traced_modules.insert(target);
            };
            Ok(GraphTraversalAction::Continue)
        },
        |_, _, _| Ok(()),
        true,
    )?;

    Ok(Vc::cell(
        traced_modules
            .into_iter()
            .map(async |module| Ok((module, module.ident().await?)))
            .try_join()
            .await?
            .into_iter()
            .collect(),
    ))
}

/// This caches the paths and content hashes for all modules in the graph so that we don't have to
/// compute them once per page.
#[turbo_tasks::function]
pub async fn traced_module_data_for_graph(
    module_graph: Vc<ModuleGraph>,
    traced_entries: Vc<Modules>,
    hash_salt: Vc<RcStr>,
) -> Result<Vc<TracedModuleData>> {
    let idents = traced_module_idents_for_graph(module_graph, traced_entries)
        .to_resolved()
        .await?;
    let hashes = idents
        .await?
        .keys()
        .copied()
        .map(async |module| {
            Ok((
                module,
                module
                    .source()
                    .await?
                    .context("NFT module has no content")?
                    .content()
                    .hash(hash_salt, HashAlgorithm::Xxh3Hash128Hex)
                    .await?,
            ))
        })
        .try_join()
        .await?
        .into_iter()
        .collect();

    Ok(TracedModuleData {
        idents,
        hashes: ResolvedVc::cell(hashes),
    }
    .cell())
}

#[turbo_tasks::value(shared)]
struct ForbiddenTracedFileIssue {
    parent: FileSystemPath,
    issue_source: Option<IssueSource>,
    /// The dynamic function whose access triggered the trace (e.g.
    /// `fs.readFileSync`), used to name the offending call in the message.
    origin_fn_name: Option<RcStr>,
}

#[turbo_tasks::value_impl]
impl ForbiddenTracedFileIssue {
    #[turbo_tasks::function]
    pub async fn new(
        parent: FileSystemPath,
        issue_source: Option<IssueSource>,
        origin_fn_name: Option<RcStr>,
    ) -> Result<Vc<Self>> {
        Ok(Self {
            parent,
            issue_source,
            origin_fn_name,
        }
        .cell())
    }
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for ForbiddenTracedFileIssue {
    fn severity(&self) -> IssueSeverity {
        // Ideally this would be an error, but for now we keep it a warning to avoid breaking
        // existing apps
        IssueSeverity::Warning
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Misc
    }

    fn source(&self) -> Option<IssueSource> {
        self.issue_source
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.parent.clone())
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(rcstr!(
            "Dynamic filesystem access causes tracing of the whole project"
        )))
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        let stack = vec![
            StyledString::Text(rcstr!(
                "Static analysis determined that this filesystem access causes the whole project \
                 to be traced and included in the output."
            )),
            StyledString::Text(rcstr!(
                "This is usually unintentional and leads to all source files (including the \
                 public folder) to be deployed as part of the server code."
            )),
            StyledString::Text(rcstr!(
                "This can slow down deployments or lead to failures when size limits are exceeded."
            )),
            StyledString::Text(rcstr!("To resolve this, you can")),
            StyledString::Line(vec![
                StyledString::Text(rcstr!(
                    "- make sure the path is statically scoped to some subfolder, for example "
                )),
                StyledString::Code(rcstr!("path.join(process.cwd(), 'data', bar)")),
                StyledString::Text(rcstr!(", or")),
            ]),
            StyledString::Text(rcstr!("- only use them in development, or")),
            StyledString::Line(vec![
                StyledString::Text(rcstr!(
                    "- opt out by adding an ignore comment to the highlighted call: "
                )),
                StyledString::Code(
                    format!(
                        "{fn_name}(/*turbopackIgnore: true*/ ...)",
                        fn_name = self.origin_fn_name.as_deref().unwrap_or("someFsOperation")
                    )
                    .into(),
                ),
                StyledString::Text(rcstr!(", or")),
            ]),
            StyledString::Text(rcstr!("- remove them.")),
        ];
        Ok(Some(StyledString::Stack(stack)))
    }
}

#[cfg(all(test, unix))]
mod tests {
    use std::{
        fs::{create_dir_all, write},
        os::unix::fs::symlink,
    };

    use turbo_rcstr::{RcStr, rcstr};
    use turbo_tasks::Vc;
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
    use turbo_tasks_fs::{
        DiskFileSystem, FileSystem,
        glob::{Glob, GlobOptions},
    };

    use crate::nft::get_glob_includes;

    #[turbo_tasks::function(operation, root)]
    async fn assert_glob_includes_operation(disk_root: RcStr) -> anyhow::Result<()> {
        let root = DiskFileSystem::new(rcstr!("test"), Vc::cell(disk_root))
            .root()
            .owned()
            .await?;
        let includes = get_glob_includes(
            root,
            Glob::new(
                rcstr!("**"),
                GlobOptions {
                    contains: true,
                    ..Default::default()
                },
            ),
        )
        .await?;

        assert_eq!(
            includes
                .iter()
                .map(|path| path.path.as_str())
                .collect::<Vec<_>>(),
            [
                "alias",
                "alias-chain",
                "dangling",
                "file-link",
                "real/file.txt",
            ]
        );
        Ok(())
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn glob_includes_resolve_files_and_retain_symlinks() {
        let scratch = tempfile::tempdir().unwrap();
        let root = scratch.path();
        create_dir_all(root.join("real")).unwrap();
        write(root.join("real/file.txt"), "content").unwrap();
        symlink("real", root.join("alias")).unwrap();
        symlink("alias", root.join("alias-chain")).unwrap();
        symlink("real/file.txt", root.join("file-link")).unwrap();
        symlink("missing", root.join("dangling")).unwrap();

        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        let disk_root: RcStr = root.to_str().unwrap().into();
        tt.run_once(async move {
            assert_glob_includes_operation(disk_root)
                .read_strongly_consistent()
                .await?;
            anyhow::Ok(())
        })
        .await
        .unwrap();
    }
}
