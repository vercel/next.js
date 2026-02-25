use anyhow::Result;
use next_core::{
    next_manifests::ProxyMatcher, segment_config::NextSegmentConfig, util::NextRuntime,
};
use serde::Serialize;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    output::{OutputAsset, OutputAssetsReference},
};

#[turbo_tasks::value]
pub struct StaticInfoManifestAsset {
    output_path: FileSystemPath,
    config: ResolvedVc<NextSegmentConfig>,
    ty: RcStr,
}

#[turbo_tasks::value_impl]
impl StaticInfoManifestAsset {
    #[turbo_tasks::function]
    pub fn new_app(output_path: FileSystemPath, config: ResolvedVc<NextSegmentConfig>) -> Vc<Self> {
        StaticInfoManifestAsset {
            output_path,
            config,
            ty: rcstr!("app"),
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub fn new_pages(
        output_path: FileSystemPath,
        config: ResolvedVc<NextSegmentConfig>,
    ) -> Vc<Self> {
        StaticInfoManifestAsset {
            output_path,
            config,
            ty: rcstr!("pages"),
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub fn new_middleware(
        output_path: FileSystemPath,
        config: ResolvedVc<NextSegmentConfig>,
    ) -> Vc<Self> {
        StaticInfoManifestAsset {
            output_path,
            config,
            // This is what the JS implementation does
            ty: rcstr!("pages"),
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for StaticInfoManifestAsset {}

#[turbo_tasks::value_impl]
impl OutputAsset for StaticInfoManifestAsset {
    #[turbo_tasks::function]
    async fn path(&self) -> Vc<FileSystemPath> {
        self.output_path.clone().cell()
    }
}

#[turbo_tasks::value_impl]
impl Asset for StaticInfoManifestAsset {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        let config = self.config.await?;

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct ManifestMiddleware {
            #[serde(skip_serializing_if = "Option::is_none")]
            pub matchers: Option<Vec<ProxyMatcher>>,
        }
        impl ManifestMiddleware {
            fn is_empty(&self) -> bool {
                self.matchers.is_none()
            }
        }

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct Manifest<'a> {
            #[serde(rename = "type")]
            ty: &'a str,
            #[serde(skip_serializing_if = "ManifestMiddleware::is_empty")]
            middleware: ManifestMiddleware,
            #[serde(skip_serializing_if = "std::ops::Not::not")]
            generate_static_params: bool,
            #[serde(skip_serializing_if = "std::ops::Not::not")]
            generate_sitemaps: bool,
            #[serde(skip_serializing_if = "std::ops::Not::not")]
            generate_image_metadata: bool,
            #[serde(skip_serializing_if = "Option::is_none")]
            runtime: Option<NextRuntime>,
            #[serde(skip_serializing_if = "Option::is_none")]
            preferred_region: Option<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            max_duration: Option<u32>,
        }

        let preferred_region = config.preferred_region.as_ref().and_then(|v| match &v[..] {
            [] => None,
            [region] => Some(region.to_string()),
            regions => Some(regions.join(",")),
        });
        let json = serde_json::to_string(&Manifest {
            ty: self.ty.as_str(),
            middleware: ManifestMiddleware {
                // TODO
                matchers: config.get_proxy_matchers(false, false, None),
            },
            runtime: config.runtime,
            generate_image_metadata: config.generate_image_metadata,
            generate_static_params: config.generate_static_params.is_some(),
            generate_sitemaps: config.generate_sitemaps,
            preferred_region,
            max_duration: config.max_duration,
        })?;

        Ok(AssetContent::file(
            FileContent::Content(File::from(json)).cell(),
        ))
    }
}
