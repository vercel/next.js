use anyhow::{Context, Result, bail};
use either::Either;
use serde_json::json;
use tracing::{Instrument, Level, Span};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    ReadRef, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, ValueToString, Vc,
    graph::{AdjacencyMap, GraphTraversal, Visit},
    turbofmt,
};
use turbo_tasks_fs::{File, FileContent, FileSystem, FileSystemPath, glob::Glob};
use turbo_tasks_hash::HashAlgorithm;
use turbopack_core::{
    asset::{Asset, AssetContent},
    module::Module,
    output::{OutputAsset, OutputAssets, OutputAssetsReference},
};

use crate::{
    nft::{EndpointTraceResult, tracing_exclude_glob},
    project::Project,
};

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
    page_name: Option<RcStr>,

    traced_files: ResolvedVc<EndpointTraceResult>,
}

#[turbo_tasks::value_impl]
impl NftJsonAsset {
    #[turbo_tasks::function]
    pub fn new(
        project: ResolvedVc<Project>,
        page_name: Option<RcStr>,
        chunk: ResolvedVc<Box<dyn OutputAsset>>,
        additional_assets: Vec<ResolvedVc<Box<dyn OutputAsset>>>,
        traced_files: ResolvedVc<EndpointTraceResult>,
    ) -> Vc<Self> {
        NftJsonAsset {
            chunk,
            project,
            additional_assets,
            page_name,
            traced_files,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for NftJsonAsset {}

#[turbo_tasks::value_impl]
impl OutputAsset for NftJsonAsset {
    #[turbo_tasks::function]
    async fn path(&self) -> Result<Vc<FileSystemPath>> {
        let path = turbo_tasks::read!(self.chunk.path())?;
        Ok(turbo_tasks::read!(path.fs.root())?
            .join(&format!("{}.nft.json", path.path))?
            .cell())
    }
}

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
    bail!("NftJsonAsset: cannot handle filepath '{path_ref}'");
}

#[turbo_tasks::value_impl]
impl Asset for NftJsonAsset {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        let this = &*turbo_tasks::read!(self)?;
        let span = tracing::info_span!(
            "output file tracing",
            path = display(turbo_tasks::read!(self.path().to_string())?)
        );
        #[cfg(not(feature = "sync"))]
        {
            turbo_tasks::read!(
                async move {
                    let project_path = turbo_tasks::read!(this.project.project_path().owned())?;

                    let output_root_ref = turbo_tasks::read!(this.project.output_fs().root())?;
                    let project_root_ref = turbo_tasks::read!(this.project.project_fs().root())?;
                    let next_config = this.project.next_config();

                    let client_root = this.project.client_fs().root();
                    let client_root = turbo_tasks::read!(client_root.owned())?;

                    // [project]/
                    let project_root_path =
                        turbo_tasks::read!(this.project.project_root_path().owned())?;
                    // Example: [output]/apps/my-website/.next/server/app -- without the
                    // `page.js.nft.json`
                    let ident_folder = turbo_tasks::read!(self.path())?.parent();
                    // Example: [project]/apps/my-website/.next/server/app -- without the
                    // `page.js.nft.json`
                    let ident_folder_in_project_fs = project_root_path.join(&ident_folder.path)?;

                    let chunk = this.chunk;
                    let entries = this
                        .additional_assets
                        .iter()
                        .copied()
                        .chain(std::iter::once(chunk))
                        .collect();

                    let exclude_glob = tracing_exclude_glob(
                        this.page_name.clone(),
                        project_path.clone(),
                        next_config,
                    );

                    enum AssetOrModule {
                        Asset(ResolvedVc<Box<dyn OutputAsset>>),
                        Module(ResolvedVc<Box<dyn Module>>),
                    }

                    // Collect referenced chunks (e.g. dynamic imports, etc).
                    let all_assets = turbo_tasks::read!(all_assets_from_entries_filtered(
                        Vc::cell(entries),
                        Some(client_root.clone()),
                        turbo_tasks::read!(exclude_glob)?.map(|v| *v),
                    ))?;

                    let traced_files = turbo_tasks::read!(this.traced_files)?;
                    let module_data = turbo_tasks::read!(traced_files.module_data)?;

                    let mut result: Vec<(RcStr, _)> = turbo_tasks::read!(
                        all_assets
                            .iter()
                            .filter(|a| **a != chunk)
                            .copied()
                            .map(AssetOrModule::Asset)
                            .chain(
                                traced_files
                                    .modules
                                    .iter()
                                    .copied()
                                    .map(AssetOrModule::Module),
                            )
                            .map(async |referenced| {
                                let (referenced_chunk_path, hash) = match referenced {
                                    AssetOrModule::Asset(v) => (
                                        Either::Left(turbo_tasks::read!(v.path())?),
                                        Either::Left(turbo_tasks::read!(
                                            v.content().hash(HashAlgorithm::Xxh3Hash128Hex)
                                        )?),
                                    ),
                                    AssetOrModule::Module(v) => {
                                        let ident = turbo_tasks::read!(module_data.idents.get(&v))?
                                            .context("missing path for module")?;
                                        let hash = turbo_tasks::read!(module_data.hashes.get(&v))?
                                            .context("missing hash for module")?;
                                        (Either::Right(ident.path.clone()), Either::Right(hash))
                                    }
                                };
                                let referenced_chunk_path = match &referenced_chunk_path {
                                    Either::Left(p) => &**p,
                                    Either::Right(p) => p,
                                };

                                if referenced_chunk_path.has_extension(".map") {
                                    return Ok(None);
                                }

                                let specifier = match get_output_specifier(
                                    referenced_chunk_path,
                                    &ident_folder,
                                    &ident_folder_in_project_fs,
                                    &output_root_ref,
                                    &project_root_ref,
                                ) {
                                    Ok(specifier) => specifier,
                                    Err(err) => {
                                        // ast-grep-ignore: no-context-turbofmt
                                        return Err(err.context(turbo_tasks::read!(turbofmt!(
                                            "NftJsonAsset: cannot handle filepath \
                                             '{referenced_chunk_path}', it is not under the \
                                             output_root: '{output_root_ref}' or the \
                                             project_root: '{project_root_ref}'",
                                        ))?));
                                    }
                                };

                                Ok(Some((specifier, hash)))
                            })
                            .try_flat_join()
                    )?;

                    result.extend(turbo_tasks::read!(
                        traced_files
                            .includes
                            .iter()
                            .map(async |file_path| {
                                let relative_path = ident_folder_in_project_fs
                                    .get_relative_path_to(file_path)
                                    .unwrap();
                                Ok((
                                    relative_path,
                                    Either::Left(turbo_tasks::read!(
                                        file_path.read().hash(HashAlgorithm::Xxh3Hash128Hex)
                                    )?),
                                ))
                            })
                            .try_join()
                    )?);

                    // Some of the output assets may have been included multiple times (in multiple
                    // chunking contexts), or asset contexts.
                    result.sort_unstable();
                    result.dedup();

                    let (files, file_hashes): (Vec<_>, Vec<_>) = result
                        .iter()
                        .map(|(name, hash)| {
                            (
                                name,
                                match hash {
                                    Either::Left(v) => &**v,
                                    Either::Right(v) => &**v,
                                },
                            )
                        })
                        .unzip();
                    // We can't just add this into "files" because Next.js sometimes decides to
                    // delete output files such as `.next/server/pages/index.js`
                    // if that page was prerendered and is fully static. An
                    // alternative would be to postprocess the nft file so that
                    // non-adapter consumers (which includes output:standalone) don't experience a
                    // breaking change, but instead we just add it as a separate
                    // field that only build-complete reads.
                    let entry_hash =
                        turbo_tasks::read!(chunk.content().hash(HashAlgorithm::Xxh3Hash128Hex))?;
                    let json = json!({
                      "version": 1,
                      "files": files,
                      "fileHashes": file_hashes,
                      "entryHash": entry_hash,
                    });

                    Ok(AssetContent::file(
                        FileContent::Content(File::from(json.to_string())).cell(),
                    ))
                }
                .instrument(span)
            )
        }
        #[cfg(feature = "sync")]
        {
            let _span_guard = span.entered();
            let project_path = turbo_tasks::read!(this.project.project_path().owned())?;

            let output_root_ref = turbo_tasks::read!(this.project.output_fs().root())?;
            let project_root_ref = turbo_tasks::read!(this.project.project_fs().root())?;
            let next_config = this.project.next_config();

            let client_root = this.project.client_fs().root();
            let client_root = turbo_tasks::read!(client_root.owned())?;

            // [project]/
            let project_root_path = turbo_tasks::read!(this.project.project_root_path().owned())?;
            // Example: [output]/apps/my-website/.next/server/app -- without the `page.js.nft.json`
            let ident_folder = turbo_tasks::read!(self.path())?.parent();
            // Example: [project]/apps/my-website/.next/server/app -- without the `page.js.nft.json`
            let ident_folder_in_project_fs = project_root_path.join(&ident_folder.path)?;

            let chunk = this.chunk;
            let entries = this
                .additional_assets
                .iter()
                .copied()
                .chain(std::iter::once(chunk))
                .collect();

            let exclude_glob =
                tracing_exclude_glob(this.page_name.clone(), project_path.clone(), next_config);

            enum AssetOrModule {
                Asset(ResolvedVc<Box<dyn OutputAsset>>),
                Module(ResolvedVc<Box<dyn Module>>),
            }

            // Collect referenced chunks (e.g. dynamic imports, etc).
            let all_assets = turbo_tasks::read!(all_assets_from_entries_filtered(
                Vc::cell(entries),
                Some(client_root.clone()),
                turbo_tasks::read!(exclude_glob)?.map(|v| *v),
            ))?;

            let traced_files = turbo_tasks::read!(this.traced_files)?;
            let module_data = turbo_tasks::read!(traced_files.module_data)?;

            let mut result: Vec<(RcStr, _)> = Vec::new();
            for referenced in all_assets
                .iter()
                .filter(|a| **a != chunk)
                .copied()
                .map(AssetOrModule::Asset)
                .chain(
                    traced_files
                        .modules
                        .iter()
                        .copied()
                        .map(AssetOrModule::Module),
                )
            {
                let item = 'item: {
                    let (referenced_chunk_path, hash) = match referenced {
                        AssetOrModule::Asset(v) => (
                            Either::Left(turbo_tasks::read!(v.path())?),
                            Either::Left(turbo_tasks::read!(
                                v.content().hash(HashAlgorithm::Xxh3Hash128Hex)
                            )?),
                        ),
                        AssetOrModule::Module(v) => {
                            let ident = turbo_tasks::read!(module_data.idents.get(&v))?
                                .context("missing path for module")?;
                            let hash = turbo_tasks::read!(module_data.hashes.get(&v))?
                                .context("missing hash for module")?;
                            (Either::Right(ident.path.clone()), Either::Right(hash))
                        }
                    };
                    let referenced_chunk_path = match &referenced_chunk_path {
                        Either::Left(p) => &**p,
                        Either::Right(p) => p,
                    };

                    if referenced_chunk_path.has_extension(".map") {
                        break 'item None;
                    }

                    let specifier = match get_output_specifier(
                        referenced_chunk_path,
                        &ident_folder,
                        &ident_folder_in_project_fs,
                        &output_root_ref,
                        &project_root_ref,
                    ) {
                        Ok(specifier) => specifier,
                        Err(err) => {
                            // ast-grep-ignore: no-context-turbofmt
                            return Err(err.context(turbo_tasks::read!(turbofmt!(
                                "NftJsonAsset: cannot handle filepath '{referenced_chunk_path}', \
                                 it is not under the output_root: '{output_root_ref}' or the \
                                 project_root: '{project_root_ref}'",
                            ))?));
                        }
                    };

                    Some((specifier, hash))
                };
                result.extend(item);
            }

            for file_path in traced_files.includes.iter() {
                let relative_path = ident_folder_in_project_fs
                    .get_relative_path_to(file_path)
                    .unwrap();
                result.push((
                    relative_path,
                    Either::Left(turbo_tasks::read!(
                        file_path.read().hash(HashAlgorithm::Xxh3Hash128Hex)
                    )?),
                ));
            }

            // Some of the output assets may have been included multiple times (in multiple chunking
            // contexts), or asset contexts.
            result.sort_unstable();
            result.dedup();

            let (files, file_hashes): (Vec<_>, Vec<_>) = result
                .iter()
                .map(|(name, hash)| {
                    (
                        name,
                        match hash {
                            Either::Left(v) => &**v,
                            Either::Right(v) => &**v,
                        },
                    )
                })
                .unzip();
            // We can't just add this into "files" because Next.js sometimes decides to delete
            // output files such as `.next/server/pages/index.js` if that page was prerendered and
            // is fully static. An alternative would be to postprocess the nft file so that
            // non-adapter consumers (which includes output:standalone) don't experience a breaking
            // change, but instead we just add it as a separate field that only build-complete
            // reads.
            let entry_hash =
                turbo_tasks::read!(chunk.content().hash(HashAlgorithm::Xxh3Hash128Hex))?;
            let json = json!({
              "version": 1,
              "files": files,
              "fileHashes": file_hashes,
              "entryHash": entry_hash,
            });

            Ok(AssetContent::file(
                FileContent::Content(File::from(json.to_string())).cell(),
            ))
        }
    }
}

