use std::{pin::Pin, sync::Mutex};

use anyhow::{bail, Result};
use futures::{prelude::*, Stream};
use tokio::sync::mpsc::Sender;
use tokio_stream::wrappers::ReceiverStream;
use turbo_tasks::{get_invalidator, CollectiblesSource, Invalidator, TransientInstance};
use turbopack_core::{
    issue::{CapturedIssuesReadRef, IssueVc, PlainIssueReadRef},
    version::{NotFoundVersionVc, PartialUpdate, TotalUpdate, Update, UpdateReadRef, VersionVc},
};

use crate::source::{ContentSourceResult, ContentSourceResultVc};

async fn peek_issues<T: CollectiblesSource + Copy>(source: T) -> Result<CapturedIssuesReadRef> {
    IssueVc::peek_issues_with_path(source).await?.await
}

#[turbo_tasks::function]
fn get_content_wrapper(
    get_content: TransientInstance<Box<dyn Fn() -> ContentSourceResultVc + Send + Sync>>,
) -> ContentSourceResultVc {
    get_content()
}

#[turbo_tasks::function]
async fn get_update_stream_item(
    from: VersionStateVc,
    get_content: TransientInstance<Box<dyn Fn() -> ContentSourceResultVc + Send + Sync>>,
) -> Result<UpdateStreamItemVc> {
    let content = get_content_wrapper(get_content);

    match *content.await? {
        ContentSourceResult::NotFound => {
            let issues = peek_issues(content).await?;
            let update = if issues.is_empty() {
                // Client requested a non-existing asset
                // It might be removed in meantime, reload client
                // TODO add special instructions for removed assets to handled it in a better
                // way
                Update::Total(TotalUpdate {
                    to: NotFoundVersionVc::new().into(),
                })
                .cell()
            } else {
                Update::None.cell()
            };
            Ok(UpdateStreamItem {
                update: update.await?,
                issues: issues.get_plain_issues().await?,
            }
            .cell())
        }
        ContentSourceResult::Static(content) => {
            let from = from.get();
            let update = content.update(from);
            let issues = peek_issues(update).await?;
            let update = update.await?;

            let issues = if issues.is_empty() {
                peek_issues(content).await?
            } else {
                issues
            };

            Ok(UpdateStreamItem {
                update,
                issues: issues.get_plain_issues().await?,
            }
            .cell())
        }
        ContentSourceResult::NeedData { .. } => {
            todo!()
        }
    }
}

#[turbo_tasks::function]
async fn compute_update_stream(
    from: VersionStateVc,
    get_content: TransientInstance<Box<dyn Fn() -> ContentSourceResultVc + Send + Sync>>,
    sender: TransientInstance<Sender<UpdateStreamItemReadRef>>,
) -> Result<()> {
    let item = get_update_stream_item(from, get_content)
        .strongly_consistent()
        .await?;

    if sender.send(item).await.is_err() {
        bail!("channel closed");
    }

    Ok(())
}

#[turbo_tasks::value(serialization = "none", eq = "manual", cell = "new")]
struct VersionState {
    #[turbo_tasks(debug_ignore)]
    inner: Mutex<(VersionVc, Option<Invalidator>)>,
}

#[turbo_tasks::value_impl]
impl VersionStateVc {
    #[turbo_tasks::function]
    async fn get(self) -> Result<VersionVc> {
        let this = self.await?;
        let mut lock = this.inner.lock().unwrap();
        lock.1 = Some(get_invalidator());
        Ok(lock.0)
    }
}

impl VersionStateVc {
    async fn new(inner: VersionVc) -> Result<Self> {
        let inner = inner.cell_local().await?;
        Ok(Self::cell(VersionState {
            inner: Mutex::new((inner, None)),
        }))
    }

    async fn set(&self, new_inner: VersionVc) -> Result<()> {
        let this = self.await?;
        let new_inner = new_inner.cell_local().await?;
        let mut lock = this.inner.lock().unwrap();
        if let (_, Some(invalidator)) = std::mem::replace(&mut *lock, (new_inner, None)) {
            invalidator.invalidate();
        }
        Ok(())
    }
}

pub(super) struct UpdateStream(Pin<Box<dyn Stream<Item = UpdateStreamItemReadRef> + Send + Sync>>);

impl UpdateStream {
    pub async fn new(
        get_content: TransientInstance<Box<dyn Fn() -> ContentSourceResultVc + Send + Sync>>,
    ) -> Result<UpdateStream> {
        let (sx, rx) = tokio::sync::mpsc::channel(32);

        let version = match &*get_content().await? {
            ContentSourceResult::NotFound => NotFoundVersionVc::new().into(),
            ContentSourceResult::Static(content) => content.version(),
            ContentSourceResult::NeedData { .. } => {
                todo!()
            }
        };
        let version_state = VersionStateVc::new(version).await?;

        compute_update_stream(version_state, get_content, TransientInstance::new(sx));

        let mut last_had_issues = false;

        let stream = ReceiverStream::new(rx).filter_map(move |update| {
            let has_issues = !update.issues.is_empty();
            let issues_changed = has_issues != last_had_issues;
            last_had_issues = has_issues;

            async move {
                match &*update.update {
                    Update::Partial(PartialUpdate { to, .. })
                    | Update::Total(TotalUpdate { to }) => {
                        version_state
                            .set(*to)
                            .await
                            .expect("failed to update version");

                        Some(update)
                    }
                    // Do not propagate empty updates.
                    Update::None => {
                        if has_issues || issues_changed {
                            Some(update)
                        } else {
                            None
                        }
                    }
                }
            }
        });

        Ok(UpdateStream(Box::pin(stream)))
    }
}

impl Stream for UpdateStream {
    type Item = UpdateStreamItemReadRef;

    fn poll_next(
        self: Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        Pin::new(&mut self.get_mut().0).poll_next(cx)
    }
}

#[turbo_tasks::value(serialization = "none")]
pub struct UpdateStreamItem {
    pub update: UpdateReadRef,
    pub issues: Vec<PlainIssueReadRef>,
}
