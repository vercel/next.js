use std::ops::{Index, IndexMut};

use smallvec::SmallVec;

pub trait VecLike<T>: Index<usize, Output = T> + IndexMut<usize, Output = T> {
    fn len(&self) -> usize;
    fn swap_remove(&mut self, index: usize);
}

impl<T> VecLike<T> for Vec<T> {
    fn len(&self) -> usize {
        Vec::len(self)
    }

    fn swap_remove(&mut self, index: usize) {
        Vec::swap_remove(self, index);
    }
}

impl<T, const N: usize> VecLike<T> for SmallVec<[T; N]> {
    fn len(&self) -> usize {
        SmallVec::len(self)
    }

    fn swap_remove(&mut self, index: usize) {
        SmallVec::swap_remove(self, index);
    }
}

pub fn swap_retain<T>(vec: &mut impl VecLike<T>, mut f: impl FnMut(&mut T) -> bool) {
    let mut i = 0;
    while i < vec.len() {
        if !f(&mut vec[i]) {
            vec.swap_remove(i);
        } else {
            i += 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use smallvec::{SmallVec, smallvec};

    use super::swap_retain;

    #[test]
    fn test_swap_retain() {
        let mut vec: SmallVec<[i32; 4]> = smallvec![1, 2, 3, 4, 5];
        swap_retain(&mut vec, |a| *a % 2 != 0);
        let expected: SmallVec<[i32; 4]> = smallvec![1, 5, 3];
        assert_eq!(vec, expected);
    }
}
