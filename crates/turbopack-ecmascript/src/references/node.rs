use std::{future::Future, pin::Pin};

use anyhow::Result;
use indexmap::IndexSet;
use turbo_tasks::{ValueToString, Vc};
use turbo_tasks_fs::{
    DirectoryContent, DirectoryEntry, FileSystem, FileSystemEntryType, FileSystemPath,
};
use turbopack_core::{
    asset::Asset,
    file_source::FileSource,
    reference::AssetReference,
    resolve::{pattern::Pattern, ResolveResult},
    source::Source,
};

#[turbo_tasks::value]
#[derive(Hash, Clone, Debug)]
pub struct PackageJsonReference {
    pub package_json: Vc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl PackageJsonReference {
    #[turbo_tasks::function]
    pub fn new(package_json: Vc<FileSystemPath>) -> Vc<Self> {
        Self::cell(PackageJsonReference { package_json })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for PackageJsonReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ResolveResult> {
        ResolveResult::asset(Vc::upcast(FileSource::new(self.package_json))).into()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for PackageJsonReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<String>> {
        Ok(Vc::cell(format!(
            "package.json {}",
            self.package_json.to_string().await?,
        )))
    }
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct DirAssetReference {
    pub source: Vc<Box<dyn Source>>,
    pub path: Vc<Pattern>,
}

#[turbo_tasks::value_impl]
impl DirAssetReference {
    #[turbo_tasks::function]
    pub fn new(source: Vc<Box<dyn Source>>, path: Vc<Pattern>) -> Vc<Self> {
        Self::cell(DirAssetReference { source, path })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for DirAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ResolveResult>> {
        let context_path = self.source.ident().path().await?;
        // ignore path.join in `node-gyp`, it will includes too many files
        if context_path.path.contains("node_modules/node-gyp") {
            return Ok(ResolveResult::unresolveable().into());
        }
        let context = self.source.ident().path().parent();
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
        Ok(ResolveResult::assets_with_references(result.into_iter().collect(), vec![]).into())
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for DirAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<String>> {
        Ok(Vc::cell(format!(
            "directory assets {}",
            self.path.to_string().await?,
        )))
    }
}

type AssetSet = IndexSet<Vc<Box<dyn Asset>>>;

async fn extend_with_constant_pattern(
    pattern: &str,
    fs: Vc<Box<dyn FileSystem>>,
    result: &mut AssetSet,
) -> Result<()> {
    let dest_file_path = fs
        .root()
        .join(pattern.trim_start_matches("/ROOT/").to_string());
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
            .map(|l| Vc::upcast(FileSource::new(*l))),
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
            result.insert(Vc::upcast(FileSource::new(dest_file_path)));
        }
        _ => {}
    }
    Ok(())
}

async fn read_dir(p: Vc<FileSystemPath>) -> Result<AssetSet> {
    let mut result = IndexSet::new();
    let dir_entries = p.read_dir().await?;
    if let DirectoryContent::Entries(entries) = &*dir_entries {
        let mut entries = entries.iter().collect::<Vec<_>>();
        entries.sort_by_key(|(k, _)| *k);
        for (_, entry) in entries {
            match entry {
                DirectoryEntry::File(file) => {
                    result.insert(Vc::upcast(FileSource::new(*file)));
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

fn read_dir_boxed(p: Vc<FileSystemPath>) -> Pin<Box<dyn Future<Output = Result<AssetSet>> + Send>> {
    Box::pin(read_dir(p))
}
