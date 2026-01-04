use std::io::Write;

use anyhow::{Context, Result, bail};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, ValueToString, Vc, fxindexmap};
use turbo_tasks_fs::{FileContent, rope::RopeBuilder};
use turbo_tasks_hash::HashAlgorithm;
use turbopack::{ModuleAssetContext, module_options::CustomModuleType};
use turbopack_core::{
    asset::{Asset, AssetContent, no_hash_salt},
    context::AssetContext,
    ident::AssetIdent,
    module::Module,
    reference_type::ReferenceType,
    source::Source,
};
use turbopack_ecmascript::{
    EcmascriptInputTransforms, runtime_functions::TURBOPACK_EXPORT_VALUE, utils::StringifyJs,
};
use turbopack_image::process::get_meta_data;
use turbopack_static::ecma::StaticUrlJsModule;

/// An source asset that transforms an image into javascript code which exports
/// an object with meta information like width, height placeholder.
/// https://github.com/facebook/metro/blob/8049cf009f9f754bf36bc06ec92a26bf51270f81/packages/metro/src/Assets.js
/// https://github.com/facebook/metro/blob/8049cf009f9f754bf36bc06ec92a26bf51270f81/packages/metro/src/__tests__/Assets-test.js
#[turbo_tasks::value(shared)]
pub struct ReactNativeStructuredAssetSource {
    pub image: ResolvedVc<Box<dyn Source>>,
}

#[turbo_tasks::value_impl]
impl Source for ReactNativeStructuredAssetSource {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(self
            .image
            .ident()
            .owned()
            .await?
            .with_modifier(rcstr!("React Native structured asset"))
            .rename_as("*.mjs")
            .into_vc())
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<RcStr>> {
        let ident = self.image.ident().to_string().await?;
        Ok(Vc::cell(
            format!("react-native structured image of {}", ident).into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl Asset for ReactNativeStructuredAssetSource {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        let content = self.image.content().await?;
        let AssetContent::File(content) = *content else {
            bail!("Input source is not a file and can't be transformed into image information");
        };
        let mut result = RopeBuilder::from("");

        let ident = self.image.ident().await?;
        let name = ident.path.file_stem().unwrap_or_default();
        let extension = ident.path.extension().unwrap_or_default();
        let hash = content
            .content_hash(no_hash_salt(), HashAlgorithm::default())
            .await?;
        let hash = hash.as_ref().context("expected file content for image")?;
        let http_server_location = format!(
            "/assets/?unstable_path={}",
            urlencoding::encode(
                &ident
                    .path
                    .root()
                    .await?
                    .get_relative_path_to(&ident.path.parent())
                    .unwrap_or_default()
            )
        );

        let is_image = matches!(
            extension.to_ascii_lowercase().as_str(),
            "png" | "jpg" | "jpeg" | "bmp" | "gif" | "webp" | "psd" | "svg" | "tiff" | "ktx"
        );

        let data = if is_image {
            let info = get_meta_data(*self.image, *content, None).await?;
            serde_json::json!({
                "__packager_asset": true,
                "httpServerLocation": http_server_location,
                "width": info.width,
                "height": info.height,
                // TODO detect img@2x, img@3x source files
                "scales": [1],
                "hash": &hash,
                "name": name,
                "type": extension,
                "fileHashes": [&hash],
            })
        } else {
            serde_json::json!({
                "__packager_asset": true,
                "httpServerLocation": http_server_location,
                "scales": [1],
                "hash": &hash,
                "name": name,
                "type": extension,
                "fileHashes": [&hash],
            })
        };

        writeln!(
            result,
            "const asset = \
             require('@react-native/assets-registry/registry').registerAsset({data});\n
            {TURBOPACK_EXPORT_VALUE}(asset);",
            data = StringifyJs(&data),
        )?;
        Ok(AssetContent::File(FileContent::Content(result.build().into()).resolved_cell()).cell())
    }
}

/// Module type that analyzes images and offers some meta information like
/// width, height as export from the module.
#[turbo_tasks::value]
pub struct ReactNativeStructuredAssetModuleType {}

#[turbo_tasks::value_impl]
impl ReactNativeStructuredAssetModuleType {
    #[turbo_tasks::function]
    pub(crate) async fn create_module(
        source: ResolvedVc<Box<dyn Source>>,
        module_asset_context: ResolvedVc<ModuleAssetContext>,
    ) -> Result<Vc<Box<dyn Module>>> {
        let static_asset = StaticUrlJsModule::new(*source, Some(rcstr!("client")))
            .to_resolved()
            .await?;
        Ok(module_asset_context
            .process(
                Vc::upcast(ReactNativeStructuredAssetSource { image: source }.cell()),
                ReferenceType::Internal(ResolvedVc::cell(fxindexmap!(
                    rcstr!("IMAGE") => ResolvedVc::upcast(static_asset)
                ))),
            )
            .module())
    }

    #[turbo_tasks::function]
    pub fn new() -> Vc<Self> {
        ReactNativeStructuredAssetModuleType {}.cell()
    }
}

#[turbo_tasks::value_impl]
impl CustomModuleType for ReactNativeStructuredAssetModuleType {
    #[turbo_tasks::function]
    fn create_module(
        &self,
        source: Vc<Box<dyn Source>>,
        module_asset_context: Vc<ModuleAssetContext>,
        _reference_type: ReferenceType,
    ) -> Vc<Box<dyn Module>> {
        ReactNativeStructuredAssetModuleType::create_module(source, module_asset_context)
    }

    #[turbo_tasks::function]
    fn extend_ecmascript_transforms(
        self: Vc<Self>,
        _preprocess: Vc<EcmascriptInputTransforms>,
        _main: Vc<EcmascriptInputTransforms>,
        _postprocess: Vc<EcmascriptInputTransforms>,
    ) -> Result<Vc<Box<dyn CustomModuleType>>> {
        bail!("ReactNativeStructuredAssetModuleType does not support adding Ecmascript transforms");
    }
}
