use std::io::Write;

use anyhow::{Result, bail};
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{FileContent, rope::RopeBuilder};
use turbopack_core::{
    asset::{Asset, AssetContent},
    ident::AssetIdent,
    source::Source,
};
use turbopack_ecmascript::utils::StringifyJs;
use turbopack_image::process::{BlurPlaceholderOptions, get_meta_data};

use super::module::BlurPlaceholderMode;

#[turbo_tasks::function]
fn blur_options() -> Vc<BlurPlaceholderOptions> {
    BlurPlaceholderOptions {
        quality: 70,
        size: 8,
    }
    .cell()
}

/// An source asset that transforms an image into javascript code which exports
/// an object with meta information like width, height and a blur placeholder.
#[turbo_tasks::value(shared)]
pub struct StructuredImageFileSource {
    pub image: ResolvedVc<Box<dyn Source>>,
    pub blur_placeholder_mode: BlurPlaceholderMode,
}

#[turbo_tasks::value_impl]
impl Source for StructuredImageFileSource {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        let modifier = match self.blur_placeholder_mode {
            BlurPlaceholderMode::DataUrl => rcstr!("structured image object with data url"),
            BlurPlaceholderMode::NextImageUrl => {
                rcstr!("structured image object with next image url")
            }
            BlurPlaceholderMode::None => rcstr!("structured image object"),
        };
        self.image
            .ident()
            .with_modifier(modifier)
            .rename_as(rcstr!("*.mjs"))
    }
}

#[turbo_tasks::value_impl]
impl Asset for StructuredImageFileSource {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        let content = self.image.content().await?;
        let AssetContent::File(content) = *content else {
            bail!("Input source is not a file and can't be transformed into image information");
        };
        let mut result = RopeBuilder::from("");
        writeln!(result, "import src from \"IMAGE\";",)?;
        let blur_options = blur_options();
        match self.blur_placeholder_mode {
            BlurPlaceholderMode::NextImageUrl => {
                let info = get_meta_data(*self.image, *content, None).await?;
                let width = info.width;
                let height = info.height;
                let blur_options = blur_options.await?;
                let (blur_width, blur_height) = if width > height {
                    (
                        blur_options.size,
                        (blur_options.size as f32 * height as f32 / width as f32).ceil() as u32,
                    )
                } else {
                    (
                        (blur_options.size as f32 * width as f32 / height as f32).ceil() as u32,
                        blur_options.size,
                    )
                };
                writeln!(
                    result,
                    "export default {{ src, width: {width}, height: {height}, blurDataURL: \
                     `/_next/image?w={blur_width}&q={quality}&url=${{encodeURIComponent(src)}}`, \
                     blurWidth: {blur_width}, blurHeight: {blur_height} }}",
                    width = StringifyJs(&info.width),
                    height = StringifyJs(&info.height),
                    quality = StringifyJs(&blur_options.quality),
                    blur_width = StringifyJs(&blur_width),
                    blur_height = StringifyJs(&blur_height),
                )?;
            }
            BlurPlaceholderMode::DataUrl => {
                let info = get_meta_data(*self.image, *content, Some(blur_options)).await?;
                write!(
                    result,
                    "export default {{ src, width: {width}, height: {height}, blurWidth: \
                     {blur_width}, blurHeight: {blur_height}",
                    width = StringifyJs(&info.width),
                    height = StringifyJs(&info.height),
                    blur_width =
                        StringifyJs(&info.blur_placeholder.as_ref().map_or(0, |p| p.width)),
                    blur_height =
                        StringifyJs(&info.blur_placeholder.as_ref().map_or(0, |p| p.height),),
                )?;
                if let Some(blur_placeholder) = &info.blur_placeholder {
                    write!(
                        result,
                        ", blurDataURL: {blur_data_url}",
                        blur_data_url = StringifyJs(blur_placeholder.data_url.as_str()),
                    )?;
                }
                writeln!(result, "}};")?;
            }
            BlurPlaceholderMode::None => {
                let info = get_meta_data(*self.image, *content, None).await?;
                writeln!(
                    result,
                    "export default {{ src, width: {width}, height: {height} }}",
                    width = StringifyJs(&info.width),
                    height = StringifyJs(&info.height),
                )?;
            }
        };
        Ok(AssetContent::File(FileContent::Content(result.build().into()).resolved_cell()).cell())
    }
}
