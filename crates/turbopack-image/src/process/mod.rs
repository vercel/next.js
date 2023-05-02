pub mod svg;

use std::{io::Cursor, str::FromStr};

use anyhow::{bail, Context, Result};
use base64::{display::Base64Display, engine::general_purpose::STANDARD};
use image::{
    codecs::{
        jpeg::JpegEncoder,
        png::{CompressionType, PngEncoder},
    },
    imageops::FilterType,
    DynamicImage, GenericImageView, ImageEncoder, ImageFormat,
};
use mime::Mime;
use serde::{Deserialize, Serialize};
use serde_with::{serde_as, DisplayFromStr};
use turbo_tasks::{debug::ValueDebugFormat, primitives::StringVc, trace::TraceRawVcs};
use turbo_tasks_fs::{File, FileContent, FileContentVc, FileSystemPathVc};
use turbopack_core::{
    error::PrettyPrintError,
    ident::AssetIdentVc,
    issue::{Issue, IssueVc},
};

use self::svg::calculate;

/// Small placeholder version of the image.
#[derive(PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat)]
pub struct BlurPlaceholder {
    pub data_url: String,
    pub width: u32,
    pub height: u32,
}

impl BlurPlaceholder {
    pub fn fallback() -> Self {
        BlurPlaceholder {
            data_url: "data:image/gif;base64,R0lGODlhAQABAIAAAP///\
                       wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="
                .to_string(),
            width: 1,
            height: 1,
        }
    }
}

/// Gathered meta information about an image.
#[serde_as]
#[turbo_tasks::value]
#[derive(Default)]
pub struct ImageMetaData {
    pub width: u32,
    pub height: u32,
    #[turbo_tasks(trace_ignore, debug_ignore)]
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub mime_type: Option<Mime>,
    pub blur_placeholder: Option<BlurPlaceholder>,
    placeholder_for_future_extensions: (),
}

impl ImageMetaData {
    pub fn fallback_value(mime_type: Option<Mime>) -> Self {
        ImageMetaData {
            width: 100,
            height: 100,
            mime_type,
            blur_placeholder: Some(BlurPlaceholder::fallback()),
            placeholder_for_future_extensions: (),
        }
    }
}

/// Options for generating a blur placeholder.
#[turbo_tasks::value(shared)]
pub struct BlurPlaceholderOptions {
    pub quality: u8,
    pub size: u32,
}

fn extension_to_image_format(extension: &str) -> Option<ImageFormat> {
    Some(match extension {
        "avif" => ImageFormat::Avif,
        "jpg" | "jpeg" => ImageFormat::Jpeg,
        "png" => ImageFormat::Png,
        "gif" => ImageFormat::Gif,
        "webp" => ImageFormat::WebP,
        "tif" | "tiff" => ImageFormat::Tiff,
        "tga" => ImageFormat::Tga,
        "dds" => ImageFormat::Dds,
        "bmp" => ImageFormat::Bmp,
        "ico" => ImageFormat::Ico,
        "hdr" => ImageFormat::Hdr,
        "exr" => ImageFormat::OpenExr,
        "pbm" | "pam" | "ppm" | "pgm" => ImageFormat::Pnm,
        "ff" | "farbfeld" => ImageFormat::Farbfeld,
        "qoi" => ImageFormat::Qoi,
        _ => return None,
    })
}

fn result_to_issue<T>(ident: AssetIdentVc, result: Result<T>) -> Option<T> {
    match result {
        Ok(r) => Some(r),
        Err(err) => {
            ImageProcessingIssue {
                path: ident.path(),
                message: StringVc::cell(format!("{}", PrettyPrintError(&err))),
            }
            .cell()
            .as_issue()
            .emit();
            None
        }
    }
}

fn load_image(
    ident: AssetIdentVc,
    bytes: &[u8],
    extension: Option<&str>,
) -> Option<(image::DynamicImage, Option<ImageFormat>)> {
    result_to_issue(ident, load_image_internal(bytes, extension))
}

fn load_image_internal(
    bytes: &[u8],
    extension: Option<&str>,
) -> Result<(image::DynamicImage, Option<ImageFormat>)> {
    let reader = image::io::Reader::new(Cursor::new(&bytes));
    let mut reader = reader
        .with_guessed_format()
        .context("unable to determine image format from file content")?;
    let mut format = reader.format();
    if format.is_none() {
        if let Some(extension) = extension {
            if let Some(new_format) = extension_to_image_format(extension) {
                format = Some(new_format);
                reader.set_format(new_format);
            }
        }
    }
    let image = reader.decode().context("unable to decode image data")?;
    Ok((image, format))
}

