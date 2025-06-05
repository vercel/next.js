extern crate turbo_tasks_malloc;

pub struct HmrBenchmark {
    test_app: TestApp,
}

fn runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .on_thread_stop(|| {
            turbo_tasks_malloc::TurboMalloc::thread_stop();
        })
        .build()
        .context("Failed to build tokio runtime")
        .unwrap()
}

impl HmrBenchmark {
    pub fn new(module_count: usize) -> Result<Self> {
        // Create a test app similar to the one used in next-rs-api.test.ts
        let test_app = TestAppBuilder {
            module_count,
            directories_count: module_count / 20,
            package_json: Some(PackageJsonConfig {
                react_version: "^18.2.0".to_string(),
            }),
            effect_mode: EffectMode::Hook,
            ..Default::default()
        }
        .build()
        .context("Failed to build test app")?;

        Ok(Self { test_app })
    }

    /// Simulate file changes for HMR testing
    pub fn make_file_change(&self, file_path: &Path, change_id: usize) -> Result<()> {
        let mut content =
            std::fs::read_to_string(file_path).context("Failed to read file content")?;

        // Add a comment with a unique identifier to trigger HMR
        let change_marker = format!("// HMR_CHANGE_{change_id}\n");
        content.push_str(&change_marker);

        std::fs::write(file_path, content).context("Failed to write modified content")?;

        Ok(())
    }
}
