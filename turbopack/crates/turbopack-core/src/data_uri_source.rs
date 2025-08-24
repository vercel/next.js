use anyhow::{Result, bail};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath, rope::Rope};
use turbo_tasks_hash::{encode_hex, hash_xxh3_hash64};

use crate::{
    asset::{Asset, AssetContent},
    ident::AssetIdent,
    source::Source,
};

/// The raw [Source]. It represents raw content from a path without any
/// references to other [Source]s.
#[turbo_tasks::value]
pub struct DataUriSource {
    media_type: RcStr,
    encoding: RcStr,
    data: ResolvedVc<RcStr>,
    lookup_path: FileSystemPath,
}

#[turbo_tasks::value_impl]
impl DataUriSource {
    #[turbo_tasks::function]
    pub fn new(
        media_type: RcStr,
        encoding: RcStr,
        data: ResolvedVc<RcStr>,
        lookup_path: FileSystemPath,
    ) -> Vc<Self> {
        Self::cell(DataUriSource {
            media_type,
            encoding,
            data,
            lookup_path,
        })
    }
}

#[turbo_tasks::value_impl]
impl Source for DataUriSource {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        let content_type = self.media_type.split(";").next().unwrap().into();
        let filename = format!(
            "data:{}",
            &encode_hex(hash_xxh3_hash64((
                &*self.data.await?,
                &self.media_type,
                &self.encoding
            )))[0..6]
        );
        Ok(
            AssetIdent::from_path(self.lookup_path.join(&filename)?)
                .with_content_type(content_type),
        )
    }
}

#[turbo_tasks::value_impl]
impl Asset for DataUriSource {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        let data = self.data.await?;
        let rope = if self.encoding == "base64" {
            let decoded = data_encoding::BASE64.decode(data.as_bytes())?;
            // TODO this should read self.media_type and potentially use a different encoding
            Rope::from(decoded)
        } else if self.encoding.is_empty() {
            let decoded = urlencoding::decode(data.as_str())?.into_owned();
            Rope::from(decoded)
        } else {
            bail!("Unsupported data URL encoding: {}", self.encoding);
        };
        Ok(AssetContent::file(
            FileContent::from(File::from(rope)).cell(),
        ))
    }
}
