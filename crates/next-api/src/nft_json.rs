use std::collections::{BTreeSet, VecDeque};

use anyhow::{Result, bail};
use serde_json::json;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    ReadRef, ResolvedVc, TryFlatJoinIterExt, Vc,
    graph::{AdjacencyMap, GraphTraversal},
};
use turbo_tasks_fs::{DirectoryEntry, File, FileSystem, FileSystemPath, glob::Glob};
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
    page_name: Option<RcStr>,
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
            page_name,
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
) -> Result<Option<RcStr>> {
    // include assets in the outputs such as referenced chunks
    if path_ref.is_inside_ref(output_root) {
        return Ok(Some(ident_folder.get_relative_path_to(path_ref).unwrap()));
    }

    // include assets in the project root such as images and traced references (externals)
    if path_ref.is_inside_ref(project_root) {
        return Ok(Some(
            ident_folder_in_project_fs
                .get_relative_path_to(path_ref)
                .unwrap(),
        ));
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
    // Read files matching the glob pattern from the project root
    let glob_result = project_root_path.read_glob(glob).await?;

    // Walk the full glob_result using an explicit stack to avoid async recursion overheads.
    let mut result = BTreeSet::new();
    let mut stack = VecDeque::new();
    stack.push_back(glob_result);
    while let Some(glob_result) = stack.pop_back() {
        // Process direct results (files and directories at this level)
        for entry in glob_result.results.values() {
            let DirectoryEntry::File(file_path) = entry else {
                continue;
            };

            let file_path_ref = file_path;
            // Convert to relative path from ident_folder to the file
            if let Some(relative_path) = ident_folder.get_relative_path_to(file_path_ref) {
                result.insert(relative_path);
            }
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

        let exclude_glob = if let Some(route) = &this.page_name {
            let project_path = this.project.project_path().await?;

            if let Some(excludes_config) = output_file_tracing_excludes {
                let mut combined_excludes = BTreeSet::new();

                if let Some(excludes_obj) = excludes_config.as_object() {
                    for (glob_pattern, exclude_patterns) in excludes_obj {
                        // Check if the route matches the glob pattern
                        let glob = Glob::new(RcStr::from(glob_pattern.clone())).await?;
                        if glob.matches(route)
                            && let Some(patterns) = exclude_patterns.as_array()
                        {
                            for pattern in patterns {
                                if let Some(pattern_str) = pattern.as_str() {
                                    combined_excludes.insert(pattern_str);
                                }
                            }
                        }
                    }
                }

                let glob = Glob::new(
                    format!(
                        "{project_path}/{{{}}}",
                        combined_excludes
                            .iter()
                            .copied()
                            .collect::<Vec<_>>()
                            .join(",")
                    )
                    .into(),
                );

                Some(glob)
            } else {
                None
            }
        } else {
            None
        };

        // Collect base assets first
        for referenced_chunk in
            all_assets_from_entries_filtered(Vc::cell(entries), client_root, exclude_glob).await?
        {
            if chunk.eq(referenced_chunk) {
                continue;
            }

            let referenced_chunk_path = referenced_chunk.path().await?;
            if referenced_chunk_path.has_extension(".map") {
                continue;
            }

            let Some(specifier) = get_output_specifier(
                &referenced_chunk_path,
                &ident_folder,
                &ident_folder_in_project_fs,
                &output_root_ref,
                &project_root_ref,
            )?
            else {
                continue;
            };
            result.insert(specifier);
        }

        // Apply outputFileTracingIncludes and outputFileTracingExcludes
        // Extract route from chunk path for pattern matching
        if let Some(route) = &this.page_name {
            let project_path = this.project.project_path().await?.clone_value();
            let mut combined_includes = BTreeSet::new();

            // Process includes
            if let Some(includes_config) = output_file_tracing_includes
                && let Some(includes_obj) = includes_config.as_object()
            {
                for (glob_pattern, include_patterns) in includes_obj {
                    // Check if the route matches the glob pattern
                    let glob = Glob::new(glob_pattern.as_str().into()).await?;
                    if glob.matches(route)
                        && let Some(patterns) = include_patterns.as_array()
                    {
                        for pattern in patterns {
                            if let Some(pattern_str) = pattern.as_str() {
                                combined_includes.insert(pattern_str);
                            }
                        }
                    }
                }
            }

            // Apply includes - find additional files that match the include patterns
            if !combined_includes.is_empty() {
                let glob = Glob::new(
                    format!(
                        "{{{}}}",
                        combined_includes
                            .iter()
                            .copied()
                            .collect::<Vec<_>>()
                            .join(",")
                    )
                    .into(),
                );
                let additional_files =
                    apply_includes(project_path, glob, &ident_folder_in_project_fs).await?;
                result.extend(additional_files);
            }
        }

        let json = json!({
          "version": 1,
          "files": result
        });

        Ok(AssetContent::file(File::from(json.to_string()).into()))
    }
}

/// Walks the asset graph from multiple assets and collect all referenced
/// assets, but filters out all client assets and glob matches.
#[turbo_tasks::function]
async fn all_assets_from_entries_filtered(
    entries: Vc<OutputAssets>,
    client_root: FileSystemPath,
    exclude_glob: Option<Vc<Glob>>,
) -> Result<Vc<OutputAssets>> {
    let exclude_glob = if let Some(exclude_glob) = exclude_glob {
        Some(exclude_glob.await?)
    } else {
        None
    };
    Ok(Vc::cell(
        AdjacencyMap::new()
            .skip_duplicates()
            .visit(
                entries.await?.iter().copied().map(ResolvedVc::upcast),
                |asset| get_referenced_server_assets(asset, &client_root, &exclude_glob),
            )
            .await
            .completed()?
            .into_inner()
            .into_postorder_topological()
            .collect(),
    ))
}

/// Computes the list of all chunk children of a given chunk, but filters out all client assets and
/// glob matches.
async fn get_referenced_server_assets(
    asset: ResolvedVc<Box<dyn OutputAsset>>,
    client_root: &FileSystemPath,
    exclude_glob: &Option<ReadRef<Glob>>,
) -> Result<Vec<ResolvedVc<Box<dyn OutputAsset>>>> {
    asset
        .references()
        .await?
        .iter()
        .map(async |asset| {
            let asset_path = asset.path().await?;
            if asset_path.is_inside_ref(client_root) {
                return Ok(None);
            }

            if exclude_glob
                .as_ref()
                .is_some_and(|g| g.matches(&asset_path.path))
            {
                return Ok(None);
            }

            Ok(Some(*asset))
        })
        .try_flat_join()
        .await
}
