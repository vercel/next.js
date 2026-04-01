use std::{
    fs,
    path::{Path, PathBuf},
};

use sha2::{Digest, Sha256};

fn hash_key(url: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(url.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Write to a temp file then rename into place so concurrent readers never see
/// a partial file. On Windows, rename can fail if the target exists, so we fall
/// back to a direct write.
fn write_file_atomic(path: &Path, data: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension(format!("tmp.{}", std::process::id()));
    fs::write(&tmp, data)?;
    if fs::rename(&tmp, path).is_err() {
        // Windows: rename fails when target exists. Fall back to direct write.
        fs::write(path, data)?;
        let _ = fs::remove_file(&tmp);
    }
    Ok(())
}

/// Uses synchronous I/O intentionally — turbo-tasks-fs found that blocking the
/// tokio thread is faster than `spawn_blocking` for short operations like these
/// (see turbopack/crates/turbo-tasks-fs/src/retry.rs and PR #87661).
pub struct FontDiskCache {
    cache_dir: PathBuf,
}

impl FontDiskCache {
    /// Create a font disk cache from a project root path.
    ///
    /// Returns `None` if `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` is set (tests
    /// should bypass the cache) or if the project path cannot be resolved.
    pub fn new(project_root: &Path) -> Option<Self> {
        if std::env::var("NEXT_FONT_GOOGLE_MOCKED_RESPONSES").is_ok() {
            return None;
        }

        let cache_dir = match std::env::var("NEXT_FONT_CACHE_DIR") {
            Ok(dir) => PathBuf::from(dir),
            Err(_) => project_root.join(".next/cache/google-fonts"),
        };

        Some(Self { cache_dir })
    }

    pub fn get_css(&self, url: &str) -> Option<String> {
        let path = self.cache_dir.join(format!("css-{}.txt", hash_key(url)));
        fs::read_to_string(path).ok()
    }

    pub fn set_css(&self, url: &str, css: &str) {
        if let Err(e) = self.set_inner(&format!("css-{}.txt", hash_key(url)), css.as_bytes()) {
            tracing::warn!(
                "Failed to write to font cache directory {:?}: {}",
                self.cache_dir,
                e
            );
        }
    }

    pub fn get_font(&self, url: &str) -> Option<Vec<u8>> {
        let path = self.cache_dir.join(format!("font-{}.bin", hash_key(url)));
        fs::read(path).ok()
    }

    pub fn set_font(&self, url: &str, data: &[u8]) {
        if let Err(e) = self.set_inner(&format!("font-{}.bin", hash_key(url)), data) {
            tracing::warn!(
                "Failed to write to font cache directory {:?}: {}",
                self.cache_dir,
                e
            );
        }
    }

    fn set_inner(&self, filename: &str, data: &[u8]) -> std::io::Result<()> {
        fs::create_dir_all(&self.cache_dir)?;
        write_file_atomic(&self.cache_dir.join(filename), data)
    }
}
