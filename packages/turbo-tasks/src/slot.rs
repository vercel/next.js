use std::{
    any::Any,
    fmt::{Debug, Display},
    hash::{Hash, Hasher},
    sync::{Arc, Weak},
};

use anyhow::{Error, Result};
use weak_table::{
    traits::{WeakElement, WeakKey},
    WeakHashSet,
};

use crate::{
    error::SharedError,
    task::TaskArgumentOptions,
    task_input::{SharedReference, TaskInput},
    viz::SlotSnapshot,
    SlotValueType, Task, TurboTasks,
};

#[derive(Default, Debug)]
pub struct Slot {
    content: SlotContent,
    updates: u32,
    pub(crate) dependent_tasks: WeakHashSet<Weak<Task>>,
}

#[derive(Clone, Debug)]
pub enum SlotContent {
    Empty,
    SharedReference(&'static SlotValueType, Arc<dyn Any + Send + Sync>),
    Cloneable(&'static SlotValueType, Box<dyn CloneableData>),
    Link(SlotRef),
    Error(SharedError),
}

pub trait CloneableData: Debug + Any + Send + Sync {
    fn as_any(&self) -> Box<dyn Any + Send + Sync>;
    fn clone_cloneable(&self) -> Box<dyn CloneableData>;
    fn eq(&self, other: &dyn Any) -> bool;
    fn hash_cloneable(&self, state: &mut dyn Hasher);
}

impl Clone for Box<dyn CloneableData> {
    fn clone(&self) -> Self {
        self.clone_cloneable()
    }
}

impl Hash for Box<dyn CloneableData> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.hash_cloneable(state as &mut dyn Hasher)
    }
}

impl PartialEq for Box<dyn CloneableData> {
    fn eq(&self, other: &Self) -> bool {
        (self as &dyn CloneableData).eq(&other.as_any())
    }
}

impl Eq for Box<dyn CloneableData> {}

impl<T: PartialEq + Hash + Debug + Clone + Sync + Send + 'static> CloneableData for T {
    fn as_any(&self) -> Box<dyn Any + Send + Sync> {
        Box::new(self.clone())
    }

    fn clone_cloneable(&self) -> Box<dyn CloneableData> {
        Box::new(self.clone())
    }

    fn eq(&self, other: &dyn Any) -> bool {
        if let Some(other) = other.downcast_ref() {
            *self == *other
        } else {
            false
        }
    }

    fn hash_cloneable(&self, state: &mut dyn Hasher) {
        Hash::hash(self, &mut Box::new(state))
    }
}

impl Default for SlotContent {
    fn default() -> Self {
        SlotContent::Empty
    }
}

impl Display for SlotContent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SlotContent::Empty => write!(f, "empty"),
            SlotContent::SharedReference(ty, _) => write!(f, "shared {}", ty.name),
            SlotContent::Cloneable(ty, _) => write!(f, "cloneable {}", ty.name),
            SlotContent::Link(slot_ref) => write!(f, "link {}", slot_ref),
            SlotContent::Error(err) => write!(f, "error {}", err),
        }
    }
}

impl Slot {
    pub fn new() -> Self {
        Self {
            content: SlotContent::Empty,
            updates: 0,
            dependent_tasks: WeakHashSet::new(),
        }
    }

    pub fn conditional_update_shared<
        T: Send + Sync + 'static,
        F: FnOnce(Option<&T>) -> Option<T>,
    >(
        &mut self,
        ty: &'static SlotValueType,
        functor: F,
    ) {
        let change;
        let mut _type_change = false;
        match &self.content {
            SlotContent::Empty | SlotContent::Link(_) | SlotContent::Error(_) => {
                _type_change = true;
                change = functor(None);
            }
            SlotContent::SharedReference(old_ty, old_content) => {
                if *old_ty != ty {
                    _type_change = true;
                    change = functor(None);
                } else {
                    if let Some(old_content) = old_content.downcast_ref::<T>() {
                        change = functor(Some(old_content));
                    } else {
                        panic!("This can't happen as the type is compared");
                    }
                }
            }
            SlotContent::Cloneable(old_ty, old_content) => {
                if *old_ty != ty {
                    _type_change = true;
                    change = functor(None);
                } else {
                    if let Ok(old_content) = old_content.as_any().downcast::<T>() {
                        change = functor(Some(&*old_content));
                    } else {
                        panic!("This can't happen as the type is compared");
                    }
                }
            }
        };
        if let Some(new_content) = change {
            self.assign(SlotContent::SharedReference(ty, Arc::new(new_content)))
        }
    }

