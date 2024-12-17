use std::{
    fmt::{Debug, Display},
    future::Future,
    hash::Hash,
    pin::Pin,
    sync::Arc,
    task::Poll,
};

use anyhow::Result;
use auto_hash_map::AutoSet;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::{
    backend::{CellContent, TypedCellContent},
    event::EventListener,
    id::{ExecutionId, LocalCellId, LocalTaskId},
    manager::{
        assert_execution_id, current_task, read_local_cell, read_local_output, read_task_cell,
        read_task_output, TurboTasksApi,
    },
    registry::{self, get_value_type},
    turbo_tasks, CollectiblesSource, ReadConsistency, TaskId, TraitTypeId, ValueType, ValueTypeId,
    Vc, VcValueTrait,
};

#[derive(Error, Debug)]
pub enum ResolveTypeError {
    #[error("no content in the cell")]
    NoContent,
    #[error("the content in the cell has no type")]
    UntypedContent,
    #[error("content is not available as task execution failed")]
    TaskError { source: anyhow::Error },
    #[error("reading the cell content failed")]
    ReadError { source: anyhow::Error },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct CellId {
    pub type_id: ValueTypeId,
    pub index: u32,
}

impl Display for CellId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}#{}",
            registry::get_value_type(self.type_id).name,
            self.index
        )
    }
}

/// A type-erased representation of [`Vc`].
///
/// Type erasure reduces the [monomorphization] (and therefore binary size and compilation time)
/// required to support `Vc`.
///
/// This type is heavily used within the [`Backend`][crate::backend::Backend] trait, but should
/// otherwise be treated as an internal implementation detail of `turbo-tasks`.
///
/// [monomorphization]: https://doc.rust-lang.org/book/ch10-01-syntax.html#performance-of-code-using-generics
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum RawVc {
    TaskOutput(TaskId),
    TaskCell(TaskId, CellId),
    LocalOutput(TaskId, LocalTaskId),
    #[serde(skip)]
    LocalCell(ExecutionId, LocalCellId),
}

impl RawVc {
    pub(crate) fn is_resolved(&self) -> bool {
        match self {
            RawVc::TaskOutput(_) => false,
            RawVc::TaskCell(_, _) => true,
            RawVc::LocalOutput(_, _) => false,
            RawVc::LocalCell(_, _) => false,
        }
    }

    pub(crate) fn is_local(&self) -> bool {
        match self {
            RawVc::TaskOutput(_) => false,
            RawVc::TaskCell(_, _) => false,
            RawVc::LocalOutput(_, _) => true,
            RawVc::LocalCell(_, _) => true,
        }
    }

    pub fn is_transient(&self) -> bool {
        match self {
            RawVc::TaskOutput(task) | RawVc::TaskCell(task, _) => task.is_transient(),
            RawVc::LocalOutput(_, _) | RawVc::LocalCell(_, _) => true,
        }
    }

    pub(crate) fn into_read(self) -> ReadRawVcFuture {
        // returns a custom future to have something concrete and sized
        // this avoids boxing in IntoFuture
        ReadRawVcFuture::new(self)
    }

    pub(crate) fn into_strongly_consistent_read(self) -> ReadRawVcFuture {
        ReadRawVcFuture::new_strongly_consistent(self)
    }

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    pub(crate) fn into_read_untracked(self) -> ReadRawVcFuture {
        ReadRawVcFuture::new_untracked(self)
    }

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    pub(crate) fn into_read_untracked_with_turbo_tasks(
        self,
        turbo_tasks: &dyn TurboTasksApi,
    ) -> ReadRawVcFuture {
        ReadRawVcFuture::new_untracked_with_turbo_tasks(self, turbo_tasks)
    }

    pub(crate) fn into_strongly_consistent_read_untracked(self) -> ReadRawVcFuture {
        ReadRawVcFuture::new_strongly_consistent_untracked(self)
    }

    pub(crate) async fn resolve_trait(
        self,
        trait_type: TraitTypeId,
    ) -> Result<Option<RawVc>, ResolveTypeError> {
        self.resolve_type_inner(|value_type_id| {
            let value_type = get_value_type(value_type_id);
            (value_type.has_trait(&trait_type), Some(value_type))
        })
        .await
    }

    pub(crate) async fn resolve_value(
        self,
        value_type: ValueTypeId,
    ) -> Result<Option<RawVc>, ResolveTypeError> {
        self.resolve_type_inner(|cell_value_type| (cell_value_type == value_type, None))
            .await
    }

