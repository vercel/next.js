use std::io::Write;

use anyhow::{bail, Result};
use turbo_tasks::Vc;
use turbopack_binding::{
    turbo::tasks_fs::{rope::RopeBuilder, FileContent},
    turbopack::{
        core::{
            asset::{Asset, AssetContent},
            ident::AssetIdent,
            source::Source,
        },
        ecmascript::utils::StringifyJs,
        image::process::{get_meta_data, BlurPlaceholderOptions},
    },
};

use super::module::BlurPlaceholderMode;

fn modifier() -> Vc<String> {
    Vc::cell("structured image object".to_string())
}

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
    pub image: Vc<Box<dyn Source>>,
    pub blur_placeholder_mode: BlurPlaceholderMode,
}

#[turbo_tasks::value_impl]
impl Source for StructuredImageFileSource {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.image
            .ident()
            .with_modifier(modifier())
            .rename_as("*.mjs".to_string())
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
                let info = get_meta_data(self.image.ident(), content, None).await?;
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
                let info = get_meta_data(self.image.ident(), content, Some(blur_options)).await?;
                writeln!(
                    result,
                    "export default {{ src, width: {width}, height: {height}, blurDataURL: \
                     {blur_data_url}, blurWidth: {blur_width}, blurHeight: {blur_height} }}",
                    width = StringifyJs(&info.width),
                    height = StringifyJs(&info.height),
                    blur_data_url =
                        StringifyJs(&info.blur_placeholder.as_ref().map(|p| p.data_url.as_str())),
                    blur_width =
                        StringifyJs(&info.blur_placeholder.as_ref().map_or(0, |p| p.width)),
                    blur_height =
                        StringifyJs(&info.blur_placeholder.as_ref().map_or(0, |p| p.height),),
                )?;
            }
            BlurPlaceholderMode::None => {
                let info = get_meta_data(self.image.ident(), content, None).await?;
                writeln!(
                    result,
                    "export default {{ src, width: {width}, height: {height} }}",
                    width = StringifyJs(&info.width),
                    height = StringifyJs(&info.height),
                )?;
            }
        };
        Ok(AssetContent::File(FileContent::Content(result.build().into()).cell()).cell())
    }
}
