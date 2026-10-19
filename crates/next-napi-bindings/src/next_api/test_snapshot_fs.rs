use std::fmt;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct DirectoryIdentity {
    pub device: String,
    pub inode: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum PublishErrorKind {
    Invalid,
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    Identity,
    Unsupported,
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    Collision,
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    Io,
}

#[derive(Debug)]
pub(super) struct PublishError {
    pub kind: PublishErrorKind,
    detail: String,
}

impl fmt::Display for PublishError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let kind = match self.kind {
            PublishErrorKind::Invalid => "INVALID",
            #[cfg(any(target_os = "linux", target_os = "macos"))]
            PublishErrorKind::Identity => "IDENTITY",
            PublishErrorKind::Unsupported => "UNSUPPORTED",
            #[cfg(any(target_os = "linux", target_os = "macos"))]
            PublishErrorKind::Collision => "COLLISION",
            #[cfg(any(target_os = "linux", target_os = "macos"))]
            PublishErrorKind::Io => "IO",
        };
        write!(
            f,
            "ERR_NEXT_TEST_SNAPSHOT_NOREPLACE_{kind}: {}",
            self.detail
        )
    }
}

impl std::error::Error for PublishError {}

fn failure(kind: PublishErrorKind, detail: impl Into<String>) -> PublishError {
    PublishError {
        kind,
        detail: detail.into(),
    }
}

pub(super) const fn platform_supported() -> bool {
    cfg!(any(target_os = "linux", target_os = "macos"))
}

pub(super) fn publish(
    staging_path: &str,
    publication_path: &str,
    expected_identity: &DirectoryIdentity,
) -> Result<DirectoryIdentity, PublishError> {
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        supported::publish(staging_path, publication_path, expected_identity)
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        let _ = (staging_path, publication_path, expected_identity);
        Err(failure(
            PublishErrorKind::Unsupported,
            "this platform has no qualified destination no-replace primitive",
        ))
    }
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
mod supported {
    use std::{
        fmt,
        fs::{self, File, Metadata},
        os::unix::fs::MetadataExt,
        path::{Component, Path, PathBuf},
    };

    use rustix::fs::{
        AtFlags, FileType, Mode, OFlags, RenameFlags, open, openat, renameat_with, statat,
    };

    use crate::next_api::test_snapshot_fs::{
        DirectoryIdentity, PublishError, PublishErrorKind, failure,
    };

    fn io_error(operation: &str, error: impl fmt::Display) -> PublishError {
        failure(PublishErrorKind::Io, format!("{operation}: {error}"))
    }

    fn parse_identity(expected: &DirectoryIdentity) -> Result<(u64, u64), PublishError> {
        let parse = |value: &str| {
            value
                .parse::<u64>()
                .ok()
                .filter(|number| number.to_string() == value)
        };
        let device = parse(&expected.device);
        let inode = parse(&expected.inode).filter(|inode| *inode != 0);
        match (device, inode) {
            (Some(device), Some(inode)) => Ok((device, inode)),
            _ => Err(failure(
                PublishErrorKind::Invalid,
                "directory identity must contain canonical decimal u64 values and a nonzero inode",
            )),
        }
    }

    fn normalized_absolute(value: &str) -> Result<PathBuf, PublishError> {
        let path = Path::new(value);
        let normalized: PathBuf = path.components().collect();
        if value.contains('\0')
            || !path.is_absolute()
            || path
                .components()
                .any(|part| matches!(part, Component::CurDir | Component::ParentDir))
            || normalized.as_os_str() != path.as_os_str()
        {
            return Err(failure(
                PublishErrorKind::Invalid,
                "paths must be normalized and absolute",
            ));
        }
        Ok(normalized)
    }

