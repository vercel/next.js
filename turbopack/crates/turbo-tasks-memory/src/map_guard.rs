use std::ops::{Deref, DerefMut};

use parking_lot::{RwLockReadGuard, RwLockWriteGuard};

pub struct ReadGuard<'a, T: 'a, U: 'a, M: 'a + Fn(&T) -> Option<&U>> {
    inner: RwLockReadGuard<'a, T>,
    map: M,
}

impl<'a, T: 'a, U: 'a, M: 'a + Fn(&T) -> Option<&U>> ReadGuard<'a, T, U, M> {
    pub fn new(guard: RwLockReadGuard<'a, T>, map: M) -> Self {
        Self { inner: guard, map }
    }
}

impl<'a, T: 'a, U: 'a, M: 'a + Fn(&T) -> Option<&U>> Deref for ReadGuard<'a, T, U, M> {
    type Target = U;

    fn deref(&self) -> &Self::Target {
        (self.map)(&self.inner).unwrap()
    }
}

pub struct WriteGuard<
    'a,
    T: 'a,
    U: 'a,
    M: 'a + Fn(&T) -> Option<&U>,
    MM: 'a + Fn(&mut T) -> Option<&mut U>,
> {
    inner: RwLockWriteGuard<'a, T>,
    map: M,
    map_mut: MM,
}

impl<'a, T: 'a, U: 'a, M: 'a + Fn(&T) -> Option<&U>, MM: 'a + Fn(&mut T) -> Option<&mut U>>
    WriteGuard<'a, T, U, M, MM>
{
    pub fn new(guard: RwLockWriteGuard<'a, T>, map: M, map_mut: MM) -> Self {
        Self {
            inner: guard,
            map,
            map_mut,
        }
    }

    pub fn into_inner(self) -> RwLockWriteGuard<'a, T> {
        self.inner
    }
}

impl<'a, T: 'a, U: 'a, M: 'a + Fn(&T) -> Option<&U>, MM: 'a + Fn(&mut T) -> Option<&mut U>> Deref
    for WriteGuard<'a, T, U, M, MM>
{
    type Target = U;

    fn deref(&self) -> &Self::Target {
        (self.map)(&self.inner).unwrap()
    }
}

impl<'a, T: 'a, U: 'a, M: 'a + Fn(&T) -> Option<&U>, MM: 'a + Fn(&mut T) -> Option<&mut U>> DerefMut
    for WriteGuard<'a, T, U, M, MM>
{
    fn deref_mut(&mut self) -> &mut Self::Target {
        (self.map_mut)(&mut self.inner).unwrap()
    }
}
