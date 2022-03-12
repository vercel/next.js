use std::{fs::remove_dir_all, io::ErrorKind, path::PathBuf};

use async_std::task::block_on;
use testing::fixture;
use turbo_tasks::{NothingRef, TurboTasks};
use turbo_tasks_fs::{DiskFileSystemRef, FileSystemPathRef};
use turbopack::{emit, module, rebase::RebasedAssetRef, source_asset::SourceAssetRef};

#[fixture("tests/node-file-trace/integration/argon2.js")]
fn integration_test(input: PathBuf) {
    let package_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut tests_root = package_root.clone();
    tests_root.push("tests");
    let mut tests_output_root = package_root.clone();
    tests_output_root.push("tests_output");
    let tests_root = tests_root.to_string_lossy().to_string();
    let mut input = input.to_string_lossy().to_string();
    if input.starts_with("\\\\?\\") {
        input.replace_range(0..4, "");
    }
    let input = input.strip_prefix(&tests_root).unwrap()[1..].to_string();
    let directory = tests_output_root.join(&input).to_string_lossy().to_string();
    let input = input.replace('\\', "/");

    remove_dir_all(&directory)
        .or_else(|err| {
            if err.kind() == ErrorKind::NotFound {
                Ok(())
            } else {
                Err(err)
            }
        })
        .unwrap();

    let tt = TurboTasks::new();
    tt.spawn_once_task(async move {
        println!("{:?}, {}, {}", tests_output_root, input, directory);
        let input_fs = DiskFileSystemRef::new("tests".to_string(), tests_root.clone());
        let input = FileSystemPathRef::new(input_fs.into(), &input);
        let input_dir = input.clone().parent().parent();
        let output_fs = DiskFileSystemRef::new("output".to_string(), directory.clone());
        let output_dir = FileSystemPathRef::new(output_fs.into(), "");

        let source = SourceAssetRef::new(input);
        let module = module(source.into());
        let rebased = RebasedAssetRef::new(module, input_dir, output_dir);
        emit(rebased.into());
        Ok(NothingRef::new().into())
    });
    block_on(tt.wait_done());
}
