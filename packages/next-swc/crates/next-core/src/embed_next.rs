#[macro_export]
macro_rules! embed_next_file {
    ($path:expr) => {
        turbo_tasks_fs::embed_file!(concat!(
            env!("CARGO_WORKSPACE_DIR"),
            "crates/next-core/src/next_js/",
            $path
        ))
    };
}
