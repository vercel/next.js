use std::{
    collections::{BTreeSet, VecDeque},
    ops::Deref,
};

use anyhow::{Context, Result};
use bincode::{Decode, Encode};
use next_core::{app_structure::FileSystemPathVec, next_config::NextConfig};
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexMap, NonLocalValue, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc,
    trace::TraceRawVcs,
};
use turbo_tasks_fs::{
    DirectoryEntry, FileSystemPath,
    glob::{Glob, GlobOptions},
};
use turbopack_core::{module::Module, module_graph::ModuleGraph};

use crate::{
    nft_json::{
        TracedModuleData, relativize_glob, traced_module_data_for_graph, traced_modules_for_entries,
    },
    project::Project,
};

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
    Ok(if let Some(route) = &page_name {
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
                    if glob.matches(route)
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
