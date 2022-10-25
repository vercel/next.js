use std::{
    any::Any,
    collections::HashSet,
    fmt::{Debug, Display},
    future::{Future, IntoFuture},
    hash::Hash,
    marker::PhantomData,
    pin::Pin,
    sync::Arc,
    task::Poll,
};

use anyhow::{anyhow, Result};
use event_listener::EventListener;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::{
    backend::CellContent,
    manager::{
        find_cell_by_key, find_cell_by_type, read_task_cell, read_task_cell_untracked,
        read_task_output, read_task_output_untracked, CurrentCellRef, TurboTasksApi,
    },
    primitives::{RawVcSet, RawVcSetVc},
    registry::get_value_type,
    turbo_tasks,
    value_type::ValueTraitVc,
    CollectiblesSource, ReadRef, SharedReference, TaskId, TraitTypeId, Typed, TypedForInput,
    ValueTypeId,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum RawVc {
    TaskOutput(TaskId),
    TaskCell(TaskId, usize),
}

impl RawVc {
    pub fn into_read<T: Any + Send + Sync>(self) -> ReadRawVcFuture<T> {
        // returns a custom future to have something concrete and sized
        // this avoids boxing in IntoFuture
        ReadRawVcFuture::new(self)
    }

    pub fn into_strongly_consistent_read<T: Any + Send + Sync>(self) -> ReadRawVcFuture<T> {
        // returns a custom future to have something concrete and sized
        // this avoids boxing in IntoFuture
        ReadRawVcFuture::new_strongly_consistent(self)
    }

    /// # Safety
    ///
    /// T and U must be binary identical (#[repr(transparent)])
    pub unsafe fn into_transparent_read<T: Any + Send + Sync, U: Any + Send + Sync>(
        self,
    ) -> ReadRawVcFuture<T, U> {
        // returns a custom future to have something concrete and sized
        // this avoids boxing in IntoFuture
        unsafe { ReadRawVcFuture::new_transparent(self) }
    }

    /// # Safety
    ///
    /// T and U must be binary identical (#[repr(transparent)])
    pub unsafe fn into_transparent_strongly_consistent_read<
        T: Any + Send + Sync,
        U: Any + Send + Sync,
    >(
        self,
    ) -> ReadRawVcFuture<T, U> {
        // returns a custom future to have something concrete and sized
        // this avoids boxing in IntoFuture
        unsafe { ReadRawVcFuture::new_transparent_strongly_consistent(self) }
    }

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    pub async fn into_read_untracked<T: Any + Send + Sync>(
        self,
        turbo_tasks: &dyn TurboTasksApi,
    ) -> Result<ReadRef<T>> {
        self.into_read_untracked_internal(false, turbo_tasks)
            .await?
            .cast::<T>()
    }

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    pub async fn into_strongly_consistent_read_untracked<T: Any + Send + Sync>(
        self,
        turbo_tasks: &dyn TurboTasksApi,
    ) -> Result<ReadRef<T>> {
        self.into_read_untracked_internal(true, turbo_tasks)
            .await?
            .cast::<T>()
    }

    /// Returns the hash of the pointer that holds the Vc's current data. This
    /// value will change every time the TaskCell recomputes.
    ///
    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    pub async fn internal_pointer_untracked(
        self,
        turbo_tasks: &dyn TurboTasksApi,
    ) -> Result<SharedReference> {
        let read = self.into_read_untracked_internal(true, turbo_tasks).await?;
        read.0
            .ok_or_else(|| anyhow!("failed to read cell content into hash"))
    }

    async fn into_read_untracked_internal(
        self,
        strongly_consistent: bool,
        turbo_tasks: &dyn TurboTasksApi,
    ) -> Result<CellContent> {
        turbo_tasks.notify_scheduled_tasks();
        let mut current = self;
        loop {
            match current {
                RawVc::TaskOutput(task) => {
                    current =
                        read_task_output_untracked(turbo_tasks, task, strongly_consistent).await?
                }
                RawVc::TaskCell(task, index) => {
                    return read_task_cell_untracked(turbo_tasks, task, index).await;
                }
            }
        }
    }

    pub async fn resolve_trait(
        self,
        trait_type: TraitTypeId,
    ) -> Result<Option<RawVc>, ResolveTypeError> {
        let tt = turbo_tasks();
        tt.notify_scheduled_tasks();
        let mut current = self;
        loop {
            match current {
                RawVc::TaskOutput(task) => {
                    current = read_task_output(&*tt, task, false)
                        .await
                        .map_err(|source| ResolveTypeError::TaskError { source })?;
                }
                RawVc::TaskCell(task, index) => {
                    let content = read_task_cell(&*tt, task, index)
                        .await
                        .map_err(|source| ResolveTypeError::ReadError { source })?;
                    if let CellContent(Some(shared_reference)) = content {
                        if let SharedReference(Some(value_type), _) = shared_reference {
                            if get_value_type(value_type).has_trait(&trait_type) {
                                return Ok(Some(RawVc::TaskCell(task, index)));
                            } else {
                                return Ok(None);
                            }
                        } else {
                            return Err(ResolveTypeError::UntypedContent);
                        }
                    } else {
                        return Err(ResolveTypeError::NoContent);
                    }
                }
            }
        }
    }

    pub async fn resolve_value(
        self,
        value_type: ValueTypeId,
    ) -> Result<Option<RawVc>, ResolveTypeError> {
        let tt = turbo_tasks();
        tt.notify_scheduled_tasks();
        let mut current = self;
        loop {
            match current {
                RawVc::TaskOutput(task) => {
                    current = read_task_output(&*tt, task, false)
                        .await
                        .map_err(|source| ResolveTypeError::TaskError { source })?;
                }
                RawVc::TaskCell(task, index) => {
                    let content = read_task_cell(&*tt, task, index)
                        .await
                        .map_err(|source| ResolveTypeError::ReadError { source })?;
                    if let CellContent(Some(shared_reference)) = content {
                        if let SharedReference(Some(cell_value_type), _) = shared_reference {
                            if cell_value_type == value_type {
                                return Ok(Some(RawVc::TaskCell(task, index)));
                            } else {
                                return Ok(None);
                            }
                        } else {
                            return Err(ResolveTypeError::UntypedContent);
                        }
                    } else {
                        return Err(ResolveTypeError::NoContent);
                    }
                }
            }
        }
    }

    /// Resolve the reference until it points to a cell directly.
    ///
    /// Resolving will wait for task execution to be finished, so that the
    /// returned Vc points to a cell that stores a value.
    ///
    /// Resolving is necessary to compare identities of Vcs.
    ///
    /// This is async and will rethrow any fatal error that happened during task
    /// execution.
    pub async fn resolve(self) -> Result<RawVc> {
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
                    current = read_task_output(&*tt, task, false).await?;
                }
                RawVc::TaskCell(_, _) => return Ok(current),
            }
        }
    }

    /// Resolve the reference until it points to a cell directly in a strongly
    /// consistent way.
    ///
    /// Resolving will wait for task execution to be finished, so that the
    /// returned Vc points to a cell that stores a value.
    ///
    /// Resolving is necessary to compare identities of Vcs.
    ///
    /// This is async and will rethrow any fatal error that happened during task
    /// execution.
    pub async fn resolve_strongly_consistent(self) -> Result<RawVc> {
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
                    current = read_task_output(&*tt, task, true).await?;
                }
                RawVc::TaskCell(_, _) => return Ok(current),
            }
        }
    }

    pub fn is_resolved(&self) -> bool {
        match self {
            RawVc::TaskOutput(_) => false,
            RawVc::TaskCell(_, _) => true,
        }
    }

    async fn cell_local_internal<T: FnOnce(ValueTypeId) -> CurrentCellRef>(
        self,
        select_cell: T,
    ) -> Result<RawVc> {
        let tt = turbo_tasks();
        tt.notify_scheduled_tasks();
        let mut current = self;
        loop {
            match current {
                RawVc::TaskOutput(task) => current = read_task_output(&*tt, task, false).await?,
                RawVc::TaskCell(task, index) => {
                    let content = read_task_cell(&*tt, task, index).await?;
                    let shared_ref = content.0.ok_or_else(|| anyhow!("Cell is empty"))?;
                    let SharedReference(ty, _) = shared_ref;
                    let ty = ty.ok_or_else(|| anyhow!("Cell content is untyped"))?;
                    let local_cell = select_cell(ty);
                    local_cell.update_shared_reference(shared_ref);
                    return Ok(local_cell.into());
                }
            }
        }
    }

    /// Reads the value from the cell and stores it to a new cell in the current
    /// task. This basically create a shallow copy of the cell content.
    /// As comparing Vcs is based on the cell location, this creates a new
    /// identity of the value. When used in a once task, it will create Vc
    /// that snapshots the value of a cell that is disconnected from ongoing
    /// recomputations in the graph (as once tasks doesn't reexecute)
    pub async fn cell_local(self) -> Result<RawVc> {
        self.cell_local_internal(find_cell_by_type).await
    }

    /// Like [RawVc::cell_local], but allows to specify a key for selecting the
    /// cell.
    pub async fn keyed_cell_local<
        K: std::fmt::Debug
            + std::cmp::Eq
            + std::cmp::Ord
            + std::hash::Hash
            + Typed
            + TypedForInput
            + Send
            + Sync
            + 'static,
    >(
        self,
        key: K,
    ) -> Result<RawVc> {
        self.cell_local_internal(|ty| find_cell_by_key(ty, key))
            .await
    }

    pub fn get_task_id(&self) -> TaskId {
        match self {
            RawVc::TaskOutput(t) | RawVc::TaskCell(t, _) => *t,
        }
    }
}

