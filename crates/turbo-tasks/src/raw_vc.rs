use std::{
    any::Any,
    fmt::{Debug, Display},
    future::{Future, IntoFuture},
    hash::Hash,
    marker::PhantomData,
    pin::Pin,
    sync::Arc,
    task::Poll,
};

use anyhow::{anyhow, Result};
use auto_hash_map::AutoSet;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::{
    backend::CellContent,
    event::EventListener,
    manager::{
        read_task_cell, read_task_cell_untracked, read_task_output, read_task_output_untracked,
        TurboTasksApi,
    },
    registry::{
        get_value_type, {self},
    },
    turbo_tasks,
    vc::{cast::VcCast, VcValueTraitCast, VcValueTypeCast},
    CollectiblesSource, ReadRef, SharedReference, TaskId, TraitTypeId, ValueTypeId, Vc,
    VcValueTrait, VcValueType,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum RawVc {
    TaskOutput(TaskId),
    TaskCell(TaskId, CellId),
}

impl RawVc {
    pub fn into_read<T: VcValueType>(self) -> ReadRawVcFuture<T, VcValueTypeCast<T>> {
        // returns a custom future to have something concrete and sized
        // this avoids boxing in IntoFuture
        ReadRawVcFuture::new(self)
    }

    pub fn into_strongly_consistent_read<T: VcValueType>(
        self,
    ) -> ReadRawVcFuture<T, VcValueTypeCast<T>> {
        // returns a custom future to have something concrete and sized
        // this avoids boxing in IntoFuture
        ReadRawVcFuture::new_strongly_consistent(self)
    }

    pub fn into_trait_read<T: VcValueTrait + ?Sized>(
        self,
    ) -> ReadRawVcFuture<T, VcValueTraitCast<T>> {
        // returns a custom future to have something concrete and sized
        // this avoids boxing in IntoFuture
        ReadRawVcFuture::new(self)
    }

    pub fn into_strongly_consistent_trait_read<T: VcValueTrait + Sized>(
        self,
    ) -> ReadRawVcFuture<T, VcValueTraitCast<T>> {
        // returns a custom future to have something concrete and sized
        // this avoids boxing in IntoFuture
        ReadRawVcFuture::new_strongly_consistent(self)
    }

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    pub async fn into_read_untracked<T: Any + VcValueType>(
        self,
        turbo_tasks: &dyn TurboTasksApi,
    ) -> Result<ReadRef<T>> {
        self.into_read_untracked_internal(false, turbo_tasks)
            .await?
            .cast::<T>()
    }

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    pub async fn into_strongly_consistent_read_untracked<T: Any + VcValueType>(
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

    /// See [`crate::Vc::resolve`].
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
    /// See [`crate::Vc::resolve_strongly_consistent`].
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

    pub fn connect(&self) {
        let tt = turbo_tasks();
        tt.connect_task(self.get_task_id());
    }

    pub fn is_resolved(&self) -> bool {
        match self {
            RawVc::TaskOutput(_) => false,
            RawVc::TaskCell(_, _) => true,
        }
    }

    pub fn get_task_id(&self) -> TaskId {
        match self {
            RawVc::TaskOutput(t) | RawVc::TaskCell(t, _) => *t,
        }
    }
}

impl CollectiblesSource for RawVc {
    fn peek_collectibles<T: VcValueTrait>(self) -> CollectiblesFuture<T> {
        let tt = turbo_tasks();
        tt.notify_scheduled_tasks();
        let set: Vc<AutoSet<RawVc>> =
            tt.read_task_collectibles(self.get_task_id(), T::get_trait_type_id());
        CollectiblesFuture {
            turbo_tasks: tt,
            inner: set.into_future(),
            take: false,
            phantom: PhantomData,
        }
    }

    fn take_collectibles<T: VcValueTrait>(self) -> CollectiblesFuture<T> {
        let tt = turbo_tasks();
        tt.notify_scheduled_tasks();
        let set: Vc<AutoSet<RawVc>> =
            tt.read_task_collectibles(self.get_task_id(), T::get_trait_type_id());
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

pub struct ReadRawVcFuture<T: ?Sized, Cast = VcValueTypeCast<T>> {
    turbo_tasks: Arc<dyn TurboTasksApi>,
    strongly_consistent: bool,
    current: RawVc,
    listener: Option<EventListener>,
    phantom_data: PhantomData<Pin<Box<T>>>,
    _cast: PhantomData<Cast>,
}

impl<T: ?Sized, Cast: VcCast> ReadRawVcFuture<T, Cast> {
    fn new(vc: RawVc) -> Self {
        let tt = turbo_tasks();
        tt.notify_scheduled_tasks();
        ReadRawVcFuture {
            turbo_tasks: tt,
            strongly_consistent: false,
            current: vc,
            listener: None,
            phantom_data: PhantomData,
            _cast: PhantomData,
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
            _cast: PhantomData,
        }
    }
}

impl<T: ?Sized, Cast: VcCast> Future for ReadRawVcFuture<T, Cast> {
    type Output = Result<Cast::Output>;

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
                            return Poll::Ready(Cast::cast(content));
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
    }
}

unsafe impl<T, Cast> Send for ReadRawVcFuture<T, Cast> where T: ?Sized {}
unsafe impl<T, Cast> Sync for ReadRawVcFuture<T, Cast> where T: ?Sized {}

impl<T, Cast> Unpin for ReadRawVcFuture<T, Cast> where T: ?Sized {}

#[derive(Error, Debug)]
#[error("Unable to read collectibles")]
pub struct ReadCollectiblesError {
    source: anyhow::Error,
}

pub struct CollectiblesFuture<T: VcValueTrait> {
    turbo_tasks: Arc<dyn TurboTasksApi>,
    inner: ReadRawVcFuture<AutoSet<RawVc>>,
    take: bool,
    phantom: PhantomData<fn() -> T>,
}

impl<T: VcValueTrait> CollectiblesFuture<T> {
    pub fn strongly_consistent(mut self) -> Self {
        self.inner.strongly_consistent = true;
        self
    }
}

impl<T: VcValueTrait> Future for CollectiblesFuture<T> {
    type Output = Result<AutoSet<Vc<T>>>;

    fn poll(self: Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> Poll<Self::Output> {
        // SAFETY: we are not moving `this`
        let this = unsafe { self.get_unchecked_mut() };
        // SAFETY: `this` was pinned before
        let inner_pin = unsafe { Pin::new_unchecked(&mut this.inner) };
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
