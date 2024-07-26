pub trait Keyed {
    type Key;
    type Value;
    fn key(&self) -> Self::Key;
    fn value(&self) -> Self::Value;
    fn from_key_and_value(key: Self::Key, value: Self::Value) -> Self;
}