    pub fn conditional_update_cloneable<
        T: PartialEq + Hash + Clone + Debug + Send + Sync + 'static,
        F: FnOnce(Option<&T>) -> Option<T>,
    >(
        &mut self,
        ty: &'static SlotValueType,
        functor: F,
    ) {
        let change;
        let mut _type_change = false;
        match &self.content {
            SlotContent::Empty | SlotContent::Link(_) | SlotContent::Error(_) => {
                _type_change = true;
                change = functor(None);
            }
            SlotContent::SharedReference(old_ty, old_content) => {
                if *old_ty != ty {
                    _type_change = true;
                    change = functor(None);
                } else {
                    if let Some(old_content) = old_content.downcast_ref::<T>() {
                        change = functor(Some(old_content));
                    } else {
                        panic!("This can't happen as the type is compared");
                    }
                }
            }
            SlotContent::Cloneable(old_ty, old_content) => {
                if *old_ty != ty {
                    _type_change = true;
                    change = functor(None);
                } else {
                    if let Ok(old_content) = old_content.as_any().downcast::<T>() {
                        change = functor(Some(&*old_content));
                    } else {
                        panic!("This can't happen as the type is compared");
                    }
                }
            }
        };
        if let Some(new_content) = change {
            self.assign(SlotContent::Cloneable(ty, Box::new(new_content)))
        }
    }

    pub fn compare_and_update_shared<T: PartialEq + Send + Sync + 'static>(
        &mut self,
        ty: &'static SlotValueType,
        new_content: T,
    ) {
        self.conditional_update_shared(ty, |old_content| {
            if let Some(old_content) = old_content {
                if PartialEq::eq(&new_content, old_content) {
                    return None;
                }
            }
            Some(new_content)
        });
    }

    pub fn compare_and_update_cloneable<
        T: PartialEq + Hash + Clone + Debug + PartialEq + Send + Sync + 'static,
    >(
        &mut self,
        ty: &'static SlotValueType,
        new_content: T,
    ) {
        self.conditional_update_cloneable(ty, |old_content| {
            if let Some(old_content) = old_content {
                if PartialEq::eq(&new_content, old_content) {
                    return None;
                }
            }
            Some(new_content)
        });
    }

    pub fn update_shared<T: Send + Sync + 'static>(
        &mut self,
        ty: &'static SlotValueType,
        new_content: T,
    ) {
        self.assign(SlotContent::SharedReference(ty, Arc::new(new_content)))
    }

    fn read<T: Any + Send + Sync>(&mut self, reader: Arc<Task>) -> Result<SlotReadResult<T>> {
        self.dependent_tasks.insert(reader);
        match &self.content {
            SlotContent::Empty => Ok(SlotReadResult::Final(SlotRefReadResult::nothing())),
            SlotContent::Error(err) => Err(err.clone().into()),
            SlotContent::SharedReference(_, data) => match Arc::downcast(data.clone()) {
                Ok(data) => Ok(SlotReadResult::Final(SlotRefReadResult::shared_reference(
                    data,
                ))),
                Err(_) => Ok(SlotReadResult::Final(SlotRefReadResult::invalid_type())),
            },
            SlotContent::Cloneable(_, data) => {
                match Box::<dyn Any + Send + Sync>::downcast(data.as_any()) {
                    Ok(data) => Ok(SlotReadResult::Final(SlotRefReadResult::cloned_data(data))),
                    Err(_) => Ok(SlotReadResult::Final(SlotRefReadResult::invalid_type())),
                }
            }
            SlotContent::Link(slot_ref) => Ok(SlotReadResult::Link(slot_ref.clone())),
        }
    }

    pub fn resolve(&mut self, reader: Arc<Task>) -> Result<TaskInput> {
        self.dependent_tasks.insert(reader);
        match &self.content {
            SlotContent::Error(err) => Err(err.clone().into()),
            SlotContent::Empty => Ok(TaskInput::Nothing),
            SlotContent::SharedReference(ty, data) => Ok(TaskInput::SharedReference(
                ty,
                SharedReference(data.clone()),
            )),
            SlotContent::Cloneable(ty, data) => Ok(TaskInput::CloneableData(ty, data.clone())),
            SlotContent::Link(slot_ref) => Ok(slot_ref.clone().into()),
        }
    }

    pub fn resolve_link(&mut self, reader: Arc<Task>) -> Result<SlotRef> {
        self.dependent_tasks.insert(reader);
        match &self.content {
            SlotContent::Link(slot_ref) => Ok(slot_ref.clone()),
            SlotContent::Error(err) => Err(err.clone().into()),
            _ => panic!("resolve_link() must only be called on linked slots"),
        }
    }

    pub fn link(&mut self, target: SlotRef) {
        let change;
        let mut _type_change = false;
        match &self.content {
            SlotContent::Link(old_target) => {
                if match (old_target, &target) {
                    (SlotRef::TaskOutput(old_task), SlotRef::TaskOutput(new_task)) => {
                        Arc::ptr_eq(old_task, new_task)
                    }
                    (
                        SlotRef::TaskCreated(old_task, old_index),
                        SlotRef::TaskCreated(new_task, new_index),
                    ) => Arc::ptr_eq(old_task, new_task) && *old_index == *new_index,
                    _ => false,
                } {
                    change = None;
                } else {
                    change = Some(target);
                }
            }
            SlotContent::Empty
            | SlotContent::SharedReference(_, _)
            | SlotContent::Cloneable(_, _)
            | SlotContent::Error(_) => {
                change = Some(target);
            }
        };
        if let Some(target) = change {
            self.assign(SlotContent::Link(target))
        }
    }

    pub fn error(&mut self, error: Error) {
        self.content = SlotContent::Error(SharedError::new(error));
        self.updates += 1;
        // notify
        TurboTasks::schedule_notify_tasks(self.dependent_tasks.iter());
    }

    pub fn assign(&mut self, content: SlotContent) {
        self.content = content;
        self.updates += 1;
        // notify
        TurboTasks::schedule_notify_tasks(self.dependent_tasks.iter());
    }
}

