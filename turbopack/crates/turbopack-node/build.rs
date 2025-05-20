use std::process::Command;

use turbo_tasks_build::generate_register;

fn main() {
    generate_register();

    // Run pnpm install
    let status = Command::new("pnpm")
        .args(["install"])
        .current_dir("js")
        .status()
        .expect("failed to run pnpm install");

    if !status.success() {
        panic!("pnpm install failed to run");
    }

    // Run pnpm webpack
    let status = Command::new("pnpm")
        .args(["webpack"])
        .current_dir("js")
        .status()
        .expect("failed to run webpack");

    if !status.success() {
        panic!("webpack failed to run");
    }
}
