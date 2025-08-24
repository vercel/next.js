use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::Vc;
use turbo_tasks_fs::{FileContent, FileSystemEntryType, FileSystemPath, LinkContent};

use crate::{
    asset::{Asset, AssetContent},
    ident::AssetIdent,
    source::Source,
};

/// The raw [Source]. It represents raw content from a path without any
/// references to other [Source]s.
#[turbo_tasks::value]
pub struct FileSource {
    path: FileSystemPath,
    query: RcStr,
    fragment: RcStr,
}

impl FileSource {
    pub fn new(path: FileSystemPath) -> Vc<Self> {
        FileSource::new_with_query_and_fragment(path, RcStr::default(), RcStr::default())
    }
    pub fn new_with_query(path: FileSystemPath, query: RcStr) -> Vc<Self> {
        FileSource::new_with_query_and_fragment(path, query, RcStr::default())
    }
}

#[turbo_tasks::value_impl]
impl FileSource {
    #[turbo_tasks::function]
    pub fn new_with_query_and_fragment(
        path: FileSystemPath,
        query: RcStr,
        fragment: RcStr,
    ) -> Vc<Self> {
        Self::cell(FileSource {
            path,
            query,
            fragment,
        })
    }
}

#[turbo_tasks::value_impl]
impl Source for FileSource {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        let mut ident = AssetIdent::from_path(self.path.clone());
        if !self.query.is_empty() {
            ident = ident.with_query(self.query.clone());
        }
        if !self.fragment.is_empty() {
            ident = ident.with_fragment(self.fragment.clone());
        }
        ident
    }
}

#[turbo_tasks::value_impl]
impl Asset for FileSource {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        let file_type = &*self.path.get_type().await?;
        match file_type {
            FileSystemEntryType::Symlink => match &*self.path.read_link().await? {
                LinkContent::Link { target, link_type } => Ok(AssetContent::Redirect {
                    target: target.clone(),
                    link_type: *link_type,
                }
                .cell()),
                _ => Err(anyhow::anyhow!("Invalid symlink")),
            },
            FileSystemEntryType::File => {
                Ok(AssetContent::File(self.path.read().to_resolved().await?).cell())
            }
            FileSystemEntryType::NotFound => {
                Ok(AssetContent::File(FileContent::NotFound.resolved_cell()).cell())
            }
            _ => Err(anyhow::anyhow!("Invalid file type {:?}", file_type)),
        }
    }
}
