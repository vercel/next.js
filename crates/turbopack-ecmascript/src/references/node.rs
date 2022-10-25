use std::{future::Future, pin::Pin};

use anyhow::Result;
use indexmap::IndexSet;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbo_tasks_fs::{
    DirectoryContent, DirectoryEntry, FileSystemEntryType, FileSystemPathVc, FileSystemVc,
};
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
        let mut result = IndexSet::default();
        let fs = context.fs();
        match &*pat {
            Pattern::Constant(p) => {
                extend_with_constant_pattern(p, fs, &mut result).await?;
            }
            Pattern::Alternatives(alternatives) => {
                for alternative_pattern in alternatives {
                    let mut pat = alternative_pattern.clone();
                    pat.normalize();
                    if let Pattern::Constant(p) = pat {
                        extend_with_constant_pattern(&p, fs, &mut result).await?;
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

async fn extend_with_constant_pattern(
    pattern: &str,
    fs: FileSystemVc,
    result: &mut IndexSet<AssetVc>,
) -> Result<()> {
    let dest_file_path = fs.root().join(pattern.trim_start_matches("/ROOT/"));
    // ignore error
    let realpath_with_links = match dest_file_path.realpath_with_links().await {
        Ok(p) => p,
        Err(_) => return Ok(()),
    };
    let dest_file_path = realpath_with_links.path;
    result.extend(
        realpath_with_links
            .symlinks
            .iter()
            .map(|l| SourceAssetVc::new(*l).as_asset()),
    );
    let entry_type = match dest_file_path.get_type().await {
        Ok(e) => e,
        Err(_) => return Ok(()),
    };
    match &*entry_type {
        FileSystemEntryType::Directory => {
            result.extend(read_dir(dest_file_path).await?);
        }
        FileSystemEntryType::File | FileSystemEntryType::Symlink => {
            result.insert(SourceAssetVc::new(dest_file_path).into());
        }
        _ => {}
    }
    Ok(())
}

async fn read_dir(p: FileSystemPathVc) -> Result<IndexSet<AssetVc>> {
    let mut result = IndexSet::new();
    let dir_entries = p.read_dir().await?;
    if let DirectoryContent::Entries(entries) = &*dir_entries {
        let mut entries = entries.iter().collect::<Vec<_>>();
        entries.sort_by_key(|(k, _)| *k);
        for (_, entry) in entries {
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
) -> Pin<Box<dyn Future<Output = Result<IndexSet<AssetVc>>> + Send>> {
    Box::pin(read_dir(p))
}
