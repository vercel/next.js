use std::pin::Pin;

use anyhow::Result;
use futures::prelude::*;
use tokio::sync::mpsc::Sender;
use tokio_stream::wrappers::ReceiverStream;
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{IntoTraitRef, ReadRef, ResolvedVc, TransientInstance, Vc};
use turbo_tasks_fs::{FileSystem, FileSystemPath};
use turbopack_core::{
    error::PrettyPrintError,
    issue::{
        Issue, IssueDescriptionExt, IssueSeverity, IssueStage, OptionIssueProcessingPathItems,
        OptionStyledString, PlainIssue, StyledString,
    },
    server_fs::ServerFileSystem,
    version::{
        NotFoundVersion, PartialUpdate, TotalUpdate, Update, Version, VersionState,
        VersionedContent,
    },
};

use crate::source::{resolve::ResolveSourceRequestResult, ProxyResult};

type GetContentFn = Box<dyn Fn() -> Vc<ResolveSourceRequestResult> + Send + Sync>;

async fn peek_issues<T: Send>(source: Vc<T>) -> Result<Vec<ReadRef<PlainIssue>>> {
    let captured = source.peek_issues_with_path().await?;

    captured.get_plain_issues().await
}

fn extend_issues(issues: &mut Vec<ReadRef<PlainIssue>>, new_issues: Vec<ReadRef<PlainIssue>>) {
    for issue in new_issues {
        if issues.contains(&issue) {
            continue;
        }

        issues.push(issue);
    }
}

#[turbo_tasks::function]
async fn get_update_stream_item(
    resource: RcStr,
    from: Vc<VersionState>,
    get_content: TransientInstance<GetContentFn>,
) -> Result<Vc<UpdateStreamItem>> {
    let content = get_content();
    let _ = content.resolve_strongly_consistent().await?;
    let mut plain_issues = peek_issues(content).await?;

    let content_value = match content.await {
        Ok(content) => content,
        Err(e) => {
            plain_issues.push(
                FatalStreamIssue {
                    resource,
                    description: StyledString::Text(format!("{}", PrettyPrintError(&e)).into())
                        .resolved_cell(),
                }
                .cell()
                .into_plain(OptionIssueProcessingPathItems::none())
                .await?,
            );

            let update = Update::Total(TotalUpdate {
                to: Vc::upcast::<Box<dyn Version>>(NotFoundVersion::new())
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
            if let Some(from) = Vc::try_resolve_downcast_type::<ProxyResult>(from).await? {
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
                    to: Vc::upcast::<Box<dyn Version>>(proxy_result)
                        .into_trait_ref()
                        .await?,
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
                    to: Vc::upcast::<Box<dyn Version>>(NotFoundVersion::new())
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
    resource: RcStr,
    from: Vc<VersionState>,
    get_content: TransientInstance<GetContentFn>,
    sender: TransientInstance<Sender<Result<ReadRef<UpdateStreamItem>>>>,
) -> Vc<()> {
    let item = get_update_stream_item(resource, from, get_content)
        .strongly_consistent()
        .await;

    // Send update. Ignore channel closed error.
    let _ = sender.send(item).await;

    Default::default()
}

pub(super) struct UpdateStream(
    Pin<Box<dyn Stream<Item = Result<ReadRef<UpdateStreamItem>>> + Send + Sync>>,
);

impl UpdateStream {
    #[tracing::instrument(skip(get_content), name = "UpdateStream::new")]
    pub async fn new(
        resource: RcStr,
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
            ResolveSourceRequestResult::HttpProxy(proxy_result) => Vc::upcast(proxy_result),
            _ => Vc::upcast(NotFoundVersion::new()),
        };
        let version_state = VersionState::new(version.into_trait_ref().await?).await?;

        let _ = compute_update_stream(
            resource,
            version_state,
            get_content,
            TransientInstance::new(sx),
        );

        let mut last_had_issues = false;

        let stream = ReceiverStream::new(rx).filter_map(move |item| {
            {
                let (has_issues, issues_changed) =
                    if let Ok(UpdateStreamItem::Found { issues, .. }) = item.as_deref() {
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
                                Update::None | Update::Missing => {
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
                .in_current_span()
            }
            .in_current_span()
        });

        Ok(UpdateStream(Box::pin(stream)))
    }
}

impl Stream for UpdateStream {
    type Item = Result<ReadRef<UpdateStreamItem>>;

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
        update: ReadRef<Update>,
        issues: Vec<ReadRef<PlainIssue>>,
    },
}

#[turbo_tasks::value(serialization = "none")]
struct FatalStreamIssue {
    description: ResolvedVc<StyledString>,
    resource: RcStr,
}

#[turbo_tasks::value_impl]
impl Issue for FatalStreamIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        IssueSeverity::Fatal.into()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Other("websocket".into()).cell()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        ServerFileSystem::new().root().join(self.resource.clone())
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text("Fatal error while getting content to stream".into()).cell()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(self.description))
    }
}
