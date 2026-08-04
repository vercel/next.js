use std::collections::{BTreeSet, VecDeque};

use anyhow::{Context, Result};
use async_trait::async_trait;
use next_core::{app_structure::FileSystemPathVec, next_config::NextConfig};
use rustc_hash::{FxHashMap, FxHashSet};
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxIndexMap, FxIndexSet, ReadRef, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc,
};
use turbo_tasks_fs::{
    DirectoryEntry, FileSystemPath,
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
        let module_data = turbo_tasks::read!(self.module_data)?;
        #[cfg(not(feature = "sync"))]
        let module_paths = turbo_tasks::read!(
            self.modules
                .iter()
                .map(async |m| Ok(turbo_tasks::read!(module_data.idents.get(m))?
                    .unwrap()
                    .path
                    .clone()))
                .try_join()
        )?;
        #[cfg(feature = "sync")]
        let module_paths = {
            let mut module_paths = Vec::new();
            for m in self.modules.iter() {
                module_paths.push({
                    Ok::<_, anyhow::Error>(
                        turbo_tasks::read!(module_data.idents.get(m))?
                            .unwrap()
                            .path
                            .clone(),
                    )
                }?);
            }
            module_paths
        };
        Ok(Vc::cell(
            self.includes.iter().cloned().chain(module_paths).collect(),
        ))
    }
}

