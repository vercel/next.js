use anyhow::Result;
use serde::{Serializer, ser::SerializeMap};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    output::{OutputAsset, OutputAssetsReference},
};

use crate::paths::{AssetPath, AssetPaths};

#[turbo_tasks::value]
pub struct AssetHashesManifestAsset {
    output_path: FileSystemPath,
    asset_paths: ResolvedVc<AssetPaths>,
    hash_prefix: Option<RcStr>,
}

#[turbo_tasks::value_impl]
impl AssetHashesManifestAsset {
    #[turbo_tasks::function]
    pub fn new(
        output_path: FileSystemPath,
        asset_paths: ResolvedVc<AssetPaths>,
        hash_prefix: Option<RcStr>,
    ) -> Vc<Self> {
        AssetHashesManifestAsset {
            output_path,
            asset_paths,
            hash_prefix,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for AssetHashesManifestAsset {}

#[turbo_tasks::value_impl]
impl OutputAsset for AssetHashesManifestAsset {
    #[turbo_tasks::function]
    async fn path(&self) -> Vc<FileSystemPath> {
        self.output_path.clone().cell()
    }
}

#[turbo_tasks::value_impl]
impl Asset for AssetHashesManifestAsset {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        let files = self.asset_paths.await?;

        struct Manifest<'a> {
            asset_paths: &'a Vec<AssetPath>,
            hash_prefix: &'a Option<RcStr>,
        }

        impl serde::Serialize for Manifest<'_> {
            fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
                let mut map = serializer.serialize_map(Some(self.asset_paths.len()))?;
                let mut buf = String::new();
                for entry in self.asset_paths {
                    if let Some(prefix) = self.hash_prefix {
                        use std::fmt::Write;
                        buf.clear();
                        write!(buf, "{}{}", prefix, entry.content_hash).unwrap();
                        map.serialize_entry(&entry.path, &buf)?;
                    } else {
                        map.serialize_entry(&entry.path, &entry.content_hash)?;
                    }
                }
                map.end()
            }
        }

        let json = serde_json::to_string(&Manifest {
            asset_paths: &files,
            hash_prefix: &self.hash_prefix,
        })?;

        Ok(AssetContent::file(
            FileContent::Content(File::from(json)).cell(),
        ))
    }
}