    fn generated_name(path: &Path, prefix: &str) -> bool {
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            return false;
        };
        name.len() <= 255
            && name
                .strip_prefix(prefix)
                .is_some_and(|suffix| !suffix.is_empty())
            && name
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.'))
    }

    fn ensure_parent(path: &Path, opened: &Metadata) -> Result<(), PublishError> {
        let canonical =
            fs::canonicalize(path).map_err(|error| io_error("canonical parent", error))?;
        let current =
            fs::symlink_metadata(path).map_err(|error| io_error("current parent", error))?;
        if canonical.as_os_str() != path.as_os_str()
            || !current.is_dir()
            || current.dev() != opened.dev()
            || current.ino() != opened.ino()
        {
            return Err(failure(
                PublishErrorKind::Identity,
                "canonical parent identity changed",
            ));
        }
        Ok(())
    }

    fn ensure_named_identity(
        parent: &File,
        name: &std::ffi::OsStr,
        expected: (u64, u64),
    ) -> Result<(), PublishError> {
        let current = statat(parent, name, AtFlags::SYMLINK_NOFOLLOW)
            .map_err(|error| io_error("named directory identity", error))?;
        if FileType::from_raw_mode(current.st_mode) != FileType::Directory
            || current.st_dev as u64 != expected.0
            || current.st_ino as u64 != expected.1
        {
            return Err(failure(
                PublishErrorKind::Identity,
                "named stage identity does not match the original directory",
            ));
        }
        Ok(())
    }

    pub(super) fn publish(
        staging_path: &str,
        publication_path: &str,
        expected_identity: &DirectoryIdentity,
    ) -> Result<DirectoryIdentity, PublishError> {
        let expected = parse_identity(expected_identity)?;
        let staging = normalized_absolute(staging_path)?;
        let publication = normalized_absolute(publication_path)?;
        if staging == publication
            || staging.parent() != publication.parent()
            || !generated_name(&staging, ".next-test-pending-")
            || !generated_name(&publication, ".next-test-")
        {
            return Err(failure(
                PublishErrorKind::Invalid,
                "publication requires distinct generated sibling paths",
            ));
        }
        let parent_path = staging
            .parent()
            .expect("absolute generated path has a parent");
        let canonical_parent =
            fs::canonicalize(parent_path).map_err(|error| io_error("canonical parent", error))?;
        if canonical_parent.as_os_str() != parent_path.as_os_str() {
            return Err(failure(
                PublishErrorKind::Invalid,
                "parent must be canonical without symlink aliases",
            ));
        }
        let flags = OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC;
        let parent = File::from(
            open(parent_path, flags, Mode::empty())
                .map_err(|error| io_error("open parent", error))?,
        );
        let parent_metadata = parent
            .metadata()
            .map_err(|error| io_error("parent identity", error))?;
        ensure_parent(parent_path, &parent_metadata)?;
        let staging_name = staging.file_name().expect("validated generated source");
        let publication_name = publication.file_name().expect("validated generated target");
        let stage = File::from(
            openat(&parent, staging_name, flags, Mode::empty())
                .map_err(|error| io_error("open stage without following links", error))?,
        );
        let metadata = stage
            .metadata()
            .map_err(|error| io_error("stage identity", error))?;
        if !metadata.is_dir() || (metadata.dev(), metadata.ino()) != expected {
            return Err(failure(
                PublishErrorKind::Identity,
                "stage does not match the original directory",
            ));
        }
        ensure_named_identity(&parent, staging_name, expected)?;
        // NOREPLACE protects the destination atomically. This is deliberately not
        // claimed to be an atomic source-inode compare-and-swap.
        renameat_with(
            &parent,
            staging_name,
            &parent,
            publication_name,
            RenameFlags::NOREPLACE,
        )
        .map_err(rename_error)?;
        ensure_named_identity(&parent, publication_name, expected)?;
        ensure_parent(parent_path, &parent_metadata)?;
        Ok(expected_identity.clone())
    }

    pub(super) fn rename_error(error: rustix::io::Errno) -> PublishError {
        let kind = if error == rustix::io::Errno::EXIST || error == rustix::io::Errno::NOTEMPTY {
            PublishErrorKind::Collision
        } else if error == rustix::io::Errno::NOSYS
            || error == rustix::io::Errno::OPNOTSUPP
            || error == rustix::io::Errno::INVAL
        {
            PublishErrorKind::Unsupported
        } else {
            PublishErrorKind::Io
        };
        failure(kind, format!("atomic destination no-replace: {error}"))
    }
}

