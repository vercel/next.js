extern crate turbo_tasks_malloc;

use std::{
    fs::{create_dir_all, write},
    mem::forget,
    path::{Path, PathBuf},
    process::Command,
    sync::Arc,
    time::{Duration, Instant},
};

use anyhow::{Context, Result};
use next_api::{
    project::{DefineEnv, DraftModeOptions, ProjectContainer, ProjectOptions, WatchOptions},
    register,
    route::endpoint_write_to_disk,
};
use serde_json::json;
use tempfile::TempDir;
use tokio::runtime::Runtime;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    TransientInstance, TurboTasks, TurboTasksApi, Vc, backend::Backend, trace::TraceRawVcs,
};
use turbo_tasks_backend::noop_backing_storage;

pub struct HmrBenchmark {
    test_app: TestApp,
    project_container: Vc<ProjectContainer>,
}

#[derive(Debug)]
pub struct TestApp {
    _path: PathBuf,
    /// Prevent temp directory from being dropped
    _dir: TempDir,
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

export default function Component{i}() {{
    return <div>Component {i}</div>;
}}
"#
        );

        let component_path = src_dir.join(format!("component{i}.js"));
        write(&component_path, component_content)?;
        modules.push((component_path, 1));
    }

    // Create package.json
    let package_json = r#"{
    "name": "hmr-test-app",
    "version": "1.0.0",
    "dependencies": {
        "react": "^19.0.0",
        "react-dom": "^19.0.0",
        "next": "^15.0.0"
    }
}
"#;
    write(base_path.join("package.json"), package_json)?;

    // Create next.config.js
    let next_config = "module.exports = {}";
    write(base_path.join("next.config.js"), next_config)?;

    // Run `npm install`
    let output = Command::new("npm")
        .current_dir(&base_path)
        .args(["install"])
        .output()?;

    if !output.status.success() {
        return Err(anyhow::anyhow!("Failed to run `npm install`"));
    }

    Ok(TestApp {
        _path: base_path,
        _dir: temp_dir,
        modules,
    })
}

