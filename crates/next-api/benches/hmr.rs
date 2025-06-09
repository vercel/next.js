extern crate turbo_tasks_malloc;

use std::{
    fs::{create_dir_all, write},
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

use anyhow::{Context, Result};
use next_api::project::{
    DefineEnv, DraftModeOptions, ProjectContainer, ProjectOptions, WatchOptions,
};
use tokio::runtime::Runtime;
use turbo_rcstr::RcStr;
use turbo_tasks::{TransientInstance, Vc};

pub struct HmrBenchmark {
    test_app: TestApp,
    project_container: Vc<ProjectContainer>,
    rt: Runtime,
}

#[derive(Debug)]
pub struct TestApp {
    _path: PathBuf,
    modules: Vec<(PathBuf, usize)>,
}

impl TestApp {
    pub fn path(&self) -> &Path {
        &self._path
    }

    pub fn modules(&self) -> &[(PathBuf, usize)] {
        &self.modules
    }
}

fn create_test_app(module_count: usize) -> Result<TestApp> {
    let temp_dir = tempfile::tempdir().context("Failed to create temp directory")?;
    let base_path = temp_dir.path().to_path_buf();

    // Create basic Next.js structure
    let pages_dir = base_path.join("pages");
    let app_dir = base_path.join("app");
    let src_dir = base_path.join("src");

    create_dir_all(&pages_dir)?;
    create_dir_all(&app_dir)?;
    create_dir_all(&src_dir)?;

    let mut modules = Vec::new();

    // Create index page
    let index_content = r#"import React from 'react';

export default function Home() {
    return <div>Hello World</div>;
}
"#;
    let index_path = pages_dir.join("index.js");
    write(&index_path, index_content)?;
    modules.push((index_path, 0));

    // Create app layout
    let layout_content = r#"export default function RootLayout({ children }) {
    return (
        <html>
            <body>{children}</body>
        </html>
    );
}
"#;
    let layout_path = app_dir.join("layout.js");
    write(&layout_path, layout_content)?;
    modules.push((layout_path, 0));

    // Create app page
    let app_page_content = r#"export default function Page() {
    return <div>App Router Page</div>;
}
"#;
    let app_page_path = app_dir.join("page.js");
    write(&app_page_path, app_page_content)?;
    modules.push((app_page_path, 0));

    // Create additional modules based on module_count
    for i in 3..module_count {
        let component_content = format!(
            r#"import React from 'react';

export default function Component{}() {{
    return <div>Component {}</div>;
}}
"#,
            i, i
        );

        let component_path = src_dir.join(format!("component{}.js", i));
        write(&component_path, component_content)?;
        modules.push((component_path, 1));
    }

    // Create package.json
    let package_json = r#"{
    "name": "hmr-test-app",
    "version": "1.0.0",
    "dependencies": {
        "react": "^18.2.0",
        "react-dom": "^18.2.0",
        "next": "^14.0.0"
    }
}
"#;
    write(base_path.join("package.json"), package_json)?;

    // Create next.config.js
    let next_config = "module.exports = {}";
    write(base_path.join("next.config.js"), next_config)?;

    // Prevent temp directory from being dropped
    std::mem::forget(temp_dir);

    Ok(TestApp {
        _path: base_path,
        modules,
    })
}

