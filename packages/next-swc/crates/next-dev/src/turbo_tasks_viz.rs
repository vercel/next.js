use std::{sync::Arc, time::Duration};

use anyhow::Result;
use mime::TEXT_HTML_UTF_8;
use turbo_tasks::{get_invalidator, TurboTasks, TurboTasksBackendApi, Value};
use turbo_tasks_fs::File;
use turbo_tasks_memory::{
    stats::{ReferenceType, Stats},
    viz, MemoryBackend,
};
use turbopack_core::asset::AssetContentVc;
use turbopack_dev_server::source::{
    ContentSource, ContentSourceContent, ContentSourceData, ContentSourceDataFilter,
    ContentSourceDataVary, ContentSourceResultVc, ContentSourceVc,
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
                let graph = viz::graph::visualize_stats_tree(
                    tree,
                    ReferenceType::Dependency,
                    tt.stats_type(),
                );
                viz::graph::wrap_html(&graph)
            }
            "call-graph" => {
                let mut stats = Stats::new();
                let b = tt.backend();
                b.with_all_cached_tasks(|task| {
                    stats.add_id(b, task);
                });
                let tree = stats.treeify(ReferenceType::Child);
                let graph =
                    viz::graph::visualize_stats_tree(tree, ReferenceType::Child, tt.stats_type());
                viz::graph::wrap_html(&graph)
            }
            "table" => {
                if let Some(query) = &data.query {
                    let mut stats = Stats::new();
                    let b = tt.backend();
                    let active_only = query.contains_key("active");
                    b.with_all_cached_tasks(|task| {
                        stats.add_id_conditional(b, task, |_, info| {
                            (!active_only || info.active)
                                && info
                                    .executions
                                    .map(|executions| executions > 0)
                                    .unwrap_or(true)
                        });
                    });
                    let tree = stats.treeify(ReferenceType::Dependency);
                    let table = viz::table::create_table(tree, tt.stats_type());
                    viz::table::wrap_html(&table)
                } else {
                    return Ok(ContentSourceResultVc::exact(
                        ContentSourceContent::NeedData {
                            source: self_vc.into(),
                            path: path.to_string(),
                            vary: ContentSourceDataVary {
                                query: Some(ContentSourceDataFilter::Subset(
                                    ["active".to_string()].into(),
                                )),
                                ..Default::default()
                            },
                        }
                        .cell(),
                    ));
                }
            }
            "reset" => {
                let b = tt.backend();
                b.with_all_cached_tasks(|task| {
                    b.with_task(task, |task| task.reset_stats());
                });
                "Done".to_string()
            }
            _ => return Ok(ContentSourceResultVc::not_found()),
        };
        Ok(ContentSourceResultVc::exact(
            ContentSourceContent::Static(
                AssetContentVc::from(File::from(html).with_content_type(TEXT_HTML_UTF_8)).into(),
            )
            .cell(),
        ))
    }
}
