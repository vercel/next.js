use std::{collections::HashSet, io::Write, path::PathBuf, sync::Arc};

use anyhow::{Context, Result};
use futures::future::join_all;

pub(crate) struct Output {
    pub path: PathBuf,
    pub bytes: Arc<[u8]>,
    pub mode: Option<String>,
}

/// The caller holds the recipe write lock. Independent files within this batch
/// can share the filesystem work without reordering writes between recipes.
pub(crate) async fn write_files(files: Vec<Output>, sequence: u64) -> Result<()> {
    let unique = files
        .iter()
        .map(|file| &file.path)
        .collect::<HashSet<_>>()
        .len();
    let workers = if unique != files.len() {
        // Preserve the existing behavior when a recipe writes a path twice,
        // including equal-content skips and permission inheritance.
        1
    } else {
        std::thread::available_parallelism()
            .map_or(1, usize::from)
            .min(8)
            .min(files.len().div_ceil(64))
            .max(1)
    };
    let mut batches: Vec<Vec<_>> = (0..workers).map(|_| Vec::new()).collect();
    for (index, file) in files.into_iter().enumerate() {
        batches[index % workers].push((index, file));
    }
    let writes = batches.into_iter().map(|files| {
        tokio::task::spawn_blocking(move || -> Result<()> {
            let mut directories = HashSet::new();
            for (
                index,
                Output {
                    path,
                    bytes,
                    mode: _mode,
                },
            ) in files
            {
                if std::fs::read(&path).is_ok_and(|current| current == *bytes) {
                    continue;
                }
                let parent = path.parent().context("Output has no parent")?;
                if directories.insert(parent.to_path_buf()) {
                    std::fs::create_dir_all(parent)?;
                }
                let temporary = path.with_file_name(format!(
                    ".next-taskr-{}-{}",
                    std::process::id(),
                    sequence + index as u64
                ));
                let mut options = std::fs::OpenOptions::new();
                options.create_new(true).write(true);
                #[cfg(unix)]
                if let Some(mode) = _mode {
                    use std::os::unix::fs::OpenOptionsExt;
                    options.mode(u32::from_str_radix(&mode, 8)?);
                }
                let result = (|| {
                    let mut output = options.open(&temporary)?;
                    output.write_all(&bytes)?;
                    drop(output);
                    if let Ok(metadata) = std::fs::metadata(&path) {
                        std::fs::set_permissions(&temporary, metadata.permissions())?;
                    }
                    std::fs::rename(&temporary, &path)
                })();
                if result.is_err() {
                    let _ = std::fs::remove_file(&temporary);
                }
                result.with_context(|| format!("Writing {}", path.display()))?;
            }
            Ok(())
        })
    });
    // A failed blocking job must not leave other writes running after the
    // recipe returns and a subsequent recipe clears or consumes the outputs.
    for result in join_all(writes).await {
        result??;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::{fs, sync::Arc};

    use crate::materialize::{Output, write_files};

    #[tokio::test]
    async fn restores_parallel_outputs_and_preserves_unchanged_files() {
        let root = tempfile::tempdir().unwrap();
        let bytes: Arc<[u8]> = [0, 255, 10].into();
        let outputs = || {
            (0..256)
                .map(|index| Output {
                    path: root.path().join(format!("nested/{index}")),
                    bytes: bytes.clone(),
                    mode: Some("0755".into()),
                })
                .collect()
        };
        write_files(outputs(), 1).await.unwrap();
        let first = root.path().join("nested/0");
        let modified = fs::metadata(&first).unwrap().modified().unwrap();
        fs::write(root.path().join("nested/1"), b"corrupt").unwrap();
        fs::remove_file(root.path().join("nested/2")).unwrap();
        write_files(outputs(), 257).await.unwrap();
        assert_eq!(fs::metadata(&first).unwrap().modified().unwrap(), modified);
        for index in 0..256 {
            let path = root.path().join(format!("nested/{index}"));
            assert_eq!(fs::read(&path).unwrap(), *bytes);
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                assert_eq!(
                    fs::metadata(path).unwrap().permissions().mode() & 0o111,
                    0o111
                );
            }
        }
    }

    #[tokio::test]
    async fn preserves_duplicate_destination_order() {
        let root = tempfile::tempdir().unwrap();
        let mut outputs: Vec<_> = (0..128)
            .map(|index| Output {
                path: root.path().join(index.to_string()),
                bytes: Arc::from(b"first".as_slice()),
                mode: Some("0755".into()),
            })
            .collect();
        outputs.push(Output {
            path: root.path().join("0"),
            bytes: Arc::from(b"last".as_slice()),
            mode: Some("0644".into()),
        });
        write_files(outputs, 1).await.unwrap();
        assert_eq!(fs::read(root.path().join("0")).unwrap(), b"last");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(root.path().join("0"))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o111,
                0o111
            );
        }
    }

    #[tokio::test]
    async fn waits_for_all_started_writes_after_a_failure() {
        if std::thread::available_parallelism().map_or(1, usize::from) < 2 {
            return;
        }
        let root = tempfile::tempdir().unwrap();
        // Publishing a file over a directory fails in the first worker. The
        // other worker must finish all its writes before the error is returned.
        fs::create_dir(root.path().join("0")).unwrap();
        let bytes: Arc<[u8]> = vec![42; 1024 * 1024].into();
        let outputs = (0..128)
            .map(|index| Output {
                path: root.path().join(index.to_string()),
                bytes: bytes.clone(),
                mode: None,
            })
            .collect();
        assert!(write_files(outputs, 1).await.is_err());
        for index in (1..128).step_by(2) {
            assert_eq!(
                fs::read(root.path().join(index.to_string())).unwrap(),
                *bytes
            );
        }
        assert!(fs::read_dir(root.path()).unwrap().all(|entry| {
            !entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with(".next-taskr-")
        }));
    }
}
