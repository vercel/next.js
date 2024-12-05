pub mod svg;

use std::{io::Cursor, str::FromStr};

use anyhow::{bail, Context, Result};
use base64::{display::Base64Display, engine::general_purpose::STANDARD};
use image::{
    codecs::{
        bmp::BmpEncoder,
        ico::IcoEncoder,
        jpeg::JpegEncoder,
        png::{CompressionType, PngEncoder},
    },
    imageops::FilterType,
    DynamicImage, GenericImageView, ImageEncoder, ImageFormat,
};
use mime::Mime;
use serde::{Deserialize, Serialize};
use serde_with::{serde_as, DisplayFromStr};
use turbo_tasks::{debug::ValueDebugFormat, trace::TraceRawVcs, ResolvedVc, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbopack_core::{
    error::PrettyPrintError,
    ident::AssetIdent,
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, OptionStyledString, StyledString},
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
#[allow(clippy::manual_non_exhaustive)]
#[serde_as]
#[turbo_tasks::value]
#[derive(Default)]
#[non_exhaustive]
pub struct ImageMetaData {
    pub width: u32,
    pub height: u32,
    #[turbo_tasks(trace_ignore, debug_ignore)]
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub mime_type: Option<Mime>,
    pub blur_placeholder: Option<BlurPlaceholder>,
}

impl ImageMetaData {
    pub fn fallback_value(mime_type: Option<Mime>) -> Self {
        ImageMetaData {
            width: 100,
            height: 100,
            mime_type,
            blur_placeholder: Some(BlurPlaceholder::fallback()),
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

fn result_to_issue<T>(path: ResolvedVc<FileSystemPath>, result: Result<T>) -> Option<T> {
    match result {
        Ok(r) => Some(r),
        Err(err) => {
            ImageProcessingIssue {
                path,
                message: StyledString::Text(format!("{}", PrettyPrintError(&err)).into())
                    .resolved_cell(),
                issue_severity: None,
                title: None,
            }
            .cell()
            .emit();
            None
        }
    }
}

fn load_image(
    path: ResolvedVc<FileSystemPath>,
    bytes: &[u8],
    extension: Option<&str>,
) -> Option<(ImageBuffer, Option<ImageFormat>)> {
    result_to_issue(path, load_image_internal(path, bytes, extension))
}

/// Type of raw image buffer read by reader from `load_image`.
/// If the image could not be decoded, the raw bytes are returned.
enum ImageBuffer {
    Raw(Vec<u8>),
    Decoded(image::DynamicImage),
}

fn load_image_internal(
    path: ResolvedVc<FileSystemPath>,
    bytes: &[u8],
    extension: Option<&str>,
) -> Result<(ImageBuffer, Option<ImageFormat>)> {
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

    // [NOTE]
    // Workaround for missing codec supports in Turbopack,
    // Instead of erroring out the whole build, emitting raw image bytes as-is
    // (Not applying resize, not applying optimization or anything else)
    // and expect a browser decodes it.
    // This is a stop gap until we have proper encoding/decoding in majority of the
    // platforms

    #[cfg(not(feature = "avif"))]
    if matches!(format, Some(ImageFormat::Avif)) {
        ImageProcessingIssue {
            path,
            message: StyledString::Text(
                "This version of Turbopack does not support AVIF images, will emit without \
                 optimization or encoding"
                    .into(),
            )
            .resolved_cell(),
            title: Some(StyledString::Text("AVIF image not supported".into()).resolved_cell()),
            issue_severity: Some(IssueSeverity::Warning.resolved_cell()),
        }
        .cell()
        .emit();
        return Ok((ImageBuffer::Raw(bytes.to_vec()), format));
    }

    #[cfg(not(feature = "webp"))]
    if matches!(format, Some(ImageFormat::WebP)) {
        ImageProcessingIssue {
            path,
            message: StyledString::Text(
                "This version of Turbopack does not support WEBP images, will emit without \
                 optimization or encoding"
                    .into(),
            )
            .resolved_cell(),
            title: Some(StyledString::Text("WEBP image not supported".into()).resolved_cell()),
            issue_severity: Some(IssueSeverity::Warning.resolved_cell()),
        }
        .cell()
        .emit();
        return Ok((ImageBuffer::Raw(bytes.to_vec()), format));
    }

    let image = reader.decode().context("unable to decode image data")?;
    Ok((ImageBuffer::Decoded(image), format))
}

fn compute_blur_data(
    path: ResolvedVc<FileSystemPath>,
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
                path,
                message: StyledString::Text(format!("{}", PrettyPrintError(&err)).into())
                    .resolved_cell(),
                issue_severity: None,
                title: None,
            }
            .cell()
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
            .write_image(image.as_bytes(), width, height, image.color().into())?;
            (buf, mime::IMAGE_PNG)
        }
        ImageFormat::Jpeg => {
            JpegEncoder::new_with_quality(&mut buf, quality).write_image(
                image.as_bytes(),
                width,
                height,
                image.color().into(),
            )?;
            (buf, mime::IMAGE_JPEG)
        }
        ImageFormat::Ico => {
            IcoEncoder::new(&mut buf).write_image(
                image.as_bytes(),
                width,
                height,
                image.color().into(),
            )?;
            // mime does not support typed IMAGE_X_ICO yet
            (buf, Mime::from_str("image/x-icon")?)
        }
        ImageFormat::Bmp => {
            BmpEncoder::new(&mut buf).write_image(
                image.as_bytes(),
                width,
                height,
                image.color().into(),
            )?;
            (buf, mime::IMAGE_BMP)
        }
        #[cfg(feature = "webp")]
        ImageFormat::WebP => {
            use image::codecs::webp::WebPEncoder;
            let encoder = WebPEncoder::new_lossless(&mut buf);
            encoder.encode(image.as_bytes(), width, height, image.color().into())?;

            (buf, Mime::from_str("image/webp")?)
        }
        #[cfg(feature = "avif")]
        ImageFormat::Avif => {
            use image::codecs::avif::AvifEncoder;
            AvifEncoder::new_with_speed_quality(&mut buf, 6, quality).write_image(
                image.as_bytes(),
                width,
                height,
                image.color().into(),
            )?;
            (buf, Mime::from_str("image/avif")?)
        }
        _ => bail!(
            "Encoding for image format {:?} has not been compiled into the current build",
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
    ident: Vc<AssetIdent>,
    content: Vc<FileContent>,
    blur_placeholder: Option<Vc<BlurPlaceholderOptions>>,
) -> Result<Vc<ImageMetaData>> {
    let FileContent::Content(content) = &*content.await? else {
        bail!("Input image not found");
    };
    let bytes = content.content().to_bytes()?;
    let path_resolved = ident.path().to_resolved().await?;
    let path = path_resolved.await?;
    let extension = path.extension_ref();
    if extension == Some("svg") {
        let content = result_to_issue(
            path_resolved,
            std::str::from_utf8(&bytes).context("Input image is not valid utf-8"),
        );
        let Some(content) = content else {
            return Ok(ImageMetaData::fallback_value(Some(mime::IMAGE_SVG)).cell());
        };
        let info = result_to_issue(
            path_resolved,
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
        }
        .cell());
    }
    let Some((image, format)) = load_image(path_resolved, &bytes, extension) else {
        return Ok(ImageMetaData::fallback_value(None).cell());
    };

    match image {
        ImageBuffer::Raw(..) => Ok(ImageMetaData::fallback_value(None).cell()),
        ImageBuffer::Decoded(image) => {
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
                    compute_blur_data(
                        path_resolved,
                        image,
                        format.unwrap(),
                        &*blur_placeholder.await?,
                    )
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
            }
            .cell())
        }
    }
}

