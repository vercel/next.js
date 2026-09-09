use anyhow::{Context, Result, bail};
use rustc_hash::FxHashMap;
use serde::{Serialize, Serializer, ser::SerializeTuple};
use turbo_rcstr::RcStr;
use turbo_tasks::ResolvedVc;
use turbo_tasks_fs::{FileSystem, FileSystemPath, WriteLinkContent, WriteLinkTarget};
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
    target: Option<AssetLocation>,
}

struct AdditionalRootConfig {
    name: RcStr,
    absolute_path: RcStr,
}

struct RootConfig {
    base: FileSystemPath,
    additional_root_index: Option<usize>,
}

struct NftSymlink {
    file_index: usize,
    target: RcStr,
    root: Option<isize>,
}

impl Serialize for NftSymlink {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
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
    absolute_path: RcStr,
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
        // lives in the output filesystem. We need to remap that back to the project filesystem. We
        // can assume that the project directory is a parent of the output directory.
        let project_root = project.project_fs().root().owned().await?;
        let output_base = nft_path.parent();
        let project_base = project_root.join(&output_base.path)?;
        root_configs.insert(
            project_root.fs,
            RootConfig {
                base: project_base,
                additional_root_index: None,
            },
        );
        // The NFT file includes references to bundled JS, which exists in the output filesystem. We
        // treat these the same as files in the project filesystem, but use an output-relative base
        // path.
        root_configs.insert(
            output_base.fs,
            RootConfig {
                base: output_base,
                additional_root_index: None,
            },
        );

        let mut additional_roots = Vec::with_capacity(project_ref.additional_roots.len());
        for (name, root) in &project_ref.additional_roots {
            let file_system = root.file_system.connect().to_resolved().await?;
            root_configs.insert(
                ResolvedVc::upcast(file_system),
                RootConfig {
                    base: file_system.root().owned().await?,
                    additional_root_index: Some(additional_roots.len()),
                },
            );
            additional_roots.push(AdditionalRootConfig {
                name: name.clone(),
                absolute_path: root.canonical_path.clone(),
            });
        }

        Ok(Self {
            root_configs,
            additional_roots,
            asset_refs: Vec::new(),
        })
    }

    fn classify(&self, path: &FileSystemPath) -> Result<AssetLocation> {
        let Some(root) = self.root_configs.get(&path.fs) else {
            bail!("NFT cannot handle filepath '{path}' because it is outside every accepted root")
        };
        let relative_path = root
            .base
            .get_relative_path_to(path)
            .context("path must be relative to its NFT root")?;
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

    async fn classify_link_target(
        &self,
        link_path: &FileSystemPath,
        content: &WriteLinkContent,
    ) -> Result<AssetLocation> {
        let target = match &content.target {
            WriteLinkTarget::Relative(path) => link_path.parent().join(path)?,
            WriteLinkTarget::Absolute { root, path } => {
                FileSystemPath::new_normalized_unchecked(ResolvedVc::upcast(*root), path.clone())
            }
        };
        self.classify(&target)
    }

    pub async fn add(
        &mut self,
        path: FileSystemPath,
        hash: RcStr,
        content: &AssetContent,
    ) -> Result<()> {
        let location = self.classify(&path)?;
        let target = match content {
            AssetContent::File(_) => None,
            AssetContent::Redirect(content) => {
                Some(self.classify_link_target(&path, content).await?)
            }
        };
        self.asset_refs.push(AssetReference {
            location,
            hash,
            target,
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

            if let Some(target) = asset.target {
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
                absolute_path: root.absolute_path,
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
