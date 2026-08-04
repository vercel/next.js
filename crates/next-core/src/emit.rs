use anyhow::{Ok, Result};
use async_trait::async_trait;
use futures::join;
use smallvec::{SmallVec, smallvec};
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexMap, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, ValueToStringRef, Vc,
};
use turbo_tasks_fs::{FileContent, FileSystemPath, rebase};
use turbo_tasks_hash::{encode_hex, hash_xxh3_hash64};
use turbopack_core::{
    asset::{Asset, AssetContent},
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, StyledString},
    output::{ExpandedOutputAssets, OutputAsset, OutputAssets},
    reference::all_assets_from_entries,
};

/// Emits all assets transitively reachable from the given chunks, that are
/// inside the node root or the client root.
///
/// Assets inside the given client root are rebased to the given client output
/// path.
#[turbo_tasks::function]
pub async fn emit_all_assets(
    assets: Vc<OutputAssets>,
    node_root: FileSystemPath,
    client_relative_path: FileSystemPath,
    client_output_path: FileSystemPath,
) -> Result<()> {
    turbo_tasks::read!(
        emit_assets(
            all_assets_from_entries(assets),
            node_root,
            client_relative_path,
            client_output_path,
        )
        .as_side_effect()
    )?;
    Ok(())
}

/// Emits all assets transitively reachable from the given chunks, that are
/// inside the node root or the client root.
///
/// Assets inside the given client root are rebased to the given client output
/// path.
#[turbo_tasks::function]
pub async fn emit_assets(
    assets: Vc<ExpandedOutputAssets>,
    node_root: FileSystemPath,
    client_relative_path: FileSystemPath,
    client_output_path: FileSystemPath,
) -> Result<()> {
    enum Location {
        Node,
        Client,
    }
    #[cfg(not(feature = "sync"))]
    let assets = turbo_tasks::read!(
        turbo_tasks::read!(assets)?
            .iter()
            .copied()
            .map(async |asset| {
                let path = turbo_tasks::read!(asset.path().owned())?;
                let location = if path.is_inside_ref(&node_root) {
                    Location::Node
                } else if path.is_inside_ref(&client_relative_path) {
                    Location::Client
                } else {
                    return Ok(None);
                };
                Ok(Some((location, path, asset)))
            })
            .try_flat_join()
    )?;
    #[cfg(feature = "sync")]
    let assets = {
        let read_assets = turbo_tasks::read!(assets)?;
        let mut out = Vec::new();
        for asset in read_assets.iter().copied() {
            let path = turbo_tasks::read!(asset.path().owned())?;
            let location = if path.is_inside_ref(&node_root) {
                Location::Node
            } else if path.is_inside_ref(&client_relative_path) {
                Location::Client
            } else {
                continue;
            };
            out.push((location, path, asset));
        }
        out
    };

    type AssetVec = SmallVec<[ResolvedVc<Box<dyn OutputAsset>>; 1]>;
    let mut node_assets_by_path: FxIndexMap<FileSystemPath, AssetVec> = FxIndexMap::default();
    let mut client_assets_by_path: FxIndexMap<FileSystemPath, AssetVec> = FxIndexMap::default();
    for (location, path, asset) in assets {
        match location {
            Location::Node => {
                node_assets_by_path
                    .entry(path)
                    .or_insert_with(|| smallvec![])
                    .push(asset);
            }
            Location::Client => {
                client_assets_by_path
                    .entry(path)
                    .or_insert_with(|| smallvec![])
                    .push(asset);
            }
        }
    }

    /// Checks for duplicate assets at the same path. If duplicates with
    /// different content are found, emits an `EmitConflictIssue` for each
    /// conflict but still returns the first asset so emission can continue.
    turbo_tasks::dual_fn! {
    fn check_duplicates(
        path: &FileSystemPath,
        assets: AssetVec,
        node_root: &FileSystemPath,
    ) -> Result<()> {
        let mut iter = assets.into_iter();
        let first = iter.next().unwrap();
        let ext: RcStr = path.extension().unwrap_or_default().into();
        #[cfg(not(feature = "sync"))]
        let conflicts = turbo_tasks::read!(iter
            .map(async |next| {
                turbo_tasks::read!(assets_diff(*next, *first, ext.clone(), node_root.clone())
                    .owned())

            })
            .try_flat_join())
            ?;
        #[cfg(feature = "sync")]
        let conflicts = {
            let mut out = Vec::new();
            for next in iter {
                out.extend(turbo_tasks::read!(
                    assets_diff(*next, *first, ext.clone(), node_root.clone()).owned()
                )?);
            }
            out
        };
        if let Some(detail) = conflicts.into_iter().next() {
            #[turbo_tasks::function]
            fn emit_conflict_issue(path: FileSystemPath, detail: RcStr) {
                EmitConflictIssue {
                    asset_path: path.clone(),
                    detail,
                }
                .resolved_cell()
                .emit();
            }
            turbo_tasks::read!(emit_conflict_issue(path.clone(), detail)
                .as_side_effect())
                ?;
        }
        Ok(())
    }
    }

    // Use join! instead of try_join! to collect all errors deterministically
    // rather than returning whichever branch fails first non-deterministically.
    #[cfg(not(feature = "sync"))]
    {
        let (node_result, client_result) = join!(
            node_assets_by_path
                .into_iter()
                .map(|(path, assets)| {
                    let node_root = node_root.clone();

                    async move {
                        let asset = *assets.first().unwrap();
                        let span = tracing::info_span!(
                            "emit asset",
                            name = %turbo_tasks::read!(path.to_string_ref())?
                        );
                        turbo_tasks::read!(
                            async move {
                                turbo_tasks::read!(emit(*asset).as_side_effect())?;
                                // This need to be after `emit()`, so the asset is emitted even if
                                // this method crashes due to
                                // eventual consistency.
                                turbo_tasks::read!(check_duplicates(&path, assets, &node_root))?;
                                Ok(())
                            }
                            .instrument(span)
                        )
                    }
                })
                .try_join(),
            client_assets_by_path
                .into_iter()
                .map(|(path, assets)| {
                    let node_root = node_root.clone();
                    let client_relative_path = client_relative_path.clone();
                    let client_output_path = client_output_path.clone();

                    async move {
                        let span = tracing::info_span!(
                            "emit asset",
                            name = %turbo_tasks::read!(path.to_string_ref())?
                        );
                        turbo_tasks::read!(
                            async move {
                                let asset = *assets.first().unwrap();
                                // Client assets are emitted to the client output path, which is
                                // prefixed with _next. We need to rebase them to
                                // remove that prefix.
                                turbo_tasks::read!(
                                    emit_rebase(*asset, client_relative_path, client_output_path)
                                        .as_side_effect()
                                )?;
                                // This need to be after `emit_rebase()`, so the asset is emitted
                                // even if this method crashes due
                                // to eventual consistency.
                                turbo_tasks::read!(check_duplicates(&path, assets, &node_root))?;
                                Ok(())
                            }
                            .instrument(span)
                        )
                    }
                })
                .try_join(),
        );
        node_result?;
        client_result?;
    }
    // Sync: emit sequentially on the driver, but prewarm every asset's *content* on the
    // worker pool first. The async build fans the emits out via join!/try_join; the sync
    // `parallel!` gate only fans plain `Vc` reads and the emit bodies are effectful
    // side-effect reads, so they stay inline under the span (entered, not `.instrument`d).
    // The expensive part of each emit — `asset.content()` (chunk `code()` / minify /
    // file reads) — is a plain `Vc` read, so publishing them all up front lets the pool
    // compute the codegen chains in parallel; the serial emit loop below then runs on
    // cache hits, keeping emit order (and duplicate detection) identical to async.
    #[cfg(feature = "sync")]
    {
        turbo_tasks::parallel!(
            node_assets_by_path
                .values()
                .chain(client_assets_by_path.values())
                .map(|assets| (*assets.first().unwrap()).content())
        )?;
        for (path, assets) in node_assets_by_path {
            let asset = *assets.first().unwrap();
            let span = tracing::info_span!(
                "emit asset",
                name = %turbo_tasks::read!(path.to_string_ref())?
            );
            let _guard = span.entered();
            turbo_tasks::read!(emit(*asset).as_side_effect())?;
            turbo_tasks::read!(check_duplicates(&path, assets, &node_root))?;
        }
        for (path, assets) in client_assets_by_path {
            let asset = *assets.first().unwrap();
            let span = tracing::info_span!(
                "emit asset",
                name = %turbo_tasks::read!(path.to_string_ref())?
            );
            let _guard = span.entered();
            turbo_tasks::read!(
                emit_rebase(
                    *asset,
                    client_relative_path.clone(),
                    client_output_path.clone()
                )
                .as_side_effect()
            )?;
            turbo_tasks::read!(check_duplicates(&path, assets, &node_root))?;
        }
    }
    Ok(())
}

