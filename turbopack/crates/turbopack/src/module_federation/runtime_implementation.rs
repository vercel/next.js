use std::{collections::BTreeMap, path::Path};

use anyhow::{Context, Result};
use turbo_rcstr::RcStr;
use turbo_tasks::ResolvedVc;
use turbo_tasks_fs::{DiskFileSystem, FileSystemPath};
use turbopack_ecmascript::utils::StringifyJs;

use crate::module_federation::config::ModuleFederationShared;

/// Returns a request that imports the runtime `implementation` from `project_path`.
///
/// Absolute system paths are converted to a relative request, since a request starting with `/`
/// resolves against the filesystem root instead of the system root.
pub async fn runtime_implementation_request(
    project_path: &FileSystemPath,
    implementation: &RcStr,
) -> Result<RcStr> {
    let implementation_path = Path::new(&**implementation);
    if !implementation_path.is_absolute() {
        return Ok(implementation.clone());
    }
    let fs = project_path.fs().to_resolved().await?;
    let disk_fs = ResolvedVc::try_downcast_type::<DiskFileSystem>(fs)
        .context("An absolute Module Federation implementation requires a disk filesystem")?;
    let implementation_path = disk_fs
        .await?
        .try_from_sys_path(disk_fs, implementation_path, None)
        .context(
            "Module Federation implementation is outside the filesystem root; include its package \
             in the configured root",
        )?;
    project_path
        .get_relative_request_to(&implementation_path)
        .context("Module Federation implementation must use the project's filesystem")
}

/// Renders the `shared` option of a runtime `createInstance()` call, grouping providers by share
/// key. Entries without an import only consume and are omitted.
pub fn runtime_shared_option(shared: &[ModuleFederationShared]) -> String {
    let mut entries = BTreeMap::<&RcStr, Vec<String>>::new();
    for shared in shared {
        let Some(import) = &shared.import else {
            continue;
        };
        entries.entry(&shared.share_key).or_default().push(format!(
            r#"{{
  version: {version},
  scope: [{scope}],
  get: () => import({import}).then((module) => () => module),
  shareConfig: {{ eager: {eager}, requiredVersion: false }}
}}"#,
            version = StringifyJs(shared.version.as_deref().unwrap_or("0")),
            scope = StringifyJs(&shared.share_scope),
            import = StringifyJs(import),
            eager = shared.eager,
        ));
    }
    let entries = entries
        .into_iter()
        .map(|(key, entries)| format!("[{}]: [{}]", StringifyJs(key), entries.join(",\n")))
        .collect::<Vec<_>>()
        .join(",\n");
    format!("{{{entries}}}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn shared(share_key: &str, import: Option<&str>, version: &str) -> ModuleFederationShared {
        ModuleFederationShared {
            request: share_key.into(),
            import: import.map(RcStr::from),
            package_name: None,
            required_version: None,
            share_key: share_key.into(),
            share_scope: "default".into(),
            version: Some(version.into()),
            eager: false,
            singleton: false,
            strict_version: false,
        }
    }

    #[test]
    fn groups_providers_by_share_key() {
        let option = runtime_shared_option(&[
            shared("b", Some("./b.js"), "1.0.0"),
            shared("a", Some("./a-old.js"), "1.0.0"),
            shared("a", None, "3.0.0"),
            shared("a", Some("./a-new.js"), "2.0.0"),
        ]);
        let a = option.find(r#"["a"]"#).unwrap();
        let b = option.find(r#"["b"]"#).unwrap();
        assert!(a < b);
        assert!(option.find("./a-old.js").unwrap() < option.find("./a-new.js").unwrap());
        assert!(option.find("./a-new.js").unwrap() < b);
        assert!(!option.contains("3.0.0"));
    }

    #[test]
    fn renders_empty_shared_option() {
        assert_eq!(runtime_shared_option(&[]), "{}");
    }
}
