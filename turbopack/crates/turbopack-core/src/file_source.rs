use anyhow::{Context, Result, bail};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{
    DiskFileSystem, FileContent, FileSystemEntryType, FileSystemPath, LinkContent, LinkTarget,
    WriteLinkContent, WriteLinkTarget, WriteLinkTargetType,
};

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
        AssetIdent::from_path(self.path.clone())
            .with_query(self.query.clone())
            .with_fragment(self.fragment.clone())
            .into_vc()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<RcStr> {
        Vc::cell(format!("file content of {}", self.path).into())
    }
}

#[turbo_tasks::value_impl]
impl Asset for FileSource {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        let file_type = &*self.path.get_type().await?;
        match file_type {
            FileSystemEntryType::Symlink => match &*self.path.read_link().await? {
                LinkContent::Link { target } => {
                    let target_fs_path = target.file_system_path();
                    let write_target = match target {
                        LinkTarget::Relative { raw, resolved } if resolved.fs == self.path.fs => {
                            WriteLinkTarget::Relative(raw.clone())
                        }
                        LinkTarget::Absolute { resolved, .. }
                        | LinkTarget::Relative { resolved, .. } => {
                            let root = ResolvedVc::try_downcast_type::<DiskFileSystem>(resolved.fs)
                                .context("symlink target must be in a disk filesystem")?;
                            WriteLinkTarget::Absolute {
                                root,
                                path: resolved.path.clone(),
                            }
                        }
                    };
                    let write_target_type = match *target_fs_path.get_type().await? {
                        FileSystemEntryType::Directory => {
                            WriteLinkTargetType::DirectoryOrJunctionPoint
                        }
                        FileSystemEntryType::Symlink
                            if *target_fs_path.is_junction_point().await? =>
                        {
                            WriteLinkTargetType::DirectoryOrJunctionPoint
                        }
                        _ => WriteLinkTargetType::FileNonPortable,
                    };
                    Ok(AssetContent::Redirect(WriteLinkContent {
                        target: write_target,
                        target_type: write_target_type,
                    })
                    .cell())
                }
                LinkContent::NotFound => {
                    Ok(AssetContent::File(FileContent::NotFound.resolved_cell()).cell())
                }
                LinkContent::Invalid { reason } => bail!("Invalid symlink: {reason}"),
            },
            FileSystemEntryType::File => {
                Ok(AssetContent::File(self.path.read().to_resolved().await?).cell())
            }
            FileSystemEntryType::NotFound => {
                Ok(AssetContent::File(FileContent::NotFound.resolved_cell()).cell())
            }
            _ => bail!("Invalid file type {:?}", file_type),
        }
    }
}