#[turbo_tasks::function]
async fn emit(asset: Vc<Box<dyn OutputAsset>>) -> Result<()> {
    turbo_tasks::read!(
        turbo_tasks::read!(asset.content().to_resolved())?
            .write(turbo_tasks::read!(asset.path().owned())?)
            .as_side_effect()
    )?;
    Ok(())
}

#[turbo_tasks::function]
async fn emit_rebase(
    asset: Vc<Box<dyn OutputAsset>>,
    from: FileSystemPath,
    to: FileSystemPath,
) -> Result<()> {
    let path =
        turbo_tasks::read!(rebase(turbo_tasks::read!(asset.path().owned())?, from, to).owned())?;
    let content = asset.content();
    turbo_tasks::read!(
        turbo_tasks::read!(content.to_resolved())?
            .write(path)
            .as_side_effect()
    )?;
    Ok(())
}

/// Compares two assets that target the same output path. If their content
/// differs, writes both versions under `node_root` as `<hash>.<ext>` and
/// returns a description of the difference.
#[turbo_tasks::function]
async fn assets_diff(
    asset1: Vc<Box<dyn OutputAsset>>,
    asset2: Vc<Box<dyn OutputAsset>>,
    extension: RcStr,
    node_root: FileSystemPath,
) -> Result<Vc<Option<RcStr>>> {
    let content1 = turbo_tasks::read!(asset1.content())?;
    let content2 = turbo_tasks::read!(asset2.content())?;

    let detail = match (&*content1, &*content2) {
        (AssetContent::File(content1), AssetContent::File(content2)) => {
            let content1 = turbo_tasks::read!(content1)?;
            let content2 = turbo_tasks::read!(content2)?;

            match (&*content1, &*content2) {
                (FileContent::NotFound, FileContent::NotFound) => None,
                (FileContent::Content(file1), FileContent::Content(file2)) => {
                    if file1 == file2 {
                        None
                    } else {
                        // Write both versions under node_root as <hash>.<ext> so the
                        // user can diff them.
                        let ext = &*extension;
                        let hash1 = encode_hex(hash_xxh3_hash64(file1.content().content_hash()));
                        let hash2 = encode_hex(hash_xxh3_hash64(file2.content().content_hash()));
                        let name1 = if ext.is_empty() {
                            hash1
                        } else {
                            format!("{hash1}.{ext}")
                        };
                        let name2 = if ext.is_empty() {
                            hash2
                        } else {
                            format!("{hash2}.{ext}")
                        };
                        let path1 = node_root.join(&name1)?;
                        let path2 = node_root.join(&name2)?;
                        turbo_tasks::read!(
                            path1
                                .write(FileContent::Content(file1.clone()).cell())
                                .as_side_effect()
                        )?;
                        turbo_tasks::read!(
                            path2
                                .write(FileContent::Content(file2.clone()).cell())
                                .as_side_effect()
                        )?;
                        Some(format!(
                            "file content differs, written to:\n  {}\n  {}",
                            turbo_tasks::read!(path1.to_string_ref())?,
                            turbo_tasks::read!(path2.to_string_ref())?,
                        ))
                    }
                }
                _ => Some(
                    "assets at the same path have mismatched file content types (one task wants \
                     to write the file, another wants to delete it)"
                        .into(),
                ),
            }
        }
        (
            AssetContent::Redirect {
                target: target1,
                link_type: link_type1,
            },
            AssetContent::Redirect {
                target: target2,
                link_type: link_type2,
            },
        ) => {
            if target1 == target2 && link_type1 == link_type2 {
                None
            } else {
                Some(format!(
                    "assets at the same path are both redirects but point to different targets: \
                     {target1} vs {target2}"
                ))
            }
        }
        _ => Some(
            "assets at the same path have different content types (one is a file, the other is a \
             redirect)"
                .into(),
        ),
    };

    Ok(Vc::cell(detail.map(|d| d.into())))
}

#[turbo_tasks::value]
struct EmitConflictIssue {
    asset_path: FileSystemPath,
    detail: RcStr,
}

#[cfg(not(feature = "sync"))]
#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for EmitConflictIssue {
    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.asset_path.clone())
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Emit
    }

    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(
            "Two or more assets with different content were emitted to the same output path".into(),
        ))
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Text(self.detail.clone())))
    }
}

#[cfg(feature = "sync")]
#[turbo_tasks::value_impl]
impl Issue for EmitConflictIssue {
    fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.asset_path.clone())
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Emit
    }

    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(
            "Two or more assets with different content were emitted to the same output path".into(),
        ))
    }

    fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Text(self.detail.clone())))
    }
}
