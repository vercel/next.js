use std::pin::Pin;

use anyhow::Result;
use futures::prelude::*;
use tokio::sync::mpsc::Sender;
use tokio_stream::wrappers::ReceiverStream;
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    IntoTraitRef, NonLocalValue, OperationVc, ReadRef, ResolvedVc, TransientInstance, Vc,
    trace::{TraceRawVcs, TraceRawVcsContext},
};
use turbo_tasks_fs::{FileSystem, FileSystemPath};
use turbopack_core::{
    error::PrettyPrintError,
    issue::{
        CollectibleIssuesExt, Issue, IssueSeverity, IssueStage, OptionStyledString, PlainIssue,
        StyledString,
    },
    server_fs::ServerFileSystem,
    version::{
        NotFoundVersion, PartialUpdate, TotalUpdate, Update, Version, VersionState,
        VersionedContent,
    },
};

use crate::source::{ProxyResult, resolve::ResolveSourceRequestResult};

struct TypedGetContentFn<C> {
    capture: C,
    func: for<'a> fn(&'a C) -> OperationVc<ResolveSourceRequestResult>,
}

// Manual (non-derive) impl required due to: https://github.com/rust-lang/rust/issues/70263
// Safety: `capture` is `NonLocalValue`, `func` stores no data (is a static pointer to code)
unsafe impl<C: NonLocalValue> NonLocalValue for TypedGetContentFn<C> {}

// Manual (non-derive) impl required due to: https://github.com/rust-lang/rust/issues/70263
impl<C: TraceRawVcs> TraceRawVcs for TypedGetContentFn<C> {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        self.capture.trace_raw_vcs(trace_context);
    }
}

trait TypedGetContentFnTrait: NonLocalValue + TraceRawVcs {
    fn call(&self) -> OperationVc<ResolveSourceRequestResult>;
}

impl<C> TypedGetContentFnTrait for TypedGetContentFn<C>
where
    C: NonLocalValue + TraceRawVcs,
{
    fn call(&self) -> OperationVc<ResolveSourceRequestResult> {
        (self.func)(&self.capture)
    }
}

/// A wrapper type returning [`OperationVc<ResolveSourceRequestResult>`][ResolveSourceRequestResult]
/// that implements [`NonLocalValue`] and [`TraceRawVcs`].
///
/// The capture (e.g. moved values in a closure) and function pointer are stored separately to allow
/// safe implementation of these desired traits.
#[derive(NonLocalValue, TraceRawVcs)]
pub struct GetContentFn {
    inner: Box<dyn TypedGetContentFnTrait + Send + Sync>,
}

impl GetContentFn {
    /// Wrap a function and an optional capture variable (used to simulate a closure) in
    /// `GetContentFn`.
    pub fn new<C>(
        capture: C,
        func: for<'a> fn(&'a C) -> OperationVc<ResolveSourceRequestResult>,
    ) -> Self
    where
        C: NonLocalValue + TraceRawVcs + Send + Sync + 'static,
    {
        Self {
            inner: Box::new(TypedGetContentFn { capture, func }),
        }
    }
}

impl GetContentFn {
    fn call(&self) -> OperationVc<ResolveSourceRequestResult> {
        self.inner.call()
    }
}

async fn peek_issues<T: Send>(source: OperationVc<T>) -> Result<Vec<ReadRef<PlainIssue>>> {
    let captured = source.peek_issues();

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
    let content_op = get_content.call();
    let content_result = content_op.read_strongly_consistent().await;
    let mut plain_issues = peek_issues(content_op).await?;

    let content_value = match content_result {
        Ok(content) => content,
        Err(e) => {
            plain_issues.push(
                PlainIssue::from_issue(
                    Vc::upcast(
                        FatalStreamIssue {
                            resource,
                            description: StyledString::Text(
                                format!("{}", PrettyPrintError(&e)).into(),
                            )
                            .resolved_cell(),
                        }
                        .cell(),
                    ),
                    None,
                )
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
            if let Some(from) = Vc::try_resolve_downcast_type::<ProxyResult>(from).await?
                && from.await? == proxy_result_value
            {
                return Ok(UpdateStreamItem::Found {
                    update: Update::None.cell().await?,
                    issues: plain_issues,
                }
                .cell());
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

#[derive(TraceRawVcs)]
struct ComputeUpdateStreamSender(
    // HACK: `trace_ignore`: It's not correct or safe to send `Vc`s across this mpsc channel, but
    // (without nightly auto traits) there's no easy way for us to statically assert that
    // `UpdateStreamItem` does not contain a `RawVc`.
    //
    // It could be safe (at least for the GC use-case) if we had some way of wrapping arbitrary
    // objects in a GC root container.
    #[turbo_tasks(trace_ignore)] Sender<Result<ReadRef<UpdateStreamItem>>>,
);

/// This function sends an [`UpdateStreamItem`] to `sender` every time it gets recomputed by
/// turbo-tasks due to invalidation.
#[turbo_tasks::function]
async fn compute_update_stream(
    resource: RcStr,
    from: ResolvedVc<VersionState>,
    get_content: TransientInstance<GetContentFn>,
    sender: TransientInstance<ComputeUpdateStreamSender>,
) -> Vc<()> {
    let item = get_update_stream_item_operation(resource, from, get_content)
        .read_strongly_consistent()
        .await;

    // Send update. Ignore channel closed error.
    let _ = sender.0.send(item).await;

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

        let content = get_content.call();
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
            TransientInstance::new(ComputeUpdateStreamSender(sx)),
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
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Fatal
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Other(rcstr!("websocket")).cell()
    }

    #[turbo_tasks::function]
    async fn file_path(&self) -> Result<Vc<FileSystemPath>> {
        Ok(ServerFileSystem::new()
            .root()
            .await?
            .join(&self.resource)?
            .cell())
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text(rcstr!("Fatal error while getting content to stream")).cell()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(self.description))
    }
}

#[cfg(test)]
pub mod test {
    use std::sync::{
        Arc,
        atomic::{AtomicI32, Ordering},
    };

    use turbo_tasks::TurboTasks;
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

    use super::*;

    #[turbo_tasks::function(operation)]
    pub fn noop_operation() -> Vc<ResolveSourceRequestResult> {
        ResolveSourceRequestResult::NotFound.cell()
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_get_content_fn() {
        let tt = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async move {
            let number = Arc::new(AtomicI32::new(0));
            fn func(number: &Arc<AtomicI32>) -> OperationVc<ResolveSourceRequestResult> {
                number.store(42, Ordering::SeqCst);
                noop_operation()
            }
            let wrapped_func = GetContentFn::new(number.clone(), func);
            let return_value = wrapped_func
                .call()
                .read_strongly_consistent()
                .await
                .unwrap();
            assert_eq!(number.load(Ordering::SeqCst), 42);
            // ResolveSourceRequestResult doesn't impl Debug
            assert!(*return_value == ResolveSourceRequestResult::NotFound);
            Ok(())
        })
        .await
        .unwrap();
    }
}
