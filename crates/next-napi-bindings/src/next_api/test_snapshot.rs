use napi::{Error, Status};
use napi_derive::napi;

use crate::next_api::test_snapshot_fs::{self, DirectoryIdentity, PublishErrorKind};

#[napi(object)]
pub struct TestSnapshotNoReplaceCapability {
    pub version: u32,
    pub platform_supported: bool,
}

#[napi(object)]
pub struct TestSnapshotDirectoryIdentity {
    pub device: String,
    pub inode: String,
}

/// Compile-target capability only. This does not touch the filesystem or certify
/// that a particular filesystem supports atomic destination no-replace.
#[napi]
pub fn test_snapshot_no_replace_capability() -> TestSnapshotNoReplaceCapability {
    TestSnapshotNoReplaceCapability {
        version: 1,
        platform_supported: test_snapshot_fs::platform_supported(),
    }
}

/// Uncached filesystem publication, not a native artifact/provenance issuer.
/// Destination no-replace is atomic; source identity checks are not inode CAS.
#[napi]
pub fn test_snapshot_publish_no_replace(
    staging_path: String,
    publication_path: String,
    expected_identity: TestSnapshotDirectoryIdentity,
) -> napi::Result<TestSnapshotDirectoryIdentity> {
    let identity = test_snapshot_fs::publish(
        &staging_path,
        &publication_path,
        &DirectoryIdentity {
            device: expected_identity.device,
            inode: expected_identity.inode,
        },
    )
    .map_err(|error| {
        Error::new(
            if error.kind == PublishErrorKind::Invalid {
                Status::InvalidArg
            } else {
                Status::GenericFailure
            },
            error.to_string(),
        )
    })?;
    Ok(TestSnapshotDirectoryIdentity {
        device: identity.device,
        inode: identity.inode,
    })
}
