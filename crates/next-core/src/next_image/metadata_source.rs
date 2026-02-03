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
use turbopack_image::process::get_meta_data;

/// A source that generates JS exporting `{ src: "hash.ext", width, height }` for static metadata
/// images in development mode. Unlike `StructuredImageFileSource`, this does NOT import the image
/// file (which would create a `StaticUrlJsModule` and write to `/_next/static/media/`).
///
/// The `src` field contains only a content hash + extension, used for cache-busting query params.
/// The actual image is served directly from the app/ directory via the route handler.
#[turbo_tasks::value(shared)]
pub struct MetadataStaticImageSource {
    pub image: ResolvedVc<Box<dyn Source>>,
}

#[turbo_tasks::value_impl]
impl Source for MetadataStaticImageSource {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.image
            .ident()
            .with_modifier(rcstr!("metadata static image"))
            .rename_as(rcstr!("*.mjs"))
    }
}

#[turbo_tasks::value_impl]
impl Asset for MetadataStaticImageSource {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        let content = self.image.content().await?;
        let AssetContent::File(file_content) = *content else {
            bail!("Input source is not a file and can't be transformed into image information");
        };

        let file = file_content.await?;
        let FileContent::Content(file) = &*file else {
            bail!("Input source is not a file and can't be transformed into image information");
        };

        // Compute content hash for cache-busting
        let content_hash = turbo_tasks_hash::hash_xxh3_hash64(file.content());
        let content_hash_b16 = turbo_tasks_hash::encode_hex(content_hash);

        // Get image extension
        let ident = self.image.ident().await?;
        let ext = ident.path.extension_ref().unwrap_or("");

        // Get image metadata (width, height)
        let info = get_meta_data(*self.image, *file_content, None).await?;

        let mut result = RopeBuilder::from("");

        // Generate: export default { src: "hash.ext", width, height }
        // The src is just for cache-busting, not an actual URL
        writeln!(
            result,
            "export default {{ src: {src}, width: {width}, height: {height} }};",
            src = StringifyJs(&format!("{content_hash_b16}.{ext}")),
            width = StringifyJs(&info.width),
            height = StringifyJs(&info.height),
        )?;

        Ok(AssetContent::File(
            turbo_tasks_fs::FileContent::Content(result.build().into()).resolved_cell(),
        )
        .cell())
    }
}
