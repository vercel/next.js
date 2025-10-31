use std::collections::{BTreeSet, VecDeque};

use anyhow::{Result, bail};
use serde_json::json;
use tracing::{Instrument, Level, Span};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexMap, ReadRef, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, ValueToString, Vc,
    graph::{AdjacencyMap, GraphTraversal, Visit, VisitControlFlow},
};
use turbo_tasks_fs::{
    DirectoryEntry, File, FileSystem, FileSystemPath,
    glob::{Glob, GlobOptions},
};
use turbopack_core::{
    asset::{Asset, AssetContent},
    output::{OutputAsset, OutputAssets},
};

use crate::project::Project;

/// A json file that produces references to all files that are needed by the given module
/// at runtime. This will include, for example, node native modules, unanalyzable packages,
/// client side chunks, etc.
///
/// With this file, users can determine the minimum set of files that are needed alongside
/// their bundle.
#[turbo_tasks::value]
pub struct NftJsonAsset {
    project: ResolvedVc<Project>,
    /// The chunk for which the asset is being generated
    chunk: ResolvedVc<Box<dyn OutputAsset>>,
    /// Additional assets to include in the nft json. This can be used to manually collect assets
    /// that are known to be required but are not in the graph yet, for whatever reason.
    ///
    /// An example of this is the two-phase approach used by the `ClientReferenceManifest` in
    /// next.js.
    additional_assets: Vec<ResolvedVc<Box<dyn OutputAsset>>>,
    // The page name, e.g. `pages/index` or `app/route1`
    page_name: Option<String>,
}

#[turbo_tasks::value_impl]
impl NftJsonAsset {
    #[turbo_tasks::function]
    pub fn new(
        project: ResolvedVc<Project>,
        page_name: Option<RcStr>,
        chunk: ResolvedVc<Box<dyn OutputAsset>>,
        additional_assets: Vec<ResolvedVc<Box<dyn OutputAsset>>>,
    ) -> Vc<Self> {
        NftJsonAsset {
            chunk,
            project,
            additional_assets,
            page_name: page_name.map(|page_name| format!("/{page_name}")),
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for NftJsonAsset {
    #[turbo_tasks::function]
    async fn path(&self) -> Result<Vc<FileSystemPath>> {
        let path = self.chunk.path().await?;
        Ok(path
            .fs
            .root()
            .await?
            .join(&format!("{}.nft.json", path.path))?
            .cell())
    }
}

#[turbo_tasks::value(transparent)]
pub struct OutputSpecifier(Option<RcStr>);

fn get_output_specifier(
    path_ref: &FileSystemPath,
    ident_folder: &FileSystemPath,
    ident_folder_in_project_fs: &FileSystemPath,
    output_root: &FileSystemPath,
    project_root: &FileSystemPath,
) -> Result<RcStr> {
    // include assets in the outputs such as referenced chunks
    if path_ref.is_inside_ref(output_root) {
        return Ok(ident_folder.get_relative_path_to(path_ref).unwrap());
    }

    // include assets in the project root such as images and traced references (externals)
    if path_ref.is_inside_ref(project_root) {
        return Ok(ident_folder_in_project_fs
            .get_relative_path_to(path_ref)
            .unwrap());
    }

    // This should effectively be unreachable
    bail!("NftJsonAsset: cannot handle filepath {path_ref}");
}

/// Apply outputFileTracingIncludes patterns to find additional files
async fn apply_includes(
    project_root_path: FileSystemPath,
    glob: Vc<Glob>,
    ident_folder: &FileSystemPath,
) -> Result<BTreeSet<RcStr>> {
    debug_assert_eq!(project_root_path.fs, ident_folder.fs);
    // Read files matching the glob pattern from the project root
    // This result itself has random order, but the BTreeSet will ensure a deterministic ordering.
    let glob_result = project_root_path.read_glob(glob).await?;

    // Walk the full glob_result using an explicit stack to avoid async recursion overheads.
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

            // Convert to relative path from ident_folder to the file
            // unwrap is safe because project_root_path and ident_folder have the same filesystem
            // and paths produced by read_glob stay in the filesystem
            let relative_path = ident_folder.get_relative_path_to(file_path).unwrap();
            result.insert(relative_path);
        }

        for nested_result in glob_result.inner.values() {
            let nested_result_ref = nested_result.await?;
            stack.push_back(nested_result_ref);
        }
    }
    Ok(result)
}

#[turbo_tasks::value_impl]
impl Asset for NftJsonAsset {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        let this = &*self.await?;
        let span = tracing::info_span!(
            "output file tracing",
            path = display(self.path().to_string().await?)
        );
        async move {
            let mut result: BTreeSet<RcStr> = BTreeSet::new();

            let output_root_ref = this.project.output_fs().root().await?;
            let project_root_ref = this.project.project_fs().root().await?;
            let next_config = this.project.next_config();

            let output_file_tracing_includes = &*next_config.output_file_tracing_includes().await?;
            let output_file_tracing_excludes = &*next_config.output_file_tracing_excludes().await?;

            let client_root = this.project.client_fs().root();
            let client_root = client_root.owned().await?;

            // [project]/
            let project_root_path = this.project.project_root_path().owned().await?;
            // Example: [output]/apps/my-website/.next/server/app -- without the `page.js.nft.json`
            let ident_folder = self.path().await?.parent();
            // Example: [project]/apps/my-website/.next/server/app -- without the `page.js.nft.json`
            let ident_folder_in_project_fs = project_root_path.join(&ident_folder.path)?;

            let chunk = this.chunk;
            let entries = this
                .additional_assets
                .iter()
                .copied()
                .chain(std::iter::once(chunk))
                .collect();

            let project_path = this.project.project_path().owned().await?;
            let exclude_glob = if let Some(route) = &this.page_name {
                if let Some(excludes_config) = output_file_tracing_excludes {
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
                        None
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
                        );

                        Some(glob)
                    }
                } else {
                    None
                }
            } else {
                None
            };

