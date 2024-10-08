pub trait KeyValuePair {
    type Key: PartialEq + Eq + std::hash::Hash;
    type Value;
    fn key(&self) -> Self::Key;
    fn value(&self) -> Self::Value;
    fn from_key_and_value(key: Self::Key, value: Self::Value) -> Self;
    fn into_key_and_value(self) -> (Self::Key, Self::Value);
}
