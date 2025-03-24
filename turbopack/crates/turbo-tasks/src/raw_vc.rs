use std::{fmt::Display, future::Future, pin::Pin, task::Poll};

use anyhow::Result;
use auto_hash_map::AutoSet;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::{
    backend::{CellContent, TypedCellContent},
    event::EventListener,
    id::LocalTaskId,
    manager::{read_local_output, read_task_cell, read_task_output, with_turbo_tasks},
    registry::{self, get_value_type},
    turbo_tasks, CollectiblesSource, ReadCellOptions, ReadConsistency, TaskId, TraitTypeId,
    ValueType, ValueTypeId, Vc, VcValueTrait,
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
}

impl RawVc {
    pub(crate) fn is_resolved(&self) -> bool {
        match self {
            RawVc::TaskOutput(_) => false,
            RawVc::TaskCell(_, _) => true,
            RawVc::LocalOutput(_, _) => false,
        }
    }

    pub(crate) fn is_local(&self) -> bool {
        match self {
            RawVc::TaskOutput(_) => false,
            RawVc::TaskCell(_, _) => false,
            RawVc::LocalOutput(_, _) => true,
        }
    }

    pub fn is_transient(&self) -> bool {
        match self {
            RawVc::TaskOutput(task) | RawVc::TaskCell(task, _) | RawVc::LocalOutput(task, _) => {
                task.is_transient()
            }
        }
    }

    pub(crate) fn into_read(self) -> ReadRawVcFuture {
        // returns a custom future to have something concrete and sized
        // this avoids boxing in IntoFuture
        ReadRawVcFuture::new(self)
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
                    let content = read_task_cell(&*tt, task, index, ReadCellOptions::default())
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
                RawVc::LocalOutput(task_id, local_task_id) => {
                    current = read_local_output(&*tt, task_id, local_task_id)
                        .await
                        .map_err(|source| ResolveTypeError::TaskError { source })?;
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

    async fn resolve_inner(self, mut consistency: ReadConsistency) -> Result<RawVc> {
        let tt = turbo_tasks();
        let mut current = self;
        let mut notified = false;
        loop {
            match current {
                RawVc::TaskOutput(task) => {
                    if !notified {
                        tt.notify_scheduled_tasks();
                        notified = true;
                    }
                    current = read_task_output(&*tt, task, consistency).await?;
                    // We no longer need to read strongly consistent, as any Vc returned
                    // from the first task will be inside of the scope of the first
                    // task. So it's already strongly consistent.
                    consistency = ReadConsistency::Eventual;
                }
                RawVc::TaskCell(_, _) => return Ok(current),
                RawVc::LocalOutput(task_id, local_task_id) => {
                    debug_assert_eq!(consistency, ReadConsistency::Eventual);
                    current = read_local_output(&*tt, task_id, local_task_id).await?;
                }
            }
        }
    }

    /// Convert a potentially local `RawVc` into a non-local `RawVc`. This is a subset of resolution
    /// resolution, because the returned `RawVc` can be a `TaskOutput`.
    pub(crate) async fn to_non_local(self) -> Result<RawVc> {
        let tt = turbo_tasks();
        let mut current = self;
        loop {
            match current {
                RawVc::LocalOutput(task_id, local_task_id) => {
                    current = read_local_output(&*tt, task_id, local_task_id).await?;
                }
                non_local => return Ok(non_local),
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
        }
    }

    /// For a cell that's already resolved, synchronously check if it implements a trait using the
    /// type information in `RawVc::TaskCell` (we don't actualy need to read the cell!).
    pub(crate) fn resolved_has_trait(&self, trait_id: TraitTypeId) -> bool {
        match self {
            RawVc::TaskCell(_task_id, cell_id) => {
                get_value_type(cell_id.type_id).has_trait(&trait_id)
            }
            _ => unreachable!("resolved_has_trait must be called with a RawVc::TaskCell"),
        }
    }

    /// For a cell that's already resolved, synchronously check if it is a given type using the type
    /// information in `RawVc::TaskCell` (we don't actualy need to read the cell!).
    pub(crate) fn resolved_is_type(&self, type_id: ValueTypeId) -> bool {
        match self {
            RawVc::TaskCell(_task_id, cell_id) => cell_id.type_id == type_id,
            _ => unreachable!("resolved_is_type must be called with a RawVc::TaskCell"),
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
    consistency: ReadConsistency,
    current: RawVc,
    untracked: bool,
    read_cell_options: ReadCellOptions,
    listener: Option<EventListener>,
}

impl ReadRawVcFuture {
    pub(crate) fn new(vc: RawVc) -> Self {
        ReadRawVcFuture {
            consistency: ReadConsistency::Eventual,
            current: vc,
            untracked: false,
            read_cell_options: ReadCellOptions::default(),
            listener: None,
        }
    }

    pub fn strongly_consistent(mut self) -> Self {
        self.consistency = ReadConsistency::Strong;
        self
    }

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    pub fn untracked(mut self) -> Self {
        self.untracked = true;
        self
    }

    pub fn final_read_hint(mut self) -> Self {
        self.read_cell_options.final_read_hint = true;
        self
    }
}

impl Future for ReadRawVcFuture {
    type Output = Result<TypedCellContent>;

    fn poll(self: Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> Poll<Self::Output> {
        with_turbo_tasks(|tt| {
            tt.notify_scheduled_tasks();
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
                            tt.try_read_task_output_untracked(task, this.consistency)
                        } else {
                            tt.try_read_task_output(task, this.consistency)
                        };
                        match read_result {
                            Ok(Ok(vc)) => {
                                // We no longer need to read strongly consistent, as any Vc returned
                                // from the first task will be inside of the scope of the first
                                // task. So it's already strongly consistent.
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
                            tt.try_read_task_cell_untracked(task, index, this.read_cell_options)
                        } else {
                            tt.try_read_task_cell(task, index, this.read_cell_options)
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
                        debug_assert_eq!(this.consistency, ReadConsistency::Eventual);
                        let read_result = tt.try_read_local_output(task_id, local_output_id);
                        match read_result {
                            Ok(Ok(vc)) => {
                                this.current = vc;
                                continue 'outer;
                            }
                            Ok(Err(listener)) => listener,
                            Err(err) => return Poll::Ready(Err(err)),
                        }
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
        })
    }
}

impl Unpin for ReadRawVcFuture {}
