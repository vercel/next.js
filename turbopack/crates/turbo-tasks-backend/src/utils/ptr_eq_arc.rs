use std::{
    hash::{Hash, Hasher},
    ops::Deref,
    sync::Arc,
};

pub struct PtrEqArc<T>(Arc<T>);

impl<T> PtrEqArc<T> {
    pub fn arc(&self) -> &Arc<T> {
        &self.0
    }
}

impl<T> From<Arc<T>> for PtrEqArc<T> {
    fn from(value: Arc<T>) -> Self {
        Self(value)
    }
}

impl<T> Deref for PtrEqArc<T> {
    type Target = Arc<T>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl<T> Clone for PtrEqArc<T> {
    fn clone(&self) -> Self {
        Self(self.0.clone())
    }
}

impl<T> PartialEq for PtrEqArc<T> {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.0, &other.0)
    }
}

impl<T> Eq for PtrEqArc<T> {}

impl<T> Hash for PtrEqArc<T> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        Arc::as_ptr(&self.0).hash(state)
    }
}
