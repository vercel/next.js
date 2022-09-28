use std::{collections::HashSet, future::Future, pin::Pin};

use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbo_tasks_fs::{DirectoryContent, DirectoryEntry, FileSystemEntryType, FileSystemPathVc};
use turbopack_core::{
    asset::AssetVc,
    reference::{AssetReference, AssetReferenceVc},
    resolve::{
        pattern::{Pattern, PatternVc},
        ResolveResult, ResolveResultVc,
    },
    source_asset::SourceAssetVc,
};

#[turbo_tasks::value]
#[derive(Hash, Clone, Debug)]
pub struct PackageJsonReference {
    pub package_json: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl PackageJsonReferenceVc {
    #[turbo_tasks::function]
    pub fn new(package_json: FileSystemPathVc) -> Self {
        Self::cell(PackageJsonReference { package_json })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for PackageJsonReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        ResolveResult::Single(SourceAssetVc::new(self.package_json).into(), Vec::new()).into()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for PackageJsonReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "package.json {}",
            self.package_json.to_string().await?,
        )))
    }
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct DirAssetReference {
    pub source: AssetVc,
    pub path: PatternVc,
}

#[turbo_tasks::value_impl]
impl DirAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(source: AssetVc, path: PatternVc) -> Self {
        Self::cell(DirAssetReference { source, path })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for DirAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<ResolveResultVc> {
        let context_path = self.source.path().await?;
        // ignore path.join in `node-gyp`, it will includes too many files
        if context_path.path.contains("node_modules/node-gyp") {
            return Ok(ResolveResult::Alternatives(Vec::new(), vec![]).into());
        }
        let context = self.source.path().parent();
        let pat = self.path.await?;
        let mut result = HashSet::default();
        let fs = context.fs();
        match &*pat {
            Pattern::Constant(p) => {
                let dest_file_path = FileSystemPathVc::new(fs, p.trim_start_matches("/ROOT/"));
                // ignore error
                if let Ok(entry_type) = dest_file_path.get_type().await {
                    match &*entry_type {
                        FileSystemEntryType::Directory => {
                            result = read_dir(dest_file_path).await?;
                        }
                        FileSystemEntryType::File => {
                            result.insert(SourceAssetVc::new(dest_file_path).into());
                        }
                        _ => {}
                    }
                }
            }
            Pattern::Alternatives(alternatives) => {
                for alternative_pattern in alternatives {
                    let mut pat = alternative_pattern.clone();
                    pat.normalize();
                    if let Pattern::Constant(p) = pat {
                        let dest_file_path =
                            FileSystemPathVc::new(fs, p.trim_start_matches("/ROOT/"));
                        // ignore error
                        if let Ok(entry_type) = dest_file_path.get_type().await {
                            match &*entry_type {
                                FileSystemEntryType::Directory => {
                                    result.extend(read_dir(dest_file_path).await?);
                                }
                                FileSystemEntryType::File => {
                                    result.insert(SourceAssetVc::new(dest_file_path).into());
                                }
                                _ => {}
                            }
                        }
                    }
                }
            }
            _ => {}
        }
        Ok(ResolveResult::Alternatives(result.into_iter().collect(), vec![]).into())
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for DirAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "directory assets {}",
            self.path.to_string().await?,
        )))
    }
}

async fn read_dir(p: FileSystemPathVc) -> Result<HashSet<AssetVc>> {
    let mut result = HashSet::default();
    let dir_entries = p.read_dir().await?;
    if let DirectoryContent::Entries(entries) = &*dir_entries {
        for (_, entry) in entries.iter() {
            match entry {
                DirectoryEntry::File(file) => {
                    result.insert(SourceAssetVc::new(*file).into());
                }
                DirectoryEntry::Directory(dir) => {
                    let sub = read_dir_boxed(*dir).await?;
                    result.extend(sub);
                }
                _ => {}
            }
        }
    }
    Ok(result)
}

fn read_dir_boxed(
    p: FileSystemPathVc,
) -> Pin<Box<dyn Future<Output = Result<HashSet<AssetVc>>> + Send>> {
    Box::pin(read_dir(p))
}
