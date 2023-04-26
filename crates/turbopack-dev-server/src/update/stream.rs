use std::pin::Pin;

use anyhow::Result;
use futures::{prelude::*, Stream};
use tokio::sync::mpsc::Sender;
use tokio_stream::wrappers::ReceiverStream;
use turbo_tasks::{
    primitives::StringVc, CollectiblesSource, IntoTraitRef, State, TraitRef, TransientInstance,
};
use turbo_tasks_fs::{FileSystem, FileSystemPathVc};
use turbopack_core::{
    error::PrettyPrintError,
    issue::{
        Issue, IssueSeverity, IssueSeverityVc, IssueVc, OptionIssueProcessingPathItemsVc,
        PlainIssueReadRef,
    },
    server_fs::ServerFileSystemVc,
    version::{
        NotFoundVersionVc, PartialUpdate, TotalUpdate, Update, UpdateReadRef, VersionVc,
        VersionedContent,
    },
};

use crate::source::{
    resolve::{ResolveSourceRequestResult, ResolveSourceRequestResultVc},
    ProxyResultVc,
};

type GetContentFn = Box<dyn Fn() -> ResolveSourceRequestResultVc + Send + Sync>;

async fn peek_issues<T: CollectiblesSource + Copy>(source: T) -> Result<Vec<PlainIssueReadRef>> {
    let captured = IssueVc::peek_issues_with_path(source).await?.await?;

    captured.get_plain_issues().await
}

fn extend_issues(issues: &mut Vec<PlainIssueReadRef>, new_issues: Vec<PlainIssueReadRef>) {
    for issue in new_issues {
        if issues.contains(&issue) {
            continue;
        }

        issues.push(issue);
    }
}

#[turbo_tasks::function]
async fn get_update_stream_item(
    resource: &str,
    from: VersionStateVc,
    get_content: TransientInstance<GetContentFn>,
) -> Result<UpdateStreamItemVc> {
    let content = get_content();
    let mut plain_issues = peek_issues(content).await?;

    let content_value = match content.await {
        Ok(content) => content,
        Err(e) => {
            plain_issues.push(
                FatalStreamIssue {
                    resource: resource.to_string(),
                    description: StringVc::cell(format!("{}", PrettyPrintError(&e))),
                }
                .cell()
                .as_issue()
                .into_plain(OptionIssueProcessingPathItemsVc::none())
                .await?,
            );

            let update = Update::Total(TotalUpdate {
                to: NotFoundVersionVc::new()
                    .as_version()
                    .into_trait_ref()
                    .await?,
            })
            .cell();
            return Ok(UpdateStreamItem::Found {
                update: update.await?,
                issues: plain_issues,
            }
            .cell());
        }
    };

    match *content_value {
        ResolveSourceRequestResult::Static(static_content_vc, _) => {
            let static_content = static_content_vc.await?;

            // This can happen when a chunk is removed from the asset graph.
            if static_content.status_code == 404 {
                return Ok(UpdateStreamItem::NotFound.cell());
            }

            let resolved_content = static_content.content;
            let from = from.get();
            let update = resolved_content.update(from);

            extend_issues(&mut plain_issues, peek_issues(update).await?);

            let update = update.await?;

            Ok(UpdateStreamItem::Found {
                update,
                issues: plain_issues,
            }
            .cell())
        }
        ResolveSourceRequestResult::HttpProxy(proxy_result) => {
            let proxy_result_value = proxy_result.await?;

            if proxy_result_value.status == 404 {
                return Ok(UpdateStreamItem::NotFound.cell());
            }

            extend_issues(&mut plain_issues, peek_issues(proxy_result).await?);

            let from = from.get();
            if let Some(from) = ProxyResultVc::resolve_from(from).await? {
                if from.await? == proxy_result_value {
                    return Ok(UpdateStreamItem::Found {
                        update: Update::None.cell().await?,
                        issues: plain_issues,
                    }
                    .cell());
                }
            }

            Ok(UpdateStreamItem::Found {
                update: Update::Total(TotalUpdate {
                    to: proxy_result.as_version().into_trait_ref().await?,
                })
                .cell()
                .await?,
                issues: plain_issues,
            }
            .cell())
        }
        _ => {
            let update = if plain_issues.is_empty() {
                // Client requested a non-existing asset
                // It might be removed in meantime, reload client
                // TODO add special instructions for removed assets to handled it in a better
                // way
                Update::Total(TotalUpdate {
                    to: NotFoundVersionVc::new()
                        .as_version()
                        .into_trait_ref()
                        .await?,
                })
                .cell()
            } else {
                Update::None.cell()
            };

            Ok(UpdateStreamItem::Found {
                update: update.await?,
                issues: plain_issues,
            }
            .cell())
        }
    }
}

