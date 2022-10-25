use std::{pin::Pin, sync::Mutex};

use anyhow::{bail, Result};
use futures::{prelude::*, Stream};
use tokio::sync::mpsc::Sender;
use tokio_stream::wrappers::ReceiverStream;
use turbo_tasks::{get_invalidator, CollectiblesSource, Invalidator, TransientInstance, Value};
use turbopack_core::{
    issue::{IssueVc, PlainIssueReadRef},
    version::{
        NotFoundVersionVc, PartialUpdate, TotalUpdate, Update, UpdateReadRef, VersionVc,
        VersionedContentVc,
    },
};

use super::protocol::ResourceIdentifier;
use crate::{
    resource_to_data,
    source::{ContentSourceResult, ContentSourceResultVc},
};

type GetContentFn = Box<dyn Fn() -> ContentSourceResultVc + Send + Sync>;

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
async fn get_content_wrapper(
    resource: Value<ResourceIdentifier>,
    get_content: TransientInstance<GetContentFn>,
) -> Result<ContentSourceResultVc> {
    let mut content = get_content();
    while let ContentSourceResult::NeedData { source, path, vary } = &*content.await? {
        content = source.get(
            path,
            Value::new(resource_to_data(resource.clone().into_value(), vary)),
        );
    }
    Ok(content)
}

async fn resolve_static_content(
    content_source_result: ContentSourceResultVc,
) -> Result<Option<VersionedContentVc>> {
    Ok(match *content_source_result.await? {
        ContentSourceResult::NotFound => None,
        ContentSourceResult::HttpProxy(_) => {
            panic!("HTTP proxying is not supported in UpdateStream")
        }
        ContentSourceResult::Static(content) => Some(content),
        ContentSourceResult::NeedData { .. } => {
            bail!("this might only happen temporary as get_content_wrapper resolves the data")
        }
    })
}

#[turbo_tasks::function]
async fn get_update_stream_item(
    from: VersionStateVc,
    resource: Value<ResourceIdentifier>,
    get_content: TransientInstance<GetContentFn>,
) -> Result<UpdateStreamItemVc> {
    let content = get_content_wrapper(resource, get_content);

    match resolve_static_content(content).await? {
        None => {
            let plain_issues = peek_issues(content).await?;

            let update = if plain_issues.is_empty() {
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
                issues: plain_issues,
            }
            .cell())
        }
        Some(resolved_content) => {
            let from = from.get();
            let update = resolved_content.update(from);

            let mut plain_issues = peek_issues(update).await?;
            extend_issues(&mut plain_issues, peek_issues(content).await?);

            Ok(UpdateStreamItem {
                update: update.await?,
                issues: plain_issues,
            }
            .cell())
        }
    }
}

#[turbo_tasks::function]
async fn compute_update_stream(
    from: VersionStateVc,
    resource: Value<ResourceIdentifier>,
    get_content: TransientInstance<GetContentFn>,
    sender: TransientInstance<Sender<UpdateStreamItemReadRef>>,
) -> Result<()> {
    let item = get_update_stream_item(from, resource, get_content)
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
        resource: ResourceIdentifier,
        get_content: TransientInstance<GetContentFn>,
    ) -> Result<UpdateStream> {
        let (sx, rx) = tokio::sync::mpsc::channel(32);

        let content = get_content_wrapper(Value::new(resource.clone()), get_content.clone());
        // We can ignore issues reported in content here since [compute_update_stream]
        // will handle them
        let version = match resolve_static_content(content).await? {
            Some(content) => content.version(),
            None => NotFoundVersionVc::new().into(),
        };
        let version_state = VersionStateVc::new(version).await?;

        compute_update_stream(
            version_state,
            Value::new(resource),
            get_content,
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

#[turbo_tasks::value(serialization = "none")]
pub struct UpdateStreamItem {
    pub update: UpdateReadRef,
    pub issues: Vec<PlainIssueReadRef>,
}
