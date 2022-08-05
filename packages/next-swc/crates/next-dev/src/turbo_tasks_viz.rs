use std::{str::FromStr, sync::Arc};

use anyhow::Result;
use mime::Mime;
use turbo_tasks::TurboTasks;
use turbo_tasks_fs::{File, FileContent, FileContentVc};
use turbo_tasks_memory::{stats::Stats, viz, MemoryBackend};
use turbopack_dev_server::source::{ContentSource, ContentSourceVc};

#[turbo_tasks::value(serialization = "none", eq = "manual", cell = "new", into = "new")]
pub struct TurboTasksSource {
    #[turbo_tasks(debug_ignore, trace_ignore)]
    pub turbo_tasks: Arc<TurboTasks<MemoryBackend>>,
}

impl TurboTasksSourceVc {
    pub fn new(turbo_tasks: Arc<TurboTasks<MemoryBackend>>) -> Self {
        Self::cell(TurboTasksSource { turbo_tasks })
    }
}

#[turbo_tasks::value_impl]
impl ContentSource for TurboTasksSource {
    #[turbo_tasks::function]
    fn get(&self, path: &str) -> Result<FileContentVc> {
        let tt = &self.turbo_tasks;
        if path == "graph" {
            let mut stats = Stats::new();
            let b = tt.backend();
            b.with_all_cached_tasks(|task| {
                stats.add_id(b, task);
            });
            let tree = stats.treeify();
            let graph = viz::graph::visualize_stats_tree(tree);
            return Ok(FileContent::Content(
                File::from_source(viz::graph::wrap_html(&graph))
                    .with_content_type(Mime::from_str("text/html")?),
            )
            .into());
        }
        if path == "table" {
            let mut stats = Stats::new();
            let b = tt.backend();
            b.with_all_cached_tasks(|task| {
                stats.add_id(b, task);
            });
            let tree = stats.treeify();
            let table = viz::table::create_table(tree);
            return Ok(FileContent::Content(
                File::from_source(viz::table::wrap_html(&table))
                    .with_content_type(Mime::from_str("text/html")?),
            )
            .into());
        }
        Ok(FileContent::NotFound.into())
    }

    #[turbo_tasks::function]
    fn get_by_id(&self, _id: &str) -> FileContentVc {
        FileContent::NotFound.into()
    }
}
