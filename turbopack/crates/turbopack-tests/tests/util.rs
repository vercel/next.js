use std::path::PathBuf;

use dunce::canonicalize;
use once_cell::sync::Lazy;
use turbo_rcstr::RcStr;

/// The turbo repo root. Should be used as the root when building with turbopack
/// against fixtures in this crate.
pub static REPO_ROOT: Lazy<RcStr> = Lazy::new(|| {
    let package_root = PathBuf::from(env!("TURBO_PNPM_WORKSPACE_DIR"));
    canonicalize(package_root).unwrap().to_str().unwrap().into()
});
