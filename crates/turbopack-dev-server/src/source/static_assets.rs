use anyhow::Result;
use turbo_tasks::{primitives::StringVc, Value};
use turbo_tasks_fs::{DirectoryContent, DirectoryEntry, FileSystemEntryType, FileSystemPathVc};
use turbopack_core::{
    asset::Asset,
    introspect::{
        asset::IntrospectableAssetVc, Introspectable, IntrospectableChildrenVc, IntrospectableVc,
    },
    source_asset::SourceAssetVc,
};

use super::{
    ContentSource, ContentSourceContentVc, ContentSourceData, ContentSourceResultVc,
    ContentSourceVc,
};

#[turbo_tasks::value(shared)]
pub struct StaticAssetsContentSource {
    pub prefix: StringVc,
    pub dir: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl StaticAssetsContentSourceVc {
    // TODO(WEB-1151): Remove this method and migrate users to `with_prefix`.
    #[turbo_tasks::function]
    pub fn new(prefix: String, dir: FileSystemPathVc) -> StaticAssetsContentSourceVc {
        StaticAssetsContentSourceVc::with_prefix(StringVc::cell(prefix), dir)
    }

    #[turbo_tasks::function]
    pub async fn with_prefix(
        prefix: StringVc,
        dir: FileSystemPathVc,
    ) -> Result<StaticAssetsContentSourceVc> {
        if cfg!(debug_assertions) {
            let prefix_string = prefix.await?;
            debug_assert!(prefix_string.is_empty() || prefix_string.ends_with('/'));
            debug_assert!(!prefix_string.starts_with('/'));
        }
        Ok(StaticAssetsContentSource { prefix, dir }.cell())
    }
}

#[turbo_tasks::value_impl]
impl ContentSource for StaticAssetsContentSource {
    #[turbo_tasks::function]
    async fn get(
        &self,
        path: &str,
        _data: Value<ContentSourceData>,
    ) -> Result<ContentSourceResultVc> {
        if !path.is_empty() {
            let prefix = self.prefix.await?;
            if let Some(path) = path.strip_prefix(&*prefix) {
                let path = self.dir.join(path);
                let ty = path.get_type().await?;
                if matches!(
                    &*ty,
                    FileSystemEntryType::File | FileSystemEntryType::Symlink
                ) {
                    let content = SourceAssetVc::new(path).as_asset().content();
                    return Ok(ContentSourceResultVc::exact(
                        ContentSourceContentVc::static_content(content.into()).into(),
                    ));
                }
            }
        }
        Ok(ContentSourceResultVc::not_found())
    }
}

#[turbo_tasks::value_impl]
impl Introspectable for StaticAssetsContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> StringVc {
        StringVc::cell("static assets directory content source".to_string())
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<IntrospectableChildrenVc> {
        let dir = self.dir.read_dir().await?;
        let DirectoryContent::Entries(entries) = &*dir else {
            return Ok(IntrospectableChildrenVc::cell(Default::default()));
        };

        let prefix = self.prefix.await?;
        let children = entries
            .iter()
            .map(|(name, entry)| {
                let child = match entry {
                    DirectoryEntry::File(path) | DirectoryEntry::Symlink(path) => {
                        IntrospectableAssetVc::new(SourceAssetVc::new(*path).as_asset())
                    }
                    DirectoryEntry::Directory(path) => StaticAssetsContentSourceVc::with_prefix(
                        StringVc::cell(format!("{}{name}/", &*prefix)),
                        *path,
                    )
                    .into(),
                    DirectoryEntry::Other(_) => todo!("what's DirectoryContent::Other?"),
                    DirectoryEntry::Error => todo!(),
                };
                (StringVc::cell(name.clone()), child)
            })
            .collect();
        Ok(IntrospectableChildrenVc::cell(children))
    }
}
