//! The napi project surface. Opaque `External` handles only.

use napi::bindgen_prelude::External;
use napi_derive::napi;
use turbo_rcstr::RcStr;

fn napi_err(err: impl std::fmt::Display) -> napi::Error {
    napi::Error::from_reason(err.to_string())
}

// ---------------------------------------------------------------------------
// napi option DTOs (camelCase on the JS side).
// ---------------------------------------------------------------------------

#[napi(object)]
pub struct NapiProjectOptions {
    pub root_path: String,
    pub entries: Vec<String>,
    pub dist_dir: Option<String>,
}

// ---------------------------------------------------------------------------
// Opaque handles.
// ---------------------------------------------------------------------------

/// The long-lived per-project handle passed to JS as `External<ProjectInstance>`.
/// NAPI-only, never enters a turbo-tasks function.
pub struct ProjectInstance {
    project_dir: RcStr,
}

#[napi(object)]
pub struct NapiBuildInfo {
    /// Package version baked into the native binary at build time.
    pub version: String,
    /// Short git SHA the binary was built from.
    pub git_sha: String,
    /// Whether the git tree had uncommitted tracked changes at build time.
    pub git_dirty: bool,
}

/// Build provenance of the native addon (baked by `build.rs`; see `cache_describe`). The
/// `turbopack version` command surfaces this alongside the npm package version.
#[napi]
pub fn build_info() -> NapiBuildInfo {
    NapiBuildInfo {
        version: env!("TURBOPACK_PKG_VERSION").to_string(),
        git_sha: env!("VERGEN_GIT_SHA").to_string(),
        git_dirty: env!("VERGEN_GIT_DIRTY") == "true",
    }
}

// ---------------------------------------------------------------------------
// napi surface.
// ---------------------------------------------------------------------------

#[napi(ts_return_type = "Promise<{ __napiType: \"Project\" }>")]
pub async fn project_new(options: NapiProjectOptions) -> napi::Result<External<ProjectInstance>> {
    let project_dir = options.root_path.clone();

    Ok(External::new(ProjectInstance {
        project_dir: RcStr::from(project_dir),
    }))
}

#[napi]
pub async fn project_build(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: &External<ProjectInstance>,
) -> napi::Result<()> {
    println!("no-op");
    Ok(())
}
