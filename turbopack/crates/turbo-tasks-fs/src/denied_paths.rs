use std::path::Path;

use turbo_rcstr::RcStr;
use turbo_unix_path::sys_to_unix;

pub(crate) fn is_relative_path_denied(path: &str, denied_paths: &[RcStr]) -> bool {
    denied_paths.iter().any(|denied_path| {
        path.starts_with(denied_path.as_str())
            && (path.len() == denied_path.len()
                || path.as_bytes().get(denied_path.len()) == Some(&b'/'))
    })
}

pub(crate) fn is_sys_path_denied(path: &Path, root_path: &Path, denied_paths: &[RcStr]) -> bool {
    let Ok(relative_path) = path.strip_prefix(root_path) else {
        return false;
    };
    let Some(relative_path) = relative_path.to_str() else {
        return false;
    };
    is_relative_path_denied(&sys_to_unix(relative_path), denied_paths)
}

#[cfg(test)]
mod tests {
    use turbo_rcstr::rcstr;

    use super::{is_relative_path_denied, is_sys_path_denied};

    #[test]
    fn denies_exact_relative_path_and_children() {
        let denied_paths = vec![rcstr!("app/.next/dev")];

        assert!(is_relative_path_denied("app/.next/dev", &denied_paths));
        assert!(is_relative_path_denied(
            "app/.next/dev/cache/turbopack/00000001.sst",
            &denied_paths
        ));
    }

    #[test]
    fn allows_siblings_and_prefix_collisions() {
        let denied_paths = vec![rcstr!("app/.next/dev")];

        assert!(!is_relative_path_denied("app/.next", &denied_paths));
        assert!(!is_relative_path_denied(
            "app/.next/development",
            &denied_paths
        ));
        assert!(!is_relative_path_denied(
            "app/.next/devtools",
            &denied_paths
        ));
    }

    #[test]
    fn denies_absolute_paths_under_root() {
        let root = std::env::current_dir().unwrap().join("repo");
        let denied_paths = vec![rcstr!("app/.next/dev")];

        assert!(is_sys_path_denied(
            &root.join("app/.next/dev/cache/turbopack"),
            &root,
            &denied_paths
        ));
        assert!(!is_sys_path_denied(
            &root.join("app/.next/static"),
            &root,
            &denied_paths
        ));
        assert!(!is_sys_path_denied(
            &root.with_file_name("other").join("app/.next/dev"),
            &root,
            &denied_paths
        ));
    }
}
