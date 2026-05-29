use std::{
    collections::{BTreeSet, VecDeque},
    ops::Deref,
};

use anyhow::{Context, Result, bail};
use bincode::{Decode, Encode};
use next_core::{app_structure::FileSystemPathVec, next_config::NextConfig};
use rustc_hash::{FxHashMap, FxHashSet};
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexMap, FxIndexSet, NonLocalValue, ReadRef, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt,
    Vc, trace::TraceRawVcs,
};
use turbo_tasks_fs::{
    DirectoryEntry, FileSystemPath,
    glob::{Glob, GlobOptions},
};
use turbo_tasks_hash::HashAlgorithm;
use turbopack_core::{
    asset::Asset,
    chunk::{ChunkingType, TracedMode},
    ident::AssetIdent,
    module::{Module, Modules},
    module_graph::{GraphTraversalAction, ModuleGraph},
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

#[turbo_tasks::function]
pub async fn trace_endpoint(
    project: ResolvedVc<Project>,
    page_name: Option<RcStr>,
    module_graph: ResolvedVc<ModuleGraph>,
    entry_modules: Vec<ResolvedVc<Box<dyn Module>>>,
) -> Result<Vc<EndpointTraceResult>> {
    let span = tracing::info_span!("trace endpoint", path = debug(&page_name));
    async {
        let project_path = project.project_path().owned().await?;
        let next_config = project.next_config();

        let output_file_tracing_includes = &*next_config.output_file_tracing_includes().await?;

        // Collect referenced assets and externals from module graph
        let all_modules = traced_modules_for_entries(
            *module_graph,
            Vc::cell(entry_modules.clone()),
            tracing_exclude_glob(page_name.clone(), project_path.clone(), next_config)
                .await?
                .map(|v| *v),
            false,
        )
        .await?;

        let module_data = traced_module_data_for_graph(*module_graph, false)
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
                    // symlink, as this can result in invalid ZIP files and
                    // deployment failures. For example
                    // node_modules/.pnpm/node_modules/@libsql/client/package.json
                    // where
                    // node_modules/.pnpm/node_modules/@libsql/client is a symlink
                    let mut current_path = referenced_chunk_path.parent();
                    loop {
                        use turbo_tasks_fs::FileSystemEntryType;

                        if current_path.is_root() {
                            break;
                        }

                        if matches!(
                            &*current_path.get_type().await?,
                            FileSystemEntryType::Symlink
                        ) {
                            turbo_tasks::turbobail!(
                                "Encountered file inside of symlink in NFT list: {current_path} \
                                 is a symlink, but {referenced_chunk_path} was created inside of \
                                 it"
                            );
                        }

                        current_path = current_path.parent();
                    }
                }

                Ok(Some(module))
            })
            .try_flat_join()
            .await?;

        // Apply outputFileTracingIncludes and outputFileTracingExcludes
        // Extract route from chunk path for pattern matching
        let includes = if let Some(route) = &page_name {
            let mut combined_includes_by_root: FxIndexMap<FileSystemPath, Vec<&str>> =
                FxIndexMap::default();

            // Process includes
            if let Some(includes_config) = output_file_tracing_includes
                && let Some(includes_obj) = includes_config.as_object()
            {
                for (glob_pattern, include_patterns) in includes_obj {
                    // Check if the route matches the glob pattern
                    let glob =
                        Glob::new(glob_pattern.as_str().into(), GlobOptions { contains: true })
                            .await?;
                    if glob.matches(route)
                        && let Some(patterns) = include_patterns.as_array()
                    {
                        for pattern in patterns {
                            if let Some(pattern_str) = pattern.as_str() {
                                let (glob, root) =
                                    relativize_glob(pattern_str, project_path.clone())?;
                                combined_includes_by_root
                                    .entry(root)
                                    .or_default()
                                    .push(glob);
                            }
                        }
                    }
                }
            }

            // Apply includes - find additional files that match the include patterns
            let includes = combined_includes_by_root
                .into_iter()
                .map(|(root, globs)| {
                    let glob = Glob::new(
                        format!("{{{}}}", globs.join(",")).into(),
                        GlobOptions { contains: true },
                    );
                    apply_includes(root, glob)
                })
                .try_join()
                .await?;

            includes.into_iter().flatten().map(|path| path.0).collect()
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

/// SAFETY: only use this if you can guarantee that all the filepath are on the same filesystem.
/// The ord implementation only takes the `.path` into account, not the `.fs`
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode, NonLocalValue, TraceRawVcs)]
struct SortableFileSystemPath(FileSystemPath);
impl Deref for SortableFileSystemPath {
    type Target = FileSystemPath;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
impl Ord for SortableFileSystemPath {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.0.path.cmp(&other.0.path)
    }
}
impl PartialOrd for SortableFileSystemPath {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

/// Apply outputFileTracingIncludes patterns to find additional files
async fn apply_includes(
    project_root_path: FileSystemPath,
    glob: Vc<Glob>,
) -> Result<BTreeSet<SortableFileSystemPath>> {
    // Read files matching the glob pattern from the project root
    // This result itself has random order, but the BTreeSet will ensure a deterministic ordering.
    let glob_result = project_root_path.read_glob(glob).await?;

    // Walk the full glob_result using an explicit stack to avoid async recursion overheads.
    // Use a BTreeSet to get determinstic order (return value of `read_glob` has random order).
    let mut result = BTreeSet::new();
    let mut stack = VecDeque::new();
    stack.push_back(glob_result);
    while let Some(glob_result) = stack.pop_back() {
        // Process direct results (files and directories at this level)
        for entry in glob_result.results.values() {
            let (DirectoryEntry::File(file_path) | DirectoryEntry::Symlink(file_path)) = entry
            else {
                continue;
            };

            result.insert(SortableFileSystemPath(file_path.clone()));
        }

        for nested_result in glob_result.inner.values() {
            let nested_result_ref = nested_result.await?;
            stack.push_back(nested_result_ref);
        }
    }
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
        let output_file_tracing_excludes = next_config.output_file_tracing_excludes().await?;
        if let Some(excludes_config) = &*output_file_tracing_excludes {
            let mut combined_excludes = BTreeSet::new();

            if let Some(excludes_obj) = excludes_config.as_object() {
                for (glob_pattern, exclude_patterns) in excludes_obj {
                    // Check if the route matches the glob pattern
                    let glob = Glob::new(
                        RcStr::from(glob_pattern.clone()),
                        GlobOptions { contains: true },
                    )
                    .await?;
                    if glob.matches(&route)
                        && let Some(patterns) = exclude_patterns.as_array()
                    {
                        for pattern in patterns {
                            if let Some(pattern_str) = pattern.as_str() {
                                let (glob, root) =
                                    relativize_glob(pattern_str, project_path.clone())?;
                                let glob = if root.path.is_empty() {
                                    glob.to_string()
                                } else {
                                    format!("{root}/{glob}")
                                };
                                combined_excludes.insert(glob);
                            }
                        }
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
                    GlobOptions { contains: true },
                )
                .to_resolved()
                .await?;

                Vc::cell(Some(glob))
            }
        } else {
            Vc::cell(None)
        }
    } else {
        Vc::cell(None)
    })
}