#[cfg(test)]
mod tests {
    use crate::next_api::test_snapshot_fs::platform_supported;
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    use crate::next_api::test_snapshot_fs::{DirectoryIdentity, PublishErrorKind, publish};

    #[test]
    fn capability_is_a_path_free_platform_query() {
        assert_eq!(
            platform_supported(),
            cfg!(any(target_os = "linux", target_os = "macos"))
        );
    }

    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    #[test]
    fn unsupported_platform_refuses_before_any_filesystem_effect() {
        let error = publish(
            "not-a-source",
            "not-a-target",
            &DirectoryIdentity {
                device: "1".into(),
                inode: "1".into(),
            },
        )
        .unwrap_err();
        assert_eq!(error.kind, PublishErrorKind::Unsupported);
        assert!(
            error
                .to_string()
                .starts_with("ERR_NEXT_TEST_SNAPSHOT_NOREPLACE_UNSUPPORTED:")
        );
    }

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    mod posix {
        use std::{
            fs::{self, File},
            os::unix::fs::{MetadataExt, symlink},
            path::{Path, PathBuf},
            sync::atomic::{AtomicU64, Ordering},
            time::{SystemTime, UNIX_EPOCH},
        };

        use crate::next_api::test_snapshot_fs::{
            DirectoryIdentity, PublishErrorKind, publish, supported::rename_error,
        };

        struct Fixture(PathBuf);

        impl Fixture {
            fn new() -> Self {
                static NEXT: AtomicU64 = AtomicU64::new(0);
                let path = std::env::temp_dir().join(format!(
                    "next-snapshot-noreplace-{}-{}-{}",
                    std::process::id(),
                    SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap()
                        .as_nanos(),
                    NEXT.fetch_add(1, Ordering::Relaxed),
                ));
                fs::create_dir(&path).unwrap();
                Self(fs::canonicalize(path).unwrap())
            }

            fn stage(&self) -> PathBuf {
                let path = self.0.join(".next-test-pending-stage");
                fs::create_dir(&path).unwrap();
                fs::create_dir(path.join("nested")).unwrap();
                fs::write(path.join("nested/data"), [0, 1, 2, 255]).unwrap();
                path
            }

            fn target(&self) -> PathBuf {
                self.0.join(".next-test-revision")
            }
        }

        impl Drop for Fixture {
            fn drop(&mut self) {
                fs::remove_dir_all(&self.0).unwrap();
            }
        }

        fn identity(path: &Path) -> DirectoryIdentity {
            let metadata = fs::symlink_metadata(path).unwrap();
            DirectoryIdentity {
                device: metadata.dev().to_string(),
                inode: metadata.ino().to_string(),
            }
        }

        fn invoke(
            source: &Path,
            target: &Path,
            expected: &DirectoryIdentity,
        ) -> Result<DirectoryIdentity, crate::next_api::test_snapshot_fs::PublishError> {
            publish(source.to_str().unwrap(), target.to_str().unwrap(), expected)
        }

        fn unchanged_stage(stage: &Path, original: &DirectoryIdentity) {
            assert_eq!(&identity(stage), original);
            assert_eq!(fs::read(stage.join("nested/data")).unwrap(), [0, 1, 2, 255]);
        }

        #[test]
        fn actual_move_preserves_the_original_held_inode_and_tree_bytes() {
            let fixture = Fixture::new();
            let stage = fixture.stage();
            let target = fixture.target();
            let original = identity(&stage);
            let held_stage = File::open(&stage).unwrap();
            assert_eq!(invoke(&stage, &target, &original).unwrap(), original);
            assert!(!stage.exists());
            assert_eq!(identity(&target), original);
            assert_eq!(
                held_stage.metadata().unwrap().ino().to_string(),
                original.inode
            );
            assert_eq!(
                fs::read(target.join("nested/data")).unwrap(),
                [0, 1, 2, 255]
            );
        }

        #[test]
        fn occupied_empty_directory_is_not_replaced() {
            let fixture = Fixture::new();
            let stage = fixture.stage();
            let target = fixture.target();
            let original = identity(&stage);
            fs::create_dir(&target).unwrap();
            let foreign = identity(&target);
            assert_eq!(
                invoke(&stage, &target, &original).unwrap_err().kind,
                PublishErrorKind::Collision
            );
            unchanged_stage(&stage, &original);
            assert_eq!(identity(&target), foreign);
            assert_eq!(fs::read_dir(&target).unwrap().count(), 0);
        }

        #[test]
        fn occupied_nonempty_directory_is_not_replaced() {
            let fixture = Fixture::new();
            let stage = fixture.stage();
            let target = fixture.target();
            let original = identity(&stage);
            fs::create_dir(&target).unwrap();
            fs::write(target.join("foreign"), b"keep directory").unwrap();
            let foreign = identity(&target);
            assert_eq!(
                invoke(&stage, &target, &original).unwrap_err().kind,
                PublishErrorKind::Collision
            );
            unchanged_stage(&stage, &original);
            assert_eq!(identity(&target), foreign);
            assert_eq!(fs::read(target.join("foreign")).unwrap(), b"keep directory");
        }

        #[test]
        fn occupied_file_is_not_replaced() {
            let fixture = Fixture::new();
            let stage = fixture.stage();
            let target = fixture.target();
            let original = identity(&stage);
            fs::write(&target, b"keep file").unwrap();
            let foreign = identity(&target);
            assert_eq!(
                invoke(&stage, &target, &original).unwrap_err().kind,
                PublishErrorKind::Collision
            );
            unchanged_stage(&stage, &original);
            assert_eq!(identity(&target), foreign);
            assert_eq!(fs::read(&target).unwrap(), b"keep file");
        }

        #[test]
        fn occupied_symlink_is_not_followed_or_replaced() {
            let fixture = Fixture::new();
            let stage = fixture.stage();
            let target = fixture.target();
            let original = identity(&stage);
            let foreign = fixture.0.join("foreign");
            fs::write(&foreign, b"keep linked file").unwrap();
            symlink(&foreign, &target).unwrap();
            let link_identity = identity(&target);
            assert_eq!(
                invoke(&stage, &target, &original).unwrap_err().kind,
                PublishErrorKind::Collision
            );
            unchanged_stage(&stage, &original);
            assert_eq!(identity(&target), link_identity);
            assert_eq!(fs::read_link(&target).unwrap(), foreign);
            assert_eq!(fs::read(&target).unwrap(), b"keep linked file");
        }

        #[test]
        fn source_replaced_before_call_refuses_without_moving_replacement() {
            let fixture = Fixture::new();
            let stage = fixture.stage();
            let target = fixture.target();
            let original = identity(&stage);
            let _held_original = File::open(&stage).unwrap();
            let preserved = fixture.0.join("preserved-original");
            fs::rename(&stage, &preserved).unwrap();
            fs::create_dir(&stage).unwrap();
            fs::write(stage.join("foreign"), b"replacement").unwrap();
            let foreign = identity(&stage);
            assert_eq!(
                invoke(&stage, &target, &original).unwrap_err().kind,
                PublishErrorKind::Identity
            );
            assert_eq!(identity(&stage), foreign);
            assert_eq!(fs::read(stage.join("foreign")).unwrap(), b"replacement");
            unchanged_stage(&preserved, &original);
            assert!(!target.exists());
        }

        #[test]
        fn source_symlink_and_file_are_not_moved() {
            for linked in [false, true] {
                let fixture = Fixture::new();
                let stage = fixture.0.join(".next-test-pending-stage");
                let target = fixture.target();
                let source = fixture.0.join("actual-source");
                fs::create_dir(&source).unwrap();
                fs::write(source.join("foreign"), b"keep source").unwrap();
                let original = identity(&source);
                if linked {
                    symlink(&source, &stage).unwrap();
                } else {
                    fs::write(&stage, b"not a directory").unwrap();
                }
                let error = invoke(&stage, &target, &original).unwrap_err();
                assert_eq!(error.kind, PublishErrorKind::Io);
                assert!(fs::symlink_metadata(&stage).is_ok());
                assert_eq!(fs::read(source.join("foreign")).unwrap(), b"keep source");
                assert!(!target.exists());
            }
        }

        #[test]
        fn noncanonical_identity_values_refuse_before_publication() {
            let fixture = Fixture::new();
            let stage = fixture.stage();
            let target = fixture.target();
            let original = identity(&stage);
            for (device, inode) in [
                ("01", "1"),
                ("+1", "1"),
                ("1", "0"),
                ("1", "18446744073709551616"),
                ("1", "-1"),
            ] {
                assert_eq!(
                    invoke(
                        &stage,
                        &target,
                        &DirectoryIdentity {
                            device: device.into(),
                            inode: inode.into()
                        }
                    )
                    .unwrap_err()
                    .kind,
                    PublishErrorKind::Invalid
                );
                unchanged_stage(&stage, &original);
                assert!(!target.exists());
            }
        }

        #[test]
        fn invalid_paths_refuse_without_publication() {
            let fixture = Fixture::new();
            let stage = fixture.stage();
            let target = fixture.target();
            let original = identity(&stage);
            for (source, destination) in [
                (PathBuf::from("relative-stage"), target.clone()),
                (stage.clone(), stage.clone()),
                (stage.clone(), fixture.0.join("not-generated")),
                (stage.clone(), fixture.0.join("nested/.next-test-other")),
                (fixture.0.join("./.next-test-pending-stage"), target.clone()),
                (
                    fixture.0.join("../.next-test-pending-stage"),
                    target.clone(),
                ),
            ] {
                assert_eq!(
                    invoke(&source, &destination, &original).unwrap_err().kind,
                    PublishErrorKind::Invalid
                );
                unchanged_stage(&stage, &original);
                assert!(!target.exists());
            }
        }

        #[test]
        fn symlink_parent_alias_refuses_without_publication() {
            let fixture = Fixture::new();
            let stage = fixture.stage();
            let target = fixture.target();
            let original = identity(&stage);
            let alias = fixture.0.join("alias");
            symlink(&fixture.0, &alias).unwrap();
            assert_eq!(
                invoke(
                    &alias.join(stage.file_name().unwrap()),
                    &alias.join(target.file_name().unwrap()),
                    &original
                )
                .unwrap_err()
                .kind,
                PublishErrorKind::Invalid
            );
            unchanged_stage(&stage, &original);
            assert!(!target.exists());
        }

        #[test]
        fn missing_source_is_an_io_failure_and_creates_no_target() {
            let fixture = Fixture::new();
            let stage = fixture.0.join(".next-test-pending-missing");
            let target = fixture.target();
            assert_eq!(
                invoke(
                    &stage,
                    &target,
                    &DirectoryIdentity {
                        device: "1".into(),
                        inode: "1".into()
                    }
                )
                .unwrap_err()
                .kind,
                PublishErrorKind::Io
            );
            assert!(!stage.exists());
            assert!(!target.exists());
        }

        #[test]
        fn unsupported_syscall_errors_refuse_without_a_replacing_fallback() {
            // Error classification only; actual filesystem support is exercised
            // by the move/collision controls above, not fabricated by this test.
            for error in [
                rustix::io::Errno::NOSYS,
                rustix::io::Errno::OPNOTSUPP,
                rustix::io::Errno::INVAL,
            ] {
                let error = rename_error(error);
                assert_eq!(error.kind, PublishErrorKind::Unsupported);
                assert!(
                    error
                        .to_string()
                        .starts_with("ERR_NEXT_TEST_SNAPSHOT_NOREPLACE_UNSUPPORTED:")
                );
            }
            assert_eq!(
                rename_error(rustix::io::Errno::ACCESS).kind,
                PublishErrorKind::Io
            );
        }
    }
}