    /// Helper for `resolve_trait` and `resolve_value`.
    ///
    /// After finding a cell, returns `Ok(Some(...))` when `conditional` returns
    /// `true`, and `Ok(None)` when `conditional` returns `false`.
    ///
    /// As an optimization, `conditional` may return the `&'static ValueType` to
    /// avoid a potential extra lookup later.
    async fn resolve_type_inner(
        self,
        conditional: impl FnOnce(ValueTypeId) -> (bool, Option<&'static ValueType>),
    ) -> Result<Option<RawVc>, ResolveTypeError> {
        let tt = turbo_tasks();
        tt.notify_scheduled_tasks();
        let mut current = self;
        loop {
            match current {
                RawVc::TaskOutput(task) => {
                    current = read_task_output(&*tt, task, ReadConsistency::Eventual)
                        .await
                        .map_err(|source| ResolveTypeError::TaskError { source })?;
                }
                RawVc::TaskCell(task, index) => {
                    let content = read_task_cell(&*tt, task, index)
                        .await
                        .map_err(|source| ResolveTypeError::ReadError { source })?;
                    if let TypedCellContent(value_type, CellContent(Some(_))) = content {
                        return Ok(if conditional(value_type).0 {
                            Some(RawVc::TaskCell(task, index))
                        } else {
                            None
                        });
                    } else {
                        return Err(ResolveTypeError::NoContent);
                    }
                }
                RawVc::LocalOutput(task_id, local_cell_id) => {
                    current =
                        read_local_output(&*tt, task_id, local_cell_id, ReadConsistency::Eventual)
                            .await
                            .map_err(|source| ResolveTypeError::TaskError { source })?;
                }
                RawVc::LocalCell(execution_id, local_cell_id) => {
                    let shared_reference = read_local_cell(execution_id, local_cell_id);
                    return Ok(
                        if let (true, value_type) = conditional(shared_reference.0) {
                            // re-use the `ValueType` lookup from `conditional`, if it exists
                            let value_type =
                                value_type.unwrap_or_else(|| get_value_type(shared_reference.0));
                            Some((value_type.raw_cell)(shared_reference))
                        } else {
                            None
                        },
                    );
                }
            }
        }
    }

    /// See [`crate::Vc::resolve`].
    pub(crate) async fn resolve(self) -> Result<RawVc> {
        self.resolve_inner(ReadConsistency::Eventual).await
    }

    /// See [`crate::Vc::resolve_strongly_consistent`].
    pub(crate) async fn resolve_strongly_consistent(self) -> Result<RawVc> {
        self.resolve_inner(ReadConsistency::Strong).await
    }

    async fn resolve_inner(self, consistency: ReadConsistency) -> Result<RawVc> {
        let tt = turbo_tasks();
        let mut current = self;
        let mut notified = false;
        let mut lazily_notify = || {
            if !notified {
                tt.notify_scheduled_tasks();
                notified = true;
            }
        };
        loop {
            match current {
                RawVc::TaskOutput(task) => {
                    lazily_notify();
                    current = read_task_output(&*tt, task, consistency).await?;
                }
                RawVc::TaskCell(_, _) => return Ok(current),
                RawVc::LocalOutput(task_id, local_cell_id) => {
                    lazily_notify();
                    current = read_local_output(&*tt, task_id, local_cell_id, consistency).await?;
                }
                RawVc::LocalCell(execution_id, local_cell_id) => {
                    let shared_reference = read_local_cell(execution_id, local_cell_id);
                    let value_type = get_value_type(shared_reference.0);
                    return Ok((value_type.raw_cell)(shared_reference));
                }
            }
        }
    }

    pub(crate) fn connect(&self) {
        let tt = turbo_tasks();
        tt.connect_task(self.get_task_id());
    }

    pub fn get_task_id(&self) -> TaskId {
        match self {
            RawVc::TaskOutput(t) | RawVc::TaskCell(t, _) | RawVc::LocalOutput(t, _) => *t,
            RawVc::LocalCell(execution_id, _) => {
                assert_execution_id(*execution_id);
                current_task("RawVc::get_task_id")
            }
        }
    }
}

impl CollectiblesSource for RawVc {
    fn peek_collectibles<T: VcValueTrait + ?Sized>(self) -> AutoSet<Vc<T>> {
        let tt = turbo_tasks();
        tt.notify_scheduled_tasks();
        let map = tt.read_task_collectibles(self.get_task_id(), T::get_trait_type_id());
        map.into_iter()
            .filter_map(|(raw, count)| (count > 0).then_some(raw.into()))
            .collect()
    }

    fn take_collectibles<T: VcValueTrait + ?Sized>(self) -> AutoSet<Vc<T>> {
        let tt = turbo_tasks();
        tt.notify_scheduled_tasks();
        let map = tt.read_task_collectibles(self.get_task_id(), T::get_trait_type_id());
        tt.unemit_collectibles(T::get_trait_type_id(), &map);
        map.into_iter()
            .filter_map(|(raw, count)| (count > 0).then_some(raw.into()))
            .collect()
    }
}

pub struct ReadRawVcFuture {
    turbo_tasks: Arc<dyn TurboTasksApi>,
    consistency: ReadConsistency,
    current: RawVc,
    untracked: bool,
    listener: Option<EventListener>,
}

impl ReadRawVcFuture {
    pub(crate) fn new(vc: RawVc) -> Self {
        let tt = turbo_tasks();
        ReadRawVcFuture {
            turbo_tasks: tt,
            consistency: ReadConsistency::Eventual,
            current: vc,
            untracked: false,
            listener: None,
        }
    }

