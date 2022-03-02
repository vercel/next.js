use std::{
    any::Any,
    fmt::{Debug, Display},
    hash::{Hash, Hasher},
    sync::{Arc, Weak},
};

use weak_table::{
    traits::{WeakElement, WeakKey},
    WeakHashSet,
};

use crate::{
    task::TaskArgumentOptions, viz::SlotSnapshot, NativeFunction, SlotValueType, Task, TraitType,
    TurboTasks,
};

#[derive(Default, Debug)]
pub struct Slot {
    content: SlotContent,
    updates: u32,
    dependent_tasks: WeakHashSet<Weak<Task>>,
}

#[derive(Clone, Debug)]
pub enum SlotContent {
    Empty,
    SharedReference(&'static SlotValueType, Arc<dyn Any + Send + Sync>),
    Cloneable(&'static SlotValueType, Box<dyn CloneableData>),
    Link(SlotRef),
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
            SlotContent::Empty | SlotContent::Link(_) => {
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
            SlotContent::Empty | SlotContent::Link(_) => {
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

    fn read<T: Any + Send + Sync>(&mut self, reader: Arc<Task>) -> SlotReadResult<T> {
        self.dependent_tasks.insert(reader);
        match &self.content {
            SlotContent::Empty => SlotReadResult::Final(SlotRefReadResult::nothing()),
            SlotContent::SharedReference(_, data) => match Arc::downcast(data.clone()) {
                Ok(data) => SlotReadResult::Final(SlotRefReadResult::shared_reference(data)),
                Err(_) => SlotReadResult::Final(SlotRefReadResult::invalid_type()),
            },
            SlotContent::Cloneable(_, data) => {
                match Box::<dyn Any + Send + Sync>::downcast(data.as_any()) {
                    Ok(data) => SlotReadResult::Final(SlotRefReadResult::cloned_data(data)),
                    Err(_) => SlotReadResult::Final(SlotRefReadResult::invalid_type()),
                }
            }
            SlotContent::Link(slot_ref) => SlotReadResult::Link(slot_ref.clone()),
        }
    }

    pub fn resolve(&mut self, reader: Arc<Task>) -> SlotRef {
        self.dependent_tasks.insert(reader);
        match &self.content {
            SlotContent::Empty => SlotRef::Nothing,
            SlotContent::SharedReference(ty, data) => SlotRef::SharedReference(ty, data.clone()),
            SlotContent::Cloneable(ty, data) => SlotRef::CloneableData(ty, data.clone()),
            SlotContent::Link(slot_ref) => slot_ref.clone(),
        }
    }

    pub fn link(&mut self, target: SlotRef) {
        let change;
        let mut _type_change = false;
        match &self.content {
            SlotContent::Link(old_slot_ref) => {
                if match (old_slot_ref, &target) {
                    (SlotRef::TaskOutput(old_task), SlotRef::TaskOutput(new_task)) => {
                        Arc::ptr_eq(old_task, new_task)
                    }
                    (
                        SlotRef::TaskCreated(old_task, old_index),
                        SlotRef::TaskCreated(new_task, new_index),
                    ) => Arc::ptr_eq(old_task, new_task) && *old_index == *new_index,
                    (SlotRef::Nothing, SlotRef::Nothing) => true,
                    _ => false,
                } {
                    change = None;
                } else {
                    change = Some(target);
                }
            }
            SlotContent::Empty
            | SlotContent::SharedReference(_, _)
            | SlotContent::Cloneable(_, _) => {
                change = Some(target);
            }
        };
        if let Some(target) = change {
            self.assign(SlotContent::Link(target))
        }
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
    Nothing,
    SharedReference(&'static SlotValueType, Arc<dyn Any + Send + Sync>),
    CloneableData(&'static SlotValueType, Box<dyn CloneableData>),
}

impl SlotRef {
    pub fn get_default_task_argument_options() -> TaskArgumentOptions {
        TaskArgumentOptions::Unresolved
    }

    pub async fn into_read<T: Any + Send + Sync>(self) -> SlotRefReadResult<T> {
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
                    .await
                }
                SlotRef::TaskCreated(ref task, index) => Task::with_current(|reader| {
                    reader.add_dependency(current.clone());
                    task.with_created_slot(index, |slot| slot.read(reader.clone()))
                }),
                SlotRef::SharedReference(_, data) => match Arc::downcast(data.clone()) {
                    Ok(data) => SlotReadResult::Final(SlotRefReadResult::shared_reference(data)),
                    Err(_) => SlotReadResult::Final(SlotRefReadResult::invalid_type()),
                },
                SlotRef::CloneableData(_, data) => {
                    match Box::<dyn Any + Send + Sync>::downcast(data.as_any()) {
                        Ok(data) => SlotReadResult::Final(SlotRefReadResult::cloned_data(data)),
                        Err(_) => SlotReadResult::Final(SlotRefReadResult::invalid_type()),
                    }
                }
                SlotRef::Nothing => SlotReadResult::Final(SlotRefReadResult::nothing()),
            } {
                SlotReadResult::Final(result) => {
                    return result;
                }
                SlotReadResult::Link(slot_ref) => current = slot_ref,
            }
        }
    }

    pub async fn resolve_to_slot(self) -> SlotRef {
        let mut current = self;
        loop {
            current = match current {
                SlotRef::TaskOutput(ref task) => {
                    task.with_done_output_slot(|slot| {
                        Task::with_current(|reader| {
                            reader.add_dependency(current.clone());
                            slot.resolve(reader.clone())
                        })
                    })
                    .await
                }
                SlotRef::Nothing
                | SlotRef::SharedReference(_, _)
                | SlotRef::CloneableData(_, _)
                | SlotRef::TaskCreated(_, _) => return current.clone(),
            }
        }
    }

    pub async fn resolve_to_value(self) -> SlotRef {
        let mut current = self;
        loop {
            current = match current {
                SlotRef::TaskOutput(ref task) => {
                    task.with_done_output_slot(|slot| {
                        Task::with_current(|reader| {
                            reader.add_dependency(current.clone());
                            slot.resolve(reader.clone())
                        })
                    })
                    .await
                }
                SlotRef::TaskCreated(ref task, index) => Task::with_current(|reader| {
                    reader.add_dependency(current.clone());
                    task.with_created_slot(index, |slot| slot.resolve(reader.clone()))
                }),
                SlotRef::Nothing
                | SlotRef::SharedReference(_, _)
                | SlotRef::CloneableData(_, _) => return current.clone(),
            }
        }
    }

    pub fn get_trait_method(
        &self,
        trait_type: &'static TraitType,
        name: String,
    ) -> Option<&'static NativeFunction> {
        match self {
            SlotRef::TaskOutput(_) | SlotRef::TaskCreated(_, _) => {
                panic!("get_trait_method must be called on a resolved SlotRef")
            }
            SlotRef::Nothing => None,
            SlotRef::SharedReference(ty, _) | SlotRef::CloneableData(ty, _) => {
                ty.trait_methods.get(&(trait_type, name)).map(|r| *r)
            }
        }
    }

    pub fn has_trait(&self, trait_type: &'static TraitType) -> bool {
        match self {
            SlotRef::TaskOutput(_) | SlotRef::TaskCreated(_, _) => {
                panic!("has_trait() must be called on a resolved SlotRef")
            }
            SlotRef::Nothing => false,
            SlotRef::SharedReference(ty, _) | SlotRef::CloneableData(ty, _) => {
                ty.traits.contains(&trait_type)
            }
        }
    }

    pub fn traits(&self) -> Vec<&'static TraitType> {
        match self {
            SlotRef::TaskOutput(_) | SlotRef::TaskCreated(_, _) => {
                panic!("traits() must be called on a resolved SlotRef")
            }
            SlotRef::Nothing => Vec::new(),
            SlotRef::SharedReference(ty, _) | SlotRef::CloneableData(ty, _) => {
                ty.traits.iter().map(|t| *t).collect()
            }
        }
    }

    pub fn downgrade(&self) -> Option<WeakSlotRef> {
        match self {
            SlotRef::TaskOutput(task) => Some(WeakSlotRef::TaskOutput(Arc::downgrade(task))),
            SlotRef::TaskCreated(task, index) => {
                Some(WeakSlotRef::TaskCreated(Arc::downgrade(task), *index))
            }
            SlotRef::Nothing | SlotRef::SharedReference(_, _) | SlotRef::CloneableData(_, _) => {
                None
            }
        }
    }

    pub fn is_resolved(&self) -> bool {
        match self {
            SlotRef::TaskOutput(_) => false,
            SlotRef::TaskCreated(_, _) => true,
            SlotRef::Nothing | SlotRef::SharedReference(_, _) | SlotRef::CloneableData(_, _) => {
                true
            }
        }
    }

    pub fn is_nothing(&self) -> bool {
        match self {
            SlotRef::Nothing => true,
            SlotRef::TaskOutput(_)
            | SlotRef::TaskCreated(_, _)
            | SlotRef::SharedReference(_, _)
            | SlotRef::CloneableData(_, _) => false,
        }
    }
    pub fn is_task_ref(&self) -> bool {
        match self {
            SlotRef::TaskOutput(_) | SlotRef::TaskCreated(_, _) => true,
            SlotRef::Nothing | SlotRef::SharedReference(_, _) | SlotRef::CloneableData(_, _) => {
                false
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
            SlotRef::CloneableData(_, _) | SlotRef::Nothing | SlotRef::SharedReference(_, _) => {}
        }
    }

    pub fn get_snapshot_for_visualization(&self) -> SlotSnapshot {
        fn content_to_linked(content: &SlotContent) -> Option<SlotRef> {
            if let SlotContent::Link(slot_ref) = content {
                if slot_ref.is_task_ref() {
                    Some(slot_ref.clone())
                } else {
                    None
                }
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
            SlotRef::Nothing => SlotSnapshot {
                name: "nothing".to_string(),
                content: "nothing".to_string(),
                updates: 0,
                linked_to_slot: None,
            },
            SlotRef::SharedReference(ty, _) => SlotSnapshot {
                name: "shared".to_string(),
                content: format!("shared {}", ty.name),
                updates: 0,
                linked_to_slot: None,
            },
            SlotRef::CloneableData(ty, _) => SlotSnapshot {
                name: "cloneable".to_string(),
                content: format!("cloneable {}", ty.name),
                updates: 0,
                linked_to_slot: None,
            },
        }
    }
}

impl PartialEq<SlotRef> for SlotRef {
    fn eq(&self, other: &SlotRef) -> bool {
        match (self, other) {
            (Self::TaskOutput(a), Self::TaskOutput(b)) => Arc::ptr_eq(a, b),
            (Self::TaskCreated(a, ai), Self::TaskCreated(b, bi)) => Arc::ptr_eq(a, b) && ai == bi,
            (Self::SharedReference(tya, a), Self::SharedReference(tyb, b)) => {
                tya == tyb && Arc::ptr_eq(a, b)
            }
            (Self::CloneableData(tya, a), Self::CloneableData(tyb, b)) => {
                tya == tyb && a.eq(&*b.as_any())
            }
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
            SlotRef::Nothing => {
                write!(f, "nothing")
            }
            SlotRef::SharedReference(ty, _) => {
                write!(f, "shared {}", ty.name)
            }
            SlotRef::CloneableData(ty, _) => {
                write!(f, "cloneable {}", ty.name)
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
            SlotRef::Nothing => f.debug_tuple("SlotRef::Nothing").finish(),
            SlotRef::SharedReference(ty, _) => f
                .debug_struct("SlotRef::SharedReference")
                .field("ty", ty)
                .finish_non_exhaustive(),
            SlotRef::CloneableData(ty, _) => f
                .debug_struct("SlotRef::CloneableData")
                .field("ty", ty)
                .finish_non_exhaustive(),
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
            SlotRef::Nothing => {
                Hash::hash(&(), state);
            }
            SlotRef::SharedReference(_, data) => {
                Hash::hash(&Arc::as_ptr(data), state);
            }
            SlotRef::CloneableData(ty, data) => {
                Hash::hash(&ty, state);
                Hash::hash(&data, state);
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
        view.downgrade().unwrap()
    }

    fn view(&self) -> Option<Self::Strong> {
        self.upgrade()
    }

    fn clone(view: &Self::Strong) -> Self::Strong {
        view.clone()
    }
}