fn compute_blur_data(
    ident: AssetIdentVc,
    image: image::DynamicImage,
    format: ImageFormat,
    options: &BlurPlaceholderOptions,
) -> Option<BlurPlaceholder> {
    match compute_blur_data_internal(image, format, options)
        .context("unable to compute blur placeholder")
    {
        Ok(r) => Some(r),
        Err(err) => {
            ImageProcessingIssue {
                path: ident.path(),
                message: StringVc::cell(format!("{}", PrettyPrintError(&err))),
            }
            .cell()
            .as_issue()
            .emit();
            Some(BlurPlaceholder::fallback())
        }
    }
}

fn encode_image(image: DynamicImage, format: ImageFormat, quality: u8) -> Result<(Vec<u8>, Mime)> {
    let mut buf = Vec::new();
    let (width, height) = image.dimensions();

    Ok(match format {
        ImageFormat::Png => {
            PngEncoder::new_with_quality(
                &mut buf,
                CompressionType::Best,
                image::codecs::png::FilterType::NoFilter,
            )
            .write_image(image.as_bytes(), width, height, image.color())?;
            (buf, mime::IMAGE_PNG)
        }
        ImageFormat::Jpeg => {
            JpegEncoder::new_with_quality(&mut buf, quality).write_image(
                image.as_bytes(),
                width,
                height,
                image.color(),
            )?;
            (buf, mime::IMAGE_JPEG)
        }
        #[cfg(feature = "webp")]
        ImageFormat::WebP => {
            use image::webp::{WebPEncoder, WebPQuality};
            WebPEncoder::new_with_quality(&mut buf, WebPQuality::lossy(options.quality))
                .write_image(
                    small_image.as_bytes(),
                    blur_width,
                    blur_height,
                    small_image.color(),
                )?;
            (buf, Mime::from_str("image/webp")?)
        }
        #[cfg(feature = "avif")]
        ImageFormat::Avif => {
            use image::codecs::avif::AvifEncoder;
            AvifEncoder::new_with_speed_quality(&mut buf, 6, quality).write_image(
                image.as_bytes(),
                width,
                height,
                image.color(),
            )?;
            (buf, Mime::from_str("image/avif")?)
        }
        _ => bail!(
            "Ecoding for image format {:?} has not been compiled into the current build",
            format
        ),
    })
}

fn compute_blur_data_internal(
    image: image::DynamicImage,
    format: ImageFormat,
    options: &BlurPlaceholderOptions,
) -> Result<BlurPlaceholder> {
    let small_image = image.resize(options.size, options.size, FilterType::Triangle);
    let width = small_image.width();
    let height = small_image.height();
    let (data, mime) = encode_image(small_image, format, options.quality)?;
    let data_url = format!(
        "data:{mime};base64,{}",
        Base64Display::new(&data, &STANDARD)
    );

    Ok(BlurPlaceholder {
        data_url,
        width,
        height,
    })
}

fn image_format_to_mime_type(format: ImageFormat) -> Result<Option<Mime>> {
    Ok(match format {
        ImageFormat::Png => Some(mime::IMAGE_PNG),
        ImageFormat::Jpeg => Some(mime::IMAGE_JPEG),
        ImageFormat::WebP => Some(Mime::from_str("image/webp")?),
        ImageFormat::Avif => Some(Mime::from_str("image/avif")?),
        ImageFormat::Bmp => Some(mime::IMAGE_BMP),
        ImageFormat::Dds => Some(Mime::from_str("image/vnd-ms.dds")?),
        ImageFormat::Farbfeld => Some(mime::APPLICATION_OCTET_STREAM),
        ImageFormat::Gif => Some(mime::IMAGE_GIF),
        ImageFormat::Hdr => Some(Mime::from_str("image/vnd.radiance")?),
        ImageFormat::Ico => Some(Mime::from_str("image/x-icon")?),
        ImageFormat::OpenExr => Some(Mime::from_str("image/x-exr")?),
        ImageFormat::Pnm => Some(Mime::from_str("image/x-portable-anymap")?),
        ImageFormat::Qoi => Some(mime::APPLICATION_OCTET_STREAM),
        ImageFormat::Tga => Some(Mime::from_str("image/x-tga")?),
        ImageFormat::Tiff => Some(Mime::from_str("image/tiff")?),
        _ => None,
    })
}

