use napi::{Error, Status};
use napi_derive::napi;

use crate::next_api::test_snapshot_deletion_fs::{
    self, DeletionError, DeletionErrorKind, DirectoryDeletionWatch, DirectoryIdentity,
};

#[napi(object)]
pub struct TestSnapshotDirectoryDeletionCapability {
    pub version: u32,
    pub platform_supported: bool,
}

#[napi(object)]
pub struct TestSnapshotDeletionDirectoryIdentity {
    pub device: String,
    pub inode: String,
}

#[napi(object)]
pub struct TestSnapshotDirectoryDeletionObservation {
    pub version: u32,
    pub device: String,
    pub inode: String,
    pub deleted: bool,
    pub revoked: bool,
    pub uncertain: bool,
    pub errors: Vec<String>,
}

#[napi(object)]
pub struct TestSnapshotDirectoryDeletionClosure {
    pub version: u32,
    pub duplicate_closed: bool,
    pub queue_closed: bool,
    pub uncertain: bool,
    pub errors: Vec<String>,
}

/// Utility object only. Its identity supplies no allocation or compiler authority.
#[napi]
pub struct TestSnapshotDirectoryDeletionWatch {
    inner: DirectoryDeletionWatch,
}

fn native_error(error: DeletionError) -> Error {
    Error::new(
        if error.kind == DeletionErrorKind::Invalid {
            Status::InvalidArg
        } else {
            Status::GenericFailure
        },
        error.to_string(),
    )
}

/// Compile-target query only. No descriptors or paths are opened.
#[napi]
pub fn test_snapshot_directory_deletion_capability() -> TestSnapshotDirectoryDeletionCapability {
    TestSnapshotDirectoryDeletionCapability {
        version: 1,
        platform_supported: test_snapshot_deletion_fs::platform_supported(),
    }
}

/// Duplicate and watch the exact held descriptor, never reopen a pathname.
#[napi]
pub fn test_snapshot_watch_directory_deletion(
    held_stage_fd: f64,
    expected_identity: TestSnapshotDeletionDirectoryIdentity,
) -> napi::Result<TestSnapshotDirectoryDeletionWatch> {
    DirectoryDeletionWatch::create(
        held_stage_fd,
        &DirectoryIdentity {
            device: expected_identity.device,
            inode: expected_identity.inode,
        },
    )
    .map(|inner| TestSnapshotDirectoryDeletionWatch { inner })
    .map_err(native_error)
}

#[napi]
impl TestSnapshotDirectoryDeletionWatch {
    #[napi]
    pub fn poll(&mut self) -> napi::Result<TestSnapshotDirectoryDeletionObservation> {
        let result = self.inner.poll().map_err(native_error)?;
        Ok(TestSnapshotDirectoryDeletionObservation {
            version: 1,
            device: result.identity.device,
            inode: result.identity.inode,
            deleted: result.deleted,
            revoked: result.revoked,
            uncertain: result.uncertain,
            errors: result.errors,
        })
    }

    #[napi]
    pub fn close(&mut self) -> TestSnapshotDirectoryDeletionClosure {
        let result = self.inner.close();
        TestSnapshotDirectoryDeletionClosure {
            version: 1,
            duplicate_closed: result.duplicate_closed,
            queue_closed: result.queue_closed,
            uncertain: result.uncertain,
            errors: result.errors,
        }
    }
}