            // Collect base assets first
            let all_assets = all_assets_from_entries_filtered(
                Vc::cell(entries),
                Some(client_root),
                exclude_glob,
            )
            .await?;

            for referenced_chunk in all_assets.iter().copied() {
                if chunk.eq(&referenced_chunk) {
                    continue;
                }

                let referenced_chunk_path = referenced_chunk.path().await?;

                if referenced_chunk_path.has_extension(".map") {
                    continue;
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
                            bail!(
                                "Encountered file inside of symlink in NFT list: {} is a symlink, \
                                 but {} was created inside of it",
                                current_path.value_to_string().await?,
                                referenced_chunk_path.value_to_string().await?
                            );
                        }

                        current_path = current_path.parent();
                    }
                }

                let specifier = get_output_specifier(
                    &referenced_chunk_path,
                    &ident_folder,
                    &ident_folder_in_project_fs,
                    &output_root_ref,
                    &project_root_ref,
                )?;

                result.insert(specifier);
            }

            // Apply outputFileTracingIncludes and outputFileTracingExcludes
            // Extract route from chunk path for pattern matching
            if let Some(route) = &this.page_name {
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
                        apply_includes(root, glob, &ident_folder_in_project_fs)
                    })
                    .try_join()
                    .await?;

                result.extend(includes.into_iter().flatten());
            }

            let json = json!({
              "version": 1,
              "files": result
            });

            Ok(AssetContent::file(File::from(json.to_string()).into()))
        }
        .instrument(span)
        .await
    }
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

/// Walks the asset graph from multiple assets and collect all referenced
/// assets, but filters out all client assets and glob matches.
#[turbo_tasks::function]
pub async fn all_assets_from_entries_filtered(
    entries: Vc<OutputAssets>,
    client_root: Option<FileSystemPath>,
    exclude_glob: Option<Vc<Glob>>,
) -> Result<Vc<OutputAssets>> {
    let exclude_glob = if let Some(exclude_glob) = exclude_glob {
        Some(exclude_glob.await?)
    } else {
        None
    };
    let emit_spans = tracing::enabled!(Level::INFO);
    Ok(Vc::cell(
        AdjacencyMap::new()
            .skip_duplicates()
            .visit(
                entries
                    .await?
                    .iter()
                    .map(async |asset| {
                        Ok((
                            *asset,
                            if emit_spans {
                                // INVALIDATION: we don't need to invalidate the list of assets when
                                // the span name changes
                                Some(asset.path_string().untracked().await?)
                            } else {
                                None
                            },
                        ))
                    })
                    .try_join()
                    .await?,
                OutputAssetFilteredVisit {
                    client_root,
                    exclude_glob,
                    emit_spans,
                },
            )
            .await
            .completed()?
            .into_inner()
            .into_postorder_topological()
            .map(|n| n.0)
            .collect(),
    ))
}

struct OutputAssetFilteredVisit {
    client_root: Option<FileSystemPath>,
    exclude_glob: Option<ReadRef<Glob>>,
    emit_spans: bool,
}
impl Visit<(ResolvedVc<Box<dyn OutputAsset>>, Option<ReadRef<RcStr>>)>
    for OutputAssetFilteredVisit
{
    type Edge = (ResolvedVc<Box<dyn OutputAsset>>, Option<ReadRef<RcStr>>);
    type EdgesIntoIter = Vec<Self::Edge>;
    type EdgesFuture = impl Future<Output = Result<Self::EdgesIntoIter>>;

    fn visit(&mut self, edge: Self::Edge) -> VisitControlFlow<Self::Edge> {
        VisitControlFlow::Continue(edge)
    }

    fn edges(
        &mut self,
        node: &(ResolvedVc<Box<dyn OutputAsset>>, Option<ReadRef<RcStr>>),
    ) -> Self::EdgesFuture {
        let client_root = self.client_root.clone();
        let exclude_glob = self.exclude_glob.clone();
        get_referenced_server_assets(self.emit_spans, node.0, client_root, exclude_glob)
    }

    fn span(
        &mut self,
        node: &(ResolvedVc<Box<dyn OutputAsset>>, Option<ReadRef<RcStr>>),
    ) -> tracing::Span {
        if let Some(ident) = &node.1 {
            tracing::trace_span!("asset", name = display(ident))
        } else {
            Span::current()
        }
    }
}

/// Computes the list of all chunk children of a given chunk, but filters out all client assets and
/// glob matches.
async fn get_referenced_server_assets(
    emit_spans: bool,
    asset: ResolvedVc<Box<dyn OutputAsset>>,
    client_root: Option<FileSystemPath>,
    exclude_glob: Option<ReadRef<Glob>>,
) -> Result<Vec<(ResolvedVc<Box<dyn OutputAsset>>, Option<ReadRef<RcStr>>)>> {
    let refs = asset.references().await?;

    refs.iter()
        .map(async |asset| {
            let asset_path = asset.path().await?;

            if let Some(client_root) = &client_root
                && asset_path.is_inside_ref(client_root)
            {
                return Ok(None);
            }

            if exclude_glob
                .as_ref()
                .is_some_and(|g| g.matches(&asset_path.path))
            {
                return Ok(None);
            }

            Ok(Some((
                *asset,
                if emit_spans {
                    // INVALIDATION: we don't need to invalidate the list of assets when the span
                    // name changes
                    Some(asset.path_string().untracked().await?)
                } else {
                    None
                },
            )))
        })
        .try_flat_join()
        .await
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