enum SlotReadResult<T: Any + Send + Sync> {
    Final(SlotRefReadResult<T>),
    Link(SlotRef),
}

pub struct SlotRefReadResult<T: Any + Send + Sync> {
    inner: SlotRefReadResultInner<T>,
}

pub enum SlotRefReadResultInner<T: Any + Send + Sync> {
    Nothing,
    SharedReference(Arc<T>),
    ClonedData(Box<T>),
    InvalidType,
}

impl<T: Any + Send + Sync> SlotRefReadResult<T> {
    fn nothing() -> Self {
        Self {
            inner: SlotRefReadResultInner::Nothing,
        }
    }
    fn invalid_type() -> Self {
        Self {
            inner: SlotRefReadResultInner::InvalidType,
        }
    }
    fn shared_reference(shared_ref: Arc<T>) -> Self {
        Self {
            inner: SlotRefReadResultInner::SharedReference(shared_ref),
        }
    }
    fn cloned_data(data: Box<T>) -> Self {
        Self {
            inner: SlotRefReadResultInner::ClonedData(data),
        }
    }
}

impl<T: Any + Send + Sync> std::ops::Deref for SlotRefReadResult<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        match &self.inner {
            SlotRefReadResultInner::Nothing => {
                panic!("Nothing in slot")
            }
            SlotRefReadResultInner::SharedReference(a) => a,
            SlotRefReadResultInner::ClonedData(a) => a,
            SlotRefReadResultInner::InvalidType => {
                panic!("Invalid type")
            }
        }
    }
}

trait SlotConsumer {
    fn content_changed();
    fn content_type_changed();
}

#[derive(Clone)]
pub enum SlotRef {
    TaskOutput(Arc<Task>),
    TaskCreated(Arc<Task>, usize),
    // Nothing,
    // SharedReference(&'static SlotValueType, Arc<dyn Any + Send + Sync>),
    // CloneableData(&'static SlotValueType, Box<dyn CloneableData>),
}

impl SlotRef {
    pub fn get_default_task_argument_options() -> TaskArgumentOptions {
        TaskArgumentOptions::Unresolved
    }

    pub async fn into_read<T: Any + Send + Sync>(self) -> Result<SlotRefReadResult<T>> {
        let mut current = self;
        loop {
            match match current {
                SlotRef::TaskOutput(ref task) => {
                    task.with_done_output_slot(|slot| {
                        Task::with_current(|reader| {
                            reader.add_dependency(current.clone());
                            slot.read(reader.clone())
                        })
                    })
                    .await?
                }
                SlotRef::TaskCreated(ref task, index) => Task::with_current(|reader| {
                    reader.add_dependency(current.clone());
                    task.with_created_slot(index, |slot| slot.read(reader.clone()))
                })?,
            } {
                SlotReadResult::Final(result) => {
                    return Ok(result);
                }
                SlotReadResult::Link(slot_ref) => current = slot_ref,
            }
        }
    }

    pub async fn resolve_to_slot(self) -> Result<SlotRef> {
        let mut current = self;
        loop {
            current = match current {
                SlotRef::TaskOutput(ref task) => {
                    task.with_done_output_slot(|slot| {
                        Task::with_current(|reader| {
                            reader.add_dependency(current.clone());
                            slot.resolve_link(reader.clone())
                        })
                    })
                    .await?
                }
                SlotRef::TaskCreated(_, _) => return Ok(current.clone()),
            }
        }
    }

