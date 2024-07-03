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
    backend::CellContent,
    event::EventListener,
    manager::{read_task_cell, read_task_output, TurboTasksApi},
    registry::{
        get_value_type, {self},
    },
    turbo_tasks, CollectiblesSource, SharedReference, TaskId, TraitTypeId, ValueTypeId, Vc,
    VcValueTrait,
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

    pub(crate) async fn resolve_value(
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
    pub(crate) async fn resolve(self) -> Result<RawVc> {
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
    pub(crate) async fn resolve_strongly_consistent(self) -> Result<RawVc> {
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

    pub(crate) fn connect(&self) {
        let tt = turbo_tasks();
        tt.connect_task(self.get_task_id());
    }

    pub fn get_task_id(&self) -> TaskId {
        match self {
            RawVc::TaskOutput(t) | RawVc::TaskCell(t, _) => *t,
        }
    }
}

impl CollectiblesSource for RawVc {
    fn peek_collectibles<T: VcValueTrait + Send>(self) -> AutoSet<Vc<T>> {
        let tt = turbo_tasks();
        tt.notify_scheduled_tasks();
        let map = tt.read_task_collectibles(self.get_task_id(), T::get_trait_type_id());
        map.into_iter()
            .filter_map(|(raw, count)| (count > 0).then_some(raw.into()))
            .collect()
    }

    fn take_collectibles<T: VcValueTrait + Send>(self) -> AutoSet<Vc<T>> {
        let tt = turbo_tasks();
        tt.notify_scheduled_tasks();
        let map = tt.read_task_collectibles(self.get_task_id(), T::get_trait_type_id());
        tt.unemit_collectibles(T::get_trait_type_id(), &map);
        map.into_iter()
            .filter_map(|(raw, count)| (count > 0).then_some(raw.into()))
            .collect()
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

pub struct ReadRawVcFuture {
    turbo_tasks: Arc<dyn TurboTasksApi>,
    strongly_consistent: bool,
    current: RawVc,
    untracked: bool,
    listener: Option<EventListener>,
}

impl ReadRawVcFuture {
    pub(crate) fn new(vc: RawVc) -> Self {
        let tt = turbo_tasks();
        ReadRawVcFuture {
            turbo_tasks: tt,
            strongly_consistent: false,
            current: vc,
            untracked: false,
            listener: None,
        }
    }

    fn new_untracked_with_turbo_tasks(vc: RawVc, turbo_tasks: &dyn TurboTasksApi) -> Self {
        let tt = turbo_tasks.pin();
        ReadRawVcFuture {
            turbo_tasks: tt,
            strongly_consistent: false,
            current: vc,
            untracked: true,
            listener: None,
        }
    }

    fn new_untracked(vc: RawVc) -> Self {
        let tt = turbo_tasks();
        ReadRawVcFuture {
            turbo_tasks: tt,
            strongly_consistent: false,
            current: vc,
            untracked: true,
            listener: None,
        }
    }

    fn new_strongly_consistent(vc: RawVc) -> Self {
        let tt = turbo_tasks();
        ReadRawVcFuture {
            turbo_tasks: tt,
            strongly_consistent: true,
            current: vc,
            untracked: false,
            listener: None,
        }
    }

    fn new_strongly_consistent_untracked(vc: RawVc) -> Self {
        let tt = turbo_tasks();
        ReadRawVcFuture {
            turbo_tasks: tt,
            strongly_consistent: true,
            current: vc,
            untracked: true,
            listener: None,
        }
    }
}

impl Future for ReadRawVcFuture {
    type Output = Result<CellContent>;

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
                            .try_read_task_output_untracked(task, this.strongly_consistent)
                    } else {
                        this.turbo_tasks
                            .try_read_task_output(task, this.strongly_consistent)
                    };
                    match read_result {
                        Ok(Ok(vc)) => {
                            // We no longer need to read strongly consistent, as any Vc returned
                            // from the first task will be inside of the scope of the first task. So
                            // it's already strongly consistent.
                            this.strongly_consistent = false;
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

unsafe impl Send for ReadRawVcFuture {}
unsafe impl Sync for ReadRawVcFuture {}

impl Unpin for ReadRawVcFuture {}
