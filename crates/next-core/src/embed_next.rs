#[macro_export]
macro_rules! embed_next_file {
    ($path:expr) => {
        turbo_tasks_fs::embed_file!(concat!("src/next_js/", $path))
    };
}
