use std::{path::PathBuf, sync::LazyLock};

use dunce::canonicalize;
use turbo_rcstr::RcStr;

/// The turbo repo root. Should be used as the root when building with turbopack
/// against fixtures in this crate.
pub static REPO_ROOT: LazyLock<RcStr> = LazyLock::new(|| {
    let package_root = PathBuf::from(env!("TURBO_PNPM_WORKSPACE_DIR"));
    canonicalize(package_root).unwrap().to_str().unwrap().into()
});