/// Walks the asset graph from multiple assets and collect all referenced
/// assets, but filters out all client assets and glob matches.
#[turbo_tasks::function]
async fn all_assets_from_entries_filtered(
    entries: Vc<OutputAssets>,
    client_root: Option<FileSystemPath>,
    exclude_glob: Option<Vc<Glob>>,
) -> Result<Vc<OutputAssets>> {
    let exclude_glob = if let Some(exclude_glob) = exclude_glob {
        Some(turbo_tasks::read!(exclude_glob)?)
    } else {
        None
    };
    let emit_spans = tracing::enabled!(Level::INFO);
    #[cfg(not(feature = "sync"))]
    let roots = turbo_tasks::read!(
        turbo_tasks::read!(entries)?
            .iter()
            .map(async |asset| {
                Ok((
                    *asset,
                    if emit_spans {
                        // INVALIDATION: we don't need to invalidate the list of assets when
                        // the span name changes
                        Some(turbo_tasks::read!(asset.path_string().untracked())?)
                    } else {
                        None
                    },
                ))
            })
            .try_join()
    )?;
    #[cfg(feature = "sync")]
    let roots = {
        let mut roots = Vec::new();
        for asset in turbo_tasks::read!(entries)?.iter() {
            roots.push({
                Ok::<_, anyhow::Error>((
                    *asset,
                    if emit_spans {
                        // INVALIDATION: we don't need to invalidate the list of assets when
                        // the span name changes
                        Some(turbo_tasks::read!(asset.path_string().untracked())?)
                    } else {
                        None
                    },
                ))
            }?);
        }
        roots
    };
    Ok(Vc::cell(
        turbo_tasks::read!(AdjacencyMap::new().visit(
            roots,
            OutputAssetFilteredVisit {
                client_root,
                exclude_glob,
                emit_spans,
            },
        ))
        .completed()?
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
    type EdgesIntoIter = Vec<(
        (ResolvedVc<Box<dyn OutputAsset>>, Option<ReadRef<RcStr>>),
        (),
    )>;
    #[cfg(not(feature = "sync"))]
    type EdgesFuture = impl Future<Output = Result<Self::EdgesIntoIter>>;

    #[cfg(not(feature = "sync"))]
    fn edges(
        &mut self,
        node: &(ResolvedVc<Box<dyn OutputAsset>>, Option<ReadRef<RcStr>>),
    ) -> Self::EdgesFuture {
        let client_root = self.client_root.clone();
        let exclude_glob: Option<ReadRef<Glob>> = self.exclude_glob.clone();
        get_referenced_server_assets(self.emit_spans, node.0, client_root, exclude_glob)
    }

    #[cfg(feature = "sync")]
    fn edges(
        &self,
        node: &(ResolvedVc<Box<dyn OutputAsset>>, Option<ReadRef<RcStr>>),
    ) -> Result<Self::EdgesIntoIter> {
        let client_root = self.client_root.clone();
        let exclude_glob: Option<ReadRef<Glob>> = self.exclude_glob.clone();
        get_referenced_server_assets(self.emit_spans, node.0, client_root, exclude_glob)
    }

    #[cfg(not(feature = "sync"))]
    fn span(
        &mut self,
        node: &(ResolvedVc<Box<dyn OutputAsset>>, Option<ReadRef<RcStr>>),
        edge: Option<&()>,
    ) -> tracing::Span {
        self.node_span(node, edge)
    }

    /// The sync `Visit` trait takes `&self` everywhere (the streaming traversal driver
    /// shares the visitor with pool jobs) — separate signature, same body.
    #[cfg(feature = "sync")]
    fn span(
        &self,
        node: &(ResolvedVc<Box<dyn OutputAsset>>, Option<ReadRef<RcStr>>),
        edge: Option<&()>,
    ) -> tracing::Span {
        self.node_span(node, edge)
    }
}

impl OutputAssetFilteredVisit {
    fn node_span(
        &self,
        node: &(ResolvedVc<Box<dyn OutputAsset>>, Option<ReadRef<RcStr>>),
        _edge: Option<&()>,
    ) -> tracing::Span {
        if let Some(ident) = &node.1 {
            tracing::trace_span!("asset", name = display(ident))
        } else {
            Span::current()
        }
    }
}

turbo_tasks::dual_fn! {
/// Computes the list of all chunk children of a given chunk, but filters out all client assets and
/// glob matches.
fn get_referenced_server_assets(
    emit_spans: bool,
    asset: ResolvedVc<Box<dyn OutputAsset>>,
    client_root: Option<FileSystemPath>,
    exclude_glob: Option<ReadRef<Glob>>,
) -> Result<
    Vec<(
        (ResolvedVc<Box<dyn OutputAsset>>, Option<ReadRef<RcStr>>),
        (),
    )>,
> {
    let refs = turbo_tasks::read!(asset.references().all_assets())?;

    #[cfg(not(feature = "sync"))]
    {
        turbo_tasks::read!(refs.iter()
        .map(async |asset| {
            let asset_path = turbo_tasks::read!(asset.path())?;

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
                (
                    *asset,
                    if emit_spans {
                        // INVALIDATION: we don't need to invalidate the list of assets when the
                        // span name changes
                        Some(turbo_tasks::read!(asset.path_string().untracked())?)
                    } else {
                        None
                    },
                ),
                (),
            )))
        })
        .try_flat_join())
    }
    #[cfg(feature = "sync")]
    {
        let mut result = Vec::new();
        for asset in refs.iter() {
            let item = 'item: {
                let asset_path = turbo_tasks::read!(asset.path())?;

                if let Some(client_root) = &client_root
                    && asset_path.is_inside_ref(client_root)
                {
                    break 'item None;
                }

                if exclude_glob
                    .as_ref()
                    .is_some_and(|g| g.matches(&asset_path.path))
                {
                    break 'item None;
                }

                Some((
                    (
                        *asset,
                        if emit_spans {
                            // INVALIDATION: we don't need to invalidate the list of assets when the
                            // span name changes
                            Some(turbo_tasks::read!(asset.path_string().untracked())?)
                        } else {
                            None
                        },
                    ),
                    (),
                ))
            };
            result.extend(item);
        }
        Ok(result)
    }
}
}
