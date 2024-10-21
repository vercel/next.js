pub trait Indexed {
    type Index: Clone + PartialEq + Eq + std::hash::Hash;
    fn index(&self) -> Self::Index;
}
