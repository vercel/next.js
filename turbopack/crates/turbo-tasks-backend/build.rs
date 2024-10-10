use turbo_tasks_build::generate_register;

fn main() {
    generate_register();
    built::write_built_file().expect("Failed to acquire build-time information");
}
