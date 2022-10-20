use std::{pin::Pin, sync::Mutex};

use anyhow::{bail, Result};
use futures::{prelude::*, Stream};
use tokio::sync::mpsc::Sender;
use tokio_stream::wrappers::ReceiverStream;
use turbo_tasks::{get_invalidator, CollectiblesSource, Invalidator, TransientInstance};
use turbopack_core::{
    issue::{CapturedIssuesReadRef, IssueVc},
    version::{PartialUpdate, TotalUpdate, Update, UpdateReadRef, VersionVc, VersionedContentVc},
};

#[turbo_tasks::value(transparent)]
struct UnresolvedVersionedContent(VersionedContentVc);

async fn peek_issues<T: CollectiblesSource + Copy>(source: T) -> Result<CapturedIssuesReadRef> {
    IssueVc::peek_issues_with_path(source).await?.await
}

#[turbo_tasks::function]
async fn get_update_stream_item(
    from: VersionStateVc,
    content: UnresolvedVersionedContentVc,
) -> Result<UpdateStreamItemVc> {
    let content = *content.await?;
    let from = from.get();
    let update = content.update(from);
    let issues = peek_issues(update).await?;
    let update = update.await?;

    let issues = if issues.is_empty() {
        peek_issues(content).await?
    } else {
        issues
    };

    Ok(UpdateStreamItem { update, issues }.cell())
}

#[turbo_tasks::function]
async fn compute_update_stream(
    from: VersionStateVc,
    content: UnresolvedVersionedContentVc,
    sender: TransientInstance<Sender<UpdateStreamItemReadRef>>,
) -> Result<()> {
    let item = get_update_stream_item(from, content)
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
    pub async fn new(content: VersionedContentVc) -> Result<UpdateStream> {
        let (sx, rx) = tokio::sync::mpsc::channel(32);

        let version_state = VersionStateVc::new(content.version()).await?;

        compute_update_stream(
            version_state,
            UnresolvedVersionedContentVc::cell(content),
            TransientInstance::new(sx),
        );

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

#[turbo_tasks::value]
pub struct UpdateStreamItem {
    pub update: UpdateReadRef,
    pub issues: CapturedIssuesReadRef,
}
