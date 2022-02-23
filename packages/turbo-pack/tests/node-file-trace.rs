use std::path::PathBuf;

use async_std::task::block_on;
use testing::fixture;
use turbo_pack::{emit, source_asset::SourceAssetRef};
use turbo_tasks::{SlotRef, TurboTasks};
use turbo_tasks_fs::{DiskFileSystemRef, FileSystemPathRef};

#[fixture("tests/node-file-trace/integration/react.js")]
fn integration_test(input: PathBuf) {
    let input = Box::leak(Box::new(input));
    let tt = TurboTasks::new();
    let task = tt.spawn_root_task(|| {
        Box::pin(async {
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

            println!("{:?}, {}, {}", tests_output_root, input, directory);

            let input_fs = DiskFileSystemRef::new("tests".to_string(), tests_root.clone());
            let input = FileSystemPathRef::new(input_fs.into(), input);
            let input_dir = input.clone().parent();
            let output_fs = DiskFileSystemRef::new("output".to_string(), directory.clone());
            let output_dir = FileSystemPathRef::new(output_fs.into(), "".to_string());
            emit(SourceAssetRef::new(input).into(), input_dir, output_dir);
            SlotRef::Nothing
        })
    });
    block_on(task.wait_done());
}
