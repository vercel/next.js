use std::{
    io::{self, ErrorKind},
    path::{Path, PathBuf},
};

use serde::Deserialize;
use thiserror::Error;

/// pnpm records its modules state in this file. Despite the extension, pnpm 11 and later write it
/// as JSON. Older versions write YAML, which is not supported.
const PNPM_MODULES_MANIFEST: &str = ".modules.yaml";

/// Detects pnpm's [global virtual store][gvs], which lives outside of the project. The symlinks
/// pnpm creates in `node_modules` point into it, so they can only be followed if it is an
/// additional root.
///
/// Both arguments are native filesystem paths; `project_path` is relative to `project_root`.
///
/// This reads `virtualStoreDir` from the nearest `node_modules/.modules.yaml`, searching from the
/// project directory up to the project root. The returned path is not canonicalized, and may not
/// exist. A virtual store located inside the project root (the default `node_modules/.pnpm`) is
/// later ignored.
///
/// [gvs]: https://pnpm.io/global-virtual-store
pub fn find_global_virtual_store_untracked(
    project_root: &Path,
    project_path: &Path,
) -> Result<Option<PathBuf>, GlobalVirtualStoreError> {
    let mut dir = project_root.join(project_path);
    while dir.starts_with(project_root) {
        let modules_dir = dir.join("node_modules");
        let manifest_path = modules_dir.join(PNPM_MODULES_MANIFEST);
        match fs_err::read(&manifest_path) {
            Ok(manifest) => {
                return virtual_store_dir_from_manifest(&modules_dir, &manifest).map_err(
                    |source| GlobalVirtualStoreError::InvalidManifest {
                        path: manifest_path,
                        source,
                    },
                );
            }
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(error) => return Err(GlobalVirtualStoreError::Io(error)),
        }
        if !dir.pop() {
            break;
        }
    }
    Ok(None)
}

#[derive(Debug, Error)]
pub enum GlobalVirtualStoreError {
    /// The manifest exists, but could not be read. The error from `fs_err` includes the path.
    #[error(transparent)]
    Io(io::Error),
    /// The manifest looks like JSON, but failed to parse.
    #[error("failed to parse {}: {source}", path.display())]
    InvalidManifest {
        path: PathBuf,
        source: serde_json::Error,
    },
}

fn virtual_store_dir_from_manifest(
    modules_dir: &Path,
    manifest: &[u8],
) -> Result<Option<PathBuf>, serde_json::Error> {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct PnpmModulesManifest {
        virtual_store_dir: Option<String>,
    }

    // This is a `*.yaml` file, but pnpm >=11.0.0 stores this as JSON (YAML is a superset of JSON).
    // We don't want to pull in a YAML parser dependency, so older versions are ignored. They write
    // block-style YAML, which never starts with `{`, so anything else must be valid JSON.
    if manifest.trim_ascii_start().first() != Some(&b'{') {
        return Ok(None);
    }
    let manifest: PnpmModulesManifest = serde_json::from_slice(manifest)?;
    let Some(virtual_store_dir) = manifest.virtual_store_dir.filter(|dir| !dir.is_empty()) else {
        return Ok(None);
    };
    // Relative paths are relative to the `node_modules` directory. `join` keeps absolute paths
    // as-is.
    Ok(Some(modules_dir.join(virtual_store_dir)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_virtual_store_dir_from_manifest() {
        let modules_dir = Path::new("/workspace/project/node_modules");
        assert_eq!(
            virtual_store_dir_from_manifest(
                modules_dir,
                br#"{"layoutVersion":5,"virtualStoreDir":"../../../store/v11/links"}"#
            )
            .unwrap(),
            Some(modules_dir.join("../../../store/v11/links"))
        );

        let absolute = if cfg!(windows) {
            r"C:\store\v11\links"
        } else {
            "/store/v11/links"
        };
        assert_eq!(
            virtual_store_dir_from_manifest(
                modules_dir,
                serde_json::json!({ "virtualStoreDir": absolute })
                    .to_string()
                    .as_bytes()
            )
            .unwrap(),
            Some(PathBuf::from(absolute))
        );

        // missing, empty, or YAML (written by pnpm 10 and older)
        for manifest in [
            "",
            "{}",
            r#"{"virtualStoreDir":""}"#,
            "virtualStoreDir: ../../store/v10/links\n",
        ] {
            assert_eq!(
                virtual_store_dir_from_manifest(modules_dir, manifest.as_bytes()).unwrap(),
                None,
                "{manifest}"
            );
        }

        // malformed JSON
        assert!(virtual_store_dir_from_manifest(modules_dir, br#" {"virtualStoreDir":"#).is_err());
    }

    #[test]
    fn finds_global_virtual_store() {
        let temp = tempfile::tempdir().unwrap();
        let temp = fs_err::canonicalize(temp.path()).unwrap();
        let root = temp.join("workspace");
        let store = temp.join("store/v11/links");
        fs_err::create_dir_all(root.join("node_modules")).unwrap();
        fs_err::create_dir_all(root.join("apps/web/node_modules")).unwrap();
        fs_err::create_dir_all(&store).unwrap();
        fs_err::write(
            root.join("node_modules").join(PNPM_MODULES_MANIFEST),
            r#"{"virtualStoreDir":"../../store/v11/links"}"#,
        )
        .unwrap();

        let find = |project_root: &Path, project_path: &Path| {
            find_global_virtual_store_untracked(project_root, project_path)
                .unwrap()
                .map(|path| fs_err::canonicalize(path).unwrap())
        };

        // searches upwards from the project directory
        assert_eq!(find(&root, Path::new("apps/web")), Some(store.clone()));
        assert_eq!(find(&root, Path::new("")), Some(store));

        // does not search above the project root
        assert_eq!(find(&root.join("apps"), Path::new("web")), None);
    }
}