fn load_next_config() -> RcStr {
    serde_json::to_string(&json!({
        "sassOptions": {

        },
    }))
    .unwrap()
    .into()
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
    pub async fn new(module_count: usize) -> Result<Self> {
        let test_app = create_test_app(module_count)?;

        let project_container = {
            let container = ProjectContainer::new(RcStr::from("hmr-benchmark"), true)
                .to_resolved()
                .await?;

            let project_path = test_app.path().to_string_lossy().to_string();
            let root_path = test_app.path().to_string_lossy().to_string();

            let options = ProjectOptions {
                root_path: RcStr::from(root_path),
                project_path: RcStr::from(project_path.clone()),
                next_config: load_next_config(),
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

            container.initialize(options).await?;
            Ok::<_, anyhow::Error>(container)
        }?;

        Ok(Self {
            test_app,
            project_container: *project_container,
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
    pub async fn benchmark_hmr_update(&self, num_updates: usize) -> Result<Duration> {
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

        Ok(update_durations.iter().sum::<Duration>())
    }

    /// Benchmark HMR subscription and event handling
    pub async fn benchmark_hmr_subscription(&self) -> Result<Duration> {
        let start_time = Instant::now();

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

        Ok(start_time.elapsed())
    }

    /// Benchmark initial project setup and entrypoint detection
    pub async fn benchmark_initial_compilation(&self) -> Result<Duration> {
        let start_time = Instant::now();

        let entrypoints = self.project_container.entrypoints();
        let result = entrypoints.await?;

        for route in result.routes.values() {
            match route {
                next_api::route::Route::Page {
                    html_endpoint,
                    data_endpoint,
                } => {
                    let _ = endpoint_write_to_disk(**html_endpoint).await?;
                    let _ = endpoint_write_to_disk(**data_endpoint).await?;
                }
                next_api::route::Route::PageApi { endpoint } => {
                    let _ = endpoint_write_to_disk(**endpoint).await?;
                }
                next_api::route::Route::AppPage(app_page_routes) => {
                    for route in app_page_routes.iter() {
                        let _ = endpoint_write_to_disk(*route.html_endpoint).await?;
                        let _ = endpoint_write_to_disk(*route.rsc_endpoint).await?;
                    }
                }
                next_api::route::Route::AppRoute { endpoint, .. } => {
                    let _ = endpoint_write_to_disk(**endpoint).await?;
                }
                next_api::route::Route::Conflict => {}
            }
        }

        Ok(start_time.elapsed())
    }

    /// Get the number of modules in the test app
    pub fn module_count(&self) -> usize {
        self.test_app.modules().len()
    }
}

async fn setup_benchmark(module_count: usize) -> HmrBenchmark {
    register();
    HmrBenchmark::new(module_count).await.unwrap()
}

fn setup_runtime() -> Runtime {
    runtime()
}

fn setup_turbo_tasks() -> Arc<TurboTasks<impl Backend>> {
    TurboTasks::new(turbo_tasks_backend::TurboTasksBackend::new(
        turbo_tasks_backend::BackendOptions {
            storage_mode: None,
            dependency_tracking: true,
            ..Default::default()
        },
        noop_backing_storage(),
    ))
}

#[derive(TraceRawVcs)]
struct Setup {
    #[turbo_tasks(trace_ignore)]
    rt: Arc<Runtime>,
    #[turbo_tasks(trace_ignore)]
    tt: Arc<dyn TurboTasksApi>,
    #[turbo_tasks(trace_ignore)]
    benchmark: HmrBenchmark,
}

fn setup_everything(module_count: usize) -> Arc<Setup> {
    let rt = Arc::new(setup_runtime());
    let tt = setup_turbo_tasks();

    let arc = rt.clone().block_on(async move {
        tt.clone()
            .run_once(async move {
                let benchmark = setup_benchmark(module_count).await;
                benchmark.benchmark_initial_compilation().await.unwrap();

                Ok(Arc::new(Setup { rt, tt, benchmark }))
            })
            .await
            .unwrap()
    });

    // I don't know why this is needed, but it is required to avoid dropping tokio runtime from
    // async scope
    forget(arc.clone());
    arc
}

#[divan::bench]
fn hmr_initial_compilation(bencher: divan::Bencher) {
    let setup = setup_everything(100);

    bencher.with_inputs(|| setup.clone()).bench_values(|setup| {
        setup.clone().rt.block_on(async move {
            setup.clone().tt.run_once(Box::pin(async move {
                setup
                    .benchmark
                    .benchmark_initial_compilation()
                    .await
                    .unwrap();
                Ok(())
            }));
        })
    });
}

#[divan::bench(max_time = 60)]
fn hmr_updates_small_5(bencher: divan::Bencher) {
    let setup = setup_everything(100);

    bencher.with_inputs(|| setup.clone()).bench_values(|setup| {
        setup.clone().rt.block_on(async move {
            setup.clone().tt.run_once(Box::pin(async move {
                let _ = setup
                    .benchmark
                    .benchmark_initial_compilation()
                    .await
                    .unwrap();
                setup.benchmark.benchmark_hmr_update(5).await.unwrap();
                Ok(())
            }));
        })
    });
}

#[divan::bench(max_time = 60)]
fn hmr_updates_medium_10(bencher: divan::Bencher) {
    let setup = setup_everything(200);

    bencher.with_inputs(|| setup.clone()).bench_values(|setup| {
        setup.clone().rt.block_on(async move {
            setup.clone().tt.run_once(Box::pin(async move {
                let _ = setup
                    .benchmark
                    .benchmark_initial_compilation()
                    .await
                    .unwrap();
                setup.benchmark.benchmark_hmr_update(10).await.unwrap();
                Ok(())
            }));
        })
    });
}

#[divan::bench(max_time = 60)]
fn hmr_updates_large_20(bencher: divan::Bencher) {
    let setup = setup_everything(500);

    bencher.with_inputs(|| setup.clone()).bench_values(|setup| {
        setup.clone().rt.block_on(async move {
            setup.clone().tt.run_once(Box::pin(async move {
                let _ = setup
                    .benchmark
                    .benchmark_initial_compilation()
                    .await
                    .unwrap();
                setup.benchmark.benchmark_hmr_update(20).await.unwrap();
                Ok(())
            }));
        })
    });
}

#[divan::bench(max_time = 60)]
fn hmr_subscription(bencher: divan::Bencher) {
    let setup = setup_everything(100);

    bencher.with_inputs(|| setup.clone()).bench_values(|setup| {
        setup.clone().rt.block_on(async move {
            setup.clone().tt.run_once(Box::pin(async move {
                let _ = setup
                    .benchmark
                    .benchmark_initial_compilation()
                    .await
                    .unwrap();
                setup.benchmark.benchmark_hmr_subscription().await.unwrap();
                Ok(())
            }));
        })
    });
}

fn main() {
    divan::main();
}