    pub fn downgrade(&self) -> WeakSlotRef {
        match self {
            SlotRef::TaskOutput(task) => WeakSlotRef::TaskOutput(Arc::downgrade(task)),
            SlotRef::TaskCreated(task, index) => {
                WeakSlotRef::TaskCreated(Arc::downgrade(task), *index)
            }
        }
    }

    pub(crate) fn remove_dependent_task(&self, reader: &Arc<Task>) {
        match self {
            SlotRef::TaskOutput(task) => {
                task.with_output_slot_mut(|slot| {
                    slot.dependent_tasks.remove(reader);
                });
            }
            SlotRef::TaskCreated(task, index) => {
                task.with_created_slot(*index, |slot| {
                    slot.dependent_tasks.remove(reader);
                });
            }
        }
    }

    pub fn is_resolved(&self) -> bool {
        match self {
            SlotRef::TaskOutput(_) => false,
            SlotRef::TaskCreated(_, _) => true,
        }
    }

    pub fn get_snapshot_for_visualization(&self) -> SlotSnapshot {
        fn content_to_linked(content: &SlotContent) -> Option<SlotRef> {
            if let SlotContent::Link(slot_ref) = content {
                Some(slot_ref.clone())
            } else {
                None
            }
        }
        match self {
            SlotRef::TaskOutput(task) => task.with_output_slot(|slot| SlotSnapshot {
                name: "output slot".to_string(),
                content: slot.content.to_string(),
                updates: slot.updates,
                linked_to_slot: content_to_linked(&slot.content),
            }),
            SlotRef::TaskCreated(task, index) => {
                task.with_created_slot(*index, |slot| SlotSnapshot {
                    name: format!("slot {}", index),
                    content: slot.content.to_string(),
                    updates: slot.updates,
                    linked_to_slot: content_to_linked(&slot.content),
                })
            }
        }
    }
}

impl PartialEq<SlotRef> for SlotRef {
    fn eq(&self, other: &SlotRef) -> bool {
        match (self, other) {
            (Self::TaskOutput(a), Self::TaskOutput(b)) => Arc::ptr_eq(a, b),
            (Self::TaskCreated(a, ai), Self::TaskCreated(b, bi)) => Arc::ptr_eq(a, b) && ai == bi,
            _ => false,
        }
    }
}

impl Eq for SlotRef {}

impl Display for SlotRef {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SlotRef::TaskOutput(task) => {
                write!(f, "task output {}", task)
            }
            SlotRef::TaskCreated(task, index) => {
                write!(f, "task created {} {}", task, index)
            }
        }
    }
}

impl Debug for SlotRef {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SlotRef::TaskOutput(task) => f
                .debug_struct("SlotRef::TaskOutput")
                .field("task", task)
                .finish(),
            SlotRef::TaskCreated(task, index) => f
                .debug_struct("SlotRef::TaskCreated")
                .field("task", task)
                .field("index", index)
                .finish(),
        }
    }
}

impl Hash for SlotRef {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        match self {
            SlotRef::TaskOutput(task) => {
                Hash::hash(&Arc::as_ptr(task), state);
            }
            SlotRef::TaskCreated(task, index) => {
                Hash::hash(&Arc::as_ptr(task), state);
                Hash::hash(&index, state);
            }
        }
    }
}

#[derive(Clone)]
pub enum WeakSlotRef {
    TaskOutput(Weak<Task>),
    TaskCreated(Weak<Task>, usize),
}

impl WeakSlotRef {
    pub fn upgrade(&self) -> Option<SlotRef> {
        match self {
            WeakSlotRef::TaskOutput(task) => task.upgrade().map(|task| SlotRef::TaskOutput(task)),
            WeakSlotRef::TaskCreated(task, index) => task
                .upgrade()
                .map(|task| SlotRef::TaskCreated(task, *index)),
        }
    }
}

impl PartialEq for WeakSlotRef {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::TaskOutput(a), Self::TaskOutput(b)) => Weak::ptr_eq(a, b),
            (Self::TaskCreated(a, ai), Self::TaskCreated(b, bi)) => Weak::ptr_eq(a, b) && ai == bi,
            _ => false,
        }
    }
}

impl Eq for WeakSlotRef {}

impl WeakKey for WeakSlotRef {
    type Key = SlotRef;

    fn with_key<F, R>(view: &Self::Strong, f: F) -> R
    where
        F: FnOnce(&Self::Key) -> R,
    {
        f(view)
    }
}

impl WeakElement for WeakSlotRef {
    type Strong = SlotRef;

    fn new(view: &Self::Strong) -> Self {
        view.downgrade()
    }

    fn view(&self) -> Option<Self::Strong> {
        self.upgrade()
    }

    fn clone(view: &Self::Strong) -> Self::Strong {
        view.clone()
    }
}