    fn new_untracked_with_turbo_tasks(vc: RawVc, turbo_tasks: &dyn TurboTasksApi) -> Self {
        let tt = turbo_tasks.pin();
        ReadRawVcFuture {
            turbo_tasks: tt,
            consistency: ReadConsistency::Eventual,
            current: vc,
            untracked: true,
            listener: None,
        }
    }

    fn new_untracked(vc: RawVc) -> Self {
        let tt = turbo_tasks();
        ReadRawVcFuture {
            turbo_tasks: tt,
            consistency: ReadConsistency::Eventual,
            current: vc,
            untracked: true,
            listener: None,
        }
    }

    fn new_strongly_consistent(vc: RawVc) -> Self {
        let tt = turbo_tasks();
        ReadRawVcFuture {
            turbo_tasks: tt,
            consistency: ReadConsistency::Strong,
            current: vc,
            untracked: false,
            listener: None,
        }
    }

    fn new_strongly_consistent_untracked(vc: RawVc) -> Self {
        let tt = turbo_tasks();
        ReadRawVcFuture {
            turbo_tasks: tt,
            consistency: ReadConsistency::Strong,
            current: vc,
            untracked: true,
            listener: None,
        }
    }
}

impl Future for ReadRawVcFuture {
    type Output = Result<TypedCellContent>;

    fn poll(self: Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> Poll<Self::Output> {
        self.turbo_tasks.notify_scheduled_tasks();
        // SAFETY: we are not moving this
        let this = unsafe { self.get_unchecked_mut() };
        'outer: loop {
            if let Some(listener) = &mut this.listener {
                // SAFETY: listener is from previous pinned this
                let listener = unsafe { Pin::new_unchecked(listener) };
                if listener.poll(cx).is_pending() {
                    return Poll::Pending;
                }
                this.listener = None;
            }
            let mut listener = match this.current {
                RawVc::TaskOutput(task) => {
                    let read_result = if this.untracked {
                        this.turbo_tasks
                            .try_read_task_output_untracked(task, this.consistency)
                    } else {
                        this.turbo_tasks
                            .try_read_task_output(task, this.consistency)
                    };
                    match read_result {
                        Ok(Ok(vc)) => {
                            // We no longer need to read strongly consistent, as any Vc returned
                            // from the first task will be inside of the scope of the first task. So
                            // it's already strongly consistent.
                            this.consistency = ReadConsistency::Eventual;
                            this.current = vc;
                            continue 'outer;
                        }
                        Ok(Err(listener)) => listener,
                        Err(err) => return Poll::Ready(Err(err)),
                    }
                }
                RawVc::TaskCell(task, index) => {
                    let read_result = if this.untracked {
                        this.turbo_tasks.try_read_task_cell_untracked(task, index)
                    } else {
                        this.turbo_tasks.try_read_task_cell(task, index)
                    };
                    match read_result {
                        Ok(Ok(content)) => {
                            // SAFETY: Constructor ensures that T and U are binary identical
                            return Poll::Ready(Ok(content));
                        }
                        Ok(Err(listener)) => listener,
                        Err(err) => return Poll::Ready(Err(err)),
                    }
                }
                RawVc::LocalOutput(task_id, local_output_id) => {
                    let read_result = if this.untracked {
                        this.turbo_tasks.try_read_local_output_untracked(
                            task_id,
                            local_output_id,
                            this.consistency,
                        )
                    } else {
                        this.turbo_tasks.try_read_local_output(
                            task_id,
                            local_output_id,
                            this.consistency,
                        )
                    };
                    match read_result {
                        Ok(Ok(vc)) => {
                            this.consistency = ReadConsistency::Eventual;
                            this.current = vc;
                            continue 'outer;
                        }
                        Ok(Err(listener)) => listener,
                        Err(err) => return Poll::Ready(Err(err)),
                    }
                }
                RawVc::LocalCell(execution_id, local_cell_id) => {
                    return Poll::Ready(Ok(read_local_cell(execution_id, local_cell_id).into()));
                }
            };
            // SAFETY: listener is from previous pinned this
            match unsafe { Pin::new_unchecked(&mut listener) }.poll(cx) {
                Poll::Ready(_) => continue,
                Poll::Pending => {
                    this.listener = Some(listener);
                    return Poll::Pending;
                }
            };
        }
    }
}

impl Unpin for ReadRawVcFuture {}