#[turbo_tasks::function]
async fn compute_update_stream(
    resource: &str,
    from: VersionStateVc,
    get_content: TransientInstance<GetContentFn>,
    sender: TransientInstance<Sender<Result<UpdateStreamItemReadRef>>>,
) {
    let item = get_update_stream_item(resource, from, get_content)
        .strongly_consistent()
        .await;

    // Send update. Ignore channel closed error.
    let _ = sender.send(item).await;
}

#[turbo_tasks::value]
struct VersionState {
    #[turbo_tasks(trace_ignore)]
    version: State<TraitRef<VersionVc>>,
}

#[turbo_tasks::value_impl]
impl VersionStateVc {
    #[turbo_tasks::function]
    async fn get(self) -> Result<VersionVc> {
        let this = self.await?;
        let version = TraitRef::cell(this.version.get().clone());
        Ok(version)
    }
}

impl VersionStateVc {
    async fn new(version: TraitRef<VersionVc>) -> Result<Self> {
        Ok(Self::cell(VersionState {
            version: State::new(version),
        }))
    }

    async fn set(&self, new_version: TraitRef<VersionVc>) -> Result<()> {
        let this = self.await?;
        this.version.set(new_version);
        Ok(())
    }
}

pub(super) struct UpdateStream(
    Pin<Box<dyn Stream<Item = Result<UpdateStreamItemReadRef>> + Send + Sync>>,
);

impl UpdateStream {
    pub async fn new(
        resource: String,
        get_content: TransientInstance<GetContentFn>,
    ) -> Result<UpdateStream> {
        let (sx, rx) = tokio::sync::mpsc::channel(32);

        let content = get_content();
        // We can ignore issues reported in content here since [compute_update_stream]
        // will handle them
        let version = match *content.await? {
            ResolveSourceRequestResult::Static(static_content, _) => {
                static_content.await?.content.version()
            }
            ResolveSourceRequestResult::HttpProxy(proxy_result) => proxy_result.into(),
            _ => NotFoundVersionVc::new().into(),
        };
        let version_state = VersionStateVc::new(version.into_trait_ref().await?).await?;

        compute_update_stream(
            &resource,
            version_state,
            get_content,
            TransientInstance::new(sx),
        );

        let mut last_had_issues = false;

        let stream = ReceiverStream::new(rx).filter_map(move |item| {
            let (has_issues, issues_changed) =
                if let Some(UpdateStreamItem::Found { issues, .. }) = item.as_deref().ok() {
                    let has_issues = !issues.is_empty();
                    let issues_changed = has_issues != last_had_issues;
                    last_had_issues = has_issues;
                    (has_issues, issues_changed)
                } else {
                    (false, false)
                };

            async move {
                match item.as_deref() {
                    Ok(UpdateStreamItem::Found { update, .. }) => {
                        match &**update {
                            Update::Partial(PartialUpdate { to, .. })
                            | Update::Total(TotalUpdate { to }) => {
                                version_state
                                    .set(to.clone())
                                    .await
                                    .expect("failed to update version");

                                Some(item)
                            }
                            // Do not propagate empty updates.
                            Update::None => {
                                if has_issues || issues_changed {
                                    Some(item)
                                } else {
                                    None
                                }
                            }
                        }
                    }
                    _ => {
                        // Propagate other updates
                        Some(item)
                    }
                }
            }
        });

        Ok(UpdateStream(Box::pin(stream)))
    }
}

impl Stream for UpdateStream {
    type Item = Result<UpdateStreamItemReadRef>;

    fn poll_next(
        self: Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        Pin::new(&mut self.get_mut().0).poll_next(cx)
    }
}

#[turbo_tasks::value(serialization = "none")]
#[derive(Debug)]
pub enum UpdateStreamItem {
    NotFound,
    Found {
        update: UpdateReadRef,
        issues: Vec<PlainIssueReadRef>,
    },
}

#[turbo_tasks::value(serialization = "none")]
struct FatalStreamIssue {
    description: StringVc,
    resource: String,
}

#[turbo_tasks::value_impl]
impl Issue for FatalStreamIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> IssueSeverityVc {
        IssueSeverity::Fatal.into()
    }

    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        ServerFileSystemVc::new().root().join(&self.resource)
    }

    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("websocket".to_string())
    }

    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        StringVc::cell("Fatal error while getting content to stream".to_string())
    }

    #[turbo_tasks::function]
    fn description(&self) -> StringVc {
        self.description
    }
}