#[turbo_tasks::function]
pub async fn trace_endpoint(
    project: ResolvedVc<Project>,
    page_name: Option<RcStr>,
    module_graph: ResolvedVc<ModuleGraph>,
    entry_module: ResolvedVc<Box<dyn Module>>,
) -> Result<Vc<EndpointTraceResult>> {
    let span = tracing::info_span!("trace endpoint", path = debug(&page_name));
    #[cfg(not(feature = "sync"))]
    {
        turbo_tasks::read!(
            async {
                let project_path = turbo_tasks::read!(project.project_path().owned())?;
                let next_config = project.next_config();

                let output_file_tracing_includes = turbo_tasks::read!(
                    next_config.output_file_tracing_includes(project_path.clone())
                )?;

                let traced_entries = project.additional_traced_modules();

                // Collect referenced assets and externals from module graph
                let all_modules = turbo_tasks::read!(traced_modules_for_entries(
                    *module_graph,
                    Vc::cell(vec![entry_module]),
                    traced_entries,
                    turbo_tasks::read!(tracing_exclude_glob(
                        page_name.clone(),
                        project_path.clone(),
                        next_config
                    ))?
                    .map(|v| *v),
                    Some(next_config.config_file_path(project_path.clone())),
                ))?;

                let module_data = turbo_tasks::read!(
                    traced_module_data_for_graph(*module_graph, traced_entries).to_resolved()
                )?;
                let module_paths = turbo_tasks::read!(module_data)?.idents;

                let modules = turbo_tasks::read!(
                    all_modules
                        .iter()
                        .copied()
                        .map(async |module| {
                            let entry = turbo_tasks::read!(module_paths.get(&module))?
                                .context("missing path for module")?;
                            let referenced_chunk_path = &entry.path;

                            if referenced_chunk_path.has_extension(".map") {
                                return Ok(None);
                            }

                            #[cfg(debug_assertions)]
                            {
                                // Verify that we there are no entries where a file is created
                                // inside of a symlink, as this can
                                // result in invalid ZIP files and deployment failures. For
                                // example
                                // node_modules/.pnpm/node_modules/@libsql/client/src/index.json
                                // where
                                // node_modules/.pnpm/node_modules/@libsql/client is a symlink
                                let parent_path = referenced_chunk_path.parent();
                                if turbo_tasks::read!(parent_path.realpath())? != parent_path {
                                    turbo_tasks::turbobail!(
                                        "Encountered file inside of symlink in NFT list: \
                                         {parent_path} is a symlink, but {referenced_chunk_path} \
                                         was created inside of it"
                                    );
                                }
                            }

                            Ok(Some(module))
                        })
                        .try_flat_join()
                )?;

                // Apply outputFileTracingIncludes
                // Extract route from chunk path for pattern matching
                let includes = if let Some(route) = &page_name {
                    let mut combined_includes_by_root: FxIndexMap<FileSystemPath, Vec<&str>> =
                        FxIndexMap::default();

                    for (route_glob, include_patterns) in output_file_tracing_includes.iter() {
                        if turbo_tasks::read!(route_glob)?.matches(route) {
                            for (glob, root) in include_patterns {
                                combined_includes_by_root
                                    .entry(root.clone())
                                    .or_default()
                                    .push(glob);
                            }
                        }
                    }

                    // Apply includes - find additional files that match the include patterns
                    let includes = turbo_tasks::read!(
                        combined_includes_by_root
                            .into_iter()
                            .map(|(root, globs)| {
                                let glob = Glob::new(
                                    format!("{{{}}}", globs.join(",")).into(),
                                    GlobOptions { contains: true },
                                );
                                get_glob_includes(root, glob)
                            })
                            .try_join()
                    )?;

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
        )
    }
    #[cfg(feature = "sync")]
    {
        let _span_guard = span.entered();
        let project_path = turbo_tasks::read!(project.project_path().owned())?;
        let next_config = project.next_config();

        let output_file_tracing_includes =
            turbo_tasks::read!(next_config.output_file_tracing_includes(project_path.clone()))?;

        let traced_entries = project.additional_traced_modules();

        // Collect referenced assets and externals from module graph
        let all_modules = turbo_tasks::read!(traced_modules_for_entries(
            *module_graph,
            Vc::cell(vec![entry_module]),
            traced_entries,
            turbo_tasks::read!(tracing_exclude_glob(
                page_name.clone(),
                project_path.clone(),
                next_config
            ))?
            .map(|v| *v),
            Some(next_config.config_file_path(project_path.clone())),
        ))?;

        let module_data = turbo_tasks::read!(
            traced_module_data_for_graph(*module_graph, traced_entries).to_resolved()
        )?;
        let module_paths = turbo_tasks::read!(module_data)?.idents;

        let mut modules = Vec::new();
        for module in all_modules.iter().copied() {
            let item = 'item: {
                let entry = turbo_tasks::read!(module_paths.get(&module))?
                    .context("missing path for module")?;
                let referenced_chunk_path = &entry.path;

                if referenced_chunk_path.has_extension(".map") {
                    break 'item None;
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
                    if turbo_tasks::read!(parent_path.realpath())? != parent_path {
                        turbo_tasks::turbobail!(
                            "Encountered file inside of symlink in NFT list: {parent_path} is a \
                             symlink, but {referenced_chunk_path} was created inside of it"
                        );
                    }
                }

                Some(module)
            };
            modules.extend(item);
        }

        // Apply outputFileTracingIncludes
        // Extract route from chunk path for pattern matching
        let includes = if let Some(route) = &page_name {
            let mut combined_includes_by_root: FxIndexMap<FileSystemPath, Vec<&str>> =
                FxIndexMap::default();

            for (route_glob, include_patterns) in output_file_tracing_includes.iter() {
                if turbo_tasks::read!(route_glob)?.matches(route) {
                    for (glob, root) in include_patterns {
                        combined_includes_by_root
                            .entry(root.clone())
                            .or_default()
                            .push(glob);
                    }
                }
            }

            // Apply includes - find additional files that match the include patterns
            let mut includes = Vec::new();
            for (root, globs) in combined_includes_by_root.into_iter() {
                let glob = Glob::new(
                    format!("{{{}}}", globs.join(",")).into(),
                    GlobOptions { contains: true },
                );
                includes.push(get_glob_includes(root, glob)?);
            }

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
}

turbo_tasks::dual_fn! {
/// Apply outputFileTracingIncludes patterns to find additional files
fn get_glob_includes(
    project_root_path: FileSystemPath,
    glob: Vc<Glob>,
) -> Result<Vec<FileSystemPath>> {
    // Read files matching the glob pattern from the project root
    // DETERMINISM: the sort_by call below ensures determinism.
    let glob_result = turbo_tasks::read!(project_root_path.read_glob(glob))?;

    // Walk the full glob_result using an explicit stack to avoid async recursion overheads.
    // Use a BTreeSet to get determinstic order (return value of `read_glob` has random order).
    let mut result = vec![];
    let mut stack = VecDeque::new();
    stack.push_back(glob_result);
    while let Some(glob_result) = stack.pop_back() {
        // Process direct results (files and directories at this level)
        for entry in glob_result.results.values() {
            let (DirectoryEntry::File(file_path) | DirectoryEntry::Symlink(file_path)) = entry
            else {
                continue;
            };

            result.push(file_path.clone());
        }

        for nested_result in glob_result.inner.values() {
            let nested_result_ref = turbo_tasks::read!(nested_result)?;
            stack.push_back(nested_result_ref);
        }
    }

    // All paths were matched from project_root_path, so they must all have the same `fs`. So it's
    // enough to sort by path.
    result.sort_by(|a, b| a.path.cmp(&b.path));

    Ok(result)
}
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
        let output_file_tracing_excludes =
            turbo_tasks::read!(next_config.output_file_tracing_excludes(project_path))?;
        let mut combined_excludes = BTreeSet::new();

        for (route_glob, exclude_patterns) in output_file_tracing_excludes.iter() {
            if turbo_tasks::read!(route_glob)?.matches(&route) {
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
            let glob = turbo_tasks::read!(
                Glob::new(
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
            )?;

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
        let exclude_glob = turbo_tasks::read!(exclude_glob)?;
        let data = turbo_tasks::read!(traced_module_data_for_graph(module_graph, traced_entries))?;
        Some((exclude_glob, turbo_tasks::read!(data.idents)?))
    } else {
        None
    };

    let forbidden_module = if let Some(forbidden_path) = forbidden_path {
        Some(ResolvedVc::upcast(turbo_tasks::read!(
            RawModule::new(Vc::upcast(FileSource::new(turbo_tasks::read!(
                forbidden_path.owned()
            )?)))
            .to_resolved()
        )?))
    } else {
        None
    };

    let mut forbidden_issues = vec![];
    let traced_entries = turbo_tasks::read!(traced_entries)?;
    let traced_entries_set = traced_entries.iter().copied().collect::<FxHashSet<_>>();

    let mut traced_modules = FxIndexSet::default();
    turbo_tasks::read!(module_graph)?.traverse_edges_dfs(
        turbo_tasks::read!(entry_modules)?
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
        turbo_tasks::read!(
            ForbiddenTracedFileIssue::new(
                turbo_tasks::read!(parent.ident())?.path.clone(),
                turbo_tasks::read!(reference.into_trait_ref())?.source(),
            )
            .to_resolved()
        )?
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

/// This caches the paths for all modules in the graph so that we don't have to do it once per page.
#[turbo_tasks::function]
pub async fn traced_module_data_for_graph(
    module_graph: Vc<ModuleGraph>,
    traced_entries: Vc<Modules>,
) -> Result<Vc<TracedModuleData>> {
    // This function is very similar to traced_modules_for_entries, but doesn't apply the glob and
    // is executed only once for the whole graph.
    let module_graph = turbo_tasks::read!(module_graph)?;
    let entries = module_graph.all_entry_modules();

    let traced_entries = turbo_tasks::read!(traced_entries)?
        .into_iter()
        .collect::<FxHashSet<_>>();

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

    #[cfg(not(feature = "sync"))]
    let (idents, hashes): (FxHashMap<_, _>, FxHashMap<_, _>) = turbo_tasks::read!(
        traced_modules
            .into_iter()
            .map(async |module| {
                Ok((
                    (module, turbo_tasks::read!(module.ident())?),
                    (
                        module,
                        turbo_tasks::read!(
                            turbo_tasks::read!(module.source())?
                                .context("NFT module has no content")?
                                .content()
                                .hash(HashAlgorithm::Xxh3Hash128Hex)
                        )?,
                    ),
                ))
            })
            .try_join()
    )?
    .into_iter()
    .unzip();
    #[cfg(feature = "sync")]
    let (idents, hashes): (FxHashMap<_, _>, FxHashMap<_, _>) = {
        let mut items = Vec::new();
        for module in traced_modules.into_iter() {
            items.push({
                Ok::<_, anyhow::Error>((
                    (module, turbo_tasks::read!(module.ident())?),
                    (
                        module,
                        turbo_tasks::read!(
                            turbo_tasks::read!(module.source())?
                                .context("NFT module has no content")?
                                .content()
                                .hash(HashAlgorithm::Xxh3Hash128Hex)
                        )?,
                    ),
                ))
            }?);
        }
        items.into_iter().unzip()
    };

    Ok(TracedModuleData {
        idents: ResolvedVc::cell(idents),
        hashes: ResolvedVc::cell(hashes),
    }
    .cell())
}

#[turbo_tasks::value(shared)]
struct ForbiddenTracedFileIssue {
    parent: FileSystemPath,
    issue_source: Option<IssueSource>,
}

#[turbo_tasks::value_impl]
impl ForbiddenTracedFileIssue {
    #[turbo_tasks::function]
    pub async fn new(
        parent: FileSystemPath,
        issue_source: Option<IssueSource>,
    ) -> Result<Vc<Self>> {
        Ok(Self {
            parent,
            issue_source,
        }
        .cell())
    }
}

#[cfg(not(feature = "sync"))]
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
                    "- make sure they are statically scoped to some subfolder: "
                )),
                StyledString::Code(rcstr!("path.join(process.cwd(), 'data', bar)")),
                StyledString::Text(rcstr!(", or")),
            ]),
            StyledString::Text(rcstr!("- only use them in development, or")),
            StyledString::Line(vec![
                StyledString::Text(rcstr!("- add ignore comments: ")),
                StyledString::Code(rcstr!(
                    "path.join(/*turbopackIgnore: true*/ process.cwd(), bar)"
                )),
                StyledString::Text(rcstr!(", or")),
            ]),
            StyledString::Text(rcstr!("- remove them.")),
        ];
        Ok(Some(StyledString::Stack(stack)))
    }
}

#[cfg(feature = "sync")]
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

    fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.parent.clone())
    }

    fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(rcstr!(
            "Dynamic filesystem access causes tracing of the whole project"
        )))
    }

    fn description(&self) -> Result<Option<StyledString>> {
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
                    "- make sure they are statically scoped to some subfolder: "
                )),
                StyledString::Code(rcstr!("path.join(process.cwd(), 'data', bar)")),
                StyledString::Text(rcstr!(", or")),
            ]),
            StyledString::Text(rcstr!("- only use them in development, or")),
            StyledString::Line(vec![
                StyledString::Text(rcstr!("- add ignore comments: ")),
                StyledString::Code(rcstr!(
                    "path.join(/*turbopackIgnore: true*/ process.cwd(), bar)"
                )),
                StyledString::Text(rcstr!(", or")),
            ]),
            StyledString::Text(rcstr!("- remove them.")),
        ];
        Ok(Some(StyledString::Stack(stack)))
    }
}
