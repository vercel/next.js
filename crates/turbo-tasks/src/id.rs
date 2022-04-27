use std::{fmt::Display, ops::Deref};

#[derive(Debug, Hash, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct TaskId {
    id: usize,
}

impl Display for TaskId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Task {}", self.id)
    }
}

impl Deref for TaskId {
    type Target = usize;

    fn deref(&self) -> &Self::Target {
        &self.id
    }
}

impl From<usize> for TaskId {
    fn from(id: usize) -> Self {
        Self { id }
    }
}

#[derive(Debug, Hash, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct FunctionId {
    id: usize,
}

impl Display for FunctionId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Function {}", self.id)
    }
}

impl Deref for FunctionId {
    type Target = usize;

    fn deref(&self) -> &Self::Target {
        &self.id
    }
}

impl From<usize> for FunctionId {
    fn from(id: usize) -> Self {
        Self { id }
    }
}

#[derive(Debug, Hash, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct ValueTypeId {
    id: usize,
}

impl Display for ValueTypeId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "ValueType {}", self.id)
    }
}

impl Deref for ValueTypeId {
    type Target = usize;

    fn deref(&self) -> &Self::Target {
        &self.id
    }
}

impl From<usize> for ValueTypeId {
    fn from(id: usize) -> Self {
        Self { id }
    }
}

#[derive(Debug, Hash, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct TraitTypeId {
    id: usize,
}

impl Display for TraitTypeId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "TraitType {}", self.id)
    }
}

impl Deref for TraitTypeId {
    type Target = usize;

    fn deref(&self) -> &Self::Target {
        &self.id
    }
}

impl From<usize> for TraitTypeId {
    fn from(id: usize) -> Self {
        Self { id }
    }
}
