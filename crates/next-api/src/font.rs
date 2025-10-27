use anyhow::Result;
use next_core::{all_assets_from_entries, next_manifests::NextFontManifest};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{File, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    output::{OutputAsset, OutputAssets},
};

use crate::paths::get_font_paths_from_root;

#[turbo_tasks::value(shared)]
pub struct FontManifest {
    pub client_root: FileSystemPath,
    pub node_root: FileSystemPath,
    pub dir: FileSystemPath,
    pub original_name: RcStr,
    pub manifest_path_prefix: RcStr,
    pub pathname: RcStr,
    pub client_assets: ResolvedVc<OutputAssets>,
    pub app_dir: bool,
}

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
            pathname,
            client_assets,
            app_dir,
            ..
        } = self;
        let all_client_output_assets = all_assets_from_entries(**client_assets).await?;

        // `_next` gets added again later, so we "strip" it here via
        // `get_font_paths_from_root`.
        let font_paths: Vec<String> =
            get_font_paths_from_root(client_root, &all_client_output_assets)
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
            let dir_str = dir.value_to_string().await?;
            let page_path = format!("{dir_str}{original_name}").into();

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
            File::from(serde_json::to_string_pretty(&next_font_manifest)?).into(),
        ))
    }
}
