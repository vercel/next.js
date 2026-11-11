//! Capture native external package contents without publishing live filesystem links.
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet, VecDeque};

use anyhow::{Context, Result, bail};
use next_taskless::NODE_EXTERNALS;
use serde::Serialize;
use turbo_tasks::ResolvedVc;
use turbo_tasks_fs::{
    DirectoryContent, DirectoryEntry, File, FileContent, FileJsonContent, FileSystemEntryType,
    FileSystemPath,
};
use turbo_tasks_hash::{encode_hex, hash_xxh3_hash64};
use turbopack_core::{
    asset::AssetContent, output::OutputAsset, virtual_output::VirtualOutputAsset,
};

#[derive(Serialize)]
struct ExternalLayout {
    version: u8,
    kind: &'static str,
    directories: Vec<String>,
    links: Vec<ExternalLink>,
}

#[derive(Serialize)]
struct ExternalLink {
    path: String,
    target: String,
}

fn dependency_name(name: &str) -> bool {
    let parts = name.split('/').collect::<Vec<_>>();
    let valid = |part: &str| {
        !part.is_empty() && part != "." && part != ".." && !part.contains(['\\', ':', '%', '\0'])
    };
    match parts.as_slice() {
        [name] => valid(name) && !name.starts_with('@'),
        [scope, name] => scope.starts_with('@') && scope.len() > 1 && valid(scope) && valid(name),
        _ => false,
    }
}

async fn dependency_root(owner: &FileSystemPath, name: &str) -> Result<Option<FileSystemPath>> {
    let mut current = owner.clone();
    loop {
        if current.file_name() != "node_modules" {
            let candidate = current.join("node_modules")?.join(name)?;
            match candidate.realpath().await? {
                Ok(real) if matches!(&*real.get_type().await?, FileSystemEntryType::Directory) => {
                    return Ok(Some(real));
                }
                Ok(_) => bail!("External dependency {name} is not a package directory"),
                Err(error)
                    if matches!(error.kind(), turbo_tasks_fs::RealPathErrorType::NotFound) => {}
                Err(error) => bail!("Cannot capture external dependency {name}: {error}"),
            }
        }
        let parent = current.parent();
        if parent == current {
            return Ok(None);
        }
        current = parent;
    }
}

fn capture_root(
    root: FileSystemPath,
    roots: &mut HashMap<FileSystemPath, String>,
    ids: &mut HashMap<String, FileSystemPath>,
    queue: &mut VecDeque<FileSystemPath>,
) -> Result<String> {
    if let Some(directory) = roots.get(&root) {
        return Ok(directory.clone());
    }
    let id = encode_hex(hash_xxh3_hash64(&root.path));
    if let Some(previous) = ids.get(&id)
        && previous != &root
    {
        bail!("External package directory identity collision");
    }
    ids.insert(id.clone(), root.clone());
    let directory = format!("node_modules/.next-test-external/{id}");
    roots.insert(root.clone(), directory.clone());
    queue.push_back(root);
    Ok(directory)
}

fn insert_link(links: &mut BTreeMap<String, String>, path: String, target: String) -> Result<()> {
    if let Some(previous) = links.insert(path, target.clone())
        && previous != target
    {
        bail!("External package layout has conflicting link targets");
    }
    Ok(())
}

