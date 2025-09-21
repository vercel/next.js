use std::{ops::Deref, pin::Pin, sync::Arc};

use anyhow::Result;
use async_trait::async_trait;
use futures::prelude::*;
use tokio::sync::mpsc::Sender;
use tokio_stream::wrappers::ReceiverStream;
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxIndexMap, NonLocalValue, OperationValue, OperationVc, PrettyPrintError, ReadRef, ResolvedVc,
    State, TraitRef, TransientInstance, TryFlatJoinIterExt, TryJoinIterExt, ValueToString, Vc,
    trace::TraceRawVcs,
};
use turbo_tasks_fs::{FileSystem, FileSystemPath};
use turbopack_core::{
    asset::Asset,
    issue::{
        CollectibleIssuesExt, Issue, IssueFilter, IssueSeverity, IssueStage, PlainIssue,
        StyledString,
    },
    output::{OutputAsset, OutputAssets},
    server_fs::ServerFileSystem,
    version::{NotFoundVersion, PartialUpdate, TotalUpdate, Update, Version, VersionedContent},
};

pub trait OutputAssetsProvider: NonLocalValue + TraceRawVcs + Send + Sync + 'static {
    fn get_output_assets(&self) -> OperationVc<OutputAssets>;
}

async fn peek_issues<T: Send>(source: OperationVc<T>) -> Result<Vec<ReadRef<PlainIssue>>> {
    let captured = source.peek_issues();

    captured.get_plain_issues(&IssueFilter::everything()).await
}

fn extend_issues(issues: &mut Vec<ReadRef<PlainIssue>>, new_issues: Vec<ReadRef<PlainIssue>>) {
    for issue in new_issues {
        if issues.contains(&issue) {
            continue;
        }

        issues.push(issue);
    }
}

#[turbo_tasks::function(operation, root)]
fn versioned_content_update_operation(
    content: ResolvedVc<Box<dyn VersionedContent>>,
    from: ResolvedVc<Box<dyn Version>>,
) -> Vc<Update> {
    content.update(*from)
}