#[turbo_tasks::function]
pub async fn traced_modules_for_entries(
    module_graph: Vc<ModuleGraph>,
    entry_modules: Vc<Modules>,
    exclude_glob: Option<Vc<Glob>>,
    entries_are_traced: bool,
) -> Result<Vc<Modules>> {
    let exclude_glob = if let Some(exclude_glob) = exclude_glob {
        Some(exclude_glob.await?)
    } else {
        None
    };
    let module_idents = if exclude_glob.is_some() {
        let data = traced_module_data_for_graph(module_graph, entries_are_traced).await?;
        Some(data.idents.await?)
    } else {
        None
    };

    let mut traced_modules = FxIndexSet::default();
    module_graph.await?.traverse_edges_dfs(
        entry_modules.await?.iter().copied(),
        &mut (),
        |parent, target, _| {
            let Some((parent, ref_data)) = parent else {
                if entries_are_traced {
                    traced_modules.insert(target);
                }
                return Ok(GraphTraversalAction::Continue);
            };

            if should_visit_for_tracing(&ref_data.chunking_type, traced_modules.contains(&parent)) {
                if let Some(exclude_glob) = &exclude_glob
                    && exclude_glob.matches(
                        &module_idents
                            .as_ref()
                            .unwrap()
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

/// This caches the paths for all modules in the graph so that we don't have to do it once per page.
#[turbo_tasks::function]
pub async fn traced_module_data_for_graph(
    module_graph: Vc<ModuleGraph>,
    entries_are_traced: bool,
) -> Result<Vc<TracedModuleData>> {
    // This function is very similar to traced_modules_for_entries, but doesn't apply the glob and
    // is executed only once for the whole graph.
    let module_graph = module_graph.await?;
    let entries = module_graph.graphs.iter().flat_map(|g| g.entry_modules());

    let mut traced_modules = FxHashSet::default();
    module_graph.traverse_edges_dfs(
        entries,
        &mut (),
        |parent, target, _| {
            let Some((parent, ref_data)) = parent else {
                if entries_are_traced {
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

    let (idents, hashes): (FxHashMap<_, _>, FxHashMap<_, _>) = traced_modules
        .into_iter()
        .map(async |module| {
            Ok((
                (module, module.ident().await?),
                (
                    module,
                    module
                        .source()
                        .await?
                        .context("NFT module has no content")?
                        .content()
                        .hash(HashAlgorithm::Xxh3Hash128Hex)
                        .await?,
                ),
            ))
        })
        .try_join()
        .await?
        .into_iter()
        .unzip();

    Ok(TracedModuleData {
        idents: ResolvedVc::cell(idents),
        hashes: ResolvedVc::cell(hashes),
    }
    .cell())
}

/// The globs defined in the next.config.mjs are relative to the project root.
/// The glob walker in turbopack is somewhat naive so we handle relative path directives first so
/// traversal doesn't need to consider them and can just traverse 'down' the tree.
/// The main alternative is to merge glob evaluation with directory traversal which is what the npm
/// `glob` package does, but this would be a substantial rewrite.
pub(crate) fn relativize_glob(
    glob: &str,
    relative_to: FileSystemPath,
) -> Result<(&str, FileSystemPath)> {
    let mut relative_to = relative_to;
    let mut processed_glob = glob;
    loop {
        if let Some(stripped) = processed_glob.strip_prefix("../") {
            if relative_to.path.is_empty() {
                bail!(
                    "glob '{glob}' is invalid, it has a prefix that navigates out of the project \
                     root"
                );
            }
            relative_to = relative_to.parent();
            processed_glob = stripped;
        } else if let Some(stripped) = processed_glob.strip_prefix("./") {
            processed_glob = stripped;
        } else {
            break;
        }
    }
    Ok((processed_glob, relative_to))
}

#[cfg(test)]
mod tests {
    use turbo_tasks::ResolvedVc;
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
    use turbo_tasks_fs::{FileSystemPath, NullFileSystem};

    use super::*;

    fn create_test_fs_path(path: &str) -> FileSystemPath {
        FileSystemPath {
            fs: ResolvedVc::upcast(NullFileSystem {}.resolved_cell()),
            path: path.into(),
        }
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_relativize_glob_normal_patterns() {
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async {
            // Test normal glob patterns without relative prefixes
            let base_path = create_test_fs_path("project/src");

            let (glob, path) = relativize_glob("*.js", base_path.clone()).unwrap();
            assert_eq!(glob, "*.js");
            assert_eq!(path.path.as_str(), "project/src");

            let (glob, path) = relativize_glob("components/**/*.tsx", base_path.clone()).unwrap();
            assert_eq!(glob, "components/**/*.tsx");
            assert_eq!(path.path.as_str(), "project/src");

            let (glob, path) = relativize_glob("lib/utils.ts", base_path.clone()).unwrap();
            assert_eq!(glob, "lib/utils.ts");
            assert_eq!(path.path.as_str(), "project/src");
            Ok(())
        })
        .await
        .unwrap();
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_relativize_glob_current_directory_prefix() {
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async {
            let base_path = create_test_fs_path("project/src");

            // Single ./ prefix
            let (glob, path) = relativize_glob("./components/*.tsx", base_path.clone()).unwrap();
            assert_eq!(glob, "components/*.tsx");
            assert_eq!(path.path.as_str(), "project/src");

            // Multiple ./ prefixes
            let (glob, path) = relativize_glob("././utils.js", base_path.clone()).unwrap();
            assert_eq!(glob, "utils.js");
            assert_eq!(path.path.as_str(), "project/src");

            // ./ with complex glob
            let (glob, path) = relativize_glob("./lib/**/*.{js,ts}", base_path.clone()).unwrap();
            assert_eq!(glob, "lib/**/*.{js,ts}");
            assert_eq!(path.path.as_str(), "project/src");
            Ok(())
        })
        .await
        .unwrap();
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_relativize_glob_parent_directory_navigation() {
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async {
            let base_path = create_test_fs_path("project/src/components");

            // Single ../ prefix
            let (glob, path) = relativize_glob("../utils/*.js", base_path.clone()).unwrap();
            assert_eq!(glob, "utils/*.js");
            assert_eq!(path.path.as_str(), "project/src");

            // Multiple ../ prefixes
            let (glob, path) = relativize_glob("../../lib/*.ts", base_path.clone()).unwrap();
            assert_eq!(glob, "lib/*.ts");
            assert_eq!(path.path.as_str(), "project");

            // Complex navigation with glob
            let (glob, path) =
                relativize_glob("../../../external/**/*.json", base_path.clone()).unwrap();
            assert_eq!(glob, "external/**/*.json");
            assert_eq!(path.path.as_str(), "");
            Ok(())
        })
        .await
        .unwrap();
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_relativize_glob_mixed_prefixes() {
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async {
            let base_path = create_test_fs_path("project/src/components");

            // ../ followed by ./
            let (glob, path) = relativize_glob(".././utils/*.js", base_path.clone()).unwrap();
            assert_eq!(glob, "utils/*.js");
            assert_eq!(path.path.as_str(), "project/src");

            // ./ followed by ../
            let (glob, path) = relativize_glob("./../lib/*.ts", base_path.clone()).unwrap();
            assert_eq!(glob, "lib/*.ts");
            assert_eq!(path.path.as_str(), "project/src");

            // Multiple mixed prefixes
            let (glob, path) =
                relativize_glob("././../.././external/*.json", base_path.clone()).unwrap();
            assert_eq!(glob, "external/*.json");
            assert_eq!(path.path.as_str(), "project");
            Ok(())
        })
        .await
        .unwrap();
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_relativize_glob_error_navigation_out_of_root() {
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async {
            // Test navigating out of project root with empty path
            let empty_path = create_test_fs_path("");
            let result = relativize_glob("../outside.js", empty_path);
            assert!(result.is_err());
            assert!(
                result
                    .unwrap_err()
                    .to_string()
                    .contains("navigates out of the project root")
            );

            // Test navigating too far up from a shallow path
            let shallow_path = create_test_fs_path("project");
            let result = relativize_glob("../../outside.js", shallow_path);
            assert!(result.is_err());
            assert!(
                result
                    .unwrap_err()
                    .to_string()
                    .contains("navigates out of the project root")
            );

            // Test multiple ../ that would go out of root
            let base_path = create_test_fs_path("a/b");
            let result = relativize_glob("../../../outside.js", base_path);
            assert!(result.is_err());
            assert!(
                result
                    .unwrap_err()
                    .to_string()
                    .contains("navigates out of the project root")
            );
            Ok(())
        })
        .await
        .unwrap();
    }
}
