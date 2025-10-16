use anyhow::Result;
use tracing::{Instrument, Level, Span};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexSet, ReadRef, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc,
    graph::{AdjacencyMap, GraphTraversal, Visit, VisitControlFlow},
};
use turbo_tasks_fs::{FileSystemPath, rebase};
use turbopack_core::{
    asset::Asset,
    output::{OutputAsset, OutputAssets},
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
    emit_assets(
        all_assets_from_entries(assets),
        node_root,
        client_relative_path,
        client_output_path,
    )
    .as_side_effect()
    .await?;
    Ok(())
}

/// Emits all assets transitively reachable from the given chunks, that are
/// inside the node root or the client root.
///
/// Assets inside the given client root are rebased to the given client output
/// path.
#[turbo_tasks::function]
pub async fn emit_assets(
    assets: Vc<OutputAssets>,
    node_root: FileSystemPath,
    client_relative_path: FileSystemPath,
    client_output_path: FileSystemPath,
) -> Result<()> {
    let _: Vec<()> = assets
        .await?
        .iter()
        .copied()
        .map(|asset| {
            let node_root = node_root.clone();
            let client_relative_path = client_relative_path.clone();
            let client_output_path = client_output_path.clone();

            async move {
                let path = asset.path().owned().await?;
                let span = tracing::info_span!("emit asset", name = %path.value_to_string().await?);
                async move {
                    Ok(if path.is_inside_ref(&node_root) {
                        Some(emit(*asset).as_side_effect().await?)
                    } else if path.is_inside_ref(&client_relative_path) {
                        // Client assets are emitted to the client output path, which is prefixed
                        // with _next. We need to rebase them to remove that
                        // prefix.
                        Some(
                            emit_rebase(*asset, client_relative_path, client_output_path)
                                .as_side_effect()
                                .await?,
                        )
                    } else {
                        None
                    })
                }
                .instrument(span)
                .await
            }
        })
        .try_flat_join()
        .await?;
    Ok(())
}

#[turbo_tasks::function]
async fn emit(asset: Vc<Box<dyn OutputAsset>>) -> Result<()> {
    asset
        .content()
        .resolve()
        .await?
        .write(asset.path().owned().await?)
        .as_side_effect()
        .await?;
    Ok(())
}

#[turbo_tasks::function]
async fn emit_rebase(
    asset: Vc<Box<dyn OutputAsset>>,
    from: FileSystemPath,
    to: FileSystemPath,
) -> Result<()> {
    let path = rebase(asset.path().owned().await?, from, to)
        .owned()
        .await?;
    let content = asset.content();
    content
        .resolve()
        .await?
        .write(path)
        .as_side_effect()
        .await?;
    Ok(())
}

struct OutputAssetVisit {
    emit_spans: bool,
}
impl Visit<(ResolvedVc<Box<dyn OutputAsset>>, Option<ReadRef<RcStr>>)> for OutputAssetVisit {
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
        get_referenced_assets(self.emit_spans, node.0)
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

/// Walks the asset graph from multiple assets and collect all referenced
/// assets.
#[turbo_tasks::function]
pub async fn all_assets_from_entries(entries: Vc<OutputAssets>) -> Result<Vc<OutputAssets>> {
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
                                // INVALIDATION: we don't need to invalidate when the span name
                                // changes
                                Some(asset.path_string().untracked().await?)
                            } else {
                                None
                            },
                        ))
                    })
                    .try_join()
                    .await?,
                OutputAssetVisit { emit_spans },
            )
            .await
            .completed()?
            .into_inner()
            .into_postorder_topological()
            .map(|(asset, _)| asset)
            .collect::<FxIndexSet<_>>()
            .into_iter()
            .collect(),
    ))
}

/// Computes the list of all chunk children of a given chunk.
async fn get_referenced_assets(
    emit_spans: bool,
    asset: ResolvedVc<Box<dyn OutputAsset>>,
) -> Result<Vec<(ResolvedVc<Box<dyn OutputAsset>>, Option<ReadRef<RcStr>>)>> {
    asset
        .references()
        .await?
        .iter()
        .map(async |asset| {
            Ok((
                *asset,
                if emit_spans {
                    // INVALIDATION: we don't need to invalidate the list of assets when the span
                    // name changes
                    Some(asset.path_string().untracked().await?)
                } else {
                    None
                },
            ))
        })
        .try_join()
        .await
}
