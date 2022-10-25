use std::collections::HashSet;

use anyhow::Result;
use turbo_tasks::{primitives::StringVc, Value};
use turbo_tasks_fs::{DirectoryContent, DirectoryEntry, FileSystemEntryType, FileSystemPathVc};
use turbopack_core::{
    introspect::{
        asset::IntrospectableAssetVc, Introspectable, IntrospectableChildrenVc, IntrospectableVc,
    },
    source_asset::SourceAssetVc,
};

use super::{
    ContentSource, ContentSourceData, ContentSourceResult, ContentSourceResultVc, ContentSourceVc,
};

#[turbo_tasks::value(shared)]
pub struct StaticAssetsContentSource {
    pub prefix: String,
    pub dir: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl StaticAssetsContentSourceVc {
    #[turbo_tasks::function]
    pub fn new(prefix: String, dir: FileSystemPathVc) -> StaticAssetsContentSourceVc {
        let mut prefix = prefix;
        if !prefix.is_empty() && !prefix.ends_with('/') {
            prefix.push('/');
        }
        StaticAssetsContentSource { prefix, dir }.cell()
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
            if let Some(path) = path.strip_prefix(&self.prefix) {
                let path = self.dir.join(path);
                let ty = path.get_type().await?;
                if matches!(
                    &*ty,
                    FileSystemEntryType::File | FileSystemEntryType::Symlink
                ) {
                    let content = SourceAssetVc::new(path).as_asset().content();
                    return Ok(ContentSourceResult::Static(content.into()).cell());
                }
            }
        }
        Ok(ContentSourceResult::NotFound.cell())
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
        let children = match &*dir {
            DirectoryContent::NotFound => HashSet::new(),
            DirectoryContent::Entries(entries) => entries
                .iter()
                .map(|(name, entry)| {
                    let child = match entry {
                        DirectoryEntry::File(path) | DirectoryEntry::Symlink(path) => {
                            IntrospectableAssetVc::new(SourceAssetVc::new(*path).as_asset())
                        }
                        DirectoryEntry::Directory(path) => StaticAssetsContentSourceVc::new(
                            format!("{prefix}{name}", prefix = self.prefix),
                            *path,
                        )
                        .into(),
                        DirectoryEntry::Other(_) => todo!("what's DirectoryContent::Other?"),
                        DirectoryEntry::Error => todo!(),
                    };
                    (StringVc::cell(name.clone()), child)
                })
                .collect(),
        };
        Ok(IntrospectableChildrenVc::cell(children))
    }
}
