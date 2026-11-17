use anyhow::Result;
use next_core::{
    next_client_reference::{ClientReferenceGraphResult, ClientReferenceType},
    next_manifests::NextFontManifest,
};
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexSet, ResolvedVc, TryJoinIterExt, Vc, turbofmt};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::ChunkingContext,
    module_graph::{GraphTraversalAction, ModuleGraph},
    output::{OutputAsset, OutputAssets, OutputAssetsReference},
    reference::all_assets_from_entries,
};
use turbopack_css::embed::CssEmbed;

use crate::paths::get_font_paths_from_root;

/// Selects font assets by client reference ownership before shared CSS chunks are assembled.
pub async fn app_font_assets(
    references: &ClientReferenceGraphResult,
    graph: &ModuleGraph,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    global_not_found: &FileSystemPath,
    is_global_not_found_entry: bool,
) -> Result<ResolvedVc<OutputAssets>> {
    let mut roots = FxIndexSet::default();
    for reference in &references.client_references {
        let is_global_not_found = if let Some(component) = reference.server_component {
            *component.source_path().await? == *global_not_found
        } else {
            false
        };
        if is_global_not_found == is_global_not_found_entry {
            let root = match reference.ty {
                ClientReferenceType::EcmascriptClientReference(reference) => {
                    ResolvedVc::upcast(reference.await?.client_module)
                }
                ClientReferenceType::CssClientReference(reference) => ResolvedVc::upcast(reference),
            };
            roots.insert(root);
        }
    }

    let mut embeddable = FxIndexSet::default();
    graph.traverse_nodes_dfs(
        roots,
        &mut embeddable,
        |_, _| Ok(GraphTraversalAction::Continue),
        |module, embeddable| {
            if let Some(asset) = ResolvedVc::try_downcast::<Box<dyn CssEmbed>>(module) {
                embeddable.insert(asset);
            }
            Ok(())
        },
    )?;

    let assets = embeddable
        .into_iter()
        .map(|asset| asset.embedded_asset(chunking_context).to_resolved())
        .try_join()
        .await?;
    Ok(ResolvedVc::cell(assets))
}

#[turbo_tasks::value(shared)]
pub struct FontManifest {
    pub client_root: FileSystemPath,
    pub node_root: FileSystemPath,
    pub dir: FileSystemPath,
    pub original_name: RcStr,
    pub app_entry_path: Option<RcStr>,
    pub manifest_path_prefix: RcStr,
    pub pathname: RcStr,
    pub client_assets: ResolvedVc<OutputAssets>,
    pub app_dir: bool,
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for FontManifest {}

#[turbo_tasks::value_impl]
impl OutputAsset for FontManifest {
    #[turbo_tasks::function]
    async fn path(&self) -> Result<Vc<FileSystemPath>> {
        let manifest_path_prefix = &self.manifest_path_prefix;
        Ok(self
            .node_root
            .join(&format!(
                "server/{}{manifest_path_prefix}/next-font-manifest.json",
                if self.app_dir { "app" } else { "pages" }
            ))?
            .cell())
    }
}

#[turbo_tasks::value_impl]
impl Asset for FontManifest {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        let FontManifest {
            client_root,
            dir,
            original_name,
            app_entry_path,
            pathname,
            client_assets,
            app_dir,
            ..
        } = self;
        let all_client_output_assets = all_assets_from_entries(**client_assets).await?;

        // `_next` gets added again later, so we "strip" it here via
        // `get_font_paths_from_root`.
        let font_paths: Vec<String> =
            get_font_paths_from_root(client_root, all_client_output_assets)
                .await?
                .iter()
                .filter_map(|p| p.split("_next/").last().map(|f| f.to_string()))
                .collect();

        let has_fonts = !font_paths.is_empty();
        let using_size_adjust = font_paths.iter().any(|path| path.contains("-s"));

        let font_paths = font_paths
            .into_iter()
            .filter(|path| path.contains(".p."))
            .map(RcStr::from)
            .collect::<Vec<_>>();

        let next_font_manifest = if !has_fonts {
            Default::default()
        } else if *app_dir {
            let page_path = if let Some(path) = app_entry_path {
                path.clone()
            } else {
                turbofmt!("{dir}{original_name}").await?
            };

            NextFontManifest {
                app: [(page_path, font_paths)].into_iter().collect(),
                app_using_size_adjust: using_size_adjust,
                ..Default::default()
            }
        } else {
            NextFontManifest {
                pages: [(pathname.clone(), font_paths)].into_iter().collect(),
                pages_using_size_adjust: using_size_adjust,
                ..Default::default()
            }
        };

        Ok(AssetContent::file(
            FileContent::Content(File::from(serde_json::to_string_pretty(
                &next_font_manifest,
            )?))
            .cell(),
        ))
    }
}