/// Analyze an image and return meta information about it.
/// Optionally computes a blur placeholder.
#[turbo_tasks::function]
pub async fn get_meta_data(
    ident: AssetIdentVc,
    content: FileContentVc,
    blur_placeholder: Option<BlurPlaceholderOptionsVc>,
) -> Result<ImageMetaDataVc> {
    let FileContent::Content(content) = &*content.await? else {
      bail!("Input image not found");
    };
    let bytes = content.content().to_bytes()?;
    let path = ident.path().await?;
    let extension = path.extension();
    if extension == Some("svg") {
        let content = result_to_issue(
            ident,
            std::str::from_utf8(&bytes).context("Input image is not valid utf-8"),
        );
        let Some(content) = content else {
            return Ok(ImageMetaData::fallback_value(Some(mime::IMAGE_SVG)).cell());
        };
        let info = result_to_issue(
            ident,
            calculate(content).context("Failed to parse svg source code for image dimensions"),
        );
        let Some((width, height)) = info else {
            return Ok(ImageMetaData::fallback_value(Some(mime::IMAGE_SVG)).cell());
        };
        return Ok(ImageMetaData {
            width,
            height,
            mime_type: Some(mime::IMAGE_SVG),
            blur_placeholder: None,
            placeholder_for_future_extensions: (),
        }
        .cell());
    }
    let Some((image, format)) = load_image(ident, &bytes, extension) else {
        return Ok(ImageMetaData::fallback_value(None).cell());
    };
    let (width, height) = image.dimensions();
    let blur_placeholder = if let Some(blur_placeholder) = blur_placeholder {
        if matches!(
            format,
            // list should match next/client/image.tsx
            Some(ImageFormat::Png)
                | Some(ImageFormat::Jpeg)
                | Some(ImageFormat::WebP)
                | Some(ImageFormat::Avif)
        ) {
            compute_blur_data(ident, image, format.unwrap(), &*blur_placeholder.await?)
        } else {
            None
        }
    } else {
        None
    };

    Ok(ImageMetaData {
        width,
        height,
        mime_type: if let Some(format) = format {
            image_format_to_mime_type(format)?
        } else {
            None
        },
        blur_placeholder,
        placeholder_for_future_extensions: (),
    }
    .cell())
}

#[turbo_tasks::function]
pub async fn optimize(
    ident: AssetIdentVc,
    content: FileContentVc,
    max_width: u32,
    max_height: u32,
    quality: u8,
) -> Result<FileContentVc> {
    let FileContent::Content(content) = &*content.await? else {
        return Ok(FileContent::NotFound.cell());
    };
    let bytes = content.content().to_bytes()?;
    let Some((image, mut format)) = load_image(ident, &bytes, ident.path().await?.extension()) else {
        return Ok(FileContent::NotFound.cell());
    };
    let (width, height) = image.dimensions();
    let image = if width > max_width || height > max_height {
        image.resize(max_width, max_height, FilterType::Lanczos3)
    } else {
        image
    };
    #[cfg(not(feature = "avif"))]
    if matches!(format, Some(ImageFormat::Avif)) {
        format = Some(ImageFormat::Jpeg);
    }
    #[cfg(not(feature = "webp"))]
    if matches!(format, Some(ImageFormat::WebP)) {
        format = Some(ImageFormat::Jpeg);
    }
    let format = format.unwrap_or(ImageFormat::Jpeg);
    let (data, mime_type) = encode_image(image, format, quality)?;

    Ok(FileContent::Content(File::from(data).with_content_type(mime_type)).cell())
}

#[turbo_tasks::value]
struct ImageProcessingIssue {
    path: FileSystemPathVc,
    message: StringVc,
}

#[turbo_tasks::value_impl]
impl Issue for ImageProcessingIssue {
    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.path
    }
    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("image".to_string())
    }
    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        StringVc::cell("Processing image failed".to_string())
    }
    #[turbo_tasks::function]
    fn description(&self) -> StringVc {
        self.message
    }
}