pub(crate) async fn capture_external_packages(
    external_links: Vec<(String, FileSystemPath)>,
    destination: &FileSystemPath,
    native_id: &str,
) -> Result<Vec<ResolvedVc<Box<dyn OutputAsset>>>> {
    let mut roots = HashMap::new();
    let mut ids = HashMap::new();
    let mut queue = VecDeque::new();
    let mut links = BTreeMap::new();
    let mut files = BTreeSet::new();
    let mut assets = Vec::new();
    for (path, target) in external_links {
        let root = target
            .realpath()
            .await?
            .with_context(|| format!("External package target is unavailable: {}", target.path))?;
        if !matches!(&*root.get_type().await?, FileSystemEntryType::Directory) {
            bail!("External package target must be a directory");
        }
        let directory = capture_root(root, &mut roots, &mut ids, &mut queue)?;
        insert_link(&mut links, path, directory)?;
    }
    while let Some(root) = queue.pop_front() {
        let directory = roots
            .get(&root)
            .context("Missing captured external package")?
            .clone();
        let metadata = root.join("package.json")?.read_json().await?;
        let mut dependencies = BTreeMap::<String, bool>::new();
        match &*metadata {
            FileJsonContent::Content(value) => {
                for (field, required) in [
                    ("dependencies", true),
                    ("peerDependencies", false),
                    ("optionalDependencies", false),
                ] {
                    if let Some(value) = value.get(field) {
                        let entries = value.as_object().with_context(|| {
                            format!("External package {field} must be an object")
                        })?;
                        for name in entries.keys() {
                            if !dependency_name(name) {
                                bail!("External package dependency name is unsupported: {name}");
                            }
                            if field == "optionalDependencies" {
                                dependencies.insert(name.clone(), false);
                            } else {
                                dependencies
                                    .entry(name.clone())
                                    .and_modify(|value| *value |= required)
                                    .or_insert(required);
                            }
                        }
                    }
                }
            }
            FileJsonContent::NotFound => {}
            FileJsonContent::Unparsable(_) => {
                bail!("External package metadata is not valid JSON: {}", root.path)
            }
        }
        for (name, required) in dependencies {
            // Native loaders resolve builtins before looking in node_modules.
            if NODE_EXTERNALS.binary_search(&name.as_str()).is_ok() {
                continue;
            }
            // A package with exports resolves its own name without a node_modules edge.
            if let FileJsonContent::Content(value) = &*metadata
                && value.get("name").and_then(serde_json::Value::as_str) == Some(name.as_str())
                && value
                    .get("exports")
                    .is_some_and(|exports| !exports.is_null())
            {
                continue;
            }
            let Some(target) = dependency_root(&root, &name).await? else {
                if required {
                    bail!(
                        "Cannot capture declared external dependency {name} from {}",
                        root.path
                    );
                }
                continue;
            };
            let target = capture_root(target, &mut roots, &mut ids, &mut queue)?;
            insert_link(
                &mut links,
                format!("{directory}/node_modules/{name}"),
                target,
            )?;
        }
        let mut directories = vec![(root.clone(), directory)];
        let mut seen = HashSet::new();
        while let Some((path, relative)) = directories.pop() {
            if !seen.insert(path.clone()) {
                bail!("External package directory cycle");
            }
            let entries = path.read_dir().await?;
            let DirectoryContent::Entries(entries) = &*entries else {
                bail!("External package directory disappeared: {}", path.path);
            };
            let mut entries = entries.iter().collect::<Vec<_>>();
            entries.sort_by(|a, b| a.0.cmp(b.0));
            for (name, entry) in entries {
                if name == "node_modules" {
                    continue;
                }
                let output = format!("{relative}/{name}");
                match entry {
                    DirectoryEntry::File(source) => {
                        if !files.insert(output.clone()) {
                            bail!("Duplicate external package file");
                        }
                        let content = source.read();
                        if !matches!(&*content.await?, FileContent::Content(_)) {
                            bail!("External package file disappeared: {}", source.path);
                        }
                        assets.push(ResolvedVc::upcast(
                            VirtualOutputAsset::new(
                                destination.join(&output)?,
                                AssetContent::file(content),
                            )
                            .to_resolved()
                            .await?,
                        ));
                    }
                    DirectoryEntry::Directory(source) => directories.push((source.clone(), output)),
                    DirectoryEntry::Symlink(source) => bail!(
                        "External package contains an unmapped symbolic link: {}",
                        source.path
                    ),
                    _ => {
                        bail!("External package contains an unsupported filesystem entry: {output}")
                    }
                }
            }
        }
    }
    let mut directories = roots.into_values().collect::<Vec<_>>();
    directories.sort();
    let layout = ExternalLayout {
        version: 1,
        kind: "node-external-layout",
        directories,
        links: links
            .into_iter()
            .map(|(path, target)| ExternalLink { path, target })
            .collect(),
    };
    let content = FileContent::Content(File::from(serde_json::to_string(&layout)?)).cell();
    assets.push(ResolvedVc::upcast(
        VirtualOutputAsset::new(
            destination.join(&format!(
                "server/next-test/{native_id}.external-layout.json"
            ))?,
            AssetContent::file(content),
        )
        .to_resolved()
        .await?,
    ));
    Ok(assets)
}

