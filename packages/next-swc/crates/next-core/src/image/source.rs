use std::io::Write;

use anyhow::{bail, Result};
use serde::Serialize;
use turbo_binding::{
    turbo::{
        tasks::primitives::StringVc,
        tasks_fs::{rope::RopeBuilder, FileContent},
    },
    turbopack::{
        core::{
            asset::{Asset, AssetContent, AssetContentVc, AssetVc},
            ident::AssetIdentVc,
        },
        ecmascript::utils::StringifyJs,
        image::process::{get_meta_data, BlurPlaceholderOptions, BlurPlaceholderOptionsVc},
    },
};

fn modifier() -> StringVc {
    StringVc::cell("structured image object".to_string())
}

#[turbo_tasks::function]
fn blur_options() -> BlurPlaceholderOptionsVc {
    BlurPlaceholderOptions {
        quality: 70,
        size: 8,
    }
    .cell()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageExport<'a> {
    width: u32,
    height: u32,
    #[serde(rename = "blurDataURL")]
    blur_data_url: Option<&'a str>,
    blur_width: u32,
    blur_height: u32,
}

#[turbo_tasks::value(shared)]
pub struct StructuredImageSourceAsset {
    pub image: AssetVc,
}

#[turbo_tasks::value_impl]
impl Asset for StructuredImageSourceAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> AssetIdentVc {
        self.image.ident().with_modifier(modifier())
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<AssetContentVc> {
        let content = self.image.content().await?;
        let AssetContent::File(content) = *content else {
            bail!("Input source is not a file and can't be transformed into image information");
        };
        let mut result = RopeBuilder::from("");
        let info = get_meta_data(self.image.ident(), content, Some(blur_options())).await?;
        let info = ImageExport {
            width: info.width,
            height: info.height,
            blur_width: info.blur_placeholder.as_ref().map_or(0, |p| p.width),
            blur_height: info.blur_placeholder.as_ref().map_or(0, |p| p.height),
            blur_data_url: info.blur_placeholder.as_ref().map(|p| p.data_url.as_str()),
        };
        writeln!(result, "import src from \"IMAGE\";",)?;
        writeln!(
            result,
            "export default {{ src, ...{} }}",
            StringifyJs(&info)
        )?;
        Ok(AssetContent::File(FileContent::Content(result.build().into()).cell()).cell())
    }
}
