use std::fmt;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct DirectoryIdentity {
    pub device: String,
    pub inode: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum DeletionErrorKind {
    Invalid,
    #[cfg(target_os = "macos")]
    Identity,
    Unsupported,
    #[cfg(target_os = "macos")]
    Io,
    #[cfg(target_os = "macos")]
    Closed,
}

#[derive(Debug)]
pub(super) struct DeletionError {
    pub kind: DeletionErrorKind,
    detail: String,
}

impl fmt::Display for DeletionError {
    fn fmt(&self, output: &mut fmt::Formatter<'_>) -> fmt::Result {
        let kind = match self.kind {
            DeletionErrorKind::Invalid => "INVALID",
            #[cfg(target_os = "macos")]
            DeletionErrorKind::Identity => "IDENTITY",
            DeletionErrorKind::Unsupported => "UNSUPPORTED",
            #[cfg(target_os = "macos")]
            DeletionErrorKind::Io => "IO",
            #[cfg(target_os = "macos")]
            DeletionErrorKind::Closed => "CLOSED",
        };
        write!(
            output,
            "ERR_NEXT_TEST_SNAPSHOT_DELETION_{kind}: {}",
            self.detail
        )
    }
}

impl std::error::Error for DeletionError {}

fn failure(kind: DeletionErrorKind, detail: impl Into<String>) -> DeletionError {
    DeletionError {
        kind,
        detail: detail.into(),
    }
}

pub(super) const fn platform_supported() -> bool {
    cfg!(target_os = "macos")
}

#[derive(Clone, Debug)]
pub(super) struct PollSnapshot {
    pub identity: DirectoryIdentity,
    pub deleted: bool,
    pub revoked: bool,
    pub uncertain: bool,
    pub errors: Vec<String>,
    #[cfg(all(test, target_os = "macos"))]
    raw_events: Vec<supported::ObservedEvent>,
}

#[derive(Clone, Debug)]
pub(super) struct CloseSnapshot {
    pub duplicate_closed: bool,
    pub queue_closed: bool,
    pub uncertain: bool,
    pub errors: Vec<String>,
}

pub(super) struct DirectoryDeletionWatch {
    #[cfg(target_os = "macos")]
    inner: supported::Watch,
}

impl DirectoryDeletionWatch {
    pub fn create(fd: f64, expected: &DirectoryIdentity) -> Result<Self, DeletionError> {
        // NAPI must not truncate a fractional/out-of-range JS number into another fd.
        if !fd.is_finite() || fd.fract() != 0.0 || fd < 0.0 || fd > i32::MAX as f64 {
            return Err(failure(
                DeletionErrorKind::Invalid,
                "held descriptor must be an exact nonnegative i32",
            ));
        }
        let parse = |value: &str| {
            (value.len() <= 20)
                .then(|| value.parse::<u64>().ok())
                .flatten()
                .filter(|number| number.to_string() == value)
        };
        let (Some(device), Some(inode)) = (
            parse(&expected.device),
            parse(&expected.inode).filter(|value| *value != 0),
        ) else {
            return Err(failure(
                DeletionErrorKind::Invalid,
                "identity must contain canonical u64 decimals and a nonzero inode",
            ));
        };
        #[cfg(target_os = "macos")]
        {
            supported::Watch::create(fd as i32, (device, inode), expected.clone())
                .map(|inner| Self { inner })
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = (device, inode);
            Err(failure(
                DeletionErrorKind::Unsupported,
                "held-directory deletion observation is unavailable on this platform",
            ))
        }
    }

    pub fn poll(&mut self) -> Result<PollSnapshot, DeletionError> {
        #[cfg(target_os = "macos")]
        {
            self.inner.poll()
        }
        #[cfg(not(target_os = "macos"))]
        {
            Err(failure(
                DeletionErrorKind::Unsupported,
                "no supported deletion observer",
            ))
        }
    }

    pub fn close(&mut self) -> CloseSnapshot {
        #[cfg(target_os = "macos")]
        {
            self.inner.close()
        }
        #[cfg(not(target_os = "macos"))]
        {
            CloseSnapshot {
                duplicate_closed: false,
                queue_closed: false,
                uncertain: true,
                errors: vec!["unsupported deletion observer".into()],
            }
        }
    }
}

#[cfg(target_os = "macos")]
mod supported {
    use std::{
        os::fd::{AsRawFd, FromRawFd, IntoRawFd, OwnedFd},
        ptr,
    };

    use rustix::{
        buffer::spare_capacity,
        event::kqueue::{Event, EventFilter, EventFlags, VnodeEvents, kevent, kqueue},
        fs::{FileType, fstat},
        io::{self, FdFlags, fcntl_getfd, fcntl_setfd, try_close},
    };

    use crate::next_api::test_snapshot_deletion_fs::{
        CloseSnapshot, DeletionError, DeletionErrorKind, DirectoryIdentity, PollSnapshot, failure,
    };

    const CAPACITY: usize = 8;
    const MAX_ERRORS: usize = 8;

    #[derive(Clone, Debug)]
    pub(super) struct ObservedEvent {
        descriptor: Option<i32>,
        flags: u16,
        vnode_flags: u32,
        data: i64,
        null_user_data: bool,
    }

    impl ObservedEvent {
        fn from_event(event: &Event) -> Self {
            let (descriptor, vnode_flags) = match event.filter() {
                EventFilter::Vnode { vnode, flags } => (Some(vnode), flags.bits()),
                _ => (None, 0),
            };
            Self {
                descriptor,
                flags: event.flags().bits(),
                vnode_flags,
                data: event.data(),
                null_user_data: event.udata().is_null(),
            }
        }
    }

    pub(super) struct Watch {
        duplicate: Option<OwnedFd>,
        queue: Option<OwnedFd>,
        expected: (u64, u64),
        identity: DirectoryIdentity,
        deleted: bool,
        revoked: bool,
        errors: Vec<String>,
        closed: bool,
        duplicate_closed: bool,
        queue_closed: bool,
    }

    fn io_error(operation: &str, error: io::Errno) -> DeletionError {
        failure(
            if matches!(error, io::Errno::NOTSUP | io::Errno::NOSYS) {
                DeletionErrorKind::Unsupported
            } else {
                DeletionErrorKind::Io
            },
            format!("{operation}: {error}"),
        )
    }

    fn physical(fd: &OwnedFd, expected: (u64, u64)) -> Result<(), DeletionError> {
        let stat = fstat(fd).map_err(|error| io_error("fstat held duplicate", error))?;
        if !FileType::from_raw_mode(stat.st_mode).is_dir()
            || (stat.st_dev as u64, stat.st_ino) != expected
        {
            return Err(failure(
                DeletionErrorKind::Identity,
                "held duplicate directory identity differs",
            ));
        }
        Ok(())
    }

    impl Watch {
        pub fn create(
            fd: i32,
            expected: (u64, u64),
            identity: DirectoryIdentity,
        ) -> Result<Self, DeletionError> {
            // The caller owns fd. Only the duplicated descriptor belongs to this observer.
            // Raw fcntl accepts invalid/closed caller integers without violating
            // BorrowedFd's validity contract. Ownership starts only on success.
            let duplicated = unsafe { libc::fcntl(fd, libc::F_DUPFD_CLOEXEC, 0) };
            if duplicated < 0 {
                let error = std::io::Error::last_os_error();
                return Err(failure(
                    DeletionErrorKind::Io,
                    format!("duplicate held stage: {error}"),
                ));
            }
            let duplicate = unsafe { OwnedFd::from_raw_fd(duplicated) };
            let mut watch = Self {
                duplicate: Some(duplicate),
                queue: None,
                expected,
                identity,
                deleted: false,
                revoked: false,
                errors: Vec::new(),
                closed: false,
                duplicate_closed: false,
                queue_closed: true,
            };
            let setup = (|| {
                let duplicate = watch.duplicate.as_ref().unwrap();
                physical(duplicate, expected)?;
                if !fcntl_getfd(duplicate)
                    .map_err(|error| io_error("read duplicate flags", error))?
                    .contains(FdFlags::CLOEXEC)
                {
                    return Err(failure(
                        DeletionErrorKind::Io,
                        "duplicate is not close-on-exec",
                    ));
                }
                watch.queue = Some(kqueue().map_err(|error| io_error("create kqueue", error))?);
                watch.queue_closed = false;
                let queue = watch.queue.as_ref().unwrap();
                fcntl_setfd(queue, FdFlags::CLOEXEC)
                    .map_err(|error| io_error("set queue close-on-exec", error))?;
                if !fcntl_getfd(queue)
                    .map_err(|error| io_error("read queue flags", error))?
                    .contains(FdFlags::CLOEXEC)
                {
                    return Err(failure(DeletionErrorKind::Io, "queue is not close-on-exec"));
                }
                let requested = VnodeEvents::DELETE
                    | VnodeEvents::RENAME
                    | VnodeEvents::REVOKE
                    | VnodeEvents::LINK;
                let change = Event::new(
                    EventFilter::Vnode {
                        vnode: duplicate.as_raw_fd(),
                        flags: requested,
                    },
                    EventFlags::ADD | EventFlags::ENABLE | EventFlags::CLEAR | EventFlags::RECEIPT,
                    ptr::null_mut(),
                );
                let mut events = Vec::with_capacity(CAPACITY);
                // Both descriptors remain held until queue closure. Zero timeout, no retry loop.
                unsafe {
                    kevent(
                        queue,
                        &[change],
                        spare_capacity(&mut events),
                        Some(std::time::Duration::ZERO),
                    )
                }
                .map_err(|error| io_error("register deletion observation", error))?;
                #[cfg(test)]
                eprintln!(
                    "ACTUAL registration duplicate={} queue={} raw={:?}",
                    duplicate.as_raw_fd(),
                    queue.as_raw_fd(),
                    events
                        .iter()
                        .map(ObservedEvent::from_event)
                        .collect::<Vec<_>>()
                );
                if events.len() != 1 {
                    return Err(failure(
                        DeletionErrorKind::Io,
                        format!(
                            "registration did not return exactly one receipt: {:?}",
                            events
                                .iter()
                                .map(ObservedEvent::from_event)
                                .collect::<Vec<_>>()
                        ),
                    ));
                }
                let event = ObservedEvent::from_event(&events[0]);
                if !watch.registration_success(&event) {
                    return Err(failure(
                        DeletionErrorKind::Io,
                        format!("invalid registration receipt: {event:?}"),
                    ));
                }
                physical(watch.duplicate.as_ref().unwrap(), expected)?;
                Ok(())
            })();
            if let Err(error) = setup {
                watch.remember(error.to_string());
                let cleanup = watch.finish_close(close_descriptor);
                return Err(failure(
                    error.kind,
                    format!(
                        "{error}; private descriptor cleanup uncertain={}",
                        (!cleanup.duplicate_closed || !cleanup.queue_closed)
                    ),
                ));
            }
            Ok(watch)
        }

        fn registration_success(&self, event: &ObservedEvent) -> bool {
            event.descriptor == self.duplicate.as_ref().map(AsRawFd::as_raw_fd)
                && event.null_user_data
                && event.flags & EventFlags::ERROR.bits() != 0
                && event.flags
                    & !(EventFlags::ERROR
                        | EventFlags::ADD
                        | EventFlags::ENABLE
                        | EventFlags::CLEAR
                        | EventFlags::RECEIPT)
                        .bits()
                    == 0
                && event.vnode_flags
                    == (VnodeEvents::DELETE
                        | VnodeEvents::RENAME
                        | VnodeEvents::REVOKE
                        | VnodeEvents::LINK)
                        .bits()
                && event.data == 0
        }

        fn remember(&mut self, error: String) {
            if self.errors.len() < MAX_ERRORS && !self.errors.contains(&error) {
                self.errors.push(error);
            }
        }

        fn classify(&mut self, events: &[ObservedEvent], saturated: bool) {
            let descriptor = self.duplicate.as_ref().map(AsRawFd::as_raw_fd);
            let allowed_flags =
                (EventFlags::ADD | EventFlags::ENABLE | EventFlags::CLEAR | EventFlags::RECEIPT)
                    .bits();
            let allowed_vnode = (VnodeEvents::DELETE
                | VnodeEvents::WRITE
                | VnodeEvents::EXTEND
                | VnodeEvents::ATTRIBUTES
                | VnodeEvents::LINK
                | VnodeEvents::RENAME
                | VnodeEvents::REVOKE)
                .bits();
            if saturated {
                self.remember("event buffer saturated; pending observations unknown".into());
            }
            for event in events {
                if event.descriptor != descriptor
                    || !event.null_user_data
                    || event.flags & !allowed_flags != 0
                    || event.vnode_flags & !allowed_vnode != 0
                    || event.data != 0
                {
                    self.remember(format!("invalid deletion event: {event:?}"));
                    continue;
                }
                if event.vnode_flags & VnodeEvents::REVOKE.bits() != 0 {
                    self.revoked = true;
                    self.remember("held directory access revoked".into());
                }
                if event.vnode_flags & VnodeEvents::DELETE.bits() != 0 {
                    self.deleted = true;
                }
            }
        }

        pub fn poll(&mut self) -> Result<PollSnapshot, DeletionError> {
            if self.closed {
                return Err(failure(
                    DeletionErrorKind::Closed,
                    "deletion observer is closed",
                ));
            }
            if let Err(error) = physical(self.duplicate.as_ref().unwrap(), self.expected) {
                self.remember(error.to_string());
            }
            let mut events = Vec::with_capacity(CAPACITY);
            // The queue references only the retained duplicate. Neither can close during this call.
            let result = unsafe {
                kevent(
                    self.queue.as_ref().unwrap(),
                    &[],
                    spare_capacity(&mut events),
                    Some(std::time::Duration::ZERO),
                )
            };
            if let Err(error) = result {
                self.remember(io_error("poll deletion observation", error).to_string());
            }
            let observed: Vec<_> = events.iter().map(ObservedEvent::from_event).collect();
            self.classify(&observed, events.len() == CAPACITY);
            if let Err(error) = physical(self.duplicate.as_ref().unwrap(), self.expected) {
                self.remember(error.to_string());
            }
            Ok(PollSnapshot {
                identity: self.identity.clone(),
                deleted: self.deleted && self.errors.is_empty(),
                revoked: self.revoked,
                uncertain: !self.errors.is_empty(),
                errors: self.errors.clone(),
                #[cfg(test)]
                raw_events: observed,
            })
        }

        fn finish_close(
            &mut self,
            mut close: impl FnMut(OwnedFd) -> io::Result<()>,
        ) -> CloseSnapshot {
            self.closed = true;
            // Take before close: even an ambiguous failing close is never retried by integer.
            if let Some(queue) = self.queue.take() {
                match close(queue) {
                    Ok(()) => self.queue_closed = true,
                    Err(error) => self.remember(io_error("close queue", error).to_string()),
                }
            }
            if let Some(duplicate) = self.duplicate.take() {
                match close(duplicate) {
                    Ok(()) => self.duplicate_closed = true,
                    Err(error) => self.remember(io_error("close duplicate", error).to_string()),
                }
            }
            CloseSnapshot {
                duplicate_closed: self.duplicate_closed,
                queue_closed: self.queue_closed,
                uncertain: !self.errors.is_empty(),
                errors: self.errors.clone(),
            }
        }

        pub fn close(&mut self) -> CloseSnapshot {
            if !self.closed {
                if let Err(error) = self.poll() {
                    self.remember(error.to_string());
                }
            }
            self.finish_close(close_descriptor)
        }
    }

    fn close_descriptor(descriptor: OwnedFd) -> io::Result<()> {
        // Ownership is consumed even on error. Never retry a possibly reused fd.
        unsafe { try_close(descriptor.into_raw_fd()) }
    }

    impl Drop for Watch {
        fn drop(&mut self) {
            // Explicit close is required by the host; Drop is only a fallback.
            self.close();
        }
    }
    #[cfg(test)]
    mod tests {
        use std::{
            fs::{self, File},
            os::{fd::AsRawFd, unix::fs::MetadataExt},
            path::PathBuf,
            sync::atomic::{AtomicU64, Ordering},
        };

        use super::*;
        use crate::next_api::test_snapshot_deletion_fs::DirectoryDeletionWatch;

        static NEXT_ROOT: AtomicU64 = AtomicU64::new(0);

        struct Fixture {
            root: PathBuf,
            stage: PathBuf,
            held: Option<File>,
            expected: DirectoryIdentity,
        }

        impl Fixture {
            fn new() -> Self {
                let root = std::env::temp_dir().join(format!(
                    "next-held-delete124-{}-{}",
                    std::process::id(),
                    NEXT_ROOT.fetch_add(1, Ordering::Relaxed)
                ));
                fs::create_dir(&root).unwrap();
                let stage = root.join("stage");
                fs::create_dir(&stage).unwrap();
                let held = File::open(&stage).unwrap();
                let metadata = held.metadata().unwrap();
                eprintln!(
                    "ACTUAL fixture root={root:?} fd={} dev={} ino={}",
                    held.as_raw_fd(),
                    metadata.dev(),
                    metadata.ino()
                );
                Self {
                    root,
                    stage,
                    held: Some(held),
                    expected: DirectoryIdentity {
                        device: metadata.dev().to_string(),
                        inode: metadata.ino().to_string(),
                    },
                }
            }

            fn watch(&self) -> DirectoryDeletionWatch {
                let result = DirectoryDeletionWatch::create(
                    self.held.as_ref().unwrap().as_raw_fd() as f64,
                    &self.expected,
                );
                eprintln!(
                    "ACTUAL create result={:?}",
                    result
                        .as_ref()
                        .map(|watch| (
                            watch.inner.duplicate.as_ref().unwrap().as_raw_fd(),
                            watch.inner.queue.as_ref().unwrap().as_raw_fd()
                        ))
                        .map_err(ToString::to_string)
                );
                result.unwrap()
            }

            fn poll(&self, watch: &mut DirectoryDeletionWatch, label: &str) -> PollSnapshot {
                let result = watch.poll();
                eprintln!("ACTUAL {label} result={result:#?}");
                let snapshot = result.unwrap();
                // Test-only raw fields are observations, never classifier inputs.
                let _ = snapshot.raw_events.len();
                assert_eq!(snapshot.identity, self.expected);
                snapshot
            }

            fn close(&self, watch: &mut DirectoryDeletionWatch) {
                let duplicate = watch.inner.duplicate.as_ref().unwrap().as_raw_fd();
                let queue = watch.inner.queue.as_ref().unwrap().as_raw_fd();
                let result = watch.close();
                eprintln!("ACTUAL close result={result:#?}");
                assert!(
                    result.duplicate_closed && result.queue_closed && !result.uncertain,
                    "{result:?}"
                );
                assert!(result.errors.is_empty());
                for fd in [duplicate, queue] {
                    let result = unsafe { libc::fcntl(fd, libc::F_GETFD) };
                    eprintln!("ACTUAL closed-fd fcntl fd={fd} result={result}");
                    assert_eq!(result, -1);
                }
                let repeated = watch.close();
                eprintln!("ACTUAL repeated close={repeated:#?}");
                assert!(repeated.duplicate_closed && repeated.queue_closed && !repeated.uncertain);
                let after = watch.poll();
                eprintln!("ACTUAL poll-after-close={after:?}");
                assert_eq!(after.unwrap_err().kind, DeletionErrorKind::Closed);
                if let Some(held) = &self.held {
                    assert!(
                        held.metadata().unwrap().is_dir(),
                        "caller original must remain open"
                    );
                }
            }
        }

        impl Drop for Fixture {
            fn drop(&mut self) {
                self.held.take();
                let result = fs::remove_dir_all(&self.root);
                eprintln!(
                    "ACTUAL fixture cleanup root={:?} result={result:?}",
                    self.root
                );
                if !std::thread::panicking() {
                    result.unwrap();
                    assert!(!self.root.exists());
                }
            }
        }

        #[test]
        fn real_failed_removes_rename_foreign_removal_and_sticky_original_delete() {
            let fixture = Fixture::new();
            fs::write(fixture.stage.join("owned"), b"original").unwrap();
            let mut watch = fixture.watch();
            let before = fixture.poll(&mut watch, "existing");
            assert!(!before.deleted && !before.uncertain);
            let failed_rmdir = fs::remove_dir(&fixture.stage);
            eprintln!("ACTUAL failed rmdir={failed_rmdir:?}");
            assert_eq!(
                failed_rmdir.unwrap_err().raw_os_error(),
                Some(libc::ENOTEMPTY)
            );
            let failed = fixture.poll(&mut watch, "failed-rmdir");
            assert!(!failed.deleted && !failed.uncertain);
            let failed_unlink = fs::remove_file(&fixture.stage);
            eprintln!("ACTUAL failed unlink={failed_unlink:?}");
            assert!(matches!(
                failed_unlink.unwrap_err().raw_os_error(),
                Some(libc::EPERM | libc::EISDIR)
            ));
            let failed = fixture.poll(&mut watch, "failed-unlink");
            assert!(!failed.deleted && !failed.uncertain);
            let outside = fixture.root.join("outside-original-parent");
            fs::create_dir(&outside).unwrap();
            let moved = outside.join("moved");
            fs::rename(&fixture.stage, &moved).unwrap();
            let renamed = fixture.poll(&mut watch, "moved-original");
            assert!(!renamed.deleted && !renamed.uncertain);
            assert!(
                renamed
                    .raw_events
                    .iter()
                    .any(|event| event.vnode_flags & VnodeEvents::RENAME.bits() != 0)
            );
            fs::create_dir(&fixture.stage).unwrap();
            fs::write(fixture.stage.join("foreign"), b"replacement").unwrap();
            assert_ne!(
                fs::metadata(&fixture.stage).unwrap().ino().to_string(),
                fixture.expected.inode
            );
            fs::remove_dir_all(&fixture.stage).unwrap();
            let foreign = fixture.poll(&mut watch, "foreign-at-old-name-removed");
            assert!(!foreign.deleted && !foreign.uncertain);
            assert_eq!(fs::read(moved.join("owned")).unwrap(), b"original");
            fs::remove_dir_all(&moved).unwrap();
            let deleted = fixture.poll(&mut watch, "original-removed-while-held");
            eprintln!(
                "ACTUAL deleted held nlink={}",
                fixture.held.as_ref().unwrap().metadata().unwrap().nlink()
            );
            assert!(deleted.deleted && !deleted.revoked && !deleted.uncertain);
            assert!(
                deleted
                    .raw_events
                    .iter()
                    .any(|event| event.vnode_flags & VnodeEvents::DELETE.bits() != 0)
            );
            let again = fixture.poll(&mut watch, "sticky-delete-second-poll");
            assert!(again.deleted && !again.uncertain);
            fixture.close(&mut watch);
        }

        #[test]
        fn real_duplicate_survives_caller_original_close() {
            let mut fixture = Fixture::new();
            let mut watch = fixture.watch();
            fixture.held.take();
            let before = fixture.poll(&mut watch, "caller-original-closed");
            assert!(!before.deleted && !before.uncertain);
            fs::remove_dir(&fixture.stage).unwrap();
            assert!(
                fixture
                    .poll(&mut watch, "deleted-after-caller-close")
                    .deleted
            );
            fixture.close(&mut watch);
        }

        #[test]
        fn real_final_close_polls_before_discarding_queue() {
            let fixture = Fixture::new();
            let mut watch = fixture.watch();
            assert!(!fixture.poll(&mut watch, "before-final-close").deleted);
            fs::remove_dir(&fixture.stage).unwrap();
            fixture.close(&mut watch);
            assert!(
                watch.inner.deleted,
                "final close must process pending actual DELETE"
            );
        }

        #[test]
        fn real_close_on_exec_is_set_on_both_private_descriptors() {
            let fixture = Fixture::new();
            let mut watch = fixture.watch();
            for fd in [
                watch.inner.duplicate.as_ref().unwrap(),
                watch.inner.queue.as_ref().unwrap(),
            ] {
                let result = fcntl_getfd(fd);
                eprintln!(
                    "ACTUAL descriptor flags fd={} result={result:?}",
                    fd.as_raw_fd()
                );
                assert!(result.unwrap().contains(FdFlags::CLOEXEC));
            }
            fixture.close(&mut watch);
        }

        #[test]
        fn invalid_numeric_fds_refuse_before_duplication() {
            let fixture = Fixture::new();
            for fd in [
                f64::NAN,
                f64::INFINITY,
                f64::NEG_INFINITY,
                -1.0,
                0.5,
                i32::MAX as f64 + 1.0,
            ] {
                let result = DirectoryDeletionWatch::create(fd, &fixture.expected);
                eprintln!(
                    "ACTUAL invalid fd={fd} result={:?}",
                    result.as_ref().map(|_| ()).map_err(ToString::to_string)
                );
                assert_eq!(result.err().unwrap().kind, DeletionErrorKind::Invalid);
            }
        }

        #[test]
        fn invalid_canonical_identities_refuse_before_duplication() {
            let fixture = Fixture::new();
            for inode in ["0", "01", "-1", "+1", "18446744073709551616"] {
                let expected = DirectoryIdentity {
                    device: fixture.expected.device.clone(),
                    inode: inode.into(),
                };
                let result = DirectoryDeletionWatch::create(
                    fixture.held.as_ref().unwrap().as_raw_fd() as f64,
                    &expected,
                );
                eprintln!(
                    "ACTUAL invalid identity={expected:?} result={:?}",
                    result.as_ref().map(|_| ()).map_err(ToString::to_string)
                );
                assert_eq!(result.err().unwrap().kind, DeletionErrorKind::Invalid);
            }
        }

        #[test]
        fn real_file_fd_and_wrong_directory_identity_close_private_duplicate() {
            let fixture = Fixture::new();
            let path = fixture.root.join("file");
            fs::write(&path, b"file").unwrap();
            let file = File::open(path).unwrap();
            let metadata = file.metadata().unwrap();
            let expected = DirectoryIdentity {
                device: metadata.dev().to_string(),
                inode: metadata.ino().to_string(),
            };
            let fd_count = || fs::read_dir("/dev/fd").unwrap().count();
            let before = fd_count();
            let file_result = DirectoryDeletionWatch::create(file.as_raw_fd() as f64, &expected);
            eprintln!(
                "ACTUAL file-fd result={:?}",
                file_result
                    .as_ref()
                    .map(|_| ())
                    .map_err(ToString::to_string)
            );
            assert_eq!(file_result.err().unwrap().kind, DeletionErrorKind::Identity);
            assert_eq!(fd_count(), before);
            assert!(file.metadata().unwrap().is_file());
            let wrong = DirectoryIdentity {
                device: fixture.expected.device.clone(),
                inode: (fixture.expected.inode.parse::<u64>().unwrap() + 1).to_string(),
            };
            let result = DirectoryDeletionWatch::create(
                fixture.held.as_ref().unwrap().as_raw_fd() as f64,
                &wrong,
            );
            eprintln!(
                "ACTUAL wrong-identity result={:?}",
                result.as_ref().map(|_| ()).map_err(ToString::to_string)
            );
            assert_eq!(result.err().unwrap().kind, DeletionErrorKind::Identity);
            assert_eq!(fd_count(), before);
        }

        #[test]
        fn real_closed_numeric_fd_refuses_without_taking_other_descriptors() {
            let fixture = Fixture::new();
            let file = File::open(&fixture.stage).unwrap();
            let fd = file.as_raw_fd();
            drop(file);
            let result = DirectoryDeletionWatch::create(fd as f64, &fixture.expected);
            eprintln!(
                "ACTUAL closed-fd result={:?}",
                result.as_ref().map(|_| ()).map_err(ToString::to_string)
            );
            assert_eq!(result.err().unwrap().kind, DeletionErrorKind::Io);
            assert!(fixture.held.as_ref().unwrap().metadata().unwrap().is_dir());
        }

        fn classified_event(watch: &DirectoryDeletionWatch, flags: VnodeEvents) -> ObservedEvent {
            ObservedEvent {
                descriptor: watch.inner.duplicate.as_ref().map(AsRawFd::as_raw_fd),
                flags: EventFlags::CLEAR.bits(),
                vnode_flags: flags.bits(),
                data: 0,
                null_user_data: true,
            }
        }

        fn synthetic_poll(watch: &mut DirectoryDeletionWatch) -> PollSnapshot {
            let result = watch.poll();
            eprintln!("SYNTHETIC classifier-state poll result={result:#?}");
            result.unwrap()
        }

        fn synthetic_close(watch: &mut DirectoryDeletionWatch) -> CloseSnapshot {
            let result = watch.close();
            eprintln!("SYNTHETIC classifier-state close result={result:#?}");
            result
        }

        #[test]
        fn synthetic_classifier_all_events_error_and_revoke_dominate_delete_in_both_orders() {
            for reverse in [false, true] {
                let fixture = Fixture::new();
                let mut watch = fixture.watch();
                let mut events = vec![
                    classified_event(&watch, VnodeEvents::DELETE | VnodeEvents::LINK),
                    classified_event(&watch, VnodeEvents::REVOKE),
                ];
                if reverse {
                    events.reverse();
                }
                eprintln!("SYNTHETIC classifier only events={events:?}");
                watch.inner.classify(&events, false);
                assert!(
                    watch.inner.deleted && watch.inner.revoked && !watch.inner.errors.is_empty()
                );
                let result = synthetic_poll(&mut watch);
                assert!(!result.deleted && result.revoked && result.uncertain);
                let close = synthetic_close(&mut watch);
                assert!(close.uncertain && close.duplicate_closed && close.queue_closed);
            }
        }

        #[test]
        fn synthetic_classifier_invalid_record_and_saturation_are_sticky_and_bounded() {
            let fixture = Fixture::new();
            let mut watch = fixture.watch();
            let delete = classified_event(&watch, VnodeEvents::DELETE);
            let mut error = classified_event(&watch, VnodeEvents::empty());
            error.flags = EventFlags::ERROR.bits();
            error.data = libc::EBADF as i64;
            eprintln!("SYNTHETIC classifier only delete={delete:?} error={error:?}");
            watch
                .inner
                .classify(&[delete.clone(), error.clone()], false);
            for index in 0..32 {
                error.data = index;
                watch.inner.classify(&[error.clone()], true);
            }
            assert!(watch.inner.deleted && !watch.inner.errors.is_empty());
            assert!(watch.inner.errors.len() <= MAX_ERRORS);
            let result = synthetic_poll(&mut watch);
            assert!(!result.deleted && result.uncertain);
            assert!(synthetic_close(&mut watch).uncertain);
        }

        #[test]
        fn synthetic_error_records_dominate_delete_in_both_orders() {
            for data in [0, libc::EBADF as i64] {
                for reverse in [false, true] {
                    let fixture = Fixture::new();
                    let mut watch = fixture.watch();
                    let delete = classified_event(&watch, VnodeEvents::DELETE | VnodeEvents::LINK);
                    let mut error = classified_event(&watch, VnodeEvents::empty());
                    error.flags = EventFlags::ERROR.bits();
                    error.data = data;
                    let mut events = vec![delete, error];
                    if reverse {
                        events.reverse();
                    }
                    eprintln!(
                        "SYNTHETIC actual-error classification only data={data} events={events:?}"
                    );
                    watch.inner.classify(&events, false);
                    let result = synthetic_poll(&mut watch);
                    assert!(watch.inner.deleted);
                    assert!(!result.deleted && result.uncertain);
                    let closed = synthetic_close(&mut watch);
                    assert!(closed.queue_closed && closed.duplicate_closed && closed.uncertain);
                }
            }
        }

        #[test]
        fn synthetic_unknown_event_shapes_never_supply_positive_deletion() {
            for shape in [
                "descriptor",
                "userdata",
                "event-flags",
                "vnode-flags",
                "data",
                "eof",
            ] {
                let fixture = Fixture::new();
                let mut watch = fixture.watch();
                let mut event = classified_event(&watch, VnodeEvents::DELETE | VnodeEvents::LINK);
                match shape {
                    "descriptor" => event.descriptor = None,
                    "userdata" => event.null_user_data = false,
                    "event-flags" => event.flags |= EventFlags::ONESHOT.bits(),
                    "vnode-flags" => event.vnode_flags |= 1 << 31,
                    "data" => event.data = 1,
                    "eof" => event.flags |= EventFlags::EOF.bits(),
                    _ => unreachable!(),
                }
                eprintln!("SYNTHETIC unknown-event classifier only shape={shape} event={event:?}");
                watch.inner.classify(&[event], false);
                let result = synthetic_poll(&mut watch);
                assert!(!result.deleted && result.uncertain);
                let closed = synthetic_close(&mut watch);
                assert!(closed.queue_closed && closed.duplicate_closed && closed.uncertain);
            }
        }

        #[test]
        fn synthetic_registration_receipt_zero_is_success_only_for_exact_receipt() {
            let fixture = Fixture::new();
            let mut watch = fixture.watch();
            let mut receipt = classified_event(
                &watch,
                VnodeEvents::DELETE | VnodeEvents::RENAME | VnodeEvents::LINK | VnodeEvents::REVOKE,
            );
            receipt.flags = EventFlags::ERROR.bits();
            eprintln!("SYNTHETIC receipt validation only={receipt:?}");
            assert!(watch.inner.registration_success(&receipt));
            receipt.data = libc::EINVAL as i64;
            assert!(!watch.inner.registration_success(&receipt));
            receipt.data = 0;
            receipt.descriptor = None;
            assert!(!watch.inner.registration_success(&receipt));
            receipt.descriptor = watch.inner.duplicate.as_ref().map(AsRawFd::as_raw_fd);
            receipt.null_user_data = false;
            assert!(!watch.inner.registration_success(&receipt));
            fixture.close(&mut watch);
        }

        #[test]
        fn synthetic_close_failure_consumes_each_real_descriptor_once_and_closes_other() {
            let fixture = Fixture::new();
            let mut watch = fixture.watch();
            let mut calls = Vec::new();
            let closed = watch.inner.finish_close(|fd| {
                calls.push(fd.as_raw_fd());
                close_descriptor(fd).unwrap();
                // Failure delivery is simulated after actual close; no real fd is leaked.
                Err(io::Errno::INTR)
            });
            eprintln!("SYNTHETIC close failure delivery only calls={calls:?} result={closed:?}");
            assert_eq!(calls.len(), 2);
            assert_ne!(calls[0], calls[1]);
            assert!(closed.uncertain && !closed.queue_closed && !closed.duplicate_closed);
            let repeated = watch
                .inner
                .finish_close(|_| panic!("ambiguous fd must not be retried"));
            eprintln!("SYNTHETIC repeated close result={repeated:#?}");
            assert!(repeated.uncertain);
            assert_eq!(repeated.errors, closed.errors);
            assert_eq!(watch.poll().unwrap_err().kind, DeletionErrorKind::Closed);
        }
    }
}