#[turbo_tasks::function]
pub async fn optimize(
    ident: Vc<AssetIdent>,
    content: Vc<FileContent>,
    max_width: u32,
    max_height: u32,
    quality: u8,
) -> Result<Vc<FileContent>> {
    let FileContent::Content(content) = &*content.await? else {
        return Ok(FileContent::NotFound.cell());
    };
    let bytes = content.content().to_bytes()?;
    let path = ident.path().to_resolved().await?;

    let Some((image, format)) = load_image(path, &bytes, ident.path().await?.extension_ref())
    else {
        return Ok(FileContent::NotFound.cell());
    };
    match image {
        ImageBuffer::Raw(buffer) => {
            #[cfg(not(feature = "avif"))]
            if matches!(format, Some(ImageFormat::Avif)) {
                return Ok(FileContent::Content(
                    File::from(buffer).with_content_type(Mime::from_str("image/avif")?),
                )
                .cell());
            }

            #[cfg(not(feature = "webp"))]
            if matches!(format, Some(ImageFormat::WebP)) {
                return Ok(FileContent::Content(
                    File::from(buffer).with_content_type(Mime::from_str("image/webp")?),
                )
                .cell());
            }

            let mime_type = if let Some(format) = format {
                image_format_to_mime_type(format)?
            } else {
                None
            };

            // Falls back to image/jpeg if the format is unknown, thouogh it is not
            // technically correct
            Ok(FileContent::Content(
                File::from(buffer).with_content_type(mime_type.unwrap_or(mime::IMAGE_JPEG)),
            )
            .cell())
        }
        ImageBuffer::Decoded(image) => {
            let (width, height) = image.dimensions();
            let image = if width > max_width || height > max_height {
                image.resize(max_width, max_height, FilterType::Lanczos3)
            } else {
                image
            };

            let format = format.unwrap_or(ImageFormat::Jpeg);
            let (data, mime_type) = encode_image(image, format, quality)?;

            Ok(FileContent::Content(File::from(data).with_content_type(mime_type)).cell())
        }
    }
}

#[turbo_tasks::value]
struct ImageProcessingIssue {
    path: ResolvedVc<FileSystemPath>,
    message: ResolvedVc<StyledString>,
    title: Option<ResolvedVc<StyledString>>,
    issue_severity: Option<ResolvedVc<IssueSeverity>>,
}

#[turbo_tasks::value_impl]
impl Issue for ImageProcessingIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        self.issue_severity
            .map(|s| *s)
            .unwrap_or(IssueSeverity::Error.into())
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        *self.path
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Transform.cell()
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        *self
            .title
            .unwrap_or(StyledString::Text("Processing image failed".into()).resolved_cell())
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(self.message))
    }
}
