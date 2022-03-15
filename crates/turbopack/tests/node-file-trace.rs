use std::{
    fs::remove_dir_all,
    io::ErrorKind,
    path::{Path, PathBuf},
};

use anyhow::{Context, Error};
use async_std::{process::Command, task::block_on};
use testing::fixture;
use turbo_tasks::{NothingRef, TurboTasks};
use turbo_tasks_fs::{DiskFileSystemRef, FileSystemPathRef};
use turbopack::{
    asset::Asset, emit_with_completion, module, rebase::RebasedAssetRef,
    source_asset::SourceAssetRef,
};

#[fixture("tests/node-file-trace/integration/react.js")]
#[fixture("tests/node-file-trace/integration/analytics-node.js")]
#[fixture("tests/node-file-trace/integration/apollo.js")]
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

        let output_path = rebased.path();
        emit_with_completion(rebased.into()).await?;

        exec_node(output_path);

        Ok(NothingRef::new().into())
    });
    block_on(tt.wait_done());
}

#[turbo_tasks::function]
async fn exec_node(path: FileSystemPathRef) -> Result<(), Error> {
    let mut cmd = Command::new("node");

    let p = path.get().await?;
    let f = Path::new("tests_output")
        .join("node-file-trace")
        .join(&p.path)
        .join(&p.path);
    eprintln!("File: {}", f.display());

    cmd.arg(&f);

    let output = cmd.output().await.context("failed to spawn process")?;

    eprintln!(
        "---------- Stdout ----------\n{}\n---------- Stderr ----------\n {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    Ok(())
}
