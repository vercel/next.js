use std::{
    any::Any,
    fmt::Debug,
    hash::{Hash, Hasher},
    sync::{Arc, Weak},
};

use crate::{
    task::TaskArgumentOptions, viz::SlotSnapshot, NativeFunction, SlotValueType, Task, TraitType,
    TurboTasks,
};

#[derive(Default, Debug)]
pub struct Slot {
    content: SlotContent,
    updates: i32,
    dependent_tasks: Vec<Weak<Task>>,
    linked_slots: Vec<SlotRef>,
    linked_to_slot: Option<SlotRef>,
}

impl Slot {
    pub fn new() -> Self {
        Self {
            content: SlotContent::Empty,
            updates: 0,
            dependent_tasks: Vec::new(),
            linked_slots: Vec::new(),
            linked_to_slot: None,
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
            SlotContent::Empty => {
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
            self.content = SlotContent::SharedReference(ty, Arc::new(new_content));
            // notify
            for task in self.dependent_tasks.iter().filter_map(|t| t.upgrade()) {
                TurboTasks::schedule_notify_task(task);
            }
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
}

#[derive(Clone, Debug)]
pub enum SlotContent {
    Empty,
    SharedReference(&'static SlotValueType, Arc<dyn Any + Send + Sync>),
    Cloneable(&'static SlotValueType, Box<dyn CloneableData>),
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

impl ToString for SlotContent {
    fn to_string(&self) -> String {
        match self {
            SlotContent::Empty => format!("empty"),
            SlotContent::SharedReference(ty, _) => format!("shared {}", ty.name),
            SlotContent::Cloneable(ty, _) => format!("cloneable {}", ty.name),
        }
    }
}

impl Slot {
    pub fn read<T: Any + Send + Sync>(&mut self, reader: &Arc<Task>) -> SlotReadResult<T> {
        self.dependent_tasks.push(Arc::downgrade(reader));
        match &self.content {
            SlotContent::Empty => SlotReadResult::Nothing,
            SlotContent::SharedReference(_, data) => match Arc::downcast(data.clone()) {
                Ok(data) => SlotReadResult::SharedReference(data),
                Err(_) => SlotReadResult::InvalidType,
            },
            SlotContent::Cloneable(_, data) => {
                match Box::<dyn Any + Send + Sync>::downcast(data.as_any()) {
                    Ok(data) => SlotReadResult::ClonedData(data),
                    Err(_) => SlotReadResult::InvalidType,
                }
            }
        }
    }

    pub fn resolve(&mut self, reader: &Arc<Task>) -> SlotRef {
        self.dependent_tasks.push(Arc::downgrade(reader));
        match &self.content {
            SlotContent::Empty => SlotRef::Nothing,
            SlotContent::SharedReference(ty, data) => SlotRef::SharedReference(ty, data.clone()),
            SlotContent::Cloneable(ty, data) => SlotRef::CloneableData(ty, data.clone()),
        }
    }

    pub fn assign_value(&mut self, content: SlotContent) {
        // TODO disconnect
        self.linked_to_slot = None;
        self.assign_inner(content);
    }

    pub fn assign_link(&mut self, self_ref: SlotRef, slot_ref: SlotRef) {
        if self_ref == slot_ref {
            panic!("self assign");
        }
        assert!(self_ref != slot_ref);
        match slot_ref {
            SlotRef::TaskOutput(task) => {
                task.clone().with_output_slot(move |slot| {
                    let slot_ref = SlotRef::TaskOutput(task);
                    let changed = if let Some(linked_slot_ref) = &self.linked_to_slot {
                        *linked_slot_ref != slot_ref
                    } else {
                        true
                    };
                    if changed {
                        // TODO disconnect
                        self.linked_to_slot = None;
                        slot.linked_slots.push(self_ref.clone());
                        self.linked_to_slot = Some(slot_ref.clone());
                    }
                    self.assign_inner(slot.content.clone());
                })
            }
            SlotRef::TaskCreated(task, index) => {
                task.clone().with_created_slot(index, move |slot| {
                    let slot_ref = SlotRef::TaskCreated(task, index);
                    let changed = if let Some(linked_slot_ref) = &self.linked_to_slot {
                        *linked_slot_ref != slot_ref
                    } else {
                        true
                    };
                    if changed {
                        // TODO disconnect
                        self.linked_to_slot = None;
                        slot.linked_slots.push(self_ref.clone());
                        self.linked_to_slot = Some(slot_ref.clone());
                    }
                    self.assign_inner(slot.content.clone());
                });
            }
            SlotRef::SharedReference(node_type, data) => {
                // TODO disconnect
                self.linked_to_slot = None;
                self.assign_inner(SlotContent::SharedReference(node_type, data.clone()));
            }
            SlotRef::CloneableData(node_type, data) => {
                // TODO disconnect
                self.linked_to_slot = None;
                self.assign_inner(SlotContent::Cloneable(node_type, data.clone()));
            }
            SlotRef::Nothing => self.assign_inner(SlotContent::Empty),
        };
    }

    fn assign_inner(&mut self, content: SlotContent) {
        self.content = content;
        // TODO notify self.linked_slots
        // TODO notify self.dependent_tasks
    }
}

pub enum SlotReadResult<T: Any + Send + Sync> {
    Nothing,
    SharedReference(Arc<T>),
    ClonedData(Box<T>),
    InvalidType,
}

impl<T: Any + Send + Sync> std::ops::Deref for SlotReadResult<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        match self {
            SlotReadResult::Nothing => {
                panic!("Nothing in slot")
            }
            SlotReadResult::SharedReference(a) => a,
            SlotReadResult::ClonedData(a) => a,
            SlotReadResult::InvalidType => {
                panic!("Invalid type")
            }
        }
    }
}

trait SlotConsumer {
    fn content_changed();
    fn content_type_changed();
}

#[derive(Clone, Debug)]
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

    pub async fn into_read<T: Any + Send + Sync>(self) -> SlotReadResult<T> {
        self.read().await
    }

    pub async fn read<T: Any + Send + Sync>(&self) -> SlotReadResult<T> {
        match self {
            SlotRef::TaskOutput(task) => {
                task.wait_output().await;
                Task::with_current(|reader| {
                    reader.add_dependency(WeakSlotRef::TaskOutput(Arc::downgrade(task)));
                    task.with_output_slot(|slot| slot.read(reader))
                })
            }
            SlotRef::TaskCreated(task, index) => Task::with_current(|reader| {
                reader.add_dependency(WeakSlotRef::TaskCreated(Arc::downgrade(task), *index));
                task.with_created_slot(*index, |slot| slot.read(reader))
            }),
            SlotRef::SharedReference(_, data) => match Arc::downcast(data.clone()) {
                Ok(data) => SlotReadResult::SharedReference(data),
                Err(_) => SlotReadResult::InvalidType,
            },
            SlotRef::CloneableData(_, data) => {
                match Box::<dyn Any + Send + Sync>::downcast(data.as_any()) {
                    Ok(data) => SlotReadResult::ClonedData(data),
                    Err(_) => SlotReadResult::InvalidType,
                }
            }
            SlotRef::Nothing => SlotReadResult::Nothing,
        }
    }

    pub(crate) fn resolve_with_reader(&self, reader: &Arc<Task>) -> SlotRef {
        match self {
            SlotRef::TaskOutput(task) => {
                reader.add_dependency(WeakSlotRef::TaskOutput(Arc::downgrade(task)));
                task.with_output_slot(|slot| slot.resolve(reader))
            }
            SlotRef::TaskCreated(task, index) => {
                reader.add_dependency(WeakSlotRef::TaskCreated(Arc::downgrade(task), *index));
                task.with_created_slot(*index, |slot| slot.resolve(reader))
            }
            SlotRef::Nothing | SlotRef::SharedReference(_, _) | SlotRef::CloneableData(_, _) => {
                self.clone()
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

    // pub fn get_trait_method(&self, (id, name): (TypeId, &'static str)) -> &'static NativeFunction {}

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

    pub fn get_snapshot_for_visualization(&self) -> SlotSnapshot {
        match self {
            SlotRef::TaskOutput(task) => task.with_output_slot(|slot| SlotSnapshot {
                name: "output".to_string(),
                content: slot.content.to_string(),
                updates: slot.updates,
                linked_to_slot: slot.linked_to_slot.clone(),
            }),
            SlotRef::TaskCreated(task, index) => {
                task.with_created_slot(*index, |slot| SlotSnapshot {
                    name: format!("{}", index),
                    content: slot.content.to_string(),
                    updates: slot.updates,
                    linked_to_slot: slot.linked_to_slot.clone(),
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

    pub(crate) fn remove_dependency(&self, reader: &Weak<Task>) {
        fn remove_all(vec: &mut Vec<Weak<Task>>, item: &Weak<Task>) {
            for i in 0..vec.len() {
                while i < vec.len() && Weak::ptr_eq(&vec[i], item) {
                    vec.swap_remove(i);
                }
            }
        }
        match self {
            WeakSlotRef::TaskOutput(task) => {
                if let Some(task) = task.upgrade() {
                    task.with_output_slot(|slot| remove_all(&mut slot.dependent_tasks, reader))
                }
            }
            WeakSlotRef::TaskCreated(task, index) => {
                if let Some(task) = task.upgrade() {
                    task.with_created_slot(*index, |slot| {
                        remove_all(&mut slot.dependent_tasks, reader)
                    })
                }
            }
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
