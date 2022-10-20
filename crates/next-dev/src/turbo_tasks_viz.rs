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
    ContentSource, ContentSourceData, ContentSourceDataFilter, ContentSourceDataVary,
    ContentSourceResult, ContentSourceResultVc, ContentSourceVc,
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
    async fn get(
        self_vc: TurboTasksSourceVc,
        path: &str,
        data: Value<ContentSourceData>,
    ) -> Result<ContentSourceResultVc> {
        let this = self_vc.await?;
        let tt = &this.turbo_tasks;
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
                if let Some(query) = &data.query {
                    let mut stats = Stats::new();
                    let b = tt.backend();
                    let active_only = query.contains_key("active");
                    b.with_all_cached_tasks(|task| {
                        stats.add_id_conditional(b, task, |_, info| {
                            info.executions > 0 && (!active_only || info.active)
                        });
                    });
                    let tree = stats.treeify(ReferenceType::Dependency);
                    let table = viz::table::create_table(tree);
                    viz::table::wrap_html(&table)
                } else {
                    return Ok(ContentSourceResult::NeedData {
                        source: self_vc.into(),
                        path: path.to_string(),
                        vary: ContentSourceDataVary {
                            query: Some(ContentSourceDataFilter::Subset(
                                ["active".to_string()].into(),
                            )),
                            ..Default::default()
                        },
                    }
                    .cell());
                }
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