impl CollectiblesSource for RawVc {
    fn peek_collectibles<T: ValueTraitVc>(self) -> CollectiblesFuture<T> {
        let tt = turbo_tasks();
        tt.notify_scheduled_tasks();
        let set: RawVcSetVc = tt
            .native_call(
                *crate::collectibles::READ_COLLECTIBLES_FUNCTION_ID,
                vec![self.into(), (*T::get_trait_type_id()).into()],
            )
            .into();
        CollectiblesFuture {
            turbo_tasks: tt,
            inner: set.into_future(),
            take: false,
            phantom: PhantomData,
        }
    }

    fn take_collectibles<T: ValueTraitVc>(self) -> CollectiblesFuture<T> {
        let tt = turbo_tasks();
        tt.notify_scheduled_tasks();
        let set: RawVcSetVc = tt
            .native_call(
                *crate::collectibles::READ_COLLECTIBLES_FUNCTION_ID,
                vec![self.into(), (*T::get_trait_type_id()).into()],
            )
            .into();
        CollectiblesFuture {
            turbo_tasks: tt,
            inner: set.into_future(),
            take: true,
            phantom: PhantomData,
        }
    }
}

impl Display for RawVc {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RawVc::TaskOutput(task) => {
                write!(f, "output of {}", task)
            }
            RawVc::TaskCell(task, index) => {
                write!(f, "value {} of {}", index, task)
            }
        }
    }
}