#[turbo_tasks::function(operation, root)]
async fn get_update_stream_item_operation(
    from: ResolvedVc<VersionsState>,
    get_content: TransientInstance<Arc<dyn OutputAssetsProvider>>,
) -> Result<Vc<UpdateStreamItem>> {
    let chunks = get_content.get_output_assets();
    let chunks_result = chunks.read_strongly_consistent().await;
    let mut plain_issues = peek_issues(chunks).await?;

    let chunks_result = match chunks_result {
        Ok(content) => content,
        Err(e) => {
            plain_issues.push(
                PlainIssue::from_issue(
                    Vc::upcast(
                        FatalStreamIssue {
                            resource: rcstr!("foo"),
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
            return Ok(UpdateStreamItem {
                updates: vec![(None, update.await?)],
                issues: plain_issues,
            }
            .cell());
        }
    };

    let update_ops = chunks_result
        .iter()
        .map(async |asset| {
            let ident = asset.path().to_string().owned().await?;
            let update_op = versioned_content_update_operation(
                asset.versioned_content().to_resolved().await?,
                from.get(ident.clone()).to_resolved().await?,
            );
            Ok((ident, update_op))
        })
        .try_join()
        .await?;

    for issues in update_ops
        .iter()
        .map(|(_, op)| peek_issues(*op))
        .try_join()
        .await?
    {
        extend_issues(&mut plain_issues, issues);
    }

    let updates = update_ops
        .iter()
        .map(async |(ident, update_op)| {
            let update = update_op.connect().await?;
            if matches!(&*update, Update::None | Update::Missing) {
                Ok(None)
            } else {
                Ok(Some((Some(ident.clone()), update)))
            }
        })
        .try_flat_join()
        .await?;

    Ok(UpdateStreamItem {
        updates,
        issues: plain_issues,
    }
    .cell())
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
    from: ResolvedVc<VersionsState>,
    get_content: TransientInstance<Arc<dyn OutputAssetsProvider>>,
    sender: TransientInstance<ComputeUpdateStreamSender>,
) -> Vc<()> {
    let item = get_update_stream_item_operation(from, get_content)
        .read_strongly_consistent()
        .await;

    // Send update. Ignore channel closed error.
    let _ = sender.0.send(item).await;

    Default::default()
}

#[derive(Debug)]
pub enum UpdateStreamItemRef {
    Owned(UpdateStreamItem),
    Borrowed(ReadRef<UpdateStreamItem>),
}

impl Deref for UpdateStreamItemRef {
    type Target = UpdateStreamItem;

    fn deref(&self) -> &Self::Target {
        match self {
            UpdateStreamItemRef::Owned(item) => item,
            UpdateStreamItemRef::Borrowed(item) => item,
        }
    }
}

pub struct UpdateStream(Pin<Box<dyn Stream<Item = Result<UpdateStreamItemRef>> + Send + Sync>>);

impl UpdateStream {
    #[tracing::instrument(skip(get_content), name = "UpdateStream::new")]
    pub async fn new(
        resource: RcStr,
        get_content: TransientInstance<Arc<dyn OutputAssetsProvider>>,
    ) -> Result<UpdateStream> {
        let (sx, rx) = tokio::sync::mpsc::channel(32);

        // We can ignore issues reported in content here since [compute_update_stream]
        // will handle them
        let x = &*get_content.get_output_assets().connect().await?;
        // println!(
        //     "[UpdateStream]: got {:#?}",
        //     x.iter()
        //         .map(async |v| { Ok((v.path().to_string().owned().await?, v,)) })
        //         .try_join()
        //         .await?
        // );
        let version: Vec<(RcStr, TraitRef<Box<dyn Version>>)> = x
            .iter()
            .map(async |v| {
                Ok((
                    v.path().to_string().owned().await?,
                    v.versioned_content().version().into_trait_ref().await?,
                ))
            })
            .try_join()
            .await?;

        let version_state = VersionsState::new(version);

        let _ = compute_update_stream(
            version_state,
            get_content,
            TransientInstance::new(ComputeUpdateStreamSender(sx)),
        );

        let mut last_had_issues = false;

        let stream = ReceiverStream::new(rx).filter_map(move |item| {
            {
                async move {
                    let x: Option<Result<UpdateStreamItemRef>> = match item.as_deref() {
                        Ok(UpdateStreamItem { updates, issues }) => {
                            let has_issues = !issues.is_empty();
                            let issues_changed = has_issues != last_had_issues;
                            last_had_issues = has_issues;

                            let mut result = vec![];
                            for (ident, update) in updates {
                                match &**update {
                                    Update::Partial(PartialUpdate { to, .. })
                                    | Update::Total(TotalUpdate { to }) => {
                                        if let Some(ident) = ident {
                                            version_state
                                                .set(ident.clone(), to.clone())
                                                .await
                                                .expect("failed to update version");
                                        }

                                        result.push((ident.clone(), update.clone()))
                                    }
                                    // // Do not propagate empty updates.
                                    Update::None | Update::Missing => {
                                        //     if has_issues || issues_changed {
                                        //         result.push(item)
                                        //     }
                                    }
                                }
                            }

                            if !result.is_empty() {
                                Some(Ok(UpdateStreamItemRef::Owned(UpdateStreamItem {
                                    updates: result,
                                    issues: issues.clone(),
                                })))
                            } else if has_issues || issues_changed {
                                Some(Ok(UpdateStreamItemRef::Owned(UpdateStreamItem {
                                    updates: vec![],
                                    issues: issues.clone(),
                                })))
                            } else {
                                None
                            }
                        }
                        Err(_) => {
                            // Propagate other updates
                            Some(item.map(UpdateStreamItemRef::Borrowed))
                        }
                    };
                    x
                }
                .in_current_span()
            }
            .in_current_span()
        });

        Ok(UpdateStream(Box::pin(stream)))
    }
}

impl Stream for UpdateStream {
    type Item = Result<UpdateStreamItemRef>;

    fn poll_next(
        self: Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        Pin::new(&mut self.get_mut().0).poll_next(cx)
    }
}

#[turbo_tasks::value(serialization = "skip")]
#[derive(Debug)]
pub struct UpdateStreamItem {
    pub updates: Vec<(Option<RcStr>, ReadRef<Update>)>,
    pub issues: Vec<ReadRef<PlainIssue>>,
}

#[turbo_tasks::value(serialization = "skip")]
struct FatalStreamIssue {
    description: ResolvedVc<StyledString>,
    resource: RcStr,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for FatalStreamIssue {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Fatal
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Other(rcstr!("websocket"))
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        ServerFileSystem::new().root().await?.join(&self.resource)
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(rcstr!(
            "Fatal error while getting content to stream"
        )))
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some((*self.description.await?).clone()))
    }
}

/// This is a dummy wrapper type to (incorrectly) implement [`OperationValue`] (required by
/// [`State`]), because the [`Version`] trait is not (yet?) a subtype of [`OperationValue`].
#[derive(Debug, Eq, PartialEq, TraceRawVcs, NonLocalValue, OperationValue)]
struct VersionRef(
    // TODO: This trace_ignore is *very* wrong, and could cause problems if/when we add a GC.
    // It also allows to `Version`s that don't implement `OperationValue`, which could lead to
    // incorrect results when attempting to strongly resolve Vcs.
    #[turbo_tasks(trace_ignore)] TraitRef<Box<dyn Version>>,
);

// unsafe impl OperationValue for VersionsState{}

#[turbo_tasks::value(serialization = "skip")]
#[derive(OperationValue)]
pub struct VersionsState {
    versions: State<FxIndexMap<RcStr, State<VersionRef>>>,
}

#[turbo_tasks::value_impl]
impl VersionsState {
    #[turbo_tasks::function]
    pub async fn get(&self, ident: RcStr) -> Result<Vc<Box<dyn Version>>> {
        if let Some(version) = self.versions.get().get(&ident) {
            Ok(TraitRef::cell(version.get().0.clone()))
        } else {
            Ok(TraitRef::cell(
                Vc::upcast::<Box<dyn Version>>(NotFoundVersion::new())
                    .into_trait_ref()
                    .await?,
            ))
        }
    }
}

impl VersionsState {
    pub fn new(version: impl IntoIterator<Item = (RcStr, TraitRef<Box<dyn Version>>)>) -> Vc<Self> {
        VersionsState {
            versions: State::new(
                version
                    .into_iter()
                    .map(|(ident, version)| (ident, State::new(VersionRef(version))))
                    .collect(),
            ),
        }
        .cell()
    }

    pub async fn set(
        self: Vc<Self>,
        ident: RcStr,
        new_version: TraitRef<Box<dyn Version>>,
    ) -> Result<()> {
        let this = self.await?;
        this.versions
            .get()
            .get(&ident)
            .unwrap()
            .set(VersionRef(new_version));
        Ok(())
    }
}
