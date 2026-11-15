use anyhow::{Context, Result, bail};
use rustc_hash::FxHashMap;
use serde::{Serialize, Serializer, ser::SerializeTuple};
use turbo_rcstr::RcStr;
use turbo_tasks::ResolvedVc;
use turbo_tasks_fs::{DiskFileSystem, FileSystem, FileSystemPath};
use turbo_unix_path::{get_relative_path_to, sys_to_unix};
use turbopack_core::asset::AssetContent;

use crate::project::Project;

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
enum AssetLocation {
    Base { path: RcStr },
    AdditionalRoot { root_index: usize, path: RcStr },
}

impl AssetLocation {
    fn parts(&self) -> (Option<usize>, &RcStr) {
        match self {
            Self::Base { path } => (None, path),
            Self::AdditionalRoot { root_index, path } => (Some(*root_index), path),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct AssetReference {
    location: AssetLocation,
    hash: RcStr,
    /// Present for symlinks.
    symlink_target: Option<AssetLocation>,
}

struct AdditionalRootConfig {
    name: RcStr,
    path: RcStr,
}

struct RootConfig {
    base: RcStr,
    additional_root_index: Option<usize>,
}

struct NftSymlink {
    file_index: usize,
    target: RcStr,
    root: Option<isize>,
}

impl Serialize for NftSymlink {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut tuple = serializer.serialize_tuple(if self.root.is_some() { 3 } else { 2 })?;
        tuple.serialize_element(&self.file_index)?;
        tuple.serialize_element(&self.target)?;
        if let Some(root) = self.root {
            tuple.serialize_element(&root)?;
        }
        tuple.end()
    }
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct NftFileList {
    files: Vec<RcStr>,
    file_hashes: Vec<RcStr>,
    symlinks: Vec<NftSymlink>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NftAdditionalRoot {
    #[serde(flatten)]
    file_list: NftFileList,
    name: RcStr,
    path: RcStr,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NftJson {
    #[serde(flatten)]
    file_list: NftFileList,
    version: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    entry_hash: Option<RcStr>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    additional_roots: Vec<NftAdditionalRoot>,
}

pub(crate) struct NftJsonBuilder {
    root_configs: FxHashMap<ResolvedVc<Box<dyn FileSystem>>, RootConfig>,
    additional_roots: Vec<AdditionalRootConfig>,
    /// These eventually get converted to `NftFileList` in `into_json`, but we store them in this
    /// intermediate format because it's easier to sort and dedupe.
    asset_refs: Vec<AssetReference>,
}

impl NftJsonBuilder {
    pub async fn new(project: ResolvedVc<Project>, nft_path: &FileSystemPath) -> Result<Self> {
        let project_ref = project.await?;
        let mut root_configs = FxHashMap::default();

        // Files not listed under `additionalRoots` have paths relative to the nft.json file, which
        // lives in the output filesystem. The project and output filesystems share a root path, so
        // their paths can be compared directly even when the output is outside the project.
        let project_root = project.project_fs().root().owned().await?;
        let output_base = nft_path.parent();
        let output_file_system = ResolvedVc::try_downcast_type::<DiskFileSystem>(output_base.fs)
            .context("NFT path must use a disk filesystem")?;
        let output_base_path = output_file_system.await?.to_sys_path_raw(&output_base);
        let output_base_path = sys_to_unix(
            output_base_path
                .to_str()
                .context("NFT path must be valid Unicode")?,
        );
        root_configs.insert(
            project_root.fs,
            RootConfig {
                base: output_base.path.clone(),
                additional_root_index: None,
            },
        );
        // The NFT file includes references to bundled JS, which exists in the output filesystem. We
        // treat these the same as files in the project filesystem, but use an output-relative base
        // path.
        root_configs.insert(
            output_base.fs,
            RootConfig {
                base: output_base.path,
                additional_root_index: None,
            },
        );

        let mut additional_roots = Vec::with_capacity(project_ref.additional_roots.len());
        for (name, root) in &project_ref.additional_roots {
            let file_system = root.file_system.connect().to_resolved().await?;
            root_configs.insert(
                ResolvedVc::upcast(file_system),
                RootConfig {
                    base: file_system.root().owned().await?.path,
                    additional_root_index: Some(additional_roots.len()),
                },
            );
            let root_path = sys_to_unix(&root.canonical_path);
            additional_roots.push(AdditionalRootConfig {
                name: name.clone(),
                path: get_relative_path_to(&output_base_path, &root_path).into(),
            });
        }

        Ok(Self {
            root_configs,
            additional_roots,
            asset_refs: Vec::new(),
        })
    }

    fn location_for_path(&self, path: &FileSystemPath) -> Result<AssetLocation> {
        let Some(root) = self.root_configs.get(&path.fs) else {
            bail!("NFT cannot handle filepath '{path}' because it is outside every accepted root")
        };
        let relative_path = RcStr::from(get_relative_path_to(&root.base, &path.path));
        if let Some(root_index) = root.additional_root_index {
            Ok(AssetLocation::AdditionalRoot {
                root_index,
                path: relative_path,
            })
        } else {
            Ok(AssetLocation::Base {
                path: relative_path,
            })
        }
    }

    pub fn add(&mut self, path: FileSystemPath, hash: RcStr, content: &AssetContent) -> Result<()> {
        let location = self.location_for_path(&path)?;
        let symlink_target = match content {
            AssetContent::File(_) => None,
            AssetContent::Redirect(content) => Some(self.location_for_path(&content.target)?),
        };
        self.asset_refs.push(AssetReference {
            location,
            hash,
            symlink_target,
        });
        Ok(())
    }

    pub fn into_json(mut self, entry_hash: Option<RcStr>) -> NftJson {
        self.asset_refs
            .sort_unstable_by(|a, b| a.location.cmp(&b.location));
        self.asset_refs.dedup_by(|a, b| a.location == b.location);

        let mut base = NftFileList::default();
        let mut roots = (0..self.additional_roots.len())
            .map(|_| NftFileList::default())
            .collect::<Vec<_>>();

        for asset in self.asset_refs {
            let (source_root, path) = asset.location.parts();
            let list = match source_root {
                None => &mut base,
                Some(index) => &mut roots[index],
            };
            let file_index = list.files.len();
            list.files.push(path.clone());
            list.file_hashes.push(asset.hash);

            if let Some(target) = asset.symlink_target {
                let (target_root, target_path) = target.parts();
                let root = if source_root == target_root {
                    None
                } else {
                    Some(target_root.map(|index| index as isize).unwrap_or(-1))
                };
                list.symlinks.push(NftSymlink {
                    file_index,
                    target: target_path.clone(),
                    root,
                });
            }
        }

        let additional_roots = self
            .additional_roots
            .into_iter()
            .zip(roots)
            .map(|(root, list)| NftAdditionalRoot {
                file_list: list,
                name: root.name,
                path: root.path,
            })
            .collect();
        NftJson {
            file_list: base,
            version: 1,
            entry_hash,
            additional_roots,
        }
    }
}
