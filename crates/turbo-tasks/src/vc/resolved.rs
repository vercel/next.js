use std::{
    hash::{Hash, Hasher},
    ops::Deref,
};

use crate::vc::Vc;

#[derive(Copy, Clone)]
pub struct ResolvedVc<T>
where
    T: ?Sized + Send,
{
    pub(crate) node: Vc<T>,
}

impl<T> Deref for ResolvedVc<T>
where
    T: ?Sized + Send,
{
    type Target = Vc<T>;

    fn deref(&self) -> &Self::Target {
        &self.node
    }
}

impl<T> Hash for ResolvedVc<T>
where
    T: ?Sized + Send,
{
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.node.hash(state);
    }
}
