use std::{ops::Deref, pin::Pin};

use anyhow::Result;
use futures::prelude::*;
use tokio::sync::mpsc::Sender;
use tokio_stream::wrappers::ReceiverStream;
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    IntoTraitRef, NonLocalValue, OperationVc, ReadRef, ResolvedVc, TransientInstance, Vc,
};
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

/// A wrapper type returning
/// [`OperationVc<ResolveSourceRequestResult>`][ResolveSourceRequestResult] that implements
/// [`NonLocalValue`].
pub struct GetContentFn(Box<dyn Fn() -> OperationVc<ResolveSourceRequestResult> + Send + Sync>);

impl GetContentFn {
    /// Wrap a function in `GetContentFn`.
    ///
    /// # Safety
    ///
    /// The closure must not include any types that aren't `NonLocalValue`, or that couldn't
    /// otherwise safely implement `NonLocalValue`.
    ///
    /// In the future, `auto_traits` may be be able to implement `NonLocalValue` for us, and avoid
    /// this wrapper type and unsafe constructor.
    pub unsafe fn new(
        func: impl Fn() -> OperationVc<ResolveSourceRequestResult> + Send + Sync + 'static,
    ) -> Self {
        Self::new_boxed(Box::new(func))
    }

    /// Wrap a boxed function in `GetContentFn`. This specialized version of [`GetContentFn::new`]
    /// avoids double-boxing if you already have a boxed function.
    ///
    /// # Safety
    ///
    /// Same as [`GetContentFn::new`].
    pub unsafe fn new_boxed(
        func: Box<dyn Fn() -> OperationVc<ResolveSourceRequestResult> + Send + Sync>,
    ) -> Self {
        Self(func)
    }
}

// Safety: It's up to the caller of `GetContentFn::new` to ensure this.
unsafe impl NonLocalValue for GetContentFn {}

impl Deref for GetContentFn {
    type Target = Box<dyn Fn() -> OperationVc<ResolveSourceRequestResult> + Send + Sync>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

async fn peek_issues<T: Send>(source: OperationVc<T>) -> Result<Vec<ReadRef<PlainIssue>>> {
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

#[turbo_tasks::function(operation)]
fn versioned_content_update_operation(
    content: ResolvedVc<Box<dyn VersionedContent>>,
    from: ResolvedVc<Box<dyn Version>>,
) -> Vc<Update> {
    content.update(*from)
}

#[turbo_tasks::function(operation)]
async fn get_update_stream_item_operation(
    resource: RcStr,
    from: ResolvedVc<VersionState>,
    get_content: TransientInstance<GetContentFn>,
) -> Result<Vc<UpdateStreamItem>> {
    let content_op = get_content();
    let content_result = content_op.read_strongly_consistent().await;
    let mut plain_issues = peek_issues(content_op).await?;

    let content_value = match content_result {
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
            let from = from.get().to_resolved().await?;
            let update_op = versioned_content_update_operation(resolved_content, from);

            extend_issues(&mut plain_issues, peek_issues(update_op).await?);

            Ok(UpdateStreamItem::Found {
                update: update_op.connect().await?,
                issues: plain_issues,
            }
            .cell())
        }
        ResolveSourceRequestResult::HttpProxy(proxy_result_op) => {
            let proxy_result_vc = proxy_result_op.connect();
            let proxy_result_value = proxy_result_vc.await?;

            if proxy_result_value.status == 404 {
                return Ok(UpdateStreamItem::NotFound.cell());
            }

            extend_issues(&mut plain_issues, peek_issues(proxy_result_op).await?);

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
                    to: Vc::upcast::<Box<dyn Version>>(proxy_result_vc)
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
    from: ResolvedVc<VersionState>,
    get_content: TransientInstance<GetContentFn>,
    sender: TransientInstance<Sender<Result<ReadRef<UpdateStreamItem>>>>,
) -> Vc<()> {
    let item = get_update_stream_item_operation(resource, from, get_content)
        .read_strongly_consistent()
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
        let version = match *content.connect().await? {
            ResolveSourceRequestResult::Static(static_content, _) => {
                static_content.await?.content.version()
            }
            ResolveSourceRequestResult::HttpProxy(proxy_result) => {
                Vc::upcast(proxy_result.connect())
            }
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