fn runtime() -> Runtime {
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
        let rt = runtime();

        let test_app = create_test_app(module_count)?;

        let project_container = rt.block_on(async {
            let container = ProjectContainer::new(RcStr::from("hmr-benchmark"), true);

            let project_path = test_app.path().to_string_lossy().to_string();
            let root_path = test_app.path().to_string_lossy().to_string();

            let options = ProjectOptions {
                root_path: RcStr::from(root_path),
                project_path: RcStr::from(project_path.clone()),
                next_config: RcStr::from("{}"),
                js_config: RcStr::from("{}"),
                env: vec![],
                define_env: DefineEnv {
                    client: vec![],
                    edge: vec![],
                    nodejs: vec![],
                },
                watch: WatchOptions {
                    enable: true,
                    poll_interval: None,
                },
                dev: true,
                encryption_key: RcStr::from("test-key"),
                build_id: RcStr::from("development"),
                preview_props: DraftModeOptions {
                    preview_mode_id: RcStr::from("development"),
                    preview_mode_encryption_key: RcStr::from("test-key"),
                    preview_mode_signing_key: RcStr::from("test-key"),
                },
                browserslist_query: RcStr::from("last 2 versions"),
                no_mangling: false,
            };

            // container.initialize(options).await?;
            Ok::<_, anyhow::Error>(container)
        })?;

        Ok(Self {
            test_app,
            project_container,
            rt,
        })
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

    /// Benchmark HMR update detection and processing
    pub fn benchmark_hmr_update(&self, num_updates: usize) -> Result<Duration> {
        let start_time = Instant::now();

        self.rt.block_on(async {
            // Get entrypoints to trigger initial compilation
            let entrypoints = self.project_container.entrypoints();
            let initial_result = entrypoints.await?;

            // Check if we have routes available
            if initial_result.routes.is_empty() {
                return Err(anyhow::anyhow!("No routes found in entrypoints"));
            }

            // Get HMR identifiers
            let hmr_identifiers = self.project_container.hmr_identifiers();
            let identifiers = hmr_identifiers.await?;

            if identifiers.is_empty() {
                return Err(anyhow::anyhow!("No HMR identifiers found"));
            }

            // Get project to access HMR methods
            let project = self.project_container.project();

            // Create multiple sessions to simulate real HMR usage
            let mut update_durations = Vec::new();

            for i in 0..num_updates {
                let update_start = Instant::now();

                // Use different identifiers for each update
                let identifier = &identifiers[i % identifiers.len()];

                // Get version state for this update
                let session = TransientInstance::new(());
                let version_state = project.hmr_version_state(identifier.clone(), session);

                // Pick a module file to change
                let module_index = i % self.test_app.modules().len();
                let (module_path, _) = &self.test_app.modules()[module_index];

                // Make a file change
                self.make_file_change(module_path, i)?;

                // Wait for HMR update and measure time
                let _update_result = project
                    .hmr_update(identifier.clone(), version_state)
                    .await?;

                update_durations.push(update_start.elapsed());
            }

            // Log individual update times for analysis
            for (i, duration) in update_durations.iter().enumerate() {
                println!("HMR update {} took: {:?}", i + 1, duration);
            }

            Ok::<_, anyhow::Error>(())
        })?;

        Ok(start_time.elapsed())
    }

    /// Benchmark HMR subscription and event handling
    pub fn benchmark_hmr_subscription(&self) -> Result<Duration> {
        let start_time = Instant::now();

        self.rt.block_on(async {
            // Get entrypoints first
            let entrypoints = self.project_container.entrypoints();
            let _initial_result = entrypoints.await?;

            // Get HMR identifiers
            let hmr_identifiers = self.project_container.hmr_identifiers();
            let identifiers = hmr_identifiers.await?;

            if identifiers.is_empty() {
                return Err(anyhow::anyhow!("No HMR identifiers found"));
            }

            let project = self.project_container.project();

            // Test subscription to multiple identifiers
            let mut version_states = Vec::new();
            for identifier in identifiers.iter().take(5) {
                // Test with first 5 identifiers
                let session = TransientInstance::new(());
                let version_state = project.hmr_version_state(identifier.clone(), session);
                version_states.push((identifier.clone(), version_state));
            }

            // Simulate multiple rapid updates
            for (i, (identifier, version_state)) in version_states.iter().enumerate() {
                // Make a file change
                if let Some((module_path, _)) = self.test_app.modules().get(i) {
                    self.make_file_change(module_path, i * 100)?;

                    // Check for update
                    let _update_result = project
                        .hmr_update(identifier.clone(), *version_state)
                        .await?;
                }
            }

            Ok::<_, anyhow::Error>(())
        })?;

        Ok(start_time.elapsed())
    }

    /// Benchmark initial project setup and entrypoint detection
    pub fn benchmark_initial_compilation(&self) -> Result<Duration> {
        let start_time = Instant::now();

        self.rt.block_on(async {
            let entrypoints = self.project_container.entrypoints();
            let _result = entrypoints.await?;
            Ok::<_, anyhow::Error>(())
        })?;

        Ok(start_time.elapsed())
    }

    /// Get the number of modules in the test app
    pub fn module_count(&self) -> usize {
        self.test_app.modules().len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hmr_benchmark_creation() {
        let benchmark = HmrBenchmark::new(100).unwrap();
        assert!(benchmark.module_count() > 0);
    }

    #[test]
    fn test_initial_compilation_benchmark() {
        let benchmark = HmrBenchmark::new(50).unwrap();
        let duration = benchmark.benchmark_initial_compilation().unwrap();
        println!("Initial compilation took: {:?}", duration);
        assert!(duration > Duration::from_millis(0));
    }

    #[test]
    fn test_hmr_update_benchmark() {
        let benchmark = HmrBenchmark::new(50).unwrap();

        // First run initial compilation
        let _ = benchmark.benchmark_initial_compilation().unwrap();

        // Then benchmark HMR updates
        let duration = benchmark.benchmark_hmr_update(5).unwrap();
        println!("HMR updates took: {:?}", duration);
        assert!(duration > Duration::from_millis(0));
    }
}

// Criterion benchmarks
use criterion::{Criterion, black_box, criterion_group, criterion_main};

fn criterion_hmr_initial_compilation(c: &mut Criterion) {
    let benchmark = HmrBenchmark::new(100).unwrap();

    c.bench_function("hmr_initial_compilation", |b| {
        b.iter(|| black_box(benchmark.benchmark_initial_compilation().unwrap()))
    });
}

fn criterion_hmr_updates_small(c: &mut Criterion) {
    let benchmark = HmrBenchmark::new(50).unwrap();
    // Initialize compilation first
    let _ = benchmark.benchmark_initial_compilation().unwrap();

    c.bench_function("hmr_updates_small_5", |b| {
        b.iter(|| black_box(benchmark.benchmark_hmr_update(5).unwrap()))
    });
}

fn criterion_hmr_updates_medium(c: &mut Criterion) {
    let benchmark = HmrBenchmark::new(200).unwrap();
    // Initialize compilation first
    let _ = benchmark.benchmark_initial_compilation().unwrap();

    c.bench_function("hmr_updates_medium_10", |b| {
        b.iter(|| black_box(benchmark.benchmark_hmr_update(10).unwrap()))
    });
}

fn criterion_hmr_updates_large(c: &mut Criterion) {
    let benchmark = HmrBenchmark::new(500).unwrap();
    // Initialize compilation first
    let _ = benchmark.benchmark_initial_compilation().unwrap();

    c.bench_function("hmr_updates_large_20", |b| {
        b.iter(|| black_box(benchmark.benchmark_hmr_update(20).unwrap()))
    });
}

fn criterion_hmr_subscription(c: &mut Criterion) {
    let benchmark = HmrBenchmark::new(100).unwrap();
    // Initialize compilation first
    let _ = benchmark.benchmark_initial_compilation().unwrap();

    c.bench_function("hmr_subscription", |b| {
        b.iter(|| black_box(benchmark.benchmark_hmr_subscription().unwrap()))
    });
}

criterion_group!(
    hmr_benches,
    criterion_hmr_initial_compilation,
    criterion_hmr_updates_small,
    criterion_hmr_updates_medium,
    criterion_hmr_updates_large,
    criterion_hmr_subscription
);
criterion_main!(hmr_benches);
