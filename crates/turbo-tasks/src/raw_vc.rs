use std::{
    any::Any,
    fmt::{Debug, Display},
    future::Future,
    hash::Hash,
    marker::PhantomData,
    pin::Pin,
    sync::Arc,
};

use anyhow::Result;
use event_listener::EventListener;

use crate::{
    backend::Backend,
    manager::{read_task_output, read_task_output_untracked, TurboTasksApi},
    turbo_tasks, TaskId, TurboTasks,
};

/// The result of reading a ValueVc.
/// Can be dereferenced to the concrete type.
///
/// This type is needed because the content of the slot can change
/// concurrently, so we can't return a reference to the data directly.
/// Instead the data or an [Arc] to the data is cloned out of the slot
/// and hold by this type.
pub struct RawVcReadResult<T: Any + Send + Sync> {
    inner: RawVcReadResultInner<T>,
}

pub enum RawVcReadResultInner<T: Any + Send + Sync> {
    SharedReference(Arc<T>),
}

impl<T: Any + Send + Sync> RawVcReadResult<T> {
    pub(crate) fn shared_reference(shared_ref: Arc<T>) -> Self {
        Self {
            inner: RawVcReadResultInner::SharedReference(shared_ref),
        }
    }
}

impl<T: Any + Send + Sync> std::ops::Deref for RawVcReadResult<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        match &self.inner {
            RawVcReadResultInner::SharedReference(a) => a,
        }
    }
}

impl<T: Display + Any + Send + Sync> Display for RawVcReadResult<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        Display::fmt(&**self, f)
    }
}

impl<T: Debug + Any + Send + Sync> Debug for RawVcReadResult<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        Debug::fmt(&**self, f)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum RawVc {
    TaskOutput(TaskId),
    TaskSlot(TaskId, usize),
}

impl RawVc {
    pub fn into_read<T: Any + Send + Sync>(self) -> ReadRawVcFuture<T> {
        // returns a custom future to have something concrete and sized
        // this avoids boxing in IntoFuture
        ReadRawVcFuture::new(self)
    }

    pub async unsafe fn into_read_untracked<T: Any + Send + Sync>(
        self,
        turbo_tasks: &dyn TurboTasksApi,
    ) -> Result<RawVcReadResult<T>> {
        turbo_tasks.notify_scheduled_tasks();
        let mut current = self;
        loop {
            match current {
                RawVc::TaskOutput(task) => {
                    current = unsafe { read_task_output_untracked(turbo_tasks, task) }.await?
                }
                RawVc::TaskSlot(task, index) => {
                    return Ok(
                        unsafe { turbo_tasks.read_task_slot_untracked(task, index) }.cast::<T>()?
                    );
                }
            }
        }
    }

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
                    current = read_task_output(&*tt, task).await?;
                }
                RawVc::TaskSlot(_, _) => return Ok(current),
            }
        }
    }

    pub(crate) fn remove_dependent_task<B: Backend>(
        &self,
        reader: TaskId,
        turbo_tasks: &TurboTasks<B>,
    ) {
        match self {
            RawVc::TaskOutput(task) => {
                turbo_tasks.with_task(*task, |task| {
                    task.with_output_mut(|slot| {
                        slot.dependent_tasks.remove(&reader);
                    });
                });
            }
            RawVc::TaskSlot(task, index) => {
                turbo_tasks.with_task(*task, |task| {
                    task.with_slot_mut(*index, |slot| {
                        slot.dependent_tasks.remove(&reader);
                    });
                });
            }
        }
    }

    pub fn is_resolved(&self) -> bool {
        match self {
            RawVc::TaskOutput(_) => false,
            RawVc::TaskSlot(_, _) => true,
        }
    }

    pub(crate) fn get_task_id(&self) -> TaskId {
        match self {
            RawVc::TaskOutput(t) | RawVc::TaskSlot(t, _) => *t,
        }
    }
}

impl Display for RawVc {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RawVc::TaskOutput(task) => {
                write!(f, "output of {}", task)
            }
            RawVc::TaskSlot(task, index) => {
                write!(f, "value {} of {}", index, task)
            }
        }
    }
}

pub struct ReadRawVcFuture<T: Any + Send + Sync> {
    turbo_tasks: Arc<dyn TurboTasksApi>,
    current: RawVc,
    listener: Option<EventListener>,
    phantom_data: PhantomData<Pin<Box<T>>>,
}

impl<T: Any + Send + Sync> ReadRawVcFuture<T> {
    fn new(vc: RawVc) -> Self {
        let tt = turbo_tasks();
        tt.notify_scheduled_tasks();
        ReadRawVcFuture {
            turbo_tasks: tt,
            current: vc,
            listener: None,
            phantom_data: PhantomData,
        }
    }
}

impl<T: Any + Send + Sync> Future for ReadRawVcFuture<T> {
    type Output = Result<RawVcReadResult<T>>;

    fn poll(
        self: Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Self::Output> {
        self.turbo_tasks.notify_scheduled_tasks();
        let this = self.get_mut();
        loop {
            if let Some(listener) = &mut this.listener {
                let listener = unsafe { Pin::new_unchecked(listener) };
                if let std::task::Poll::Pending = listener.poll(cx) {
                    return std::task::Poll::Pending;
                }
                this.listener = None;
            }
            match this.current {
                RawVc::TaskOutput(task) => loop {
                    match this.turbo_tasks.try_read_task_output(task) {
                        Ok(Ok(vc)) => {
                            this.current = vc;
                            break;
                        }
                        Ok(Err(err)) => return std::task::Poll::Ready(Err(err)),
                        Err(mut listener) => match Pin::new(&mut listener).poll(cx) {
                            std::task::Poll::Ready(_) => continue,
                            std::task::Poll::Pending => {
                                this.listener = Some(listener);
                                return std::task::Poll::Pending;
                            }
                        },
                    }
                },
                RawVc::TaskSlot(task, index) => {
                    return std::task::Poll::Ready(
                        this.turbo_tasks.read_task_slot(task, index).cast::<T>(),
                    );
                }
            }
        }
    }
}
