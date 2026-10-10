use std::{
    io::{BufReader, Read},
    path::{Path, PathBuf},
};

use serde::Deserialize;
use turbo_rcstr::RcStr;

/// pnpm records its modules state in this file. Despite the extension, pnpm 11 and later write it
/// as JSON. Older versions write YAML, which is not supported.
const PNPM_MODULES_MANIFEST: &str = ".modules.yaml";

/// Detects pnpm's [global virtual store][gvs], which lives outside of the project. The symlinks
/// pnpm creates in `node_modules` point into it, so they can only be followed if it is an
/// additional root.
///
/// This reads `virtualStoreDir` from the nearest `node_modules/.modules.yaml`, searching from the
/// project directory up to the project root. The returned path is not canonicalized, and may not
/// exist. A virtual store located inside the project root (the default `node_modules/.pnpm`) is
/// later ignored.
///
/// [gvs]: https://pnpm.io/global-virtual-store
pub(crate) fn find_global_virtual_store(project_root: &Path, project_path: &str) -> Option<RcStr> {
    let mut dir = project_root.join(project_path);
    while dir.starts_with(project_root) {
        let modules_dir = dir.join("node_modules");
        if let Ok(manifest) = fs_err::File::open(modules_dir.join(PNPM_MODULES_MANIFEST)) {
            let virtual_store_dir =
                virtual_store_dir_from_manifest(&modules_dir, BufReader::new(manifest))?;
            return virtual_store_dir
                .into_os_string()
                .into_string()
                .ok()
                .map(RcStr::from);
        }
        if !dir.pop() {
            break;
        }
    }
    None
}

fn virtual_store_dir_from_manifest(modules_dir: &Path, manifest: impl Read) -> Option<PathBuf> {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct PnpmModulesManifest {
        virtual_store_dir: Option<String>,
    }

    let manifest: PnpmModulesManifest = serde_json::from_reader(manifest).ok()?;
    let virtual_store_dir = manifest.virtual_store_dir.filter(|dir| !dir.is_empty())?;
    // Relative paths are relative to the `node_modules` directory. `join` keeps absolute paths
    // as-is.
    Some(modules_dir.join(virtual_store_dir))
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
                br#"{"layoutVersion":5,"virtualStoreDir":"../../../store/v11/links"}"#.as_slice()
            ),
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
            ),
            Some(PathBuf::from(absolute))
        );

        // missing, empty, or YAML (written by pnpm 10 and older)
        for manifest in [
            "{}",
            r#"{"virtualStoreDir":""}"#,
            "virtualStoreDir: ../../store/v10/links\n",
        ] {
            assert_eq!(
                virtual_store_dir_from_manifest(modules_dir, manifest.as_bytes()),
                None,
                "{manifest}"
            );
        }
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

        let find = |project_root: &Path, project_path: &str| {
            find_global_virtual_store(project_root, project_path)
                .map(|path| fs_err::canonicalize(&*path).unwrap())
        };

        // searches upwards from the project directory
        assert_eq!(find(&root, "apps/web"), Some(store.clone()));
        assert_eq!(find(&root, ""), Some(store));

        // does not search above the project root
        assert_eq!(find(&root.join("apps"), "web"), None);
    }
}