pub struct ReadRawVcFuture<T: Any + Send + Sync, U: Any + Send + Sync = T> {
    turbo_tasks: Arc<dyn TurboTasksApi>,
    strongly_consistent: bool,
    current: RawVc,
    listener: Option<EventListener>,
    phantom_data: PhantomData<Pin<Box<(T, U)>>>,
}

impl<T: Any + Send + Sync> ReadRawVcFuture<T, T> {
    fn new(vc: RawVc) -> Self {
        let tt = turbo_tasks();
        tt.notify_scheduled_tasks();
        ReadRawVcFuture {
            turbo_tasks: tt,
            strongly_consistent: false,
            current: vc,
            listener: None,
            phantom_data: PhantomData,
        }
    }

    fn new_strongly_consistent(vc: RawVc) -> Self {
        let tt = turbo_tasks();
        tt.notify_scheduled_tasks();
        ReadRawVcFuture {
            turbo_tasks: tt,
            strongly_consistent: true,
            current: vc,
            listener: None,
            phantom_data: PhantomData,
        }
    }
}

impl<T: Any + Send + Sync, U: Any + Send + Sync> ReadRawVcFuture<T, U> {
    /// # Safety
    ///
    /// T and U must be binary identical (#[repr(transparent)])
    unsafe fn new_transparent(vc: RawVc) -> Self {
        let tt = turbo_tasks();
        tt.notify_scheduled_tasks();
        ReadRawVcFuture {
            turbo_tasks: tt,
            strongly_consistent: false,
            current: vc,
            listener: None,
            phantom_data: PhantomData,
        }
    }

