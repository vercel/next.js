use std::{pin::Pin, sync::Mutex};

use anyhow::Result;
use futures::{stream::unfold, Stream};
use tokio::sync::mpsc::Sender;
use turbo_tasks::{get_invalidator, Invalidator, TransientInstance};
use turbopack_core::version::{
    PartialUpdate, TotalUpdate, Update, UpdateReadRef, VersionVc, VersionedContentVc,
};

#[turbo_tasks::value(transparent)]
struct UnresolvedVersionedContent(VersionedContentVc);

#[turbo_tasks::function]
async fn compute_update_stream(
    from: VersionStateVc,
    content: UnresolvedVersionedContentVc,
    sender: TransientInstance<Sender<UpdateReadRef>>,
) -> Result<()> {
    let update = content
        .strongly_consistent()
        .await?
        .update(from.get().resolve_strongly_consistent().await?);
    sender.send(update.strongly_consistent().await?).await?;
    Ok(())
}

#[turbo_tasks::value(serialization = "none", eq = "manual", cell = "new")]
struct VersionState {
    #[turbo_tasks(debug_ignore)]
    inner: Mutex<(VersionVc, Option<Invalidator>)>,
    id: VersionStateId,
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

#[turbo_tasks::value(transparent, serialization = "auto_for_input")]
#[derive(Debug, PartialOrd, Ord, Hash, Clone)]
struct VersionStateId(String);

impl VersionStateVc {
    async fn new(inner: VersionVc, id: &str) -> Result<Self> {
        let id = VersionStateId(id.to_string());
        let inner = inner.keyed_cell_local(id.clone()).await?;
        Ok(Self::cell(VersionState {
            inner: Mutex::new((inner, None)),
            id,
        }))
    }

    async fn set(&self, new_inner: VersionVc) -> Result<()> {
        let this = self.await?;
        let new_inner = new_inner.keyed_cell_local(this.id.clone()).await?;
        let mut lock = this.inner.lock().unwrap();
        if let (_, Some(invalidator)) = std::mem::replace(&mut *lock, (new_inner, None)) {
            invalidator.invalidate();
        }
        Ok(())
    }
}

pub(super) struct UpdateStream {
    id: String,
    stream: Pin<Box<dyn Stream<Item = UpdateReadRef> + Send + Sync>>,
}

impl UpdateStream {
    pub async fn new(id: String, content: VersionedContentVc) -> Result<UpdateStream> {
        let (sx, rx) = tokio::sync::mpsc::channel(32);

        let version_state = VersionStateVc::new(content.version(), &id).await?;

        compute_update_stream(
            version_state,
            UnresolvedVersionedContentVc::cell(content),
            TransientInstance::new(sx),
        );

        Ok(UpdateStream {
            id,
            stream: Box::pin(unfold(
                (rx, version_state),
                |(mut rx, version_state)| async move {
                    loop {
                        let update = rx.recv().await.expect("failed to receive update");
                        match &*update {
                            Update::Partial(PartialUpdate { to, .. })
                            | Update::Total(TotalUpdate { to }) => {
                                version_state
                                    .set(*to)
                                    .await
                                    .expect("failed to update version");
                                return Some((update, (rx, version_state)));
                            }
                            // Do not propagate empty updates.
                            Update::None => {
                                continue;
                            }
                        }
                    }
                },
            )),
        })
    }

    pub fn id(&self) -> &str {
        &self.id
    }
}

impl Stream for UpdateStream {
    type Item = UpdateReadRef;

    fn poll_next(
        self: Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        Pin::new(&mut self.get_mut().stream).poll_next(cx)
    }
}
