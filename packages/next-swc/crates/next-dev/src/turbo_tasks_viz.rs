use std::{str::FromStr, sync::Arc, time::Duration};

use anyhow::Result;
use mime::Mime;
use turbo_tasks::{get_invalidator, TurboTasks, Value};
use turbo_tasks_fs::File;
use turbo_tasks_memory::{
    stats::{ReferenceType, Stats},
    viz, MemoryBackend,
};
use turbopack_core::asset::AssetContentVc;
use turbopack_dev_server::source::{
    ContentSource, ContentSourceData, ContentSourceResult, ContentSourceResultVc, ContentSourceVc,
};

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

const INVALIDATION_INTERVAL: Duration = Duration::from_secs(3);

#[turbo_tasks::value_impl]
impl ContentSource for TurboTasksSource {
    #[turbo_tasks::function]
    fn get(&self, path: &str, _data: Value<ContentSourceData>) -> Result<ContentSourceResultVc> {
        let tt = &self.turbo_tasks;
        let invalidator = get_invalidator();
        tokio::spawn({
            async move {
                tokio::time::sleep(INVALIDATION_INTERVAL).await;
                invalidator.invalidate();
            }
        });
        let html = match path {
            "graph" => {
                let mut stats = Stats::new();
                let b = tt.backend();
                b.with_all_cached_tasks(|task| {
                    stats.add_id(b, task);
                });
                let tree = stats.treeify(ReferenceType::Dependency);
                let graph = viz::graph::visualize_stats_tree(tree, ReferenceType::Dependency);
                viz::graph::wrap_html(&graph)
            }
            "call-graph" => {
                let mut stats = Stats::new();
                let b = tt.backend();
                b.with_all_cached_tasks(|task| {
                    stats.add_id(b, task);
                });
                let tree = stats.treeify(ReferenceType::Child);
                let graph = viz::graph::visualize_stats_tree(tree, ReferenceType::Child);
                viz::graph::wrap_html(&graph)
            }
            "table" => {
                let mut stats = Stats::new();
                let b = tt.backend();
                b.with_all_cached_tasks(|task| {
                    stats.add_id(b, task);
                });
                let tree = stats.treeify(ReferenceType::Dependency);
                let table = viz::table::create_table(tree);
                viz::table::wrap_html(&table)
            }
            "reset" => {
                let b = tt.backend();
                b.with_all_cached_tasks(|task| {
                    b.with_task(task, |task| task.reset_stats());
                });
                "Done".to_string()
            }
            _ => return Ok(ContentSourceResult::NotFound.cell()),
        };
        Ok(ContentSourceResult::Static(
            AssetContentVc::from(File::from(html).with_content_type(Mime::from_str("text/html")?))
                .into(),
        )
        .cell())
    }
}