    /// # Safety
    ///
    /// T and U must be binary identical (#[repr(transparent)])
    unsafe fn new_transparent_strongly_consistent(vc: RawVc) -> Self {
        let tt = turbo_tasks();
        tt.notify_scheduled_tasks();
        ReadRawVcFuture {
            turbo_tasks: tt,
            strongly_consistent: true,
            current: vc,
            listener: None,
            phantom_data: PhantomData,
        }
    }
}

impl<T: Any + Send + Sync, U: Any + Send + Sync> Future for ReadRawVcFuture<T, U> {
    type Output = Result<ReadRef<T, U>>;

    fn poll(self: Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> Poll<Self::Output> {
        self.turbo_tasks.notify_scheduled_tasks();
        let this = self.get_mut();
        'outer: loop {
            if let Some(listener) = &mut this.listener {
                let listener = unsafe { Pin::new_unchecked(listener) };
                if listener.poll(cx).is_pending() {
                    return Poll::Pending;
                }
                this.listener = None;
            }
            let mut listener = match this.current {
                RawVc::TaskOutput(task) => match this
                    .turbo_tasks
                    .try_read_task_output(task, this.strongly_consistent)
                {
                    Ok(Ok(vc)) => {
                        this.strongly_consistent = false;
                        this.current = vc;
                        continue 'outer;
                    }
                    Ok(Err(listener)) => listener,
                    Err(err) => return Poll::Ready(Err(err)),
                },
                RawVc::TaskCell(task, index) => {
                    match this.turbo_tasks.try_read_task_cell(task, index) {
                        Ok(Ok(content)) => {
                            // SAFETY: Constructor ensures that T and U are binary identical
                            return Poll::Ready(unsafe { content.cast_transparent::<T, U>() });
                        }
                        Ok(Err(listener)) => listener,
                        Err(err) => return Poll::Ready(Err(err)),
                    }
                }
            };
            match Pin::new(&mut listener).poll(cx) {
                Poll::Ready(_) => continue,
                Poll::Pending => {
                    this.listener = Some(listener);
                    return Poll::Pending;
                }
            };
        }
    }
}

#[derive(Error, Debug)]
#[error("Unable to read collectibles")]
pub struct ReadCollectiblesError {
    source: anyhow::Error,
}

pub struct CollectiblesFuture<T: ValueTraitVc> {
    turbo_tasks: Arc<dyn TurboTasksApi>,
    inner: ReadRawVcFuture<RawVcSet, HashSet<RawVc>>,
    take: bool,
    phantom: PhantomData<fn() -> T>,
}

impl<T: ValueTraitVc> Future for CollectiblesFuture<T> {
    type Output = Result<HashSet<T>>;

    fn poll(self: Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> Poll<Self::Output> {
        let this = unsafe { self.get_unchecked_mut() };
        let inner_pin = Pin::new(&mut this.inner);
        match inner_pin.poll(cx) {
            Poll::Ready(r) => Poll::Ready(match r {
                Ok(set) => {
                    if this.take {
                        this.turbo_tasks
                            .unemit_collectibles(T::get_trait_type_id(), &set);
                    }
                    Ok(set.iter().map(|raw| (*raw).into()).collect())
                }
                Err(e) => Err(ReadCollectiblesError { source: e }.into()),
            }),
            Poll::Pending => Poll::Pending,
        }
    }
}