#[cfg(test)]
mod tests {
    use anyhow::Result;
    use turbo_rcstr::{RcStr, rcstr};
    use turbo_tasks::{TurboTasks, Vc};
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
    use turbo_tasks_fs::{DiskFileSystem, FileSystem};
    use turbopack_core::{asset::Asset, output::OutputAsset};

    use crate::testing_external_packages::{capture_external_packages, dependency_name};

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn captures_shared_dependencies_and_cycles_once() -> Result<()> {
        #[turbo_tasks::function(operation, root)]
        async fn operation(disk_root: RcStr) -> Result<()> {
            let root = DiskFileSystem::new(rcstr!("external-layout"), Vc::cell(disk_root))
                .root()
                .owned()
                .await?;
            let destination = root.join("output")?;
            let package = root.join("node_modules/a")?;
            let assets = capture_external_packages(
                vec![
                    ("node_modules/alias-a".into(), package.clone()),
                    ("node_modules/alias-again".into(), package),
                ],
                &destination,
                "entry",
            )
            .await?;
            assert_eq!(assets.len(), 7);
            let mut layout = None;
            for asset in assets {
                let path = asset.path().await?;
                let relative = destination.get_path_to(&path).unwrap();
                assert!(
                    relative.starts_with("node_modules/.next-test-external/")
                        || relative == "server/next-test/entry.external-layout.json"
                );
                if relative.ends_with(".external-layout.json") {
                    let content =
                        next_core::util::file_content_rope(asset.content().file_content()).await?;
                    layout = Some(serde_json::from_str::<serde_json::Value>(
                        &content.to_str()?,
                    )?);
                }
            }
            let layout = layout.unwrap();
            let directories = layout["directories"].as_array().unwrap();
            assert_eq!(directories.len(), 3);
            let links = layout["links"].as_array().unwrap();
            assert_eq!(links.len(), 6);
            let alias =
                |path| links.iter().find(|link| link["path"] == path).unwrap()["target"].clone();
            assert_eq!(
                alias("node_modules/alias-a"),
                alias("node_modules/alias-again")
            );
            for link in links {
                assert!(directories.contains(&link["target"]));
            }
            Ok(())
        }
        let directory = tempfile::tempdir()?;
        for (name, deps) in [
            ("a", serde_json::json!({"b":"*","c":"*"})),
            ("b", serde_json::json!({"b":"*", "c":"*", "fs":"*"})),
            ("c", serde_json::json!({"a":"*"})),
        ] {
            let package = directory.path().join("node_modules").join(name);
            std::fs::create_dir_all(&package)?;
            std::fs::write(
                package.join("package.json"),
                serde_json::to_string(
                    &serde_json::json!({"name": name, "exports": "./index.cjs", "dependencies": deps, "optionalDependencies": {"absent":"*"}}),
                )?,
            )?;
            std::fs::write(
                package.join("index.cjs"),
                format!("module.exports = '{name}'"),
            )?;
        }
        let disk_root: RcStr = directory.path().canonicalize()?.to_str().unwrap().into();
        let tasks = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tasks
            .run_once(async move {
                operation(disk_root).read_strongly_consistent().await?;
                Ok(())
            })
            .await
    }

    #[test]
    fn admits_only_package_dependency_names() {
        for name in ["package", "@scope/package", "package.name", "package-name"] {
            assert!(dependency_name(name));
        }
        for name in [
            "",
            ".",
            "..",
            "../outside",
            "package/subpath",
            "@scope",
            "@/package",
            "@scope/..",
            "C:package",
            "package\\outside",
            "package%2foutside",
        ] {
            assert!(!dependency_name(name));
        }
    }
}
